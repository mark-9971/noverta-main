# Revenue-critical test suite

Focused regression tests for the workflows that produce billed minutes and
compensatory-education dollar exposure. **Not** a whole-app test suite — see
`tests/permission-matrix.mjs` for broad RBAC coverage.

## What is covered

| File | Covers |
|------|--------|
| `01-session-logging.mjs` | `POST /sessions` happy path, validation (missing studentId, negative duration), readback fidelity, cross-tenant write rejection, cleanup via `DELETE /sessions/:id` |
| `02-minute-aggregation.mjs` | `GET /minute-progress` aggregation: completed sessions add to `deliveredMinutes`, missed sessions don't, baseline restoration after delete |
| `03-compliance-gap.mjs` | Invariants on returned `requiredMinutes` / `deliveredMinutes` / `percentComplete` / `remainingMinutes` / `riskStatus` (the inputs to comp-ed exposure) |
| `04-compensatory-finance.mjs` | `GET /compensatory-finance/overview` headline totals, cents-rounding on dollar fields, breakdown sums ≤ headline, per-row $/min plausibility, cross-tenant isolation |
| `05-access-control.mjs` | Auth/role/tenant gates on `/sessions`, `/minute-progress`, `/compensatory-finance/*` (unauth → 401, sped_student blocked, only admin/coordinator on comp finance, no cross-district session leakage) |

## How to run

The dev API server already runs with `NODE_ENV=test`, which enables the
`x-test-user-id` / `x-test-role` / `x-test-district-id` auth bypass used by
these tests (same pattern as `tests/permission-matrix.mjs`).

Run a single suite:

```bash
node tests/revenue/01-session-logging.mjs
```

Run the whole revenue suite:

```bash
node tests/revenue/run-all.mjs
```

Override fixtures:

```bash
TEST_DISTRICT_ID=2 TEST_FOREIGN_DISTRICT_ID=99 API_BASE=http://localhost:8080/api \
  node tests/revenue/run-all.mjs
```

## What is NOT covered

Out of scope for this suite (intentionally — keeping it focused):

- Bulk session import (`POST /sessions/bulk`)
- Session edit/patch flows (`PATCH /sessions/:id`) and their effect on aggregation
- Goal data, behavior data, program data side-tables written from a session
- IEP / progress-monitoring routes
- Notification / email side effects
- The `/compensatory-finance/burndown`, `/export.csv` endpoints
- `/compensatory-finance/rates` CRUD and the rate-resolution logic itself: we
  verify dollar totals are internally consistent and within a sane $/min band,
  but we don't independently exercise district-specific or service-type-specific
  rate overrides. A bug that returns the wrong rate could pass these tests.
- The `compensatory_obligations` table generation pipeline (`generateCompensatoryObligations`):
  we verify the dollar exposure rendered by `/compensatory-finance/overview` but
  not the upstream calculation that decides shortfalls at interval boundaries.
- Schedule-block conflict detection
- UI-level flows (covered separately by Playwright when run)
- Direct unit tests of `complianceEngine.ts` math (we test it via the API
  surface; pure-function unit tests would need Vitest added to the workspace)

## Side-finding while building this suite

While building these tests we discovered and fixed one revenue-path regression,
and uncovered four more of the same shape that are **out of scope** to fix here:

- **Fixed:** `artifacts/api-server/src/routes/support.ts` registered
  `router.use(requirePlatformAdmin)` without a path. Because `supportRouter` is
  itself mounted at root in `routes/index.ts`, that middleware ran for every
  request that traversed it — silently 403-ing every router mounted afterward
  (cost-avoidance, compensatory-finance, parent-communication, supervision,
  para, audit-log, billing, …). Changed to `router.use("/support", requirePlatformAdmin)`.
- **Found, not fixed (revenue-impact, suite leaves the test failing as a regression
  marker):** Deleting a completed session via `DELETE /api/sessions/:id` does
  NOT subtract its minutes from `/api/minute-progress` for non-compensatory
  sessions. We confirmed: baseline 281 → after inserting 3×10-min completed
  sessions = 311 (+30 ✓) → after deleting one = 311 (expected 301). The handler
  in `artifacts/api-server/src/routes/sessions/crud.ts` only adjusts
  `compensatoryObligationsTable.minutesDelivered` when the deleted session was
  itself compensatory; for regular sessions it only sets `deletedAt`. This
  means erroneous or duplicate sessions that admins delete continue to inflate
  reported delivered minutes and downstream billed totals. Fix should either
  (a) make the aggregation query in `/minute-progress` filter `deletedAt IS NULL`
  consistently, or (b) decrement a denormalized counter on delete the same way
  the compensatory branch already does. Out of scope to fix in the testing task.
- **Found, not fixed (same shape as the support fix, blocks valid users from later routes):**
  - `artifacts/api-server/src/routes/caseloadBalancing.ts` — path-less
    `router.use(requireRoles("admin", "coordinator"))`. Confirmed via curl:
    `GET /api/compensatory-obligations` returns 403 for `provider`, which the
    `compensatory.ts` router never intended to block.
  - `artifacts/api-server/src/routes/communicationEvents.ts` — same pattern.
  - `artifacts/api-server/src/routes/reports/index.ts` — path-less
    `router.use(requireDistrictScope)`.
  - `artifacts/api-server/src/routes/protectiveMeasures/index.ts` — same.
  - `artifacts/api-server/src/routes/reportExports/index.ts` — same.
  Each should either path-scope its mount (`router.use("/foo", mw)`) or be
  mounted in `routes/index.ts` with a path prefix (`router.use("/foo", subRouter)`).
