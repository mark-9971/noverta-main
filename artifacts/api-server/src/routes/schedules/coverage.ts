import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  scheduleBlocksTable, staffTable, studentsTable,
  coverageInstancesTable, alertsTable,
} from "@workspace/db";
import {
  AssignSubstituteParams,
  AssignSubstituteBody,
  ListUncoveredSessionsQueryParams,
} from "@workspace/api-zod";
import { eq, and } from "drizzle-orm";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";
import { requireAdmin } from "./shared";
import { sendAdminEmail } from "../../lib/email";
import {
  assertScheduleBlockInCallerDistrict,
  assertStaffInCallerDistrict,
} from "../../lib/districtScope";

const router: IRouter = Router();

router.get("/coverage/suggest-substitute", requireAdmin, async (req, res): Promise<void> => {
  const scheduleBlockId = Number(req.query.scheduleBlockId);
  const absenceDate = String(req.query.absenceDate ?? "");
  if (!scheduleBlockId || isNaN(scheduleBlockId)) {
    res.status(400).json({ error: "scheduleBlockId is required" });
    return;
  }
  if (!absenceDate || !/^\d{4}-\d{2}-\d{2}$/.test(absenceDate)) {
    res.status(400).json({ error: "absenceDate is required (YYYY-MM-DD)" });
    return;
  }

  const { pool } = await import("@workspace/db");
  const districtId = getEnforcedDistrictId(req as AuthedRequest);

  // 1. Fetch the schedule block details — district-scoped to prevent cross-tenant inference
  //    (only return if the block's staff member belongs to the caller's district)
  const blockParams: any[] = [scheduleBlockId];
  let blockDistrictClause = "";
  if (districtId) {
    blockParams.push(districtId);
    blockDistrictClause = `AND s.school_id IN (SELECT id FROM schools WHERE district_id = $${blockParams.length})`;
  }

  const blockResult = await pool.query<{
    original_staff_id: number;
    start_time: string;
    end_time: string;
    day_of_week: string;
    school_id: number | null;
    orig_role: string;
    orig_qualifications: string | null;
  }>(`
    SELECT
      sb.staff_id AS original_staff_id,
      sb.start_time,
      sb.end_time,
      sb.day_of_week,
      s.school_id,
      s.role AS orig_role,
      s.qualifications AS orig_qualifications
    FROM schedule_blocks sb
    JOIN staff s ON s.id = sb.staff_id
    WHERE sb.id = $1 AND sb.deleted_at IS NULL ${blockDistrictClause}
    LIMIT 1
  `, blockParams);

  if (!blockResult.rows.length) {
    res.status(404).json({ error: "Schedule block not found" });
    return;
  }

  const block = blockResult.rows[0];
  const { original_staff_id, start_time, end_time, day_of_week, school_id, orig_role, orig_qualifications } = block;

  // Tokenise qualifications text into a set of lowercase keywords for overlap scoring.
  // school_id is used as the "same building" proxy — in this schema each school
  // maps to a single physical building/site.
  function qualTokens(q: string | null): Set<string> {
    if (!q) return new Set();
    return new Set(q.toLowerCase().split(/[\s,;/|]+/).filter(t => t.length > 1));
  }
  const origQualTokens = qualTokens(orig_qualifications);

  // 2. Find candidates: active staff in the same district, excluding the original
  const candidateParams: any[] = [original_staff_id];
  let districtFilter = "";
  if (districtId) {
    candidateParams.push(districtId);
    districtFilter = `AND s.school_id IN (SELECT id FROM schools WHERE district_id = $${candidateParams.length})`;
  }

  // 3. Exclude staff who are absent on this date OR have a conflicting schedule block
  //    A conflict = another recurring/applicable block on the same day_of_week that overlaps the time window
  const candidatesResult = await pool.query<{
    id: number;
    first_name: string;
    last_name: string;
    role: string;
    school_id: number | null;
    qualifications: string | null;
  }>(`
    SELECT s.id, s.first_name, s.last_name, s.role, s.school_id, s.qualifications
    FROM staff s
    WHERE s.id != $1
      AND s.status = 'active'
      AND s.deleted_at IS NULL
      ${districtFilter}
      AND s.id NOT IN (
        SELECT staff_id FROM staff_absences
        WHERE absence_date = $${candidateParams.push(absenceDate)}
      )
      AND s.id NOT IN (
        SELECT staff_id FROM schedule_blocks
        WHERE deleted_at IS NULL
          AND day_of_week = $${candidateParams.push(day_of_week)}
          AND start_time < $${candidateParams.push(end_time)}
          AND end_time > $${candidateParams.push(start_time)}
          AND (
            is_recurring = true
            OR (is_recurring = false AND week_of = (
              SELECT to_char(date_trunc('week', $${candidateParams.push(absenceDate)}::date + interval '1 day') - interval '1 day', 'YYYY-MM-DD')
            ))
          )
      )
  `, candidateParams);

  // 4. Score and rank candidates
  //    +2 for matching role, +1 for same school (building), +1 per overlapping qualification keyword
  const scored = candidatesResult.rows.map(c => {
    const isRoleMatch = c.role === orig_role;
    const isSameSchool = school_id != null && c.school_id === school_id;
    const candidateQualTokens = qualTokens(c.qualifications);
    const qualOverlap = origQualTokens.size > 0
      ? [...origQualTokens].filter(t => candidateQualTokens.has(t)).length
      : 0;
    const score = (isRoleMatch ? 2 : 0) + (isSameSchool ? 1 : 0) + qualOverlap;
    return { ...c, score, isRoleMatch, isSameSchool, qualOverlap };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Deterministic tie-break: role match first, then same school, then last name alpha
    if (b.isRoleMatch !== a.isRoleMatch) return b.isRoleMatch ? 1 : -1;
    if (b.isSameSchool !== a.isSameSchool) return b.isSameSchool ? 1 : -1;
    return a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name);
  });

  const suggestions = scored.map((c, idx) => ({
    staffId: c.id,
    firstName: c.first_name,
    lastName: c.last_name,
    name: `${c.first_name} ${c.last_name}`,
    role: c.role,
    schoolId: c.school_id,
    isSameSchool: c.isSameSchool,
    isRoleMatch: c.isRoleMatch,
    qualOverlap: c.qualOverlap,
    score: c.score,
    isSuggested: idx < 3,
  }));

  res.json({ suggestions, originalRole: orig_role, schoolId: school_id });
});

