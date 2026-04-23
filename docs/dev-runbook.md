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

These appear to be non-production artifacts for demos, pitches, design exploration, or isolated experiments:

- `artifacts/trellis-demo`
- `artifacts/trellis-deck`
- `artifacts/trellis-pitch`
- `artifacts/dashboard-concepts`
- `artifacts/mockup-sandbox`

## 3. Exact commands to run frontend, backend, and E2E

Install dependencies:

- `pnpm install`

Run the frontend only (`artifacts/trellis`):

- `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/trellis run dev`

Run the backend only (`artifacts/api-server`):

- `PORT=8090 pnpm --filter @workspace/api-server run dev`

Run both behind one origin for browser/E2E work (matches the CI/Replit shape more closely than separate origins):

- `PORT=8090 pnpm --filter @workspace/api-server run build`
- `PORT=8090 pnpm --filter @workspace/api-server run start`
- `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/trellis run build`
- `PORT=5173 BASE_PATH=/ pnpm --filter @workspace/trellis run serve`
- `PROXY_PORT=8080 API_TARGET=http://127.0.0.1:8090 WEB_TARGET=http://127.0.0.1:5173 node scripts/ci-proxy.mjs`

Run E2E:

- `pnpm --filter @workspace/e2e exec playwright install chromium`
- `pnpm --filter @workspace/e2e test`

Notes:

- The web app uses relative `/api` requests, so single-origin access via the proxy is the safest default for browser/E2E testing.
- Backend tests auto-sync the test DB schema:
  - `pnpm --filter @workspace/api-server test`

## 4. Environment variables

### Required for local app startup / E2E

#### Core runtime

- `PORT` — required by both `artifacts/trellis` Vite config and `artifacts/api-server`
- `BASE_PATH` — required by `artifacts/trellis` Vite config
- `DATABASE_URL` — required by `lib/db` and Drizzle tooling

#### Auth

- `CLERK_SECRET_KEY` — required for real backend auth; production startup fails without it
- `VITE_CLERK_PUBLISHABLE_KEY` — frontend Clerk publishable key

#### E2E

- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

### Optional / environment-specific

#### Dev / local convenience

- `NODE_ENV` — Replit defaults this to `test` in development
- `DEV_AUTH_BYPASS` — enables backend dev auth bypass outside production
- `VITE_DEV_AUTH_BYPASS` — enables frontend dev auth bypass outside production
- `TRELLIS_DEV_FORCE_DISTRICT_ID` — non-production override to pin requests to one district
- `E2E_PROVISION_KEY` — overrides the default E2E provisioning secret
- `E2E_TEACHER_EMAIL`
- `E2E_TEACHER_PASSWORD`
- `E2E_BASE_URL`
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`

#### URLs / proxy / request handling

- `APP_URL`
- `APP_BASE_URL`
- `APP_ORIGIN`
- `CORS_ALLOWED_ORIGINS`
- `TRUST_PROXY`

#### Monitoring / release metadata

- `SENTRY_DSN`
- `VITE_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`
- `SENTRY_RELEASE`
- `VITE_APP_VERSION`
- `APP_VERSION`
- `LOG_LEVEL`
- `SENTRY_TEST_ENABLED`

#### Email

- `RESEND_API_KEY`
- `RESEND_WEBHOOK_SECRET`
- `DEMO_READINESS_ALERT_EMAIL`
- `PILOT_ACCOUNT_MANAGER_EMAIL`

#### Storage / files

- `PUBLIC_OBJECT_SEARCH_PATHS`
- `PRIVATE_OBJECT_DIR`

#### AI integrations

- `AI_INTEGRATIONS_OPENAI_BASE_URL`
- `AI_INTEGRATIONS_OPENAI_API_KEY`

#### Replit / deployment-provided

- `REPL_ID`
- `REPLIT_DEV_DOMAIN`
- `REPLIT_DOMAINS`
- `REPLIT_GIT_COMMIT_SHA`
- `REPLIT_DEPLOYMENT`
- `REPLIT_CONNECTORS_HOSTNAME`
- `REPL_IDENTITY`
- `WEB_REPL_RENEWAL`

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
