import type { Request } from "express";

/**
 * Best-effort client-IP extraction for *security* purposes (rate-limit keys,
 * audit logs).
 *
 * X-Forwarded-For is trusted ONLY when the operator has explicitly opted in
 * via TRUST_PROXY=1 (or "true" / "yes"). Without that opt-in we use the raw
 * socket address, because an attacker can otherwise spoof the header to
 * evade per-IP rate limiting and to forge audit-log entries.
 *
 * When trusted, we take the *left-most* entry, which is the originating
 * client when a known number of proxies prepend.
 *
 * One source of truth — every public-by-token route should call this rather
 * than reading req.headers["x-forwarded-for"] directly.
 */
const TRUST_PROXY = ["1", "true", "yes"].includes(
  (process.env.TRUST_PROXY ?? "").toLowerCase(),
);

export function getClientIp(req: Request): string | null {
  if (TRUST_PROXY) {
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string" && fwd.length > 0) {
      const first = fwd.split(",")[0]!.trim();
      if (first) return first;
    }
  }
  return req.socket?.remoteAddress ?? null;
}

export function isTrustedProxy(): boolean {
  return TRUST_PROXY;
}
