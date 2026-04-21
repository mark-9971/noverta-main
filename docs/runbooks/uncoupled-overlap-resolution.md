# Resolving uncoupled requirement overlaps

Status: ops runbook. Owned by the data platform team.

## What this is about

`getActiveRequirements`
(`artifacts/api-server/src/lib/domain-service-delivery/activeRequirements.ts`)
detects pairs of `service_requirements` rows that:

- belong to the same `(student_id, service_type_id)`,
- overlap in time (inclusive overlap on `start_date`/`end_date`), and
- are **not** linked through `supersedes_id` in either direction.

When that happens it writes one row per participating requirement into
`migration_report_service_requirements` with
`reason = 'overlapping_chain_uncoupled'`. The row is idempotent (one per
requirement id, never updated by the helper).

These are legacy data bugs. Two un-coupled active rows for the same
service quietly inflate required minutes (each row contributes its
target to compliance math) and confuse the supersede-chain UI.

## How to find current overlaps

Run the per-district report:

```
pnpm --filter @workspace/db exec tsx ./src/scripts/report-uncoupled-overlaps.ts
# or, machine-readable:
pnpm --filter @workspace/db exec tsx ./src/scripts/report-uncoupled-overlaps.ts --json
```

District admins also see their own subset on the **Data Health**
page (`/data-health`) under the "Service Requirements needing review"
card, filtered to the `overlapping_chain_uncoupled` reason. Every item
has an "Open in editor" link to the service requirement edit dialog
and a "Mark resolved" button.

## How to resolve each row

Pick exactly one of the three actions below. Apply it through the
admin UI (preferred — the existing service requirement edit dialog
emits the right audit log) and **then** click "Mark resolved" on the
Data Health card so the migration report row is closed.

### 1. Link the newer row as a supersede of the older

Use this when the two rows really were a "the IEP changed mid-year"
sequence and someone forgot to set `supersedes_id`.

- Open the newer row in the edit dialog.
- Set its `supersedes_id` to the older row's id.
- Set `replaced_at` on the newer row to the date the change took effect
  (typically the newer row's `start_date`).

After this, `getActiveRequirements` will treat the older row as ending
the day before the newer row begins; no more overlap.

### 2. End-date the older row

Use this when there is no real "supersede" relationship (e.g. the
older row was an extra requirement that should have ended when the
program changed) but the older row should not just be deleted because
sessions were already logged against it.

- Set `end_date` on the older row to the day before the newer row
  starts.
- Set `active = false` on the older row.

Leave `supersedes_id` NULL on both rows. The two rows are then
disjoint in time and the overlap goes away on the next read.

### 3. Delete the duplicate row

Use this when one of the two rows is an outright duplicate (same
minutes, same dates, no sessions logged against it). Soft-delete is
preferred; hard-delete only with engineering sign-off.

- Mark the duplicate row inactive and leave a note in the edit dialog
  explaining the duplicate so audit history is preserved.

## Marking the report row resolved

The Data Health page calls
`POST /api/data-health/migration-report/:id/resolve`. The endpoint
sets `resolved_at = now()` and `resolved_by` to the acting staff id.
Resolved rows are excluded from the report script, the Data Health
card count, and the partial index `mrsr_unresolved_idx`.

If the underlying data is fixed but the row was never marked resolved,
running `getActiveRequirements` again will simply find no overlap and
no new report row will be written. The stale row stays on the
unresolved list until an admin clicks "Mark resolved" — that is the
intended audit trail.

## Before Batch 2/3 migrations

The Batch 2 minute-calc migration consumes
`getActiveRequirements` directly, so any uncoupled overlap will
double-count required minutes after the cutover. Resolve every
unresolved `overlapping_chain_uncoupled` row in production before
deploying Batch 2.

The CI check that gates the Batch 2 release is the
**`Batch 2 Deploy Gate / Uncoupled overlap gate`** job, defined in
`.github/workflows/batch-2-deploy-gate.yml`. It runs
`pnpm --filter @workspace/db run report-uncoupled-overlaps -- --json`
against the production-clone database pointed at by the
`BATCH2_PROD_CLONE_DATABASE_URL` repo secret, parses
`totalUnresolvedRows` from the JSON, and fails the deploy when the
count is non-zero. The full report JSON is uploaded as the
`uncoupled-overlap-report` workflow artifact for triage.

Re-run the job (via "Re-run jobs" or `workflow_dispatch`) after
resolving the offending rows to unblock the Batch 2 deploy.
