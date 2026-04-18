import { db, pool } from "@workspace/db";
import {
  parentContactsTable,
  evaluationsTable,
  transitionPlansTable,
  studentsTable,
  staffTable,
  guardiansTable,
  schoolsTable,
  communicationEventsTable,
  scheduledReportsTable,
  exportHistoryTable,
  scheduleBlocksTable,
  sessionLogsTable,
  alertsTable,
  serviceTypesTable,
  districtsTable,
  caseloadSnapshotsTable,
  staffAssignmentsTable,
  type InsertAlert,
} from "@workspace/db";
import { eq, and, lt, ne, sql, isNull, or, lte, inArray } from "drizzle-orm";
import { computeAllActiveMinuteProgress } from "./minuteCalc";
import {
  sendEmail,
  sendReportEmail,
  buildOverdueFollowupEmail,
  buildOverdueEvaluationEmail,
  buildIncompleteTransitionEmail,
  buildOverdueSessionLogEmail,
} from "./email";
import { generateComplianceAlerts } from "../routes/complianceChecklist";
import { generateReportCSVDirect } from "../routes/reportExports/historyAndScheduled";
import { runCostAvoidanceAlertGeneration } from "./costAvoidanceAlerts";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
let reminderInterval: ReturnType<typeof setInterval> | null = null;

async function wasRecentlyReminded(opts: {
  type: string;
  studentId: number;
  dedupeKey: string;
  dedupeValue: string;
  withinHours: number;
}): Promise<boolean> {
  const cutoff = new Date(Date.now() - opts.withinHours * 60 * 60 * 1000).toISOString();
  const rows = await db.execute(sql`
    SELECT 1 FROM communication_events
    WHERE type = ${opts.type}
      AND student_id = ${opts.studentId}
      AND (metadata->>${opts.dedupeKey})::text = ${opts.dedupeValue}
      AND created_at > ${cutoff}::timestamptz
    LIMIT 1
  `);
  return rows.rows.length > 0;
}

async function runOverdueContactFollowups(): Promise<void> {
  const today = new Date().toISOString().substring(0, 10);

  const contacts = await db
    .select({
      id: parentContactsTable.id,
      studentId: parentContactsTable.studentId,
      subject: parentContactsTable.subject,
      contactDate: parentContactsTable.contactDate,
      followUpDate: parentContactsTable.followUpDate,
      contactedBy: parentContactsTable.contactedBy,
    })
    .from(parentContactsTable)
    .where(
      and(
        eq(parentContactsTable.followUpNeeded, "yes"),
        lt(parentContactsTable.followUpDate, today),
      )
    )
    .limit(50);

  for (const contact of contacts) {
    try {
      const alreadyReminded = await wasRecentlyReminded({
        type: "overdue_followup_reminder",
        studentId: contact.studentId,
        dedupeKey: "linkedContactId",
        dedupeValue: String(contact.id),
        withinHours: 24,
      });
      if (alreadyReminded) continue;

      const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, contact.studentId));
      if (!student) continue;

      const [guardian] = await db.select().from(guardiansTable)
        .where(eq(guardiansTable.studentId, student.id))
        .orderBy(guardiansTable.contactPriority, guardiansTable.id)
        .limit(1);
      const toEmail = guardian?.email ?? student.parentEmail ?? null;
      const toName = guardian?.name ?? student.parentGuardianName ?? null;
      if (!toEmail) continue;

      const [school] = student.schoolId
        ? await db.select().from(schoolsTable).where(eq(schoolsTable.id, student.schoolId))
        : [null as null];

      const emailContent = buildOverdueFollowupEmail({
        guardianName: toName ?? "Parent/Guardian",
        studentName: `${student.firstName} ${student.lastName}`,
        originalSubject: contact.subject,
        originalContactDate: contact.contactDate,
        followUpDate: contact.followUpDate ?? today,
        staffName: contact.contactedBy ?? "School Staff",
        schoolName: school?.name ?? "the school",
      });

      await sendEmail({
        studentId: student.id,
        type: "overdue_followup_reminder",
        subject: emailContent.subject,
        bodyHtml: emailContent.html,
        bodyText: emailContent.text,
        toEmail,
        toName: toName ?? undefined,
        guardianId: guardian?.id,
        linkedContactId: contact.id,
        metadata: { linkedContactId: contact.id, triggeredBy: "overdue_followup_scheduler" },
      });
    } catch (err) {
      console.error(`[Reminders] Follow-up contact #${contact.id} error:`, err);
    }
  }
}

