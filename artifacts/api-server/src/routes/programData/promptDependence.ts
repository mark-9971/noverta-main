// tenant-scope: district-join
import { Router, type IRouter } from "express";
import { db, programTargetsTable, programDataTable, dataSessionsTable, studentsTable, schoolsTable } from "@workspace/db";
import { eq, and, gte, asc, sql } from "drizzle-orm";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

const STANDARD_HIERARCHY = [
  "full_physical",
  "partial_physical",
  "model",
  "gestural",
  "verbal",
  "independent",
] as const;

type FadingDirection = "independent" | "improving" | "stalled" | "regressing" | "insufficient_data";

function hierarchyIndex(level: string | null, hierarchy: string[]): number {
  if (!level) return -1;
  const idx = hierarchy.indexOf(level);
  if (idx >= 0) return idx;
  return STANDARD_HIERARCHY.indexOf(level as (typeof STANDARD_HIERARCHY)[number]);
}

function classifyFading(
  sessionLevels: string[],
  hierarchy: string[],
): FadingDirection {
  const indexed = sessionLevels
    .map(l => hierarchyIndex(l, hierarchy))
    .filter(i => i >= 0);

  if (indexed.length === 0) return "insufficient_data";

  const latest = indexed[indexed.length - 1];
  if (latest === hierarchy.length - 1 || hierarchy[latest] === "independent")
    return "independent";

  if (indexed.length < 3) return "insufficient_data";

  const half = Math.floor(indexed.length / 2);
  const firstHalf = indexed.slice(0, half);
  const secondHalf = indexed.slice(indexed.length - half);

  const avgFirst = firstHalf.reduce((a, v) => a + v, 0) / firstHalf.length;
  const avgLast = secondHalf.reduce((a, v) => a + v, 0) / secondHalf.length;

  const delta = avgLast - avgFirst;
  if (delta > 0.4) return "improving";
  if (delta < -0.4) return "regressing";
  return "stalled";
}

function computePromptDependenceRate(
  rows: { prompted: number | null; trialsTotal: number; promptLevelUsed: string | null }[],
  hierarchy: string[],
): number | null {
  const rates: number[] = [];
  for (const r of rows) {
    const total = r.trialsTotal ?? 0;
    if (total <= 0) continue;
    if (r.prompted !== null && r.prompted >= 0) {
      rates.push(r.prompted / total);
    } else if (r.promptLevelUsed) {
      const idx = hierarchyIndex(r.promptLevelUsed, hierarchy);
      const maxIdx = hierarchy.length - 1;
      rates.push(idx < 0 ? 1 : idx === maxIdx ? 0 : 1 - idx / maxIdx);
    }
  }
  if (rates.length === 0) return null;
  return Math.round((rates.reduce((a, v) => a + v, 0) / rates.length) * 100);
}

function stalledFor(sessionLevels: string[], hierarchy: string[]): number {
  if (sessionLevels.length === 0) return 0;
  const latestLevel = sessionLevels[sessionLevels.length - 1];
  if (!latestLevel || latestLevel === "independent") return 0;
  let count = 0;
  for (let i = sessionLevels.length - 1; i >= 0; i--) {
    if (sessionLevels[i] === latestLevel) count++;
    else break;
  }
  return count;
}

/**
 * GET /api/aba/prompt-dependence
 *
 * Returns per-target prompt fading analytics across all active students in the
 * caller's district.  Requires the same tier gate as caseload-analytics.
 */
