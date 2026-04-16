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

const router: IRouter = Router();

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

  const [sub] = await db.select({ id: staffTable.id, firstName: staffTable.firstName, lastName: staffTable.lastName })
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