async function runOverdueEvaluations(): Promise<void> {
  const today = new Date().toISOString().substring(0, 10);

  const evals = await db
    .select({
      id: evaluationsTable.id,
      studentId: evaluationsTable.studentId,
      evaluationType: evaluationsTable.evaluationType,
      dueDate: evaluationsTable.dueDate,
      leadEvaluatorId: evaluationsTable.leadEvaluatorId,
      status: evaluationsTable.status,
    })
    .from(evaluationsTable)
    .where(
      and(
        lt(evaluationsTable.dueDate, today),
        ne(evaluationsTable.status, "completed"),
      )
    )
    .limit(50);

  for (const ev of evals) {
    try {
      if (!ev.leadEvaluatorId || !ev.dueDate) continue;

      const alreadyReminded = await wasRecentlyReminded({
        type: "overdue_evaluation_reminder",
        studentId: ev.studentId,
        dedupeKey: "evaluationId",
        dedupeValue: String(ev.id),
        withinHours: 24,
      });
      if (alreadyReminded) continue;

      const [leadStaff] = await db.select().from(staffTable).where(eq(staffTable.id, ev.leadEvaluatorId));
      if (!leadStaff?.email) continue;

      const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, ev.studentId));
      const [school] = student?.schoolId
        ? await db.select().from(schoolsTable).where(eq(schoolsTable.id, student.schoolId))
        : [null as null];

      const dueMs = new Date(ev.dueDate).getTime();
      const daysOverdue = Math.floor((Date.now() - dueMs) / 86400000);

      const emailContent = buildOverdueEvaluationEmail({
        staffName: `${leadStaff.firstName} ${leadStaff.lastName}`,
        studentName: student ? `${student.firstName} ${student.lastName}` : "Student",
        evaluationType: ev.evaluationType ?? "initial",
        dueDate: ev.dueDate,
        daysOverdue,
        schoolName: school?.name ?? "the school",
      });

      await sendEmail({
        studentId: ev.studentId,
        type: "overdue_evaluation_reminder",
        subject: emailContent.subject,
        bodyHtml: emailContent.html,
        bodyText: emailContent.text,
        toEmail: leadStaff.email,
        toName: `${leadStaff.firstName} ${leadStaff.lastName}`,
        staffId: ev.leadEvaluatorId,
        metadata: { evaluationId: ev.id, daysOverdue, triggeredBy: "overdue_eval_scheduler" },
      });
    } catch (err) {
      console.error(`[Reminders] Overdue evaluation #${ev.id} error:`, err);
    }
  }
}

