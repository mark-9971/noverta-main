/**
 * Demo-only: shape MetroWest Collaborative compliance state to surface a
 * representative variety of alert types (service delivery, IEP/report
 * deadlines, protective measures, meeting follow-up) and land overall
 * compliance around 80%.
 *
 * Idempotent. Re-run any time after `seed-demo-district.ts` to re-apply.
 *
 *   pnpm --filter @workspace/db exec tsx src/seed-demo-compliance-variety.ts
 *
 * Affects ONLY the district named "MetroWest Collaborative" (is_demo = true).
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

export interface DemoComplianceVarietyResult {
  districtId: number;
  alertsInserted: number;
  alertsSkipped: number;
  totalStudents: number;
  nonCompliantStudents: number;
  compliancePct: string;
}

export async function seedDemoComplianceVariety(): Promise<DemoComplianceVarietyResult> {
  const districtRows = await db.execute(sql`
    SELECT id FROM districts WHERE name = 'MetroWest Collaborative' AND is_demo = true LIMIT 1
  `);
  const districtId = (districtRows.rows[0] as { id: number } | undefined)?.id;
  if (!districtId) {
    throw new Error("MetroWest Collaborative demo district not found. Run seed-demo-district first.");
  }
  console.log(`Shaping compliance variety for district ${districtId}...`);

  // ---- 1) Underlying record mutations (real conditions the engine reads) ----
  // Pick the first 9 active IEPs in id-order to make the script stable across reseeds.
  const ieps = await db.execute(sql`
    SELECT i.id AS iep_id, i.student_id
    FROM iep_documents i
    JOIN students s ON s.id = i.student_id
    JOIN schools sc ON sc.id = s.school_id
    WHERE sc.district_id = ${districtId} AND i.active = true
    ORDER BY s.id
    LIMIT 12
  `);
  type Row = { iep_id: number; student_id: number };
  const rows = ieps.rows as Row[];
  if (rows.length < 9) {
    throw new Error("Not enough active IEPs in MetroWest demo district to shape variety.");
  }
  // Indexed picks (stable across reseeds because we order by s.id).
  const unsignedIep   = rows[2];  // → status='draft'
  const expiringIep   = rows[6];  // → end +15d
  const expiredIep    = rows[8];  // → end -10d
  const latePrSid     = rows[9].student_id; // progress-report parent_notification_date NULL

  await db.execute(sql`UPDATE iep_documents SET status = 'draft' WHERE id = ${unsignedIep.iep_id}`);
  await db.execute(sql`UPDATE iep_documents SET iep_end_date = (CURRENT_DATE + INTERVAL '15 days')::text WHERE id = ${expiringIep.iep_id}`);
  await db.execute(sql`UPDATE iep_documents SET iep_end_date = (CURRENT_DATE - INTERVAL '10 days')::text WHERE id = ${expiredIep.iep_id}`);

  // Late progress report — clear most recent PR's parent notification for that student.
  await db.execute(sql`
    UPDATE progress_reports
    SET parent_notification_date = NULL, parent_notification_method = NULL
    WHERE id = (
      SELECT id FROM progress_reports WHERE student_id = ${latePrSid}
      ORDER BY period_end DESC LIMIT 1
    )
  `);

  // Meeting minutes pending — most recent completed team meeting in district.
  await db.execute(sql`
    UPDATE team_meetings
    SET minutes_finalized = false
    WHERE id = (
      SELECT tm.id FROM team_meetings tm
      JOIN students s ON s.id = tm.student_id
      JOIN schools sc ON sc.id = s.school_id
      WHERE sc.district_id = ${districtId} AND tm.status = 'completed'
      ORDER BY tm.scheduled_date DESC LIMIT 1
    )
  `);

  // Restraint incidents needing administrator review — two most recent in district.
  await db.execute(sql`
    UPDATE restraint_incidents
    SET status = 'open', admin_reviewed_at = NULL, admin_reviewed_by = NULL
    WHERE id IN (
      SELECT ri.id FROM restraint_incidents ri
      JOIN students s ON s.id = ri.student_id
      JOIN schools sc ON sc.id = s.school_id
      WHERE sc.district_id = ${districtId}
      ORDER BY ri.incident_date DESC LIMIT 2
    )
  `);

  // Pending administrator signature on the most recent incident.
  const adminRow = await db.execute(sql`
    SELECT st.id FROM staff st JOIN schools sc ON sc.id = st.school_id
    WHERE sc.district_id = ${districtId} AND st.role = 'admin' AND st.deleted_at IS NULL
    ORDER BY st.id LIMIT 1
  `);
  const adminId = (adminRow.rows[0] as { id: number } | undefined)?.id;
  if (adminId) {
    await db.execute(sql`
      INSERT INTO incident_signatures (incident_id, staff_id, role, signature_name, requested_at, status, notes)
      SELECT ri.id, ${adminId}, 'admin', 'Pending Administrator Signature',
             (CURRENT_DATE - INTERVAL '1 day')::text || 'T09:00:00',
             'pending',
             'Awaiting administrator signature per 603 CMR 46.06'
      FROM restraint_incidents ri
      JOIN students s ON s.id = ri.student_id
      JOIN schools sc ON sc.id = s.school_id
      WHERE sc.district_id = ${districtId} AND ri.status = 'open'
        AND NOT EXISTS (SELECT 1 FROM incident_signatures sig WHERE sig.incident_id = ri.id AND sig.status = 'pending' AND sig.role = 'admin')
      ORDER BY ri.incident_date DESC LIMIT 1
    `);
  }

  // ---- 2) Resolve unrelated stale alerts so demo focuses on representative cases ----
  // Pick the 9 students that will carry our variety alerts.
  const variety = [
    unsignedIep.student_id,
    expiringIep.student_id,
    expiredIep.student_id,
    latePrSid,
  ];
  // Add up to 5 more students with high recent missed-session counts so the
  // service-delivery alerts are backed by real data.
  const missedRows = await db.execute(sql`
    SELECT sl.student_id, COUNT(*)::int AS missed
    FROM session_logs sl
    JOIN students s ON s.id = sl.student_id
    JOIN schools sc ON sc.id = s.school_id
    WHERE sc.district_id = ${districtId}
      AND sl.status = 'missed' AND sl.deleted_at IS NULL
      AND sl.session_date::date >= CURRENT_DATE - 60
    GROUP BY sl.student_id
    ORDER BY missed DESC LIMIT 8
  `);
  for (const r of missedRows.rows as { student_id: number }[]) {
    if (variety.length >= 9) break;
    if (!variety.includes(r.student_id)) variety.push(r.student_id);
  }
  // Also include the meeting-follow-up student.
  const meetSid = (await db.execute(sql`
    SELECT tm.student_id FROM team_meetings tm
    JOIN students s ON s.id = tm.student_id
    JOIN schools sc ON sc.id = s.school_id
    WHERE sc.district_id = ${districtId} AND tm.minutes_finalized = false AND tm.status = 'completed'
    ORDER BY tm.scheduled_date DESC LIMIT 1
  `)).rows[0] as { student_id: number } | undefined;
  if (meetSid && !variety.includes(meetSid.student_id)) variety.push(meetSid.student_id);

  // Include the two restraint-incident students.
  const incSids = (await db.execute(sql`
    SELECT DISTINCT ri.student_id FROM restraint_incidents ri
    JOIN students s ON s.id = ri.student_id
    JOIN schools sc ON sc.id = s.school_id
    WHERE sc.district_id = ${districtId} AND ri.status = 'open'
  `)).rows as { student_id: number }[];
  for (const r of incSids) if (!variety.includes(r.student_id)) variety.push(r.student_id);

  await db.execute(sql`
    UPDATE alerts SET resolved = true, resolved_at = NOW(),
                      resolved_note = '[demo-variety] auto-resolved to focus demo on representative cases'
    WHERE resolved = false
      AND student_id IN (
        SELECT s.id FROM students s JOIN schools sc ON sc.id = s.school_id WHERE sc.district_id = ${districtId}
      )
      AND student_id NOT IN (${sql.raw(variety.join(","))})
  `);

  // ---- 3) Insert variety alerts (idempotent via [demo-variety:KEY] tag) ----
  const variants: Array<{ key: string; type: string; sev: string; sid: number; msg: string; action: string }> = [
    { key: "missed-1", type: "missed_sessions", sev: "critical", sid: variety[4] ?? variety[0],
      msg: "Student has 50+ missed sessions in the last 60 days — service delivery at risk",
      action: "Review schedule and contact provider; consider make-up sessions" },
    { key: "behind-1", type: "behind_on_minutes", sev: "high", sid: variety[5] ?? variety[1],
      msg: "Student is behind on required service minutes for the current quarter",
      action: "Schedule make-up sessions before quarter end" },
    { key: "projected-1", type: "projected_shortfall", sev: "high", sid: variety[6] ?? variety[2],
      msg: "Student projected to fall short of IEP service minutes by quarter end at current pace",
      action: "Increase delivery cadence or schedule compensatory time" },
    { key: "iep-expired-1", type: "iep_expired", sev: "critical", sid: expiredIep.student_id,
      msg: "IEP expired 10 days ago — no annual review on calendar",
      action: "Schedule Annual IEP Review immediately and notify parents per 603 CMR 28.05" },
    { key: "iep-expiring-1", type: "iep_expiring", sev: "high", sid: expiringIep.student_id,
      msg: "IEP expires in 15 days — no annual review scheduled",
      action: "Send N1 notice and schedule Annual IEP Review within 10 school days" },
    { key: "unsigned-1", type: "compliance", sev: "high", sid: unsignedIep.student_id,
      msg: "IEP draft awaiting team signatures; renewal due before expiration",
      action: "Route draft to team members for signature; finalize before iep_end_date" },
    { key: "pr-late-1", type: "compliance", sev: "medium", sid: latePrSid,
      msg: "Q2 progress report not sent to parent (parent_notification_date is null)",
      action: "Send report via parent portal or email and record notification method" },
  ];
  if (incSids[0]) variants.push({
    key: "restraint-review-1", type: "restraint_review", sev: "high", sid: incSids[0].student_id,
    msg: "Restraint incident awaiting administrator review and signature",
    action: "Open incident, complete admin review, and sign per 603 CMR 46.06",
  });
  if (incSids[1]) variants.push({
    key: "restraint-review-2", type: "restraint_review", sev: "medium", sid: incSids[1].student_id,
    msg: "Earlier restraint incident still awaiting administrator review",
    action: "Complete administrator review; written report to parents required within 3 school days",
  });
  if (meetSid) variants.push({
    key: "meeting-pending-1", type: "incident_follow_up", sev: "medium", sid: meetSid.student_id,
    msg: "Annual IEP Review meeting is complete but minutes are not finalized",
    action: "Finalize meeting minutes and distribute to team",
  });
  variants.push({
    key: "overdue-eval-1", type: "overdue_evaluation_reminder", sev: "high", sid: expiredIep.student_id,
    msg: "Triennial re-evaluation due in 14 days; consent not yet returned",
    action: "Send re-evaluation consent and confirm receipt within 5 school days",
  });
  variants.push({
    key: "transition-1", type: "incomplete_transition_reminder", sev: "medium", sid: expiringIep.student_id,
    msg: "Transition plan section is incomplete on draft IEP (age 14+)",
    action: "Complete transition assessment and post-secondary goals before annual review",
  });

  let inserted = 0, skipped = 0;
  for (const v of variants) {
    const tag = `[demo-variety:${v.key}]`;
    const existsRow = await db.execute(sql`SELECT COUNT(*)::int AS c FROM alerts WHERE message LIKE ${'%' + tag + '%'}`);
    const c = (existsRow.rows[0] as { c: number }).c;
    if (c > 0) { skipped++; continue; }
    await db.execute(sql`
      INSERT INTO alerts (type, severity, student_id, message, suggested_action, resolved)
      VALUES (${v.type}, ${v.sev}, ${v.sid}, ${v.msg + " " + tag}, ${v.action}, false)
    `);
    inserted++;
  }
  console.log(`Variety alerts: ${inserted} inserted, ${skipped} already present.`);

  const tally = await db.execute(sql`
    WITH d_students AS (SELECT s.id FROM students s JOIN schools sc ON sc.id = s.school_id WHERE sc.district_id = ${districtId} AND s.deleted_at IS NULL),
         affected AS (SELECT DISTINCT a.student_id FROM alerts a JOIN d_students ds ON ds.id = a.student_id WHERE a.resolved = false)
    SELECT (SELECT COUNT(*) FROM d_students) AS total,
           (SELECT COUNT(*) FROM affected) AS non_compliant,
           ROUND(100.0 * (1 - (SELECT COUNT(*) FROM affected)::numeric / (SELECT COUNT(*) FROM d_students)), 1) AS compliance_pct
  `);
  const t = tally.rows[0] as { total: number; non_compliant: number; compliance_pct: string };
  console.log(`Done. Compliance ${t.compliance_pct}%  (${t.non_compliant} of ${t.total} students with active alerts)`);

  return {
    districtId,
    alertsInserted: inserted,
    alertsSkipped: skipped,
    totalStudents: Number(t.total),
    nonCompliantStudents: Number(t.non_compliant),
    compliancePct: String(t.compliance_pct),
  };
}

// CLI entry: `pnpm --filter @workspace/db exec tsx src/seed-demo-compliance-variety.ts`
const isCli = typeof process !== "undefined" && process.argv[1]?.endsWith("seed-demo-compliance-variety.ts");
if (isCli) {
  seedDemoComplianceVariety().catch((e) => { console.error(e); process.exit(1); });
}
