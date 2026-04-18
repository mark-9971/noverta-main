// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  studentsTable, dataSessionsTable, restraintIncidentsTable, phaseChangesTable,
} from "@workspace/db";
import { eq, and, count, sql, desc, isNotNull } from "drizzle-orm";

const router: IRouter = Router();

router.get("/analytics/pm-overview", async (_req, res): Promise<void> => {
  try {
    const [totalRow] = await db.select({ total: count() }).from(restraintIncidentsTable);
    const [injuryRow] = await db.select({ injuries: count() }).from(restraintIncidentsTable)
      .where(sql`${restraintIncidentsTable.studentInjury} = TRUE OR ${restraintIncidentsTable.staffInjury} = TRUE`);
    const [medicalRow] = await db.select({ medical: count() }).from(restraintIncidentsTable)
      .where(eq(restraintIncidentsTable.medicalAttentionRequired, true));
    const [deseRow] = await db.select({ pending: count() }).from(restraintIncidentsTable)
      .where(and(eq(restraintIncidentsTable.deseReportRequired, true), sql`${restraintIncidentsTable.deseReportSentAt} IS NULL`));
    const [pendingRow] = await db.select({ pending: count() }).from(restraintIncidentsTable)
      .where(eq(restraintIncidentsTable.status, "pending_review"));
    const [avgDurRow] = await db.select({
      avg: sql<number>`ROUND(AVG(${restraintIncidentsTable.durationMinutes}))`,
    }).from(restraintIncidentsTable).where(isNotNull(restraintIncidentsTable.durationMinutes));

    const studentsAffected = await db
      .selectDistinct({ studentId: restraintIncidentsTable.studentId })
      .from(restraintIncidentsTable);

    const byType = await db
      .select({ type: restraintIncidentsTable.incidentType, cnt: count() })
      .from(restraintIncidentsTable)
      .groupBy(restraintIncidentsTable.incidentType)
      .orderBy(desc(count()));

    const monthlyTrend = await db
      .select({
        month: sql<string>`TO_CHAR(${restraintIncidentsTable.incidentDate}::date, 'YYYY-MM')`,
        type: restraintIncidentsTable.incidentType,
        cnt: count(),
      })
      .from(restraintIncidentsTable)
      .groupBy(sql`TO_CHAR(${restraintIncidentsTable.incidentDate}::date, 'YYYY-MM')`, restraintIncidentsTable.incidentType)
      .orderBy(sql`TO_CHAR(${restraintIncidentsTable.incidentDate}::date, 'YYYY-MM')`);

    const monthlyAgg: Record<string, Record<string, number>> = {};
    for (const row of monthlyTrend) {
      if (!monthlyAgg[row.month]) monthlyAgg[row.month] = {};
      monthlyAgg[row.month][row.type] = row.cnt;
    }
    const monthlyTrendFormatted = Object.entries(monthlyAgg)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, types]) => ({ month, ...types, total: Object.values(types).reduce((s, v) => s + v, 0) }));

    const bipRow = await db.select({ count: count() }).from(restraintIncidentsTable).where(eq(restraintIncidentsTable.bipInPlace, true));
    const debriefRow = await db.select({ count: count() }).from(restraintIncidentsTable).where(eq(restraintIncidentsTable.debriefConducted, true));

    res.json({
      totalIncidents: totalRow.total,
      studentsAffected: studentsAffected.length,
      injuryCount: injuryRow.injuries,
      injuryRate: totalRow.total > 0 ? Math.round((injuryRow.injuries / totalRow.total) * 100) : 0,
      medicalCount: medicalRow.medical,
      desePending: deseRow.pending,
      pendingReview: pendingRow.pending,
      avgDurationMinutes: avgDurRow.avg ?? 0,
      bipRate: totalRow.total > 0 ? Math.round((bipRow[0].count / totalRow.total) * 100) : 0,
      debriefRate: totalRow.total > 0 ? Math.round((debriefRow[0].count / totalRow.total) * 100) : 0,
      byType: byType.map(r => ({ type: r.type, count: r.cnt })),
      monthlyTrend: monthlyTrendFormatted,
    });
  } catch (e: any) {
    console.error("pm-overview error:", e);
    res.status(500).json({ error: "Failed to fetch PM overview" });
  }
});