router.get("/schedule-blocks/uncovered", requireAdmin, async (req, res): Promise<void> => {
  const params = ListUncoveredSessionsQueryParams.safeParse(req.query);
  const { pool } = await import("@workspace/db");

  const whereClauses = ["ci.is_covered = false", "sb.deleted_at IS NULL"];
  const queryParams: any[] = [];

  if (params.success && params.data.schoolId) {
    queryParams.push(Number(params.data.schoolId));
    whereClauses.push(`sb.staff_id IN (SELECT id FROM staff WHERE school_id = $${queryParams.length})`);
  }
  if (params.success && params.data.startDate) {
    queryParams.push(params.data.startDate);
    whereClauses.push(`ci.absence_date >= $${queryParams.length}`);
  }
  if (params.success && params.data.endDate) {
    queryParams.push(params.data.endDate);
    whereClauses.push(`ci.absence_date <= $${queryParams.length}`);
  }

  const q = `
    SELECT
      ci.id AS instance_id,
      ci.schedule_block_id,
      ci.absence_date,
      ci.absence_id,
      ci.substitute_staff_id,
      ci.is_covered,
      sub.first_name AS sub_staff_first,
      sub.last_name AS sub_staff_last,
      sb.day_of_week,
      sb.start_time,
      sb.end_time,
      sb.student_id,
      sb.location,
      stu.first_name AS student_first,
      stu.last_name AS student_last,
      st.name AS service_type_name,
      ci.original_staff_id,
      orig.first_name AS original_staff_first,
      orig.last_name AS original_staff_last
    FROM coverage_instances ci
    JOIN schedule_blocks sb ON sb.id = ci.schedule_block_id
    LEFT JOIN students stu ON stu.id = sb.student_id
    LEFT JOIN service_types st ON st.id = sb.service_type_id
    LEFT JOIN staff orig ON orig.id = ci.original_staff_id
    LEFT JOIN staff sub ON sub.id = ci.substitute_staff_id
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY ci.absence_date ASC, sb.start_time ASC
  `;

  const result = await pool.query(q, queryParams);
  res.json(result.rows.map((b: any) => ({
    instanceId: b.instance_id,
    id: b.schedule_block_id,
    absenceDate: b.absence_date ?? null,
    dayOfWeek: b.day_of_week,
    startTime: b.start_time,
    endTime: b.end_time,
    studentId: b.student_id,
    studentName: b.student_first ? `${b.student_first} ${b.student_last}` : null,
    serviceTypeName: b.service_type_name ?? null,
    originalStaffId: b.original_staff_id,
    originalStaffName: b.original_staff_first ? `${b.original_staff_first} ${b.original_staff_last}` : null,
    substituteStaffId: b.substitute_staff_id ?? null,
    substituteStaffName: b.sub_staff_first ? `${b.sub_staff_first} ${b.sub_staff_last}` : null,
    absenceId: b.absence_id ?? null,
    isCovered: b.is_covered,
    location: b.location ?? null,
  })));
});

