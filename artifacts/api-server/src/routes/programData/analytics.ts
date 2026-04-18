// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  behaviorTargetsTable, programTargetsTable, dataSessionsTable,
  behaviorDataTable, programDataTable, staffTable,
  phaseChangesTable, protocolModificationMarkersTable, programStepsTable,
} from "@workspace/db";
import { eq, and, sql, gte, lte, asc, isNotNull, or } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import {
  assertStudentInCallerDistrict,
  assertBehaviorTargetInCallerDistrict,
  assertPhaseChangeInCallerDistrict,
  assertProgramTargetInCallerDistrict,
} from "../../lib/districtScope";
import type { AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

router.get("/students/:studentId/behavior-data/trends", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, studentId, res))) return;
    const { from, to, behaviorTargetId } = req.query;

    const conditions = [eq(dataSessionsTable.studentId, studentId)];
    if (from) conditions.push(gte(dataSessionsTable.sessionDate, from as string));
    if (to) conditions.push(lte(dataSessionsTable.sessionDate, to as string));

    const bdConditions: any[] = [];
    if (behaviorTargetId) bdConditions.push(eq(behaviorDataTable.behaviorTargetId, parseInt(behaviorTargetId as string)));

    const rows = await db.select({
      sessionDate: dataSessionsTable.sessionDate,
      behaviorTargetId: behaviorDataTable.behaviorTargetId,
      targetName: behaviorTargetsTable.name,
      measurementType: behaviorTargetsTable.measurementType,
      value: behaviorDataTable.value,
      hourBlock: behaviorDataTable.hourBlock,
      staffId: dataSessionsTable.staffId,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
    }).from(behaviorDataTable)
      .innerJoin(dataSessionsTable, eq(behaviorDataTable.dataSessionId, dataSessionsTable.id))
      .innerJoin(behaviorTargetsTable, eq(behaviorDataTable.behaviorTargetId, behaviorTargetsTable.id))
      .leftJoin(staffTable, eq(dataSessionsTable.staffId, staffTable.id))
      .where(and(...conditions, ...bdConditions))
      .orderBy(asc(dataSessionsTable.sessionDate));

    const data = rows.map(r => ({
      ...r,
      staffName: r.staffFirst && r.staffLast ? `${r.staffFirst} ${r.staffLast}` : null,
    }));

    logAudit(req, {
      action: "read",
      targetTable: "behavior_data",
      studentId: studentId,
      summary: `Viewed behavior data trends for student #${studentId} (${data.length} data points)`,
    });
    res.json(data);
  } catch (e: any) {
    console.error("GET behavior trends error:", e);
    res.status(500).json({ error: "Failed to fetch behavior trends" });
  }
});

router.get("/students/:studentId/program-data/trends", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, studentId, res))) return;
    const { from, to, programTargetId } = req.query;

    const conditions = [eq(dataSessionsTable.studentId, studentId)];
    if (from) conditions.push(gte(dataSessionsTable.sessionDate, from as string));
    if (to) conditions.push(lte(dataSessionsTable.sessionDate, to as string));

    const pdConditions: any[] = [];
    if (programTargetId) pdConditions.push(eq(programDataTable.programTargetId, parseInt(programTargetId as string)));

    const rows = await db.select({
      sessionDate: dataSessionsTable.sessionDate,
      programTargetId: programDataTable.programTargetId,
      targetName: programTargetsTable.name,
      programType: programTargetsTable.programType,
      trialsCorrect: programDataTable.trialsCorrect,
      trialsTotal: programDataTable.trialsTotal,
      prompted: programDataTable.prompted,
      percentCorrect: programDataTable.percentCorrect,
      promptLevelUsed: programDataTable.promptLevelUsed,
      staffId: dataSessionsTable.staffId,
      staffFirst: staffTable.firstName,
      staffLast: staffTable.lastName,
    }).from(programDataTable)
      .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
      .innerJoin(programTargetsTable, eq(programDataTable.programTargetId, programTargetsTable.id))
      .leftJoin(staffTable, eq(dataSessionsTable.staffId, staffTable.id))
      .where(and(...conditions, ...pdConditions))
      .orderBy(asc(dataSessionsTable.sessionDate));

    const data = rows.map(r => ({
      ...r,
      staffName: r.staffFirst && r.staffLast ? `${r.staffFirst} ${r.staffLast}` : null,
    }));

    logAudit(req, {
      action: "read",
      targetTable: "program_data",
      studentId: studentId,
      summary: `Viewed program data trends for student #${studentId} (${data.length} data points)`,
    });
    res.json(data);
  } catch (e: any) {
    console.error("GET program trends error:", e);
    res.status(500).json({ error: "Failed to fetch program trends" });
  }
});