router.get("/analytics/pm-by-student", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        studentId: restraintIncidentsTable.studentId,
        firstName: studentsTable.firstName,
        lastName: studentsTable.lastName,
        grade: studentsTable.grade,
        total: count(),
        injuries: sql<number>`SUM(CASE WHEN ${restraintIncidentsTable.studentInjury} = TRUE OR ${restraintIncidentsTable.staffInjury} = TRUE THEN 1 ELSE 0 END)`,
        physical: sql<number>`SUM(CASE WHEN ${restraintIncidentsTable.incidentType} = 'physical_restraint' THEN 1 ELSE 0 END)`,
        seclusion: sql<number>`SUM(CASE WHEN ${restraintIncidentsTable.incidentType} = 'seclusion' THEN 1 ELSE 0 END)`,
        avgDuration: sql<number>`ROUND(AVG(${restraintIncidentsTable.durationMinutes}))`,
        lastIncident: sql<string>`MAX(${restraintIncidentsTable.incidentDate})`,
      })
      .from(restraintIncidentsTable)
      .leftJoin(studentsTable, eq(restraintIncidentsTable.studentId, studentsTable.id))
      .groupBy(restraintIncidentsTable.studentId, studentsTable.firstName, studentsTable.lastName, studentsTable.grade)
      .orderBy(desc(count()));

    res.json(rows);
  } catch (e: any) {
    console.error("pm-by-student error:", e);
    res.status(500).json({ error: "Failed to fetch PM by student" });
  }
});

router.get("/analytics/pm-antecedents", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        category: restraintIncidentsTable.antecedentCategory,
        count: count(),
        injuries: sql<number>`SUM(CASE WHEN ${restraintIncidentsTable.studentInjury} = TRUE THEN 1 ELSE 0 END)`,
        avgDuration: sql<number>`ROUND(AVG(${restraintIncidentsTable.durationMinutes}))`,
      })
      .from(restraintIncidentsTable)
      .where(isNotNull(restraintIncidentsTable.antecedentCategory))
      .groupBy(restraintIncidentsTable.antecedentCategory)
      .orderBy(desc(count()));

    const total = rows.reduce((s, r) => s + r.count, 0);
    res.json(rows.map(r => ({
      category: r.category,
      count: r.count,
      percentage: total > 0 ? Math.round((r.count / total) * 100) : 0,
      injuries: r.injuries,
      avgDuration: r.avgDuration,
    })));
  } catch (e: any) {
    console.error("pm-antecedents error:", e);
    res.status(500).json({ error: "Failed to fetch PM antecedents" });
  }
});

router.get("/analytics/pm-episode-ratio", async (_req, res): Promise<void> => {
  try {
    const [behaviorSessions] = await db.select({ total: count() }).from(dataSessionsTable);
    const [pmTotal] = await db.select({ total: count() }).from(restraintIncidentsTable);
    const [physicalTotal] = await db.select({ total: count() })
      .from(restraintIncidentsTable)
      .where(eq(restraintIncidentsTable.incidentType, "physical_restraint"));

    const ratio = behaviorSessions.total > 0
      ? Math.round((pmTotal.total / behaviorSessions.total) * 1000) / 10
      : 0;

    const studentEpisodeCounts = await db
      .select({
        studentId: dataSessionsTable.studentId,
        sessions: count(),
      })
      .from(dataSessionsTable)
      .groupBy(dataSessionsTable.studentId);

    const studentPmCounts = await db
      .select({
        studentId: restraintIncidentsTable.studentId,
        incidents: count(),
      })
      .from(restraintIncidentsTable)
      .groupBy(restraintIncidentsTable.studentId);

    const pmMap = new Map(studentPmCounts.map(r => [r.studentId, r.incidents]));

    const perStudent = studentEpisodeCounts
      .filter(r => pmMap.has(r.studentId))
      .map(r => {
        const incidents = pmMap.get(r.studentId) ?? 0;
        return {
          studentId: r.studentId,
          sessions: r.sessions,
          incidents,
          ratio: r.sessions > 0 ? Math.round((incidents / r.sessions) * 1000) / 10 : 0,
        };
      })
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 10);

    res.json({
      totalBehaviorSessions: behaviorSessions.total,
      totalPmIncidents: pmTotal.total,
      totalPhysicalRestraints: physicalTotal.total,
      episodeToPmRatio: ratio,
      perStudent,
    });
  } catch (e: any) {
    console.error("pm-episode-ratio error:", e);
    res.status(500).json({ error: "Failed to fetch PM episode ratio" });
  }
});

