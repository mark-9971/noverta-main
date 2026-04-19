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

  // ---- 2.5) Drop service delivery for 4 students so risk status matches alerts ----
  // The behind_on_minutes / projected_shortfall / missed_sessions alerts above
  // describe service-delivery problems but the underlying session data still
  // shows them on_track. Convert enough current-month completed sessions to
  // 'missed' to push delivered/expected_by_now under the at_risk and
  // out_of_compliance thresholds in artifacts/api-server/src/lib/minuteCalc.ts
  // (out_of_compliance < 70% of expected, at_risk < 85%).
  // Idempotent: re-running finds delivery already at target and skips.
  const riskTargets: Array<{ studentId: number | undefined; targetRatio: number; tag: string }> = [
    // 2 out_of_compliance — aligned with "missed_sessions" critical alert + extra
    { studentId: variety[4], targetRatio: 0.55, tag: "ooc-1" },
    { studentId: variety[7], targetRatio: 0.55, tag: "ooc-2" },
    // 2 at_risk — aligned with "behind_on_minutes" + "projected_shortfall" alerts
    { studentId: variety[5], targetRatio: 0.78, tag: "atr-1" },
    { studentId: variety[6], targetRatio: 0.78, tag: "atr-2" },
  ];
  let sessionsFlipped = 0;
  for (const tgt of riskTargets) {
    if (!tgt.studentId) continue;
    const tag = `[demo-variety:risk-drop:${tgt.tag}]`;
    const srs = await db.execute(sql`
      SELECT id, required_minutes FROM service_requirements
      WHERE student_id = ${tgt.studentId} AND interval_type = 'monthly'
    `);
    for (const sr of srs.rows as { id: number; required_minutes: number }[]) {
      const expRow = await db.execute(sql`
        SELECT (${sr.required_minutes}::float
                * EXTRACT(DAY FROM CURRENT_DATE)::float
                / EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day'))::float
               ) AS expected_now
      `);
      const expectedNow = Number((expRow.rows[0] as { expected_now: number }).expected_now);
      if (!isFinite(expectedNow) || expectedNow <= 0) continue;
      const targetDelivered = Math.floor(expectedNow * tgt.targetRatio);

      const delRow = await db.execute(sql`
        SELECT COALESCE(SUM(duration_minutes), 0)::int AS delivered
        FROM session_logs
        WHERE service_requirement_id = ${sr.id}
          AND deleted_at IS NULL
          AND is_compensatory = false
          AND status IN ('completed','makeup')
          AND session_date::date >= date_trunc('month', CURRENT_DATE)::date
          AND session_date::date <= (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date
      `);
      const delivered = Number((delRow.rows[0] as { delivered: number }).delivered);
      const minutesToRemove = delivered - targetDelivered;
      if (minutesToRemove <= 0) continue;

      const flipped = await db.execute(sql`
        WITH candidates AS (
          SELECT id, duration_minutes,
                 SUM(duration_minutes) OVER (ORDER BY session_date DESC, id DESC
                                             ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running
          FROM session_logs
          WHERE service_requirement_id = ${sr.id}
            AND deleted_at IS NULL
            AND is_compensatory = false
            AND status IN ('completed','makeup')
            AND session_date::date >= date_trunc('month', CURRENT_DATE)::date
            AND session_date::date <= (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month - 1 day')::date
        ),
        to_flip AS (
          SELECT id FROM candidates WHERE running - duration_minutes < ${minutesToRemove}
        )
        UPDATE session_logs
        SET status = 'missed',
            notes = COALESCE(notes, '') || ' ' || ${tag}
        WHERE id IN (SELECT id FROM to_flip)
        RETURNING id
      `);
      sessionsFlipped += flipped.rows.length;
    }
  }
  console.log(`Risk-drop: flipped ${sessionsFlipped} completed sessions to missed across ${riskTargets.filter(t => t.studentId).length} students.`);

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

  // ---- 4) Seed August 2025 sessions for Compliance Trends chart ----
  // The 2025-26 school year for MetroWest starts 2025-09-02, but service
  // requirements begin as early as 2025-08-16. Without any August sessions
  // the Compliance Trends chart shows a jarring 0% compliance dip for August.
  // We insert a realistic two-week set of sessions (Aug 18-29, 2025) so the
  // chart opens with a partial-month reading rather than a blank.
  // Idempotent: guarded by the [trends-aug-seed] notes tag.
  const augSchoolYear = await db.execute(sql`
    SELECT id FROM school_years WHERE district_id = ${districtId} AND label = '2025-2026' LIMIT 1
  `);
  const augSyId = (augSchoolYear.rows[0] as { id: number } | undefined)?.id;

  // Helper: convert total minutes since midnight into "HH:MM" string.
  function minsToHHMM(totalMins: number): string {
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }

  if (augSyId) {
    // Idempotent: check by the seed tag, not by arbitrary August sessions.
    const existingAug = await db.execute(sql`
      SELECT COUNT(*)::int AS c FROM session_logs sl
      JOIN students s ON s.id = sl.student_id
      JOIN schools sc ON sc.id = s.school_id
      WHERE sc.district_id = ${districtId}
        AND sl.notes LIKE '%[trends-aug-seed]%'
        AND sl.deleted_at IS NULL
    `);
    const augCount = (existingAug.rows[0] as { c: number }).c;

    if (augCount === 0) {
      // Fetch one requirement row per student active in August 2025.
      const augStudents = await db.execute(sql`
        SELECT DISTINCT ON (sr.student_id)
          sr.student_id,
          sr.id AS req_id,
          sr.service_type_id,
          CASE
            WHEN sr.interval_type = 'weekly'    THEN sr.required_minutes * 4
            WHEN sr.interval_type = 'quarterly' THEN ROUND(sr.required_minutes / 3.0)
            ELSE sr.required_minutes
          END AS monthly_required,
          st.id AS staff_id
        FROM service_requirements sr
        JOIN students s ON s.id = sr.student_id
        JOIN schools sc ON sc.id = s.school_id
        LEFT JOIN staff st ON st.school_id = s.school_id AND st.deleted_at IS NULL
        WHERE sc.district_id = ${districtId}
          AND s.status = 'active'
          AND sr.start_date::date <= '2025-08-31'
          AND (sr.end_date IS NULL OR sr.end_date::date >= '2025-08-16')
        ORDER BY sr.student_id, sr.id, st.id
      `);

      type AugRow = { student_id: number; req_id: number; service_type_id: number; monthly_required: number; staff_id: number };
      const augRows = augStudents.rows as AugRow[];

      // Distribute one session per student across two school weeks (Aug 18–29).
      // Target: 30% of monthly requirement over 2 weeks (~60% of the prorated half-month).
      // Cap each session at 90 min to stay realistic; overflow goes to a second session.
      const week1 = ["2025-08-18", "2025-08-19", "2025-08-20", "2025-08-21", "2025-08-22"];
      const week2 = ["2025-08-25", "2025-08-26", "2025-08-27", "2025-08-28", "2025-08-29"];
      const SESSION_CAP = 90; // minutes
      let augSessionsInserted = 0;

      for (let i = 0; i < augRows.length; i++) {
        const row = augRows[i]!;
        const targetMins = Math.round(row.monthly_required * 0.30);
        if (targetMins <= 0) continue;

        const dur1 = Math.min(targetMins, SESSION_CAP);
        const dur2 = targetMins - dur1;
        const date1 = week1[i % week1.length]!;
        const date2 = week2[i % week2.length]!;

        // Start time in total minutes since midnight (stagger per student to avoid clashes).
        const startMins = (8 * 60) + (i % 4) * 15; // 08:00, 08:15, 08:30, 08:45
        const startTime = minsToHHMM(startMins);
        const endTime1 = minsToHHMM(startMins + dur1);
        const createdAt1 = `${date1}T${endTime1}:00Z`; // logged at session end — always timely

        await db.execute(sql`
          INSERT INTO session_logs
            (student_id, service_requirement_id, service_type_id, staff_id,
             session_date, start_time, end_time, duration_minutes,
             location, delivery_mode, status, is_makeup, is_compensatory,
             school_year_id, notes, created_at, updated_at)
          VALUES
            (${row.student_id}, ${row.req_id}, ${row.service_type_id}, ${row.staff_id},
             ${date1}, ${startTime}, ${endTime1}, ${dur1},
             'school', 'in_person', 'completed', false, false,
             ${augSyId}, '[trends-aug-seed]',
             ${createdAt1}, ${createdAt1})
        `);
        augSessionsInserted++;

        if (dur2 > 0) {
          const endTime2 = minsToHHMM(startMins + dur2);
          const createdAt2 = `${date2}T${endTime2}:00Z`;
          await db.execute(sql`
            INSERT INTO session_logs
              (student_id, service_requirement_id, service_type_id, staff_id,
               session_date, start_time, end_time, duration_minutes,
               location, delivery_mode, status, is_makeup, is_compensatory,
               school_year_id, notes, created_at, updated_at)
            VALUES
              (${row.student_id}, ${row.req_id}, ${row.service_type_id}, ${row.staff_id},
               ${date2}, ${startTime}, ${endTime2}, ${dur2},
               'school', 'in_person', 'completed', false, false,
               ${augSyId}, '[trends-aug-seed]',
               ${createdAt2}, ${createdAt2})
          `);
          augSessionsInserted++;
        }
      }
      console.log(`Compliance Trends: inserted ${augSessionsInserted} August 2025 seed sessions for ${augRows.length} students.`);
    } else {
      console.log(`Compliance Trends: ${augCount} tagged August seed sessions already present, skipping.`);
    }
  } else {
    console.log("Compliance Trends: 2025-2026 school year not found, skipping August seed.");
  }

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