async function runDraftTransitionPlans(): Promise<void> {
  const cutoffDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const plans = await db
    .select({
      id: transitionPlansTable.id,
      studentId: transitionPlansTable.studentId,
      coordinatorId: transitionPlansTable.coordinatorId,
      planDate: transitionPlansTable.planDate,
      status: transitionPlansTable.status,
    })
    .from(transitionPlansTable)
    .where(
      and(
        or(eq(transitionPlansTable.status, "draft"), isNull(transitionPlansTable.status)),
        lt(transitionPlansTable.updatedAt, new Date(cutoffDate)),
        isNull(transitionPlansTable.deletedAt),
      )
    )
    .limit(50);

  for (const plan of plans) {
    try {
      if (!plan.coordinatorId) continue;

      const alreadyReminded = await wasRecentlyReminded({
        type: "incomplete_transition_reminder",
        studentId: plan.studentId,
        dedupeKey: "transitionPlanId",
        dedupeValue: String(plan.id),
        withinHours: 7 * 24,
      });
      if (alreadyReminded) continue;

      const [coordinator] = await db.select().from(staffTable).where(eq(staffTable.id, plan.coordinatorId));
      if (!coordinator?.email) continue;

      const [student] = await db.select().from(studentsTable).where(eq(studentsTable.id, plan.studentId));
      const [school] = student?.schoolId
        ? await db.select().from(schoolsTable).where(eq(schoolsTable.id, student.schoolId))
        : [null as null];

      const emailContent = buildIncompleteTransitionEmail({
        coordinatorName: `${coordinator.firstName} ${coordinator.lastName}`,
        studentName: student ? `${student.firstName} ${student.lastName}` : "Student",
        planDate: plan.planDate ?? new Date().toISOString().substring(0, 10),
        schoolName: school?.name ?? "the school",
      });

      await sendEmail({
        studentId: plan.studentId,
        type: "incomplete_transition_reminder",
        subject: emailContent.subject,
        bodyHtml: emailContent.html,
        bodyText: emailContent.text,
        toEmail: coordinator.email,
        toName: `${coordinator.firstName} ${coordinator.lastName}`,
        staffId: plan.coordinatorId,
        metadata: { transitionPlanId: plan.id, triggeredBy: "draft_transition_scheduler" },
      });
    } catch (err) {
      console.error(`[Reminders] Draft transition plan #${plan.id} error:`, err);
    }
  }
}

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

