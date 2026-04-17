// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  compensatoryObligationsTable,
  sessionLogsTable,
  serviceRequirementsTable,
  serviceTypesTable,
  studentsTable,
  staffTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, sql, inArray, isNull } from "drizzle-orm";
import { pool } from "@workspace/db";
import { requireTierAccess } from "../middlewares/tierGate";
import type { AuthedRequest } from "../middlewares/auth";
import {
  assertStudentInCallerDistrict, assertStaffInCallerDistrict,
  assertServiceRequirementInCallerDistrict,
  assertCompensatoryObligationInCallerDistrict,
} from "../lib/districtScope";
import { drizzle } from "drizzle-orm/node-postgres";
import {
  ListCompensatoryObligationsQueryParams,
  CreateCompensatoryObligationBody,
  GetCompensatoryObligationParams,
  UpdateCompensatoryObligationParams,
  UpdateCompensatoryObligationBody,
} from "@workspace/api-zod";

const VALID_STATUSES = ["pending", "in_progress", "completed", "waived"];

const router: IRouter = Router();
router.use("/compensatory-obligations", requireTierAccess("compliance.compensatory"));

router.get("/compensatory-obligations", async (req, res): Promise<void> => {
  const queryParsed = ListCompensatoryObligationsQueryParams.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ error: "Invalid query parameters", details: queryParsed.error.flatten() });
    return;
  }
  const { studentId, status, schoolId } = req.query;

  const conditions: any[] = [];
  if (studentId) conditions.push(eq(compensatoryObligationsTable.studentId, Number(studentId)));
  if (status) conditions.push(eq(compensatoryObligationsTable.status, status as string));
  if (schoolId) conditions.push(sql`${compensatoryObligationsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${Number(schoolId)})`);

  const rows = await db
    .select({
      id: compensatoryObligationsTable.id,
      studentId: compensatoryObligationsTable.studentId,
      serviceRequirementId: compensatoryObligationsTable.serviceRequirementId,
      periodStart: compensatoryObligationsTable.periodStart,
      periodEnd: compensatoryObligationsTable.periodEnd,
      minutesOwed: compensatoryObligationsTable.minutesOwed,
      minutesDelivered: compensatoryObligationsTable.minutesDelivered,
      status: compensatoryObligationsTable.status,
      notes: compensatoryObligationsTable.notes,
      agreedDate: compensatoryObligationsTable.agreedDate,
      agreedWith: compensatoryObligationsTable.agreedWith,
      source: compensatoryObligationsTable.source,
      createdAt: compensatoryObligationsTable.createdAt,
      updatedAt: compensatoryObligationsTable.updatedAt,
      studentFirst: studentsTable.firstName,
      studentLast: studentsTable.lastName,
      serviceTypeName: serviceTypesTable.name,
    })
    .from(compensatoryObligationsTable)
    .leftJoin(studentsTable, eq(studentsTable.id, compensatoryObligationsTable.studentId))
    .leftJoin(serviceRequirementsTable, eq(serviceRequirementsTable.id, compensatoryObligationsTable.serviceRequirementId))
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(compensatoryObligationsTable.createdAt));

  res.json(rows.map(r => ({
    ...r,
    studentName: r.studentFirst ? `${r.studentFirst} ${r.studentLast}` : null,
    minutesRemaining: Math.max(0, r.minutesOwed - r.minutesDelivered),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  })));
});

