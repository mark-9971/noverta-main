import { db } from "@workspace/db";
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
} from "@workspace/db";
import { eq, and, lt, ne, sql, isNull, or, lte } from "drizzle-orm";
import {
  sendEmail,
  sendReportEmail,
  buildOverdueFollowupEmail,
  buildOverdueEvaluationEmail,
  buildIncompleteTransitionEmail,
} from "./email";
import { generateComplianceAlerts } from "../routes/complianceChecklist";
import { generateReportCSVDirect } from "../routes/reportExports";

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

async function runComplianceAlertCheck(): Promise<void> {
  try {
    const result = await generateComplianceAlerts();
    console.log(`[Reminders] Compliance alerts: ${result.created} created, ${result.checked} checked`);
  } catch (err) {
    console.error("[Reminders] Compliance alert check error:", err);
  }
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

      const result = await generateReportCSVDirect(reportType, schedule.districtId);
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
        parameters: { scheduled: true, scheduleId: schedule.id, frequency: schedule.frequency, emailSent: emailResult.success, emailError: emailResult.error ?? null },
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

async function runAllReminders(): Promise<void> {
  console.log("[Reminders] Running scheduled overdue reminder checks...");
  try {
    await Promise.allSettled([
      runOverdueContactFollowups(),
      runOverdueEvaluations(),
      runDraftTransitionPlans(),
      runComplianceAlertCheck(),
      runScheduledReports(),
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
