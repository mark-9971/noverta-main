/**
 * Training Mode (task 423) — per-user sandbox toggle for provider onboarding.
 *
 * When a user has `staff.training_mode_enabled = true`, the request-scoped
 * middleware in this file rewrites their tenant scope so reads/writes hit
 * the shared sample-data roster (students/staff with `is_sample = true`)
 * instead of real student records:
 *
 *  - `req.tenantStaffId` is overridden to a sample staff persona in the
 *    same district. This makes endpoints that filter by the caller's staff
 *    id (e.g. /schedules/my-schedule, /sessions filtered by my staff) show
 *    the sample roster's schedule and history.
 *  - `req.realStaffId` and `req.realUserId` preserve the original identity
 *    for audit-tagging and for the sandbox writes' `sandbox_user_id`.
 *  - `req.trainingMode` is set to true so route handlers can branch
 *    explicitly when needed (e.g. session POST tags writes with
 *    `is_sandbox = true` and refuses to write to non-sample students).
 *
 * Reads/writes from real users with training mode OFF never see sandbox
 * rows: those rows reference sample students which the real user's
 * caseload doesn't include, AND list endpoints additionally filter out
 * `is_sandbox = true` rows as a defense-in-depth check.
 */
import type { Request, Response, NextFunction } from "express";
import { db, staffTable, schoolsTable } from "@workspace/db";
import { and, eq, isNull, inArray, sql } from "drizzle-orm";
import type { AuthedRequest } from "../middlewares/auth";

declare module "../middlewares/auth" {
  interface AuthedRequest {
    /** True when the caller has training mode enabled and the override has been applied. */
    trainingMode?: boolean;
    /** Original (non-overridden) staff id, before training mode swapped it for the sample persona. */
    realStaffId?: number | null;
    /** Original Clerk user id. Preserved here for symmetry with realStaffId; equal to req.userId today. */
    realUserId?: string;
  }
}

/** Process-local cache: clerkUserId → trainingModeEnabled, with TTL. */
const _trainingFlagCache = new Map<string, { enabled: boolean; expiresAt: number }>();
const TRAINING_FLAG_TTL_MS = 30_000;

/** Process-local cache: districtId → first sample staff id, with TTL. */
const _samplePersonaCache = new Map<number, { staffId: number; expiresAt: number }>();
const SAMPLE_PERSONA_TTL_MS = 60_000;

export function invalidateTrainingFlagCache(userId?: string): void {
  if (userId) _trainingFlagCache.delete(userId);
  else _trainingFlagCache.clear();
}

/**
 * Look up the staff row for the calling Clerk user. Returns the row or
 * null if no staff record matches the user's email. Used both to read the
 * training_mode_enabled flag and to flip it from the toggle endpoints.
 */
export async function findCallerStaffRow(
  userId: string,
  emails: string[],
): Promise<{ id: number; districtId: number | null; trainingModeEnabled: boolean } | null> {
  if (emails.length === 0) return null;
  const rows = await db
    .select({
      id: staffTable.id,
      districtId: schoolsTable.districtId,
      trainingModeEnabled: staffTable.trainingModeEnabled,
    })
    .from(staffTable)
    .leftJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
    .where(and(
      isNull(staffTable.deletedAt),
      // Match the lowercased email — same pattern auth.ts uses for
      // resolveDistrictFromClerkUser, so a user with multiple verified
      // emails resolves the same way through both code paths.
      inArray(sql`lower(${staffTable.email})`, emails.map(e => e.toLowerCase())),
    ))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    districtId: row.districtId,
    trainingModeEnabled: row.trainingModeEnabled,
  };
}

/**
 * Pick a sample staff "persona" for the district. Returns the lowest-id
 * sample staff record so all training users in the same district share
 * one persona — matching the task's "shared sample dataset projected
 * per-user" design (the persona is shared, but each user's writes are
 * tagged with their own sandbox_user_id).
 */
export async function getTrainingPersonaStaffId(districtId: number): Promise<number | null> {
  const cached = _samplePersonaCache.get(districtId);
  if (cached && cached.expiresAt > Date.now()) return cached.staffId;
  if (cached) _samplePersonaCache.delete(districtId);
  const rows = await db
    .select({ id: staffTable.id })
    .from(staffTable)
    .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
    .where(and(
      eq(staffTable.isSample, true),
      isNull(staffTable.deletedAt),
      eq(schoolsTable.districtId, districtId),
    ))
    .orderBy(staffTable.id)
    .limit(1);
  const id = rows[0]?.id ?? null;
  if (id != null) {
    _samplePersonaCache.set(districtId, {
      staffId: id,
      expiresAt: Date.now() + SAMPLE_PERSONA_TTL_MS,
    });
  }
  return id;
}

/**
 * Read the training_mode flag for a Clerk user id. Caches the negative
 * result (most users) for a short TTL so we don't re-query on every
 * request, and caches positive results equally short so a disable click
 * propagates within the TTL even without explicit invalidation.
 */
async function readTrainingFlagForStaff(staffId: number, userId: string): Promise<boolean> {
  const cached = _trainingFlagCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.enabled;
  const [row] = await db
    .select({ enabled: staffTable.trainingModeEnabled })
    .from(staffTable)
    .where(eq(staffTable.id, staffId))
    .limit(1);
  const enabled = !!row?.enabled;
  _trainingFlagCache.set(userId, {
    enabled,
    expiresAt: Date.now() + TRAINING_FLAG_TTL_MS,
  });
  return enabled;
}

/**
 * Express middleware: if the caller has training mode enabled, swap
 * their tenantStaffId to the sample persona and stash the original
 * identity on `realStaffId` / `realUserId`. Sets `req.trainingMode`
 * to true so handlers can branch explicitly.
 *
 * Safe no-op when:
 *  - the user has no staffId yet (brand-new account)
 *  - training mode is off
 *  - the district has no sample data seeded (no persona to swap to —
 *    fail closed: keep training mode off so the user doesn't see real
 *    data through a half-applied override).
 *
 * Mounted globally after requireAuth in routes/index.ts.
 */
export function applyTrainingModeOverride(req: Request, _res: Response, next: NextFunction): void {
  void (async () => {
    const authed = req as unknown as AuthedRequest;
    if (!authed.userId) { next(); return; }
    if (authed.tenantStaffId == null) { next(); return; }
    if (authed.tenantDistrictId == null) { next(); return; }
    try {
      const enabled = await readTrainingFlagForStaff(authed.tenantStaffId, authed.userId);
      if (!enabled) { next(); return; }
      const personaId = await getTrainingPersonaStaffId(authed.tenantDistrictId);
      if (personaId == null) {
        // No sample roster in this district — leave the user in their real
        // scope rather than nulling out their staff id. The toggle endpoint
        // surfaces a clearer error if they try to enable in this state.
        next();
        return;
      }
      authed.realStaffId = authed.tenantStaffId;
      authed.realUserId = authed.userId;
      authed.tenantStaffId = personaId;
      authed.trainingMode = true;
    } catch (err) {
      // Don't break the request if the lookup fails — just skip the override.
      console.warn("[trainingMode] override failed:", err);
    } finally {
      next();
    }
  })();
}

export function isTrainingMode(req: AuthedRequest): boolean {
  return req.trainingMode === true;
}

/** Clerk user id to attribute sandbox writes to. */
export function trainingWriterUserId(req: AuthedRequest): string {
  return req.realUserId ?? req.userId;
}