async function runOverdueSessionLogCheck(): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const checkDates: { date: string; dayName: string; daysOld: number }[] = [];
  for (let i = 2; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dayName = DAY_NAMES[d.getDay()];
    if (dayName === "saturday" || dayName === "sunday") continue;
    checkDates.push({ date: d.toISOString().substring(0, 10), dayName, daysOld: i });
  }

  if (checkDates.length === 0) return;

  const blocks = await db
    .select({
      id: scheduleBlocksTable.id,
      staffId: scheduleBlocksTable.staffId,
      studentId: scheduleBlocksTable.studentId,
      serviceTypeId: scheduleBlocksTable.serviceTypeId,
      dayOfWeek: scheduleBlocksTable.dayOfWeek,
      effectiveFrom: scheduleBlocksTable.effectiveFrom,
      effectiveTo: scheduleBlocksTable.effectiveTo,
      blockLabel: scheduleBlocksTable.blockLabel,
    })
    .from(scheduleBlocksTable)
    .where(
      and(
        eq(scheduleBlocksTable.isRecurring, true),
        eq(scheduleBlocksTable.recurrenceType, "weekly"),
        eq(scheduleBlocksTable.blockType, "service"),
        isNull(scheduleBlocksTable.deletedAt),
      )
    );

  type Missing = {
    staffId: number;
    studentId: number;
    date: string;
    daysOld: number;
    serviceTypeId: number | null;
    blockLabel: string | null;
  };

  // Build expected occurrences from blocks (dedupe by tuple)
  const expectedMap = new Map<string, Missing>();
  const earliestDate = checkDates.reduce((min, cd) => cd.date < min ? cd.date : min, "9999-99-99");
  const latestDate = checkDates.reduce((max, cd) => cd.date > max ? cd.date : max, "0000-00-00");

  for (const block of blocks) {
    if (!block.studentId) continue;
    for (const cd of checkDates) {
      if (block.dayOfWeek.toLowerCase() !== cd.dayName) continue;
      if (block.effectiveFrom && cd.date < block.effectiveFrom) continue;
      if (block.effectiveTo && cd.date > block.effectiveTo) continue;

      const key = `${block.staffId}|${block.studentId}|${cd.date}`;
      if (expectedMap.has(key)) continue; // dedupe duplicate blocks for same tuple
      expectedMap.set(key, {
        staffId: block.staffId,
        studentId: block.studentId!,
        date: cd.date,
        daysOld: cd.daysOld,
        serviceTypeId: block.serviceTypeId,
        blockLabel: block.blockLabel,
      });
    }
  }

  if (expectedMap.size === 0) {
    console.log("[Reminders] Overdue session logs: 0 expected");
    return;
  }

  // Single query: fetch all session logs in window for staff/student tuples we care about
  const staffIdsSet = new Set<number>();
  const studentIdsSet = new Set<number>();
  for (const m of expectedMap.values()) {
    staffIdsSet.add(m.staffId);
    studentIdsSet.add(m.studentId);
  }
  const staffIds = [...staffIdsSet];
  const studentIds = [...studentIdsSet];

  const existingLogs = await db
    .select({
      staffId: sessionLogsTable.staffId,
      studentId: sessionLogsTable.studentId,
      sessionDate: sessionLogsTable.sessionDate,
    })
    .from(sessionLogsTable)
    .where(
      and(
        inArray(sessionLogsTable.staffId, staffIds),
        inArray(sessionLogsTable.studentId, studentIds),
        sql`${sessionLogsTable.sessionDate} BETWEEN ${earliestDate} AND ${latestDate}`,
        isNull(sessionLogsTable.deletedAt),
      )
    );
  const loggedKeys = new Set(existingLogs.map(l => `${l.staffId}|${l.studentId}|${l.sessionDate}`));

  // Filter to actually missing
  const missing: Missing[] = [];
  for (const [key, m] of expectedMap.entries()) {
    if (!loggedKeys.has(key)) missing.push(m);
  }

  if (missing.length === 0) {
    console.log("[Reminders] Overdue session logs: 0 missing");
    return;
  }

  // Single query: fetch all existing unresolved overdue_session_log alerts for these tuples
  const existingAlerts = await db
    .select({
      staffId: alertsTable.staffId,
      studentId: alertsTable.studentId,
      message: alertsTable.message,
    })
    .from(alertsTable)
    .where(
      and(
        eq(alertsTable.type, "overdue_session_log"),
        eq(alertsTable.resolved, false),
        inArray(alertsTable.staffId, staffIds),
        inArray(alertsTable.studentId, studentIds),
      )
    );
  const alertKeys = new Set<string>();
  for (const a of existingAlerts) {
    const match = a.message?.match(/\[ref:(\d{4}-\d{2}-\d{2})\]/);
    if (match && a.staffId != null && a.studentId != null) {
      alertKeys.add(`${a.staffId}|${a.studentId}|${match[1]}`);
    }
  }

  const missingStudentIds = [...new Set(missing.map(m => m.studentId))];
  const students = await db.select().from(studentsTable).where(inArray(studentsTable.id, missingStudentIds));
  const studentMap = new Map(students.map(s => [s.id, s]));

  const serviceTypeIds = [...new Set(missing.map(m => m.serviceTypeId).filter((x): x is number => x != null))];
  const serviceTypes = serviceTypeIds.length > 0
    ? await db.select().from(serviceTypesTable).where(inArray(serviceTypesTable.id, serviceTypeIds))
    : [];
  const serviceTypeMap = new Map(serviceTypes.map(s => [s.id, s]));

  // Build alert rows for batch insert
  const alertsToInsert: any[] = [];
  for (const m of missing) {
    const key = `${m.staffId}|${m.studentId}|${m.date}`;
    if (alertKeys.has(key)) continue; // dedupe against existing unresolved alerts

    const student = studentMap.get(m.studentId);
    if (!student) continue;

    const severity = m.daysOld >= 5 ? "critical" : m.daysOld >= 3 ? "high" : "medium";
    const svc = m.serviceTypeId != null ? serviceTypeMap.get(m.serviceTypeId) : null;
    const svcLabel = svc ? ` ${svc.name}` : "";
    const labelSuffix = m.blockLabel ? ` — ${m.blockLabel}` : "";

    alertsToInsert.push({
      type: "overdue_session_log",
      severity,
      staffId: m.staffId,
      studentId: m.studentId,
      message: `Missing${svcLabel} session log for ${student.firstName} ${student.lastName} on ${m.date} (${m.daysOld} days ago)${labelSuffix} [ref:${m.date}]`,
      suggestedAction: m.daysOld >= 3
        ? "Log this session immediately or mark as missed with reason."
        : "Please log this session at your earliest convenience.",
      resolved: false,
    });
  }

  let createdAlerts = 0;
  if (alertsToInsert.length > 0) {
    const inserted = await db.insert(alertsTable).values(alertsToInsert).returning({ id: alertsTable.id });
    createdAlerts = inserted.length;
  }

  // Group missing by staff for digest emails
  const byStaff = new Map<number, Missing[]>();
  for (const m of missing) {
    if (!byStaff.has(m.staffId)) byStaff.set(m.staffId, []);
    byStaff.get(m.staffId)!.push(m);
  }

  // Single query: find staff who have already had a successful digest sent in the last 24h
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const recentSends = await db.execute(sql`
    SELECT DISTINCT staff_id FROM communication_events
    WHERE type = 'overdue_session_log_reminder'
      AND staff_id = ANY(${staffIds}::int[])
      AND status = 'sent'
      AND sent_at > ${cutoff}::timestamptz
  `);
  const recentStaffIds = new Set<number>(recentSends.rows.map((r: any) => Number(r.staff_id)));

  // Fetch all relevant staff records once
  const staffRows = await db.select().from(staffTable).where(inArray(staffTable.id, [...byStaff.keys()]));
  const staffMap = new Map(staffRows.map(s => [s.id, s]));

  let emailsSent = 0;
  for (const [staffId, items] of byStaff.entries()) {
    if (recentStaffIds.has(staffId)) continue;
    const staff = staffMap.get(staffId);
    if (!staff?.email) continue;

    const itemsForEmail = items
      .sort((a, b) => b.daysOld - a.daysOld)
      .map(i => {
        const s = studentMap.get(i.studentId);
        const svc = i.serviceTypeId != null ? serviceTypeMap.get(i.serviceTypeId) : null;
        return {
          studentName: s ? `${s.firstName} ${s.lastName}` : "Unknown student",
          date: i.date,
          serviceTypeName: svc?.name ?? null,
        };
      });

    const emailContent = buildOverdueSessionLogEmail({
      staffName: `${staff.firstName} ${staff.lastName}`,
      missingLogs: itemsForEmail,
    });

    await sendEmail({
      studentId: items[0].studentId,
      staffId,
      type: "overdue_session_log_reminder",
      subject: emailContent.subject,
      bodyHtml: emailContent.html,
      bodyText: emailContent.text,
      toEmail: staff.email,
      toName: `${staff.firstName} ${staff.lastName}`,
      metadata: { count: items.length, triggeredBy: "overdue_session_log_scheduler" },
    });
    emailsSent++;
  }

  console.log(`[Reminders] Overdue session logs: ${createdAlerts} alerts created, ${emailsSent} digest emails sent (${missing.length} total missing)`);
}

