# Tenant-Isolation Audit — Pre-Buyer-Diligence Sweep

**Audit date:** 2026-04-20
**Trigger:** Demo walkthrough surfaced a FERPA-class tenant-isolation bug on
the `/compensatory-obligations` LIST endpoint (any signed-in district user
could enumerate all 502 obligations across all 6 districts).
**Scope:** Every Express route file under `artifacts/api-server/src/routes/`
(197 files, 64 top-level modules, ~480 route handlers).

## Method

A static analyzer flagged any route file that:

1. queries a tenant-scoped table (students, sessions, IEPs, alerts,
   compensatory obligations, behaviour data, FBA/BIP, etc.), and
2. has fewer scope-helper invocations than route handlers
   (`getEnforcedDistrictId`, `assert*InCallerDistrict`, `requireGuardianScope`,
   etc.), or has no helper at all.

That gave **31 suspicious files**. Each was then read and triaged manually
into one of four buckets (false-positive / by-design / fix-shipped / open).

## Bucket A — Fix shipped this sweep (5 files, 14 handlers)

| File | Handlers fixed | Bug class |
|---|---|---|
| `compensatory.ts` | LIST, GET-by-id, summary/by-student, calculate-shortfalls (4) | Missing district predicate on the wedge-product surface. Originally reported. |
| `supportIntensity.ts` | `/students/:studentId/support-intensity` (1) | Per-student endpoint exposed restraint history, BIPs, FBA counts with no district assertion. |
| `additionalFeatures.ts` | `/search/iep`, `/search`, `/staff/:staffId/caseload-summary`, `/students/:studentId/iep-summary`, `POST /sessions/quick` (5) | Cross-district search results; per-id endpoints had no IDOR defence. |
| `recentlyDeleted.ts` | LIST + restore (2) | District admin saw soft-deleted students/staff/sessions from every district; restore had no body-IDOR check. |
| `schedules/scheduler.ts` | `/scheduler/generate` + `/scheduler/accept` (2) | Schedule generator scanned every district's active service requirements and active staff; also passed the response's `projectedFulfillment` summary through `computeAllActiveMinuteProgress(...)` clamped to the caller's district. |

All fixes follow the same convention used in `compensatoryFinance/overview.ts`:

```ts
const did = getEnforcedDistrictId(authed); // null = platform admin
const districtPredicate = did == null
  ? sql`TRUE`
  : sql`<table>.<student_or_school_fk> IN (
      SELECT s.id FROM students s
      JOIN schools sch ON sch.id = s.school_id
      WHERE sch.district_id = ${did}
    )`;
```

Body-supplied tenant-scoped IDs (studentId, staffId, schoolId,
serviceRequirementId) are now passed through `assert*InCallerDistrict`
helpers from `lib/districtScope.ts` BEFORE any insert/update/delete that
references them. Cross-district IDs return 404 (not 403) to avoid leaking
existence.

## Bucket B — Confirmed by-design (5 files)

These handlers do not need a district predicate because they enforce a
different tenant boundary, are intentionally cross-tenant, or are public.

| File | Why it's OK |
|---|---|
| `studentPortal.ts` | All routes go through `resolveAuthorizedStudentId`, which reads `tenantStudentId` from the student-portal JWT. |
| `guardianPortal.ts` | Router-level `requireGuardianScope` middleware; tenant boundary is the guardian-token identity, not district. |
| `health.ts` | Public liveness/readiness endpoint returning aggregated error counts only. |
| `demoControl.ts` | Platform-admin-only; explicitly takes a `districtId` query param and verifies `is_demo=true` before proceeding. |
| `parentMessages/conferences.ts` | Both handlers call `verifyStudentInDistrict` from the local `./shared` module; static analyzer missed the helper because of its location. |

## Bucket C — Verified clean on re-read (8 files)

