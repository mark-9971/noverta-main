import { db } from "@workspace/db";
import {
  alertsTable,
  serviceRequirementsTable,
  sessionLogsTable,
  studentsTable,
  staffTable,
  scheduleBlocksTable,
} from "@workspace/db";
import { eq, and, gte, lte, count, ne } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "./minuteCalc";
import { logger } from "./logger";

export async function runComplianceChecks(): Promise<{ newAlerts: number; resolvedAlerts: number }> {
  logger.info("Running compliance checks");
  let newAlerts = 0;
  let resolvedAlerts = 0;

  // Mark existing unresolved alerts as resolved initially (we'll re-create relevant ones)
  const existingUnresolved = await db
    .select({ id: alertsTable.id })
    .from(alertsTable)
    .where(eq(alertsTable.resolved, false));

  // Compute minute progress for all active requirements
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

    // Check projected shortfall
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

    // Check repeated missed sessions
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

  // Check for schedule conflicts
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

  // Group by staff + day
  const blocksByStaffDay = new Map<string, typeof allBlocks>();
  for (const block of allBlocks) {
    const key = `${block.staffId}-${block.dayOfWeek}`;
    if (!blocksByStaffDay.has(key)) blocksByStaffDay.set(key, []);
    blocksByStaffDay.get(key)!.push(block);
  }

  for (const [key, blocks] of blocksByStaffDay.entries()) {
    if (blocks.length < 2) continue;
    // Check for overlaps
    for (let i = 0; i < blocks.length; i++) {
      for (let j = i + 1; j < blocks.length; j++) {
        const a = blocks[i];
        const b = blocks[j];
        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          const staffId = a.staffId;
          alertsToCreate.push({
            type: "conflict",
            severity: "high",
            staffId,
            message: `Schedule conflict on ${a.dayOfWeek}: blocks overlap (${a.startTime}-${a.endTime} and ${b.startTime}-${b.endTime}).`,
            suggestedAction: "Resolve the overlapping schedule assignments.",
          });
          break;
        }
      }
    }
  }

  // Resolve all existing unresolved alerts that match types we're re-checking
  const alertTypesToRefresh = ["behind_on_minutes", "projected_shortfall", "missed_sessions", "conflict"];
  const existingToResolve = await db
    .select({ id: alertsTable.id })
    .from(alertsTable)
    .where(and(eq(alertsTable.resolved, false)));

  for (const alert of existingToResolve) {
    await db
      .update(alertsTable)
      .set({ resolved: true, resolvedAt: new Date(), resolvedNote: "Auto-resolved by compliance engine re-check" })
      .where(eq(alertsTable.id, alert.id));
    resolvedAlerts++;
  }

  // Create new alerts
  for (const alertData of alertsToCreate) {
    await db.insert(alertsTable).values({
      ...alertData,
      resolved: false,
    });
    newAlerts++;
  }

  logger.info({ newAlerts, resolvedAlerts }, "Compliance checks complete");
  return { newAlerts, resolvedAlerts };
}