router.get("/analytics/pm-phase-trends", async (req, res): Promise<void> => {
  try {
    const studentId = req.query.studentId ? Number(req.query.studentId) : undefined;

    const phases = await db
      .select({
        id: phaseChangesTable.id,
        studentId: phaseChangesTable.studentId,
        targetId: phaseChangesTable.targetId,
        changeDate: phaseChangesTable.changeDate,
        fromPhase: phaseChangesTable.fromPhase,
        toPhase: phaseChangesTable.toPhase,
        reason: phaseChangesTable.reason,
      })
      .from(phaseChangesTable)
      .where(studentId ? eq(phaseChangesTable.studentId, studentId) : undefined)
      .orderBy(phaseChangesTable.studentId, phaseChangesTable.changeDate);

    const incidents = await db
      .select({
        studentId: restraintIncidentsTable.studentId,
        incidentDate: restraintIncidentsTable.incidentDate,
        incidentType: restraintIncidentsTable.incidentType,
        studentInjury: restraintIncidentsTable.studentInjury,
      })
      .from(restraintIncidentsTable)
      .where(studentId ? eq(restraintIncidentsTable.studentId, studentId) : undefined)
      .orderBy(restraintIncidentsTable.studentId, restraintIncidentsTable.incidentDate);

    const byStudent: Record<number, { phases: typeof phases; incidents: typeof incidents }> = {};
    for (const p of phases) {
      if (p.studentId == null) continue;
      if (!byStudent[p.studentId]) byStudent[p.studentId] = { phases: [], incidents: [] };
      byStudent[p.studentId].phases.push(p);
    }
    for (const inc of incidents) {
      if (inc.studentId == null) continue;
      if (!byStudent[inc.studentId]) byStudent[inc.studentId] = { phases: [], incidents: [] };
      byStudent[inc.studentId].incidents.push(inc);
    }

    const results = Object.entries(byStudent).map(([sid, data]) => {
      const sortedPhases = data.phases.sort((a, b) => a.changeDate.localeCompare(b.changeDate));
      const analysis = sortedPhases.map((phase, idx) => {
        const start = phase.changeDate;
        const end = sortedPhases[idx + 1]?.changeDate ?? "2099-01-01";
        const phaseBefore = idx > 0 ? {
          start: sortedPhases[idx - 1].changeDate,
          end: start,
          count: data.incidents.filter(i => i.incidentDate >= sortedPhases[idx - 1].changeDate && i.incidentDate < start).length,
        } : null;
        const phaseAfter = {
          start, end,
          count: data.incidents.filter(i => i.incidentDate >= start && i.incidentDate < end).length,
        };
        return { phase: phase.toPhase, changeDate: start, before: phaseBefore, after: phaseAfter };
      });
      return { studentId: Number(sid), phases: analysis };
    });

    res.json(results);
  } catch (e: any) {
    console.error("pm-phase-trends error:", e);
    res.status(500).json({ error: "Failed to fetch PM phase trends" });
  }
});

export default router;
