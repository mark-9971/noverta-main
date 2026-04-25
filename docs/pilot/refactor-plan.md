# Noverta — Staged Refactor Plan

> Prefer incremental refactors over big rewrites. Extract, don't rewrite.

---

## Priority 1: Student Detail (2,688 lines)

**Why risky:** Central to the entire app. Every user touches this page. Mixes tab navigation, data fetching, forms, modals, and sub-components in one file.

**How to split:**
1. Extract each tab into its own component file under `components/student-detail/`
2. Extract data-fetching into custom hooks (`useStudentServices`, `useStudentIep`, etc.)
3. Keep `student-detail.tsx` as a thin shell: tab router + layout

**Extract first:** The IEP summary tab and services tab (most complex sub-sections).

**Don't touch yet:** The overall tab navigation pattern — it works, just needs the content extracted.

---

## Priority 2: Student IEP Page (2,955 lines)

**Why risky:** Largest file in the codebase. Complex IEP goal/objective rendering, service mandate tables, accommodation lists. Mixing read-only display with inline editing.

**How to split:**
1. Extract `IepGoalSection`, `IepServiceTable`, `IepAccommodationList` components
2. Extract IEP data transformation logic into `lib/iep-utils.ts`
3. Extract edit modals into `components/iep/` directory

**Extract first:** Goal/objective rendering (most self-contained).

**Don't touch yet:** The IEP data fetching shape — refactoring the API response structure requires backend coordination.

---

## Priority 3: Protective Measures (2,605 lines)

**Why risky:** Complex form with many conditional fields (restraint type, duration, staff involved, medical follow-up). Table + detail + form all in one file.

**How to split:**
1. Extract `ProtectiveMeasureForm` (creation/edit form)
2. Extract `ProtectiveMeasureDetail` (read-only incident view)
3. Extract `ProtectiveMeasureTable` (list/filter view)
4. Keep page as layout orchestrator

**Extract first:** The form component — it's the most complex piece.

**Don't touch yet:** The validation logic — it's tied to MA 603 CMR regulatory requirements and needs domain expert review before changes.

---

## Priority 4: Report Exports API (1,942 lines)

**Why risky:** Largest backend route file. Generates multiple export formats (PDF, CSV, Excel) with complex data aggregation per report type.

**How to split:**
1. Extract per-format generators: `lib/exports/pdf.ts`, `lib/exports/csv.ts`, `lib/exports/excel.ts`
2. Extract report-specific data queries into `lib/reports/` directory
3. Keep route file as thin controller: validate params → query data → format → respond

**Extract first:** CSV export logic (simplest format, good test of the pattern).

**Don't touch yet:** PDF generation — it likely has layout/styling dependencies that are fragile.

---

## Priority 5: Behavior Assessment (1,973 lines) and Program Data (1,944 lines)

**Why risky:** Clinical data UI with complex state management (ABA trial data, FBA observations, BIP components). Both pages mix data tables, charts, and forms.

**How to split:**
1. Extract data table components
2. Extract chart/graph components (ABA graphing is already partially extracted)
3. Extract form modals for data entry

**Extract first:** Data table components — they're reused across both pages.

**Don't touch yet:** The ABA graphing component (`aba-graph.tsx` at 580 lines) — it works and is well-isolated.

---

## General Refactor Patterns

### Hooks to Extract
- `useDashboardData()` — consolidate 6+ dashboard API calls
- `useStudentDetail(id)` — student + IEP + services + sessions
- `useComplianceStatus(studentId)` — compliance calculations
- `usePagination()` — shared pagination state/logic

### Shared Components to Create
- `DataTable` — standardized sortable/filterable table
- `FormModal` — consistent modal with form validation
- `StatusBadge` — compliance/risk status indicators
- `LoadingSkeleton` — page-level loading states

### API Patterns to Standardize
- Consistent pagination response shape: `{ data: T[], total: number, page: number, pageSize: number }`
- Consistent error response shape: `{ error: string, details?: string }`
- Extract common query builders for student filters

---

*Last updated: 2026-04-16*
*Approach: Incremental extraction. One component at a time. Test after each extraction.*
