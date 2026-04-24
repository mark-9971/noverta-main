# Noverta end-to-end tests

Playwright suite that exercises critical first-run flows against a running
Noverta dev environment.

## What's covered

- `tests/sample-data-flow.spec.ts` — admin signs in, clicks "Try with
  sample data" on `/setup`, lands on `/compliance-risk-report` with
  non-empty content, sees the global `SampleDataBanner` across pages,
  then tears down and confirms counts return to zero.
- `tests/sample-data-tour.spec.ts` — admin seeds sample data and the
  guided `SampleDataTour` auto-opens on `/compliance-risk-report`. The
  test walks through all five steps, asserts the `data-tour-id` anchor
  for each step exists, then verifies that both "Finish" and "Skip
  tour" persist the seen flag and prevent the tour from re-appearing on
  reload while sample data is still loaded.
- `tests/incident-form-wizard.spec.ts` — UI coverage for the 5-step
  `NewIncidentForm` wizard on `/protective-measures`. Asserts step-1 and
  step-2 required-field guards, walks the happy path through all five
  steps and confirms the new incident appears in the list, exercises the
  Back button, and verifies the step-5 summary review and signature
  fields render. Suppresses `SampleDataTour` via an init script so the
  wizard isn't redirected mid-flow.
- `tests/shared-handling-state.spec.ts` — proves the server-side
  `action_item_handling` state is shared across users in the SAME
  district and isolated from a SECOND district, in the rendered UI.
  Uses three fixture users provisioned by `tests/global-setup.ts`:
  - **Admin A** (`E2E_ADMIN_EMAIL`, primary district, default
    `trellis-e2e-admin+clerk_test@example.com`) — performs writes via
    the Action Center handling pill.
  - **Admin B** (`E2E_ADMIN_B_EMAIL`, primary district, default
    `trellis-e2e-admin-b+clerk_test@example.com`) — reads on Action
    Center AND on the Compliance Risk Report (cross-surface assertion).
  - **Admin C** (`E2E_ADMIN_C_EMAIL`, secondary district named
    "E2E Secondary District", default
    `trellis-e2e-admin-c+clerk_test@example.com`) — reads and must NOT
    see Admin A's handling rows (district isolation).
  All three Clerk users must exist in the configured Clerk instance
  (the `+clerk_test` suffix bypasses email verification). The new
  `districtSlot: "primary" | "secondary"` parameter on `POST /api/e2e/setup`
  is what pins Admin C into the secondary district.
- `tests/incident-lifecycle.spec.ts` — full 14-test suite covering the
  Massachusetts 603 CMR 46.00 protective-measures incident lifecycle:
  draft creation, status transitions (`draft → open → under_review →
  resolved → dese_reported`), invalid-transition rejection, terminal
  status enforcement, parent notification draft generation/approval/
  return-for-correction, certified-mail send, duplicate-send rejection,
  and a smoke test that loads the `/protective-measures` UI and asserts
  the freshly-created incident appears in the list. Wired up as part of
  the `incident-e2e` validation in `.replit`.

## Incident E2E validation step

The `incident-e2e` validation command runs all incident specs end-to-end
against the live dev workflows (`artifacts/api-server` + `artifacts/trellis`)
using a Chromium binary resolved via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`,
followed by a TypeScript no-emit check:

```bash
cd e2e && \
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$(which chromium 2>/dev/null || echo '') \
  npx playwright test \
    tests/incident-form-wizard.spec.ts \
    tests/incident-lifecycle.spec.ts \
    tests/quick-report-form.spec.ts \
    --reporter=line && \
  npx tsc --noEmit
```

In CI use the same command — the workflow installs Chromium via
`pnpm --filter @workspace/e2e exec playwright install --with-deps chromium`
in a previous step.

Authentication: the specs send the dev-bypass headers (`x-test-user-id`,
`x-test-role`, `x-test-district-id`) on every `page.request.*` call so the
api-server's `requireAuth` middleware accepts them in lieu of a Clerk session
when `NODE_ENV=test` or `DEV_AUTH_BYPASS=1` is set on the api-server (the
defaults for the Replit dev workflow). Clerk sign-in still runs so any UI
gated on `useUser` renders normally.

Known issue: `incident-lifecycle.spec.ts` calls `POST /api/sample-data` in
`beforeEach`. On environments whose database schema is behind the current
`@workspace/db` schema (missing columns such as `districts.demo_expires_at`
or `schools.deleted_at`), the seed call returns 500 and the lifecycle suite
fails before any incident assertion runs. This is a pre-existing schema-drift
problem that is unrelated to the test infrastructure; running schema migrations
against the dev DB unblocks the suite. The wizard suite does not depend on
sample-data seeding and runs green regardless.

## Running locally

```bash
# 1. Install playwright browsers (first time only)
pnpm --filter @workspace/e2e exec playwright install chromium

