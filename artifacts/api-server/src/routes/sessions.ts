import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sessionLogsTable, serviceTypesTable, staffTable, studentsTable, missedReasonsTable, iepGoalsTable } from "@workspace/db";
import {
  ListSessionsQueryParams,
  CreateSessionBody,
  GetSessionParams,
  UpdateSessionParams,
  UpdateSessionBody,
  DeleteSessionParams,
  BulkCreateSessionsBody,
} from "@workspace/api-zod";
import { eq, and, gte, lte, desc, asc, sql } from "drizzle-orm";

const router: IRouter = Router();

function sessionToJson(s: any) {
  return {
    ...s,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt,
  };
}

router.get("/missed-reasons", async (req, res): Promise<void> => {
  const reasons = await db.select().from(missedReasonsTable).orderBy(missedReasonsTable.label);
  res.json(reasons);
});

router.post("/missed-reasons", async (req, res): Promise<void> => {
  const { label, category } = req.body;
  if (!label || !category) {
    res.status(400).json({ error: "label and category required" });
    return;
  }
  const [reason] = await db.insert(missedReasonsTable).values({ label, category }).returning();
  res.status(201).json(reason);
});

router.get("/sessions", async (req, res): Promise<void> => {
  const params = ListSessionsQueryParams.safeParse(req.query);
  const conditions: any[] = [];
  if (params.success) {
    if (params.data.studentId) conditions.push(eq(sessionLogsTable.studentId, Number(params.data.studentId)));
    if (params.data.staffId) conditions.push(eq(sessionLogsTable.staffId, Number(params.data.staffId)));
    if (params.data.serviceRequirementId) conditions.push(eq(sessionLogsTable.serviceRequirementId, Number(params.data.serviceRequirementId)));
    if (params.data.status) conditions.push(eq(sessionLogsTable.status, params.data.status));
    if (params.data.dateFrom) conditions.push(gte(sessionLogsTable.sessionDate, params.data.dateFrom));
    if (params.data.dateTo) conditions.push(lte(sessionLogsTable.sessionDate, params.data.dateTo));
    if (params.data.schoolId) conditions.push(sql`${sessionLogsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${Number(params.data.schoolId)})`);
    if (params.data.districtId) conditions.push(sql`${sessionLogsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${Number(params.data.districtId)}))`);
  }

  const limit = params.success && params.data.limit ? Number(params.data.limit) : 100;
  const offset = params.success && params.data.offset ? Number(params.data.offset) : 0;

  const sessions = await db
    .select({
      id: sessionLogsTable.id,
      studentId: sessionLogsTable.studentId,
      serviceRequirementId: sessionLogsTable.serviceRequirementId,
      serviceTypeId: sessionLogsTable.serviceTypeId,
      staffId: sessionLogsTable.staffId,
      sessionDate: sessionLogsTable.sessionDate,
      startTime: sessionLogsTable.startTime,
      endTime: sessionLogsTable.endTime,
      durationMinutes: sessionLogsTable.durationMinutes,
      location: sessionLogsTable.location,
      deliveryMode: sessionLogsTable.deliveryMode,
      status: sessionLogsTable.status,
      missedReasonId: sessionLogsTable.missedReasonId,
      isMakeup: sessionLogsTable.isMakeup,
      notes: sessionLogsTable.notes,
      createdAt: sessionLogsTable.createdAt,
      serviceTypeName: serviceTypesTable.name,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
      studentFirst: studentsTable.firstName,
      studentLast: studentsTable.lastName,
      missedReasonLabel: missedReasonsTable.label,
    })
    .from(sessionLogsTable)
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, sessionLogsTable.staffId))
    .leftJoin(studentsTable, eq(studentsTable.id, sessionLogsTable.studentId))
    .leftJoin(missedReasonsTable, eq(missedReasonsTable.id, sessionLogsTable.missedReasonId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(sessionLogsTable.sessionDate))
    .limit(limit)
    .offset(offset);

  res.json(sessions.map(s => ({
    ...s,
    studentName: s.studentFirst ? `${s.studentFirst} ${s.studentLast}` : null,
    serviceTypeName: s.serviceTypeName,
    staffName: s.staffFirst ? `${s.staffFirst} ${s.staffLast}` : null,
    missedReasonLabel: s.missedReasonLabel,
    createdAt: s.createdAt.toISOString(),
  })));
});

router.post("/sessions/bulk", async (req, res): Promise<void> => {
  const parsed = BulkCreateSessionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const inserted = await db.insert(sessionLogsTable).values(parsed.data.sessions).returning();
  res.status(201).json(inserted.map(s => ({ ...s, createdAt: s.createdAt.toISOString() })));
});

router.post("/sessions", async (req, res): Promise<void> => {
  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [session] = await db.insert(sessionLogsTable).values(parsed.data).returning();
  res.status(201).json({ ...session, createdAt: session.createdAt.toISOString() });
});

