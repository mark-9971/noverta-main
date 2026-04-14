import { db } from "@workspace/db";
import {
  alertsTable,
  scheduleBlocksTable,
  compensatoryObligationsTable,
  sessionLogsTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "./minuteCalc";
import { logger } from "./logger";

export async function runComplianceChecks(): Promise<{ newAlerts: number; resolvedAlerts: number }> {
  logger.info("Running compliance checks");

  const allProgress = await computeAllActiveMinuteProgress();

  const alertsToCreate: Array<{
    type: string;
    severity: string;
    studentId?: number;
    staffId?: number;
    serviceRequirementId?: number;
    message: string;
    suggestedAction?: string;
  }> = [];

  for (const p of allProgress) {
    if (p.riskStatus === "out_of_compliance") {
      alertsToCreate.push({
        type: "behind_on_minutes",
        severity: "critical",
        studentId: p.studentId,
        serviceRequirementId: p.serviceRequirementId,
        message: `${p.studentName} is out of compliance for ${p.serviceTypeName}. Delivered ${p.deliveredMinutes} of ${p.requiredMinutes} required minutes (${p.percentComplete}% complete, expected ${Math.round(p.expectedMinutesByNow)} by now).`,
        suggestedAction: "Schedule makeup sessions immediately to address the deficit.",
      });
    } else if (p.riskStatus === "at_risk") {
      alertsToCreate.push({
        type: "behind_on_minutes",
        severity: "high",
        studentId: p.studentId,
        serviceRequirementId: p.serviceRequirementId,
        message: `${p.studentName} is at risk for ${p.serviceTypeName}. Delivered ${p.deliveredMinutes} of ${p.requiredMinutes} minutes (${p.percentComplete}% complete).`,
        suggestedAction: "Review schedule and add additional sessions to close the gap.",
      });
    } else if (p.riskStatus === "slightly_behind") {
      alertsToCreate.push({
        type: "behind_on_minutes",
        severity: "medium",
        studentId: p.studentId,
        serviceRequirementId: p.serviceRequirementId,
        message: `${p.studentName} is slightly behind on ${p.serviceTypeName}. ${p.remainingMinutes} minutes remaining.`,
        suggestedAction: "Monitor and ensure upcoming sessions are not missed.",
      });
    }

    if (p.projectedMinutes < p.requiredMinutes * 0.9 && p.riskStatus !== "out_of_compliance") {
      alertsToCreate.push({
        type: "projected_shortfall",
        severity: "high",
        studentId: p.studentId,
        serviceRequirementId: p.serviceRequirementId,
        message: `Projected shortfall for ${p.studentName} - ${p.serviceTypeName}. At current pace, only ${Math.round(p.projectedMinutes)} of ${p.requiredMinutes} required minutes will be delivered.`,
        suggestedAction: "Increase session frequency before interval end.",
      });
    }

    if (p.missedSessionsCount >= 3) {
      alertsToCreate.push({
        type: "missed_sessions",
        severity: "high",
        studentId: p.studentId,
        serviceRequirementId: p.serviceRequirementId,
        message: `${p.studentName} has ${p.missedSessionsCount} missed sessions for ${p.serviceTypeName} this interval.`,
        suggestedAction: "Investigate root cause of missed sessions and address staffing or scheduling issues.",
      });
    }
  }

  const allBlocks = await db
    .select({
      id: scheduleBlocksTable.id,
      staffId: scheduleBlocksTable.staffId,
      dayOfWeek: scheduleBlocksTable.dayOfWeek,
      startTime: scheduleBlocksTable.startTime,
      endTime: scheduleBlocksTable.endTime,
    })
    .from(scheduleBlocksTable)
    .where(eq(scheduleBlocksTable.isRecurring, true));

  const blocksByStaffDay = new Map<string, typeof allBlocks>();
  for (const block of allBlocks) {
    const key = `${block.staffId}-${block.dayOfWeek}`;
    if (!blocksByStaffDay.has(key)) blocksByStaffDay.set(key, []);
    blocksByStaffDay.get(key)!.push(block);
  }

  for (const [key, blocks] of blocksByStaffDay.entries()) {
    if (blocks.length < 2) continue;
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i];
        const b = blocks[j];
        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          alertsToCreate.push({
            type: "conflict",
            severity: "high",
            staffId: a.staffId,
            message: `Schedule conflict on ${a.dayOfWeek}: blocks overlap (${a.startTime}-${a.endTime} and ${b.startTime}-${b.endTime}).`,
            suggestedAction: "Resolve the overlapping schedule assignments.",
          });
          break;
        }
      }
    }
  }

  const resolvedResult = await db
    .update(alertsTable)
    .set({ resolved: true, resolvedAt: new Date(), resolvedNote: "Auto-resolved by compliance engine re-check" })
    .where(eq(alertsTable.resolved, false))
    .returning({ id: alertsTable.id });

  const resolvedAlerts = resolvedResult.length;

  let newAlerts = 0;
  if (alertsToCreate.length > 0) {
    const BATCH_SIZE = 500;
    for (let i = 0; i < alertsToCreate.length; i += BATCH_SIZE) {
      const batch = alertsToCreate.slice(i, i + BATCH_SIZE).map(a => ({ ...a, resolved: false }));
      await db.insert(alertsTable).values(batch);
    }
    newAlerts = alertsToCreate.length;
  }

  const compGenerated = await generateCompensatoryObligations(allProgress);

  logger.info({ newAlerts, resolvedAlerts, compGenerated }, "Compliance checks complete");
  return { newAlerts, resolvedAlerts };
}

