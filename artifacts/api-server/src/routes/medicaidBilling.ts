import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  medicaidClaimsTable,
  cptCodeMappingsTable,
  sessionLogsTable,
  serviceTypesTable,
  staffTable,
  studentsTable,
  schoolsTable,
} from "@workspace/db";
import { eq, and, desc, asc, sql, inArray, isNull, gte, lte, count } from "drizzle-orm";
import { logAudit } from "../lib/auditLog";
import { getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";

const router: IRouter = Router();

const VALID_CLAIM_STATUSES = ["pending", "approved", "rejected", "exported", "void"] as const;

function getDistrictId(req: AuthedRequest): number | null {
  return getEnforcedDistrictId(req);
}

router.get("/medicaid/cpt-mappings", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  const mappings = await db
    .select({
      id: cptCodeMappingsTable.id,
      serviceTypeId: cptCodeMappingsTable.serviceTypeId,
      serviceTypeName: serviceTypesTable.name,
      serviceCategory: serviceTypesTable.category,
      cptCode: cptCodeMappingsTable.cptCode,
      modifier: cptCodeMappingsTable.modifier,
      description: cptCodeMappingsTable.description,
      minDurationMinutes: cptCodeMappingsTable.minDurationMinutes,
      maxDurationMinutes: cptCodeMappingsTable.maxDurationMinutes,
      unitDurationMinutes: cptCodeMappingsTable.unitDurationMinutes,
      ratePerUnit: cptCodeMappingsTable.ratePerUnit,
      placeOfService: cptCodeMappingsTable.placeOfService,
      isActive: cptCodeMappingsTable.isActive,
    })
    .from(cptCodeMappingsTable)
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, cptCodeMappingsTable.serviceTypeId))
    .orderBy(asc(serviceTypesTable.name), asc(cptCodeMappingsTable.cptCode));
  res.json(mappings);
});

router.post("/medicaid/cpt-mappings", async (req, res): Promise<void> => {
  const { serviceTypeId, cptCode, modifier, description, minDurationMinutes, maxDurationMinutes, unitDurationMinutes, ratePerUnit, placeOfService } = req.body;
  if (!serviceTypeId || !cptCode || !ratePerUnit) {
    res.status(400).json({ error: "serviceTypeId, cptCode, and ratePerUnit are required" });
    return;
  }
  const [mapping] = await db.insert(cptCodeMappingsTable).values({
    serviceTypeId: Number(serviceTypeId),
    cptCode,
    modifier: modifier || null,
    description: description || null,
    minDurationMinutes: minDurationMinutes ? Number(minDurationMinutes) : null,
    maxDurationMinutes: maxDurationMinutes ? Number(maxDurationMinutes) : null,
    unitDurationMinutes: unitDurationMinutes ? Number(unitDurationMinutes) : 15,
    ratePerUnit: String(ratePerUnit),
    placeOfService: placeOfService || "03",
  }).returning();
  logAudit(req, {
    action: "create",
    targetTable: "cpt_code_mappings",
    targetId: mapping.id,
    summary: `Created CPT mapping ${cptCode} for service type #${serviceTypeId}`,
    newValues: { cptCode, ratePerUnit, serviceTypeId } as Record<string, unknown>,
  });
  res.status(201).json(mapping);
});

router.put("/medicaid/cpt-mappings/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { cptCode, modifier, description, minDurationMinutes, maxDurationMinutes, unitDurationMinutes, ratePerUnit, placeOfService, isActive } = req.body;
  const updates: Record<string, any> = {};
  if (cptCode !== undefined) updates.cptCode = cptCode;
  if (modifier !== undefined) updates.modifier = modifier || null;
  if (description !== undefined) updates.description = description || null;
  if (minDurationMinutes !== undefined) updates.minDurationMinutes = minDurationMinutes ? Number(minDurationMinutes) : null;
  if (maxDurationMinutes !== undefined) updates.maxDurationMinutes = maxDurationMinutes ? Number(maxDurationMinutes) : null;
  if (unitDurationMinutes !== undefined) updates.unitDurationMinutes = Number(unitDurationMinutes);
  if (ratePerUnit !== undefined) updates.ratePerUnit = String(ratePerUnit);
  if (placeOfService !== undefined) updates.placeOfService = placeOfService;
  if (isActive !== undefined) updates.isActive = String(isActive);
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  const [updated] = await db.update(cptCodeMappingsTable).set(updates).where(eq(cptCodeMappingsTable.id, id)).returning();
  if (!updated) {
    res.status(404).json({ error: "Mapping not found" });
    return;
  }
  logAudit(req, {
    action: "update",
    targetTable: "cpt_code_mappings",
    targetId: id,
    summary: `Updated CPT mapping #${id}`,
    newValues: updates as Record<string, unknown>,
  });
  res.json(updated);
});

