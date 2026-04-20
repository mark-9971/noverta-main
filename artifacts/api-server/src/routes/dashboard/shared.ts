import {
  studentsTable, alertsTable, sessionLogsTable, schoolYearsTable,
  staffAssignmentsTable,
} from "@workspace/db";
import { db } from "@workspace/db";
import { eq, sql, and, desc } from "drizzle-orm";
import { resolveDistrictIdForCaller } from "../../lib/resolveDistrictForCaller";
import { getEnforcedDistrictId } from "../../middlewares/auth";
import type { AuthedRequest } from "../../middlewares/auth";
import type { Request } from "express";
import { getActiveSchoolYearId } from "../../lib/activeSchoolYear";

/**
 * Roles whose dashboard view must be clamped to their own caseload (the
 * students they are personally assigned to via staff_assignments) rather
 * than the whole district. Mirrors the set already used by
 * /dashboard/goal-mastery-rate.
 *
 * Roles intentionally NOT in this set (admin, coordinator, trellis_support,
 * platform_admin, etc.) continue to receive district-wide aggregates.
 */
export const CASELOAD_ROLES_SERVER: ReadonlySet<string> = new Set([
  "case_manager", "provider", "bcba", "sped_teacher",
]);

/**
 * Returns the staffId the caller's dashboard aggregates must be clamped to,
 * or null when the caller is district-wide (admin/coordinator/etc.).
 *
 * For caseload roles whose Clerk account is not yet linked to a staff row
 * (tenantStaffId == null) this returns -1 — a sentinel that yields an empty
 * caseload at the SQL level (no staff_assignments row will match), which is
 * the desired fail-closed behavior: an unlinked provider sees zero rather
 * than the whole district.
 */
export function getEnforcedCaseloadStaffId(req: Request): number | null {
  const authed = req as unknown as AuthedRequest;
  if (!CASELOAD_ROLES_SERVER.has(authed.trellisRole)) return null;
  return authed.tenantStaffId ?? -1;
}

/**
 * Resolves the set of student ids in the caller's caseload. Returns null
 * when the caller is district-wide (no clamp needed). Returns [] when the
 * caller is a caseload role with no assignments (fail-closed).
 */
export async function resolveCaseloadStudentIds(req: Request): Promise<number[] | null> {
  const enforcedStaffId = getEnforcedCaseloadStaffId(req);
  if (enforcedStaffId === null) return null;
  if (enforcedStaffId === -1) return [];
  const rows = await db
    .select({ studentId: staffAssignmentsTable.studentId })
    .from(staffAssignmentsTable)
    .where(eq(staffAssignmentsTable.staffId, enforcedStaffId));
  return rows.map(r => r.studentId);
}

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
  const enforcedDistrictId = getEnforcedDistrictId(req as unknown as AuthedRequest);
  if (enforcedDistrictId !== null) {
    filters.districtId = enforcedDistrictId;
  } else if (query.districtId) {
    // Platform admin: optional filter by query param
    filters.districtId = Number(query.districtId);
  }
  if (query.schoolId) filters.schoolId = Number(query.schoolId);
  return filters;
}

/**
 * Resolves a school-year window for compliance scoping.
 *
 * Priority:
 *   1. Explicit ?schoolYearId= query param (any year, any district as long as caller has district access)
 *   2. The active school year for the resolved district (default — the safe fallback)
 *   3. null window (only when caller has no district AND no year provided — typically platform admin)
 *
 * Returns:
 *   - schoolYearId: the resolved year id (null only if no district + no explicit year)
 *   - startDate / endDate: ISO date strings (YYYY-MM-DD) for that year (null if year not resolvable)
 *   - label: human label for badges/headings
 *   - isExplicit: true if caller provided ?schoolYearId, false if defaulted to active year
 *
 * This helper centralises year resolution so every compliance surface defaults
 * to the active year (no silent all-time fallback) and respects explicit selection.
 */
export interface SchoolYearWindow {
  schoolYearId: number | null;
  startDate: string | null;
  endDate: string | null;
  label: string | null;
  isExplicit: boolean;
}

export async function resolveSchoolYearWindow(
  req: Request,
  query: Record<string, unknown>,
  districtId: number | undefined | null,
): Promise<SchoolYearWindow> {
  const rawYear = query.schoolYearId;
  const explicit = rawYear !== undefined && rawYear !== null && rawYear !== "" && rawYear !== "all";

  if (explicit) {
    const yearId = Number(rawYear);
    if (Number.isFinite(yearId) && yearId > 0) {
      // Tenant guard: if caller is scoped to a district, the requested year
      // must belong to that district. Platform admins (districtId == null)
      // may resolve any year.
      const conds = [eq(schoolYearsTable.id, yearId)];
      if (districtId) conds.push(eq(schoolYearsTable.districtId, districtId));
      const [year] = await db
        .select({
          id: schoolYearsTable.id,
          startDate: schoolYearsTable.startDate,
          endDate: schoolYearsTable.endDate,
          label: schoolYearsTable.label,
        })
        .from(schoolYearsTable)
        .where(and(...conds))
        .limit(1);
      if (year) {
        return {
          schoolYearId: year.id,
          startDate: year.startDate,
          endDate: year.endDate,
          label: year.label,
          isExplicit: true,
        };
      }
    }
  }

  // Default: active year for the caller's district
  if (districtId) {
    const activeYearId = await getActiveSchoolYearId(districtId);
    if (activeYearId) {
      const [year] = await db
        .select({
          id: schoolYearsTable.id,
          startDate: schoolYearsTable.startDate,
          endDate: schoolYearsTable.endDate,
          label: schoolYearsTable.label,
        })
        .from(schoolYearsTable)
        .where(eq(schoolYearsTable.id, activeYearId))
        .limit(1);
      if (year) {
        return {
          schoolYearId: year.id,
          startDate: year.startDate,
          endDate: year.endDate,
          label: year.label,
          isExplicit: false,
        };
      }
    }
  }

  return { schoolYearId: null, startDate: null, endDate: null, label: null, isExplicit: false };
}

/**
 * Combined helper: parse school/district filters AND resolve year window in one call.
 * Returned object includes startDate/endDate ready to pass to computeAllActiveMinuteProgress.
 */
export async function parseSchoolDistrictYearFilters(
  req: Request,
  query: Record<string, unknown>,
): Promise<{
  schoolId?: number;
  districtId?: number;
  schoolYearId?: number;
  startDate?: string;
  endDate?: string;
  yearLabel?: string;
  yearIsExplicit: boolean;
}> {
  const sd = parseSchoolDistrictFilters(req, query);
  const window = await resolveSchoolYearWindow(req, query, sd.districtId ?? null);
  return {
    ...sd,
    schoolYearId: window.schoolYearId ?? undefined,
    startDate: window.startDate ?? undefined,
    endDate: window.endDate ?? undefined,
    yearLabel: window.label ?? undefined,
    yearIsExplicit: window.isExplicit,
  };
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
