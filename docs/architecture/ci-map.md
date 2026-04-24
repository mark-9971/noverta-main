# Noverta CI / Workflow Map

Status: adopted for `ARCH-REORG-05`.

Purpose: give a newly hired engineer a concise map of the GitHub Actions workflows in this repo — what each one checks, what it depends on, which ones need secrets, and how to read a failure so they know whether it is a bootstrap issue, a secret issue, a schema-drift issue, or an actual product/e2e issue.

This doc is docs-only. It describes the workflows **as they currently are**. It does not modify any workflow file, `package.json` script, or runtime code.

Use this together with:
- `docs/ENGINEER-ONBOARDING.md`
- `docs/architecture/boundaries.md`
- `docs/architecture/README.md`
- `docs/architecture/non-production-inventory.md`
- `docs/architecture/contracts-path.md`
- The workflow files themselves under `.github/workflows/` (always the final source of truth)

Trust order: current workflow files > `replit.md` > this doc > older audit/analysis files.

---

## 1. Workflow inventory

As of this commit, the repo has three GitHub Actions workflows:

| Workflow file | Workflow name | Trigger | Secret-dependent? | Primary job |
|---|---|---|---|---|
| `.github/workflows/schema-drift.yml` | **Schema Drift** | `pull_request` to `main`; `workflow_dispatch` | **No** (service-container env only) | Detect Drizzle ↔ Postgres schema drift |
| `.github/workflows/e2e.yml` | **E2E Tests** | `pull_request` to `main`; `workflow_dispatch` | **Yes** (Clerk + E2E creds) | Playwright end-to-end against built web + API |
| `.github/workflows/batch-2-deploy-gate.yml` | **Batch 2 Deploy Gate** | `workflow_dispatch`; `push` to `main` on scoped paths | **Yes** (production-clone DB URL) | Block Batch 2 deploys while uncoupled overlap rows remain |

Everything else that looks like "CI" (root `pnpm run ci`, `pnpm run check:api-codegen`, `pnpm run lint:tenant-scope`, `pnpm run typecheck`) is a **local script**, not a GitHub Actions workflow. Those scripts are what you run locally before pushing; they are not workflows in their own right. If a workflow chooses to run them, that is an implementation detail of the workflow.

---

## 2. Schema Drift — `.github/workflows/schema-drift.yml`

**Purpose:** detect when the PR's Drizzle schema declarations have drifted from the SQL migration set — i.e. when a column was added to the Drizzle schema without a paired migration.

**Trigger:**
- Every PR targeting `main`
- Manual `workflow_dispatch`

**Runtime:**
- Postgres 16 service container (`trellis` / `trellis` / `trellis_drift`)
- Node.js 24, pnpm pinned to `10.33.0` via `pnpm/action-setup@v4`
- `timeout-minutes: 10`

**Secrets required:** **none**. The job explicitly says so in the preflight step: _"Schema Drift uses Postgres service-container env only; no GitHub secrets are required."_

**What it actually does (abridged):**
1. Verifies `DATABASE_URL` is set (pointing at the service container).
2. Installs deps with `pnpm install --frozen-lockfile`.
3. Stashes the PR's `lib/db/src/schema/`, checks out the **base branch's** schema into the worktree, and runs `pnpm --filter @workspace/db run push-force` — the DB now matches `main` exactly.
4. Restores the PR's `lib/db/src/schema/` directory.
5. Runs `pnpm --filter @workspace/db run check-drift`, which applies every SQL file in `lib/db/src/migrations/` in order and then asserts via `assertSchemaColumnsPresent()` that every column declared in the PR's Drizzle schema exists in the resulting DB.

**How to read a failure:**
- If the final step prints `<table>.<column>` pairs, the PR added a Drizzle column without a matching migration. Fix: add the paired migration and re-push.
- If the job fails earlier (install, push-force, etc.), it is a **bootstrap-style** failure (see section 5), not a schema-drift signal.

---

## 3. E2E Tests — `.github/workflows/e2e.yml`

**Purpose:** full browser verification of critical product flows. Builds both the API server and the `trellis` web app, stands up a local proxy, and runs Playwright against the proxied origin.

**Trigger:**
- Every PR targeting `main`
- Manual `workflow_dispatch`

**Runtime:**
- Postgres 16 service container (`trellis` / `trellis` / `trellis_e2e`)
- Node.js 24, pnpm pinned to `10.33.0` via `pnpm/action-setup@v4`
- `timeout-minutes: 30`

