import { Router, type IRouter } from "express";
import {
  db, districtsTable, schoolsTable, serviceTypesTable, staffTable,
  studentsTable, onboardingProgressTable, sisConnectionsTable,
  districtSubscriptionsTable, serviceRequirementsTable, sessionLogsTable,
  schoolYearsTable, legalAcceptancesTable,
} from "@workspace/db";
import { count, isNull, eq, and, isNotNull, inArray } from "drizzle-orm";
import { requireRoles, getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import type { Response } from "express";
import { encryptCredentials } from "../lib/sis/credentials";
import { LEGAL_VERSIONS } from "../lib/legalVersions";

const router: IRouter = Router();

/**
 * Tenant-safe district resolver for onboarding endpoints.
 *
 * Previously this function selected the first row in `districts` and mutated
 * its name — which is a multi-tenant disaster (tenant A's district name would
 * silently overwrite tenant B's). Onboarding endpoints are auth-gated and
 * already carry a tenant scope on the request, so we either:
 *   - update the caller's existing district (keyed by `tenantDistrictId`), OR
 *   - create a fresh district + trial subscription for a brand-new admin who
 *     has no district yet (returns the new id; caller is responsible for
 *     attaching it to the staff row so future requests carry the claim).
 */
async function resolveOnboardingDistrict(
  req: AuthedRequest,
  name: string,
): Promise<{ id: number; name: string }> {
  const tenantId = getEnforcedDistrictId(req);
  if (tenantId != null) {
    const [updated] = await db.update(districtsTable)
      .set({ name })
      .where(eq(districtsTable.id, tenantId))
      .returning();
    if (updated) return updated;
    // Fall through to create if the claim points at a deleted district.
  }

  const [inserted] = await db.insert(districtsTable).values({
    name,
    state: "MA",
  }).returning();

  await db.insert(districtSubscriptionsTable).values({
    districtId: inserted.id,
    planTier: "trial",
    seatLimit: 10,
    billingCycle: "monthly",
    status: "trialing",
  }).onConflictDoNothing();

  return inserted;
}

async function getStepStatus(districtId: number, stepKey: string): Promise<boolean> {
  const [row] = await db.select().from(onboardingProgressTable)
    .where(and(
      eq(onboardingProgressTable.districtId, districtId),
      eq(onboardingProgressTable.stepKey, stepKey)
    ));
  return row?.completed ?? false;
}

async function markStepComplete(districtId: number, stepKey: string, metadata?: string): Promise<void> {
  const existing = await db.select().from(onboardingProgressTable)
    .where(and(
      eq(onboardingProgressTable.districtId, districtId),
      eq(onboardingProgressTable.stepKey, stepKey)
    ));
  if (existing.length > 0) {
    await db.update(onboardingProgressTable)
      .set({ completed: true, completedAt: new Date(), metadata: metadata || existing[0].metadata })
      .where(eq(onboardingProgressTable.id, existing[0].id));
  } else {
    await db.insert(onboardingProgressTable).values({
      districtId,
      stepKey,
      completed: true,
      completedAt: new Date(),
      metadata: metadata || null,
    });
  }
}

async function onboardingChecklistHandler(req: import("express").Request, res: Response): Promise<void> {
  try {
    // Tenant-scoped: only return onboarding state for the caller's district.
    // Falling back to "first row" historically leaked another tenant's
    // schools/staff/student counts to a brand-new admin who hadn't yet been
    // attached to a district.
    const tenantId = getEnforcedDistrictId(req as AuthedRequest);
    const district = tenantId != null
      ? (await db.select().from(districtsTable).where(eq(districtsTable.id, tenantId)).limit(1))[0] ?? null
      : null;
    const districtId = district?.id;

    const schools = districtId
      ? await db.select({ id: schoolsTable.id, name: schoolsTable.name }).from(schoolsTable).where(eq(schoolsTable.districtId, districtId))
      : [];
    const schoolIds = schools.map(s => s.id);

    const [serviceTypeCount] = await db.select({ value: count() }).from(serviceTypesTable);

    // District-scoped counts. Students and staff carry a `schoolId` that
    // resolves back to the district via `schools`. When the user has no
    // resolved district yet, every count is 0 so the checklist starts blank.
    const [staffCount] = schoolIds.length > 0
      ? await db.select({ value: count() }).from(staffTable)
          .where(and(isNull(staffTable.deletedAt), inArray(staffTable.schoolId, schoolIds)))
      : [{ value: 0 }];
    const [studentCount] = schoolIds.length > 0
      ? await db.select({ value: count() }).from(studentsTable)
          .where(and(isNull(studentsTable.deletedAt), inArray(studentsTable.schoolId, schoolIds)))
      : [{ value: 0 }];
    const districtStudentIdsRows = schoolIds.length > 0
      ? await db.select({ id: studentsTable.id }).from(studentsTable)
          .where(and(isNull(studentsTable.deletedAt), inArray(studentsTable.schoolId, schoolIds)))
      : [];
    const districtStudentIds = districtStudentIdsRows.map(r => r.id);
    const [serviceRequirementCount] = districtStudentIds.length > 0
      ? await db.select({ value: count() }).from(serviceRequirementsTable)
          .where(and(eq(serviceRequirementsTable.active, true), inArray(serviceRequirementsTable.studentId, districtStudentIds)))
      : [{ value: 0 }];
    const [requirementsWithProviderCount] = districtStudentIds.length > 0
      ? await db.select({ value: count() }).from(serviceRequirementsTable)
          .where(and(
            eq(serviceRequirementsTable.active, true),
            isNotNull(serviceRequirementsTable.providerId),
            inArray(serviceRequirementsTable.studentId, districtStudentIds),
          ))
      : [{ value: 0 }];
    const [sessionCount] = districtStudentIds.length > 0
      ? await db.select({ value: count() }).from(sessionLogsTable)
          .where(and(isNull(sessionLogsTable.deletedAt), inArray(sessionLogsTable.studentId, districtStudentIds)))
      : [{ value: 0 }];
    const schoolYearRows = districtId
      ? await db.select({ id: schoolYearsTable.id, label: schoolYearsTable.label, isActive: schoolYearsTable.isActive })
          .from(schoolYearsTable)
          .where(eq(schoolYearsTable.districtId, districtId))
      : [];

    let sisConnected = false;
    let districtConfirmed = false;
    let districtConfirmedMeta: { schoolYear?: string } | null = null;
    let dpaAccepted = false;
    let checklistDismissed = false;

    if (districtId) {
      sisConnected = await getStepStatus(districtId, "sis_connected");
      districtConfirmed = await getStepStatus(districtId, "district_confirmed");
      checklistDismissed = await getStepStatus(districtId, "checklist_dismissed");
      const [confirmedRow] = await db.select().from(onboardingProgressTable)
        .where(and(
          eq(onboardingProgressTable.districtId, districtId),
          eq(onboardingProgressTable.stepKey, "district_confirmed"),
        ));
      if (confirmedRow?.metadata) {
        try { districtConfirmedMeta = JSON.parse(confirmedRow.metadata); } catch { /* ignore */ }
      }
    }

    // DPA acceptance is per-user: check whether the requesting admin has
    // accepted the current version of the Data Processing Agreement.
    const authedReq = req as AuthedRequest;
    if (authedReq.userId) {
      const dpaVersion = LEGAL_VERSIONS["dpa"];
      const [dpaRow] = await db.select({ id: legalAcceptancesTable.id })
        .from(legalAcceptancesTable)
        .where(and(
          eq(legalAcceptancesTable.userId, authedReq.userId),
          eq(legalAcceptancesTable.documentType, "dpa"),
          eq(legalAcceptancesTable.documentVersion, dpaVersion),
        ))
        .limit(1);
      dpaAccepted = !!dpaRow;
    }

    const studentsImported = studentCount.value > 0;
    const serviceRequirementsImported = serviceRequirementCount.value > 0;
    // Step is "complete" only when every active requirement has a provider
    // assigned (matching the UI promise of "Assign a provider to *each*
    // requirement"). Requires at least one requirement to exist so we don't
    // mark this complete prematurely.
    const providersAssigned = serviceRequirementCount.value > 0
      && requirementsWithProviderCount.value === serviceRequirementCount.value;
    const firstSessionsLogged = sessionCount.value > 0;
    const schoolYearConfigured = schoolYearRows.length > 0 || !!districtConfirmedMeta?.schoolYear;
    // Derived: dashboard can compute meaningful numbers when all upstream
    // sources have at least one row.
    const complianceDashboardActive = studentsImported && serviceRequirementsImported && firstSessionsLogged;

    const steps = {
      sisConnected: sisConnected || (!!districtId && schools.length > 0),
      districtConfirmed,
      schoolsConfigured: schools.length > 0,
      serviceTypesConfigured: serviceTypeCount.value > 0,
      staffInvited: staffCount.value > 0,
      studentsImported,
      serviceRequirementsImported,
      providersAssigned,
      firstSessionsLogged,
      schoolYearConfigured,
      complianceDashboardActive,
    };

    // Legacy fields. `isComplete` is the 3-step "core" readiness signal
    // (SIS + schools + service types) and `completedCount`/`totalSteps`
    // describe the old 4-step checklist. Kept for backward compatibility
    // with any callers that still read them. New callers should prefer the
    // canonical 9-step `pilotChecklist` below.
    const coreSteps = [steps.sisConnected, steps.schoolsConfigured, steps.serviceTypesConfigured];
    const checklistSteps = [steps.sisConnected, steps.districtConfirmed, steps.serviceTypesConfigured, steps.staffInvited];
    const completedCount = checklistSteps.filter(Boolean).length;
    const totalSteps = 4;
    const isComplete = coreSteps.every(Boolean);

    // Pilot-readiness checklist (9 user-facing steps).
    const pilotChecklist = {
      districtProfileConfigured: districtConfirmed && steps.schoolsConfigured && steps.serviceTypesConfigured,
      schoolYearConfigured,
      staffImported: steps.staffInvited,
      studentsImported,
      serviceRequirementsImported,
      providersAssigned,
      firstSessionsLogged,
      complianceDashboardActive,
      dpaAccepted,
    };
    const pilotCompletedCount = Object.values(pilotChecklist).filter(Boolean).length;
    const pilotTotalSteps = Object.keys(pilotChecklist).length;
    const pilotIsComplete = pilotCompletedCount === pilotTotalSteps;

    res.json({
      ...steps,
      completedCount,
      totalSteps,
      isComplete,
      checklistDismissed,
      pilotChecklist: {
        ...pilotChecklist,
        completedCount: pilotCompletedCount,
        totalSteps: pilotTotalSteps,
        isComplete: pilotIsComplete,
      },
      counts: {
        districts: districtId ? 1 : 0,
        schools: schools.length,
        serviceTypes: serviceTypeCount.value,
        staff: staffCount.value,
        students: studentCount.value,
        serviceRequirements: serviceRequirementCount.value,
        requirementsWithProvider: requirementsWithProviderCount.value,
        sessions: sessionCount.value,
        schoolYears: schoolYearRows.length,
      },
      district,
      schools,
      schoolYears: schoolYearRows,
      activeSchoolYearLabel:
        schoolYearRows.find(y => y.isActive)?.label
          ?? schoolYearRows[0]?.label
          ?? districtConfirmedMeta?.schoolYear
          ?? null,
    });
  } catch (err) {
    console.error("Onboarding status error:", err);
    res.status(500).json({ error: "Failed to fetch onboarding status" });
  }
}

/**
 * GET /onboarding/status  — legacy path kept for backwards compat.
 * GET /onboarding/checklist — canonical task-spec path.
 * Both return identical payloads from the shared handler above.
 */
router.get("/onboarding/status", requireRoles("admin", "coordinator"), onboardingChecklistHandler);
router.get("/onboarding/checklist", requireRoles("admin", "coordinator"), onboardingChecklistHandler);

router.post("/onboarding/sis-connect", requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  try {
    const { provider, districtName, schools, credentials } = req.body;

    const trimmedDistrictName = typeof districtName === "string" ? districtName.trim() : "";
    if (!provider || !trimmedDistrictName) {
      res.status(400).json({ error: "Provider and district name are required." });
      return;
    }

    const district = await resolveOnboardingDistrict(req as AuthedRequest, trimmedDistrictName);

    // Require an explicit list of schools — no silent "Main Campus" fallback.
    // The wizard must ask the admin who their schools are; making one up causes
    // confusion and orphaned rows downstream.
    const schoolNames: string[] = Array.isArray(schools)
      ? schools.map((s: string) => (typeof s === "string" ? s.trim() : "")).filter(Boolean)
      : [];

    const existingSchools = await db.select().from(schoolsTable).where(eq(schoolsTable.districtId, district.id));
    if (existingSchools.length === 0 && schoolNames.length === 0) {
      res.status(400).json({ error: "Add at least one school for this district before connecting." });
      return;
    }
    let resultSchools;
    if (existingSchools.length > 0) {
      resultSchools = existingSchools;
    } else {
      resultSchools = await db.insert(schoolsTable).values(
        schoolNames.map((name: string) => ({
          name,
          districtId: district.id,
          district: districtName,
        }))
      ).returning();
    }

    const credentialMeta = credentials
      ? JSON.stringify({ provider, apiUrl: credentials.apiUrl || null, hasClientId: !!credentials.clientId, hasSecret: !!credentials.clientSecret })
      : JSON.stringify({ provider });

    await markStepComplete(district.id, "sis_connected", credentialMeta);

    const authed = req as AuthedRequest;
    await db.insert(sisConnectionsTable).values({
      provider,
      label: `${districtName} — ${provider}`,
      credentialsEncrypted: credentials ? encryptCredentials(credentials) : null,
      schoolId: resultSchools.length === 1 ? resultSchools[0].id : null,
      districtId: district.id,
      status: "connected",
      createdBy: authed.userId,
    });

    res.json({
      district,
      schools: resultSchools,
      provider,
      syncStatus: "connected",
      // Honest about what just happened: only CSV is automatically synced today.
      // Other providers are early pilots — the connection record is saved but a
      // first sync requires Trellis engineering to validate field mappings.
      message: provider === "csv"
        ? `CSV roster connection saved. Use the import wizard to upload your roster file.`
        : `${provider} connection details saved. This connector is in early pilot — Trellis support will reach out to schedule a verified first sync. In the meantime, you can upload a CSV roster to start using Trellis today.`,
    });
  } catch (err) {
    console.error("SIS connect error:", err);
    res.status(500).json({ error: "Failed to connect SIS" });
  }
});