router.get("/compensatory-obligations/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [row] = await db
    .select({
      id: compensatoryObligationsTable.id,
      studentId: compensatoryObligationsTable.studentId,
      serviceRequirementId: compensatoryObligationsTable.serviceRequirementId,
      periodStart: compensatoryObligationsTable.periodStart,
      periodEnd: compensatoryObligationsTable.periodEnd,
      minutesOwed: compensatoryObligationsTable.minutesOwed,
      minutesDelivered: compensatoryObligationsTable.minutesDelivered,
      status: compensatoryObligationsTable.status,
      notes: compensatoryObligationsTable.notes,
      agreedDate: compensatoryObligationsTable.agreedDate,
      agreedWith: compensatoryObligationsTable.agreedWith,
      source: compensatoryObligationsTable.source,
      createdAt: compensatoryObligationsTable.createdAt,
      updatedAt: compensatoryObligationsTable.updatedAt,
      studentFirst: studentsTable.firstName,
      studentLast: studentsTable.lastName,
      serviceTypeName: serviceTypesTable.name,
    })
    .from(compensatoryObligationsTable)
    .leftJoin(studentsTable, eq(studentsTable.id, compensatoryObligationsTable.studentId))
    .leftJoin(serviceRequirementsTable, eq(serviceRequirementsTable.id, compensatoryObligationsTable.serviceRequirementId))
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
    .where(eq(compensatoryObligationsTable.id, id));

  if (!row) { res.status(404).json({ error: "Not found" }); return; }

  const compSessions = await db
    .select({
      id: sessionLogsTable.id,
      sessionDate: sessionLogsTable.sessionDate,
      durationMinutes: sessionLogsTable.durationMinutes,
      startTime: sessionLogsTable.startTime,
      endTime: sessionLogsTable.endTime,
      status: sessionLogsTable.status,
      notes: sessionLogsTable.notes,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
      serviceTypeName: serviceTypesTable.name,
    })
    .from(sessionLogsTable)
    .leftJoin(staffTable, eq(staffTable.id, sessionLogsTable.staffId))
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, sessionLogsTable.serviceTypeId))
    .where(and(eq(sessionLogsTable.compensatoryObligationId, id), isNull(sessionLogsTable.deletedAt)))
    .orderBy(desc(sessionLogsTable.sessionDate));

  res.json({
    ...row,
    studentName: row.studentFirst ? `${row.studentFirst} ${row.studentLast}` : null,
    minutesRemaining: Math.max(0, row.minutesOwed - row.minutesDelivered),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    sessions: compSessions.map(s => ({
      ...s,
      staffName: s.staffFirst ? `${s.staffFirst} ${s.staffLast}` : null,
    })),
  });
});

