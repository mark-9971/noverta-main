/**
 * Audited Trellis-support session helpers.
 *
 * - A `trellis_support` user opens a session pinned to ONE district by calling
 *   POST /api/support-session/open { districtId, reason }.
 * - The session is hard-capped at SUPPORT_SESSION_TTL_MS (60 minutes). Middleware
 *   refuses sessions past expires_at even if the row is still ended_at IS NULL.
 * - Only one open session per support user at any time. Opening a second one
 *   marks the previous one ended_at with end_reason='superseded'.
 * - Cache: small in-process LRU keyed by support user id so repeated middleware
 *   lookups within a single HTTP request do not hit the DB.
 */
import { db, supportSessionsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

export const SUPPORT_SESSION_TTL_MS = 60 * 60 * 1000;

export type ActiveSupportSession = typeof supportSessionsTable.$inferSelect;

interface CacheEntry {
  session: ActiveSupportSession | null;
  expiresAt: number;
}
const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5_000;

export function invalidateSupportSessionCache(supportUserId?: string): void {
  if (supportUserId) _cache.delete(supportUserId);
  else _cache.clear();
}

/**
 * Look up an active session for a given support user. Returns null when no
 * session row exists, when the row has been ended, or when the row's
 * expires_at is in the past (without auto-ending — that is handled by
 * /support-session/active so the timeout end_reason is captured exactly once).
 */
export async function loadActiveSupportSession(
  supportUserId: string,
): Promise<ActiveSupportSession | null> {
  const cached = _cache.get(supportUserId);
  if (cached && cached.expiresAt > Date.now()) {
    const sess = cached.session;
    if (!sess) return null;
    if (sess.endedAt) return null;
    if (sess.expiresAt.getTime() <= Date.now()) return null;
    return sess;
  }

  const [row] = await db.select().from(supportSessionsTable)
    .where(and(
      eq(supportSessionsTable.supportUserId, supportUserId),
      isNull(supportSessionsTable.endedAt),
    ))
    .limit(1);

  _cache.set(supportUserId, { session: row ?? null, expiresAt: Date.now() + CACHE_TTL_MS });
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

/** End ALL currently-open sessions for a support user. Returns the number ended. */
export async function endActiveSupportSessions(
  supportUserId: string,
  reason: "manual" | "expired" | "superseded",
): Promise<number> {
  const rows = await db.update(supportSessionsTable)
    .set({ endedAt: new Date(), endReason: reason })
    .where(and(
      eq(supportSessionsTable.supportUserId, supportUserId),
      isNull(supportSessionsTable.endedAt),
    ))
    .returning({ id: supportSessionsTable.id });
  invalidateSupportSessionCache(supportUserId);
  return rows.length;
}

/** Test-only helper to reset the in-process cache between suites. */
export function _clearSupportSessionCacheForTests(): void {
  _cache.clear();
}
