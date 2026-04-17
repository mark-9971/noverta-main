import { Router, type IRouter } from "express";
import { db, medicaidClaimsTable, cptCodeMappingsTable, sessionLogsTable, serviceTypesTable, staffTable, studentsTable, schoolsTable } from "@workspace/db";
import { eq, and, desc, asc, sql, inArray, isNull, gte, lte } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import type { AuthedRequest } from "../../middlewares/auth";
import { getDistrictId } from "./shared";

// tenant-scope: district-join
const router: IRouter = Router();

router.post("/medicaid/generate-claims", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }
  const { dateFrom, dateTo } = req.body;
  if (!dateFrom || !dateTo) {
    res.status(400).json({ error: "dateFrom and dateTo are required" });
    return;
  }

  const activeMappings = await db.select().from(cptCodeMappingsTable)
    .where(and(eq(cptCodeMappingsTable.isActive, "true"), eq(cptCodeMappingsTable.districtId, districtId)));

  if (activeMappings.length === 0) {
    res.status(400).json({ error: "No active CPT code mappings configured. Set up CPT mappings first." });
    return;
  }

  const mappingsByServiceType = new Map<number, typeof activeMappings>();
  for (const m of activeMappings) {
    const arr = mappingsByServiceType.get(m.serviceTypeId) || [];
    arr.push(m);
    mappingsByServiceType.set(m.serviceTypeId, arr);
  }

  const eligibleSessions = await db
    .select({
      id: sessionLogsTable.id,
      studentId: sessionLogsTable.studentId,
      staffId: sessionLogsTable.staffId,
      serviceTypeId: sessionLogsTable.serviceTypeId,
      sessionDate: sessionLogsTable.sessionDate,
      durationMinutes: sessionLogsTable.durationMinutes,
      status: sessionLogsTable.status,
      studentMedicaidId: studentsTable.medicaidId,
      studentDisabilityCategory: studentsTable.disabilityCategory,
      providerNpi: staffTable.npiNumber,
      providerMedicaidId: staffTable.medicaidProviderId,
    })
    .from(sessionLogsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, sessionLogsTable.studentId))
    .innerJoin(staffTable, eq(staffTable.id, sessionLogsTable.staffId))
    .innerJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .where(and(
      eq(schoolsTable.districtId, districtId),
      isNull(sessionLogsTable.deletedAt),
      gte(sessionLogsTable.sessionDate, dateFrom),
      lte(sessionLogsTable.sessionDate, dateTo),
      sql`${sessionLogsTable.status} IN ('completed', 'makeup')`,
      sql`${sessionLogsTable.serviceTypeId} IS NOT NULL`,
      sql`${sessionLogsTable.staffId} IS NOT NULL`,
    ));

  const existingClaimSessionIds = new Set(
    (await db.select({ sessionLogId: medicaidClaimsTable.sessionLogId })
      .from(medicaidClaimsTable)
      .where(and(
        eq(medicaidClaimsTable.districtId, districtId),
        sql`${medicaidClaimsTable.status} != 'void'`,
      ))
    ).map(r => r.sessionLogId)
  );

  const newClaims: any[] = [];
  const skipped: { sessionId: number; reason: string }[] = [];

  for (const session of eligibleSessions) {
    if (existingClaimSessionIds.has(session.id)) {
      skipped.push({ sessionId: session.id, reason: "claim_already_exists" });
      continue;
    }
    if (!session.serviceTypeId) {
      skipped.push({ sessionId: session.id, reason: "no_service_type" });
      continue;
    }

    const mappings = mappingsByServiceType.get(session.serviceTypeId);
    if (!mappings || mappings.length === 0) {
      skipped.push({ sessionId: session.id, reason: "no_cpt_mapping" });
      continue;
    }

    // HARD STOP: every Medicaid claim must carry an actual diagnosis from the
    // student record. We previously substituted "F84.0" (Autistic disorder) as
    // a fallback, which is fraudulent billing. If the student has no
    // diagnosis on file, refuse to create the claim and surface a clear
    // actionable reason to the admin.
    const studentDiagnosis = (session.studentDisabilityCategory ?? "").trim();
    if (!studentDiagnosis) {
      skipped.push({ sessionId: session.id, reason: "no_diagnosis_on_student" });
      continue;
    }

    const duration = session.durationMinutes || 0;
    const mapping = mappings.find(m => {
      if (m.minDurationMinutes && duration < m.minDurationMinutes) return false;
      if (m.maxDurationMinutes && duration > m.maxDurationMinutes) return false;
      return true;
    }) || mappings[0];

    const unitMinutes = mapping.unitDurationMinutes || 15;
    const units = Math.max(1, Math.ceil(duration / unitMinutes));
    const billedAmount = (units * parseFloat(mapping.ratePerUnit)).toFixed(2);

    newClaims.push({
      sessionLogId: session.id,
      studentId: session.studentId,
      staffId: session.staffId,
      serviceTypeId: session.serviceTypeId,
      cptCodeMappingId: mapping.id,
      cptCode: mapping.cptCode,
      modifier: mapping.modifier,
      placeOfService: mapping.placeOfService,
      serviceDate: session.sessionDate,
      units,
      unitDurationMinutes: unitMinutes,
      durationMinutes: duration,
      billedAmount,
      studentMedicaidId: session.studentMedicaidId,
      providerNpi: session.providerNpi,
      providerMedicaidId: session.providerMedicaidId,
      diagnosisCode: studentDiagnosis,
      status: "pending",
      districtId,
    });
  }

  let insertedCount = 0;
  if (newClaims.length > 0) {
    const batchSize = 100;
    for (let i = 0; i < newClaims.length; i += batchSize) {
      const batch = newClaims.slice(i, i + batchSize);
      await db.insert(medicaidClaimsTable).values(batch);
      insertedCount += batch.length;
    }
  }

  logAudit(req, {
    action: "create",
    targetTable: "medicaid_claims",
    targetId: 0,
    summary: `Generated ${insertedCount} Medicaid claims for ${dateFrom} to ${dateTo}`,
    newValues: { dateFrom, dateTo, generated: insertedCount, skipped: skipped.length } as Record<string, unknown>,
  });

  res.json({
    generated: insertedCount,
    skipped: skipped.length,
    skippedDetails: skipped.slice(0, 50),
    totalEligibleSessions: eligibleSessions.length,
  });
});