router.get("/aba/prompt-dependence", async (req, res): Promise<void> => {
  try {
    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    if (!districtId) { res.status(403).json({ error: "No district scope" }); return; }

    const windowDays = Math.min(180, Math.max(14, parseInt((req.query.days as string) || "90")));
    const since = new Date();
    since.setDate(since.getDate() - windowDays);
    const sinceStr = since.toISOString().slice(0, 10);

    // Fetch raw session-level prompt data for all active targets in the district
    const rows = await db
      .select({
        studentId: dataSessionsTable.studentId,
        studentFirst: studentsTable.firstName,
        studentLast: studentsTable.lastName,
        targetId: programDataTable.programTargetId,
        targetName: programTargetsTable.name,
        domain: programTargetsTable.domain,
        programType: programTargetsTable.programType,
        phase: programTargetsTable.phase,
        promptHierarchy: programTargetsTable.promptHierarchy,
        currentPromptLevelRecord: programTargetsTable.currentPromptLevel,
        sessionDate: dataSessionsTable.sessionDate,
        prompted: programDataTable.prompted,
        trialsTotal: programDataTable.trialsTotal,
        promptLevelUsed: programDataTable.promptLevelUsed,
      })
      .from(programDataTable)
      .innerJoin(dataSessionsTable, eq(programDataTable.dataSessionId, dataSessionsTable.id))
      .innerJoin(programTargetsTable, eq(programDataTable.programTargetId, programTargetsTable.id))
      .innerJoin(studentsTable, eq(dataSessionsTable.studentId, studentsTable.id))
      .innerJoin(schoolsTable, eq(studentsTable.schoolId, schoolsTable.id))
      .where(
        and(
          eq(schoolsTable.districtId, districtId),
          eq(studentsTable.status, "active"),
          eq(programTargetsTable.active, true),
          gte(dataSessionsTable.sessionDate, sinceStr),
          sql`${programDataTable.promptLevelUsed} IS NOT NULL OR (${programDataTable.prompted} IS NOT NULL AND ${programDataTable.trialsTotal} > 0)`,
        )
      )
      .orderBy(
        asc(programDataTable.programTargetId),
        asc(dataSessionsTable.sessionDate),
      );

    // Group by target
    const byTarget = new Map<
      number,
      {
        studentId: number;
        studentName: string;
        targetId: number;
        targetName: string;
        domain: string | null;
        programType: string;
        phase: string;
        hierarchy: string[];
        currentPromptLevelRecord: string | null;
        sessions: {
          date: string;
          promptLevelUsed: string | null;
          prompted: number | null;
          trialsTotal: number;
        }[];
      }
    >();

    for (const r of rows) {
      if (!byTarget.has(r.targetId)) {
        byTarget.set(r.targetId, {
          studentId: r.studentId,
          studentName: `${r.studentFirst} ${r.studentLast}`,
          targetId: r.targetId,
          targetName: r.targetName,
          domain: r.domain,
          programType: r.programType,
          phase: r.phase,
          hierarchy: (r.promptHierarchy as string[] | null) ?? [...STANDARD_HIERARCHY],
          currentPromptLevelRecord: r.currentPromptLevelRecord,
          sessions: [],
        });
      }
      byTarget.get(r.targetId)!.sessions.push({
        date: r.sessionDate,
        promptLevelUsed: r.promptLevelUsed,
        prompted: r.prompted,
        trialsTotal: r.trialsTotal ?? 0,
      });
    }

    // Compute metrics
    const targets = Array.from(byTarget.values()).map(t => {
      const sessionLevels = t.sessions
        .map(s => s.promptLevelUsed)
        .filter((l): l is string => !!l);

      const currentLevel =
        sessionLevels.length > 0 ? sessionLevels[sessionLevels.length - 1] : t.currentPromptLevelRecord;

      const hIdx = hierarchyIndex(currentLevel, t.hierarchy);
      const isFullyIndependent =
        currentLevel === "independent" || hIdx === t.hierarchy.length - 1;

      const fadingDirection = classifyFading(sessionLevels, t.hierarchy);
      const consecutiveStall = stalledFor(sessionLevels, t.hierarchy);
      const isStalled = consecutiveStall >= 5 && !isFullyIndependent;

      const dependenceRate = computePromptDependenceRate(t.sessions, t.hierarchy);

      return {
        studentId: t.studentId,
        studentName: t.studentName,
        targetId: t.targetId,
        targetName: t.targetName,
        domain: t.domain,
        programType: t.programType,
        phase: t.phase,
        currentPromptLevel: currentLevel,
        hierarchyIndex: hIdx,
        hierarchyLength: t.hierarchy.length,
        promptDependenceRate: dependenceRate,
        fadingDirection,
        isStalled,
        stalledFor: consecutiveStall,
        sessionCount: t.sessions.length,
        lastSessionDate: t.sessions[t.sessions.length - 1]?.date ?? null,
      };
    });

    // Summary counts
    const summary = {
      totalTargets: targets.length,
      independent: targets.filter(t => t.fadingDirection === "independent").length,
      improving: targets.filter(t => t.fadingDirection === "improving").length,
      stalled: targets.filter(t => t.isStalled || t.fadingDirection === "stalled").length,
      regressing: targets.filter(t => t.fadingDirection === "regressing").length,
      insufficientData: targets.filter(t => t.fadingDirection === "insufficient_data").length,
    };

    res.json({ summary, targets, windowDays });
  } catch (e: any) {
    console.error("GET prompt-dependence error:", e);
    res.status(500).json({ error: "Failed to fetch prompt dependence data" });
  }
});

