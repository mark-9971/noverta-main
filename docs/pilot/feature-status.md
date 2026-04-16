# Trellis — Pilot Feature Status

> **Decision rule:** "If a district pilot would not fail, stall, or become materially less valuable without this feature in the next 60 days, archive it for now."

## Executive Summary

Trellis is a **SPED operations, service delivery, and compliance risk platform** — not a full SIS replacement. The strongest pilot wedge is:

> *"Trellis helps SPED teams deliver required services, document what happened, and spot compliance risk before it becomes an audit or parent problem."*

The product story centers on: students → IEP snapshots → session logging → schedule → compliance monitoring → alerts → reporting → parent communication. Everything else is either demo/sales value or future expansion.

---

## Status Definitions

| Status | Meaning |
|---|---|
| **CORE** | Active build priority. Essential to pilot success in the next 60 days. |
| **DEMO** | Valuable for sales and demos. Keep visible but do not invest active engineering unless a pilot requires it. |
| **REFACTOR** | Functionally important but code quality / file size creates risk. Needs incremental cleanup. |
| **ARCHIVE** | Not essential to proving the pilot wedge. Removed from active navigation. Still in git, still URL-accessible, easy to re-enable. |

---

## Module Classification

### CORE — Build Now

| Module | Route | Rationale |
|---|---|---|
| Dashboard | `/` | Command center; compliance risk + session delivery at a glance |
| Alerts | `/alerts` | Proactive compliance + safety notifications |
| Student List | `/students` | Primary entity; everything flows from students |
| Student Detail / Snapshot | `/students/:id` | Central student view with IEP snapshot, services, notes |
| Student IEP View | `/students/:id/iep` | IEP goal tracking and service mandate reference |
| Sessions / Service Logging | `/sessions` | Core compliance proof — documenting service delivery |
| Schedule | `/schedule` | Provider daily/weekly planning |
| Staff Directory | `/staff` | Who delivers what; caseload reference |
| Staff Detail | `/staff/:id` | Provider caseload and session history |
| Caseload View | `/my-caseload` | Provider-focused student list |
| Reports | `/reports` | Compliance and service delivery reporting |
| Document Workflow | `/document-workflow` | IEP document signing and routing |
| Parent Communication | `/parent-communication` | Required parent contact documentation |
| Settings / Setup | `/settings` | District configuration, school year, SIS basics |
| Para My Day | `/my-day` | Paraprofessional daily workflow |
| Team Notes | (within student detail) | Collaboration threads for student teams |

### DEMO — Sell Harder

| Module | Route | Rationale |
|---|---|---|
| Compliance Dashboard | `/compliance` | Strong demo value showing compliance posture |
| Progress Reports | `/progress-reports` | Quarterly IEP progress — impressive in demos |
| IEP Builder | `/students/:id/iep-builder` | Differentiated feature; demo wow factor |
| IEP Meetings | `/iep-meetings` | Meeting prep checklists, agenda generation |
| Protective Measures | `/protective-measures` | Restraint & seclusion tracking — regulatory must-have |
| Executive Dashboard | `/executive` | C-suite / director-level demo audience |
| District Overview | `/district` | High-level district health view |
| Program Data | `/program-data` | ABA / behavior programs — BCBA audience |
| FBA / BIP | `/behavior-assessment` | Functional behavior assessment — clinical demo |
| Analytics | `/analytics` | Data visualization layer |
| Guardian Portal | `/guardian-portal/*` | Parent-facing portal — strong sales story |
| Student Portal | `/sped-portal/*` | Student self-service — future differentiator |

### REFACTOR — Technical Debt

| Module | File | Lines | Rationale |
|---|---|---|---|
| Student IEP Page | `student-iep.tsx` | 2,955 | Largest page; mixes UI/data/validation |
| Student Detail | `student-detail.tsx` | 2,688 | Complex; many sub-tabs in one file |
| Protective Measures | `protective-measures.tsx` | 2,605 | Large page mixing forms/tables/modals |
| Behavior Assessment | `behavior-assessment.tsx` | 1,973 | Complex clinical UI |
| Program Data | `program-data.tsx` | 1,944 | Heavy data table + forms |
| Reports | `reports.tsx` | 1,849 | Report generation UI |
| Report Exports (API) | `reportExports.ts` | 1,942 | Largest backend route file |
| Protective Measures (API) | `protectiveMeasures.ts` | 1,913 | Complex validation logic |
| IEP (API) | `iep.ts` | 1,681 | IEP CRUD with complex joins |
| Students (API) | `students.ts` | 1,602 | Student CRUD + search + filters |