**Secrets required — all four must be set as repo secrets:**
- `CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `E2E_ADMIN_EMAIL`
- `E2E_ADMIN_PASSWORD`

A dedicated "Verify required secrets are present" step fails the job early, listing the exact missing variables, before any build or browser work starts.

Non-secret env set by the workflow:
- `DATABASE_URL` → service container
- `NODE_ENV=test`, `LOG_LEVEL=warn`, `DEV_AUTH_BYPASS=0`, `TRUST_PROXY=1`
- `APP_BASE_URL` / `APP_ORIGIN` / `CORS_ALLOWED_ORIGINS` / `E2E_BASE_URL` → `http://127.0.0.1:8080`
- `SESSION_SECRET=ci-e2e-session-secret-do-not-use-in-prod`
- `E2E_PROVISION_KEY=ci-e2e-provision-key`
- `PROXY_PORT=8080`, `API_TARGET=http://127.0.0.1:8090`, `WEB_TARGET=http://127.0.0.1:5173`

**What it actually does (abridged):**
1. Checkout + pnpm + Node.js setup.
2. Verify the four Clerk/E2E secrets are present.
3. `pnpm install --frozen-lockfile`.
4. `pnpm run typecheck:libs` (workspace library typecheck).
5. `pnpm --filter @workspace/db run push` — apply schema to the service DB.
6. Build API (`@workspace/api-server`) and web (`@workspace/trellis`).
7. Install Playwright browsers (`chromium` with deps) via `@workspace/e2e`.
8. Start API server on `:8090`, web preview on `:5173`, and a reverse proxy on `:8080` (from `scripts/ci-proxy.mjs`) — each backgrounded with logs written to `/tmp/*.log` and PIDs captured.
9. Wait up to ~2 minutes each for API/web/proxy readiness; on timeout the job tails the relevant log and fails.
10. `npx playwright test --reporter=list,html` from `e2e/`.
11. Always tear down PIDs; on failure, upload `playwright-report`, `test-results`, and the three service logs as artifacts.

**How to read a failure:**
- "Required secret … is not set" at the verify step → **missing-secret failure** (section 5), not a product issue.
- Install / typecheck / build steps fail → **bootstrap-style** failure.
- "API server did not become ready" / "Web preview did not become ready" / "Proxy did not become ready" → service-startup failure; check the uploaded `service-logs` artifact and `/tmp/*.log` tails in the job output. Usually an env/config issue, not a Playwright issue.
- Playwright step fails → **product/e2e failure**. The uploaded `playwright-report` artifact has per-test traces; `service-logs` artifact has the API/web/proxy stdout+stderr from the run.

---

## 4. Batch 2 Deploy Gate — `.github/workflows/batch-2-deploy-gate.yml`

**Purpose:** a deploy-time gate for the Batch 2 (minute-calc migration) rollout. Blocks promotion while any `overlapping_chain_uncoupled` rows remain unresolved in a production-clone database.

**Trigger:**
- Manual `workflow_dispatch` (used as a required check before promoting Batch 2 to production)
- `push` to `main` scoped to a narrow path filter:
  - `artifacts/api-server/src/lib/domain-service-delivery/**`
  - `lib/db/src/scripts/report-uncoupled-overlaps.ts`
  - `.github/workflows/batch-2-deploy-gate.yml`

**Runtime:**
- No service container — connects to an external production-clone DB
- Node.js 24, pnpm via `pnpm/action-setup@v4` (no explicit `version:` field here; pnpm is still resolved deterministically via the root `packageManager` pin)
- `timeout-minutes: 10`

**Secrets required:**
- `BATCH2_PROD_CLONE_DATABASE_URL` — connection string to a production-clone Postgres. The report is read-only.

Non-secret env:
- `PGSSLMODE=require`, `NODE_ENV=production`, `LOG_LEVEL=warn`

**What it actually does (abridged):**
1. Fails early with an explicit error (and pointer to `docs/runbooks/uncoupled-overlap-resolution.md`) if the DB secret is missing.
2. pnpm + Node.js setup.
3. `pnpm install --frozen-lockfile`.
4. Runs `pnpm --filter @workspace/db run --silent report-uncoupled-overlaps -- --json` and captures JSON to `/tmp/batch2-gate/report.json`.
5. Reads `totalUnresolvedRows` from that JSON:
   - `0` → passes ("No unresolved overlapping_chain_uncoupled rows. Batch 2 deploy gate PASS.")
   - `> 0` → fails with a clear message, citing the runbook.
6. Always uploads `report.json` as an artifact (`uncoupled-overlap-report`, 30-day retention).

**How to read a failure:**
- "BATCH2_PROD_CLONE_DATABASE_URL secret is not set" → **missing-secret failure**.
- "Batch 2 deploy blocked: N unresolved overlapping_chain_uncoupled row(s)…" → a **data-gate failure**. This is not a bug in the workflow; it is exactly what the gate exists to do. Resolve the rows per `docs/runbooks/uncoupled-overlap-resolution.md` and re-run the job.
- An error at "Could not read totalUnresolvedRows" → the report script output shape changed or is empty. Treat as a script / product surface issue, not a bootstrap issue.

---

## 5. How to interpret a failing workflow

