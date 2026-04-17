import crypto from "crypto";
import { SlidingWindowLimiter } from "./rateLimiter";
export { getClientIp } from "./clientIp";

/**
 * Defaults for the parent progress share-link feature.
 *
 * All values are tunable via env so an operator can tighten or loosen them
 * without a code change. The defaults below are deliberately stricter than
 * the original v1 (which allowed 72h TTL and unlimited views).
 */
const num = (key: string, fallback: number, min: number, max: number): number => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

export const SHARE_LINK_CONFIG = {
  /** Default TTL applied when a caller does not specify one. */
  defaultTtlHours: num("SHARE_LINK_DEFAULT_TTL_HOURS", 24, 1, 720),
  /** Hard cap on TTL — caller-supplied values above this are clamped. */
  maxTtlHours: num("SHARE_LINK_MAX_TTL_HOURS", 168, 1, 720),
  /** Default per-link view cap when the caller does not specify one.
   *  Null disables the cap (TTL still applies). */
  defaultMaxViews: num("SHARE_LINK_DEFAULT_MAX_VIEWS", 25, 1, 1000),
  /** Hard cap on caller-supplied maxViews. */
  maxMaxViews: num("SHARE_LINK_MAX_MAX_VIEWS", 1000, 1, 100000),
  /** Per-token sliding-window rate limit (consumption side). */
  ratePerTokenWindowMs: num("SHARE_LINK_RATE_TOKEN_WINDOW_MS", 60_000, 1_000, 3_600_000),
  ratePerTokenMax: num("SHARE_LINK_RATE_TOKEN_MAX", 30, 1, 10_000),
  /** Per-IP sliding-window rate limit (catches token enumeration). */
  ratePerIpWindowMs: num("SHARE_LINK_RATE_IP_WINDOW_MS", 60_000, 1_000, 3_600_000),
  ratePerIpMax: num("SHARE_LINK_RATE_IP_MAX", 60, 1, 10_000),
} as const;

// getClientIp lives in ./clientIp and is re-exported above so existing callers
// of `import { getClientIp } from "../../lib/shareLinks"` keep working.

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function tokenHashPrefix(tokenHash: string): string {
  return tokenHash.slice(0, 8);
}

/**
 * Generate a fresh 24-byte (192-bit) URL-safe token. Returned as a hex string
 * (48 chars). 192 bits of entropy makes online enumeration infeasible even
 * with very loose rate limits.
 */
export function generateShareToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export const tokenRateLimiter = new SlidingWindowLimiter(
  SHARE_LINK_CONFIG.ratePerTokenWindowMs,
  SHARE_LINK_CONFIG.ratePerTokenMax,
);
export const ipRateLimiter = new SlidingWindowLimiter(
  SHARE_LINK_CONFIG.ratePerIpWindowMs,
  SHARE_LINK_CONFIG.ratePerIpMax,
);

/** Test-only utility — resets both share-link rate limiters. */
export function __resetShareLinkLimiters(): void {
  tokenRateLimiter.reset();
  ipRateLimiter.reset();
}