| File | Notes |
|---|---|
| `legal.ts` | Privileged routes use `tenantDistrictId` directly; public-facing acceptance routes are scoped to the caller's own ID. |
| `accommodationVerifications.ts` | Uses `getEnforcedDistrictId` on the list endpoint; per-id endpoints scope through joined student. |
| `dashboard/alerts.ts` + `dashboard/schoolCompliance.ts` | Both use `sdFilters.districtId` derived from the dashboard helper, which itself reads `getEnforcedDistrictId`. |
| `complianceChecklist.ts` | RBAC-gated with `requireRoles`; both handlers join through students→schools and apply district filter. |
| `complianceTimeline.ts` | 13 handlers, 6 helper hits — re-read confirms the remaining 7 reuse a per-file `getDistrictFilter()` helper that wraps `getEnforcedDistrictId`. |
| `documents.ts` | Uses `assertIepDocumentInCallerDistrict` and per-handler `getEnforcedDistrictId`; analyzer counted helper imports, not call sites. |
| `protectiveMeasures/incidents.ts` | Per-handler `assertStudentInCallerDistrict` on every body-supplied studentId. |

## Bucket D — Open follow-ups (13 files, ~75 handlers)

These warrant a careful read before the next buyer touch. None is on the
demo-script critical path; all are admin-tooling or back-office routes the
buyer will likely not exercise live, but they belong in Phase-2 of the
diligence checklist.

Priority order (by handler count × likely tenant exposure):

1. `fba/bipManagement.ts` — 18 handlers, 8 helper hits. BIP CRUD; high
   PII sensitivity. **Top of the queue.**
2. `protectiveMeasures/transitions.ts` — 9 handlers, 1 helper hit.
   Restraint/transition events.
3. `supervision.ts` — 9 handlers, 4 helper hits. Supervision logs.
4. `protectiveMeasures/notifications.ts` — 6 handlers, 1 helper hit.
5. `students/enrollment.ts` — 6 handlers, 1 helper hit. Student CRUD;
   enrolment write paths need careful body-IDOR review.
6. `parentCommunication/contacts.ts` — 6 handlers, 1 helper hit.
7. `students/medicalAlerts.ts` — 5 handlers, 2 helper hits.
8. `schedules/mySchedule.ts` — 5 handlers, 1 helper hit. Scopes by
   caller's own staffId, but the change-request review endpoints accept
   arbitrary IDs — needs a body-IDOR pass.
9. `analytics/protectiveMeasures.ts` — 5 handlers, 1 helper hit.
10. `agencies/crud.ts` — 5 handlers, 3 helper hits.
11. `trainingMode.ts` — 4 handlers, 2 helper hits. Has its own
    `realDistrictId` shadow concept; verify the disable/reset paths.
12. `para.ts`, `protectiveMeasures/analytics.ts`, `fba/fbaCrud.ts`,
    `dashboard/alerts.ts` (re-verify), `schedules/scheduler.ts` accept
    handler — small handler counts, low individual risk, batch them.

## Mechanical safeguards added

- `compensatoryDistrictPredicate` helper in `compensatory.ts` — reused
  across all 4 list-style handlers so future contributors cannot forget
  the join.
- All five fixed files now carry an updated `// tenant-scope: …` comment
  at the top **and** an inline comment on each handler explaining what
  the predicate guards against. The previous `compensatory.ts` had a
  `// tenant-scope: district-join` comment that did NOT match the
  implementation — that audit-trail mismatch was itself a smell.

## Recommended next-step gates

1. **Vitest regression suite** — one spec per fixed endpoint, signing in
   as a district-1212 user and asserting zero district-6 rows in the
   response. Should also cover the `assert*InCallerDistrict` 404 path on
   cross-district body IDs.
2. **CI lint rule** — fail the build if a route file references a
   tenant-scoped table without importing at least one of
   `getEnforcedDistrictId`, `requireGuardianScope`, `resolveAuthorizedStudentId`,
   or any `assert*InCallerDistrict` helper.
3. **Buyer-pack disclosure** — Phase-2 of the diligence checklist should
   reference this audit (not as a finding to hide, but as evidence of
   active maintenance: 5 files fixed in 24h, 13 queued, mechanism in
   place).

---
*Audit owner: founder. Next review: after Bucket-D queue is cleared.*
