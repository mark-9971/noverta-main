import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  staffAssignmentsTable,
  studentsTable,
  staffTable,
  iepAccommodationsTable,
  scheduleBlocksTable,
  serviceTypesTable,
  behaviorTargetsTable,
  iepGoalsTable,
  teacherObservationsTable,
  progressReportsTable,
  progressNoteContributionsTable,
  classesTable,
  classEnrollmentsTable,
} from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";

const router: IRouter = Router();

router.get("/staff/:id/classroom", async (req, res): Promise<void> => {
  const staffId = Number(req.params.id);
  if (isNaN(staffId)) { res.status(400).json({ error: "Invalid staff ID" }); return; }

  const studentIdSet = new Set<number>();

  const spedAssignments = await db
    .select({ studentId: staffAssignmentsTable.studentId })
    .from(staffAssignmentsTable)
    .where(eq(staffAssignmentsTable.staffId, staffId));
  spedAssignments.forEach(a => studentIdSet.add(a.studentId));

  const teacherClasses = await db
    .select({ id: classesTable.id })
    .from(classesTable)
    .where(and(eq(classesTable.teacherId, staffId), eq(classesTable.active, true)));

  if (teacherClasses.length > 0) {
    const classIds = teacherClasses.map(c => c.id);
    const enrollments = await db
      .select({ studentId: classEnrollmentsTable.studentId })
      .from(classEnrollmentsTable)
      .where(and(
        inArray(classEnrollmentsTable.classId, classIds),
        eq(classEnrollmentsTable.status, "active"),
      ));
    enrollments.forEach(e => studentIdSet.add(e.studentId));
  }

  const studentIds = [...studentIdSet];
  if (studentIds.length === 0) {
    res.json({ students: [] });
    return;
  }

  const allStudents = await db.select().from(studentsTable);
  const filteredStudents = allStudents.filter(s => studentIds.includes(s.id));

  const accommodations = await db
    .select()
    .from(iepAccommodationsTable)
    .where(eq(iepAccommodationsTable.active, true));

  const schedules = await db
    .select({
      id: scheduleBlocksTable.id,
      studentId: scheduleBlocksTable.studentId,
      staffId: scheduleBlocksTable.staffId,
      dayOfWeek: scheduleBlocksTable.dayOfWeek,
      startTime: scheduleBlocksTable.startTime,
      endTime: scheduleBlocksTable.endTime,
      blockLabel: scheduleBlocksTable.blockLabel,
      blockType: scheduleBlocksTable.blockType,
      location: scheduleBlocksTable.location,
      serviceTypeId: scheduleBlocksTable.serviceTypeId,
    })
    .from(scheduleBlocksTable)
    .where(eq(scheduleBlocksTable.blockType, "service"));

  const serviceTypes = await db.select().from(serviceTypesTable);
  const serviceTypeMap = Object.fromEntries(serviceTypes.map(st => [st.id, st.name]));

  const behaviorTargets = await db
    .select()
    .from(behaviorTargetsTable)
    .where(eq(behaviorTargetsTable.active, true));

  const recentObservations = await db
    .select()
    .from(teacherObservationsTable)
    .where(eq(teacherObservationsTable.staffId, staffId))
    .orderBy(desc(teacherObservationsTable.observationDate))
    .limit(100);

  const result = filteredStudents.map(student => {
    const isSped = !!student.disabilityCategory;
    const studentAccommodations = accommodations
      .filter(a => a.studentId === student.id)
      .map(a => ({
        id: a.id,
        category: a.category,
        description: a.description,
        setting: a.setting,
        frequency: a.frequency,
      }));

    const studentSchedule = schedules
      .filter(s => s.studentId === student.id)
      .map(s => ({
        id: s.id,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
        label: s.blockLabel || serviceTypeMap[s.serviceTypeId!] || "Service",
        location: s.location,
        serviceName: s.serviceTypeId ? serviceTypeMap[s.serviceTypeId] : null,
      }));

    const studentBehaviorTargets = behaviorTargets
      .filter(bt => bt.studentId === student.id)
      .map(bt => ({
        id: bt.id,
        name: bt.name,
        description: bt.description,
        measurementType: bt.measurementType,
        targetDirection: bt.targetDirection,
      }));

    const studentObservations = recentObservations
      .filter(o => o.studentId === student.id)
      .slice(0, 5)
      .map(o => ({
        id: o.id,
        date: o.observationDate,
        description: o.description,
        severity: o.severity,
      }));

    return {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      grade: student.grade,
      studentType: isSped ? "sped" : "gen_ed",
      accommodations: studentAccommodations,
      serviceSchedule: studentSchedule,
      behaviorTargets: studentBehaviorTargets,
      recentObservations: studentObservations,
    };
  });

  result.sort((a, b) => a.lastName.localeCompare(b.lastName));
  res.json({ students: result });
});

