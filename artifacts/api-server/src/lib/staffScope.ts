/**
 * Staff-scope access helpers for limited roles (provider, para).
 *
 * Privileged staff (admin, case_manager, bcba, sped_teacher, coordinator) and
 * platform admins (no enforced district) see all records in their district —
 * these helpers are no-ops for them.
 *
 * For provider/para callers, accessibility is determined by the union of:
 *   - active rows in `staff_assignments` (endDate IS NULL OR endDate >= today)
 *   - for paras only: active rows in `schedule_blocks`
 *     (effectiveTo IS NULL OR effectiveTo >= today)
 *
 * Cross-tenant access (wrong district) is handled separately by districtScope
 * helpers and the studentIdParamGuard. This module is purely about narrowing
 * within-district access for limited roles.
 */
import { db, staffAssignmentsTable, scheduleBlocksTable } from "@workspace/db";
import { eq, and, or, isNull, gte } from "drizzle-orm";
import type { Response } from "express";
import { type AuthedRequest, getEnforcedDistrictId } from "../middlewares/auth";
import { isPrivilegedStaff, type TrellisRole } from "./permissions";

const SCOPE_CACHE = Symbol("novertaStaffScopeCache");

/** True if caller can see all district records (privileged staff or platform admin). */
export function isPrivilegedCaller(req: AuthedRequest): boolean {
  if (getEnforcedDistrictId(req) === null) return true; // platform admin
  const role = req.trellisRole;
  if (!role) return false;
  return isPrivilegedStaff(role as TrellisRole);
}

/**
 * Returns the list of student IDs accessible to the caller based on active
 * assignments. Returns `null` if the caller is privileged (no restriction).
 * Returns an empty array if the caller is provider/para with no staff link or
 * no active assignments — they see nothing.
 *
 * Cached on the request for the lifetime of the request.
 */
export async function getCallerAssignedStudentIds(
  req: AuthedRequest,
): Promise<number[] | null> {
  if (isPrivilegedCaller(req)) return null;

  const cacheKey = SCOPE_CACHE as unknown as string;
  const cached = (req as unknown as Record<string, unknown>)[cacheKey];
  if (cached !== undefined) return cached as number[];

  const staffId = req.tenantStaffId;
  if (!staffId) {
    (req as unknown as Record<string, unknown>)[cacheKey] = [];
    return [];
  }

  const today = new Date().toISOString().split("T")[0];

  const fromAssignments = await db
    .selectDistinct({ studentId: staffAssignmentsTable.studentId })
    .from(staffAssignmentsTable)
    .where(and(
      eq(staffAssignmentsTable.staffId, staffId),
      or(
        isNull(staffAssignmentsTable.endDate),
        gte(staffAssignmentsTable.endDate, today),
      ),
    ));

  let fromBlocks: { studentId: number | null }[] = [];
  if (req.trellisRole === "para") {
    fromBlocks = await db
      .selectDistinct({ studentId: scheduleBlocksTable.studentId })
      .from(scheduleBlocksTable)
      .where(and(
        eq(scheduleBlocksTable.staffId, staffId),
        or(
          isNull(scheduleBlocksTable.effectiveTo),
          gte(scheduleBlocksTable.effectiveTo, today),
        ),
      ));
  }

  const ids = new Set<number>();
  for (const r of fromAssignments) if (r.studentId != null) ids.add(r.studentId);
  for (const r of fromBlocks) if (r.studentId != null) ids.add(r.studentId);

  const list = Array.from(ids);
  (req as unknown as Record<string, unknown>)[cacheKey] = list;
  return list;
}

/**
 * For a single student-id check on a route handler. Returns true on access,
 * false (and sends 404) on denial. Privileged callers always pass.
 *
 * 404 is intentional — never confirm to a limited-role caller that a record
 * exists in their district but is not assigned to them.
 */
export async function assertStudentAccessibleToCaller(
  req: AuthedRequest,
  res: Response,
  studentId: number,
): Promise<boolean> {
  if (isPrivilegedCaller(req)) return true;
  const ids = await getCallerAssignedStudentIds(req);
  if (ids === null) return true;
  if (ids.includes(studentId)) return true;
  res.status(404).json({ error: "Not found" });
  return false;
}
