import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";

/**
 * Tenant ownership guard for :id routes across the students sub-routers.
 * Determined by req.path:
 *   /students/:id            → :id is a student — verify district via school→district
 *   /emergency-contacts/:id  → :id is a contact — verify via contact→student→district
 *   /medical-alerts/:id      → :id is an alert — verify via alert→student→district
 * Platform admins (null enforcedDistrictId) bypass and see all records.
 */
export async function studentIdParamGuard(req: Request, res: Response, next: NextFunction, id: string): Promise<void> {
  const numId = Number(id);
  if (!Number.isFinite(numId) || numId <= 0) { next(); return; }
  const enforcedDistrictId = getEnforcedDistrictId(req as AuthedRequest);
  if (enforcedDistrictId === null) { next(); return; }

  const path = req.path;
  let rows: { rows: unknown[] };

  if (/^\/students\//.test(path)) {
    rows = await db.execute(sql`
      SELECT 1 FROM students
      WHERE id = ${numId}
        AND school_id IN (SELECT id FROM schools WHERE district_id = ${enforcedDistrictId})
    `);
  } else if (/^\/emergency-contacts\//.test(path)) {
    rows = await db.execute(sql`
      SELECT 1 FROM emergency_contacts ec
      JOIN students s ON s.id = ec.student_id
      WHERE ec.id = ${numId}
        AND s.school_id IN (SELECT id FROM schools WHERE district_id = ${enforcedDistrictId})
    `);
  } else if (/^\/medical-alerts\//.test(path)) {
    rows = await db.execute(sql`
      SELECT 1 FROM medical_alerts ma
      JOIN students s ON s.id = ma.student_id
      WHERE ma.id = ${numId}
        AND s.school_id IN (SELECT id FROM schools WHERE district_id = ${enforcedDistrictId})
    `);
  } else {
    next(); return;
  }

  if (!rows.rows.length) {
    res.status(403).json({ error: "Access denied: resource does not belong to your district" });
    return;
  }
  next();
}