router.get("/medicaid/claims", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { status, dateFrom, dateTo, serviceTypeId, limit: limitStr, offset: offsetStr } = req.query as Record<string, string>;
  const conditions: any[] = [eq(medicaidClaimsTable.districtId, districtId)];
  if (status) conditions.push(eq(medicaidClaimsTable.status, status));
  if (dateFrom) conditions.push(gte(medicaidClaimsTable.serviceDate, dateFrom));
  if (dateTo) conditions.push(lte(medicaidClaimsTable.serviceDate, dateTo));
  if (serviceTypeId) conditions.push(eq(medicaidClaimsTable.serviceTypeId, Number(serviceTypeId)));

  const limit = Math.min(Number(limitStr) || 100, 500);
  const offset = Number(offsetStr) || 0;

  const claims = await db
    .select({
      id: medicaidClaimsTable.id,
      sessionLogId: medicaidClaimsTable.sessionLogId,
      studentId: medicaidClaimsTable.studentId,
      staffId: medicaidClaimsTable.staffId,
      serviceTypeId: medicaidClaimsTable.serviceTypeId,
      cptCode: medicaidClaimsTable.cptCode,
      modifier: medicaidClaimsTable.modifier,
      placeOfService: medicaidClaimsTable.placeOfService,
      serviceDate: medicaidClaimsTable.serviceDate,
      units: medicaidClaimsTable.units,
      durationMinutes: medicaidClaimsTable.durationMinutes,
      billedAmount: medicaidClaimsTable.billedAmount,
      studentMedicaidId: medicaidClaimsTable.studentMedicaidId,
      providerNpi: medicaidClaimsTable.providerNpi,
      status: medicaidClaimsTable.status,
      rejectionReason: medicaidClaimsTable.rejectionReason,
      exportBatchId: medicaidClaimsTable.exportBatchId,
      exportedAt: medicaidClaimsTable.exportedAt,
      createdAt: medicaidClaimsTable.createdAt,
      studentFirst: studentsTable.firstName,
      studentLast: studentsTable.lastName,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
      serviceTypeName: serviceTypesTable.name,
    })
    .from(medicaidClaimsTable)
    .leftJoin(studentsTable, eq(studentsTable.id, medicaidClaimsTable.studentId))
    .leftJoin(staffTable, eq(staffTable.id, medicaidClaimsTable.staffId))
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, medicaidClaimsTable.serviceTypeId))
    .where(and(...conditions))
    .orderBy(desc(medicaidClaimsTable.serviceDate), desc(medicaidClaimsTable.id))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(medicaidClaimsTable)
    .where(and(...conditions));

  res.json({
    claims: claims.map(c => ({
      ...c,
      studentName: c.studentFirst ? `${c.studentFirst} ${c.studentLast}` : null,
      staffName: c.staffFirst ? `${c.staffFirst} ${c.staffLast}` : null,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
      exportedAt: c.exportedAt instanceof Date ? c.exportedAt.toISOString() : c.exportedAt,
    })),
    total: countResult?.total ?? 0,
  });
});

