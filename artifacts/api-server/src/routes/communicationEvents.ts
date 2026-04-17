import { Router, type Request, type Response } from "express";
import { db, communicationEventsTable, studentsTable, guardiansTable, staffTable } from "@workspace/db";
import { eq, and, desc, gte, lte, inArray, sql } from "drizzle-orm";
import { getEnforcedDistrictId, requireRoles } from "../middlewares/auth";
import { requireTierAccess } from "../middlewares/tierGate";

const router = Router();
router.use(
  "/communication-events",
  requireTierAccess("engagement.parent_communication"),
  // provider included: providers send messages to parents/guardians and need to
  // see the resulting communication-event status on their own outreach.
  requireRoles("admin", "coordinator", "case_manager", "sped_teacher", "bcba", "provider"),
);

router.get("/communication-events", async (req: Request, res: Response) => {
  const districtId = getEnforcedDistrictId(req);
  const { studentId, startDate, endDate, status, type, limit: limitStr, offset: offsetStr } = req.query as Record<string, string>;

  const limit = Math.min(Number(limitStr) || 100, 500);
  const offset = Number(offsetStr) || 0;

  let districtStudentIds: number[] = [];

  if (studentId) {
    const [student] = await db
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(
        districtId
          ? and(eq(studentsTable.id, Number(studentId)), eq(studentsTable.districtId, districtId))
          : eq(studentsTable.id, Number(studentId))
      );
    if (!student) { res.status(404).json({ error: "Student not found" }); return; }
    districtStudentIds = [student.id];
  } else {
    const students = await db
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(districtId ? eq(studentsTable.districtId, districtId) : undefined);
    districtStudentIds = students.map((s) => s.id);
  }

  if (districtStudentIds.length === 0) {
    res.json({ data: [], total: 0, limit, offset });
    return;
  }

  const conditions = [inArray(communicationEventsTable.studentId, districtStudentIds)];
  if (startDate) conditions.push(gte(communicationEventsTable.createdAt, new Date(startDate)));
  if (endDate) conditions.push(lte(communicationEventsTable.createdAt, new Date(endDate)));
  if (status) conditions.push(eq(communicationEventsTable.status, status));
  if (type) conditions.push(eq(communicationEventsTable.type, type));

  const [events, countRes] = await Promise.all([
    db.select().from(communicationEventsTable)
      .where(and(...conditions))
      .orderBy(desc(communicationEventsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(communicationEventsTable).where(and(...conditions)),
  ]);

  const staffIds = [...new Set(events.flatMap(e => e.staffId ? [e.staffId] : []))];
  const guardianIds = [...new Set(events.flatMap(e => e.guardianId ? [e.guardianId] : []))];
  const evtStudentIds = [...new Set(events.map(e => e.studentId))];

  const [staffList, guardianList, studentList] = await Promise.all([
    staffIds.length > 0 ? db.select({ id: staffTable.id, firstName: staffTable.firstName, lastName: staffTable.lastName }).from(staffTable).where(inArray(staffTable.id, staffIds)) : Promise.resolve([]),
    guardianIds.length > 0 ? db.select({ id: guardiansTable.id, name: guardiansTable.name }).from(guardiansTable).where(inArray(guardiansTable.id, guardianIds)) : Promise.resolve([]),
    evtStudentIds.length > 0 ? db.select({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName }).from(studentsTable).where(inArray(studentsTable.id, evtStudentIds)) : Promise.resolve([]),
  ]);

  const staffMap = Object.fromEntries(staffList.map(s => [s.id, s]));
  const guardianMap = Object.fromEntries(guardianList.map(g => [g.id, g]));
  const studentMap = Object.fromEntries(studentList.map(s => [s.id, s]));

  const enriched = events.map(e => ({
    ...e,
    staffName: e.staffId && staffMap[e.staffId] ? `${staffMap[e.staffId].firstName} ${staffMap[e.staffId].lastName}` : null,
    guardianName: e.guardianId && guardianMap[e.guardianId] ? guardianMap[e.guardianId].name : null,
    studentName: studentMap[e.studentId] ? `${studentMap[e.studentId].firstName} ${studentMap[e.studentId].lastName}` : null,
  }));

  res.json({ data: enriched, total: Number(countRes[0]?.count ?? 0), limit, offset });
});

router.get("/communication-events/student/:studentId", async (req: Request, res: Response) => {
  const districtId = getEnforcedDistrictId(req);
  const studentId = Number(req.params.studentId);
  if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }

  const [student] = await db
    .select({ id: studentsTable.id, firstName: studentsTable.firstName, lastName: studentsTable.lastName })
    .from(studentsTable)
    .where(
      districtId
        ? and(eq(studentsTable.id, studentId), eq(studentsTable.districtId, districtId))
        : eq(studentsTable.id, studentId)
    );
  if (!student) { res.status(404).json({ error: "Student not found" }); return; }

  const events = await db
    .select()
    .from(communicationEventsTable)
    .where(eq(communicationEventsTable.studentId, studentId))
    .orderBy(desc(communicationEventsTable.createdAt))
    .limit(200);

  const staffIds = [...new Set(events.flatMap(e => e.staffId ? [e.staffId] : []))];
  const guardianIds = [...new Set(events.flatMap(e => e.guardianId ? [e.guardianId] : []))];

  const [staffList, guardianList] = await Promise.all([
    staffIds.length > 0 ? db.select({ id: staffTable.id, firstName: staffTable.firstName, lastName: staffTable.lastName }).from(staffTable).where(inArray(staffTable.id, staffIds)) : Promise.resolve([]),
    guardianIds.length > 0 ? db.select({ id: guardiansTable.id, name: guardiansTable.name }).from(guardiansTable).where(inArray(guardiansTable.id, guardianIds)) : Promise.resolve([]),
  ]);

  const staffMap = Object.fromEntries(staffList.map(s => [s.id, s]));
  const guardianMap = Object.fromEntries(guardianList.map(g => [g.id, g]));

  const enriched = events.map(e => ({
    ...e,
    staffName: e.staffId && staffMap[e.staffId] ? `${staffMap[e.staffId].firstName} ${staffMap[e.staffId].lastName}` : null,
    guardianName: e.guardianId && guardianMap[e.guardianId] ? guardianMap[e.guardianId].name : null,
  }));

  res.json({ student, events: enriched });
});

router.get("/communication-events/summary", async (req: Request, res: Response) => {
  const districtId = getEnforcedDistrictId(req);

  const students = await db
    .select({ id: studentsTable.id })
    .from(studentsTable)
    .where(districtId ? eq(studentsTable.districtId, districtId) : undefined);

  const studentIds = students.map(s => s.id);
  if (studentIds.length === 0) {
    res.json({ total: 0, sent: 0, failed: 0, notConfigured: 0, queued: 0 });
    return;
  }

  const allEvents = await db
    .select({ status: communicationEventsTable.status })
    .from(communicationEventsTable)
    .where(inArray(communicationEventsTable.studentId, studentIds));

  const summary = { total: allEvents.length, sent: 0, failed: 0, notConfigured: 0, queued: 0, other: 0 };
  for (const e of allEvents) {
    if (e.status === "sent" || e.status === "delivered") summary.sent++;
    else if (e.status === "failed" || e.status === "bounced") summary.failed++;
    else if (e.status === "not_configured") summary.notConfigured++;
    else if (e.status === "queued") summary.queued++;
    else summary.other++;
  }
  res.json(summary);
});

export default router;
