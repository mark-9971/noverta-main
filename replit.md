# Trellis — School Management & SPED Service Delivery Platform

## Overview

Trellis is a comprehensive school management platform that combines general education (classes, assignments, gradebook) with special education (IEP/ABA) compliance. It features role-based views for administrators, teachers, and students — all using the same platform, with special ed services layered on top for IEP students. Fully compliant with Massachusetts 603 CMR 28.00/46.00.

**Brand Identity:** Name "Trellis", tagline "Built to support.", Sprout icon (Lucide). **Theme: "Ink & Air"** — pure white/near-white backgrounds, near-black ink-weight typography, neutral gray tones (gray-* not slate-*), emerald green accents (primary: HSL 160 84% 39%). Clean, airy, editorial feel with generous whitespace and subtle shadows.

## User Preferences

I want iterative development and detailed explanations of your thought process. Ask clarifying questions before making major architectural changes or implementing complex features. Do not change the fundamental project structure or core technologies without explicit approval.

## System Architecture

Trellis is built as a monorepo using `pnpm` workspaces, with a distinct separation between frontend and backend.

**Technology Stack:**
- **Frontend:** React 19, Vite, Tailwind CSS, shadcn/ui, Recharts, wouter.
- **Backend (API):** Express 5, Node.js 24.
- **Database:** PostgreSQL with Drizzle ORM.
- **Data Validation:** Zod.
- **API Generation:** Orval generates React Query hooks and Zod schemas from an OpenAPI 3.1 specification.

**Core Architectural Decisions:**

- **Modular Monorepo:** Organizes code into `artifacts/minuteops` (frontend), `artifacts/api-server` (backend), `lib/api-spec` (OpenAPI spec), and shared libraries for API clients, Zod schemas, and the database layer.
- **RESTful API Design:** Backend interactions are exposed via a REST API.
- **Role-Based Architecture:** Five user roles with distinct navigation, theming, and routing — `admin` (emerald, `/`), `sped_teacher` (purple, `/`), `gen_ed_teacher` (emerald, `/teacher`), `sped_student` (violet, `/sped-portal`), `gen_ed_student` (blue, `/portal`). Role switching via vertical list in sidebar. SPED Teacher reuses admin routes. Each role has a demo picker; SPED/gen ed student IDs are stored in separate localStorage keys.
- **Comprehensive Database Schema:** PostgreSQL database supports detailed tracking of districts, schools, students, staff, services, IEPs, compliance, ABA data, classes, assignments, submissions, grades, announcements, and protective measures (restraint/seclusion incidents with multi-signature workflow). Districts table (`districts`) with schools linked via `schools.districtId` FK.
- **Protective Measures:** `restraint_incidents` table with 60+ fields tracking MA DESE 603 CMR 46.00 compliance (antecedent category, body position, procedures used, de-escalation strategies, BIP status, debrief, injuries, DESE reporting). `incident_signatures` table tracks per-staff signature requests with `pending → signed` workflow. Auto-creates signature requests for all involved staff + admins on incident creation. Supports Safety Care, CPI, CALM, and PMT terminology for procedures. DESE CSV export includes all fields. **Parent Notification workflow**: auto-generates parent notification letter draft after admin review; restraint report PDF generated via PDFKit; SPED teacher/case manager/BCBA/coordinator/admin can authorize and send; notification tracking fields on incident (draft, sentAt, sentBy, method). Student schema includes `parentGuardianName`, `parentEmail`, `parentPhone`.
- **UI/UX Design:** "Ink & Air" theme — pure white backgrounds, neutral gray color palette (Tailwind `gray-*` not `slate-*`), near-black text, emerald accents. Role-based color theming (emerald=admin, purple=sped_teacher, emerald=gen_ed_teacher, violet=sped_student, blue=gen_ed_student). Features include `ProgressRing` components, role-aware `AppLayout`, and responsive design. CSS vars: background HSL 0 0% 98.5%, foreground HSL 0 0% 9%, primary HSL 160 84% 39%, subtle real shadows.