async function runComplianceAlertCheck(): Promise<void> {
  try {
    const result = await generateComplianceAlerts();
    console.log(`[Reminders] Compliance alerts: ${result.created} created, ${result.checked} checked`);
  } catch (err) {
    console.error("[Reminders] Compliance alert check error:", err);
  }
}

function getWeekStartStr(d: Date): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.getFullYear(), d.getMonth(), diff);
  return monday.toISOString().substring(0, 10);
}

/**
 * Core logic for generating compliance risk alerts scoped to a specific date.
 * Exported so tests can inject a fixed Monday without mocking the system clock.
 */
export async function runComplianceRiskAlertsForDate(today: Date): Promise<void> {
  const isMonday = today.getDay() === 1;

  try {
    const districts = await db
      .select({ id: districtsTable.id, complianceMinuteThreshold: districtsTable.complianceMinuteThreshold })
      .from(districtsTable);

    const weekStart = getWeekStartStr(today);
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalResolved = 0;

    for (const district of districts) {
      const threshold = district.complianceMinuteThreshold ?? 85;

      const progressItems = await computeAllActiveMinuteProgress({ districtId: district.id });
      if (progressItems.length === 0) continue;

      // Collect the worst (lowest percentComplete) failing service per student.
      // One alert per student per week — deduped by student + week.
      const worstByStudent = new Map<number, typeof progressItems[number]>();
      for (const p of progressItems) {
        if (p.requiredMinutes <= 0 || p.percentComplete >= threshold) continue;
        const current = worstByStudent.get(p.studentId);
        if (!current || p.percentComplete < current.percentComplete) {
          worstByStudent.set(p.studentId, p);
        }
      }

      // Auto-resolve stale compliance_risk alerts on every scheduler run.
      // A student is "recovered" if we have current progress data for them
      // but they are no longer below the threshold (not in worstByStudent).
      const allActiveStudentIds = [...new Set(progressItems.map(p => p.studentId))];
      const recoveredStudentIds = allActiveStudentIds.filter(id => !worstByStudent.has(id));

      if (recoveredStudentIds.length > 0) {
        const staleAlerts = await db
          .select({ id: alertsTable.id })
          .from(alertsTable)
          .where(
            and(
              eq(alertsTable.type, "compliance_risk"),
              eq(alertsTable.resolved, false),
              inArray(alertsTable.studentId, recoveredStudentIds),
            )
          );

        if (staleAlerts.length > 0) {
          const staleIds = staleAlerts.map(a => a.id);
          await db
            .update(alertsTable)
            .set({
              resolved: true,
              resolvedAt: new Date(),
              resolvedNote: `Student is now meeting or exceeding the ${threshold}% compliance threshold. Alert auto-resolved when student caught up.`,
            })
            .where(inArray(alertsTable.id, staleIds));
          totalResolved += staleAlerts.length;
        }
      }

      // New alert creation is gated to Mondays only (weekly cadence).
      if (!isMonday) continue;

      if (worstByStudent.size === 0) continue;

      const studentIds = [...worstByStudent.keys()];

      // Dedupe against ALL compliance_risk alerts for these students this week
      // (resolved or unresolved) — one alert per student per week.
      const existingAlerts = await db
        .select({ studentId: alertsTable.studentId, message: alertsTable.message })
        .from(alertsTable)
        .where(
          and(
            eq(alertsTable.type, "compliance_risk"),
            inArray(alertsTable.studentId, studentIds),
            sql`${alertsTable.message} LIKE ${`%[week:${weekStart}]%`}`,
          )
        );

      const alreadyAlertedStudents = new Set<number>(
        existingAlerts.map(a => a.studentId).filter((id): id is number => id != null)
      );

      const alertsToInsert: InsertAlert[] = [];
      for (const [studentId, p] of worstByStudent.entries()) {
        if (alreadyAlertedStudents.has(studentId)) {
          totalSkipped++;
          continue;
        }

        const pct = Math.round(p.percentComplete);
        const severity = pct < 50 ? "critical" : pct < 70 ? "high" : "medium";

        alertsToInsert.push({
          type: "compliance_risk",
          severity,
          studentId: p.studentId,
          staffId: p.providerId ?? null,
          serviceRequirementId: p.serviceRequirementId,
          message: `${p.studentName} is at ${pct}% of required ${p.serviceTypeName} minutes (${p.deliveredMinutes}/${p.requiredMinutes} min delivered this ${p.intervalType} period, threshold: ${threshold}%) [week:${weekStart}]`,
          suggestedAction: `Review service delivery for ${p.studentName}. Schedule sessions to reach the ${threshold}% compliance threshold. ${p.remainingMinutes} minutes still needed for ${p.serviceTypeName}.`,
          resolved: false,
        });
        alreadyAlertedStudents.add(studentId);
      }

      if (alertsToInsert.length > 0) {
        await db.insert(alertsTable).values(alertsToInsert);
        totalCreated += alertsToInsert.length;
      }
    }

    if (isMonday) {
      console.log(`[Reminders] Compliance risk alerts: ${totalCreated} created, ${totalSkipped} skipped, ${totalResolved} auto-resolved`);
    } else {
      console.log(`[Reminders] Compliance risk alerts: ${totalResolved} auto-resolved (creation skipped — not Monday)`);
    }
  } catch (err) {
    console.error("[Reminders] Compliance risk alert check error:", err);
  }
}

