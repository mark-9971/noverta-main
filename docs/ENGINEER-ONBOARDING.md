# Noverta Engineer Onboarding

This is the first document a newly hired engineer should read before auditing, changing, or reorganizing this repository.

It is intentionally practical:
- what this repo is
- which apps are primary
- which directories are support, sandbox, or demo areas
- which docs are canonical
- how CI/bootstrap works
- how contracts/codegen work
- which files are high-risk
- what not to touch casually

This document does not replace code or the roadmap. It is an orientation map so an engineer can review the repo without increasing sprawl.

## 1. Purpose

Read this before:
- auditing the repo
- proposing architecture changes
- making cleanup or reorganization plans
- touching cross-cutting files

Use it together with `docs/architecture/boundaries.md` and the current project operating model.

## 2. Current product truth

Noverta/Trellis is strongest today as an operational workflow tool with a compliance reporting backbone.

The real wedge is:

`risk -> likely cause -> owner -> recommended next action -> shared handling state -> recovery -> proof`

The product is not yet honestly:
- a full case-management platform
- a full scheduling / recovery platform
- a broad district operating system
- a mature ABA / clinical platform

Strongest current surfaces:
- Action Center
- Quick Log
- Compliance Risk Report
- Today / role-home surfaces
- Student Detail "Recommended Next Step"
- shared handling state
- school-calendar-aware minute math

## 3. Source-of-truth / trust order

Use this trust order when docs disagree:

1. **Current code**
2. **`replit.md`**
3. **`docs/architecture/boundaries.md`**
4. **current package/workflow docs** such as:
   - `package.json`
   - `.github/workflows/e2e.yml`
   - `.github/workflows/schema-drift.yml`
   - `lib/api-zod/README.md`
   - `e2e/README.md`
   - `scripts/README.md`
5. **historical analysis docs** only as background context

Notes:
- `replit.md` is still relevant because it contains the current product operating model, lane rules, and hot-file list.
- `docs/architecture/boundaries.md` is the current architecture rails document.
- Historical root docs such as `Trellis-Platform-Analysis.md`, `Trellis-Business-Analysis.md`, and ad hoc audit files may be useful context, but should not override current code, `replit.md`, or `boundaries.md`.

## 4. Primary runtime areas

### `artifacts/trellis`
- **What it is:** primary web app
- **What it owns today:** React/Vite shell, route composition, pages, shared UI components, workflow orchestration
- **Be careful about:** route sprawl, page-level orchestration, shell-level truth living in `App.tsx`

### `artifacts/api-server`
- **What it is:** primary API server
- **What it owns today:** Express app, route assembly, middleware composition, route handlers, background scheduler entrypoints
- **Be careful about:** policy/order complexity in `src/routes/index.ts`, cross-cutting middleware interactions

### `lib/db`
- **What it is:** DB/schema/seed area
- **What it owns today:** Drizzle schema, migrations, DB helpers, seed/demo primitives, v2 domain/simulator helpers
- **Be careful about:** seed/reset/demo coupling, schema/seed changes with broad blast radius

### `e2e`
- **What it is:** Playwright/e2e
- **What it owns today:** browser tests, Playwright config, E2E fixtures/harnesses
- **Be careful about:** many specs touch wedge-critical flows, so changing tests can still be product-sensitive

### `lib/api-spec`
- **What it is:** OpenAPI source
- **What it owns today:** API source-of-truth spec and codegen config
- **Be careful about:** all new contract work should start here, not in generated files

### `lib/api-zod`
- **What it is:** generated Zod/contracts
- **What it owns today:** generated validation schemas from OpenAPI
- **Be careful about:** do not hand-edit generated files

### `lib/api-client-react`
- **What it is:** generated React client
- **What it owns today:** generated React Query client and schemas derived from OpenAPI
- **Be careful about:** do not create parallel hand-maintained API contract shapes if the endpoint belongs in codegen

### `scripts`
- **What it is:** operational/audit scripts
- **What it owns today:** helper scripts for checks, audits, load tests, and repo operations
- **Be careful about:** scripts can still encode operational assumptions; do not mistake them for product runtime code

### `docs`
- **What it is:** runbooks and source-of-truth docs
- **What it owns today:** architecture rails, pilot/docs, legal/security docs, runbooks
- **Be careful about:** not every doc has the same authority; use the trust order above

## 5. Non-production / support areas

These should not be mistaken for the primary product apps:

- `artifacts/trellis-demo`
- `artifacts/trellis-deck`
- `artifacts/trellis-pitch`
- `artifacts/dashboard-concepts`
- `artifacts/mockup-sandbox`

These are useful support/demo/design areas, but they are not the main production web app.

Also treat these as support/noise until proven otherwise:
- `attached_assets/`
- root analysis markdown files
- ad hoc audit files and exported artifacts

Do not delete or move these areas casually. Just recognize that they are not the primary runtime path.

## 6. How to run / bootstrap

- The package manager is pinned through the root `package.json` `packageManager` field.
- `pnpm` is the expected package manager.
- Look in:
  - root `package.json` for workspace-level scripts
  - per-package `package.json` files for app/package-specific scripts
  - GitHub workflow files for CI bootstrap expectations

