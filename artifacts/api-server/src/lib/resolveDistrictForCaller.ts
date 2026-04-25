/**
 * Single source of truth for resolving the district scope of an authenticated
 * caller. Used by every billing, subscription, SIS, and admin resolver utility
 * across the api-server.
 *
 * Resolution order (no implicit fallbacks):
 *   1. `publicMetadata.districtId` from the Clerk session (authoritative).
 *   2. `publicMetadata.staffId` joined to staff → schools → districts.
 *   3. `null` — the caller has no provable district scope, so the route must
 *      respond with a clear 4xx ("link your account to a district") rather
 *      than guessing.
 *
 * Historically several routes fell back to "if the districts table has exactly
 * one row, assume that row is the caller's district." That made an unrelated
 * unlinked user appear to belong to whichever district happened to exist in
 * the database — a real authz risk as soon as a second district was added.
 * That fallback has been removed everywhere; this helper enforces the new
 * contract.
 *
 * The only legal override is `NOVERTA_DEV_FORCE_DISTRICT_ID` (or its
 * deprecated alias `TRELLIS_DEV_FORCE_DISTRICT_ID`), which:
 *   - is read at module load time,
 *   - is **strictly ignored when NODE_ENV === "production"**,
 *   - exists so a developer running against a fresh local DB can see real
 *     data without round-tripping through Clerk metadata.
 *
 * Both env vars are accepted during the rename transition; the new name
 * wins when both are set. The legacy alias is kept so existing operator
 * `.env`/CI configs do not break. Drop the legacy read once all configs
 * have been updated.
 */

import { db, staffTable, schoolsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request } from "express";
import { getPublicMeta } from "./clerkClaims";
import { clerkClient, getAuth } from "@clerk/express";

const _devForceRaw =
  process.env.NOVERTA_DEV_FORCE_DISTRICT_ID
  ?? process.env.TRELLIS_DEV_FORCE_DISTRICT_ID;
const DEV_FORCED_DISTRICT_ID: number | null =
  process.env.NODE_ENV !== "production" && _devForceRaw
    ? Number(_devForceRaw)
    : null;

export interface DistrictResolution {
  districtId: number | null;
  /** How we got the id; used for support telemetry / debugging. */
  source: "clerk_meta" | "staff_join" | "dev_forced" | "unresolved";
}

export async function resolveDistrictForCaller(req: Request): Promise<DistrictResolution> {
  // Test-only bypass that mirrors the x-test-* contract enforced by
  // middlewares/auth.ts. The auth middleware also gates this on
  // NODE_ENV === "test", and both layers refuse the header in production
  // (NODE_ENV !== "production" already throws there). Keeping the resolver
  // honest with the same contract lets the regression test suite drive
  // billing / agency / sample-data routes that depend on this resolver
  // rather than only on getEnforcedDistrictId.
  if (process.env.NODE_ENV === "test") {
    const headerVal = req.headers["x-test-district-id"];
    const testDistrictId = Array.isArray(headerVal) ? headerVal[0] : headerVal;
    if (testDistrictId != null && testDistrictId !== "") {
      const n = Number(testDistrictId);
      if (Number.isFinite(n)) return { districtId: n, source: "clerk_meta" };
    }
  }

  const meta = getPublicMeta(req);

  if (typeof meta.districtId === "number" && Number.isFinite(meta.districtId)) {
    return { districtId: meta.districtId, source: "clerk_meta" };
  }

  if (typeof meta.staffId === "number" && Number.isFinite(meta.staffId)) {
    const [row] = await db
      .select({ districtId: schoolsTable.districtId })
      .from(staffTable)
      .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
      .where(eq(staffTable.id, meta.staffId))
      .limit(1);
    if (row?.districtId) {
      return { districtId: row.districtId, source: "staff_join" };
    }
  }

  // Fallback: look up the staff record by the user's Clerk email address.
  // This lets demo and pilot accounts whose Clerk metadata wasn't pre-stamped
  // with staffId/districtId still resolve their district automatically.
  const userId = getAuth(req)?.userId;
  if (userId) {
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      const primaryEmail = clerkUser.emailAddresses.find(
        (e) => e.id === clerkUser.primaryEmailAddressId
      )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;
      if (primaryEmail) {
        const [row] = await db
          .select({ districtId: schoolsTable.districtId })
          .from(staffTable)
          .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
          .where(eq(staffTable.email, primaryEmail.toLowerCase()))
          .limit(1);
        if (row?.districtId) {
          return { districtId: row.districtId, source: "staff_join" };
        }
      }
    } catch {
      // Clerk API unavailable or user not found — fall through to unresolved.
    }
  }

  if (DEV_FORCED_DISTRICT_ID != null) {
    return { districtId: DEV_FORCED_DISTRICT_ID, source: "dev_forced" };
  }

  return { districtId: null, source: "unresolved" };
}

/** Convenience wrapper for callers that only need the id. */
export async function resolveDistrictIdForCaller(req: Request): Promise<number | null> {
  return (await resolveDistrictForCaller(req)).districtId;
}