router.patch("/medicaid/claims/:id", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }
  const claimId = Number(req.params.id);
  if (!Number.isFinite(claimId)) {
    res.status(400).json({ error: "Invalid claim ID" });
    return;
  }

  const { cptCode, modifier, units, billedAmount, placeOfService, diagnosisCode, rejectionReason } = req.body;
  const updates: Record<string, any> = {};
  if (cptCode !== undefined) {
    if (typeof cptCode !== "string" || !/^\d{4,5}$/.test(cptCode)) {
      res.status(400).json({ error: "CPT code must be a 4-5 digit string" });
      return;
    }
    updates.cptCode = cptCode;
  }
  if (modifier !== undefined) updates.modifier = (typeof modifier === "string" && modifier.trim()) ? modifier.trim().slice(0, 10) : null;
  if (units !== undefined) {
    const parsedUnits = Number(units);
    if (!Number.isFinite(parsedUnits) || parsedUnits < 1 || parsedUnits > 999) {
      res.status(400).json({ error: "Units must be a number between 1 and 999" });
      return;
    }
    updates.units = parsedUnits;
  }
  if (billedAmount !== undefined) {
    const parsedAmount = parseFloat(billedAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0 || parsedAmount > 99999.99) {
      res.status(400).json({ error: "Billed amount must be a number between 0 and 99999.99" });
      return;
    }
    updates.billedAmount = parsedAmount.toFixed(2);
  }
  if (placeOfService !== undefined) {
    if (typeof placeOfService !== "string" || !/^\d{2}$/.test(placeOfService)) {
      res.status(400).json({ error: "Place of service must be a 2-digit code" });
      return;
    }
    updates.placeOfService = placeOfService;
  }
  if (diagnosisCode !== undefined) updates.diagnosisCode = (typeof diagnosisCode === "string" && diagnosisCode.trim()) ? diagnosisCode.trim().slice(0, 20) : null;
  if (rejectionReason !== undefined) updates.rejectionReason = (typeof rejectionReason === "string" && rejectionReason.trim()) ? rejectionReason.trim().slice(0, 500) : null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db.update(medicaidClaimsTable)
    .set(updates)
    .where(and(
      eq(medicaidClaimsTable.id, claimId),
      eq(medicaidClaimsTable.districtId, districtId),
      inArray(medicaidClaimsTable.status, ["pending", "rejected"]),
    ))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Claim not found or not editable (only pending/rejected claims can be edited)" });
    return;
  }

  logAudit(req, {
    action: "update",
    targetTable: "medicaid_claims",
    targetId: claimId,
    summary: `Edited claim #${claimId}`,
    newValues: updates as Record<string, unknown>,
  });

  res.json(updated);
});

