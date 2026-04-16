import { Router, type IRouter } from "express";
import { db, staffSchedulesTable, staffTable, schoolsTable } from "@workspace/db";
import { eq, and, sql, isNull, or } from "drizzle-orm";
import { requireRoles, getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";
import { logAudit } from "../lib/auditLog";

const router: IRouter = Router();

const VALID_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function timesOverlap(s1: string, e1: string, s2: string, e2: string): boolean {
  return timeToMinutes(s1) < timeToMinutes(e2) && timeToMinutes(s2) < timeToMinutes(e1);
}

router.get("/staff-schedules", async (req, res) => {
  try {
    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    const { staffId, schoolId, dayOfWeek } = req.query;

    let query = sql`
      SELECT ss.*, 
        s.first_name as "staffFirstName", s.last_name as "staffLastName", s.role as "staffRole",
        sc.name as "schoolName"
      FROM staff_schedules ss
      JOIN staff s ON s.id = ss.staff_id
      JOIN schools sc ON sc.id = ss.school_id
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
        b.start_time as "bStartTime", b.end_time as "bEndTime",
        b.school_id as "bSchoolId", sb.name as "bSchoolName"
      FROM staff_schedules a
      JOIN staff_schedules b ON a.staff_id = b.staff_id 
        AND a.day_of_week = b.day_of_week 
        AND a.id < b.id
      JOIN staff s ON s.id = a.staff_id
      JOIN schools sa ON sa.id = a.school_id
      JOIN schools sb ON sb.id = b.school_id
      WHERE a.start_time < b.end_time AND b.start_time < a.end_time
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
    res.json({ conflicts: rows });
  } catch (err) {
    console.error("GET /staff-schedules/conflicts error:", err);
    res.status(500).json({ error: "Failed to check conflicts" });
  }
});

router.get("/staff-schedules/coverage-gaps", async (req, res) => {
  try {
    const districtId = getEnforcedDistrictId(req as AuthedRequest);
    const { schoolId } = req.query;

    let query = sql`
      SELECT DISTINCT ss.day_of_week as "dayOfWeek", sc.id as "schoolId", sc.name as "schoolName"
      FROM schools sc
      CROSS JOIN (SELECT UNNEST(ARRAY['monday','tuesday','wednesday','thursday','friday']) AS day_of_week) days
      LEFT JOIN staff_schedules ss ON ss.school_id = sc.id AND ss.day_of_week = days.day_of_week
      WHERE ss.id IS NULL
    `;

    if (districtId) {
      query = sql`${query} AND sc.district_id = ${districtId}`;
    }
    if (schoolId) {
      query = sql`${query} AND sc.id = ${Number(schoolId)}`;
    }

    query = sql`${query} ORDER BY sc.name, days.day_of_week`;

    const result = await db.execute(query);
    const rows = "rows" in result ? result.rows : result;
    res.json({ gaps: rows });
  } catch (err) {
    console.error("GET /staff-schedules/coverage-gaps error:", err);
    res.status(500).json({ error: "Failed to check coverage gaps" });
  }
});

router.post("/staff-schedules", requireRoles("admin", "coordinator"), async (req, res) => {
  try {
    const { staffId, schoolId, dayOfWeek, startTime, endTime, label, notes, effectiveFrom, effectiveTo } = req.body;

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
    if (districtId) {
      const schoolCheck = await db.execute(sql`SELECT 1 FROM schools WHERE id = ${Number(schoolId)} AND district_id = ${districtId}`);
      const schoolRows = "rows" in schoolCheck ? schoolCheck.rows : schoolCheck;
      if (!Array.isArray(schoolRows) || schoolRows.length === 0) {
        res.status(400).json({ error: "School not found in your district" }); return;
      }
    }

    const existingResult = await db.execute(sql`
      SELECT id, start_time, end_time, school_id FROM staff_schedules
      WHERE staff_id = ${Number(staffId)} AND day_of_week = ${dayOfWeek}
    `);
    const existing = "rows" in existingResult ? existingResult.rows : existingResult;
    if (Array.isArray(existing)) {
      for (const e of existing) {
        const row = e as { id: number; start_time: string; end_time: string; school_id: number };
        if (timesOverlap(startTime, endTime, row.start_time, row.end_time)) {
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
    const { schoolId, dayOfWeek, startTime, endTime, label, notes, effectiveFrom, effectiveTo } = req.body;

    if (dayOfWeek && !VALID_DAYS.includes(dayOfWeek)) {
      res.status(400).json({ error: "dayOfWeek must be monday through friday" }); return;
    }

    const [existing] = await db.select().from(staffSchedulesTable).where(eq(staffSchedulesTable.id, scheduleId));
    if (!existing) { res.status(404).json({ error: "Schedule not found" }); return; }

    const newDay = dayOfWeek || existing.dayOfWeek;
    const newStart = startTime || existing.startTime;
    const newEnd = endTime || existing.endTime;

    if (timeToMinutes(newStart) >= timeToMinutes(newEnd)) {
      res.status(400).json({ error: "startTime must be before endTime" }); return;
    }

    const overlapResult = await db.execute(sql`
      SELECT id, start_time, end_time FROM staff_schedules
      WHERE staff_id = ${existing.staffId} AND day_of_week = ${newDay} AND id != ${scheduleId}
    `);
    const overlaps = "rows" in overlapResult ? overlapResult.rows : overlapResult;
    if (Array.isArray(overlaps)) {
      for (const o of overlaps) {
        const row = o as { id: number; start_time: string; end_time: string };
        if (timesOverlap(newStart, newEnd, row.start_time, row.end_time)) {
          res.status(409).json({ error: "Schedule conflict detected", conflictWith: row.id }); return;
        }
      }
    }

    const [updated] = await db.update(staffSchedulesTable)
      .set({
        schoolId: schoolId ? Number(schoolId) : existing.schoolId,
        dayOfWeek: newDay,
        startTime: newStart,
        endTime: newEnd,
        label: label !== undefined ? label : existing.label,
        notes: notes !== undefined ? notes : existing.notes,
        effectiveFrom: effectiveFrom !== undefined ? effectiveFrom : existing.effectiveFrom,
        effectiveTo: effectiveTo !== undefined ? effectiveTo : existing.effectiveTo,
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
