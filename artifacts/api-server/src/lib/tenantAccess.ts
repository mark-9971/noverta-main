import type { Request } from "express";
import { db, staffTable, studentsTable, staffAssignmentsTable } from "@workspace/db";
import { eq, or, sql } from "drizzle-orm";
import { getPublicMeta } from "./clerkClaims";
import type { AuthedRequest } from "../middlewares/auth";

export async function getRequesterSchoolId(req: Request): Promise<number | null> {
  const meta = getPublicMeta(req);
  const staffId = meta.staffId;
  if (!staffId || !Number.isFinite(staffId)) return null;
  const rows = await db.select({ schoolId: staffTable.schoolId })
    .from(staffTable)
    .where(eq(staffTable.id, staffId))
    .limit(1);
  return rows[0]?.schoolId ?? null;
}

export async function getStudentSchoolId(studentId: number): Promise<number | null> {
  const rows = await db.select({ schoolId: studentsTable.schoolId })
    .from(studentsTable)
    .where(eq(studentsTable.id, studentId))
    .limit(1);
  return rows[0]?.schoolId ?? null;
}

/**
 * Returns true if the requester is allowed to access the given student's records.
 * Admin role always passes. Non-admin with no school metadata:
 *   - fails closed in production (missing Clerk publicMetadata = misconfigured user)
 *   - passes in dev to allow local testing without full Clerk setup
 */
export async function assertStudentAccess(req: Request, studentId: number): Promise<boolean> {
  const authed = req as AuthedRequest;
  if (authed.trellisRole === "admin") return true;
  const requesterSchoolId = await getRequesterSchoolId(req);
  if (requesterSchoolId === null) {
    return process.env.NODE_ENV !== "production";
  }
  const studentSchoolId = await getStudentSchoolId(studentId);
  return studentSchoolId === requesterSchoolId;
}

const CASELOAD_BROAD_ROLES = ["admin", "coordinator"];

export async function assertCaseloadAccess(req: Request, studentId: number): Promise<boolean> {
  const authed = req as AuthedRequest;
  if (CASELOAD_BROAD_ROLES.includes(authed.trellisRole ?? "")) {
    return assertStudentAccess(req, studentId);
  }
  const staffId = authed.tenantStaffId;
  if (!staffId) {
    return false;
  }
  const [student] = await db
    .select({ caseManagerId: studentsTable.caseManagerId })
    .from(studentsTable)
    .where(eq(studentsTable.id, studentId))
    .limit(1);
  if (!student) return false;
  if (student.caseManagerId === staffId) return true;
  const [assignment] = await db
    .select({ id: staffAssignmentsTable.id })
    .from(staffAssignmentsTable)
    .where(
      sql`${staffAssignmentsTable.staffId} = ${staffId} AND ${staffAssignmentsTable.studentId} = ${studentId}`
    )
    .limit(1);
  return !!assignment;
}

/**
 * Returns the expected object path prefix for a tenant-scoped upload.
 * Format: /objects/uploads/schools/{schoolId}/students/{studentId}
 */
export function tenantObjectPrefix(schoolId: number, studentId: number): string {
  return `/objects/uploads/schools/${schoolId}/students/${studentId}`;
}

/**
 * Returns the tenant prefix segment used when signing upload URLs.
 * Format: schools/{schoolId}/students/{studentId}
 */
export function tenantUploadPrefix(schoolId: number, studentId: number): string {
  return `schools/${schoolId}/students/${studentId}`;
}
