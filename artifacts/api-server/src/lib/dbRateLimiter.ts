/**
 * DB-backed fixed-window rate limiter middleware factory.
 *
 * State is stored in the `rate_limit_buckets` table, so limits persist across
 * server restarts and are shared across multiple worker processes.
 *
 * Each bucket is identified by a `bucketKey` string (e.g. "global:user_abc123"
 * or "upload:user_abc123"). On every request we upsert the row:
 *   - If the current window is still open (window_start + windowMs > now):
 *     increment count.
 *   - If the window has expired: reset count to 1 and advance window_start.
 * After the upsert we read back the count and reject with 429 if count > max.
 *
 * Violations are written to the audit log and the 429 response includes the
 * standard Retry-After and X-RateLimit-* headers.
 */

import { type Request, type Response, type NextFunction } from "express";
import { db, rateLimitBucketsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logAuditEvent } from "./auditLog";
import { logger } from "./logger";
import type { AuthedRequest } from "../middlewares/auth";

export interface RateLimitOptions {
  /** Identifies this rate-limit tier in bucket keys and audit logs. */
  endpointKey: string;
  /** Length of the fixed window in milliseconds. */
  windowMs: number;
  /** Maximum number of requests allowed within the window. */
  max: number;
  /**
   * Derive the per-request key fragment. Defaults to the authenticated userId.
   * Return null to skip rate limiting for this request.
   */
  keyFn?: (req: Request) => string | null;
}

function defaultKeyFn(req: Request): string | null {
  const authed = req as unknown as AuthedRequest;
  return authed.userId ?? null;
}

/**
 * Creates an Express middleware that enforces a DB-backed fixed-window rate
 * limit. Safe for multi-process / multi-restart deployments.
 */
export function createDbRateLimitMiddleware(opts: RateLimitOptions) {
  const { endpointKey, windowMs, max, keyFn = defaultKeyFn } = opts;

  return async function dbRateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (process.env.NODE_ENV === "test") {
      next();
      return;
    }

    const keyFragment = keyFn(req);
    if (!keyFragment) {
      next();
      return;
    }

    const bucketKey = `${endpointKey}:${keyFragment}`;

    try {
      const [row] = await db
        .insert(rateLimitBucketsTable)
        .values({
          bucketKey,
          count: 1,
          windowStart: sql`now()`,
          updatedAt: sql`now()`,
        })
        .onConflictDoUpdate({
          target: rateLimitBucketsTable.bucketKey,
          set: {
            count: sql`CASE
              WHEN rate_limit_buckets.window_start + (${windowMs} || ' milliseconds')::interval > now()
              THEN rate_limit_buckets.count + 1
              ELSE 1
            END`,
            windowStart: sql`CASE
              WHEN rate_limit_buckets.window_start + (${windowMs} || ' milliseconds')::interval > now()
              THEN rate_limit_buckets.window_start
              ELSE now()
            END`,
            updatedAt: sql`now()`,
          },
        })
        .returning();

      if (!row) {
        next();
        return;
      }

      const { count, windowStart } = row;
      const windowEnd = new Date(windowStart.getTime() + windowMs);
      const retryAfterSec = Math.ceil((windowEnd.getTime() - Date.now()) / 1000);

      res.setHeader("X-RateLimit-Limit", max);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, max - count));
      res.setHeader("X-RateLimit-Reset", Math.ceil(windowEnd.getTime() / 1000));

      if (count > max) {
        res.setHeader("Retry-After", Math.max(1, retryAfterSec));

        logAuditEvent(req, {
          action: "rate_limit_exceeded",
          targetTable: "rate_limit_buckets",
          summary: `Rate limit exceeded on ${endpointKey}`,
          metadata: { endpointKey, bucketKey, count, max, windowMs },
        });

        res.status(429).json({
          error: "Too many requests. Please slow down.",
          retryAfter: Math.max(1, retryAfterSec),
          limit: max,
        });
        return;
      }
    } catch (err) {
      logger.warn({ err, bucketKey }, "DB rate-limit check failed; allowing request");
    }

    next();
  };
}