### ARCHIVE — Removed from Navigation

| Module | Route | Rationale |
|---|---|---|
| Agencies | `/agencies` | Agency management — not core to initial SPED team pilot |
| Agency Detail | `/agencies/:id` | Detail view for agencies |
| Billing | `/billing` | Revenue/invoicing — not pilot priority |
| Contract Utilization | `/contract-utilization` | Agency contract tracking — future expansion |
| Resource Management | `/resource-management` | Staffing optimization — enterprise feature |
| Coverage | `/coverage` | Substitute coverage — operational nice-to-have |
| Caseload Balancing | `/caseload-balancing` | Workload redistribution — future |
| Supervision | `/supervision` | BCBA supervision logging — niche |
| Staff Calendar | `/staff-calendar` | Provider calendar — overlaps with Schedule |
| IEP Search | `/search` | Cross-student IEP search — not essential to pilot |
| IEP Suggestions | `/iep-suggestions` | AI goal suggestions — not mature enough |
| IEP Calendar | `/iep-calendar` | IEP due date calendar — nice-to-have |
| Evaluations | `/evaluations` | Eval tracking — future phase |
| Transitions | `/transitions` | Transition planning — age 14+ only |
| Compensatory Services | `/compensatory-services` | Makeup services — future compliance |
| State Reporting | `/state-reporting` | DESE/state submissions — not pilot-blocking |
| Tenants | `/tenants` | Multi-tenant admin — platform admin only |
| Data Import | `/import` | Bulk import — setup phase only |

---

## Navigation Changes

Features removed from active sidebar (still URL-accessible):
1. Agencies + Agency Detail
2. Billing
3. Contract Utilization
4. Resource Management
5. Coverage
6. Caseload Balancing
7. Supervision
8. Staff Calendar
9. IEP Search
10. IEP Suggestions
11. IEP Calendar
12. Evaluations
13. Transitions
14. Compensatory Services
15. State Reporting
16. Data Import

---

## Proposed Navigation Structure (Admin / Case Manager)

1. **Overview** — Dashboard, Alerts
2. **Students** — Student List
3. **Service Delivery** — Sessions, Schedule, IEP Meetings
4. **Compliance** — Compliance Dashboard, Progress Reports, Document Workflow
5. **Clinical** — Programs & Behaviors, FBA / BIP, Restraint & Seclusion
6. **District** — District Overview, Executive Dashboard
7. **People** — Staff Directory
8. **Communication** — Parent Comms
9. **Admin** — Reports, Analytics, Settings

---

## Recommended Next 10 Engineering Tasks

1. Archive nav items (this task — in progress)
2. Split `student-detail.tsx` into tab sub-components
3. Split `student-iep.tsx` into section components
4. Extract shared form/modal patterns from protective-measures
5. Add error boundaries around each major page section
6. Consolidate API response shapes (standardize pagination)
7. Add integration tests for session logging flow
8. Extract dashboard data hooks into `hooks/useDashboard.ts`
9. Split `reportExports.ts` into per-format handlers
10. Add loading skeletons to all data-heavy pages

## Recommended Next 10 Product/Founder Tasks

1. Run pilot demo with 3 target districts using focused nav
2. Record 5-minute Loom walkthrough of core workflow
3. Write one-pager: "Trellis vs. spreadsheet compliance tracking"
4. Get letter of intent from one pilot district
5. Define "pilot success" metrics (sessions logged, compliance %)
6. Create onboarding checklist for pilot district setup
7. Prioritize parent communication polish (high demo value)
8. Draft pricing for pilot tier vs. full platform
9. Identify 2-3 features to enable per pilot district config
10. Build case study template for first pilot results

---

*Last updated: 2026-04-16*
*Archive approach: Soft archive — removed from navigation only. Routes and pages remain functional and accessible via direct URL.*
