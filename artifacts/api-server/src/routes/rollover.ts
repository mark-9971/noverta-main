import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  schoolYearsTable,
  studentsTable,
  schoolsTable,
  staffAssignmentsTable,
  iepDocumentsTable,
  complianceEventsTable,
  scheduleBlocksTable,
  sessionLogsTable,
  teamMeetingsTable,
} from "@workspace/db";
import { eq, and, isNull, count, lte, inArray, sql } from "drizzle-orm";
import { requireRoles } from "../middlewares/auth";
import { getPublicMeta } from "../lib/clerkClaims";
import { logAudit } from "../lib/auditLog";
import { invalidateActiveYearCache } from "../lib/activeSchoolYear";

const router: IRouter = Router();
const requireAdmin = requireRoles("admin");

async function getDistrictStudentIds(districtId: number): Promise<number[]> {
  const schools = await db
    .select({ id: schoolsTable.id })
    .from(schoolsTable)
    .where(eq(schoolsTable.districtId, districtId));
  if (schools.length === 0) return [];
  const schoolIds = schools.map(s => s.id);
  const students = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(inArray(studentsTable.schoolId, schoolIds));
  return students.map(s => s.id);
}

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

    const studentIds = await getDistrictStudentIds(districtId);
    const today = new Date().toISOString().split("T")[0];

    let activeStudents = 0;
    let activeAssignments = 0;
    let iepsTotal = 0;
    let iepsExpired = 0;
    let archiveComplianceEvents = 0;
    let archiveScheduleBlocks = 0;
    let archiveSessionLogs = 0;
    let archiveTeamMeetings = 0;

    if (studentIds.length > 0) {
      const [[stuCnt], [assignCnt], [iepTotalCnt], [iepExpiredCnt]] = await Promise.all([
        db.select({ count: count() }).from(studentsTable)
          .where(and(inArray(studentsTable.id, studentIds), eq(studentsTable.status, "active"), isNull(studentsTable.deletedAt))),
        db.select({ count: count() }).from(staffAssignmentsTable)
          .where(and(inArray(staffAssignmentsTable.studentId, studentIds), isNull(staffAssignmentsTable.endDate))),
        db.select({ count: count() }).from(iepDocumentsTable)
          .where(and(inArray(iepDocumentsTable.studentId, studentIds), eq(iepDocumentsTable.active, true))),
        db.select({ count: count() }).from(iepDocumentsTable)
          .where(and(
            inArray(iepDocumentsTable.studentId, studentIds),
            eq(iepDocumentsTable.active, true),
            lte(iepDocumentsTable.iepEndDate, today),
          )),
      ]);
      activeStudents = stuCnt.count;
      activeAssignments = assignCnt.count;
      iepsTotal = iepTotalCnt.count;
      iepsExpired = iepExpiredCnt.count;

      if (activeYear) {
        const [[ceCnt], [sbCnt], [slCnt], [tmCnt]] = await Promise.all([
          db.select({ count: count() }).from(complianceEventsTable)
            .where(and(inArray(complianceEventsTable.studentId, studentIds), eq(complianceEventsTable.schoolYearId, activeYear.id))),
          db.select({ count: count() }).from(scheduleBlocksTable)
            .where(and(inArray(scheduleBlocksTable.studentId, studentIds), eq(scheduleBlocksTable.schoolYearId, activeYear.id))),
          db.select({ count: count() }).from(sessionLogsTable)
            .where(and(inArray(sessionLogsTable.studentId, studentIds), eq(sessionLogsTable.schoolYearId, activeYear.id))),
          db.select({ count: count() }).from(teamMeetingsTable)
            .where(and(inArray(teamMeetingsTable.studentId, studentIds), eq(teamMeetingsTable.schoolYearId, activeYear.id))),
        ]);
        archiveComplianceEvents = ceCnt.count;
        archiveScheduleBlocks = sbCnt.count;
        archiveSessionLogs = slCnt.count;
        archiveTeamMeetings = tmCnt.count;
      }
    }

    const yearRows = await db
      .select()
      .from(schoolYearsTable)
      .where(eq(schoolYearsTable.districtId, districtId))
      .orderBy(schoolYearsTable.startDate);

    res.json({
      currentYear: activeYear ?? null,
      activeStudents,
      activeStaffAssignments: activeAssignments,
      iepsTotal,
      iepsExpired,
      archiveComplianceEvents,
      archiveScheduleBlocks,
      archiveSessionLogs,
      archiveTeamMeetings,
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

  const expectedConfirmation = `ROLLOVER ${newLabel}`;
  if (!confirmation || confirmation.trim() !== expectedConfirmation) {
    res.status(400).json({ error: `Confirmation must be exactly: ${expectedConfirmation}` });
    return;
  }

  try {
    const studentIds = await getDistrictStudentIds(districtId);
    const today = new Date().toISOString().split("T")[0];

    const result = await db.transaction(async (tx) => {
      // Deactivate current active year for this district only
      await tx
        .update(schoolYearsTable)
        .set({ isActive: false })
        .where(and(eq(schoolYearsTable.districtId, districtId), eq(schoolYearsTable.isActive, true)));

      // Create new school year (partial unique index enforces one-active-per-district)
      const [newYear] = await tx
        .insert(schoolYearsTable)
        .values({ districtId, label: newLabel, startDate: newStartDate, endDate: newEndDate, isActive: true })
        .returning();

      let flaggedIeps = 0;
      let complianceEventsSeeded = 0;
      if (studentIds.length > 0) {
        // Flag expired IEPs for this district's students only
        const updated = await tx
          .update(iepDocumentsTable)
          .set({ status: "pending_annual_review" })
          .where(and(
            inArray(iepDocumentsTable.studentId, studentIds),
            eq(iepDocumentsTable.active, true),
            lte(iepDocumentsTable.iepEndDate, today),
            sql`${iepDocumentsTable.status} != 'pending_annual_review'`,
          ))
          .returning({ id: iepDocumentsTable.id });
        flaggedIeps = updated.length;

        // Seed fresh compliance events for the new year (annual review + 3yr reeval)
        const activeDocs = await tx
          .select({
            studentId: iepDocumentsTable.studentId,
            iepEndDate: iepDocumentsTable.iepEndDate,
            iepStartDate: iepDocumentsTable.iepStartDate,
          })
          .from(iepDocumentsTable)
          .where(and(
            inArray(iepDocumentsTable.studentId, studentIds),
            eq(iepDocumentsTable.active, true),
          ));

        const newComplianceEvents: {
          studentId: number;
          eventType: string;
          title: string;
          dueDate: string;
          status: string;
          schoolYearId: number;
        }[] = [];
        for (const doc of activeDocs) {
          newComplianceEvents.push({
            studentId: doc.studentId,
            eventType: "annual_review",
            title: `Annual IEP Review`,
            dueDate: doc.iepEndDate,
            status: "upcoming",
            schoolYearId: newYear.id,
          });
          const reevalDate = new Date(doc.iepStartDate);
          reevalDate.setFullYear(reevalDate.getFullYear() + 3);
          newComplianceEvents.push({
            studentId: doc.studentId,
            eventType: "reeval_3yr",
            title: `3-Year Reevaluation`,
            dueDate: reevalDate.toISOString().split("T")[0],
            status: "upcoming",
            schoolYearId: newYear.id,
          });
        }
        if (newComplianceEvents.length > 0) {
          await tx.insert(complianceEventsTable).values(newComplianceEvents);
          complianceEventsSeeded = newComplianceEvents.length;
        }
      }

      return { newYear, flaggedIeps, complianceEventsSeeded };
    });

    invalidateActiveYearCache(districtId);

    logAudit(req, {
      action: "create",
      targetTable: "school_years",
      targetId: result.newYear.id,
      summary: `School year rolled over to ${newLabel}; ${result.flaggedIeps} IEP(s) flagged; ${result.complianceEventsSeeded} compliance events seeded`,
      newValues: { newLabel, newStartDate, newEndDate },
    });

    res.status(201).json({
      newYear: result.newYear,
      flaggedIeps: result.flaggedIeps,
      complianceEventsSeeded: result.complianceEventsSeeded,
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

router.get("/school-years", async (req, res): Promise<void> => {
  const meta = getPublicMeta(req);
  const districtId = meta.districtId;
  if (!districtId) {
    res.json([]);
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