router.get("/behavior-targets/:targetId/phase-changes", async (req, res): Promise<void> => {
  try {
    const targetId = parseInt(req.params.targetId);
    if (!(await assertBehaviorTargetInCallerDistrict(req as AuthedRequest, targetId, res))) return;
    const rows = await db.select().from(phaseChangesTable)
      .where(eq(phaseChangesTable.behaviorTargetId, targetId))
      .orderBy(asc(phaseChangesTable.changeDate));
    res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch phase changes" });
  }
});

router.post("/behavior-targets/:targetId/phase-changes", async (req, res): Promise<void> => {
  try {
    const behaviorTargetId = parseInt(req.params.targetId);
    if (!(await assertBehaviorTargetInCallerDistrict(req as AuthedRequest, behaviorTargetId, res))) return;
    const { changeDate, label, notes } = req.body;
    if (!changeDate || !label) { res.status(400).json({ error: "changeDate and label are required" }); return; }
    const [pc] = await db.insert(phaseChangesTable).values({
      behaviorTargetId, changeDate, label, notes: notes || null,
    }).returning();
    logAudit(req, {
      action: "create",
      targetTable: "phase_changes",
      targetId: pc.id,
      summary: `Created phase change #${pc.id} for behavior target #${behaviorTargetId}`,
      newValues: { changeDate, label, notes } as Record<string, unknown>,
    });
    res.status(201).json({ ...pc, createdAt: pc.createdAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to create phase change" });
  }
});

router.patch("/phase-changes/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (!(await assertPhaseChangeInCallerDistrict(req as AuthedRequest, id, res))) return;
    const [existing] = await db.select().from(phaseChangesTable).where(eq(phaseChangesTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const updates: Record<string, unknown> = {};
    for (const key of ["changeDate", "label", "notes"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [updated] = await db.update(phaseChangesTable).set(updates).where(eq(phaseChangesTable.id, id)).returning();
    logAudit(req, {
      action: "update",
      targetTable: "phase_changes",
      targetId: id,
      summary: `Updated phase change #${id}`,
      oldValues: { changeDate: existing.changeDate, label: existing.label, notes: existing.notes } as Record<string, unknown>,
      newValues: updates,
    });
    res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to update phase change" });
  }
});

router.delete("/phase-changes/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (!(await assertPhaseChangeInCallerDistrict(req as AuthedRequest, id, res))) return;
    const [existing] = await db.select().from(phaseChangesTable).where(eq(phaseChangesTable.id, id));
    await db.delete(phaseChangesTable).where(eq(phaseChangesTable.id, id));
    if (existing) {
      logAudit(req, {
        action: "delete",
        targetTable: "phase_changes",
        targetId: id,
        summary: `Deleted phase change #${id}`,
        oldValues: { changeDate: existing.changeDate, label: existing.label, notes: existing.notes } as Record<string, unknown>,
      });
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to delete phase change" });
  }
});

router.get("/students/:studentId/phase-changes", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, studentId, res))) return;
    const targets = await db.select({ id: behaviorTargetsTable.id })
      .from(behaviorTargetsTable)
      .where(eq(behaviorTargetsTable.studentId, studentId));
    const targetIds = targets.map(t => t.id);
    if (targetIds.length === 0) { res.json({}); return; }

    const rows = await db.select().from(phaseChangesTable)
      .where(sql`${phaseChangesTable.behaviorTargetId} IN (${sql.join(targetIds.map(id => sql`${id}`), sql`, `)})`)
      .orderBy(asc(phaseChangesTable.changeDate));

    const byTarget: Record<number, any[]> = {};
    for (const r of rows) {
      if (!byTarget[r.behaviorTargetId]) byTarget[r.behaviorTargetId] = [];
      byTarget[r.behaviorTargetId].push({ ...r, createdAt: r.createdAt.toISOString() });
    }
    res.json(byTarget);
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch phase changes" });
  }
});