What may require environment variables or secrets:
- local/dev app startup may require runtime env vars depending on the workflow being exercised
- E2E and some auth-dependent flows require secrets/env vars; verify in:
  - `.github/workflows/e2e.yml`
  - `e2e/README.md`
- schema drift uses workflow-defined Postgres env and bootstrap prerequisites; verify in:
  - `.github/workflows/schema-drift.yml`

Known noisy/secret-dependent areas:
- Clerk-backed flows
- E2E workflow secrets
- local preview environments that depend on auth/bootstrap configuration

If unsure about a command or env requirement, verify in `package.json` and the relevant workflow/readme files instead of assuming.

## 7. CI / workflow map

### Schema Drift
- **Purpose:** detect Drizzle schema vs Postgres drift
- **Primary file:** `.github/workflows/schema-drift.yml`
- **What it does:** boots a Postgres service container, installs deps, bootstraps the base schema from the base branch, then checks schema parity
- **Secrets:** no GitHub secrets required; the workflow explicitly uses service-container env and bootstrap prerequisites only
- **Caveat:** this is a CI/bootstrap-sensitive job and is a good signal for schema discipline

### E2E Tests
- **Purpose:** full browser verification of critical flows
- **Primary file:** `.github/workflows/e2e.yml`
- **What it does:** provisions Postgres, builds web + API, starts a proxy-backed local environment, then runs Playwright
- **Secrets:** requires Clerk/E2E secrets; see the workflow file for the exact list
- **Caveat:** this job is intentionally secret-dependent and will fail early if required secrets are missing

ARCH-RAILS-01 stabilized CI bootstrap by pinning the package manager and making pnpm resolution deterministic for these workflows.

## 8. Contracts / codegen path

The generated contract path is:

1. source of truth: `lib/api-spec/openapi.yaml`
2. codegen/config: `lib/api-spec`
3. generated outputs:
   - `lib/api-zod`
   - `lib/api-client-react`

Rules:
- New API work must follow the generated contract path.
- Do not hand-roll parallel frontend/backend contracts for API surfaces that belong in OpenAPI/codegen.
- Do not hand-edit generated files; regenerate them from the spec instead.

Use `lib/api-zod/README.md` as the current contract/codegen usage guide.

## 9. High-risk / do-not-casually-touch files

These are high-risk surfaces and should not be casually refactored:

- Action Center
- `action-recommendations.ts`
- `use-handling-state.ts`
- `use-dismissal-state.ts`
- Compliance Risk Report
- dashboard core widgets
- Quick Log behavior
- `minuteCalc.ts`
- `schoolCalendar.ts`
- scheduling orchestration
- `nav-config.ts`
- seed/reset orchestration
- demo reset/seeding files

Why these are dangerous:
- they encode current wedge truth
- they are high-conflict
- they are tightly tied to closed-loop recovery, shell honesty, or seed/demo operations
- “cleanup” changes here can silently change product behavior

Treat them as main-agent / explicitly-approved surfaces only.

## 10. Architecture boundary summary

From `docs/architecture/boundaries.md`:

- rails first
- keep monorepo
- no rewrite
- no multi-repo split
- no broad file moves yet
- over time, apps assemble and packages own logic
- `App.tsx` is app assembly only
- `routes/index.ts` is API assembly only

This is a future-direction boundary model, not a move-everything-now plan.

## 11. Known noise / caveats

- **Replit/platform artifacts** exist and are still part of the repo reality.
- **Generated code locations** are split across `lib/api-spec`, `lib/api-zod`, and `lib/api-client-react`.
- **CI/test secret dependency** exists for E2E and auth-dependent flows.
- **Historical docs** exist at the repo root and may be stale or snapshot-only.
- **Route/surface sprawl** is real; the route list is broader than the strongest actual product wedge.
- **Demo/seed complexity** is real; demo/sample/reset/readiness logic spans DB, API, and UI support surfaces.
- **Known pre-existing noise:** if you see environment/bootstrap/auth problems locally, verify whether they are real product issues or setup/secret issues first.

## 12. What to audit first

For a newly hired engineer, the first good audit questions are:

- Where is assembly sprawl worst?
- Where are contracts/codegen drifting from intended usage?
- Where are localStorage/sessionStorage patterns unsafe or ungoverned?
- Where are host/platform assumptions leaking into product logic?
- Where can low-risk simplification happen without touching hot files?

Useful audit framing:
- identify confusion before proposing movement
- classify before extracting
- prefer rails and clarity over broad cleanup

## 13. What not to do first

Do not start with:
- multi-repo split
- broad file moves
- Action Center refactor
- minute math refactor
- scheduling orchestration refactor
- seed/reset rewrite
- Student Detail decomposition unless separately approved
- `App.tsx` route rewrite yet
- `routes/index.ts` rewrite yet
- product UI redesign
- cleanup that changes behavior without tests

Start with understanding, classification, and low-risk documentation/rails work instead.
