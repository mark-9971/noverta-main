# Trellis end-to-end tests

Playwright suite that exercises critical first-run flows against a running
Trellis dev environment.

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

## Running locally

```bash
# 1. Install playwright browsers (first time only)
pnpm --filter @workspace/e2e exec playwright install chromium

# 2. Make sure the dev API + web are running (workflows: artifacts/api-server, artifacts/trellis).

# 3. Provide a Clerk test admin (see https://clerk.com/docs/testing/test-emails).
export E2E_ADMIN_EMAIL='trellis-e2e-admin+clerk_test@example.com'
export E2E_ADMIN_PASSWORD='TrellisE2E!Test#2026'

# 4. Provide a Clerk non-admin (sped_teacher) test user. Used by the
#    onboarding-checklist spec to verify the role gate end-to-end with a
#    real Clerk session (not a mocked 403).
export E2E_TEACHER_EMAIL='trellis-e2e-teacher+clerk_test@example.com'
export E2E_TEACHER_PASSWORD='TrellisE2E!Teacher#2026'

# 5. Run.
pnpm --filter @workspace/e2e test
```

Both Clerk users are auto-provisioned by `tests/global-setup.ts` against
`POST /api/e2e/setup`, which writes `publicMetadata.role` (admin /
sped_teacher), `staffId`, and `districtId` back to the Clerk user. The
provisioner is gated by `X-E2E-Key` (defaults to `e2e-dev-local`,
override with `E2E_PROVISION_KEY`) and is only mounted in non-production
environments. Create the two Clerk test users in the Clerk dashboard
before the first run; subsequent runs reuse them.

The suite uses `@clerk/testing` so `CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY` must be set in the environment (they already are in the
Replit dev env). The test resolves `baseURL` from `E2E_BASE_URL` →
`https://$REPLIT_DEV_DOMAIN` → `http://localhost:80`.

In the Replit dev environment Clerk runs in test mode and `+clerk_test`
emails bypass email verification, so the suite can sign in
non-interactively against the same Clerk instance the app uses. The test
is self-cleaning: any leftover sample data from a prior run is removed
before the seed step.

## Running in CI

The suite runs automatically on every pull request targeting `main` via
`.github/workflows/e2e.yml`. The workflow:

1. Spins up a Postgres 16 service container.
2. Installs deps with pnpm, builds the workspace libs, the API server,
   and the Trellis web app.
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