router.get("/students/:studentId/ioa-summary", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, studentId, res))) return;
    const { from, to, behaviorTargetId } = req.query;

    const conditions = [
      eq(dataSessionsTable.studentId, studentId),
      isNotNull(behaviorDataTable.ioaSessionId),
    ];
    if (from) conditions.push(gte(dataSessionsTable.sessionDate, from as string));
    if (to) conditions.push(lte(dataSessionsTable.sessionDate, to as string));
    if (behaviorTargetId) conditions.push(eq(behaviorDataTable.behaviorTargetId, parseInt(behaviorTargetId as string)));

    const rows = await db.select({
      behaviorTargetId: behaviorDataTable.behaviorTargetId,
      targetName: behaviorTargetsTable.name,
      measurementType: behaviorTargetsTable.measurementType,
      ioaSessionId: behaviorDataTable.ioaSessionId,
      observerNumber: behaviorDataTable.observerNumber,
      observerName: behaviorDataTable.observerName,
      value: behaviorDataTable.value,
      intervalCount: behaviorDataTable.intervalCount,
      intervalsWith: behaviorDataTable.intervalsWith,
      intervalScores: behaviorDataTable.intervalScores,
      eventTimestamps: behaviorDataTable.eventTimestamps,
      sessionDate: dataSessionsTable.sessionDate,
    }).from(behaviorDataTable)
      .innerJoin(dataSessionsTable, eq(behaviorDataTable.dataSessionId, dataSessionsTable.id))
      .innerJoin(behaviorTargetsTable, eq(behaviorDataTable.behaviorTargetId, behaviorTargetsTable.id))
      .where(and(...conditions))
      .orderBy(asc(dataSessionsTable.sessionDate));

    const grouped: Record<string, any[]> = {};
    for (const r of rows) {
      const key = `${r.behaviorTargetId}-${r.ioaSessionId}-${r.sessionDate}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(r);
    }

    const ioaResults: Array<{
      behaviorTargetId: number;
      targetName: string;
      ioaSessionId: number;
      sessionDate: string;
      observer1Value: number;
      observer2Value: number;
      observer1Name: string;
      observer2Name: string;
      agreementPercent: number;
      measurementType: string;
      ioaMethod: string;
      dataQuality: "point_by_point" | "aggregate_fallback";
    }> = [];

    for (const [, observations] of Object.entries(grouped)) {
      if (observations.length < 2) continue;
      const obs1 = observations.find((o: any) => o.observerNumber === 1);
      const obs2 = observations.find((o: any) => o.observerNumber === 2);
      if (!obs1 || !obs2) continue;

      let agreement = 0;
      const v1 = parseFloat(obs1.value);
      const v2 = parseFloat(obs2.value);
      const mt = obs1.measurementType;
      let ioaMethod = "total_count";
      let dataQuality: "point_by_point" | "aggregate_fallback" = "aggregate_fallback";

      if (mt === "frequency") {
        const ts1 = obs1.eventTimestamps as number[] | null;
        const ts2 = obs2.eventTimestamps as number[] | null;
        if (ts1 && ts2 && ts1.length > 0 && ts2.length > 0) {
          const windowMs = 2000;
          const matched2 = new Set<number>();
          let agreements = 0;
          for (const t1 of ts1) {
            for (let j = 0; j < ts2.length; j++) {
              if (!matched2.has(j) && Math.abs(t1 - ts2[j]) <= windowMs) {
                agreements++;
                matched2.add(j);
                break;
              }
            }
          }
          const totalEvents = Math.max(ts1.length, ts2.length);
          agreement = totalEvents > 0 ? Math.round((agreements / totalEvents) * 100) : 100;
          ioaMethod = "point_by_point";
          dataQuality = "point_by_point";
        } else {
          const smaller = Math.min(v1, v2);
          const larger = Math.max(v1, v2);
          agreement = larger > 0 ? Math.round((smaller / larger) * 100) : (v1 === v2 ? 100 : 0);
          ioaMethod = "total_count";
          dataQuality = "aggregate_fallback";
        }
      } else if (mt === "interval") {
        const scores1 = obs1.intervalScores as boolean[] | null;
        const scores2 = obs2.intervalScores as boolean[] | null;
        if (scores1 && scores2 && scores1.length > 0 && scores2.length > 0) {
          const len = Math.max(scores1.length, scores2.length);
          let agreements = 0;
          for (let i = 0; i < len; i++) {
            const s1 = i < scores1.length ? scores1[i] : false;
            const s2 = i < scores2.length ? scores2[i] : false;
            if (s1 === s2) agreements++;
          }
          agreement = Math.round((agreements / len) * 100);
          ioaMethod = "interval_by_interval";
          dataQuality = "point_by_point";
        } else if (obs1.intervalCount && obs2.intervalCount && obs1.intervalsWith != null && obs2.intervalsWith != null) {
          const totalIntervals = Math.max(obs1.intervalCount, obs2.intervalCount);
          const obs1Without = obs1.intervalCount - (obs1.intervalsWith ?? 0);
          const obs2Without = obs2.intervalCount - (obs2.intervalsWith ?? 0);
          const agreedPresent = Math.min(obs1.intervalsWith, obs2.intervalsWith);
          const agreedAbsent = Math.min(obs1Without, obs2Without);
          const totalAgreements = agreedPresent + agreedAbsent;
          agreement = totalIntervals > 0 ? Math.round((totalAgreements / totalIntervals) * 100) : 0;
          ioaMethod = "interval_by_interval";
          dataQuality = "aggregate_fallback";
        } else {
          const smaller = Math.min(v1, v2);
          const larger = Math.max(v1, v2);
          agreement = larger > 0 ? Math.round((smaller / larger) * 100) : (v1 === v2 ? 100 : 0);
          ioaMethod = "total_count";
          dataQuality = "aggregate_fallback";
        }
      } else if (mt === "duration") {
        agreement = v1 === v2 ? 100 : 0;
        ioaMethod = "exact_agreement";
        dataQuality = "point_by_point";
      } else {
        agreement = v1 === v2 ? 100 : 0;
        ioaMethod = "exact_agreement";
        dataQuality = "point_by_point";
      }

      ioaResults.push({
        behaviorTargetId: obs1.behaviorTargetId,
        targetName: obs1.targetName,
        ioaSessionId: obs1.ioaSessionId!,
        sessionDate: obs1.sessionDate,
        observer1Value: v1,
        observer2Value: v2,
        observer1Name: obs1.observerName || "Observer 1",
        observer2Name: obs2.observerName || "Observer 2",
        agreementPercent: Math.max(0, Math.min(100, agreement)),
        measurementType: mt,
        ioaMethod,
        dataQuality,
      });
    }

    const byTarget: Record<number, { targetName: string; sessions: typeof ioaResults; averageAgreement: number; meetsThreshold: boolean }> = {};
    for (const r of ioaResults) {
      if (!byTarget[r.behaviorTargetId]) {
        byTarget[r.behaviorTargetId] = { targetName: r.targetName, sessions: [], averageAgreement: 0, meetsThreshold: false };
      }
      byTarget[r.behaviorTargetId].sessions.push(r);
    }
    for (const [, data] of Object.entries(byTarget)) {
      const avg = data.sessions.length > 0
        ? Math.round(data.sessions.reduce((s, d) => s + d.agreementPercent, 0) / data.sessions.length)
        : 0;
      data.averageAgreement = avg;
      data.meetsThreshold = avg >= 80;
    }

    res.json(byTarget);
  } catch (e: any) {
    console.error("GET IOA summary error:", e);
    res.status(500).json({ error: "Failed to fetch IOA summary" });
  }
});

/* ── Task Analysis Step Trends ──────────────────────────────────────────── */

router.get("/program-targets/:targetId/step-trends", async (req, res): Promise<void> => {
  try {
    const targetId = parseInt(req.params.targetId);
    if (!(await assertProgramTargetInCallerDistrict(req as AuthedRequest, targetId, res))) return;

    const [steps, dataRows] = await Promise.all([
      db.select({
        stepNumber: programStepsTable.stepNumber,
        name: programStepsTable.name,
        sdInstruction: programStepsTable.sdInstruction,
        mastered: programStepsTable.mastered,
        active: programStepsTable.active,
      }).from(programStepsTable)
        .where(eq(programStepsTable.programTargetId, targetId))
        .orderBy(asc(programStepsTable.stepNumber)),

      db.select({
        sessionDate: dataSessionsTable.sessionDate,
        stepNumber: programDataTable.stepNumber,
        trialsCorrect: programDataTable.trialsCorrect,
        trialsTotal: programDataTable.trialsTotal,
        prompted: programDataTable.prompted,
        percentCorrect: programDataTable.percentCorrect,
        promptLevelUsed: programDataTable.promptLevelUsed,
      }).from(programDataTable)
        .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
        .where(and(
          eq(programDataTable.programTargetId, targetId),
          isNotNull(programDataTable.stepNumber),
        ))
        .orderBy(asc(dataSessionsTable.sessionDate)),
    ]);

    res.json({ steps, trends: dataRows });
  } catch (e: any) {
    console.error("GET step-trends error:", e);
    res.status(500).json({ error: "Failed to fetch step trends" });
  }
});

/* ── Protocol Modification Markers ──────────────────────────────────────── */

const VALID_MARKER_TYPES = [
  "prompt_hierarchy", "operational_definition",
  "reinforcement_schedule", "treatment_protocol", "custom",
];

router.get("/behavior-targets/:targetId/modification-markers", async (req, res): Promise<void> => {
  try {
    const targetId = parseInt(req.params.targetId);
    if (!(await assertBehaviorTargetInCallerDistrict(req as AuthedRequest, targetId, res))) return;
    const rows = await db.select().from(protocolModificationMarkersTable)
      .where(eq(protocolModificationMarkersTable.behaviorTargetId, targetId))
      .orderBy(asc(protocolModificationMarkersTable.markerDate));
    res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Failed to fetch modification markers" });
  }
});

router.post("/behavior-targets/:targetId/modification-markers", async (req, res): Promise<void> => {
  try {
    const behaviorTargetId = parseInt(req.params.targetId);
    if (!(await assertBehaviorTargetInCallerDistrict(req as AuthedRequest, behaviorTargetId, res))) return;
    const { markerDate, markerType, label, notes } = req.body;
    if (!markerDate || !label) { res.status(400).json({ error: "markerDate and label are required" }); return; }
    const resolvedType = VALID_MARKER_TYPES.includes(markerType) ? markerType : "custom";
    const [row] = await db.insert(protocolModificationMarkersTable).values({
      behaviorTargetId, markerDate, markerType: resolvedType, label, notes: notes || null,
    }).returning();
    logAudit(req, {
      action: "create", targetTable: "protocol_modification_markers", targetId: row.id,
      summary: `Created modification marker #${row.id} (${resolvedType}) for behavior target #${behaviorTargetId}`,
      newValues: { markerDate, markerType: resolvedType, label, notes } as Record<string, unknown>,
    });
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Failed to create modification marker" });
  }
});