# 2. Make sure the dev API + web are running (workflows: artifacts/api-server, artifacts/trellis).

# 3. Provide a Clerk test admin (see https://clerk.com/docs/testing/test-emails).
#    Default emails/passwords below remain `trellis-e2e-*` / `TrellisE2E!*`
#    so existing Clerk dev-instance users keep working unchanged. The
#    canonical Noverta-era aliases `noverta-e2e-admin+clerk_test@example.com`
#    and `noverta-e2e-teacher+clerk_test@example.com` are also accepted by
#    the auth-time auto-provision fallback (see "Demo / e2e identity
#    bootstrap" below) — once new Clerk dev-instance users are created
#    with those addresses + new passwords, point E2E_ADMIN_EMAIL /
#    E2E_TEACHER_EMAIL / their _PASSWORD envs at them.
export E2E_ADMIN_EMAIL='trellis-e2e-admin+clerk_test@example.com'
export E2E_ADMIN_PASSWORD='TrellisE2E!Test#2026'

# 4. Provide a Clerk non-admin (sped_teacher) test user. Used by the
#    onboarding-checklist spec to verify the role gate end-to-end with a
#    real Clerk session (not a mocked 403).
export E2E_TEACHER_EMAIL='trellis-e2e-teacher+clerk_test@example.com'
export E2E_TEACHER_PASSWORD='TrellisE2E!Teacher#2026'

# 5. Run the full suite.
pnpm --filter @workspace/e2e test

# Or run just the incident-lifecycle suite (matches the .replit incident-e2e
# validation).
cd e2e && npx playwright test tests/incident-lifecycle.spec.ts --reporter=list
```

Both Clerk users are auto-provisioned by `tests/global-setup.ts` against
`POST /api/e2e/setup`, which writes `publicMetadata.role` (admin /
sped_teacher), `staffId`, and `districtId` back to the Clerk user. The
provisioner is gated by `X-E2E-Key` (defaults to `e2e-dev-local`,
override with `E2E_PROVISION_KEY`) and is only mounted in non-production
environments. Create the two Clerk test users in the Clerk dashboard
before the first run; subsequent runs reuse them.

### Demo / e2e identity bootstrap

Outside of `/api/e2e/setup`, any Clerk user whose email is in the canonical
demo list (`lib/db/src/seed-demo-identities.ts` — currently the legacy
`trellis-e2e-admin+clerk_test@example.com`,
`trellis-e2e-teacher+clerk_test@example.com`, the canonical
`noverta-e2e-admin+clerk_test@example.com`,
`noverta-e2e-teacher+clerk_test@example.com`, and
`showcase-walker+clerk_test@example.com`) is auto-linked to a staff row in
the `is_demo=true` district the first time `requireDistrictScope` runs for
them. This means the showcase / sales-demo path works against any
environment that has loaded the demo seed (`pnpm --filter @workspace/db
exec tsx run-seed-demo.ts`, or `POST /api/sample-data/reset-demo` for
platform admins) — no manual `INSERT INTO staff` required. To add a new
demo identity, edit `seed-demo-identities.ts`; both the canonical seed
script and the auth-time fallback will pick it up automatically.

### `NOVERTA_DEV_FORCE_DISTRICT_ID` (alias: `TRELLIS_DEV_FORCE_DISTRICT_ID`)

In non-production environments only, setting this env var pins every
authenticated request to the given district id, bypassing both the Clerk
metadata claim and the staff-row lookup. Use it sparingly — it overrides
real tenant scope and is intended only for QA on dedicated single-tenant
staging deployments.

The canonical Noverta-era name is `NOVERTA_DEV_FORCE_DISTRICT_ID`. The
legacy `TRELLIS_DEV_FORCE_DISTRICT_ID` is still accepted (with the new
name winning when both are set) so existing operator/CI configs keep
working during the rename. Drop the legacy alias once every environment
has been updated. The auto-provision fallback above is the preferred
route for the showcase / e2e accounts; reach for the env var only when you
need to force a non-demo Clerk identity into a specific district for a
one-off investigation. Production rejects this var by virtue of the
`process.env.NODE_ENV !== "production"` guard in `auth.ts`.

## Required environment variables

The suite — and in particular the `incident-e2e` validation registered in
`.replit` — depends on the following variables being set in the Replit dev
env (or your local shell / CI environment):

| Variable                  | Purpose                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `E2E_ADMIN_EMAIL`         | Clerk test admin email. Must use the `+clerk_test` suffix so verification is bypassed (e.g. `me+clerk_test@x.com`). |
| `E2E_ADMIN_PASSWORD`      | Password for the Clerk test admin user.                                                                              |
| `CLERK_PUBLISHABLE_KEY`   | Clerk frontend key — same instance the app is using; required by `@clerk/testing` to drive the sign-in flow.         |
| `CLERK_SECRET_KEY`        | Clerk backend key — used by `@clerk/testing` to mint the testing token bypassing bot-detection on dev instances.     |

Optional:

- `E2E_TEACHER_EMAIL` / `E2E_TEACHER_PASSWORD` — non-admin user used by
  the onboarding-checklist role-gate spec.
- `E2E_BASE_URL` — overrides the resolved `baseURL`. Default order is
  `E2E_BASE_URL` → `https://$REPLIT_DEV_DOMAIN` → `http://localhost:80`.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` — points Playwright at a system
  Chromium when one is provided by Nix (the `incident-e2e` workflow sets
  this automatically via `which chromium`).