**Database Schema (Gen Ed):**
- `classes` — courses with teacher, period, room, subject, grade level
- `class_enrollments` — student-class enrollment with status
- `grade_categories` — weighted grading categories per class (Homework, Quizzes, Tests, Projects, Participation)
- `assignments` — assignments with type, points, due date, category
- `submissions` — student submissions with grade, feedback, status
- `announcements` — class or school-wide announcements
- `teacher_observations` — teacher behavior observations (studentId, staffId, date, description, severity)
- `progress_note_contributions` — teacher progress report contributions (reportId, staffId, goalId, narrative)

**Role-Based Views:**
- **Admin:** Full access to compliance, special ed, gen ed, analytics. Sidebar organized by workflow priority: top-level (Dashboard, Students, Alerts), Service Delivery (Sessions, Schedule, Service Minutes), Clinical & IEP (Programs & Behaviors, IEP Suggestions, Restraint & Seclusion, IEP Search), Academics (Classes, Gradebook), Reports & Admin (District Overview, Analytics, Reports, Staff Directory, Data Import). Routes: `/`, `/students`, `/sessions`, `/classes`, `/gradebook`, `/district`, `/analytics`, etc.
- **Teacher:** Class management, gradebook, assignments, student roster, grading interface, IEP classroom view. Routes: `/teacher`, `/teacher/classes`, `/teacher/gradebook`, `/teacher/assignments`, `/teacher/classroom`, etc.
- **Student:** Dashboard with GPA/assignments, class list, assignment submission, grade transcript. Routes: `/portal`, `/portal/classes`, `/portal/assignments`, `/portal/grades`

**API Endpoints (Gen Ed):**
- `GET/POST /classes` — class CRUD
- `GET /classes/:id/roster` — class student list
- `POST /classes/:id/enroll` — enroll student
- `GET /classes/:id/assignments` — list assignments
- `POST /classes/:id/assignments` — create assignment (auto-creates submissions)
- `GET /assignments/:id/submissions` — list all submissions for grading
- `PUT /submissions/:id/grade` — grade a submission
- `GET /students/:id/grades-summary` — transcript with per-class grades and GPA
- `GET /classes/:id/gradebook` — full gradebook matrix (students × assignments)
- `GET /teacher/:id/dashboard` — teacher overview with pending grading
- `GET /student/:id/dashboard` — student overview with upcoming/recent

**Seed Data:**
- 8 teachers across Math, ELA, Science, Social Studies, Art, PE, Music, Computer Science
- 16 classes with grade-level enrollment
- 52 students enrolled in 4 core + 1-3 elective classes
- ~600 assignments per semester with realistic grading patterns
- ~2,800 submissions with grade distributions (A-F range, 5% missing rate)

**Feature Specifications:**

- **Dashboard (Admin):** Overview of KPIs, compliance, and alerts.
- **Student Portal:** Blackboard-style experience — upcoming assignments, recent grades, GPA, class detail with assignments/grades/announcements tabs, assignment submission, grade transcript.
- **Teacher Portal:** Class management, spreadsheet-style gradebook, assignment creation, grade entry with feedback, pending submissions queue, student roster with IEP indicators.
- **Admin Academics:** School-wide class overview, gradebook viewer across all classes.
- **Student Management:** CRUD operations for student profiles, service progress, behavior, and academic program tracking.
- **Service & Schedule Management:** Tracking service requirements, session logging (including bulk imports), and recurring schedule blocks with conflict detection.
- **IEP Workflow:** MA 603 CMR 28.00 compliant IEP pages, including document creation/editing, goal management (with goal bank), accommodations, meeting management, progress reports, and parent contact logs.
- **Compliance Tracking:** IDEA compliance event tracking, automated deadline generation, and alerts system.
- **IEP Program Suggestions:** Auto-generated suggestions for behaviors to track, DTTs, task analyses, academic programs, and related service programs based on each student's IEP goals and service requirements. Overview page shows all 50 SPED students with suggestion counts; detail view shows categorized suggestions with relevance scoring, reasons, and one-click apply (idempotent, no duplicate creation).
- **ABA Program Management:** Detailed behavior reduction and skill acquisition program management, program builder, template system.
- **Protective Measures (603 CMR 46.00/46.06):** Full MA DESE-compliant restraint/seclusion/time-out incident tracking.
- **Analytics & Insights:** 5-tab analytics page with overview, behavior, academic, minutes, and student deep dive.
- **Reporting:** Minute summaries, missed session reports, at-risk student reports with CSV export.
- **Toast Notifications:** `sonner`-based system for user feedback.
- **Import Functionality:** Bulk CSV imports for students, service requirements, and session logs.
- **Global Search:** Search across IEP goals, accommodations, and students.