router.get("/sessions/:id", async (req, res): Promise<void> => {
  const params = GetSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [session] = await db
    .select({
      id: sessionLogsTable.id,
      studentId: sessionLogsTable.studentId,
      serviceRequirementId: sessionLogsTable.serviceRequirementId,
      serviceTypeId: sessionLogsTable.serviceTypeId,
      staffId: sessionLogsTable.staffId,
      sessionDate: sessionLogsTable.sessionDate,
      startTime: sessionLogsTable.startTime,
      endTime: sessionLogsTable.endTime,
      durationMinutes: sessionLogsTable.durationMinutes,
      location: sessionLogsTable.location,
      deliveryMode: sessionLogsTable.deliveryMode,
      status: sessionLogsTable.status,
      missedReasonId: sessionLogsTable.missedReasonId,
      isMakeup: sessionLogsTable.isMakeup,
      notes: sessionLogsTable.notes,
      createdAt: sessionLogsTable.createdAt,
      serviceTypeName: serviceTypesTable.name,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
      studentFirst: studentsTable.firstName,
      studentLast: studentsTable.lastName,
      missedReasonLabel: missedReasonsTable.label,
    })
    .from(sessionLogsTable)
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
    .leftJoin(staffTable, eq(staffTable.id, sessionLogsTable.staffId))
    .leftJoin(studentsTable, eq(studentsTable.id, sessionLogsTable.studentId))
    .leftJoin(missedReasonsTable, eq(missedReasonsTable.id, sessionLogsTable.missedReasonId))
    .where(eq(sessionLogsTable.id, params.data.id));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const allGoals = await db.select({
    id: iepGoalsTable.id,
    goalArea: iepGoalsTable.goalArea,
    annualGoal: iepGoalsTable.annualGoal,
    targetCriterion: iepGoalsTable.targetCriterion,
    measurementMethod: iepGoalsTable.measurementMethod,
    serviceArea: iepGoalsTable.serviceArea,
    status: iepGoalsTable.status,
  }).from(iepGoalsTable)
    .where(and(
      eq(iepGoalsTable.studentId, session.studentId),
      eq(iepGoalsTable.active, true),
    ));

  const svcName = (session.serviceTypeName || "").toLowerCase();
  const goals = allGoals.filter(g => {
    const sa = (g.serviceArea || "").toLowerCase();
    return sa === svcName || svcName.includes(sa.split("/")[0]) || sa.includes(svcName.split(" ")[0]) ||
      (svcName.includes("aba") && sa.includes("aba")) ||
      (svcName.includes("para") && sa.includes("academic")) ||
      (svcName.includes("adapted") && sa.includes("motor")) ||
      (svcName.includes("bcba") && sa.includes("behavior")) ||
      (svcName.includes("counseling") && sa.includes("social"));
  });

  res.json({
    ...session,
    studentName: session.studentFirst ? `${session.studentFirst} ${session.studentLast}` : null,
    serviceTypeName: session.serviceTypeName,
    staffName: session.staffFirst ? `${session.staffFirst} ${session.staffLast}` : null,
    createdAt: session.createdAt.toISOString(),
    linkedGoals: goals,
  });
});

router.patch("/sessions/:id", async (req, res): Promise<void> => {
  const params = UpdateSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Partial<typeof sessionLogsTable.$inferInsert> = {};
  if (parsed.data.durationMinutes != null) updateData.durationMinutes = parsed.data.durationMinutes;
  if (parsed.data.status != null) updateData.status = parsed.data.status;
  if (parsed.data.missedReasonId !== undefined) updateData.missedReasonId = parsed.data.missedReasonId;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
  if (parsed.data.location !== undefined) updateData.location = parsed.data.location;

  const [session] = await db.update(sessionLogsTable).set(updateData).where(eq(sessionLogsTable.id, params.data.id)).returning();
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  res.json({ ...session, createdAt: session.createdAt.toISOString() });
});

router.get("/students/:studentId/minutes-trend", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { from, to } = req.query;

    const conditions: any[] = [
      eq(sessionLogsTable.studentId, studentId),
      eq(sessionLogsTable.status, "completed"),
    ];
    if (from) conditions.push(gte(sessionLogsTable.sessionDate, from as string));
    if (to) conditions.push(lte(sessionLogsTable.sessionDate, to as string));

    const rows = await db.select({
      sessionDate: sessionLogsTable.sessionDate,
      durationMinutes: sessionLogsTable.durationMinutes,
      serviceTypeName: serviceTypesTable.name,
      serviceTypeId: sessionLogsTable.serviceTypeId,
      staffId: sessionLogsTable.staffId,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
    })
      .from(sessionLogsTable)
      .innerJoin(serviceTypesTable, eq(sessionLogsTable.serviceTypeId, serviceTypesTable.id))
      .leftJoin(staffTable, eq(sessionLogsTable.staffId, staffTable.id))
      .where(and(...conditions))
      .orderBy(asc(sessionLogsTable.sessionDate));

    const data = rows.map((r) => ({
      date: r.sessionDate,
      value: r.durationMinutes ?? 0,
      serviceTypeName: r.serviceTypeName,
      serviceTypeId: r.serviceTypeId,
      staffId: r.staffId,
      staffName: r.staffFirst && r.staffLast ? `${r.staffFirst} ${r.staffLast}` : null,
    }));

    res.json(data);
  } catch (e: any) {
    console.error("GET minutes-trend error:", e);
    res.status(500).json({ error: "Failed to fetch minutes trend" });
  }
});

router.delete("/sessions/:id", async (req, res): Promise<void> => {
  const params = DeleteSessionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(sessionLogsTable).where(eq(sessionLogsTable.id, params.data.id));
  res.sendStatus(204);
});

export default router;