router.post("/onboarding/sis-upload-csv", requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  try {
    const { districtName, rows } = req.body;

    const trimmedDistrictName = typeof districtName === "string" ? districtName.trim() : "";
    if (!trimmedDistrictName) {
      res.status(400).json({ error: "District name is required." });
      return;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "No roster data provided." });
      return;
    }

    const district = await resolveOnboardingDistrict(req as AuthedRequest, trimmedDistrictName);

    // School handling: we no longer auto-create a placeholder "Main Campus"
    // when the CSV is silent — that historically produced orphaned schools.
    // But for first-time tenants the CSV is the bootstrap path, so if the
    // CSV explicitly names schools we DO create those (only those). We refuse
    // only when the district has no schools AND the CSV provided none.
    const existingSchools = await db.select().from(schoolsTable).where(eq(schoolsTable.districtId, district.id));
    const existingSchoolNames = new Set(existingSchools.map(s => s.name.toLowerCase()));

    const csvSchoolNames = [...new Set(
      rows
        .map((r: { school?: string }) => (typeof r.school === "string" ? r.school.trim() : ""))
        .filter(Boolean) as string[],
    )];

    if (existingSchools.length === 0 && csvSchoolNames.length === 0) {
      res.status(400).json({
        error: "No schools defined. Either add schools in the wizard first, or include a 'school' column in your CSV.",
      });
      return;
    }

    const newSchoolNames = csvSchoolNames.filter(n => !existingSchoolNames.has(n.toLowerCase()));
    let allSchools = existingSchools;
    if (newSchoolNames.length > 0) {
      const inserted = await db.insert(schoolsTable).values(
        newSchoolNames.map(name => ({
          name,
          districtId: district.id,
          district: trimmedDistrictName,
        })),
      ).returning();
      allSchools = [...existingSchools, ...inserted];
    }

    const schoolMap = new Map(allSchools.map(s => [s.name.toLowerCase(), s.id]));

    let studentsImported = 0;
    let staffImported = 0;
    const studentRows = rows.filter((r: { type?: string }) => !r.type || r.type === "student");
    const staffRows = rows.filter((r: { type?: string }) => r.type === "staff");

    if (studentRows.length > 0) {
      const existingExtIds = new Set(
        (await db.select({ externalId: studentsTable.externalId }).from(studentsTable)
          .where(isNull(studentsTable.deletedAt)))
          .map(s => s.externalId?.toLowerCase())
          .filter(Boolean)
      );

      const newStudents = studentRows
        .filter((r: { student_id?: string; first_name?: string; last_name?: string }) =>
          r.first_name?.trim() && r.last_name?.trim() &&
          (!r.student_id || !existingExtIds.has(r.student_id.toLowerCase()))
        )
        .map((r: { student_id?: string; first_name: string; last_name: string; grade?: string; school?: string }) => ({
          firstName: r.first_name.trim(),
          lastName: r.last_name.trim(),
          externalId: r.student_id?.trim() || null,
          grade: r.grade?.trim() || null,
          schoolId: schoolMap.get((r.school || "Main Campus").toLowerCase()) || allSchools[0]?.id || null,
          status: "active" as const,
        }));

      if (newStudents.length > 0) {
        await db.insert(studentsTable).values(newStudents);
        studentsImported = newStudents.length;
      }
    }

    if (staffRows.length > 0) {
      const existingEmails = new Set(
        (await db.select({ email: staffTable.email }).from(staffTable)
          .where(isNull(staffTable.deletedAt)))
          .map(s => s.email?.toLowerCase())
          .filter(Boolean)
      );

      const newStaff = staffRows
        .filter((r: { email?: string; first_name?: string; last_name?: string }) =>
          r.first_name?.trim() && r.last_name?.trim() && r.email?.trim() &&
          !existingEmails.has(r.email.toLowerCase())
        )
        .map((r: { first_name: string; last_name: string; email: string; role?: string; school?: string }) => ({
          firstName: r.first_name.trim(),
          lastName: r.last_name.trim(),
          email: r.email.trim().toLowerCase(),
          role: r.role || "sped_teacher",
          schoolId: schoolMap.get((r.school || "Main Campus").toLowerCase()) || allSchools[0]?.id || null,
          status: "active" as const,
        }));

      if (newStaff.length > 0) {
        await db.insert(staffTable).values(newStaff);
        staffImported = newStaff.length;
      }
    }

    await markStepComplete(district.id, "sis_connected", JSON.stringify({
      provider: "csv",
      rowCount: rows.length,
      studentsImported,
      staffImported,
    }));

    const authed = req as AuthedRequest;
    await db.insert(sisConnectionsTable).values({
      provider: "csv",
      label: `${districtName} — CSV Import`,
      credentialsEncrypted: null,
      schoolId: allSchools.length === 1 ? allSchools[0].id : null,
      districtId: district.id,
      status: "connected",
      createdBy: authed.userId,
    });

    res.json({
      district,
      schools: allSchools,
      provider: "csv",
      syncStatus: "complete",
      importedRows: rows.length,
      studentsImported,
      staffImported,
    });
  } catch (err) {
    console.error("CSV upload error:", err);
    res.status(500).json({ error: "Failed to process CSV upload" });
  }
});

