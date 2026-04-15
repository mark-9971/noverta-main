/**
 * CLERK STAFF ID HELPER — para.ts (restore snippet)
 *
 * In src/routes/para.ts, restore these lines:
 *
 * 1. At the top, add:
 *      import { getAuth } from "@clerk/express";
 *
 * 2. Replace the stub `getStaffIdForUser` function with:
 */

import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { staffTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthedRequest } from "../../src/middlewares/auth";

export async function getStaffIdForUser(req: AuthedRequest): Promise<number | null> {
  const auth = getAuth(req);
  const meta = (auth?.sessionClaims as Record<string, Record<string, unknown>> | undefined)?.publicMetadata;
  const clerkStaffId = meta?.staffId ? Number(meta.staffId) : null;
  if (clerkStaffId) {
    const rows = await db.select({ id: staffTable.id }).from(staffTable)
      .where(eq(staffTable.id, clerkStaffId)).limit(1);
    if (rows.length > 0) return rows[0].id;
  }
  return null;
}
