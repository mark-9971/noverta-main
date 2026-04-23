import {
  db,
  approvalWorkflowsTable,
  workflowReviewersTable,
  staffTable,
  schoolsTable,
  studentsTable,
  districtsTable,
  communicationEventsTable,
} from "@workspace/db";
import { and, eq, lt, sql, inArray } from "drizzle-orm";
import { sendEmail } from "./email";

const STAGE_LABELS: Record<string, string> = {
  draft: "Draft",
  team_review: "Team Review",
  director_signoff: "Director Sign-off",
  parent_delivery: "Parent Delivery",
};

function getDefaultThresholdDays(): number {
  const raw = process.env.APPROVAL_REMINDER_DAYS;
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 3;
}

async function wasRecentlyReminded(workflowId: number, stage: string, withinHours: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - withinHours * 60 * 60 * 1000).toISOString();
  const rows = await db.execute(sql`
    SELECT 1 FROM communication_events
    WHERE type = 'approval_pending_reminder'
      AND (metadata->>'workflowId')::text = ${String(workflowId)}
      AND (metadata->>'stage')::text = ${stage}
      AND created_at > ${cutoff}::timestamptz
    LIMIT 1
  `);
  return rows.rows.length > 0;
}

export async function runApprovalReminders(): Promise<void> {
  const defaultDays = getDefaultThresholdDays();

  // Per-district threshold map (null/undefined => default).
  const districts = await db
    .select({ id: districtsTable.id, days: districtsTable.approvalReminderDays })
    .from(districtsTable);
  const districtThreshold = new Map<number, number>();
  for (const d of districts) {
    districtThreshold.set(d.id, d.days ?? defaultDays);
  }

  // Pull a bounded window of in-progress workflows whose stage hasn't
  // changed in at least the smallest possible threshold (1 day) — we
  // re-check the per-district threshold below.
  const oldestCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const workflows = await db
    .select({
      id: approvalWorkflowsTable.id,
      title: approvalWorkflowsTable.title,
      currentStage: approvalWorkflowsTable.currentStage,
      studentId: approvalWorkflowsTable.studentId,
      districtId: approvalWorkflowsTable.districtId,
      updatedAt: approvalWorkflowsTable.updatedAt,
    })
    .from(approvalWorkflowsTable)
    .where(
      and(
        eq(approvalWorkflowsTable.status, "in_progress"),
        lt(approvalWorkflowsTable.updatedAt, oldestCutoff),
      ),
    )
    .limit(200);

  if (workflows.length === 0) {
    console.log("[ApprovalReminders] No stalled workflows");
    return;
  }

  let remindersSent = 0;
  let workflowsChecked = 0;

  for (const wf of workflows) {
    try {
      const thresholdDays = districtThreshold.get(wf.districtId) ?? defaultDays;
      const stalledMs = Date.now() - new Date(wf.updatedAt).getTime();
      const stalledDays = stalledMs / 86400000;
      if (stalledDays < thresholdDays) continue;

      workflowsChecked++;

      // One reminder per workflow+stage per 24h.
      if (await wasRecentlyReminded(wf.id, wf.currentStage, 24)) continue;

      const reviewers = await db
        .select()
        .from(workflowReviewersTable)
        .where(
          and(
            eq(workflowReviewersTable.workflowId, wf.id),
            eq(workflowReviewersTable.stage, wf.currentStage),
          ),
        );
      if (reviewers.length === 0) continue;

      const [student] = await db
        .select({ firstName: studentsTable.firstName, lastName: studentsTable.lastName })
        .from(studentsTable)
        .where(eq(studentsTable.id, wf.studentId));
      const studentName = student ? `${student.firstName} ${student.lastName}` : "Student";

      const reviewerUserIds = reviewers.map(r => r.reviewerUserId);
      const staffRows = reviewerUserIds.length
        ? await db
            .select({ externalId: staffTable.externalId, email: staffTable.email })
            .from(staffTable)
            .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
            .where(
              and(
                inArray(staffTable.externalId, reviewerUserIds),
                eq(schoolsTable.districtId, wf.districtId),
              ),
            )
        : [];
      const emailByExternalId = new Map<string, string>();
      for (const s of staffRows) {
        if (s.externalId && s.email) emailByExternalId.set(s.externalId, s.email);
      }

      const stageLabel = STAGE_LABELS[wf.currentStage] || wf.currentStage;
      const daysIdle = Math.floor(stalledDays);

      for (const reviewer of reviewers) {
        const email = emailByExternalId.get(reviewer.reviewerUserId);
        if (!email) continue;

        try {
          await sendEmail({
            studentId: wf.studentId,
            type: "approval_pending_reminder",
            subject: `Noverta REMINDER: Approval still pending (${daysIdle}d) — ${stageLabel}`,
            bodyHtml: `<div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#d97706;color:white;padding:16px 24px;border-radius:8px 8px 0 0">
                <h2 style="margin:0;font-size:18px">Approval Reminder — Action Needed</h2>
              </div>
              <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
                <p>Hi ${reviewer.reviewerName},</p>
                <p>A document has been awaiting your review at the <strong>${stageLabel}</strong> stage for <strong>${daysIdle} day${daysIdle === 1 ? "" : "s"}</strong>. IEP compliance timelines require timely review — please take action when you can.</p>
                <ul style="color:#374151">
                  <li><strong>Document:</strong> ${wf.title}</li>
                  <li><strong>Student:</strong> ${studentName}</li>
                  <li><strong>Stage:</strong> ${stageLabel}</li>
                  <li><strong>Days idle:</strong> ${daysIdle}</li>
                </ul>
                <p style="color:#6b7280;font-size:13px">Log in to Noverta to review and take action.</p>
              </div>
            </div>`,
            toEmail: email,
            toName: reviewer.reviewerName,
            metadata: {
              workflowId: wf.id,
              stage: wf.currentStage,
              daysIdle,
              triggeredBy: "approval_pending_scheduler",
            },
          });
          remindersSent++;
        } catch (err) {
          console.error(`[ApprovalReminders] Send failed wf=${wf.id} reviewer=${reviewer.reviewerUserId}:`, err);
        }
      }
    } catch (err) {
      console.error(`[ApprovalReminders] Workflow #${wf.id} error:`, err);
    }
  }

  console.log(
    `[ApprovalReminders] ${workflowsChecked} stalled workflow(s) over threshold, ${remindersSent} reminder email(s) sent`,
  );
}