router.post("/onboarding/district-confirm", requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  try {
    const { districtName, schoolYear, schools } = req.body;

    const trimmedDistrictName = typeof districtName === "string" ? districtName.trim() : "";
    if (!trimmedDistrictName) {
      res.status(400).json({ error: "District name is required." });
      return;
    }

    if (Array.isArray(schools)) {
      for (const s of schools) {
        if (typeof s?.name === "string" && !s.name.trim()) {
          res.status(400).json({ error: "School names cannot be empty." });
          return;
        }
      }
    }

    const district = await resolveOnboardingDistrict(req as AuthedRequest, trimmedDistrictName);

    if (Array.isArray(schools)) {
      for (const s of schools) {
        if (s.id) {
          // Tenant-scope the school update: refuse to rename a school that
          // doesn't belong to the caller's district. Without this guard a
          // crafted `id` could rename another tenant's school.
          await db.update(schoolsTable)
            .set({ name: s.name })
            .where(and(
              eq(schoolsTable.id, s.id),
              eq(schoolsTable.districtId, district.id),
            ));
        }
      }
    }

    await markStepComplete(district.id, "district_confirmed", JSON.stringify({ schoolYear }));

    res.json({ district, schoolYear });
  } catch (err) {
    console.error("District confirm error:", err);
    res.status(500).json({ error: "Failed to save district info" });
  }
});

