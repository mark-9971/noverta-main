import { Router, type IRouter } from "express";
import { db, staffSchedulesTable, staffTable, schoolsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireRoles, getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import { logAudit } from "../lib/auditLog";

const router: IRouter = Router();

const VALID_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

const SCHOOL_HOURS_START = "07:00";
const SCHOOL_HOURS_END = "16:00";
const SLOT_INTERVAL_MIN = 60;

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(m: number): string {
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function timesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return timeToMinutes(s1) < timeToMinutes(e2) && timeToMinutes(s2) < timeToMinutes(e1);
}

function datesOverlap(
  fromA: string | null, toA: string | null,
  fromB: string | null, toB: string | null
): boolean {
  const startA = fromA || "1900-01-01";
  const endA = toA || "9999-12-31";
  const startB = fromB || "1900-01-01";
  const endB = toB || "9999-12-31";
  return startA <= endB && startB <= endA;
}

async function verifyScheduleInDistrict(scheduleId: number, districtId: number | null): Promise<boolean> {
  if (!districtId) return true;
  const result = await db.execute(sql`
    SELECT 1 FROM staff_schedules ss
    JOIN schools sc ON sc.id = ss.school_id
    WHERE ss.id = ${scheduleId} AND sc.district_id = ${districtId}
  `);
  const rows = "rows" in result ? result.rows : result;
  return Array.isArray(rows) && rows.length > 0;
}

async function verifySchoolInDistrict(schoolId: number, districtId: number | null): Promise<boolean> {
  if (!districtId) return true;
  const result = await db.execute(sql`SELECT 1 FROM schools WHERE id = ${schoolId} AND district_id = ${districtId}`);
  const rows = "rows" in result ? result.rows : result;
  return Array.isArray(rows) && rows.length > 0;
}

async function verifyStaffInDistrict(staffId: number, districtId: number | null): Promise<boolean> {
  if (!districtId) return true;
  const result = await db.execute(sql`
    SELECT 1 FROM staff s
    JOIN schools sc ON sc.id = s.school_id
    WHERE s.id = ${staffId} AND sc.district_id = ${districtId}
  `);
  const rows = "rows" in result ? result.rows : result;
  return Array.isArray(rows) && rows.length > 0;
}

function findAvailableSlots(
  existingBlocks: Array<{ start: number; end: number }>,
  dayStart: number,
  dayEnd: number
): Array<{ start: string; end: string }> {
  const sorted = [...existingBlocks].sort((a, b) => a.start - b.start);
  const gaps: Array<{ start: string; end: string }> = [];
  let cursor = dayStart;
  for (const block of sorted) {
    if (block.start > cursor) {
      gaps.push({ start: minutesToTime(cursor), end: minutesToTime(block.start) });
    }
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < dayEnd) {
    gaps.push({ start: minutesToTime(cursor), end: minutesToTime(dayEnd) });
  }
  return gaps;
}

router.get("/staff-schedules", async (req, res) => {
  try {
    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    const { staffId, schoolId, dayOfWeek, serviceTypeId } = req.query;

    let query = sql`
      SELECT ss.*, 
        s.first_name as "staffFirstName", s.last_name as "staffLastName", s.role as "staffRole",
        sc.name as "schoolName",
        st.name as "serviceTypeName", st.category as "serviceTypeCategory"
      FROM staff_schedules ss
      JOIN staff s ON s.id = ss.staff_id
      JOIN schools sc ON sc.id = ss.school_id
      LEFT JOIN service_types st ON st.id = ss.service_type_id
      WHERE 1=1
    `;

    if (districtId) {
      query = sql`${query} AND sc.district_id = ${districtId}`;
    }
    if (staffId) {
      query = sql`${query} AND ss.staff_id = ${Number(staffId)}`;
    }
    if (schoolId) {
      query = sql`${query} AND ss.school_id = ${Number(schoolId)}`;
    }
    if (dayOfWeek && VALID_DAYS.includes(String(dayOfWeek))) {
      query = sql`${query} AND ss.day_of_week = ${String(dayOfWeek)}`;
    }
    if (serviceTypeId) {
      query = sql`${query} AND ss.service_type_id = ${Number(serviceTypeId)}`;
    }

    query = sql`${query} ORDER BY ss.day_of_week, ss.start_time`;

    const result = await db.execute(query);
    const rows = "rows" in result ? result.rows : result;
    res.json({ schedules: rows });
  } catch (err) {
    console.error("GET /staff-schedules error:", err);
    res.status(500).json({ error: "Failed to load schedules" });
  }
});

router.get("/staff-schedules/conflicts", async (req, res) => {
  try {
    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    const { staffId } = req.query;

    let query = sql`
      SELECT 
        a.id as "scheduleAId", b.id as "scheduleBId",
        a.staff_id as "staffId",
        s.first_name as "staffFirstName", s.last_name as "staffLastName",
        a.day_of_week as "dayOfWeek",
        a.start_time as "aStartTime", a.end_time as "aEndTime",
        a.school_id as "aSchoolId", sa.name as "aSchoolName",
        a.effective_from as "aEffectiveFrom", a.effective_to as "aEffectiveTo",
        b.start_time as "bStartTime", b.end_time as "bEndTime",
        b.school_id as "bSchoolId", sb.name as "bSchoolName",
        b.effective_from as "bEffectiveFrom", b.effective_to as "bEffectiveTo"
      FROM staff_schedules a
      JOIN staff_schedules b ON a.staff_id = b.staff_id 
        AND a.day_of_week = b.day_of_week 
        AND a.id < b.id
      JOIN staff s ON s.id = a.staff_id
      JOIN schools sa ON sa.id = a.school_id
      JOIN schools sb ON sb.id = b.school_id
      WHERE a.start_time < b.end_time AND b.start_time < a.end_time
        AND (a.effective_from IS NULL OR b.effective_to IS NULL OR a.effective_from <= b.effective_to)
        AND (b.effective_from IS NULL OR a.effective_to IS NULL OR b.effective_from <= a.effective_to)
    `;

    if (districtId) {
      query = sql`${query} AND sa.district_id = ${districtId}`;
    }
    if (staffId) {
      query = sql`${query} AND a.staff_id = ${Number(staffId)}`;
    }

    query = sql`${query} ORDER BY s.last_name, a.day_of_week`;

    const result = await db.execute(query);
    const rows = "rows" in result ? result.rows : result;

    const conflictsWithSuggestions = (rows as Array<Record<string, unknown>>).map(c => {
      const suggestions: string[] = [];
      const aEnd = timeToMinutes(c.aEndTime as string);
      const bStart = timeToMinutes(c.bStartTime as string);
      const aStart = timeToMinutes(c.aStartTime as string);
      const bEnd = timeToMinutes(c.bEndTime as string);

      if (aStart < bStart) {
        suggestions.push(
          `Shorten block at ${c.aSchoolName} to end at ${minutesToTime(bStart)} (currently ends ${c.aEndTime})`
        );
      }
      if (bEnd > aEnd) {
        suggestions.push(
          `Move block at ${c.bSchoolName} to start at ${minutesToTime(aEnd)} (currently starts ${c.bStartTime})`
        );
      }
      if (c.aSchoolId !== c.bSchoolId) {
        suggestions.push(
          `Consolidate both blocks to the same school to eliminate travel conflict`
        );
      }
      if (!suggestions.length) {
        suggestions.push(`Reduce one block's duration to remove the overlap`);
      }

      return { ...c, suggestions };
    });

    res.json({ conflicts: conflictsWithSuggestions });
  } catch (err) {
    console.error("GET /staff-schedules/conflicts error:", err);
    res.status(500).json({ error: "Failed to check conflicts" });
  }
});

router.get("/staff-schedules/coverage-gaps", async (req, res) => {
  try {
    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    const { schoolId } = req.query;

    let schedQuery = sql`
      SELECT ss.school_id as "schoolId", ss.day_of_week as "dayOfWeek", 
        ss.start_time as "startTime", ss.end_time as "endTime",
        sc.name as "schoolName"
      FROM staff_schedules ss
      JOIN schools sc ON sc.id = ss.school_id
      WHERE 1=1
    `;
    if (districtId) {
      schedQuery = sql`${schedQuery} AND sc.district_id = ${districtId}`;
    }
    if (schoolId) {
      schedQuery = sql`${schedQuery} AND ss.school_id = ${Number(schoolId)}`;
    }
    schedQuery = sql`${schedQuery} ORDER BY ss.school_id, ss.day_of_week, ss.start_time`;

    const schedResult = await db.execute(schedQuery);
    const schedRows = ("rows" in schedResult ? schedResult.rows : schedResult) as Array<{
      schoolId: number; dayOfWeek: string; startTime: string; endTime: string; schoolName: string;
    }>;

    let schoolQuery = sql`SELECT id, name FROM schools WHERE 1=1`;
    if (districtId) {
      schoolQuery = sql`${schoolQuery} AND district_id = ${districtId}`;
    }
    if (schoolId) {
      schoolQuery = sql`${schoolQuery} AND id = ${Number(schoolId)}`;
    }
    const schoolResult = await db.execute(schoolQuery);
    const schools = ("rows" in schoolResult ? schoolResult.rows : schoolResult) as Array<{ id: number; name: string }>;

    const dayStart = timeToMinutes(SCHOOL_HOURS_START);
    const dayEnd = timeToMinutes(SCHOOL_HOURS_END);

    const gaps: Array<{
      dayOfWeek: string; schoolId: number; schoolName: string;
      uncoveredSlots: Array<{ start: string; end: string }>;
      totalUncoveredMinutes: number;
    }> = [];

    for (const school of schools) {
      for (const day of VALID_DAYS) {
        const blocks = schedRows
          .filter(r => r.schoolId === school.id && r.dayOfWeek === day)
          .map(r => ({ start: timeToMinutes(r.startTime), end: timeToMinutes(r.endTime) }));

        const uncovered = findAvailableSlots(blocks, dayStart, dayEnd);
        const totalUncoveredMinutes = uncovered.reduce(
          (sum, s) => sum + (timeToMinutes(s.end) - timeToMinutes(s.start)), 0
        );

        if (totalUncoveredMinutes >= SLOT_INTERVAL_MIN) {
          gaps.push({
            dayOfWeek: day,
            schoolId: school.id,
            schoolName: school.name,
            uncoveredSlots: uncovered,
            totalUncoveredMinutes,
          });
        }
      }
    }

    res.json({ gaps });
  } catch (err) {
    console.error("GET /staff-schedules/coverage-gaps error:", err);
    res.status(500).json({ error: "Failed to check coverage gaps" });
  }
});

router.get("/staff-schedules/provider-summary/:staffId", async (req, res) => {
  try {
    const staffId = Number(req.params.staffId);
    const districtId = getEnforcedDistrictId(req as AuthedRequest);

    const result = await db.execute(sql`
      SELECT ss.day_of_week as "dayOfWeek", ss.start_time as "startTime", ss.end_time as "endTime",
        ss.label, sc.id as "schoolId", sc.name as "schoolName",
        ss.service_type_id as "serviceTypeId", st.name as "serviceTypeName"
      FROM staff_schedules ss
      JOIN schools sc ON sc.id = ss.school_id
      LEFT JOIN service_types st ON st.id = ss.service_type_id
      WHERE ss.staff_id = ${staffId}
      ${districtId ? sql`AND sc.district_id = ${districtId}` : sql``}
      ORDER BY ss.day_of_week, ss.start_time
    `);
    const rows = "rows" in result ? result.rows : result;

    const hoursPerSchool = new Map<number, { schoolName: string; minutes: number }>();
    const schedule = (rows as Array<{
      dayOfWeek: string; startTime: string; endTime: string;
      label: string | null; schoolId: number; schoolName: string;
      serviceTypeId: number | null; serviceTypeName: string | null;
    }>);
    for (const row of schedule) {
      const mins = timeToMinutes(row.endTime) - timeToMinutes(row.startTime);
      const existing = hoursPerSchool.get(row.schoolId);
      if (existing) {
        existing.minutes += mins;
      } else {
        hoursPerSchool.set(row.schoolId, { schoolName: row.schoolName, minutes: mins });
      }
    }

    const distribution = Array.from(hoursPerSchool.entries()).map(([schoolId, data]) => ({
      schoolId,
      schoolName: data.schoolName,
      weeklyHours: +(data.minutes / 60).toFixed(1),
    }));

    const totalMinutes = distribution.reduce((sum, d) => sum + d.weeklyHours * 60, 0);

    const dayStart = timeToMinutes(SCHOOL_HOURS_START);
    const dayEnd = timeToMinutes(SCHOOL_HOURS_END);
    const availability: Record<string, Array<{ start: string; end: string }>> = {};
    for (const day of VALID_DAYS) {
      const blocks = schedule
        .filter(s => s.dayOfWeek === day)
        .map(s => ({ start: timeToMinutes(s.startTime), end: timeToMinutes(s.endTime) }));
      const free = findAvailableSlots(blocks, dayStart, dayEnd);
      if (free.length > 0) {
        availability[day] = free;
      }
    }

    res.json({
      staffId,
      schedule: rows,
      distribution,
      totalWeeklyHours: +(totalMinutes / 60).toFixed(1),
      daysScheduled: [...new Set(schedule.map(s => s.dayOfWeek))].length,
      availability,
    });
  } catch (err) {
    console.error("GET /staff-schedules/provider-summary/:staffId error:", err);
    res.status(500).json({ error: "Failed to load provider summary" });
  }
});

router.post("/staff-schedules", requireRoles("admin", "coordinator"), async (req, res) => {
  try {
    const { staffId, schoolId, dayOfWeek, startTime, endTime, label, notes, effectiveFrom, effectiveTo, serviceTypeId } = req.body;

    if (!staffId || !schoolId || !dayOfWeek || !startTime || !endTime) {
      res.status(400).json({ error: "staffId, schoolId, dayOfWeek, startTime, and endTime are required" }); return;
    }
    if (!VALID_DAYS.includes(dayOfWeek)) {
      res.status(400).json({ error: "dayOfWeek must be monday through friday" }); return;
    }
    if (timeToMinutes(startTime) >= timeToMinutes(endTime)) {
      res.status(400).json({ error: "startTime must be before endTime" }); return;
    }

    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    if (!(await verifySchoolInDistrict(Number(schoolId), districtId))) {
      res.status(403).json({ error: "School not found in your district" }); return;
    }
    if (!(await verifyStaffInDistrict(Number(staffId), districtId))) {
      res.status(403).json({ error: "Staff member not found in your district" }); return;
    }

    const existingResult = await db.execute(sql`
      SELECT id, start_time, end_time, school_id, effective_from, effective_to FROM staff_schedules
      WHERE staff_id = ${Number(staffId)} AND day_of_week = ${dayOfWeek}
    `);
    const existing = "rows" in existingResult ? existingResult.rows : existingResult;
    if (Array.isArray(existing)) {
      for (const e of existing) {
        const row = e as { id: number; start_time: string; end_time: string; school_id: number; effective_from: string | null; effective_to: string | null };
        if (
          timesOverlap(startTime, endTime, row.start_time, row.end_time) &&
          datesOverlap(effectiveFrom || null, effectiveTo || null, row.effective_from, row.effective_to)
        ) {
          res.status(409).json({ 
            error: "Schedule conflict detected",
            conflictWith: row.id,
          }); 
          return;
        }
      }
    }

    const [schedule] = await db.insert(staffSchedulesTable).values({
      staffId: Number(staffId),
      schoolId: Number(schoolId),
      serviceTypeId: serviceTypeId ? Number(serviceTypeId) : null,
      dayOfWeek,
      startTime,
      endTime,
      label: label || null,
      notes: notes || null,
      effectiveFrom: effectiveFrom || null,
      effectiveTo: effectiveTo || null,
    }).returning();

    logAudit(req, {
      action: "create",
      targetTable: "staff_schedules",
      targetId: schedule.id,
      summary: `Created schedule for staff ${staffId} at school ${schoolId} on ${dayOfWeek} ${startTime}-${endTime}`,
    });

    res.status(201).json(schedule);
  } catch (err) {
    console.error("POST /staff-schedules error:", err);
    res.status(500).json({ error: "Failed to create schedule" });
  }
});

router.put("/staff-schedules/:id", requireRoles("admin", "coordinator"), async (req, res) => {
  try {
    const scheduleId = Number(req.params.id);
    const districtId = getEnforcedDistrictId(req as AuthedRequest);

    if (!(await verifyScheduleInDistrict(scheduleId, districtId))) {
      res.status(403).json({ error: "Schedule not found in your district" }); return;
    }

    const { schoolId, dayOfWeek, startTime, endTime, label, notes, effectiveFrom, effectiveTo, serviceTypeId } = req.body;

    if (dayOfWeek && !VALID_DAYS.includes(dayOfWeek)) {
      res.status(400).json({ error: "dayOfWeek must be monday through friday" }); return;
    }

    if (schoolId && !(await verifySchoolInDistrict(Number(schoolId), districtId))) {
      res.status(403).json({ error: "School not found in your district" }); return;
    }

    const [existing] = await db.select().from(staffSchedulesTable).where(eq(staffSchedulesTable.id, scheduleId));
    if (!existing) { res.status(404).json({ error: "Schedule not found" }); return; }

    const newDay = dayOfWeek || existing.dayOfWeek;
    const newStart = startTime || existing.startTime;
    const newEnd = endTime || existing.endTime;
    const newEffFrom = effectiveFrom !== undefined ? effectiveFrom : existing.effectiveFrom;
    const newEffTo = effectiveTo !== undefined ? effectiveTo : existing.effectiveTo;

    if (timeToMinutes(newStart) >= timeToMinutes(newEnd)) {
      res.status(400).json({ error: "startTime must be before endTime" }); return;
    }

    const overlapResult = await db.execute(sql`
      SELECT id, start_time, end_time, effective_from, effective_to FROM staff_schedules
      WHERE staff_id = ${existing.staffId} AND day_of_week = ${newDay} AND id != ${scheduleId}
    `);
    const overlaps = "rows" in overlapResult ? overlapResult.rows : overlapResult;
    if (Array.isArray(overlaps)) {
      for (const o of overlaps) {
        const row = o as { id: number; start_time: string; end_time: string; effective_from: string | null; effective_to: string | null };
        if (
          timesOverlap(newStart, newEnd, row.start_time, row.end_time) &&
          datesOverlap(newEffFrom, newEffTo, row.effective_from, row.effective_to)
        ) {
          res.status(409).json({ error: "Schedule conflict detected", conflictWith: row.id }); return;
        }
      }
    }

    const [updated] = await db.update(staffSchedulesTable)
      .set({
        schoolId: schoolId ? Number(schoolId) : existing.schoolId,
        serviceTypeId: serviceTypeId !== undefined ? (serviceTypeId ? Number(serviceTypeId) : null) : existing.serviceTypeId,
        dayOfWeek: newDay,
        startTime: newStart,
        endTime: newEnd,
        label: label !== undefined ? label : existing.label,
        notes: notes !== undefined ? notes : existing.notes,
        effectiveFrom: newEffFrom || null,
        effectiveTo: newEffTo || null,
      })
      .where(eq(staffSchedulesTable.id, scheduleId))
      .returning();

    logAudit(req, {
      action: "update",
      targetTable: "staff_schedules",
      targetId: scheduleId,
      summary: `Updated schedule ${scheduleId}`,
    });

    res.json(updated);
  } catch (err) {
    console.error("PUT /staff-schedules/:id error:", err);
    res.status(500).json({ error: "Failed to update schedule" });
  }
});

router.delete("/staff-schedules/:id", requireRoles("admin", "coordinator"), async (req, res) => {
  try {
    const scheduleId = Number(req.params.id);
    const districtId = getEnforcedDistrictId(req as AuthedRequest);

    if (!(await verifyScheduleInDistrict(scheduleId, districtId))) {
      res.status(403).json({ error: "Schedule not found in your district" }); return;
    }

    const [deleted] = await db.delete(staffSchedulesTable)
      .where(eq(staffSchedulesTable.id, scheduleId))
      .returning();

    if (!deleted) { res.status(404).json({ error: "Schedule not found" }); return; }

    logAudit(req, {
      action: "delete",
      targetTable: "staff_schedules",
      targetId: scheduleId,
      summary: `Deleted schedule ${scheduleId}`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /staff-schedules/:id error:", err);
    res.status(500).json({ error: "Failed to delete schedule" });
  }
});

export default router;
