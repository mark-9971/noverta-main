import {
  db,
  coverageInstancesTable,
  scheduleBlocksTable,
  staffTable,
  studentsTable,
  alertsTable,
} from "@workspace/db";
import { and, eq, gte, lte, isNull, isNotNull } from "drizzle-orm";
import { sendAdminEmail } from "./email";

/**
 * Window (in hours) before the session start during which we send the reminder.
 * Default: 18 hours — covers "the evening before" for next-day sessions.
 * Overridable per-deployment via COVERAGE_REMINDER_HOURS_BEFORE env var.
 */
function getReminderWindowHours(): number {
  const raw = process.env.COVERAGE_REMINDER_HOURS_BEFORE;
  if (raw) {
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0 && n <= 168) return n;
  }
  return 18;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface CoverageReminderEmail {
  subject: string;
  html: string;
  text: string;
}

export function buildCoverageReminderEmail(opts: {
  substituteName: string;
  absenceDate: string;
  startTime: string | null;
  endTime: string | null;
  studentName: string | null;
  location: string | null;
  notes: string | null;
}): CoverageReminderEmail {
  const { substituteName, absenceDate, startTime, endTime, studentName, location, notes } = opts;
  const timeLabel = startTime && endTime ? `${startTime}–${endTime}` : "";
  const subject = `Reminder: Coverage Assignment — ${absenceDate}${timeLabel ? ` ${timeLabel}` : ""}`;
  const eName = escapeHtml(substituteName);
  const eDate = escapeHtml(absenceDate);
  const eTime = escapeHtml(timeLabel);
  const eStudent = studentName ? escapeHtml(studentName) : "";
  const eLocation = location ? escapeHtml(location) : "";
  const eNotes = notes ? escapeHtml(notes).replace(/\n/g, "<br>") : "";

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${subject}</title>
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#111;background:#f9fafb;margin:0;padding:0}.wrapper{max-width:600px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}.header{background:#b45309;color:#fff;padding:20px 24px}.body{padding:24px}.detail-row{margin:6px 0;font-size:14px}.label{font-weight:bold;color:#374151;display:inline-block;width:110px}.notes-box{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 16px;margin-top:16px;font-size:13px}.footer{background:#f3f4f6;padding:12px 24px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb}</style>
</head><body><div class="wrapper">
<div class="header"><h1 style="margin:0;font-size:17px">Reminder — Coverage Assignment</h1><p style="margin:4px 0 0;font-size:11px;opacity:.9">Trellis SPED Platform</p></div>
<div class="body">
<p>Hi ${eName},</p>
<p>This is a friendly reminder that you are assigned to cover an upcoming session and we have not yet seen you acknowledge the alert in Trellis. Please review the details below and confirm in the app when you have a moment.</p>
<div class="detail-row"><span class="label">Date:</span> ${eDate}</div>
${eTime ? `<div class="detail-row"><span class="label">Time:</span> ${eTime}</div>` : ""}
${eLocation ? `<div class="detail-row"><span class="label">Location:</span> ${eLocation}</div>` : ""}
${eStudent ? `<div class="detail-row"><span class="label">Student:</span> ${eStudent}</div>` : ""}
${eNotes ? `<div class="notes-box"><strong>Special Notes:</strong><br>${eNotes}</div>` : ""}
<p style="margin-top:20px;color:#6b7280;font-size:13px">Please log in to Trellis to view full session details and dismiss the alert once you've seen it.</p>
</div>
<div class="footer"><p>Trellis SPED Compliance Platform — Confidential. This reminder was sent because the in-app coverage alert had not been acknowledged.</p></div>
</div></body></html>`;

  const text =
    `Hi ${substituteName},\n\n` +
    `Reminder: you are assigned to cover an upcoming session and the in-app alert has not yet been acknowledged.\n\n` +
    `Date: ${absenceDate}` +
    `${timeLabel ? `\nTime: ${timeLabel}` : ""}` +
    `${location ? `\nLocation: ${location}` : ""}` +
    `${studentName ? `\nStudent: ${studentName}` : ""}` +
    `${notes ? `\nSpecial Notes: ${notes}` : ""}\n\n` +
    `Please log in to Trellis to view details and dismiss the alert.\n\n` +
    `Trellis SPED Compliance Platform`;

  return { subject, html, text };
}

/**
 * Scheduled job: emails substitutes whose upcoming coverage assignment falls
 * within the configured reminder window AND who have NOT yet acknowledged
 * (resolved/dismissed) the in-app `coverage_assignment` alert.
 *
 * Dedup: writes `reminder_sent_at` on the coverage_instance row, so a second
 * scheduler tick will never re-email the same assignment.
 *
 * Acknowledgement model: the assignment route inserts an `alerts` row of
 * type `coverage_assignment` for the substitute that mentions the absence
 * date in its message. The substitute "acknowledges" by resolving/dismissing
 * the alert through the in-app alerts UI (which sets `resolved=true`).
 * We treat presence of an unresolved alert matching (staffId, date) as the
 * "not yet acknowledged" signal.
 */
export async function runCoverageReminders(): Promise<{
  considered: number;
  emailsSent: number;
  skippedAcknowledged: number;
  skippedNoEmail: number;
}> {
  const windowHours = getReminderWindowHours();
  const now = new Date();
  const todayStr = now.toISOString().substring(0, 10);

  // Look ahead up to ceil(windowHours / 24) calendar days. We re-check the
  // precise time-of-day cutoff per row using start_time + absence_date.
  const lookAheadDays = Math.max(1, Math.ceil(windowHours / 24));
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + lookAheadDays);
  const horizonStr = horizon.toISOString().substring(0, 10);

  const rows = await db
    .select({
      instanceId: coverageInstancesTable.id,
      absenceDate: coverageInstancesTable.absenceDate,
      substituteStaffId: coverageInstancesTable.substituteStaffId,
      scheduleBlockId: coverageInstancesTable.scheduleBlockId,
      startTime: scheduleBlocksTable.startTime,
      endTime: scheduleBlocksTable.endTime,
      location: scheduleBlocksTable.location,
      notes: scheduleBlocksTable.notes,
      studentId: scheduleBlocksTable.studentId,
      subFirst: staffTable.firstName,
      subLast: staffTable.lastName,
      subEmail: staffTable.email,
    })
    .from(coverageInstancesTable)
    .innerJoin(scheduleBlocksTable, eq(scheduleBlocksTable.id, coverageInstancesTable.scheduleBlockId))
    .innerJoin(staffTable, eq(staffTable.id, coverageInstancesTable.substituteStaffId))
    .where(
      and(
        eq(coverageInstancesTable.isCovered, true),
        isNotNull(coverageInstancesTable.substituteStaffId),
        isNull(coverageInstancesTable.reminderSentAt),
        gte(coverageInstancesTable.absenceDate, todayStr),
        lte(coverageInstancesTable.absenceDate, horizonStr),
        isNull(scheduleBlocksTable.deletedAt),
      ),
    )
    .limit(500);

  let considered = 0;
  let emailsSent = 0;
  let skippedAcknowledged = 0;
  let skippedNoEmail = 0;

  for (const row of rows) {
    if (!row.substituteStaffId) continue;
    considered++;

    // Time-of-day filter: only remind when the session start is within the
    // configured window from now (and not already in the past).
    const startTimeStr = row.startTime ?? "00:00:00";
    const sessionStart = new Date(`${row.absenceDate}T${startTimeStr}`);
    if (Number.isNaN(sessionStart.getTime())) continue;
    const hoursUntilStart = (sessionStart.getTime() - now.getTime()) / 3_600_000;
    if (hoursUntilStart < 0) continue;
    if (hoursUntilStart > windowHours) continue;

    // Acknowledgement check: the assignment route inserts an alert linked to
    // this exact coverage_instance via `coverage_instance_id`. If it is still
    // unresolved, the substitute has not acknowledged the assignment.
    // Linking by id (not by message-LIKE) is required so that a substitute
    // with multiple same-day assignments isn't misclassified.
    const unacked = await db
      .select({ id: alertsTable.id })
      .from(alertsTable)
      .where(
        and(
          eq(alertsTable.type, "coverage_assignment"),
          eq(alertsTable.coverageInstanceId, row.instanceId),
          eq(alertsTable.staffId, row.substituteStaffId),
          eq(alertsTable.resolved, false),
        ),
      )
      .limit(1);

    if (unacked.length === 0) {
      skippedAcknowledged++;
      // Mark reminder_sent_at so we don't re-evaluate this row every tick.
      await db
        .update(coverageInstancesTable)
        .set({ reminderSentAt: now })
        .where(eq(coverageInstancesTable.id, row.instanceId));
      continue;
    }

    if (!row.subEmail) {
      skippedNoEmail++;
      // Stamp the row so the scheduler doesn't reprocess it on every tick —
      // we have no way to deliver a reminder to this substitute and the
      // alert UI/coverage dashboard is the existing operator surface for
      // missing-email substitutes.
      await db
        .update(coverageInstancesTable)
        .set({ reminderSentAt: now })
        .where(eq(coverageInstancesTable.id, row.instanceId));
      continue;
    }

    let studentName: string | null = null;
    if (row.studentId) {
      const [stu] = await db
        .select({ firstName: studentsTable.firstName, lastName: studentsTable.lastName })
        .from(studentsTable)
        .where(eq(studentsTable.id, row.studentId));
      if (stu) studentName = `${stu.firstName} ${stu.lastName}`;
    }

    const built = buildCoverageReminderEmail({
      substituteName: `${row.subFirst} ${row.subLast}`,
      absenceDate: row.absenceDate,
      startTime: row.startTime ?? null,
      endTime: row.endTime ?? null,
      studentName,
      location: row.location ?? null,
      notes: row.notes ?? null,
    });

    try {
      const result = await sendAdminEmail({
        to: [row.subEmail],
        subject: built.subject,
        html: built.html,
        text: built.text,
        notificationType: "coverage_reminder",
      });

      // Mark as reminded regardless of provider success: we don't want a stuck
      // RESEND_API_KEY=missing environment to spam at every tick. The
      // sendAdminEmail call already logs failures, and operators can clear
      // reminder_sent_at manually if they want a retry.
      await db
        .update(coverageInstancesTable)
        .set({ reminderSentAt: now })
        .where(eq(coverageInstancesTable.id, row.instanceId));

      if (result.success) emailsSent++;
    } catch (err) {
      console.error(
        `[CoverageReminders] Send failed for instance #${row.instanceId}:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  console.log(
    `[CoverageReminders] window=${windowHours}h considered=${considered} sent=${emailsSent} ` +
      `skipped_acknowledged=${skippedAcknowledged} skipped_no_email=${skippedNoEmail}`,
  );

  return { considered, emailsSent, skippedAcknowledged, skippedNoEmail };
}
