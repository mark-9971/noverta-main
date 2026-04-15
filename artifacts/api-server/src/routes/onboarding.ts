import { Router, type IRouter } from "express";
import { db, districtsTable, schoolsTable, serviceTypesTable, staffTable } from "@workspace/db";
import { count, isNull, eq } from "drizzle-orm";
import { requireRoles } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/onboarding/status", requireRoles("admin", "coordinator"), async (_req, res): Promise<void> => {
  try {
    const [districtCount] = await db.select({ value: count() }).from(districtsTable);
    const [schoolCount] = await db.select({ value: count() }).from(schoolsTable);
    const [serviceTypeCount] = await db.select({ value: count() }).from(serviceTypesTable);
    const [staffCount] = await db.select({ value: count() }).from(staffTable).where(isNull(staffTable.deletedAt));

    const districts = await db.select({ id: districtsTable.id, name: districtsTable.name }).from(districtsTable).limit(1);
    const schools = await db.select({ id: schoolsTable.id, name: schoolsTable.name }).from(schoolsTable);

    const steps = {
      sisConnected: districtCount.value > 0 && schoolCount.value > 0,
      districtConfirmed: districtCount.value > 0,
      schoolsConfigured: schoolCount.value > 0,
      serviceTypesConfigured: serviceTypeCount.value > 0,
      staffInvited: staffCount.value > 0,
    };

    const coreComplete = steps.sisConnected && steps.schoolsConfigured && steps.serviceTypesConfigured;
    const completedCount = [steps.sisConnected, steps.schoolsConfigured, steps.serviceTypesConfigured, steps.staffInvited]
      .filter(Boolean).length;
    const totalSteps = 4;
    const isComplete = coreComplete;

    res.json({
      ...steps,
      completedCount,
      totalSteps,
      isComplete,
      counts: {
        districts: districtCount.value,
        schools: schoolCount.value,
        serviceTypes: serviceTypeCount.value,
        staff: staffCount.value,
      },
      district: districts[0] || null,
      schools,
    });
  } catch (err) {
    console.error("Onboarding status error:", err);
    res.status(500).json({ error: "Failed to fetch onboarding status" });
  }
});

router.post("/onboarding/sis-connect", requireRoles("admin"), async (req, res): Promise<void> => {
  try {
    const { provider, districtName, schools } = req.body;

    if (!provider || !districtName) {
      res.status(400).json({ error: "Provider and district name are required" });
      return;
    }

    const existingDistricts = await db.select().from(districtsTable);
    let district;

    if (existingDistricts.length > 0) {
      const [updated] = await db.update(districtsTable)
        .set({ name: districtName })
        .where(eq(districtsTable.id, existingDistricts[0].id))
        .returning();
      district = updated;
    } else {
      const [inserted] = await db.insert(districtsTable).values({
        name: districtName,
        state: "MA",
      }).returning();
      district = inserted;
    }

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

    res.json({
      district,
      schools: resultSchools,
      provider,
      syncStatus: "complete",
    });
  } catch (err) {
    console.error("SIS connect error:", err);
    res.status(500).json({ error: "Failed to connect SIS" });
  }
});

router.post("/onboarding/district-confirm", requireRoles("admin"), async (req, res): Promise<void> => {
  try {
    const { districtName, schoolYear, schools } = req.body;

    if (!districtName) {
      res.status(400).json({ error: "District name is required" });
      return;
    }

    const existingDistricts = await db.select().from(districtsTable);
    let district;

    if (existingDistricts.length > 0) {
      const [updated] = await db.update(districtsTable)
        .set({ name: districtName })
        .where(eq(districtsTable.id, existingDistricts[0].id))
        .returning();
      district = updated;
    } else {
      const [inserted] = await db.insert(districtsTable).values({
        name: districtName,
        state: "MA",
      }).returning();
      district = inserted;
    }

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

    res.json({ district, schoolYear });
  } catch (err) {
    console.error("District confirm error:", err);
    res.status(500).json({ error: "Failed to save district info" });
  }
});

router.post("/onboarding/service-types", requireRoles("admin"), async (req, res): Promise<void> => {
  try {
    const { serviceTypes } = req.body;

    if (!Array.isArray(serviceTypes) || serviceTypes.length === 0) {
      res.status(400).json({ error: "At least one service type is required" });
      return;
    }

    const existing = await db.select({ name: serviceTypesTable.name }).from(serviceTypesTable);
    const existingNames = new Set(existing.map(e => e.name.toLowerCase()));

    const newTypes = serviceTypes.filter(
      (st: { name: string; category: string }) => !existingNames.has(st.name.toLowerCase())
    );

    if (newTypes.length === 0) {
      const allTypes = await db.select().from(serviceTypesTable);
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

    res.json({ serviceTypes: inserted });
  } catch (err) {
    console.error("Service types error:", err);
    res.status(500).json({ error: "Failed to save service types" });
  }
});

router.post("/onboarding/invite-staff", requireRoles("admin"), async (req, res): Promise<void> => {
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

    res.json({ staff: inserted, invitesSent: inserted.length });
  } catch (err) {
    console.error("Staff invite error:", err);
    res.status(500).json({ error: "Failed to invite staff" });
  }
});

export default router;