router.post("/schedule-blocks/:id/assign-substitute", requireAdmin, async (req, res): Promise<void> => {
  const params = AssignSubstituteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const parsed = AssignSubstituteBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // Body-IDOR defense: both the schedule block (via its assigned staff) and the
  // substitute staff id must belong to the caller's district. Without this an
  // admin in District A could attach a District B substitute to a District B
  // block by passing crafted ids.
  const authed = req as AuthedRequest;
  if (!(await assertScheduleBlockInCallerDistrict(authed, params.data.id, res))) return;
  if (!(await assertStaffInCallerDistrict(authed, parsed.data.substituteStaffId, res))) return;

  const [sub] = await db.select({ id: staffTable.id, firstName: staffTable.firstName, lastName: staffTable.lastName, email: staffTable.email })
    .from(staffTable).where(eq(staffTable.id, parsed.data.substituteStaffId));
  if (!sub) { res.status(404).json({ error: "Substitute staff not found" }); return; }

  const conditions: any[] = [eq(coverageInstancesTable.scheduleBlockId, params.data.id)];
  if (parsed.data.absenceDate) {
    conditions.push(eq(coverageInstancesTable.absenceDate, parsed.data.absenceDate));
  }

  const [instance] = await db
    .update(coverageInstancesTable)
    .set({ substituteStaffId: parsed.data.substituteStaffId, isCovered: true })
    .where(and(...conditions))
    .returning();

  if (!instance) { res.status(404).json({ error: "Coverage instance not found for this block and date" }); return; }

  const [block] = await db.select({
    studentId: scheduleBlocksTable.studentId,
    startTime: scheduleBlocksTable.startTime,
    endTime: scheduleBlocksTable.endTime,
    dayOfWeek: scheduleBlocksTable.dayOfWeek,
    location: scheduleBlocksTable.location,
    notes: scheduleBlocksTable.notes,
  }).from(scheduleBlocksTable).where(eq(scheduleBlocksTable.id, params.data.id));

  let studentName = "";
  if (block?.studentId) {
    const [stu] = await db.select({ firstName: studentsTable.firstName, lastName: studentsTable.lastName })
      .from(studentsTable).where(eq(studentsTable.id, block.studentId));
    if (stu) studentName = `${stu.firstName} ${stu.lastName}`;
  }

  await db.insert(alertsTable).values({
    type: "coverage_assignment",
    severity: "info",
    staffId: parsed.data.substituteStaffId,
    studentId: block?.studentId ?? null,
    message: `You have been assigned to cover a session${studentName ? ` for ${studentName}` : ""} on ${instance.absenceDate}${block ? ` (${block.startTime}–${block.endTime})` : ""}${block?.location ? ` at ${block.location}` : ""}.`,
    suggestedAction: "Review session details and prepare for coverage",
  }).onConflictDoNothing();

  if (sub.email) {
    const subName = `${sub.firstName} ${sub.lastName}`;
    const dateLabel = instance.absenceDate;
    const timeLabel = block ? `${block.startTime}–${block.endTime}` : "";
    const locationLabel = block?.location ?? "";
    const notesLabel = block?.notes ?? "";
    const subject = `Coverage Assignment — ${dateLabel}${timeLabel ? ` ${timeLabel}` : ""}`;
    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${subject}</title>
<style>body{font-family:Arial,sans-serif;font-size:14px;color:#111;background:#f9fafb;margin:0;padding:0}.wrapper{max-width:600px;margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden}.header{background:#065f46;color:#fff;padding:20px 24px}.body{padding:24px}.detail-row{margin:6px 0;font-size:14px}.label{font-weight:bold;color:#374151;display:inline-block;width:110px}.notes-box{background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 16px;margin-top:16px;font-size:13px}.footer{background:#f3f4f6;padding:12px 24px;font-size:11px;color:#6b7280;border-top:1px solid #e5e7eb}</style>
</head><body><div class="wrapper">
<div class="header"><h1 style="margin:0;font-size:17px">Coverage Assignment</h1><p style="margin:4px 0 0;font-size:11px;opacity:.8">Trellis SPED Platform</p></div>
<div class="body">
<p>Hi ${subName},</p>
<p>You have been assigned to cover a session. Please review the details below and prepare accordingly.</p>
<div class="detail-row"><span class="label">Date:</span> ${dateLabel}</div>
${timeLabel ? `<div class="detail-row"><span class="label">Time:</span> ${timeLabel}</div>` : ""}
${locationLabel ? `<div class="detail-row"><span class="label">Location:</span> ${locationLabel}</div>` : ""}
${studentName ? `<div class="detail-row"><span class="label">Student:</span> ${studentName}</div>` : ""}
${notesLabel ? `<div class="notes-box"><strong>Special Notes:</strong><br>${notesLabel.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div>` : ""}
<p style="margin-top:20px;color:#6b7280;font-size:13px">Please log in to Trellis to view full session details.</p>
</div>
<div class="footer"><p>Trellis SPED Compliance Platform — Confidential. This message was sent because you were assigned as a substitute provider.</p></div>
</div></body></html>`;
    const text = `Hi ${subName},\n\nYou have been assigned to cover a session.\n\nDate: ${dateLabel}${timeLabel ? `\nTime: ${timeLabel}` : ""}${locationLabel ? `\nLocation: ${locationLabel}` : ""}${studentName ? `\nStudent: ${studentName}` : ""}${notesLabel ? `\nSpecial Notes: ${notesLabel}` : ""}\n\nPlease log in to Trellis to view full session details.\n\nTrellis SPED Compliance Platform`;
    sendAdminEmail({ to: [sub.email], subject, html, text, notificationType: "coverage_assignment" }).catch((err: unknown) => {
      console.error("[coverage_assignment] Email send error:", err instanceof Error ? err.message : String(err));
    });
  }

  res.json({
    instanceId: instance.id,
    scheduleBlockId: instance.scheduleBlockId,
    absenceDate: instance.absenceDate,
    substituteStaffId: sub.id,
    substituteStaffName: `${sub.firstName} ${sub.lastName}`,
    isCovered: true,
    message: `${sub.firstName} ${sub.lastName} assigned as substitute`,
  });
});

router.get("/coverage/history", requireAdmin, async (req, res): Promise<void> => {
  const { pool } = await import("@workspace/db");
  const districtId = getEnforcedDistrictId(req as AuthedRequest);

  const whereClauses = ["ci.is_covered = true", "sb.deleted_at IS NULL"];
  const queryParams: any[] = [];

  if (districtId) {
    queryParams.push(districtId);
    whereClauses.push(`orig_staff.school_id IN (SELECT id FROM schools WHERE district_id = $${queryParams.length})`);
  }

  if (req.query.startDate) {
    queryParams.push(String(req.query.startDate));
    whereClauses.push(`ci.absence_date >= $${queryParams.length}`);
  }
  if (req.query.endDate) {
    queryParams.push(String(req.query.endDate));
    whereClauses.push(`ci.absence_date <= $${queryParams.length}`);
  }
  if (req.query.substituteId) {
    queryParams.push(Number(req.query.substituteId));
    whereClauses.push(`ci.substitute_staff_id = $${queryParams.length}`);
  }
  if (req.query.originalStaffId) {
    queryParams.push(Number(req.query.originalStaffId));
    whereClauses.push(`ci.original_staff_id = $${queryParams.length}`);
  }
  if (req.query.schoolId) {
    queryParams.push(Number(req.query.schoolId));
    whereClauses.push(`orig_staff.school_id = $${queryParams.length}`);
  }

  const q = `
    SELECT
      ci.id,
      ci.absence_date,
      ci.original_staff_id,
      orig_staff.first_name AS orig_first, orig_staff.last_name AS orig_last, orig_staff.role AS orig_role,
      ci.substitute_staff_id,
      sub_staff.first_name AS sub_first, sub_staff.last_name AS sub_last, sub_staff.role AS sub_role,
      sb.start_time, sb.end_time, sb.day_of_week, sb.location,
      sb.student_id,
      stu.first_name AS stu_first, stu.last_name AS stu_last,
      st.name AS service_type_name,
      ci.created_at
    FROM coverage_instances ci
    JOIN schedule_blocks sb ON sb.id = ci.schedule_block_id
    JOIN staff orig_staff ON orig_staff.id = ci.original_staff_id
    LEFT JOIN staff sub_staff ON sub_staff.id = ci.substitute_staff_id
    LEFT JOIN students stu ON stu.id = sb.student_id
    LEFT JOIN service_types st ON st.id = sb.service_type_id
    WHERE ${whereClauses.join(" AND ")}
    ORDER BY ci.absence_date DESC, sb.start_time ASC
    LIMIT 200
  `;

  const result = await pool.query(q, queryParams);
  res.json(result.rows.map((r: any) => ({
    id: r.id,
    absenceDate: r.absence_date,
    originalStaffId: r.original_staff_id,
    originalStaffName: `${r.orig_first} ${r.orig_last}`,
    originalStaffRole: r.orig_role,
    substituteStaffId: r.substitute_staff_id,
    substituteStaffName: r.sub_first ? `${r.sub_first} ${r.sub_last}` : null,
    substituteStaffRole: r.sub_role ?? null,
    startTime: r.start_time,
    endTime: r.end_time,
    dayOfWeek: r.day_of_week,
    location: r.location ?? null,
    studentId: r.student_id,
    studentName: r.stu_first ? `${r.stu_first} ${r.stu_last}` : null,
    serviceTypeName: r.service_type_name ?? null,
    createdAt: r.created_at,
  })));
});

router.get("/coverage/summary", requireAdmin, async (req, res): Promise<void> => {
  const { pool } = await import("@workspace/db");
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  const dateParam = String(req.query.date ?? new Date().toISOString().slice(0, 10));

  const queryParams: any[] = [dateParam];
  let districtFilter = "";
  if (districtId) {
    queryParams.push(districtId);
    districtFilter = `AND ci.original_staff_id IN (SELECT id FROM staff WHERE school_id IN (SELECT id FROM schools WHERE district_id = $${queryParams.length}))`;
  }
  if (req.query.schoolId) {
    queryParams.push(Number(req.query.schoolId));
    districtFilter += ` AND ci.original_staff_id IN (SELECT id FROM staff WHERE school_id = $${queryParams.length})`;
  }

  const q = `
    SELECT
      COUNT(*) AS total_sessions,
      COUNT(*) FILTER (WHERE ci.is_covered = true) AS covered,
      COUNT(*) FILTER (WHERE ci.is_covered = false) AS uncovered,
      COUNT(DISTINCT ci.original_staff_id) AS absent_staff_count
    FROM coverage_instances ci
    JOIN schedule_blocks sb ON sb.id = ci.schedule_block_id AND sb.deleted_at IS NULL
    WHERE ci.absence_date = $1 ${districtFilter}
  `;

  const result = await pool.query(q, queryParams);
  const row = result.rows[0] ?? { total_sessions: 0, covered: 0, uncovered: 0, absent_staff_count: 0 };
  const total = Number(row.total_sessions);

  res.json({
    date: dateParam,
    totalSessions: total,
    covered: Number(row.covered),
    uncovered: Number(row.uncovered),
    coverageRate: total > 0 ? Math.round((Number(row.covered) / total) * 100) : 100,
    absentStaffCount: Number(row.absent_staff_count),
  });
});

router.get("/coverage/substitute-report", requireAdmin, async (req, res): Promise<void> => {
  const { pool } = await import("@workspace/db");
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  const months = Math.min(Number(req.query.months) || 3, 12);
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const sinceStr = since.toISOString().slice(0, 10);

  const baseParams: any[] = [sinceStr];
  let districtFilter = "";
  if (districtId) {
    baseParams.push(districtId);
    districtFilter = `AND ci.original_staff_id IN (SELECT id FROM staff WHERE school_id IN (SELECT id FROM schools WHERE district_id = $${baseParams.length}))`;
  }
  if (req.query.schoolId) {
    baseParams.push(Number(req.query.schoolId));
    districtFilter += ` AND ci.original_staff_id IN (SELECT id FROM staff WHERE school_id = $${baseParams.length})`;
  }

  const q = `
    SELECT
      ci.substitute_staff_id,
      sub.first_name AS sub_first, sub.last_name AS sub_last, sub.role AS sub_role,
      COUNT(*) AS sessions_covered,
      COUNT(DISTINCT ci.absence_date) AS unique_dates,
      COUNT(DISTINCT ci.original_staff_id) AS providers_covered_for
    FROM coverage_instances ci
    JOIN staff sub ON sub.id = ci.substitute_staff_id
    WHERE ci.is_covered = true AND ci.absence_date >= $1 ${districtFilter}
    GROUP BY ci.substitute_staff_id, sub.first_name, sub.last_name, sub.role
    ORDER BY sessions_covered DESC
  `;

  const result = await pool.query(q, baseParams);

  const absenceQ = `
    SELECT
      ci.original_staff_id,
      orig.first_name AS orig_first, orig.last_name AS orig_last, orig.role AS orig_role,
      COUNT(DISTINCT ci.absence_date) AS absence_dates,
      COUNT(*) AS sessions_affected,
      COUNT(*) FILTER (WHERE ci.is_covered = true) AS sessions_covered
    FROM coverage_instances ci
    JOIN staff orig ON orig.id = ci.original_staff_id
    WHERE ci.absence_date >= $1 ${districtFilter}
    GROUP BY ci.original_staff_id, orig.first_name, orig.last_name, orig.role
    ORDER BY absence_dates DESC
  `;

  const absenceResult = await pool.query(absenceQ, baseParams);

  res.json({
    period: { months, since: since.toISOString().slice(0, 10) },
    substitutes: result.rows.map((r: any) => ({
      staffId: r.substitute_staff_id,
      name: `${r.sub_first} ${r.sub_last}`,
      role: r.sub_role,
      sessionsCovered: Number(r.sessions_covered),
      uniqueDates: Number(r.unique_dates),
      providersCoveredFor: Number(r.providers_covered_for),
    })),
    absences: absenceResult.rows.map((r: any) => ({
      staffId: r.original_staff_id,
      name: `${r.orig_first} ${r.orig_last}`,
      role: r.orig_role,
      absenceDates: Number(r.absence_dates),
      sessionsAffected: Number(r.sessions_affected),
      sessionsCovered: Number(r.sessions_covered),
      coverageRate: Number(r.sessions_affected) > 0
        ? Math.round((Number(r.sessions_covered) / Number(r.sessions_affected)) * 100)
        : 100,
    })),
  });
});

export default router;