/* ─────────────────────────────────────────────────────────────
 * Task 3 — Prompt Fading Timeline (per-target session history)
 * GET /api/program-targets/:id/prompt-history
 * Returns each unique (sessionDate, promptLevelUsed) pair for
 * the given program target, sorted chronologically.
 * ───────────────────────────────────────────────────────────── */
router.get("/program-targets/:id/prompt-history", async (req, res): Promise<void> => {
  try {
    const targetId = parseInt(req.params.id as string, 10);
    if (isNaN(targetId)) { res.status(400).json({ error: "Invalid target id" }); return; }

    const rows = await db.select({
      sessionDate: dataSessionsTable.sessionDate,
      promptLevelUsed: programDataTable.promptLevelUsed,
      trials: sql<number>`cast(count(*) as int)`,
      promptedCount: sql<number>`cast(sum(case when ${programDataTable.prompted} = true then 1 else 0 end) as int)`,
    })
      .from(programDataTable)
      .innerJoin(dataSessionsTable, eq(dataSessionsTable.id, programDataTable.dataSessionId))
      .where(
        and(
          eq(programDataTable.programTargetId, targetId),
          sql`${programDataTable.promptLevelUsed} IS NOT NULL`,
        )
      )
      .groupBy(dataSessionsTable.sessionDate, programDataTable.promptLevelUsed)
      .orderBy(asc(dataSessionsTable.sessionDate), asc(programDataTable.promptLevelUsed));

    const byDate: Record<string, { sessionDate: string; promptLevelUsed: string; trials: number; hierarchyIndex: number }[]> = {};
    for (const r of rows) {
      if (!r.promptLevelUsed) continue;
      const key = r.sessionDate;
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push({
        sessionDate: r.sessionDate,
        promptLevelUsed: r.promptLevelUsed,
        trials: r.trials,
        hierarchyIndex: STANDARD_HIERARCHY.indexOf(r.promptLevelUsed as any),
      });
    }

    const timeline = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, levels]) => {
        const dominant = levels.sort((a, b) => b.trials - a.trials)[0];
        return {
          sessionDate: date,
          promptLevelUsed: dominant.promptLevelUsed,
          hierarchyIndex: dominant.hierarchyIndex >= 0 ? dominant.hierarchyIndex : STANDARD_HIERARCHY.length - 1,
          trials: levels.reduce((s, l) => s + l.trials, 0),
          levels,
        };
      });

    res.json({ timeline, hierarchy: STANDARD_HIERARCHY });
  } catch (e: any) {
    console.error("GET prompt-history error:", e);
    res.status(500).json({ error: "Failed to fetch prompt history" });
  }
});

export default router;