## Key Files

- `artifacts/minuteops/src/App.tsx` — Main router with role-based routing (AdminRouter, TeacherRouter, StudentRouter)
- `artifacts/minuteops/src/lib/role-context.tsx` — Role state management (admin/teacher/student) with localStorage persistence
- `artifacts/minuteops/src/components/layout/AppLayout.tsx` — Role-aware sidebar with navigation sections, Trellis branding
- `artifacts/minuteops/src/components/layout/RoleSwitcher.tsx` — Role toggle buttons (Admin=emerald, SPED Teacher=purple, etc.)
- `artifacts/minuteops/src/index.css` — CSS variables for warm cream/deep green theme (light + dark mode)
- `artifacts/minuteops/src/pages/student-portal/` — All student portal pages
- `artifacts/minuteops/src/pages/teacher-portal/` — All teacher portal pages
- `artifacts/api-server/src/routes/iepSuggestions.ts` — IEP suggestion engine (behaviors, DTTs, TAs, academic, related services)
- `artifacts/minuteops/src/pages/iep-suggestions.tsx` — IEP suggestions frontend (overview + detail with apply)
- `artifacts/minuteops/src/pages/teacher-portal/TeacherClassroom.tsx` — Teacher IEP classroom view (accommodations, schedules, observations)
- `artifacts/api-server/src/routes/districts.ts` — Districts CRUD + district overview rollup API
- `artifacts/minuteops/src/pages/district-overview.tsx` — District Overview page with school comparison
- `lib/db/src/schema/districts.ts` — Districts table schema
- `artifacts/api-server/src/routes/classroom.ts` — Classroom API (staff classroom, teacher observations, progress notes)
- `artifacts/api-server/src/routes/classes.ts` — Classes, enrollment, categories, announcements endpoints
- `artifacts/api-server/src/routes/assignments.ts` — Assignments, submissions, grades, gradebook, dashboards
- `lib/db/src/schema/classes.ts` — Classes table
- `lib/db/src/schema/assignments.ts` — Assignments table
- `lib/db/src/schema/submissions.ts` — Submissions table
- `lib/db/src/seed-realistic-data.ts` — Realistic seed data generator (both SPED + gen ed)

## External Dependencies

- **Node.js**: Runtime environment.
- **PostgreSQL**: Primary database.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: CSS framework.
- **shadcn/ui**: UI component library.
- **Recharts**: Charting library.
- **wouter**: Frontend router.
- **Express**: Backend web framework.
- **Drizzle ORM**: TypeScript ORM.
- **Zod**: Schema validation.
- **Orval**: OpenAPI client generator.
- **esbuild**: JavaScript bundler.
- **Lucide React**: Icon library.

## Development Notes

- **DB Push:** `pnpm --filter @workspace/db run push`
- **API Server:** Port 8080; frontend port 22248
- **Seed Data:** `npx tsx /tmp/run-seed.ts` (with absolute import paths)
- **Express 5 / path-to-regexp v8:** Cannot use `/api/*` — use bare catchall
- **Sonner Toast:** `import { toast } from "sonner"`. Toaster in AppLayout
- **API URL Pattern:** `const API = (import.meta as any).env.VITE_API_URL || "/api"`
- **Staff Roles:** admin, bcba, slp, ot, pt, counselor, case_manager, para, teacher
- **Student Tiers (SPED):** minimal, moderate, intensive, high_needs
