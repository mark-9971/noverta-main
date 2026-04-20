# Active Service Requirements — `getActiveRequirements` contract

Status: shipped (Batch 1, Service Requirement v1).
Module: `artifacts/api-server/src/lib/domain-service-delivery/activeRequirements.ts`.

## Why this exists

Until now, "what was the student's active service requirement on date
X (or across date range Y)?" was answered inline in at least five
places (`routes/services.ts`, `lib/minuteCalc.ts`,
`lib/complianceEngine.ts`, `routes/iepSuggestions.ts`,
`routes/dashboard/complianceMetrics.ts`). All but one of those returns
only the currently-active row and silently lose mid-period transitions
when a requirement is superseded mid-month.

This helper is the single periodized read for that question. It is the
foundation the future compliance engine, Today, and the supersede chain
UI will all consume.

## Public API

```ts
getActiveRequirementOnDate(
  studentId: number,
  serviceTypeId: number,
  date: string,           // "YYYY-MM-DD"
): Promise<ServiceRequirement | null>

getActiveRequirements(
  studentId: number,
  range: { startDate: string; endDate: string },
  opts?: { serviceTypeId?: number },
): Promise<RequirementInterval[]>

interface RequirementInterval {
  requirementId: number;
  serviceTypeId: number;
  startDate: string;       // clipped to the queried range
  endDate: string;         // clipped to the queried range
  source: 'active' | 'superseded';
}
```

`source` is `'active'` iff the row is the live tail of its lineage
(`active = true` AND no other row supersedes it). Every other interval
— a row that was superseded, or an end-dated row with no successor —
is `'superseded'`.

## Periodization rules

- **Chain walk.** When row B has `supersedes_id = A.id` AND
  `replaced_at IS NOT NULL`, A is treated as ending the day before B
  starts. The interval for A is `[A.startDate, B.startDate - 1d]`,
  further clipped by `A.endDate` if that is earlier.
- **No successor.** A row's effective end is its own `endDate`, or
  open-ended (the helper uses the query range's `endDate` as the cap
  for the returned interval). End-dated rows with no successor return
  one interval; the gap after the end is NOT back-filled.
- **Same-day supersede.** If `A.endDate = N` and `B.startDate = N`,
  the helper returns A clipped to `N - 1` and B starting at `N`. No
  overlap, no gap.
- **Transition day.** `getActiveRequirementOnDate(..., N)` where the
  supersede happened at day `N` returns B (the new requirement), not A.
- **Multiple service types.** Different `serviceTypeId` values are
  independent lineages and are returned as separate intervals.
- **Determinism.** Output is sorted by `startDate` ascending, ties
  broken by `requirementId` ascending.

## Legacy / dirty-data rules

- `replaced_at IS NULL` AND `active = false` → hard end, NOT a
  supersede. The row contributes one interval ending at its `endDate`
  with `source: 'superseded'`.
- `supersedes_id` populated but the linked row is missing → the row is
  treated as a chain root (no predecessor); it does not crash.
- Rows in the same `(student_id, service_type_id)` group that overlap
  in time but are not coupled through `supersedes_id` are returned
  as-is (both intervals). The helper also writes one row per
  participating requirement into
  `migration_report_service_requirements` with reason
  `overlapping_chain_uncoupled` so /data-health can surface the
  conflict for admin review. Insert is idempotent (existence check
  before insert).

## Constraints

- Pure DB read except for the idempotent `overlapping_chain_uncoupled`
  flag insert. No audit log writes, no other side effects.
- No reliance on `school_id` or any cross-student / cross-district
  scope. Callers apply scoping.
- One query per `getActiveRequirements` call (no n+1 over the chain).

## Migration plan for legacy call sites

The helper ships in Batch 1. No call sites are migrated in Batch 1 —
each existing duplicate site has been marked with a
`// DEPRECATED(batch-1):` comment block pointing at this helper. The
batch-by-batch migration plan below is the source of truth for which
site moves when.

| # | Call site | Current behavior | Target batch |
|---|-----------|------------------|--------------|
| 1 | `artifacts/api-server/src/routes/services.ts:107-156` (`GET /service-requirements` list) | Returns raw rows filtered by `active`; no chain walk. | Batch 2 — adopt helper for the `?asOfDate=` and `?range=` query modes; preserve raw-list mode for backward compat until the UI is updated. |
| 2 | `artifacts/api-server/src/lib/minuteCalc.ts` (`computeMinuteProgress`, `computeAllActiveMinuteProgress`) | Filters to `active=true` only; misses mid-period transitions. | Batch 2 — replace `active=true` filter with `getActiveRequirements(student, intervalRange)` per requirement so superseded mid-period rows still contribute their pre-transition minutes. |
| 3 | `artifacts/api-server/src/lib/complianceEngine.ts` (`runComplianceChecks`) | Reads `computeAllActiveMinuteProgress` output; inherits its `active=true` blind spot. | Batch 2 — flows automatically once minuteCalc is migrated. Verify alert dedup still holds. |
| 4 | `artifacts/api-server/src/routes/iepSuggestions.ts` (per-student suggestion route) | Reads all rows for student to derive serviceTypeNames; no compliance use, but it does not honor end-dated supersedes. | Batch 3 — switch to `getActiveRequirements(student, todayRange)` for the "currently in force" service-type list. |
| 5 | `artifacts/api-server/src/routes/dashboard/complianceMetrics.ts` (`/dashboard/compliance-by-service`, `/dashboard/staff-coverage`) | Reads `active=true` rows directly for staff-coverage; uses `computeAllActiveMinuteProgress` for the rest. | Batch 2 (with minuteCalc) for the compliance-by-service path; Batch 3 for staff-coverage. |

## Out of scope (this task)

- Migrating any of the call sites above.
- Cross-student / cross-district queries.
- A caching layer (the function is a pure DB read; if we need caching
  it goes in a wrapper later).
- Walking schedule blocks or sessions; this helper is purely about
  requirements.