async function runComplianceRiskAlerts(): Promise<void> {
  // Gate to weekly cadence: only generate alerts on Mondays.
  // The 6-hour scheduler still calls this function multiple times per week,
  // but all non-Monday calls return early to match the weekly spec.
  const today = new Date();
  if (today.getDay() !== 1) {
    console.log("[Reminders] Compliance risk alerts: skipped (not Monday)");
    return;
  }
  return runComplianceRiskAlertsForDate(today);
}

const REPORT_TYPE_LABELS: Record<string, string> = {
  "compliance-summary": "Compliance Summary",
  "services-by-provider": "Services by Provider",
  "student-roster": "Student Roster",
  "caseload-distribution": "Caseload Distribution",
};

async function runScheduledReports(): Promise<void> {
  const now = new Date();

  const dueReports = await db
    .select()
    .from(scheduledReportsTable)
    .where(
      and(
        eq(scheduledReportsTable.enabled, true),
        lte(scheduledReportsTable.nextRunAt, now),
      )
    )
    .limit(20);

  if (dueReports.length === 0) return;

  for (const schedule of dueReports) {
    try {
      const reportType = schedule.reportType;
      const label = REPORT_TYPE_LABELS[reportType] ?? reportType;
      const today = now.toISOString().split("T")[0];

      const storedFilters = (schedule.filters as Record<string, unknown>) ?? {};
      const reportFilters = {
        startDate: storedFilters.startDate as string | undefined,
        endDate: storedFilters.endDate as string | undefined,
        schoolId: storedFilters.schoolId ? Number(storedFilters.schoolId) : undefined,
        providerId: storedFilters.providerId ? Number(storedFilters.providerId) : undefined,
        serviceTypeId: storedFilters.serviceTypeId ? Number(storedFilters.serviceTypeId) : undefined,
        complianceStatus: storedFilters.complianceStatus as string | undefined,
      };
      const result = await generateReportCSVDirect(reportType, schedule.districtId, reportFilters);
      if (!result) {
        console.error(`[ScheduledReports] Failed to generate ${reportType} for schedule #${schedule.id}`);
        continue;
      }

      const rowCount = result.rowCount;
      const fileName = `Scheduled_${label.replace(/\s+/g, "_")}_${today}.csv`;

      const emailResult = await sendReportEmail({
        toEmails: schedule.recipientEmails ?? [],
        reportLabel: label,
        frequency: schedule.frequency,
        recordCount: rowCount,
        csvContent: result.csv,
        fileName,
      });

      await db.insert(exportHistoryTable).values({
        reportType,
        reportLabel: label,
        exportedBy: schedule.createdBy,
        districtId: schedule.districtId,
        format: "csv",
        fileName,
        recordCount: rowCount,
        parameters: { scheduled: true, scheduleId: schedule.id, frequency: schedule.frequency, emailSent: emailResult.success, emailError: emailResult.error ?? null, start: reportFilters.startDate, end: reportFilters.endDate, schoolId: reportFilters.schoolId, providerId: reportFilters.providerId, serviceTypeId: reportFilters.serviceTypeId, complianceStatus: reportFilters.complianceStatus },
      });

      let nextRunAt: Date;
      if (schedule.frequency === "weekly") {
        nextRunAt = new Date(now);
        nextRunAt.setDate(nextRunAt.getDate() + 7);
        nextRunAt.setHours(6, 0, 0, 0);
      } else {
        nextRunAt = new Date(now.getFullYear(), now.getMonth() + 1, 1, 6, 0, 0, 0);
      }

      await db.update(scheduledReportsTable)
        .set({ lastRunAt: now, nextRunAt })
        .where(eq(scheduledReportsTable.id, schedule.id));

      console.log(`[ScheduledReports] Generated ${label} (${rowCount} rows) for schedule #${schedule.id}, next run: ${nextRunAt.toISOString()}`);
    } catch (err) {
      console.error(`[ScheduledReports] Error processing schedule #${schedule.id}:`, err);
    }
  }
}

