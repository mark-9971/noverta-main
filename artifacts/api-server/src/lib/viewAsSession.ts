/**
 * Audited "view-as" / impersonation session helpers.
 *
 * - Token format: 32 random bytes, hex-encoded (64 chars). Returned exactly
 *   once at /support/view-as/start. Only sha256(token) lives in the DB.
 * - Hard cap: VIEW_AS_TTL_MS (30 minutes). The middleware refuses sessions
 *   past expires_at even if the row is still ended_at IS NULL.
 * - Cache: small in-process LRU keyed by token hash so a single HTTP request
 *   that re-enters requireAuth (e.g. via requireDistrictScope -> requireAuth)
 *   doesn't hit the DB more than once.
 */
import crypto from "node:crypto";
import { db, viewAsSessionsTable } from "@workspace/db";
import { and, eq, isNull, sql } from "drizzle-orm";

export const VIEW_AS_TTL_MS = 30 * 60 * 1000;
export const VIEW_AS_HEADER = "x-view-as-token";

export type ActiveViewAsSession = typeof viewAsSessionsTable.$inferSelect;

export function generateToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  return { token, tokenHash };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

interface CacheEntry {
  session: ActiveViewAsSession | null;
  expiresAt: number;
}
const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5_000;

/** Drop a token's cache entry — call after end-session so subsequent requests fail closed. */
export function invalidateViewAsTokenCache(tokenHash: string): void {
  _cache.delete(tokenHash);
}

/**
 * Look up an active session by token, scoped to the calling admin so a leaked
 * token cannot be replayed by a different admin account. Returns null if the
 * session does not exist, has been ended, has expired, or belongs to a
 * different admin.
 */
export async function loadActiveViewAsSession(
  token: string,
  adminUserId: string,
): Promise<ActiveViewAsSession | null> {
  const tokenHash = hashToken(token);
  const cached = _cache.get(tokenHash);
  if (cached && cached.expiresAt > Date.now()) {
    const sess = cached.session;
    if (!sess) return null;
    if (sess.adminUserId !== adminUserId) return null;
    if (sess.endedAt) return null;
    if (sess.expiresAt.getTime() <= Date.now()) return null;
    return sess;
  }

  const [row] = await db.select().from(viewAsSessionsTable)
    .where(eq(viewAsSessionsTable.tokenHash, tokenHash))
    .limit(1);

  _cache.set(tokenHash, { session: row ?? null, expiresAt: Date.now() + CACHE_TTL_MS });
  if (!row) return null;
  if (row.adminUserId !== adminUserId) return null;
  if (row.endedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

/** Mark all of an admin's currently-active sessions as superseded. */
export async function endActiveSessionsForAdmin(adminUserId: string, reason: "superseded" | "manual" | "expired" = "superseded"): Promise<number> {
  const rows = await db.update(viewAsSessionsTable)
    .set({ endedAt: new Date(), endReason: reason })
    .where(and(
      eq(viewAsSessionsTable.adminUserId, adminUserId),
      isNull(viewAsSessionsTable.endedAt),
    ))
    .returning({ id: viewAsSessionsTable.id, tokenHash: viewAsSessionsTable.tokenHash });
  for (const r of rows) _cache.delete(r.tokenHash);
  return rows.length;
}

export async function endSessionByToken(token: string, reason: "manual" | "expired"): Promise<ActiveViewAsSession | null> {
  const tokenHash = hashToken(token);
  const [row] = await db.update(viewAsSessionsTable)
    .set({ endedAt: new Date(), endReason: reason })
    .where(and(
      eq(viewAsSessionsTable.tokenHash, tokenHash),
      isNull(viewAsSessionsTable.endedAt),
    ))
    .returning();
  invalidateViewAsTokenCache(tokenHash);
  return row ?? null;
}

/** Test-only helper to reset the in-process cache between suites. */
export function _clearViewAsCacheForTests(): void {
  _cache.clear();
}

// Reference sql to keep the import live (used by potential future filters).
void sql;
