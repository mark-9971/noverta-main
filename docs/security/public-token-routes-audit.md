# Public / Token-Authenticated Route Hardening — Audit & Status

_Last updated: 2026-04-17. Owner: platform security._

This document is the per-route ledger for every public, token-authenticated, or
webhook endpoint in `@workspace/api-server`. For each row we track what data the
route exposes, whether the token is hashed at rest, the TTL, the rate-limit
posture, what gets audit-logged, and replay-safety (atomic claims, one-time-view,
revocation).

## Status legend

| Marker | Meaning |
|---|---|
| ✅ | Hardened and covered by tests |
| ⚠️ | Mitigated but with a documented residual risk |
| ❌ | Known gap — see "Remaining risks" |
| n/a | Not applicable to this surface |

## Route matrix

### 1. Parent progress share links (`/api/parent-progress/share/:token/...`)

| Field | Status |
|---|---|
| Data exposed | Student first name, recent observation snippet, redacted |
| Token at rest | ✅ SHA-256 hash; legacy plaintext column nullable & being phased out |
| TTL | ✅ Configurable (`SHARE_LINK_TTL_DAYS`, default 30, cap 90); per-row `expiresAt` |
| Rate limit | ✅ Per-token (30/min) + per-IP (60/min) sliding window, TRUST_PROXY-gated |
| Audit log | ✅ Every claim, view, rotate, revoke recorded with IP |
| Replay safety | ✅ Atomic claim (UPDATE … WHERE status='pending'), one-time-view enforced, atomic rotate |
| Tests | ✅ `tests/11-share-link-hardening.test.ts` (12 cases) |

### 2. Signature requests (`/api/signature-requests/:token`, `/document`, `/sign`)

| Field | Status |
|---|---|
| Data exposed | Document title/category/filename, recipient name, document bytes (download), signed-at |
| Token at rest | ✅ NEW — SHA-256 hash via `tokenHash`; legacy `token` column kept nullable for in-flight links until they expire |
| TTL | ✅ NEW — configurable via `SIGNATURE_REQUEST_TTL_DAYS` (default 30, cap 90), persisted as `expiresAt` |
| Rate limit | ✅ NEW — per-token (30/min) + per-IP (60/min) sliding window via shared `SlidingWindowLimiter` |
| Audit log | ✅ Create, every document view (with IP & view-counter increment), sign, revoke |
| Replay safety | ✅ NEW — atomic sign claim (`WHERE status='pending' AND revokedAt IS NULL`); on lost-race the response is reclassified so the client sees the real reason (signed/revoked/expired). Revocation supported via `POST /signature-requests/:id/revoke` (privileged, district-scoped). |
| Response codes | ✅ NEW — explicit `code` field: `not_found`, `revoked`, `signed`, `expired`, `rate_limited` |
| Tests | ⚠️ Reuses share-link patterns; dedicated signature-link suite is the next-task follow-up |

### 3. Demo requests (`POST /api/demo-requests`)

| Field | Status |
|---|---|
| Data exposed | None on response beyond echo; row visible only to admins on GET |
| Token at rest | n/a — no token, public form post |
| TTL | n/a |
| Rate limit | ✅ NEW — per-IP 5 / hour sliding window (skipped under `NODE_ENV=test`). Global `/api` 200/min still applies on top. |
| Audit log | ⚠️ Inserted row is the audit trail; no separate audit_logs entry. Acceptable for marketing-form data. |
| Replay safety | n/a — duplicate submissions are tolerated, deduped at triage time |

### 4. Document acknowledgement (`POST /api/guardian-portal/.../acknowledge`)

| Field | Status |
|---|---|
| Auth | ✅ Guardian session via `requireGuardianScope` (not token-based) |
| Data exposed | Existing acknowledgement row; document-id scope enforced |
| Rate limit | Inherits global `/api` limiter |
| Audit log | ✅ DB row records guardianId + IP via shared `getClientIp(req)` (was direct XFF read) |
| Replay safety | ✅ Unique constraint `(document_id, guardian_id)` + `ON CONFLICT DO NOTHING` |

### 5. Stripe webhook (`POST /api/webhooks/stripe`)

| Field | Status |
|---|---|
| Auth | ✅ HMAC signature verified by `stripe.webhooks.constructEvent` against `STRIPE_WEBHOOK_SECRET`; raw body preserved |
| Data exposed | None on response (200 OK) |
| Rate limit | n/a — sender-controlled |
| Audit log | Stripe-native event log; we additionally log to stdout |
| Replay safety | ✅ Stripe signature includes timestamp; tolerance enforced by SDK. Duplicate event-IDs are idempotent because handlers upsert on `stripe_event_id`. |

### 6. Resend webhook (`POST /api/webhooks/resend`)

| Field | Status |
|---|---|
| Auth | ✅ Svix signature verified against `RESEND_WEBHOOK_SECRET` |
| Data exposed | None |
| Replay safety | ✅ Svix message-id is unique and we no-op on repeats |

### 7. Health (`GET /healthz`)

| Field | Status |
|---|---|
| Auth | Public |
| Data exposed | Build version + 1-hour error counter |
| Risk | Low; deferred. Could be moved behind ops auth if surface expands. |

## Cross-cutting infrastructure

- **`lib/clientIp.ts`** — single source of truth for client-IP extraction. Trusts
  `X-Forwarded-For` only when `TRUST_PROXY=1|true|yes`; otherwise falls back to
  the socket address. Every public-by-token route, `auditLog`, `accessDenials`,
  guardian-acknowledge, share-link routes, and signature-request routes now go
  through it. Direct `req.headers["x-forwarded-for"]` reads have been eliminated
  from this codebase.
- **`lib/rateLimiter.ts`** — shared sliding-window limiter (extracted from
  `shareLinks.ts`). Process-local; documented as the primary remaining risk for
  multi-instance deployments.
- **Audit log** — every privileged or anonymous-by-token state change writes to
  `audit_logs` via `logAudit(req, …)`, which now uses the shared IP helper.

## Remaining risks (not patched in this pass)

1. **Process-local rate limiters.** All in-memory. A multi-instance api-server
   deployment lets attackers route around the limit. Swap for a Redis backend
   when we scale horizontally.
2. **Legacy plaintext `signature_requests.token` rows.** Existing pre-migration
   rows still carry the plaintext token. The lookup helper falls back to the
   plaintext column for those, but a DB dump would yield working URLs for the
   legacy subset. Once the longest legacy `expiresAt` (or `createdAt + 30d`)
   has passed, drop the column.
3. **No CAPTCHA on demo-requests.** A determined spammer can rotate IPs against
   a 5/hr limit. Defer to post-launch when we observe actual abuse.
4. **No dedicated test suite for signature-request hardening.** The behavior is
   exercised indirectly; mirror `tests/11-share-link-hardening.test.ts` next.
5. **TRUST_PROXY is binary.** Production should set it to `1`. If we deploy
   behind a multi-hop proxy chain we'll need a hop-count or trusted-CIDR list.
6. **Health endpoint is public** with version + error counters. Low risk;
   re-evaluate if we add anything more sensitive.
