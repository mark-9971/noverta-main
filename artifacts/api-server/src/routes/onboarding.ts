import { Router, type IRouter } from "express";
import {
  db, districtsTable, schoolsTable, serviceTypesTable, staffTable,
  studentsTable, onboardingProgressTable, sisConnectionsTable,
} from "@workspace/db";
import { count, isNull, eq, and } from "drizzle-orm";
import { requireRoles } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import { encryptCredentials } from "../lib/sis/credentials";

const router: IRouter = Router();

async function getOrCreateDistrict(name: string): Promise<{ id: number; name: string }> {
  const existing = await db.select().from(districtsTable);
  if (existing.length > 0) {
    const [updated] = await db.update(districtsTable)
      .set({ name })
      .where(eq(districtsTable.id, existing[0].id))
      .returning();
    return updated;
  }
  const [inserted] = await db.insert(districtsTable).values({
    name,
    state: "MA",
  }).returning();
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

router.get("/onboarding/status", requireRoles("admin", "coordinator"), async (_req, res): Promise<void> => {
  try {
    const districts = await db.select().from(districtsTable).limit(1);
    const district = districts[0] || null;
    const districtId = district?.id;

    const schools = districtId
      ? await db.select({ id: schoolsTable.id, name: schoolsTable.name }).from(schoolsTable).where(eq(schoolsTable.districtId, districtId))
      : [];
    const schoolIds = schools.map(s => s.id);

    const [serviceTypeCount] = await db.select({ value: count() }).from(serviceTypesTable);
    const [staffCount] = await db.select({ value: count() }).from(staffTable).where(isNull(staffTable.deletedAt));

    let sisConnected = false;
    let districtConfirmed = false;

    if (districtId) {
      sisConnected = await getStepStatus(districtId, "sis_connected");
      districtConfirmed = await getStepStatus(districtId, "district_confirmed");
    }

    const steps = {
      sisConnected: sisConnected || (!!districtId && schools.length > 0),
      districtConfirmed,
      schoolsConfigured: schools.length > 0,
      serviceTypesConfigured: serviceTypeCount.value > 0,
      staffInvited: staffCount.value > 0,
    };

    const coreSteps = [steps.sisConnected, steps.schoolsConfigured, steps.serviceTypesConfigured];
    const checklistSteps = [steps.sisConnected, steps.districtConfirmed, steps.serviceTypesConfigured, steps.staffInvited];
    const completedCount = checklistSteps.filter(Boolean).length;
    const totalSteps = 4;
    const isComplete = coreSteps.every(Boolean);

    res.json({
      ...steps,
      completedCount,
      totalSteps,
      isComplete,
      counts: {
        districts: districtId ? 1 : 0,
        schools: schools.length,
        serviceTypes: serviceTypeCount.value,
        staff: staffCount.value,
      },
      district,
      schools,
    });
  } catch (err) {
    console.error("Onboarding status error:", err);
    res.status(500).json({ error: "Failed to fetch onboarding status" });
  }
});

router.post("/onboarding/sis-connect", requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  try {
    const { provider, districtName, schools, credentials } = req.body;

    if (!provider || !districtName) {
      res.status(400).json({ error: "Provider and district name are required" });
      return;
    }

    const district = await getOrCreateDistrict(districtName);

    const schoolNames: string[] = Array.isArray(schools) && schools.length > 0
      ? schools.filter((s: string) => s.trim())
      : ["Main Campus"];

    const existingSchools = await db.select().from(schoolsTable).where(eq(schoolsTable.districtId, district.id));
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
      message: `SIS provider "${provider}" connected. Roster sync will begin automatically.`,
    });
  } catch (err) {
    console.error("SIS connect error:", err);
    res.status(500).json({ error: "Failed to connect SIS" });
  }
});

router.post("/onboarding/sis-upload-csv", requireRoles("admin", "coordinator"), async (req, res): Promise<void> => {
  try {
    const { districtName, rows } = req.body;

    if (!districtName) {
      res.status(400).json({ error: "District name is required" });
      return;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      res.status(400).json({ error: "No roster data provided" });
      return;
    }

    const district = await getOrCreateDistrict(districtName);

    const schoolNamesFromCSV = [...new Set(rows.map((r: { school?: string }) => r.school || "Main Campus").filter(Boolean))] as string[];
    const existingSchools = await db.select().from(schoolsTable).where(eq(schoolsTable.districtId, district.id));
    const existingSchoolNames = new Set(existingSchools.map(s => s.name.toLowerCase()));

    const newSchoolNames = schoolNamesFromCSV.filter((n: string) => !existingSchoolNames.has(n.toLowerCase()));
    let allSchools = [...existingSchools];
    if (newSchoolNames.length > 0) {
      const inserted = await db.insert(schoolsTable).values(
        newSchoolNames.map((name: string) => ({
          name,
          districtId: district.id,
          district: districtName,
        }))
      ).returning();
      allSchools = [...allSchools, ...inserted];
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

    if (!districtName) {
      res.status(400).json({ error: "District name is required" });
      return;
    }

    const district = await getOrCreateDistrict(districtName);

    if (Array.isArray(schools)) {
      for (const s of schools) {
        if (s.id) {
          const existing = await db.select().from(schoolsTable)
            .where(eq(schoolsTable.id, s.id));
          if (existing.length > 0) {
            await db.update(schoolsTable)
              .set({ name: s.name })
              .where(eq(schoolsTable.id, s.id));
          }
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
      res.status(400).json({ error: "At least one service type is required" });
      return;
    }

    const existing = await db.select({ name: serviceTypesTable.name }).from(serviceTypesTable);
    const existingNames = new Set(existing.map(e => e.name.toLowerCase()));

    const newTypes = serviceTypes.filter(
      (st: { name: string }) => !existingNames.has(st.name.toLowerCase())
    );

    if (newTypes.length === 0) {
      const allTypes = await db.select().from(serviceTypesTable);
      const districts = await db.select().from(districtsTable).limit(1);
      if (districts[0]) await markStepComplete(districts[0].id, "service_types_configured");
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

    const districts = await db.select().from(districtsTable).limit(1);
    if (districts[0]) await markStepComplete(districts[0].id, "service_types_configured");

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

    if (newInvites.length === 0) {
      const districts = await db.select().from(districtsTable).limit(1);
      if (districts[0]) await markStepComplete(districts[0].id, "staff_invited");
      res.json({ staff: [], invitesSent: 0, skippedDuplicates: validInvites.length });
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

    const districts = await db.select().from(districtsTable).limit(1);
    if (districts[0]) await markStepComplete(districts[0].id, "staff_invited");

    res.json({ staff: inserted, invitesSent: inserted.length });
  } catch (err) {
    console.error("Staff invite error:", err);
    res.status(500).json({ error: "Failed to invite staff" });
  }
});

export default router;
