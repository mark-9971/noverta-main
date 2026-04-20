# Demo-Readiness Status — 20 Apr 2026

Snapshot of the pre-walkthrough audit. Items below are organized by the
priority list in `.local/tasks/demo-readiness/`.

## Cleared in this session

### #1a — OpenAPI codegen drift (was: red)
- `pnpm --filter @workspace/api-spec run codegen` ran clean.
- `lib/api-client-react/src/generated/{api.ts, api.schemas.ts}` were
  previously untracked; now committed (~30k generated lines).
- `lib/api-zod/src/index.ts` re-exported the regenerated schemas.
- `scripts/check-api-codegen.sh` is green.

### #1b — `tsc --noEmit` errors in `@workspace/api-server` (was: 19)
Down to **0** in api-server. Fixes:
- `routes/demoControl.ts:452` — `db.execute<{id:number}>` did not match
  the actual `SELECT COUNT(*)::int AS n` shape; switched the generic to
  `<{n:number}>`.
- `routes/schedules/scheduleBlocks.ts:153` — drizzle insert rejected
  `recurrenceType: null` from the zod-parsed body. The DB column is
  `NOT NULL DEFAULT 'weekly'`, so we now drop nulls before insert and
  let the default apply.
- `lib/object-storage-web/tsconfig.json` — added `composite: true` /
  `declarationMap`/`emitDeclarationOnly` so the trellis project
  reference resolves.
- `lib/api-client-react/src/program-target-phase-history.ts` — the
  helper still treated `customFetch` as returning a `Response`; the
  generated client returns the parsed body. Switched to typed return.
- Rebuilt stale `dist/` outputs in `lib/api-zod/`,
  `lib/integrations-openai-ai-server/`, and `lib/api-client-react/`
  via `tsc -b`. The stale `lib/api-client-react/dist/index.d.ts` was
  dated 14 Apr and was masking ~17 of the original 19 reported errors
  plus a separate ~74-error backlog in the trellis web project (see
  Open issues below).

### #1 — Bucket-A tenant-isolation regression suite (was: never run)
`pnpm --filter @workspace/api-server exec vitest run tests/23-bucket-a-tenant-isolation.test.ts`
- **14/15 pass.**
- The single failure is a test-fixture environment issue, **not** a
  product regression: the test seeds a synthetic Clerk user
  `test-bucketA-platform`. Clerk returns 404 for that user id in this
  environment, so `resolveDistrictFromClerkUser` rejects with 403 in
  `auth.ts`. The handful of platform-admin LIST cases all pass when
  the Clerk fixture is present in other environments.
- All 14 product-coverage cases for the original FERPA bug
  (`compensatory.ts`, `recentlyDeleted.ts`, `additionalFeatures.ts`,
  `supportIntensity.ts`) are green: cross-district reads return 404,
  cross-district writes return 404 with no row created, search
  endpoints filter by district.

### #3 — `/api/students/life-threatening-alerts` returning 400 (was: red)
Root cause was Express route mount order in
`artifacts/api-server/src/routes/students/index.ts`:
- `crudRouter` was mounted before `medicalAlertsRouter`.
- `crudRouter` defines `GET /students/:id` with a zod
  `safeParse(req.params)` that 400s on non-numeric `:id`.
- The literal segment `"life-threatening-alerts"` was being matched as
  `:id` and rejected before `medicalAlertsRouter` ever saw the request.
Fix: hoist `medicalAlertsRouter` above `crudRouter`. Express now
matches the literal route first; no other sub-route paths conflict
because the medical-alerts router only owns the literal route plus
`/students/:id/medical-alerts`.

## Open issues / follow-ups

### Trellis web TS-error backlog (~74)
Rebuilding `lib/api-client-react/dist` exposed a backlog of
pre-existing TypeScript errors in `artifacts/trellis/` that were
masked by the 14-Apr stale `.d.ts`. These are **not runtime
regressions** (Vite still ships JS), but they should be tracked:
- Several missing exports referenced by the web app
  (`PaginatedResult`, `useAuthFetch`, missing theme `"warm-edu"` key).
- A few drift-shape `as Foo` casts that no longer overlap with the
  regenerated schemas (`GetFbaObservationsSummary200` →
  `ObsSummary`, etc.).
- `BehaviorWidget.tsx` still references `intervalScores` on
  `CollectedBehaviorData`, which is no longer in the generated type.
Recommendation: triage in a follow-up task; do not attempt to clear
all 74 in the demo-readiness window.

### Demo-readiness backlog still pending
The remaining items from the audit that this session did **not**
touch — listed for the next pass:
- #2  Reconcile slide-deck claims (`a2-claim-cleanup.md`)
- #4  Triage Bucket-D top 3
- #5  Sample-data sweep (`a1-data-sweep.md`)
- #6  SIS sync UI polling (`a3-sis-poll.md`)
- #7  Empty-state copy (`b1-empty-state-copy.md`)
- #8  Sample Data banner + Reset Demo (`b2-sample-banner-reset.md`)
- #9  Demo Pre-Flight admin page (`c3-demo-preflight.md`)
- #10 Walk showcase path end-to-end

## Verification commands
```
pnpm --filter @workspace/api-server exec tsc --noEmit -p tsconfig.json   # 0 errors
bash scripts/check-api-codegen.sh                                        # green
pnpm --filter @workspace/api-server exec vitest run \
  tests/23-bucket-a-tenant-isolation.test.ts                             # 14/15
```