function getPreviousInterval(intervalType: string): { start: string; end: string } {
  const now = new Date();
  if (intervalType === "monthly") {
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    return {
      start: prevStart.toISOString().substring(0, 10),
      end: prevEnd.toISOString().substring(0, 10),
    };
  }
  if (intervalType === "weekly") {
    const dayOfWeek = now.getDay();
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    thisMonday.setHours(0, 0, 0, 0);
    const prevMonday = new Date(thisMonday);
    prevMonday.setDate(thisMonday.getDate() - 7);
    const prevSunday = new Date(prevMonday);
    prevSunday.setDate(prevMonday.getDate() + 6);
    return {
      start: prevMonday.toISOString().substring(0, 10),
      end: prevSunday.toISOString().substring(0, 10),
    };
  }
  if (intervalType === "quarterly") {
    const quarter = Math.floor(now.getMonth() / 3);
    const prevQuarter = quarter === 0 ? 3 : quarter - 1;
    const prevYear = quarter === 0 ? now.getFullYear() - 1 : now.getFullYear();
    const prevStart = new Date(prevYear, prevQuarter * 3, 1);
    const prevEnd = new Date(prevYear, prevQuarter * 3 + 3, 0);
    return {
      start: prevStart.toISOString().substring(0, 10),
      end: prevEnd.toISOString().substring(0, 10),
    };
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const ys = yesterday.toISOString().substring(0, 10);
  return { start: ys, end: ys };
}

async function generateCompensatoryObligations(
  allProgress: Awaited<ReturnType<typeof computeAllActiveMinuteProgress>>
): Promise<number> {
  if (allProgress.length === 0) return 0;

  const uniqueReqs = new Map<number, (typeof allProgress)[0]>();
  for (const p of allProgress) {
    if (!uniqueReqs.has(p.serviceRequirementId)) {
      uniqueReqs.set(p.serviceRequirementId, p);
    }
  }

  const prevIntervalsByType = new Map<string, { start: string; end: string }>();
  for (const p of allProgress) {
    if (!prevIntervalsByType.has(p.intervalType)) {
      prevIntervalsByType.set(p.intervalType, getPreviousInterval(p.intervalType));
    }
  }

  const reqIds = [...uniqueReqs.keys()];
  if (reqIds.length === 0) return 0;

  const prevSessions = new Map<string, number>();
  for (const [intervalType, prev] of prevIntervalsByType.entries()) {
    const typeReqIds = [...uniqueReqs.entries()]
      .filter(([_, p]) => p.intervalType === intervalType)
      .map(([id]) => id);

    if (typeReqIds.length === 0) continue;

    const sessions = await db
      .select({
        serviceRequirementId: sessionLogsTable.serviceRequirementId,
        durationMinutes: sessionLogsTable.durationMinutes,
        status: sessionLogsTable.status,
      })
      .from(sessionLogsTable)
      .where(
        and(
          sql`${sessionLogsTable.serviceRequirementId} IN (${sql.join(typeReqIds.map(id => sql`${id}`), sql`, `)})`,
          sql`${sessionLogsTable.sessionDate} >= ${prev.start}`,
          sql`${sessionLogsTable.sessionDate} <= ${prev.end}`
        )
      );

    for (const s of sessions) {
      if (s.status === "completed" || s.status === "makeup") {
        const key = `${s.serviceRequirementId}|${prev.start}|${prev.end}`;
        const cur = prevSessions.get(key) || 0;
        prevSessions.set(key, cur + s.durationMinutes);
      }
    }
  }

  let generated = 0;
  for (const [reqId, p] of uniqueReqs.entries()) {
    const prev = prevIntervalsByType.get(p.intervalType)!;
    const key = `${reqId}|${prev.start}|${prev.end}`;
    const delivered = prevSessions.get(key) || 0;
    const shortfall = p.requiredMinutes - delivered;
    if (shortfall <= 0) continue;

    const existing = await db
      .select({ id: compensatoryObligationsTable.id })
      .from(compensatoryObligationsTable)
      .where(
        and(
          eq(compensatoryObligationsTable.studentId, p.studentId),
          eq(compensatoryObligationsTable.serviceRequirementId, reqId),
          sql`${compensatoryObligationsTable.periodStart} = ${prev.start}`,
          sql`${compensatoryObligationsTable.periodEnd} = ${prev.end}`
        )
      )
      .limit(1);

    if (existing.length > 0) continue;

    await db.insert(compensatoryObligationsTable).values({
      studentId: p.studentId,
      serviceRequirementId: reqId,
      periodStart: prev.start,
      periodEnd: prev.end,
      minutesOwed: shortfall,
      minutesDelivered: 0,
      status: "pending",
      source: "auto_compliance",
      notes: `Auto-generated: ${p.studentName} - ${p.serviceTypeName}, shortfall of ${shortfall} minutes for ${prev.start} to ${prev.end}.`,
    });
    generated++;
  }

  if (generated > 0) {
    logger.info({ generated }, "Auto-generated compensatory obligations from previous interval shortfalls");
  }
  return generated;
}
