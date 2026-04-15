import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  schoolYearsTable,
  studentsTable,
  schoolsTable,
  staffAssignmentsTable,
  iepDocumentsTable,
} from "@workspace/db";
import { eq, and, isNull, count, sql, lte, inArray } from "drizzle-orm";
import { requireRoles } from "../middlewares/auth";
import { getPublicMeta } from "../lib/clerkClaims";
import { logAudit } from "../lib/auditLog";

const router: IRouter = Router();
const requireAdmin = requireRoles("admin");

router.get("/admin/rollover/preview", requireAdmin, async (req, res): Promise<void> => {
  const meta = getPublicMeta(req);
  const districtId = meta.districtId;
  if (!districtId) {
    res.status(400).json({ error: "No district associated with this account" });
    return;
  }

  try {
    const [activeYear] = await db
      .select()
      .from(schoolYearsTable)
      .where(and(eq(schoolYearsTable.districtId, districtId), eq(schoolYearsTable.isActive, true)));

    const today = new Date().toISOString().split("T")[0];

    // Get schools in this district
    const districtSchools = await db
      .select({ id: schoolsTable.id })
      .from(schoolsTable)
      .where(eq(schoolsTable.districtId, districtId));
    const schoolIds = districtSchools.map(s => s.id);

    const [[activeStudents], [activeAssignments], [expiredIeps], [allIeps]] = await Promise.all([
      schoolIds.length > 0
        ? db.select({ count: count() }).from(studentsTable)
            .where(and(inArray(studentsTable.schoolId, schoolIds), eq(studentsTable.status, "active"), isNull(studentsTable.deletedAt)))
        : [{ count: 0 }],
      db.select({ count: count() }).from(staffAssignmentsTable)
        .where(isNull(staffAssignmentsTable.endDate)),
      db.select({ count: count() }).from(iepDocumentsTable)
        .where(and(
          eq(iepDocumentsTable.active, true),
          lte(iepDocumentsTable.iepEndDate, today),
        )),
      db.select({ count: count() }).from(iepDocumentsTable)
        .where(eq(iepDocumentsTable.active, true)),
    ]);

    const yearRows = await db
      .select()
      .from(schoolYearsTable)
      .where(eq(schoolYearsTable.districtId, districtId))
      .orderBy(schoolYearsTable.startDate);

    res.json({
      currentYear: activeYear ?? null,
      activeStudents: activeStudents.count,
      activeStaffAssignments: activeAssignments.count,
      iepsTotal: allIeps.count,
      iepsExpired: expiredIeps.count,
      yearHistory: yearRows,
    });
  } catch (err) {
    console.error("Rollover preview error", err);
    res.status(500).json({ error: "Failed to generate rollover preview" });
  }
});

router.post("/admin/rollover/execute", requireAdmin, async (req, res): Promise<void> => {
  const meta = getPublicMeta(req);
  const districtId = meta.districtId;
  if (!districtId) {
    res.status(400).json({ error: "No district associated with this account" });
    return;
  }

  const { newLabel, newStartDate, newEndDate, confirmation } = req.body as {
    newLabel?: string;
    newStartDate?: string;
    newEndDate?: string;
    confirmation?: string;
  };

  if (!newLabel || !newStartDate || !newEndDate) {
    res.status(400).json({ error: "newLabel, newStartDate, and newEndDate are required" });
    return;
  }
  if (!confirmation || !confirmation.trim().startsWith("ROLLOVER")) {
    res.status(400).json({ error: "Confirmation phrase is required" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // Deactivate current active year
      await tx
        .update(schoolYearsTable)
        .set({ isActive: false })
        .where(and(eq(schoolYearsTable.districtId, districtId), eq(schoolYearsTable.isActive, true)));

      // Create new school year
      const [newYear] = await tx
        .insert(schoolYearsTable)
        .values({
          districtId,
          label: newLabel,
          startDate: newStartDate,
          endDate: newEndDate,
          isActive: true,
        })
        .returning();

      // Mark expired IEPs as needing annual review
      const today = new Date().toISOString().split("T")[0];
      const updated = await tx
        .update(iepDocumentsTable)
        .set({ status: "pending_annual_review" })
        .where(and(
          eq(iepDocumentsTable.active, true),
          lte(iepDocumentsTable.iepEndDate, today),
          sql`${iepDocumentsTable.status} != 'pending_annual_review'`,
        ))
        .returning({ id: iepDocumentsTable.id });

      return { newYear, flaggedIeps: updated.length };
    });

    await logAudit(req, {
      action: "create",
      targetTable: "school_years",
      targetId: result.newYear.id,
      summary: `School year rolled over to ${newLabel}; ${result.flaggedIeps} IEP(s) flagged for annual review`,
      newValues: { newLabel, newStartDate, newEndDate },
    });

    res.status(201).json({
      newYear: result.newYear,
      flaggedIeps: result.flaggedIeps,
      message: `Rollover to ${newLabel} completed successfully`,
    });
  } catch (err) {
    console.error("Rollover execution error", err);
    res.status(500).json({ error: "Rollover failed — no changes were made" });
  }
});

router.get("/admin/school-years", requireAdmin, async (req, res): Promise<void> => {
  const meta = getPublicMeta(req);
  const districtId = meta.districtId;
  if (!districtId) {
    res.status(400).json({ error: "No district associated with this account" });
    return;
  }
  const years = await db
    .select()
    .from(schoolYearsTable)
    .where(eq(schoolYearsTable.districtId, districtId))
    .orderBy(schoolYearsTable.startDate);
  res.json(years);
});

export default router;
