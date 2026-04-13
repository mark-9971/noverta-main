# MinuteOps — SPED Service Delivery Operations Platform

## Overview

MinuteOps is a production-quality school special education and ABA service delivery operations platform. It serves BCBAs, special education coordinators, paraeducators, providers, and case managers with IEP service requirement tracking, scheduling, delivered-minute tracking, compliance/risk dashboards, alerts, and reports.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React 19 + Vite + Tailwind CSS + shadcn/ui + Recharts + wouter (routing)
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec → React Query hooks + Zod schemas)
- **Build**: esbuild (CJS bundle for API server)

## Architecture

### Packages
- `artifacts/minuteops` — React frontend (Vite, port from PORT env var)
- `artifacts/api-server` — Express REST API (port 8080)
- `lib/api-spec` — OpenAPI 3.1 spec (`openapi.yaml`)
- `lib/api-client-react` — Generated React Query hooks (Orval codegen)
- `lib/api-zod` — Generated Zod validation schemas (Orval codegen)
- `lib/db` — Drizzle ORM schema + migrations

### Database Schema
- `students` — Student records with IEP dates, grade, disability category
- `staff` — Providers/paras/case managers with roles and credentials
- `service_types` — ABA, SLP, OT, PT, Counseling, Para Support, BCBA Consultation
- `service_requirements` — IEP-mandated service minutes per student (weekly/monthly)
- `session_logs` — Delivered session records with status (completed/missed/makeup)
- `schedule_blocks` — Recurring weekly schedule blocks
- `staff_assignments` — Staff-to-student assignments
- `missed_reasons` — Lookup table for missed session reasons
- `alerts` — Compliance alerts with severity levels

### API Routes
All routes prefixed with `/api/`:
- `/dashboard/*` — Summary, risk overview, provider/para summaries, alerts summary, compliance by service
- `/students` — CRUD + search/filter
- `/students/:id` — Individual student detail
- `/students/:id/minute-progress` — Per-student service delivery progress
- `/students/:id/sessions` — Per-student session history
- `/staff` — CRUD + search/filter
- `/services` — Service types + service requirements CRUD
- `/sessions` — Session logs CRUD + bulk create + missed reasons
- `/schedule-blocks` — Recurring schedule CRUD + conflicts/coverage-gaps
- `/staff-assignments` — Staff-student assignment management
- `/alerts` — List/resolve compliance alerts
- `/minute-progress` — Computed minute delivery progress per student/service
- `/reports/*` — Student minute summary, missed sessions, compliance risk reports
- `/imports/*` — Bulk CSV import endpoints

### Frontend Pages
- `/` — Dashboard with KPI cards, compliance ring gauge, session delivery bar chart, compliance by service progress bars, recent alerts
- `/students` — Student list with risk filter pills, search, progress rings per student, clickable cards linking to detail
- `/students/:id` — Student detail with per-service bar chart, service breakdown with mini progress rings, recent sessions table
- `/sessions` — Session log with pagination, status filter pills, search, Log Session modal (create)
- `/schedule` — Weekly grid/list toggle view of recurring schedule blocks, staff filter dropdown
- `/staff` — Staff directory with tabs (Clinicians, Paraeducators, Case Managers), utilization progress rings
- `/alerts` — Compliance alerts with severity filter pills, resolve actions, refresh/show-resolved toggles
- `/compliance` — Overall compliance ring gauge, stacked bar chart by service type, filterable requirements table with inline progress bars
- `/reports` — Tabs for Minute Summary, Missed Sessions, At-Risk Students with mini progress rings and status badges

### UI Components
- `ProgressRing` — Circular SVG progress indicator (configurable size, stroke, color, label)
- `MiniProgressRing` — Compact circular progress indicator for inline use
- `AppLayout` — Sidebar navigation with indigo accent, alert badge count, user profile

### Design System
- Background: `slate-50/80`
- Cards: white with subtle border
- Primary: indigo-600
- Status colors: emerald (on track), amber (slightly behind), orange (at risk), red (out of compliance), indigo (completed)
- Typography: Inter font, 13px body, 11px labels, 2xl headings
- Filter pills: rounded-full with `aria-pressed` for accessibility
- Icons: Lucide React

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/api-client-react exec tsc -p tsconfig.json` — rebuild API client type declarations
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Demo Data

Database is seeded with realistic demo data:
- 50 students across grades 1-12
- 18 staff (3 BCBAs, 2 SLPs, 2 OTs, 1 PT, 2 counselors, 6 paras, 2 case managers)
- 186 IEP service requirements
- 2855 session logs
- 330 recurring schedule blocks
- 106 compliance alerts (68 critical, 38 high)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
