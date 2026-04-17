# Pilot-Readiness Audit

An internal pre-demo / pre-pilot check that verifies the app is safe to put in
front of a district. It is a **script**, not an admin screen — designed to be
run by an engineer before a demo or before kicking off a pilot.

## How to run

From the workspace root:

```bash
pnpm --filter @workspace/scripts run pilot-audit
```

That runs `scripts/src/pilot-readiness.ts` against the local API server and the
local database. The dev API server must already be running on port 8080
(workflow: `artifacts/api-server: API Server`).

To audit a different environment or district:

```bash
API_BASE=https://staging.example.com \
PILOT_DISTRICT_ID=7 \
pnpm --filter @workspace/scripts run pilot-audit
```

| Env var               | Default                     | Meaning                                        |
| --------------------- | --------------------------- | ---------------------------------------------- |
| `API_BASE`            | `http://localhost:8080`     | API server to probe                            |
| `PILOT_DISTRICT_ID`   | `4` (MetroWest in dev)      | District the audit treats as the pilot tenant  |
| `STRICT`              | unset                       | If `1`, exit non-zero on warnings too          |

**Exit code** = number of FAIL checks (0 if pilot-ready). With `STRICT=1`, exits
1 if any warnings exist.

## What it checks

The audit groups checks into eight categories. Each check resolves to one of
`PASS`, `WARN`, `FAIL`, or `SKIP`.

### env — required + recommended environment variables
- **Required (FAIL if missing):** `DATABASE_URL`, `SESSION_SECRET`,
  `DEFAULT_OBJECT_STORAGE_BUCKET_ID`, `PRIVATE_OBJECT_DIR`,
  `PUBLIC_OBJECT_SEARCH_PATHS`.
- **Recommended (WARN if missing):** `CLERK_SECRET_KEY`,
  `CLERK_PUBLISHABLE_KEY`, `RESEND_API_KEY`, `SENTRY_DSN`, `REPLIT_DOMAINS`.

### auth — auth posture
- `NODE_ENV` is `production` (WARN otherwise — pilots should not run in dev mode).
- Unauthed `GET /api/students` returns 401/403.
- The `x-test-*` impersonation bypass is **only** honored when
  `NODE_ENV === "test"`. If the bypass headers grant access in dev or prod
  the audit FAILs — that would let anyone impersonate any role.

### health — API health endpoint
- `GET /api/health` returns `status: ok` and `db: connected`.

### compliance — core compliance queries functioning
- The pilot district has at least one student (joined through `schools.district_id`).
- The pilot district has at least one service requirement.
- `GET /api/minute-progress` returns rows for the pilot district. (Skipped
  unless running with `NODE_ENV=test`, since live calls require auth.)

### imports — import flow reachable
- `GET /api/imports/templates/students` either serves the template (when test
  bypass is available) or returns 401/403 (proving the route is mounted).
- `GET /api/imports` (history list) reachable.
- 404 on either route is reported as FAIL — the route is not registered.

### notifications — notification wiring status
- `RESEND_API_KEY` present (WARN if missing — guardian emails will be queued
  to `communication_events` but never delivered).
- `communication_events` table exists.

### exports — report export status
- `/api/reports/exports/history` and `/api/reports/exports/scheduled` return
  401/403 (proving the routes are mounted and auth-gated). 404 → FAIL.

### setup — critical setup / config
- Pilot district has at least one staff record with `role = 'admin'` (joined
  through `schools.district_id`).
- Pilot district has district-specific `service_rate_configs` rows (WARN if
  missing — compensatory finance falls back to system defaults).
- The `districts` row for `PILOT_DISTRICT_ID` exists and has a name.
- At least one currently-active service requirement (`active = true`,
  `end_date >= today`).

### no-fake-data — no fake/mock content visible to the user
- Scans a curated list of user-facing pages (`pages/dashboard.tsx`,
  `pages/reports.tsx`, `pages/admin-dashboard.tsx`, etc.) for
  `Math.random`, `mockData`, `fakeData`, `stubData`, `TODO:.*demo`, `FIXME`.
  Hits are reported as WARN with the file path so they can be triaged.

## What it does NOT check

- It does **not** execute a real import — only probes that the import endpoints
  are mounted and reachable. A bad CSV could still break in production.
- It does **not** send a real notification — only confirms the provider key
  and queue table are present.
- It does **not** generate an actual export PDF/CSV — only confirms the routes
  are mounted and auth-gated.
- Its "no fake data" scan only covers a curated list of top-level pages. Mock
  content nested deeper in components or in routes not on the list will not
  be flagged.
- It does not currently check tier-feature configuration, billing/Stripe
  product configuration, or SIS connection health.

## Sample output

```
================================================================
Pilot-Readiness Audit  —  district 4  —  http://localhost:8080
NODE_ENV=test
================================================================

[env]
  PASS   DATABASE_URL                            set
  ...
  WARN   RESEND_API_KEY                          missing — guardian emails will not be delivered
  WARN   SENTRY_DSN                              missing — production errors will not be aggregated

[auth]
  WARN   NODE_ENV                                test — pilot/demo should run with NODE_ENV=production
  PASS   unauth /api/students rejected           HTTP 401
  PASS   x-test bypass active in test mode       HTTP 200

[compliance]
  PASS   pilot district has students             42 students
  PASS   pilot district has service requirements 107 requirements
  PASS   /api/minute-progress live read          returned 107 rows

...

----------------------------------------------------------------
SUMMARY: 23 pass, 5 warn, 0 fail, 0 skip
Verdict: PILOT-OK with caveats — review WARN items before a paid pilot.
================================================================
```

Verdict line is one of:
- **READY for pilot demo** — 0 fail, 0 warn.
- **PILOT-OK with caveats** — 0 fail, some warn.
- **NOT READY** — at least one fail.