router.post("/compensatory-obligations", async (req, res): Promise<void> => {
  const bodyParsed = CreateCompensatoryObligationBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid request body", details: bodyParsed.error.flatten() });
    return;
  }
  const { studentId, serviceRequirementId, periodStart, periodEnd, minutesOwed, notes, agreedDate, agreedWith, source } = bodyParsed.data;

  // Body-IDOR defense: studentId + serviceRequirementId must be in caller's district.
  const authed = req as AuthedRequest;
  if (!(await assertStudentInCallerDistrict(authed, Number(studentId), res))) return;
  if (serviceRequirementId != null
    && !(await assertServiceRequirementInCallerDistrict(authed, Number(serviceRequirementId), res))) return;

  const [row] = await db.insert(compensatoryObligationsTable).values({
    studentId: Number(studentId),
    serviceRequirementId: serviceRequirementId ? Number(serviceRequirementId) : null,
    periodStart,
    periodEnd,
    minutesOwed: Number(minutesOwed),
    minutesDelivered: 0,
    status: "pending",
    notes: notes || null,
    agreedDate: agreedDate || null,
    agreedWith: agreedWith || null,
    source: source || "manual",
  }).returning();

  res.status(201).json({ ...row, minutesRemaining: Math.max(0, row.minutesOwed - row.minutesDelivered), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
});

router.patch("/compensatory-obligations/:id", async (req, res): Promise<void> => {
  const paramsParsed = UpdateCompensatoryObligationParams.safeParse(req.params);
  if (!paramsParsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const id = paramsParsed.data.id;

  if (!(await assertCompensatoryObligationInCallerDistrict(req as AuthedRequest, id, res))) return;

  const bodyParsed = UpdateCompensatoryObligationBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid request body", details: bodyParsed.error.flatten() });
    return;
  }

  const updateData: any = {};
  if (bodyParsed.data.minutesOwed != null) {
    const owed = Number(bodyParsed.data.minutesOwed);
    if (owed <= 0) { res.status(400).json({ error: "minutesOwed must be positive" }); return; }
    updateData.minutesOwed = owed;
  }
  if (bodyParsed.data.status != null) {
    if (!VALID_STATUSES.includes(bodyParsed.data.status)) {
      res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
      return;
    }
    if (bodyParsed.data.status === "waived") {
      const notes = bodyParsed.data.notes ?? req.body.notes;
      if (!notes || (typeof notes === "string" && notes.trim().length === 0)) {
        res.status(400).json({ error: "Notes with documentation are required when waiving an obligation" });
        return;
      }
    }
    updateData.status = bodyParsed.data.status;
  }
  if (bodyParsed.data.notes !== undefined) updateData.notes = bodyParsed.data.notes;
  if (bodyParsed.data.agreedDate !== undefined) updateData.agreedDate = bodyParsed.data.agreedDate;
  if (bodyParsed.data.agreedWith !== undefined) updateData.agreedWith = bodyParsed.data.agreedWith;

  const [row] = await db.update(compensatoryObligationsTable)
    .set(updateData)
    .where(eq(compensatoryObligationsTable.id, id))
    .returning();

  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json({ ...row, minutesRemaining: Math.max(0, row.minutesOwed - row.minutesDelivered), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
});

router.delete("/compensatory-obligations/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  if (!(await assertCompensatoryObligationInCallerDistrict(req as AuthedRequest, id, res))) return;
  await db.delete(compensatoryObligationsTable).where(eq(compensatoryObligationsTable.id, id));
  res.sendStatus(204);
});

router.post("/compensatory-obligations/:id/sessions", async (req, res): Promise<void> => {
  const obligationId = Number(req.params.id);
  if (isNaN(obligationId)) { res.status(400).json({ error: "Invalid obligation id" }); return; }

  // Tenant guard on the parent obligation + body-supplied staffId.
  const authed = req as AuthedRequest;
  if (!(await assertCompensatoryObligationInCallerDistrict(authed, obligationId, res))) return;
  if (req.body?.staffId != null
    && !(await assertStaffInCallerDistrict(authed, Number(req.body.staffId), res))) return;

  const { sessionDate, durationMinutes, staffId, serviceTypeId, startTime, endTime, notes, location } = req.body;
  if (!sessionDate || !durationMinutes) {
    res.status(400).json({ error: "sessionDate and durationMinutes are required" });
    return;
  }
  const duration = Number(durationMinutes);
  if (duration <= 0) {
    res.status(400).json({ error: "durationMinutes must be positive" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const txDb = drizzle(client);

    const [obligation] = await txDb.select().from(compensatoryObligationsTable)
      .where(eq(compensatoryObligationsTable.id, obligationId));
    if (!obligation) { await client.query("ROLLBACK"); res.status(404).json({ error: "Obligation not found" }); return; }
    if (obligation.status === "completed" || obligation.status === "waived") {
      await client.query("ROLLBACK");
      res.status(400).json({ error: `Cannot log sessions against a ${obligation.status} obligation` });
      return;
    }

    let svcTypeId = serviceTypeId ? Number(serviceTypeId) : null;
    if (!svcTypeId && obligation.serviceRequirementId) {
      const [sr] = await txDb.select({ serviceTypeId: serviceRequirementsTable.serviceTypeId })
        .from(serviceRequirementsTable).where(eq(serviceRequirementsTable.id, obligation.serviceRequirementId));
      if (sr) svcTypeId = sr.serviceTypeId;
    }

    const [session] = await txDb.insert(sessionLogsTable).values({
      studentId: obligation.studentId,
      serviceRequirementId: obligation.serviceRequirementId,
      serviceTypeId: svcTypeId,
      staffId: staffId ? Number(staffId) : null,
      sessionDate,
      startTime: startTime || null,
      endTime: endTime || null,
      durationMinutes: duration,
      location: location || null,
      status: "completed",
      isMakeup: false,
      isCompensatory: true,
      compensatoryObligationId: obligationId,
      notes: notes || null,
    }).returning();

    const newDelivered = obligation.minutesDelivered + duration;
    const newStatus = newDelivered >= obligation.minutesOwed ? "completed" : "in_progress";

    await txDb.update(compensatoryObligationsTable)
      .set({ minutesDelivered: newDelivered, status: newStatus })
      .where(eq(compensatoryObligationsTable.id, obligationId));

    await client.query("COMMIT");
    res.status(201).json({ ...session, createdAt: session.createdAt.toISOString(), updatedAt: session.updatedAt.toISOString() });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.get("/compensatory-obligations/summary/by-student/:studentId", async (req, res): Promise<void> => {
  const studentId = Number(req.params.studentId);
  if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }

  const obligations = await db
    .select({
      id: compensatoryObligationsTable.id,
      serviceRequirementId: compensatoryObligationsTable.serviceRequirementId,
      periodStart: compensatoryObligationsTable.periodStart,
      periodEnd: compensatoryObligationsTable.periodEnd,
      minutesOwed: compensatoryObligationsTable.minutesOwed,
      minutesDelivered: compensatoryObligationsTable.minutesDelivered,
      status: compensatoryObligationsTable.status,
      serviceTypeName: serviceTypesTable.name,
    })
    .from(compensatoryObligationsTable)
    .leftJoin(serviceRequirementsTable, eq(serviceRequirementsTable.id, compensatoryObligationsTable.serviceRequirementId))
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
    .where(eq(compensatoryObligationsTable.studentId, studentId))
    .orderBy(desc(compensatoryObligationsTable.createdAt));

  const totalOwed = obligations.reduce((s, o) => s + o.minutesOwed, 0);
  const totalDelivered = obligations.reduce((s, o) => s + o.minutesDelivered, 0);
  const pending = obligations.filter(o => o.status === "pending").length;
  const inProgress = obligations.filter(o => o.status === "in_progress").length;
  const completed = obligations.filter(o => o.status === "completed").length;
  const waived = obligations.filter(o => o.status === "waived").length;

  res.json({
    studentId,
    totalOwed,
    totalDelivered,
    totalRemaining: Math.max(0, totalOwed - totalDelivered),
    counts: { pending, inProgress, completed, waived, total: obligations.length },
    obligations: obligations.map(o => ({
      ...o,
      minutesRemaining: Math.max(0, o.minutesOwed - o.minutesDelivered),
    })),
  });
});

router.post("/compensatory-obligations/calculate-shortfalls", async (req, res): Promise<void> => {
  const { schoolId, periodStart, periodEnd } = req.body;
  if (!periodStart || !periodEnd) {
    res.status(400).json({ error: "periodStart and periodEnd are required" });
    return;
  }

  const conditions: any[] = [eq(serviceRequirementsTable.active, true)];
  if (schoolId) {
    conditions.push(sql`${serviceRequirementsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${Number(schoolId)})`);
  }

  const reqs = await db
    .select({
      id: serviceRequirementsTable.id,
      studentId: serviceRequirementsTable.studentId,
      requiredMinutes: serviceRequirementsTable.requiredMinutes,
      intervalType: serviceRequirementsTable.intervalType,
      studentFirst: studentsTable.firstName,
      studentLast: studentsTable.lastName,
      serviceTypeName: serviceTypesTable.name,
    })
    .from(serviceRequirementsTable)
    .leftJoin(studentsTable, eq(studentsTable.id, serviceRequirementsTable.studentId))
    .leftJoin(serviceTypesTable, eq(serviceTypesTable.id, serviceRequirementsTable.serviceTypeId))
    .where(and(...conditions));

  if (reqs.length === 0) { res.json([]); return; }

  const reqIds = reqs.map(r => r.id);
  const sessions = await db
    .select({
      serviceRequirementId: sessionLogsTable.serviceRequirementId,
      durationMinutes: sessionLogsTable.durationMinutes,
      status: sessionLogsTable.status,
    })
    .from(sessionLogsTable)
    .where(and(
      inArray(sessionLogsTable.serviceRequirementId, reqIds),
      gte(sessionLogsTable.sessionDate, periodStart as string),
      lte(sessionLogsTable.sessionDate, periodEnd as string),
      eq(sessionLogsTable.isCompensatory, false),
      isNull(sessionLogsTable.deletedAt),
    ));

  const deliveredByReq = new Map<number, number>();
  for (const s of sessions) {
    if (s.status === "completed" || s.status === "makeup") {
      const current = deliveredByReq.get(s.serviceRequirementId!) || 0;
      deliveredByReq.set(s.serviceRequirementId!, current + s.durationMinutes);
    }
  }

  const shortfalls: any[] = [];
  for (const r of reqs) {
    const delivered = deliveredByReq.get(r.id) || 0;
    const deficit = r.requiredMinutes - delivered;
    if (deficit > 0) {
      shortfalls.push({
        serviceRequirementId: r.id,
        studentId: r.studentId,
        studentName: r.studentFirst ? `${r.studentFirst} ${r.studentLast}` : null,
        serviceTypeName: r.serviceTypeName,
        requiredMinutes: r.requiredMinutes,
        deliveredMinutes: delivered,
        deficitMinutes: deficit,
        periodStart,
        periodEnd,
      });
    }
  }

  shortfalls.sort((a, b) => b.deficitMinutes - a.deficitMinutes);
  res.json(shortfalls);
});

router.post("/compensatory-obligations/generate-from-shortfalls", async (req, res): Promise<void> => {
  const { shortfalls } = req.body;
  if (!shortfalls || !Array.isArray(shortfalls) || shortfalls.length === 0) {
    res.status(400).json({ error: "shortfalls array is required" });
    return;
  }

  // Body-IDOR defense: every shortfall row's studentId AND serviceRequirementId
  // must belong to the caller's district. Without this, a privileged caller
  // could spam-create compensatory obligations against students in any district
  // by submitting crafted shortfall payloads.
  const authed = req as AuthedRequest;
  for (const sf of shortfalls) {
    if (sf?.studentId == null
      || !(await assertStudentInCallerDistrict(authed, Number(sf.studentId), res))) return;
    if (sf?.serviceRequirementId != null
      && !(await assertServiceRequirementInCallerDistrict(authed, Number(sf.serviceRequirementId), res))) return;
  }

  const created: any[] = [];
  const skipped: number[] = [];
  for (const sf of shortfalls) {
    const existing = await db
      .select({ id: compensatoryObligationsTable.id })
      .from(compensatoryObligationsTable)
      .where(
        and(
          eq(compensatoryObligationsTable.studentId, sf.studentId),
          eq(compensatoryObligationsTable.serviceRequirementId, sf.serviceRequirementId),
          sql`${compensatoryObligationsTable.periodStart} = ${sf.periodStart}`,
          sql`${compensatoryObligationsTable.periodEnd} = ${sf.periodEnd}`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      skipped.push(sf.serviceRequirementId);
      continue;
    }

    const [row] = await db.insert(compensatoryObligationsTable).values({
      studentId: sf.studentId,
      serviceRequirementId: sf.serviceRequirementId || null,
      periodStart: sf.periodStart,
      periodEnd: sf.periodEnd,
      minutesOwed: sf.deficitMinutes,
      minutesDelivered: 0,
      status: "pending",
      source: "auto_calculated",
      notes: `Auto-generated from ${sf.serviceTypeName || "service"} shortfall: ${sf.deficitMinutes} min deficit (${sf.deliveredMinutes}/${sf.requiredMinutes} delivered).`,
    }).returning();
    created.push({ ...row, minutesRemaining: row.minutesOwed, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  }

  res.status(201).json(created);
});

export default router;
