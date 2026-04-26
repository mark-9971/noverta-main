# Railway / Clerk auth posture

This runbook documents the env vars required for Clerk auth to operate
correctly on a Railway (or other managed-cloud) deployment of the Trellis
api-server, and the boot-time guards that enforce them.

## Why this exists

Every dev/test auth bypass in `artifacts/api-server/src/middlewares/auth.ts`
(plus the `x-test-staff-id` shortcut in `routes/iepBuilder/shared.ts`, the
`x-demo-role` / `x-demo-name` / `x-demo-guardian-id` headers, and the
hard-coded admin identity in `artifacts/trellis/src/lib/auth-fetch.ts`
`getDevAuthBypassHeaders`) is gated on `NODE_ENV !== "production"`.

Railway, Render, and Fly do **not** set `NODE_ENV=production` automatically.
If an operator forgets to set it, the api-server happily honors:

- `x-test-user-id` / `x-test-role` / `x-test-district-id` from any caller
- `x-test-platform-admin: true` from any caller
- `x-demo-role: admin` from any caller (defaults to `admin` even without it)

Combined with the web bundle's `getDevAuthBypassHeaders()` (which hard-codes
`x-test-user-id: dev_bypass_admin`, `x-test-role: admin`, and
`x-test-district-id: 6`), an unset `NODE_ENV` is the difference between
"every browser request is unauthenticated" and "Clerk is fully bypassed and
every request runs as district 6 admin".

This runbook closes that hole.

## Boot-time guards

`artifacts/api-server/src/lib/deployEnv.ts` inspects the process env for
managed-cloud markers:

- Railway:   `RAILWAY_ENVIRONMENT`, `RAILWAY_PROJECT_ID`, `RAILWAY_SERVICE_ID`
- Render:    `RENDER`, `RENDER_SERVICE_ID`
- Fly.io:    `FLY_APP_NAME`, `FLY_REGION`
- Explicit:  `TRELLIS_DEPLOY_ENV`

If any of these is set, `artifacts/api-server/src/index.ts` **refuses to
start** unless **both** of the following are true:

1. `NODE_ENV === "production"`
2. `DEV_AUTH_BYPASS` is unset (or empty)

It also requires `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` to be set,
both prefixed `sk_live_*` / `pk_live_*` respectively (test keys are rejected).

Independent of those markers, every `x-test-*` / `x-demo-*` bypass path
inside `auth.ts`, `tierGate.ts`, `requireLegalAcceptance.ts`, and
`iepBuilder/shared.ts` now consults `isAuthBypassAllowed()` from
`deployEnv.ts`, which returns `false` whenever a managed-cloud marker is
present **even if `NODE_ENV` is unset/dev/test** — defense in depth.

The web build (`artifacts/trellis/vite.config.ts`) refuses to build in
`NODE_ENV=production` if `VITE_DEV_AUTH_BYPASS=1`, so the bundle cannot
ship hard-coded admin headers from the production-mode pipeline.

## Required Railway env vars

Set these on the Railway **api-server** service:

| Variable | Required | Format | Notes |
|---|---|---|---|
| `NODE_ENV` | yes | `production` | Boot fails fatal otherwise. |
| `CLERK_SECRET_KEY` | yes | `sk_live_*` | `sk_test_*` rejected. |
| `CLERK_PUBLISHABLE_KEY` | yes | `pk_live_*` | Used by clerkProxyMiddleware. |
| `DATABASE_URL` | yes | Neon connection string | Existing requirement. |
| `PORT` | yes | `8080` (or Railway-injected) | Existing requirement. |
| `SENTRY_DSN` | recommended | DSN | Optional, has init guard. |
| `APP_URL` / `APP_BASE_URL` / `APP_ORIGIN` | yes | `https://app.trellis.education` | Replaces the legacy `REPLIT_DOMAINS` / `REPLIT_DEV_DOMAIN` fallbacks for share links and emails. |
| `CORS_ALLOWED_ORIGINS` | yes | Comma-separated origins | Without it `cors({ origin: false })` blocks every cross-origin request in prod. |

Set these on the Railway **web** service (Vite build):

| Variable | Required | Format | Notes |
|---|---|---|---|
| `NODE_ENV` | yes | `production` | Build runs in prod mode. |
| `VITE_CLERK_PUBLISHABLE_KEY` | yes | `pk_live_*` | Baked into the bundle at build time. |
| `VITE_API_BASE_URL` | yes if API on a different domain | `https://api.trellis.education` | Used by `setBaseUrl` and `applyApiBaseUrl`. |
| `BASE_PATH` | yes | `/` | Existing requirement. |
| `PORT` | yes | Railway-injected | Existing requirement. |

## Variables that MUST be removed

Verify these are **not set** on either Railway service:

- `DEV_AUTH_BYPASS` (api-server) — boot fails fatal if set under a managed
  marker.
- `VITE_DEV_AUTH_BYPASS` (web) — vite build refuses to compile in production
  mode while this is set.
- `TRELLIS_DEV_FORCE_DISTRICT_ID` (api-server) — already ignored when
  `NODE_ENV === "production"`, but unset to avoid surprise after a future
  refactor.

## Verifying a deploy

1. After setting the env vars and redeploying, watch the api-server boot
   log for:

   ```text
   managed-cloud deploy detected — bypass surfaces hardened
   Clerk auth configured  (keyPrefix: sk_live_*)
   Clerk publishable key configured  (keyPrefix: pk_live_*)
   ```

2. From a shell, confirm the `x-test-*` rejection is live:

   ```bash
   curl -sS -o /dev/null -w '%{http_code}\n' \
     -H "x-test-user-id: probe" \
     -H "x-test-role: admin" \
     -H "x-test-district-id: 1" \
     https://api.<your-domain>/api/health
   ```

   Expect `400` (and an `error: "Dev-only headers are not accepted in
   production"` body). Anything else means the guard is not active and the
   service must not receive traffic.

3. From the web app, sign in via Clerk. Confirm `useAuth().isSignedIn` is
   true and that requests do not carry `x-test-*` headers (DevTools →
   Network → request headers).

## Local dev posture

Local dev is unchanged. Set `DEV_AUTH_BYPASS=1` and `VITE_DEV_AUTH_BYPASS=1`
in your local shell, omit all the managed-cloud markers, and the existing
`x-test-*` / `x-demo-*` bypasses continue to work for tests and the agent
loop. CI keeps using `NODE_ENV=test` exclusively.