router.post("/medicaid/claims/batch-action", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { claimIds, action, rejectionReason } = req.body;
  if (!claimIds || !Array.isArray(claimIds) || claimIds.length === 0) {
    res.status(400).json({ error: "claimIds array is required" });
    return;
  }
  if (!action || !["approve", "reject", "void"].includes(action)) {
    res.status(400).json({ error: "action must be 'approve', 'reject', or 'void'" });
    return;
  }
  if (action === "reject" && !rejectionReason) {
    res.status(400).json({ error: "rejectionReason is required when rejecting claims" });
    return;
  }

  const staffId = (req as AuthedRequest).auth?.staffId;
  const newStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "void";
  const updates: Record<string, any> = {
    status: newStatus,
    reviewedBy: staffId || null,
    reviewedAt: new Date(),
  };
  if (action === "reject") updates.rejectionReason = rejectionReason;

  const sourceStatuses = action === "void" ? ["pending", "approved", "rejected"] : ["pending"];
  const updated = await db.update(medicaidClaimsTable)
    .set(updates)
    .where(and(
      inArray(medicaidClaimsTable.id, claimIds.map(Number)),
      eq(medicaidClaimsTable.districtId, districtId),
      inArray(medicaidClaimsTable.status, sourceStatuses),
    ))
    .returning({ id: medicaidClaimsTable.id });

  logAudit(req, {
    action: "update",
    targetTable: "medicaid_claims",
    targetId: 0,
    summary: `Batch ${action}: ${updated.length} claims`,
    newValues: { action, claimIds: updated.map(u => u.id), rejectionReason } as Record<string, unknown>,
  });

  res.json({ updated: updated.length, action });
});

