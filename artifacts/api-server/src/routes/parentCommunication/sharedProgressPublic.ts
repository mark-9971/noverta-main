// tenant-scope: public
/**
 * Public, unauthenticated parent-facing share-link consumption route.
 *
 * Mounted on the global router BEFORE requireAuth so that parents (who have
 * no Clerk session) can actually load a link sent to them. The random
 * 192-bit token is the capability — no further auth is required, and the
 * request is hardened by:
 *   - per-IP and per-token sliding-window rate limits
 *   - atomic SQL claim against the share_links row (prevents one-time-view
 *     races and double-decrement)
 *   - explicit response codes (not_found / expired / revoked / exhausted /
 *     rate_limited) so the front end can render a friendly state
 *   - per-access audit row in share_link_access_log for every outcome
 */
import { Router, type IRouter } from "express";
import { db, shareLinkAccessLogTable, shareLinksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  getClientIp,
  hashToken,
  ipRateLimiter,
  tokenHashPrefix,
  tokenRateLimiter,
} from "../../lib/shareLinks";

const router: IRouter = Router();

type AccessOutcome = "granted" | "expired" | "revoked" | "exhausted" | "rate_limited" | "not_found";

async function recordAccess(opts: {
  shareLinkId: number | null;
  tokenHashPrefix: string;
  ip: string | null;
  userAgent: string | null;
  outcome: AccessOutcome;
  httpStatus: number;
}): Promise<void> {
  try {
    await db.insert(shareLinkAccessLogTable).values({
      shareLinkId: opts.shareLinkId,
      tokenHashPrefix: opts.tokenHashPrefix,
      ipAddress: opts.ip,
      userAgent: opts.userAgent,
      outcome: opts.outcome,
      httpStatus: opts.httpStatus,
    });
  } catch (err) {
    // Best-effort: never fail the user-facing request because the audit
    // insert failed. Log loudly so an operator notices.
    console.error("share-link access log insert failed:", err);
  }
}

router.get("/shared/progress/:token", async (req, res): Promise<void> => {
  const token = req.params.token ?? "";
  const tokenH = token ? hashToken(token) : "";
  const prefix = tokenH ? tokenHashPrefix(tokenH) : "noprefix";
  const ip = getClientIp(req);
  const ua = (req.headers["user-agent"] as string | undefined) ?? null;

  if (ip && !ipRateLimiter.allow(ip)) {
    await recordAccess({ shareLinkId: null, tokenHashPrefix: prefix, ip, userAgent: ua, outcome: "rate_limited", httpStatus: 429 });
    res.status(429).json({ error: "Too many requests, please try again later.", code: "rate_limited" });
    return;
  }
  if (token && !tokenRateLimiter.allow(tokenH)) {
    await recordAccess({ shareLinkId: null, tokenHashPrefix: prefix, ip, userAgent: ua, outcome: "rate_limited", httpStatus: 429 });
    res.status(429).json({ error: "Too many requests for this link.", code: "rate_limited" });
    return;
  }

  try {
    if (!token || token.length < 16) {
      await recordAccess({ shareLinkId: null, tokenHashPrefix: prefix, ip, userAgent: ua, outcome: "not_found", httpStatus: 404 });
      res.status(404).json({ error: "Link not found.", code: "not_found" });
      return;
    }

    const claimed = await db.execute<{
      id: number;
      summary: string;
      view_count: number;
      max_views: number | null;
    }>(sql`
      UPDATE share_links
      SET view_count = view_count + 1,
          last_viewed_at = NOW(),
          last_viewed_ip = ${ip}
      WHERE token_hash = ${tokenH}
        AND revoked_at IS NULL
        AND expires_at > NOW()
        AND (max_views IS NULL OR view_count < max_views)
      RETURNING id, summary, view_count, max_views
    `);

    if (claimed.rows.length > 0) {
      const row = claimed.rows[0]!;
      await recordAccess({ shareLinkId: row.id, tokenHashPrefix: prefix, ip, userAgent: ua, outcome: "granted", httpStatus: 200 });
      res.json(typeof row.summary === "string" ? JSON.parse(row.summary) : row.summary);
      return;
    }

    const [existing] = await db
      .select({
        id: shareLinksTable.id,
        expiresAt: shareLinksTable.expiresAt,
        revokedAt: shareLinksTable.revokedAt,
        viewCount: shareLinksTable.viewCount,
        maxViews: shareLinksTable.maxViews,
      })
      .from(shareLinksTable)
      .where(eq(shareLinksTable.tokenHash, tokenH))
      .limit(1);

    if (!existing) {
      await recordAccess({ shareLinkId: null, tokenHashPrefix: prefix, ip, userAgent: ua, outcome: "not_found", httpStatus: 404 });
      res.status(404).json({ error: "Link not found.", code: "not_found" });
      return;
    }
    if (existing.revokedAt) {
      await recordAccess({ shareLinkId: existing.id, tokenHashPrefix: prefix, ip, userAgent: ua, outcome: "revoked", httpStatus: 410 });
      res.status(410).json({ error: "This link was revoked.", code: "revoked" });
      return;
    }
    if (existing.expiresAt <= new Date()) {
      await recordAccess({ shareLinkId: existing.id, tokenHashPrefix: prefix, ip, userAgent: ua, outcome: "expired", httpStatus: 410 });
      res.status(410).json({ error: "This link has expired.", code: "expired" });
      return;
    }
    await recordAccess({ shareLinkId: existing.id, tokenHashPrefix: prefix, ip, userAgent: ua, outcome: "exhausted", httpStatus: 410 });
    res.status(410).json({ error: "This link's view limit has been reached.", code: "exhausted" });
  } catch (e: unknown) {
    console.error("GET shared progress error:", e);
    res.status(500).json({ error: "Failed to fetch shared progress" });
  }
});

export default router;