router.post("/onboarding/service-types", requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  try {
    const { serviceTypes } = req.body;

    if (!Array.isArray(serviceTypes) || serviceTypes.length === 0) {
      res.status(400).json({ error: "At least one service type is required." });
      return;
    }

    const cleaned = serviceTypes.map((st: { name?: string; category?: string; cptCode?: string; billingRate?: string }) => ({
      ...st,
      name: typeof st?.name === "string" ? st.name.trim() : "",
      category: typeof st?.category === "string" ? st.category.trim() : "",
    }));

    if (cleaned.some((st: { name: string }) => !st.name)) {
      res.status(400).json({ error: "Each service type needs a non-empty name." });
      return;
    }
    if (cleaned.some((st: { category: string }) => !st.category)) {
      res.status(400).json({ error: "Each service type needs a category." });
      return;
    }

    const existing = await db.select({ name: serviceTypesTable.name }).from(serviceTypesTable);
    const existingNames = new Set(existing.map(e => e.name.toLowerCase()));

    const newTypes = cleaned.filter(
      (st: { name: string }) => !existingNames.has(st.name.toLowerCase())
    );

    const tenantDistrictId = getEnforcedDistrictId(req as AuthedRequest);

    if (newTypes.length === 0) {
      const allTypes = await db.select().from(serviceTypesTable);
      if (tenantDistrictId != null) await markStepComplete(tenantDistrictId, "service_types_configured");
      res.json({ serviceTypes: allTypes, skippedDuplicates: serviceTypes.length });
      return;
    }

    const inserted = await db.insert(serviceTypesTable).values(
      newTypes.map((st: { name: string; category: string; cptCode?: string; billingRate?: string }) => ({
        name: st.name,
        category: st.category,
        cptCode: st.cptCode || null,
        defaultBillingRate: st.billingRate || null,
      }))
    ).returning();

    if (tenantDistrictId != null) await markStepComplete(tenantDistrictId, "service_types_configured");

    res.json({ serviceTypes: inserted });
  } catch (err) {
    console.error("Service types error:", err);
    res.status(500).json({ error: "Failed to save service types" });
  }
});