router.post("/teacher-observations", async (req, res): Promise<void> => {
  const { studentId, staffId, observationDate, description, severity, behaviorTargetId, iepGoalId } = req.body;

  if (!studentId || !staffId || !observationDate || !description) {
    res.status(400).json({ error: "studentId, staffId, observationDate, and description are required" });
    return;
  }

  const [obs] = await db
    .insert(teacherObservationsTable)
    .values({
      studentId: Number(studentId),
      staffId: Number(staffId),
      observationDate,
      description,
      severity: severity || "low",
      behaviorTargetId: behaviorTargetId ? Number(behaviorTargetId) : null,
      iepGoalId: iepGoalId ? Number(iepGoalId) : null,
    })
    .returning();

  res.status(201).json(obs);
});

router.get("/teacher-observations", async (req, res): Promise<void> => {
  const conditions = [];
  if (req.query.studentId) conditions.push(eq(teacherObservationsTable.studentId, Number(req.query.studentId)));
  if (req.query.staffId) conditions.push(eq(teacherObservationsTable.staffId, Number(req.query.staffId)));

  const observations = await db
    .select()
    .from(teacherObservationsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(teacherObservationsTable.observationDate))
    .limit(200);

  res.json(observations);
});

router.post("/progress-note-contributions", async (req, res): Promise<void> => {
  const { progressReportId, staffId, iepGoalId, narrative } = req.body;

  if (!progressReportId || !staffId || !iepGoalId || !narrative) {
    res.status(400).json({ error: "progressReportId, staffId, iepGoalId, and narrative are required" });
    return;
  }

  const [note] = await db
    .insert(progressNoteContributionsTable)
    .values({
      progressReportId: Number(progressReportId),
      staffId: Number(staffId),
      iepGoalId: Number(iepGoalId),
      narrative,
    })
    .returning();

  res.status(201).json(note);
});

router.get("/progress-note-contributions", async (req, res): Promise<void> => {
  const conditions = [];
  if (req.query.reportId) conditions.push(eq(progressNoteContributionsTable.progressReportId, Number(req.query.reportId)));
  if (req.query.staffId) conditions.push(eq(progressNoteContributionsTable.staffId, Number(req.query.staffId)));

  const notes = await db
    .select({
      id: progressNoteContributionsTable.id,
      progressReportId: progressNoteContributionsTable.progressReportId,
      staffId: progressNoteContributionsTable.staffId,
      iepGoalId: progressNoteContributionsTable.iepGoalId,
      narrative: progressNoteContributionsTable.narrative,
      submittedAt: progressNoteContributionsTable.submittedAt,
    })
    .from(progressNoteContributionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(progressNoteContributionsTable.submittedAt))
    .limit(100);

  res.json(notes);
});

router.get("/students/:id/iep-goals-summary", async (req, res): Promise<void> => {
  const studentId = Number(req.params.id);
  if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

  const goals = await db
    .select()
    .from(iepGoalsTable)
    .where(eq(iepGoalsTable.studentId, studentId));

  res.json(goals.map(g => ({
    id: g.id,
    goalArea: g.goalArea,
    goalNumber: g.goalNumber,
    annualGoal: g.annualGoal,
    baseline: g.baseline,
    targetCriterion: g.targetCriterion,
    status: g.status,
  })));
});

router.get("/students/:id/progress-reports", async (req, res): Promise<void> => {
  const studentId = Number(req.params.id);
  if (isNaN(studentId)) { res.status(400).json({ error: "Invalid student ID" }); return; }

  const reports = await db
    .select()
    .from(progressReportsTable)
    .where(eq(progressReportsTable.studentId, studentId))
    .orderBy(desc(progressReportsTable.createdAt));

  res.json(reports.map(r => ({
    id: r.id,
    reportingPeriod: r.reportingPeriod,
    periodStart: r.periodStart,
    periodEnd: r.periodEnd,
    status: r.status,
  })));
});

export default router;
