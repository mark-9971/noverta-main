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
- `iep_documents` — MA DESE IEP form data: student/parent concerns, team vision, PLAAFP (academic/behavioral/communication/additional), transition planning (14+), ESY eligibility, assessment participation, schedule modifications, transportation; supports amendment workflow with iepType (initial/renewal/reeval/amendment), version tracking, amendmentOf reference, amendmentReason
- `iep_accommodations` — IEP accommodations by category (instruction/assessment/testing/environmental/behavioral), description, setting, frequency, provider
- `compliance_events` — IDEA compliance deadline tracking: studentId, eventType (annual_review/reeval_3yr/initial_eval/transition_age), dueDate, completedDate, status (upcoming/overdue/completed), notes
- `goal_bank` — Pre-written IEP goal library: 44 goals across 7 domains (Communication, Academic, Behavioral, Motor, Social-Emotional, ABA, Transition), searchable by domain/text
- `team_meetings` — IEP team meeting management: studentId, meetingType (annual/initial/amendment/reeval), scheduledDate/Time, location, status, notes, attendees (JSONB), consentStatus, noticeSentDate
- `parent_contacts` — Parent contact log entries per student: contactType, contactDate, contactMethod, subject, notes, outcome, followUpNeeded, followUpDate, contactedBy, parentName
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
- `/compliance-timeline` — GET all compliance events with computed status (overdue/due_soon/upcoming/completed)
- `/compliance-events/recalculate` — POST auto-generate compliance events from IEP document dates
- `/compliance-events/:id` — PATCH update compliance event (mark completed, add notes)
- `/goal-bank` — GET searchable/filterable pre-written IEP goal library (?search=&domain=)
- `/students/:id/iep-documents/:docId/completeness` — GET IEP completeness check (% complete, missing sections)
- `/students/:id/iep-documents/:docId/amend` — POST create IEP amendment draft (copy-and-modify workflow)
- `/students/:id/team-meetings` — GET/POST team meeting CRUD
- `/team-meetings/:id` — PATCH/DELETE team meeting
- `/dashboard/compliance-deadlines` — GET upcoming IEP deadlines for dashboard widget
- `/students/:id/parent-contacts` — GET/POST parent contact log entries
- `/parent-contacts/:id` — PATCH/DELETE parent contact (field allowlist enforced)
- `/search/iep?q=&type=` — GET global search across IEP goals, accommodations, students
- `/staff/:id/caseload-summary` — GET staff caseload summary with IEP status
- `/students/:id/iep-summary` — GET comprehensive IEP summary for a student
- `/sessions/quick` — POST quick session log creation

### Frontend Pages
- `/` — Dashboard with KPI cards, compliance ring gauge, session delivery bar chart, compliance by service progress bars, recent alerts
- `/students` — Student list with risk filter pills, search, progress rings per student, clickable cards linking to detail
- `/students/:id` — Student detail with per-service bar chart, service breakdown with mini progress rings, behavior data section (targets with sparkline trend charts, progress bars, direction indicators), academic programs section (mastery tracking with criterion indicators, trend sparklines), recent data sessions table, recent service sessions table
- `/sessions` — Session log with pagination, status filter pills, search, Log Session modal (create)
- `/schedule` — Weekly grid/list toggle view of recurring schedule blocks, staff filter dropdown
- `/staff` — Staff directory with tabs (Clinicians, Paraeducators, Case Managers), utilization progress rings
- `/alerts` — Compliance alerts with severity filter pills, resolve actions, refresh/show-resolved toggles
- `/compliance` — Overall compliance ring gauge, stacked bar chart by service type, filterable requirements table with inline progress bars, link to IEP Compliance Timeline
- `/compliance/timeline` — IDEA compliance deadline tracker: summary cards (overdue/due this week/30 days), filterable event list, recalculate deadlines from IEP docs, mark events completed
- `/reports` — Tabs for Minute Summary, Missed Sessions, At-Risk Students with mini progress rings and status badges
- `/students/:id/iep` — MA 603 CMR 28.00 compliant IEP page with 6 tabs:
  - **IEP Document**: Create/edit MA DESE form with all required sections, IEP completeness indicator (% complete with missing fields), IEP type/version display, amendment workflow (copy-and-modify), amendment history
  - **Goals**: Annual IEP goals with benchmarks/short-term objectives, auto-create from data targets, linked program/behavior targets, Goal Bank button (search 44 pre-written goals by domain)
  - **Accommodations**: Manage accommodations by category (instructional, assessment, testing, environmental, behavioral)
  - **Meetings**: Team meeting management (schedule, track attendance, consent status, meeting types: annual/initial/amendment/reeval)
  - **Progress Reports**: Generate/view with MA standard progress codes (M/SP/IP/NP/NA/R), goal-by-goal narrative
  - **Parent Log**: Parent contact log with contact type, method, date, subject, notes, outcome, follow-up tracking
- `/staff/:id` — Staff caseload dashboard with assigned students, IEP expiry status cards, service delivery progress
- `/search` — Global IEP search across goals, accommodations, and students by keyword
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
- 37 behavior targets across all students (elopement, aggression, non-compliance, SIB, vocal stereotypy, tantrums, task refusal, on-task behavior, manding, etc.)
- 37 program targets across all students (receptive ID, tacting, hand washing, intraverbal, matching, PECS, social greetings, sight words, etc.)
- 279 data collection sessions with behavior and program data spanning 6 weeks
- 44 goal bank entries across 7 domains (Communication, Academic, Behavioral, Motor, Social-Emotional, ABA, Transition)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
