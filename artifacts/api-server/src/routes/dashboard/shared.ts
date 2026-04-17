import {
  studentsTable, alertsTable, sessionLogsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { resolveDistrictIdForCaller } from "../../lib/resolveDistrictForCaller";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";
import type { Request } from "express";

// Dashboard scope helper. The previous implementation used "if there is only
// one district in the table, treat it as the caller's." Removed: a brand-new
// staffer or a misconfigured account would silently see a different
// district's caseload aggregates the moment a second district was added. Now
// we return null (caller must have explicit Clerk districtId or staff link)
// and routes render an empty/zero dashboard instead of borrowed data.
export async function resolveCallerDistrictId(req: import("express").Request): Promise<number | null> {
  return resolveDistrictIdForCaller(req);
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
