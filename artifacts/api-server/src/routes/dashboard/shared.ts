import { db } from "@workspace/db";
import {
  studentsTable, alertsTable, sessionLogsTable,
  staffTable, districtsTable, schoolsTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getPublicMeta } from "../../lib/clerkClaims";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";
import type { Request } from "express";

export async function resolveCallerDistrictId(req: import("express").Request): Promise<number | null> {
  const meta = getPublicMeta(req);
  if (meta.staffId) {
    const [staff] = await db.select({ schoolId: staffTable.schoolId })
      .from(staffTable).where(eq(staffTable.id, meta.staffId)).limit(1);
    if (staff?.schoolId) {
      const [school] = await db.select({ districtId: schoolsTable.districtId })
        .from(schoolsTable).where(eq(schoolsTable.id, staff.schoolId)).limit(1);
      if (school?.districtId) return school.districtId;
    }
  }
  const districts = await db.select({ id: districtsTable.id }).from(districtsTable).limit(2);
  if (districts.length === 1) return districts[0].id;
  return null;
}

export function parseSchoolDistrictFilters(req: Request, query: Record<string, unknown>): { schoolId?: number; districtId?: number } {
  const filters: { schoolId?: number; districtId?: number } = {};
  // Enforced district from token always takes precedence over client query params.
  const enforcedDistrictId = getEnforcedDistrictId(req as AuthedRequest);
  if (enforcedDistrictId !== null) {
    filters.districtId = enforcedDistrictId;
  } else if (query.districtId) {
    // Platform admin: optional filter by query param
    filters.districtId = Number(query.districtId);
  }
  if (query.schoolId) filters.schoolId = Number(query.schoolId);
  return filters;
}

export function buildStudentSubquery(filters: { schoolId?: number; districtId?: number }): ReturnType<typeof sql> | undefined {
  if (filters.schoolId) return sql`${studentsTable.schoolId} = ${filters.schoolId}`;
  if (filters.districtId) return sql`${studentsTable.schoolId} IN (SELECT id FROM schools WHERE district_id = ${filters.districtId})`;
  return undefined;
}

export function buildSessionStudentFilter(filters: { schoolId?: number; districtId?: number }): ReturnType<typeof sql> | undefined {
  if (filters.schoolId) return sql`${sessionLogsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${filters.schoolId})`;
  if (filters.districtId) return sql`${sessionLogsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${filters.districtId}))`;
  return undefined;
}

export function buildAlertStudentFilter(filters: { schoolId?: number; districtId?: number }): ReturnType<typeof sql> | undefined {
  if (filters.schoolId) return sql`${alertsTable.studentId} IN (SELECT id FROM students WHERE school_id = ${filters.schoolId})`;
  if (filters.districtId) return sql`${alertsTable.studentId} IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${filters.districtId}))`;
  return undefined;
}