router.delete("/medicaid/cpt-mappings/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const [deleted] = await db.delete(cptCodeMappingsTable).where(eq(cptCodeMappingsTable.id, id)).returning();
  if (!deleted) {
    res.status(404).json({ error: "Mapping not found" });
    return;
  }
  logAudit(req, {
    action: "delete",
    targetTable: "cpt_code_mappings",
    targetId: id,
    summary: `Deleted CPT mapping #${id} (${deleted.cptCode})`,
  });
  res.json({ success: true });
});

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
    .where(eq(cptCodeMappingsTable.isActive, "true"));

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

  const updated = await db.update(medicaidClaimsTable)
    .set({
      status: "exported",
      exportBatchId: batchId,
      exportedAt: new Date(),
    })
    .where(and(
      eq(medicaidClaimsTable.districtId, districtId),
      eq(medicaidClaimsTable.status, "approved"),
    ))
    .returning();

  if (updated.length === 0) {
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
        diagnosisCode: c.diagnosisCode || "F84.0",
        serviceDescription: c.serviceTypeName,
      })),
    });
  } else {
    const header = "ClaimID,PatientMedicaidID,PatientLastName,PatientFirstName,PatientDOB,ProviderNPI,ProviderMedicaidID,ServiceDate,CPTCode,Modifier,PlaceOfService,Units,BilledAmount,DiagnosisCode,ServiceDescription";
    const rows = claims.map(c =>
      [
        c.id,
        c.studentMedicaidId || "",
        c.studentLast || "",
        c.studentFirst || "",
        c.studentDob || "",
        c.providerNpi || "",
        c.providerMedicaidId || "",
        c.serviceDate,
        c.cptCode,
        c.modifier || "",
        c.placeOfService,
        c.units,
        c.billedAmount,
        c.diagnosisCode || "F84.0",
        `"${(c.serviceTypeName || "").replace(/"/g, '""')}"`,
      ].join(",")
    );
    const csv = [header, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="medicaid-claims-${batchId}.csv"`);
    res.send(csv);
  }
});

router.get("/medicaid/revenue-summary", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo } = req.query as Record<string, string>;
  const conditions: any[] = [eq(medicaidClaimsTable.districtId, districtId)];
  if (dateFrom) conditions.push(gte(medicaidClaimsTable.serviceDate, dateFrom));
  if (dateTo) conditions.push(lte(medicaidClaimsTable.serviceDate, dateTo));

  const [summary] = await db
    .select({
      totalClaims: sql<number>`count(*)::int`,
      totalBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric), 0)::text`,
      pendingCount: sql<number>`count(*) filter (where ${medicaidClaimsTable.status} = 'pending')::int`,
      pendingAmount: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} = 'pending'), 0)::text`,
      approvedCount: sql<number>`count(*) filter (where ${medicaidClaimsTable.status} = 'approved')::int`,
      approvedAmount: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} = 'approved'), 0)::text`,
      exportedCount: sql<number>`count(*) filter (where ${medicaidClaimsTable.status} = 'exported')::int`,
      exportedAmount: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} = 'exported'), 0)::text`,
      rejectedCount: sql<number>`count(*) filter (where ${medicaidClaimsTable.status} = 'rejected')::int`,
      rejectedAmount: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} = 'rejected'), 0)::text`,
      voidCount: sql<number>`count(*) filter (where ${medicaidClaimsTable.status} = 'void')::int`,
    })
    .from(medicaidClaimsTable)
    .where(and(...conditions));

  const byService = await db
    .select({
      serviceTypeId: medicaidClaimsTable.serviceTypeId,
      serviceTypeName: serviceTypesTable.name,
      claimCount: sql<number>`count(*)::int`,
      totalBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric), 0)::text`,
      approvedAmount: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} IN ('approved', 'exported')), 0)::text`,
    })
    .from(medicaidClaimsTable)
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, medicaidClaimsTable.serviceTypeId))
    .where(and(...conditions))
    .groupBy(medicaidClaimsTable.serviceTypeId, serviceTypesTable.name)
    .orderBy(sql`sum(${medicaidClaimsTable.billedAmount}::numeric) desc`);

  const byMonth = await db
    .select({
      month: sql<string>`to_char(${medicaidClaimsTable.serviceDate}::date, 'YYYY-MM')`,
      claimCount: sql<number>`count(*)::int`,
      totalBilled: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric), 0)::text`,
      approvedAmount: sql<string>`coalesce(sum(${medicaidClaimsTable.billedAmount}::numeric) filter (where ${medicaidClaimsTable.status} IN ('approved', 'exported')), 0)::text`,
    })
    .from(medicaidClaimsTable)
    .where(and(...conditions))
    .groupBy(sql`to_char(${medicaidClaimsTable.serviceDate}::date, 'YYYY-MM')`)
    .orderBy(sql`to_char(${medicaidClaimsTable.serviceDate}::date, 'YYYY-MM')`);

  const missingDataCounts = await db
    .select({
      missingMedicaidId: sql<number>`count(distinct ${medicaidClaimsTable.studentId}) filter (where ${medicaidClaimsTable.studentMedicaidId} IS NULL or ${medicaidClaimsTable.studentMedicaidId} = '')::int`,
      missingNpi: sql<number>`count(distinct ${medicaidClaimsTable.staffId}) filter (where ${medicaidClaimsTable.providerNpi} IS NULL or ${medicaidClaimsTable.providerNpi} = '')::int`,
    })
    .from(medicaidClaimsTable)
    .where(and(
      eq(medicaidClaimsTable.districtId, districtId),
      sql`${medicaidClaimsTable.status} != 'void'`,
    ));

  res.json({
    summary: summary || {},
    byService,
    byMonth,
    dataQuality: missingDataCounts[0] || { missingMedicaidId: 0, missingNpi: 0 },
  });
});

router.get("/medicaid/billable-sessions-preview", async (req, res): Promise<void> => {
  const districtId = getDistrictId(req as AuthedRequest);
  if (!districtId) {
    res.status(403).json({ error: "District context required" });
    return;
  }

  const { dateFrom, dateTo } = req.query as Record<string, string>;
  if (!dateFrom || !dateTo) {
    res.status(400).json({ error: "dateFrom and dateTo are required" });
    return;
  }

  const [preview] = await db
    .select({
      totalSessions: sql<number>`count(*)::int`,
      totalMinutes: sql<number>`coalesce(sum(${sessionLogsTable.durationMinutes}), 0)::int`,
      withServiceType: sql<number>`count(*) filter (where ${sessionLogsTable.serviceTypeId} IS NOT NULL)::int`,
      withStaff: sql<number>`count(*) filter (where ${sessionLogsTable.staffId} IS NOT NULL)::int`,
    })
    .from(sessionLogsTable)
    .innerJoin(studentsTable, eq(studentsTable.id, sessionLogsTable.studentId))
    .innerJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .where(and(
      eq(schoolsTable.districtId, districtId),
      isNull(sessionLogsTable.deletedAt),
      gte(sessionLogsTable.sessionDate, dateFrom),
      lte(sessionLogsTable.sessionDate, dateTo),
      sql`${sessionLogsTable.status} IN ('completed', 'makeup')`,
    ));

  const existingClaimCount = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(medicaidClaimsTable)
    .where(and(
      eq(medicaidClaimsTable.districtId, districtId),
      gte(medicaidClaimsTable.serviceDate, dateFrom),
      lte(medicaidClaimsTable.serviceDate, dateTo),
      sql`${medicaidClaimsTable.status} != 'void'`,
    ));

  res.json({
    ...preview,
    existingClaims: existingClaimCount[0]?.cnt ?? 0,
  });
});

export default router;