- `E2E_PROVISION_KEY` — overrides the default `X-E2E-Key` (`e2e-dev-local`)
  used by `tests/global-setup.ts` against `POST /api/e2e/setup`.

The suite uses `@clerk/testing` so `CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY` must be set in the environment (they already are in the
Replit dev env). The test resolves `baseURL` from `E2E_BASE_URL` →
`https://$REPLIT_DEV_DOMAIN` → `http://localhost:80`.

In the Replit dev environment Clerk runs in test mode and `+clerk_test`
emails bypass email verification, so the suite can sign in
non-interactively against the same Clerk instance the app uses. The test
is self-cleaning: any leftover sample data and incidents from a prior run
are removed before/after the run.

## Running in CI

The suite runs automatically on every pull request targeting `main` via
`.github/workflows/e2e.yml`. The workflow:

1. Spins up a Postgres 16 service container.
2. Installs deps with pnpm, builds the workspace libs, the API server,
   and the Noverta web app.
3. Pushes the Drizzle schema to the Postgres service.
4. Starts the API server (`PORT=8090`) and the Vite preview of the web
   app (`PORT=5173`) in the background.
5. Starts a tiny Node reverse proxy (`scripts/ci-proxy.mjs`) on
   `:8080` that routes `/api/*` to the API and everything else to the
   web preview, mirroring the Replit dev proxy.
6. Waits for all three services to be healthy.
7. Runs `npx playwright test` from `e2e/`.
8. On failure, uploads the Playwright HTML report, traces, screenshots,
   videos under the `playwright-report` artifact and the service logs
   under `service-logs`.

The following GitHub Actions secrets must be configured on the
repository (Settings → Secrets and variables → Actions):

| Secret                  | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `CLERK_PUBLISHABLE_KEY` | Clerk publishable key for the test Clerk instance.   |
| `CLERK_SECRET_KEY`      | Clerk secret key for `@clerk/testing` provisioning.  |
| `E2E_ADMIN_EMAIL`       | Clerk test admin email (e.g. `…+clerk_test@…`).      |
| `E2E_ADMIN_PASSWORD`    | Password for the Clerk test admin user.              |

## Implementation notes / gotchas

- **Clerk `Origin` + `Authorization` conflict.** Clerk's browser SDK
  rejects any request that carries both an `Origin` header and an
  `Authorization` header (`"only one of 'Origin' and 'Authorization'
  headers should be provided"`). When a Playwright test needs to do a
  full `page.goto(...)` to a UI route AFTER calling
  `context.setExtraHTTPHeaders({ Authorization: 'Bearer …' })`, the
  Clerk SDK fails to load and the React app stays unmounted (blank
  page). The pattern used in `incident-lifecycle.spec.ts` test #14 is:
  1. Capture the JWT via `Clerk.session.getToken()`.
  2. Clear extra headers (`setExtraHTTPHeaders({})`).
  3. `page.goto(...)`.
  4. `page.waitForFunction(() => Clerk.loaded === true)`.
  5. Re-attach `Authorization: Bearer <jwt>` for subsequent in-page
     `authFetch` calls.
- **Disabling onboarding tours.** Both `SampleDataTour` and
  `ShowcaseTour` honor a render-time guard: if
  `window.__NOVERTA_DISABLE_TOURS__ === true` or
  `localStorage["noverta.disableTours"] === "1"`, they return `null`.
  The legacy `window.__TRELLIS_DISABLE_TOURS__` flag and
  `localStorage["trellis.disableTours"] === "1"` value are also
  accepted (rolling browser-storage migration window — see
  `docs/runbooks/noverta-cutover.md` §5.6); the canonical Noverta
  names are preferred for new code. The Playwright `addInitScript`
  in this suite sets the canonical Noverta flag and storage value
  (see `tests/incident-lifecycle.spec.ts`,
  `tests/onboarding-checklist-task-792.spec.ts`, and
  `tests/_helpers/handling.ts`), so tours never overlay test
  assertions.
