import type { Request } from "express";
import { db, guardiansTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getPublicMeta } from "../../lib/clerkClaims";
import type { AuthedRequest } from "../../middlewares/auth";
import { getEnforcedDistrictId } from "../../middlewares/auth";

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

export interface MessageRow {
  id: unknown;
  studentId: unknown;
  senderType: unknown;
  senderStaffFirst: unknown;
  senderStaffLast: unknown;
  guardianName: unknown;
  createdAt: unknown;
  readAt: unknown;
  threadId: unknown;
  subject: unknown;
  category: unknown;
  body: unknown;
  [key: string]: unknown;
}

export function getStaffId(req: Request): number | null {
  const meta = getPublicMeta(req);
  const id = meta.staffId;
  if (id) return id;
  if (!IS_PRODUCTION) {
    console.warn("[parentMessages] No staffId in auth claims — using dev fallback (77)");
    return 77;
  }
  return null;
}

export async function verifyStudentInDistrict(req: Request, studentId: number): Promise<boolean> {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (districtId === null) return true;
  const result = await db.execute(sql`
    SELECT 1 FROM students
    WHERE id = ${studentId}
      AND school_id IN (SELECT id FROM schools WHERE district_id = ${districtId})
  `);
  const rows = "rows" in result ? (result.rows as unknown[]) : (result as unknown as unknown[]);
  return rows.length > 0;
}

export async function verifyGuardianBelongsToStudent(guardianId: number, studentId: number): Promise<boolean> {
  const rows = await db.select({ id: guardiansTable.id })
    .from(guardiansTable)
    .where(and(eq(guardiansTable.id, guardianId), eq(guardiansTable.studentId, studentId)));
  return rows.length > 0;
}

export async function resolveGuardianId(req: Request): Promise<number | null> {
  const authed = req as AuthedRequest;
  return authed.tenantGuardianId ?? null;
}