function getCaseloadWeekStart(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export async function ensureCaseloadSnapshotsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS caseload_snapshots (
        id            SERIAL PRIMARY KEY,
        district_id   INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
        staff_id      INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        week_start    TIMESTAMPTZ NOT NULL,
        student_count INTEGER NOT NULL DEFAULT 0,
        captured_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS cs_district_week_idx ON caseload_snapshots (district_id, week_start)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS cs_staff_week_idx ON caseload_snapshots (staff_id, week_start)`);
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'cs_staff_week_unique'
        ) THEN
          ALTER TABLE caseload_snapshots ADD CONSTRAINT cs_staff_week_unique UNIQUE (staff_id, week_start);
        END IF;
      END $$;
    `);
  } catch (err) {
    console.warn("[Reminders] ensureCaseloadSnapshotsTable: DDL failed (non-fatal)", err);
  }
}

async function runCaseloadSnapshots(): Promise<void> {
  const today = new Date();
  if (today.getDay() !== 1) {
    return;
  }

  try {
    const weekStart = getCaseloadWeekStart(today);

    const districts = await db.select({ id: districtsTable.id }).from(districtsTable);

    let totalUpserted = 0;

    for (const district of districts) {
      const providers = await db
        .select({ id: staffTable.id })
        .from(staffTable)
        .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
        .where(
          and(
            eq(schoolsTable.districtId, district.id),
            eq(staffTable.status, "active"),
            isNull(staffTable.deletedAt),
          )
        );

      if (providers.length === 0) continue;

      const staffIds = providers.map(p => p.id);

      const caseloadCounts = await db
        .select({
          staffId: staffAssignmentsTable.staffId,
          studentCount: sql<number>`count(${staffAssignmentsTable.studentId})::int`,
        })
        .from(staffAssignmentsTable)
        .innerJoin(studentsTable, eq(staffAssignmentsTable.studentId, studentsTable.id))
        .where(
          and(
            eq(studentsTable.status, "active"),
            inArray(staffAssignmentsTable.staffId, staffIds),
          )
        )
        .groupBy(staffAssignmentsTable.staffId);

      const countMap = new Map(caseloadCounts.map(c => [c.staffId, c.studentCount]));

      const rows = providers.map(p => ({
        districtId: district.id,
        staffId: p.id,
        weekStart,
        studentCount: countMap.get(p.id) ?? 0,
      }));

      for (const row of rows) {
        await db
          .insert(caseloadSnapshotsTable)
          .values(row)
          .onConflictDoUpdate({
            target: [caseloadSnapshotsTable.staffId, caseloadSnapshotsTable.weekStart],
            set: { studentCount: row.studentCount },
          });
      }

      totalUpserted += rows.length;
    }

    console.log(`[Reminders] Caseload snapshots: ${totalUpserted} provider rows captured for week starting ${weekStart.toISOString().substring(0, 10)}`);
  } catch (err) {
    console.error("[Reminders] Caseload snapshot error:", err);
  }
}

async function runAllReminders(): Promise<void> {
  console.log("[Reminders] Running scheduled overdue reminder checks...");
  try {
    await Promise.allSettled([
      runOverdueContactFollowups(),
      runOverdueEvaluations(),
      runDraftTransitionPlans(),
      runComplianceAlertCheck(),
      runOverdueSessionLogCheck(),
      runScheduledReports(),
      runCostAvoidanceAlertGeneration(),
      runComplianceRiskAlerts(),
      runCaseloadSnapshots(),
    ]);
    console.log("[Reminders] Reminder check complete");
  } catch (err) {
    console.error("[Reminders] Unexpected error in reminder run:", err);
  }
}

export function startReminderScheduler(): void {
  if (reminderInterval) return;
  runAllReminders().catch(err => console.error("[Reminders] Initial run failed:", err));
  reminderInterval = setInterval(runAllReminders, CHECK_INTERVAL_MS);
  console.log("[Reminders] Scheduler started — checking every 6 hours");
}

export function stopReminderScheduler(): void {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}
