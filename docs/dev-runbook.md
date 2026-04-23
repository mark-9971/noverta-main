# Trellis dev runbook

## 1. Production app

- Production web app: `artifacts/trellis`
- Production API server: `artifacts/api-server`
- Shared runtime libraries used by the production app:
  - `lib/db`
  - `lib/api-spec`
  - `lib/api-client-react`
  - `lib/api-zod`
  - `lib/object-storage-web`
  - `lib/integrations-openai-ai-server`
  - `lib/tiers`

## 2. Demo / sandbox artifacts only

`replit.md` calls these out as additional non-production artifacts in the monorepo:

- `artifacts/trellis-demo`
- `artifacts/trellis-deck`
- `artifacts/trellis-pitch`
- `artifacts/dashboard-concepts`
- `artifacts/mockup-sandbox`

## 3. Exact commands to run frontend, backend, and E2E

Install dependencies:

- `pnpm install`

Frontend dev (`artifacts/trellis/package.json` and `artifacts/trellis/.replit-artifact/artifact.toml`):

- `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/trellis run dev`

Backend dev (`artifacts/api-server/package.json` and `artifacts/api-server/.replit-artifact/artifact.toml`):

- `PORT=8090 DATABASE_URL=postgres://USER:PASS@HOST:5432/DB pnpm --filter @workspace/api-server run dev`

Single-origin browser / E2E shape proven by `.github/workflows/e2e.yml` and `scripts/ci-proxy.mjs`:

- `pnpm run typecheck:libs`
- `pnpm --filter @workspace/db run push`
- `PORT=8090 pnpm --filter @workspace/api-server run build`
- `PORT=8090 pnpm --filter @workspace/api-server run start`
- `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/trellis run build`
- `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/trellis run serve`
- `node scripts/ci-proxy.mjs`

Run E2E (`e2e/package.json` and `e2e/README.md`):

- `pnpm --filter @workspace/e2e test`

Notes:

- `pnpm --filter @workspace/e2e test` already runs `ensure-browser`; the separate `playwright install chromium` command exists in `e2e/README.md` and CI but is not required before every run.
- The web app uses relative `/api` requests, so the proxy-backed single-origin shape is the only browser/E2E setup explicitly proven by repo files.
- Backend tests auto-sync the test DB schema:
  - `pnpm --filter @workspace/api-server test`

## 4. Environment variables

### Proven required by startup scripts / config

#### Core runtime

- `PORT` — required by both `artifacts/trellis` Vite config and `artifacts/api-server`
- `BASE_PATH` — required by `artifacts/trellis` Vite config
- `DATABASE_URL` — required by `lib/db` and Drizzle tooling

### Proven required by E2E docs / CI

- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `E2E_ADMIN_EMAIL` — CI requires it; local specs also define a default
- `E2E_ADMIN_PASSWORD` — CI requires it; local specs also define a default

### Conditional / optional

#### Dev / local convenience

- `NODE_ENV` — Replit defaults this to `test` in development
- `DEV_AUTH_BYPASS` — enables backend dev auth bypass outside production
- `VITE_DEV_AUTH_BYPASS` — enables frontend dev auth bypass outside production
- `E2E_PROVISION_KEY` — overrides the default E2E provisioning secret
- `E2E_TEACHER_EMAIL`
- `E2E_TEACHER_PASSWORD`
- `E2E_BASE_URL`
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`
- `TRELLIS_DEV_FORCE_DISTRICT_ID` — non-production override to pin requests to one district

#### Uncertain / runtime-dependent

- `VITE_CLERK_PUBLISHABLE_KEY` — `artifacts/trellis/src/App.tsx` passes it to `ClerkProvider`, but the repo does not hard-fail at build/startup when it is missing. Treat it as likely needed for a usable auth UI, not as a proven startup requirement.

#### Feature-specific env vars not proven required for a basic local trial

- App/runtime URLs: `APP_URL`, `APP_BASE_URL`, `APP_ORIGIN`, `CORS_ALLOWED_ORIGINS`, `TRUST_PROXY`
- Monitoring: `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_RELEASE`, `VITE_APP_VERSION`, `APP_VERSION`, `LOG_LEVEL`, `SENTRY_TEST_ENABLED`
- Email: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`
- Storage/files: `PUBLIC_OBJECT_SEARCH_PATHS`, `PRIVATE_OBJECT_DIR`
- AI: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`

## 5. Replit-specific pieces to watch in a future migration

- `.replit` defines the default dev environment, ports, shared env defaults, object storage, and a built-in Postgres module.
- `replit.nix` supplies Chromium and system libraries used by Playwright / browser tooling.
- The frontend Vite config conditionally loads Replit-only plugins:
  - `@replit/vite-plugin-cartographer`
  - `@replit/vite-plugin-dev-banner`
  - `@replit/vite-plugin-runtime-error-modal`
- The backend object storage layer uses a Replit sidecar endpoint on `127.0.0.1:1106` and Google Cloud Storage external-account credentials derived from that sidecar.
- Stripe is wired through Replit connectors plus `stripe-replit-sync`, using:
  - `REPLIT_CONNECTORS_HOSTNAME`
  - `REPL_IDENTITY`
  - `WEB_REPL_RENEWAL`
  - `REPLIT_DEPLOYMENT`
- Browser/E2E flows assume a single-origin proxy setup similar to Replit routing; `scripts/ci-proxy.mjs` mirrors that shape in CI.
