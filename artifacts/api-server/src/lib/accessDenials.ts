/**
 * Lightweight in-memory ring buffer of recent auth failures (401/403).
 *
 * Captures every denial decision the auth and tier middleware emit so support
 * staff can answer "why can't this user reach this page?" without grep-ing
 * server logs. Process-local and bounded — there is no DB write on the hot
 * path, and the buffer self-trims at MAX_ENTRIES.
 *
 * Intentionally NOT persisted to the audit_logs table because:
 *   - audit_logs is the legal/compliance trail (record changes only).
 *   - Denials are noisy (every page-load probe from a wrong-tier user fires one)
 *     and would balloon the audit table without operational value.
 *
 * If durable retention is later required, swap the in-memory store for a
 * dedicated `access_denials` table behind the same record/get API.
 */
import type { Request } from "express";
import { getClerkUserId, getPublicMeta } from "./clerkClaims";
import { getClientIp } from "./clientIp";

export type DenialKind =
  | "unauthenticated"           // 401 — no Clerk session / no token
  | "no_role"                   // 403 — token present, no Trellis role
  | "role_forbidden"            // 403 — role exists but lacks requireRoles/requireMinRole
  | "platform_admin_required"   // 403 — non-platform-admin hit a /support/* endpoint
  | "no_district_scope"         // 403 — non-platform-admin without a districtId claim
  | "tier_upgrade_required"     // 403 — feature gated by district tier
  | "tier_check_failed"         // 503 — DB lookup failed during tier resolution
  | "guardian_scope_required"   // 403 — guardian portal route hit by non-guardian
  | "dev_headers_in_prod";      // 400 — x-test-* headers reached prod

export interface AccessDenial {
  id: number;
  at: string;                        // ISO timestamp
  kind: DenialKind;
  status: number;                    // HTTP status sent to client
  method: string;
  path: string;                      // req.originalUrl (path only, no query)
  actorUserId: string | null;        // Clerk user id if any
  actorRole: string | null;          // role from token meta if any
  districtId: number | null;         // token districtId if any
  ip: string | null;
  detail: string;                    // human-readable reason (feature key, missing role, etc.)
}

const MAX_ENTRIES = 200;
const _buf: AccessDenial[] = [];
let _seq = 0;

function pathOnly(req: Request): string {
  // originalUrl is the full mounted path including query — strip the query for the buffer.
  const url = req.originalUrl || req.url || "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

export function recordAccessDenial(
  req: Request,
  kind: DenialKind,
  status: number,
  detail: string,
): void {
  let actorUserId: string | null = null;
  let actorRole: string | null = null;
  let districtId: number | null = null;
  try {
    actorUserId = getClerkUserId(req) ?? null;
    const meta = getPublicMeta(req);
    actorRole = (meta.role as string | undefined) ?? null;
    districtId = meta.districtId ?? null;
  } catch {
    // Reading Clerk claims may fail when the request has no session; that's expected for 401s.
  }

  const entry: AccessDenial = {
    id: ++_seq,
    at: new Date().toISOString(),
    kind,
    status,
    method: req.method,
    path: pathOnly(req),
    actorUserId,
    actorRole,
    districtId,
    ip: getClientIp(req),
    detail,
  };
  _buf.push(entry);
  if (_buf.length > MAX_ENTRIES) _buf.shift();
}

export function getRecentAccessDenials(limit = 100): AccessDenial[] {
  const n = Math.max(1, Math.min(MAX_ENTRIES, limit));
  // Newest first.
  return _buf.slice(-n).reverse();
}

export function clearAccessDenials(): void {
  _buf.length = 0;
}
