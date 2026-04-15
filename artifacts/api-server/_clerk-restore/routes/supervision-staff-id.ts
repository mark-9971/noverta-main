/**
 * CLERK STAFF ID HELPER — supervision.ts (restore snippet)
 *
 * In src/routes/supervision.ts, restore these lines:
 *
 * 1. At the top, add:
 *      import { getAuth } from "@clerk/express";
 *
 * 2. Replace the stub `getClerkStaffId` function with:
 */

import { getAuth } from "@clerk/express";
import type { AuthedRequest } from "../../src/middlewares/auth";

export function getClerkStaffId(req: AuthedRequest): number | null {
  const auth = getAuth(req);
  const meta = (auth?.sessionClaims as Record<string, Record<string, unknown>> | undefined)?.publicMetadata;
  const id = meta?.staffId ? Number(meta.staffId) : null;
  return id && Number.isFinite(id) ? id : null;
}