router.get("/program-targets/:targetId/modification-markers", async (req, res): Promise<void> => {
  try {
    const targetId = parseInt(req.params.targetId);
    if (!(await assertProgramTargetInCallerDistrict(req as AuthedRequest, targetId, res))) return;
    const rows = await db.select().from(protocolModificationMarkersTable)
      .where(eq(protocolModificationMarkersTable.programTargetId, targetId))
      .orderBy(asc(protocolModificationMarkersTable.markerDate));
    res.json(rows.map(r => ({ ...r, createdAt: r.createdAt.toISOString() })));
  } catch {
    res.status(500).json({ error: "Failed to fetch modification markers" });
  }
});

router.post("/program-targets/:targetId/modification-markers", async (req, res): Promise<void> => {
  try {
    const programTargetId = parseInt(req.params.targetId);
    if (!(await assertProgramTargetInCallerDistrict(req as AuthedRequest, programTargetId, res))) return;
    const { markerDate, markerType, label, notes } = req.body;
    if (!markerDate || !label) { res.status(400).json({ error: "markerDate and label are required" }); return; }
    const resolvedType = VALID_MARKER_TYPES.includes(markerType) ? markerType : "custom";
    const [row] = await db.insert(protocolModificationMarkersTable).values({
      programTargetId, markerDate, markerType: resolvedType, label, notes: notes || null,
    }).returning();
    logAudit(req, {
      action: "create", targetTable: "protocol_modification_markers", targetId: row.id,
      summary: `Created modification marker #${row.id} (${resolvedType}) for program target #${programTargetId}`,
      newValues: { markerDate, markerType: resolvedType, label, notes } as Record<string, unknown>,
    });
    res.status(201).json({ ...row, createdAt: row.createdAt.toISOString() });
  } catch {
    res.status(500).json({ error: "Failed to create modification marker" });
  }
});

router.delete("/modification-markers/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) { res.status(404).json({ error: "Not found" }); return; }
    const [existing] = await db.select().from(protocolModificationMarkersTable)
      .where(eq(protocolModificationMarkersTable.id, id));
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.behaviorTargetId) {
      if (!(await assertBehaviorTargetInCallerDistrict(req as AuthedRequest, existing.behaviorTargetId, res))) return;
    } else if (existing.programTargetId) {
      if (!(await assertProgramTargetInCallerDistrict(req as AuthedRequest, existing.programTargetId, res))) return;
    }
    await db.delete(protocolModificationMarkersTable).where(eq(protocolModificationMarkersTable.id, id));
    logAudit(req, {
      action: "delete", targetTable: "protocol_modification_markers", targetId: id,
      summary: `Deleted modification marker #${id}`,
      oldValues: { markerDate: existing.markerDate, markerType: existing.markerType, label: existing.label } as Record<string, unknown>,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete modification marker" });
  }
});

export default router;
