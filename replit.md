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
- `/` — Operations Dashboard (KPI cards, risk pie chart, missed sessions trend, compliance by service, recent alerts)
- `/students` — Student list with risk badges, minute progress, search/filter
- `/sessions` — Session log table with pagination, status filters, Log Session modal
- `/schedule` — Weekly grid/list view of recurring schedule blocks
- `/staff` — Staff directory with tabs (Clinicians, Paraeducators, Case Managers)
- `/alerts` — Compliance alerts with severity filtering, resolve actions
- `/compliance` — Risk summary, compliance bar chart, filterable requirements table
- `/reports` — Reports with tabs (Minute Summary, Missed Sessions, At-Risk Students)

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
