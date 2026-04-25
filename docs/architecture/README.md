# Noverta Architecture Docs Index

This is an index only, not a refactor plan.

Use this page to find the current engineer-readiness and architecture rails docs in the right order.

## Read this first

- `docs/ENGINEER-ONBOARDING.md` — first-read entry point for a newly hired engineer

## Architecture rules source

- `docs/architecture/boundaries.md` — current architecture rails and boundary rules

## Trust order

When documents disagree, use this order:

1. current source-of-truth project docs and current code
2. `docs/ENGINEER-ONBOARDING.md`
3. `docs/architecture/boundaries.md`
4. specific runbooks / focused docs for the area you are changing
5. older audit / analysis docs only as historical context

Notes:
- `replit.md` is still relevant as a current project operating-model document and hot-file warning list.
- Historical audit/analysis markdown files at the repo root may be useful background, but should not override current code, onboarding, or boundaries docs.

## Contracts / codegen docs and locations

- `lib/api-spec` — OpenAPI source of truth
- `lib/api-zod` — generated Zod/contracts
- `lib/api-client-react` — generated React client

Useful reading:
- `lib/api-zod/README.md`

## E2E and scripts docs / locations

- `e2e` — Playwright/e2e area
- `e2e/README.md`
- `scripts` — operational/audit script area
- `scripts/README.md`

## Hot-file warning

Do not touch product/wedge hot files casually.

High-risk surfaces include:
- Action Center
- recommendation / handling / dismissal logic
- Compliance Risk Report
- dashboard core widgets
- Quick Log behavior
- `minuteCalc.ts`
- `schoolCalendar.ts`
- scheduling orchestration
- `nav-config.ts`
- seed/reset orchestration
- demo reset/seeding files

Use `docs/ENGINEER-ONBOARDING.md` and `docs/architecture/boundaries.md` for the current detailed hot-file guidance before proposing changes.