Use this decision tree when a red check appears on a PR or dispatch run.

### 5a. Bootstrap failure
**Where it shows up:** any of `actions/checkout@v4`, `pnpm/action-setup@v4`, `actions/setup-node@v4`, `pnpm install --frozen-lockfile`, `pnpm run typecheck:libs`, `pnpm --filter @workspace/db run push`/`push-force`/`check-drift` (when caused by install/DB startup rather than drift), or the `pnpm --filter @workspace/... run build` steps.

**Signals:**
- Errors about pnpm version mismatch, missing lockfile, `EACCES`, network timeouts fetching packages, Postgres service container not healthy.
- Failure happens **before** any product logic or schema assertion runs.

**What to do:**
- Re-run the job once; transient network/service-container issues are common.
- If it persists, treat it as an infra/bootstrap issue. Do **not** change product code to chase it.
- The pnpm bootstrap itself was explicitly stabilized in **ARCH-RAILS-01** (root `packageManager` pinned to `pnpm@10.33.0`; `pnpm/action-setup@v4` used deterministically across workflows). If a failure looks like a pnpm-resolution regression, confirm that `packageManager` and workflow pnpm versions are still in sync before blaming the build.

### 5b. Missing-secret failure
**Where it shows up:**
- `E2E Tests` → the explicit "Verify required secrets are present" step, listing `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`.
- `Batch 2 Deploy Gate` → the "Verify production-clone DB secret is present" step citing `BATCH2_PROD_CLONE_DATABASE_URL`.
- `Schema Drift` → should **never** show a missing-secret failure. If it does, something has changed that requires investigation of the workflow, not a product fix.

**Signals:**
- `::error::Required secret XYZ is not set`
- Job fails **before** any build or browser work.

**What to do:**
- Set the missing secret in the repo/org settings. This is not a product bug.
- Do not work around it by hard-coding values — the preflight exists precisely so failures here are clear and fast.

### 5c. Schema drift failure
**Where it shows up:** `Schema Drift` → the final "Run migrations and assert schema parity" step.

**Signals:**
- The job log prints one or more `<table>.<column>` pairs after applying the PR's migrations.
- Install, push-force, and the earlier steps all succeeded.

**What to do:**
- Add a paired SQL migration under `lib/db/src/migrations/` for every `<table>.<column>` listed, then regenerate/push and re-run.
- Or, if the Drizzle schema declaration was the mistake, revert it.
- Do **not** assume a drift failure is a bootstrap failure just because the job is red; the message cleanly distinguishes the two.

### 5d. Product / E2E failure
**Where it shows up:** `E2E Tests` → the "Run Playwright tests" step (after install, build, service startup, and readiness checks have all passed).

**Signals:**
- Playwright prints failing tests, with trace/video/html report available in the `playwright-report` artifact.
- Service logs (`api-server.log`, `trellis-web.log`, `ci-proxy.log`) in the `service-logs` artifact show ordinary runtime output — no early-exit crash.

**What to do:**
- Treat as a product regression. Reproduce locally using `e2e/README.md` instructions.
- Check whether the failing spec touches any hot-wedge surface listed in `docs/architecture/boundaries.md`; if so, respect the hot-file protections before changing anything.

### 5e. Data-gate failure (Batch 2)
**Where it shows up:** `Batch 2 Deploy Gate` → the "Fail deploy when unresolved rows exist" step.

**Signals:**
- `::error::Batch 2 deploy blocked: N unresolved overlapping_chain_uncoupled row(s) …`
- Links to `docs/runbooks/uncoupled-overlap-resolution.md`.

**What to do:**
- This is **not** a CI bug. Follow the runbook, resolve the rows, and re-run the gate.

---

## 6. Ground rules

- **ARCH-RAILS-01** stabilized pnpm/CI bootstrap: the root `packageManager` field is pinned, and workflows use `pnpm/action-setup@v4` with the same version. Any new CI work should preserve this invariant.
- Do not add new workflows, edit existing workflows, or restructure jobs as part of this doc. Workflow edits are out of scope for ARCH-REORG-05.
- Do not add new secrets casually. If a new secret is ever introduced, it must be accompanied by an explicit preflight step that fails early and names exactly which variable is missing (the pattern already used by `E2E Tests` and `Batch 2 Deploy Gate`).
- Workflow files themselves remain the source of truth. If this doc ever disagrees with a workflow, trust the workflow.

---

## 7. What this doc is not

- Not a CI/CD strategy document.
- Not a proposal to add, remove, or change workflows.
- Not a runbook for specific failures (see `docs/runbooks/*` for those).
- Not a replacement for reading the workflow YAMLs directly when triaging a red build.

Its only job is to give a first-audit engineer enough structure to tell, at a glance, whether a red check is a bootstrap issue, a missing secret, a schema-drift signal, a product/e2e regression, or a legitimate data gate.