router.post("/onboarding/invite-staff", requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  try {
    const { invites } = req.body;

    if (!Array.isArray(invites) || invites.length === 0) {
      res.status(400).json({ error: "At least one staff invite is required" });
      return;
    }

    const validInvites = invites.filter(
      (inv: { email?: string; firstName?: string; lastName?: string }) =>
        inv.email?.trim() && inv.firstName?.trim() && inv.lastName?.trim()
    );

    if (validInvites.length === 0) {
      res.status(400).json({ error: "Each invite needs a first name, last name, and email" });
      return;
    }

    const existingEmails = await db.select({ email: staffTable.email }).from(staffTable)
      .where(isNull(staffTable.deletedAt));
    const emailSet = new Set(existingEmails.map(e => e.email?.toLowerCase()).filter(Boolean));

    const newInvites = validInvites.filter(
      (inv: { email: string }) => !emailSet.has(inv.email.toLowerCase())
    );

    const tenantDistrictId = getEnforcedDistrictId(req as AuthedRequest);

    if (newInvites.length === 0) {
      if (tenantDistrictId != null) await markStepComplete(tenantDistrictId, "staff_invited");
      res.json({ staff: [], staffCreated: 0, invitesSent: 0, skippedDuplicates: validInvites.length });
      return;
    }

    const inserted = await db.insert(staffTable).values(
      newInvites.map((inv: { email: string; firstName: string; lastName: string; role: string; schoolId?: number }) => ({
        firstName: inv.firstName.trim(),
        lastName: inv.lastName.trim(),
        email: inv.email.trim().toLowerCase(),
        role: inv.role || "sped_teacher",
        schoolId: inv.schoolId || null,
        status: "active" as const,
      }))
    ).returning();

    if (tenantDistrictId != null) await markStepComplete(tenantDistrictId, "staff_invited");

    // Note: this endpoint persists staff rows but does not currently send
    // invitation emails. The wizard UI labels the action accordingly.
    res.json({ staff: inserted, staffCreated: inserted.length, invitesSent: 0 });
  } catch (err) {
    console.error("Staff invite error:", err);
    res.status(500).json({ error: "Failed to invite staff" });
  }
});

router.post("/onboarding/dismiss-checklist", requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  try {
    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    if (districtId == null) {
      res.status(400).json({ error: "No district associated with this account." });
      return;
    }
    await markStepComplete(districtId, "checklist_dismissed");
    res.json({ checklistDismissed: true });
  } catch (err) {
    console.error("Dismiss checklist error:", err);
    res.status(500).json({ error: "Failed to dismiss checklist" });
  }
});

router.post("/onboarding/show-checklist", requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  try {
    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    if (districtId == null) {
      res.status(400).json({ error: "No district associated with this account." });
      return;
    }
    const existing = await db.select().from(onboardingProgressTable)
      .where(and(
        eq(onboardingProgressTable.districtId, districtId),
        eq(onboardingProgressTable.stepKey, "checklist_dismissed"),
      ));
    if (existing.length > 0) {
      await db.update(onboardingProgressTable)
        .set({ completed: false })
        .where(eq(onboardingProgressTable.id, existing[0].id));
    }
    res.json({ checklistDismissed: false });
  } catch (err) {
    console.error("Show checklist error:", err);
    res.status(500).json({ error: "Failed to show checklist" });
  }
});

export default router;