router.post("/medicaid/claims/export", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { format } = req.body;
  const exportFormat = format === "json" ? "json" : "csv";

  const batchId = `BATCH-${districtId}-${Date.now()}`;

  // SAFETY GATE: before promoting any claim to "exported", quarantine every
  // approved claim missing a diagnosis code. We must NEVER substitute a
  // default diagnosis (previously F84.0) into the outbound 837/CSV — that is
  // false billing. Quarantined claims are flipped back to "rejected" with a
  // clear, actionable rejectionReason so the admin can fix the student
  // record and re-approve.
  const undiagnosed = await db.update(medicaidClaimsTable)
    .set({
      status: "rejected",
      rejectionReason:
        "Missing diagnosis code on student record. Set the student's diagnosis " +
        "(disability category / ICD-10) before re-approving this claim. " +
        "Claim was excluded from export to prevent submitting an unsubstantiated diagnosis.",
    })
    .where(and(
      eq(medicaidClaimsTable.districtId, districtId),
      eq(medicaidClaimsTable.status, "approved"),
      sql`(${medicaidClaimsTable.diagnosisCode} IS NULL OR btrim(${medicaidClaimsTable.diagnosisCode}) = '')`,
    ))
    .returning({
      id: medicaidClaimsTable.id,
      studentId: medicaidClaimsTable.studentId,
      serviceDate: medicaidClaimsTable.serviceDate,
    });

  const updated = await db.update(medicaidClaimsTable)
    .set({
      status: "exported",
      exportBatchId: batchId,
      exportedAt: new Date(),
    })
    .where(and(
      eq(medicaidClaimsTable.districtId, districtId),
      eq(medicaidClaimsTable.status, "approved"),
      sql`${medicaidClaimsTable.diagnosisCode} IS NOT NULL`,
      sql`btrim(${medicaidClaimsTable.diagnosisCode}) <> ''`,
    ))
    .returning();

  if (updated.length === 0) {
    if (undiagnosed.length > 0) {
      logAudit(req, {
        action: "update",
        targetTable: "medicaid_claims",
        targetId: 0,
        summary: `Export blocked: ${undiagnosed.length} approved claim(s) had no diagnosis code and were quarantined`,
        newValues: { excludedClaimIds: undiagnosed.map(u => u.id) } as Record<string, unknown>,
      });
      res.status(409).json({
        error:
          `Export blocked. ${undiagnosed.length} approved claim(s) are missing a diagnosis code ` +
          `on the student record. They have been moved back to 'rejected' with an explanation. ` +
          `Add the diagnosis to each affected student, re-approve, then retry export.`,
        excludedClaimCount: undiagnosed.length,
        excludedClaims: undiagnosed,
      });
      return;
    }
    res.status(400).json({ error: "No approved claims available for export" });
    return;
  }

  const claims = await db
    .select({
      id: medicaidClaimsTable.id,
      studentMedicaidId: medicaidClaimsTable.studentMedicaidId,
      providerNpi: medicaidClaimsTable.providerNpi,
      providerMedicaidId: medicaidClaimsTable.providerMedicaidId,
      cptCode: medicaidClaimsTable.cptCode,
      modifier: medicaidClaimsTable.modifier,
      placeOfService: medicaidClaimsTable.placeOfService,
      serviceDate: medicaidClaimsTable.serviceDate,
      units: medicaidClaimsTable.units,
      billedAmount: medicaidClaimsTable.billedAmount,
      diagnosisCode: medicaidClaimsTable.diagnosisCode,
      durationMinutes: medicaidClaimsTable.durationMinutes,
      studentFirst: studentsTable.firstName,
      studentLast: studentsTable.lastName,
      studentDob: studentsTable.dateOfBirth,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
      serviceTypeName: serviceTypesTable.name,
    })
    .from(medicaidClaimsTable)
    .leftJoin(studentsTable, eq(studentsTable.id, medicaidClaimsTable.studentId))
    .leftJoin(staffTable, eq(staffTable.id, medicaidClaimsTable.staffId))
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, medicaidClaimsTable.serviceTypeId))
    .where(eq(medicaidClaimsTable.exportBatchId, batchId))
    .orderBy(asc(medicaidClaimsTable.serviceDate));

  logAudit(req, {
    action: "create",
    targetTable: "medicaid_claims",
    targetId: 0,
    summary: `Exported ${claims.length} claims as ${exportFormat} (batch: ${batchId})`,
    newValues: { batchId, format: exportFormat, count: claims.length } as Record<string, unknown>,
  });

  if (exportFormat === "json") {
    res.json({
      batchId,
      exportedAt: new Date().toISOString(),
      claimCount: claims.length,
      totalBilledAmount: claims.reduce((sum, c) => sum + parseFloat(c.billedAmount), 0).toFixed(2),
      claims: claims.map(c => ({
        claimId: c.id,
        patientMedicaidId: c.studentMedicaidId,
        patientFirstName: c.studentFirst,
        patientLastName: c.studentLast,
        patientDob: c.studentDob,
        renderingProviderNpi: c.providerNpi,
        renderingProviderMedicaidId: c.providerMedicaidId,
        renderingProviderName: c.staffFirst ? `${c.staffLast}, ${c.staffFirst}` : null,
        serviceDate: c.serviceDate,
        cptCode: c.cptCode,
        modifier: c.modifier,
        placeOfService: c.placeOfService,
        units: c.units,
        billedAmount: c.billedAmount,
        diagnosisCode: c.diagnosisCode,
        serviceDescription: c.serviceTypeName,
      })),
      excludedClaimCount: undiagnosed.length,
      excludedClaims: undiagnosed,
    });
  } else {
    const csvEscape = (val: unknown): string => {
      const s = String(val ?? "");
      if (/^[=+\-@\t\r]/.test(s)) {
        return `"'${s.replace(/"/g, '""')}"`;
      }
      if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };
    const header = "ClaimID,PatientMedicaidID,PatientLastName,PatientFirstName,PatientDOB,ProviderNPI,ProviderMedicaidID,ServiceDate,CPTCode,Modifier,PlaceOfService,Units,BilledAmount,DiagnosisCode,ServiceDescription";
    const rows = claims.map(c =>
      [
        c.id,
        csvEscape(c.studentMedicaidId),
        csvEscape(c.studentLast),
        csvEscape(c.studentFirst),
        csvEscape(c.studentDob),
        csvEscape(c.providerNpi),
        csvEscape(c.providerMedicaidId),
        csvEscape(c.serviceDate),
        csvEscape(c.cptCode),
        csvEscape(c.modifier),
        csvEscape(c.placeOfService),
        c.units,
        c.billedAmount,
        csvEscape(c.diagnosisCode),
        csvEscape(c.serviceTypeName),
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="medicaid-claims-${batchId}.csv"`);
    res.send(csv);
  }
});

export default router;
