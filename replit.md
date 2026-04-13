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
- `students` — Student records with IEP dates, grade, disability category, dateOfBirth, primaryLanguage
- `staff` — Providers/paras/case managers with roles and credentials
- `service_types` — ABA, SLP, OT, PT, Counseling, Para Support, BCBA Consultation
- `service_requirements` — IEP-mandated service minutes per student (weekly/monthly), gridType (A/B/C per MA), setting, groupSize
- `iep_documents` — MA DESE IEP form data: student/parent concerns, team vision, PLAAFP (academic/behavioral/communication/additional), transition planning (14+), ESY eligibility, assessment participation, schedule modifications, transportation
- `iep_accommodations` — IEP accommodations by category (instruction/assessment/testing/environmental/behavioral), description, setting, frequency, provider
- `session_logs` — Delivered session records with status (completed/missed/makeup)
- `schedule_blocks` — Recurring weekly schedule blocks
- `staff_assignments` — Staff-to-student assignments
- `missed_reasons` — Lookup table for missed session reasons
- `alerts` — Compliance alerts with severity levels
- `behavior_targets` — ABA behavior reduction targets per student (frequency/interval/percentage/duration measurement, hourly tracking option)
- `program_targets` — Skill acquisition programs per student (discrete trial/task analysis) with prompt hierarchy (JSONB), auto-progression settings, mastery/regression criteria, reinforcement schedule/type, tutor instructions
- `program_steps` — Discrete trial steps within a program target (SD instruction, target response, materials, prompt strategy, error correction), unique index on (program_target_id, step_number)
- `program_templates` — Global/local reusable program templates with steps (JSONB), default mastery/regression settings, prompt hierarchies; 8 global templates seeded
- `data_sessions` — Data collection sessions linking staff, student, date/time
- `behavior_data` — Per-session behavior measurements (value, interval counts, hour block for hourly tracking)
- `program_data` — Per-session program trial data (trials correct/total, prompted, percent correct, prompt level used)

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
- `/students/:id/iep-documents` — GET/POST MA IEP documents
- `/iep-documents/:id` — GET/PATCH/DELETE IEP document
- `/students/:id/accommodations` — GET/POST IEP accommodations
- `/accommodations/:id` — PATCH/DELETE accommodation
- `/reports/*` — Student minute summary, missed sessions, compliance risk reports
- `/imports` — GET import history
- `/imports/templates/:type` — GET downloadable CSV templates (students, service_requirements, sessions, aspen_students, esped_services)
- `/imports/students` — POST bulk student import from CSV
- `/imports/service-requirements` — POST bulk IEP service requirement import from CSV
- `/imports/sessions` — POST bulk session log import from CSV
- `/students/:id/behavior-targets` — GET/POST behavior reduction targets (frequency/interval/percentage/duration, hourly tracking)
- `/behavior-targets/:id` — PATCH update behavior target
- `/students/:id/program-targets` — GET/POST skill acquisition programs with prompt hierarchy, auto-progression, mastery/regression criteria
- `/program-targets/:id` — PATCH update program target (settings, prompt level, etc.)
- `/program-targets/:id/steps` — GET/POST discrete trial steps for a program
- `/program-steps/:id` — PATCH/DELETE individual steps
- `/program-templates` — GET/POST program templates (global library)
- `/program-templates/:id/clone-to-student` — POST clone template as new program target with all steps
- `/students/:id/data-sessions` — GET/POST data collection sessions (with nested behavior + program data, auto-progression check on save)
- `/data-sessions/:id` — GET detailed data session with all behavior and program data
- `/students/:id/behavior-data/trends` — GET time-series behavior data for charting
- `/students/:id/program-data/trends` — GET time-series program data for charting

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
- `/students/:id/iep` — MA 603 CMR 28.00 compliant IEP page with 4 tabs:
  - **IEP Document**: Create/edit MA DESE form with all required sections (Student/Parent Concerns, Team Vision, PLAAFP A-D, Transition 14+, ESY, Assessment Participation, Schedule Modifications)
  - **Goals**: Annual IEP goals with benchmarks/short-term objectives, auto-create from data targets, linked program/behavior targets
  - **Accommodations**: Manage accommodations by category (instructional, assessment, testing, environmental, behavioral)
  - **Progress Reports**: Generate/view with MA standard progress codes (M/SP/IP/NP/NA/R), goal-by-goal narrative
- `/import` — Bulk CSV import page with drag-and-drop upload, data preview, template downloads (MinuteOps standard, Aspen X2, eSPED), import history, support for students/IEP requirements/session logs
- `/program-data` — ABA program data page with 5 tabs:
  - **Data Collection**: Live session timer, frequency counter for behaviors (+/- buttons), one-tap discrete trial recording (Correct/Prompted/Incorrect), prompt level selector (FP/PP/M/G/V/I), undo with trial history, session save
  - **Behavior Targets**: Cards with baseline/current/goal, trend charts, improving/worsening badges, add behavior modal with measurement type/direction/hourly options
  - **Skill Programs**: Cards with last/avg3/mastery %, prompt level badge, auto-progress indicators, detail modal with step editor, mastery/regression/reinforcement settings
  - **Data Sessions**: Manual session logging with behavior + program data entry per target
  - **Template Library**: 8 global templates (DTT + Task Analysis), filter by category, one-click clone to student with all steps

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
- 24 behavior targets across 8 students (elopement, aggression, non-compliance, SIB, vocal stereotypy)
- 22 program targets across 8 students (receptive ID, tacting, hand washing, intraverbal, matching)
- 184 data collection sessions with behavior and program data spanning 6 weeks

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
