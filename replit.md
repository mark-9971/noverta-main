# Trellis — SPED Compliance & Behavior Analysis Platform

## Overview

Trellis is a K-12 Special Education (SPED) compliance and behavior analysis platform, primarily targeting Massachusetts 603 CMR 28.00/46.00 regulations. It provides specialized tools for Admins, SPED Teachers, and SPED Students, with a strong focus on BCBA clinical functionalities like FBA, Functional Analysis, and BIP generation. The platform also manages IEPs, tracks protective measures (restraint/seclusion incidents with multi-signature workflows), and offers detailed analytics. While maintaining general education features in the backend, the frontend prioritizes SPED-specific workflows. The project aims to be a leading solution for SPED compliance and clinical management, with potential for broader K-12 integration.

The brand uses an "Ink & Air" theme with pure white/near-white backgrounds, near-black typography, neutral grays, and emerald green accents (primary: HSL 160 84% 39%), creating a clean, airy, and editorial aesthetic.

## User Preferences

I want iterative development and detailed explanations of your thought process. Ask clarifying questions before making major architectural changes or implementing complex features. Do not change the fundamental project structure or core technologies without explicit approval.

## System Architecture

Trellis is structured as a monorepo using `pnpm` workspaces, clearly separating frontend and backend concerns.

**Technology Stack:**
-   **Frontend:** React 19, Vite, Tailwind CSS, shadcn/ui, Recharts, wouter.
-   **Backend (API):** Express 5, Node.js 24.
-   **Database:** PostgreSQL with Drizzle ORM.
-   **Data Validation:** Zod.
-   **API Generation:** Orval (generates React Query hooks and Zod schemas from OpenAPI 3.1).

**Core Architectural Decisions:**

-   **Modular Monorepo:** Code is organized into `artifacts/minuteops` (frontend), `artifacts/api-server` (backend), `lib/api-spec` (OpenAPI spec), and shared libraries.
-   **RESTful API Design:** All backend interactions are exposed via a REST API.
-   **Authentication:** Clerk authentication provides real sign-in/sign-up flows and secures routes using `ProtectedRoutes`. Role-based access is enforced, with 8 distinct roles (`admin`, `case_manager`, `bcba`, `sped_teacher`, `coordinator`, `provider`, `para`, `sped_student`). Backend API authentication uses `@clerk/express` middleware to validate roles and tokens.
-   **Comprehensive Database Schema:** A PostgreSQL database manages districts, schools, students, staff, services, IEPs, compliance, ABA data, and protective measures, including detailed `restraint_incidents` for MA DESE 603 CMR 46.00.
-   **UI/UX Design:** Adheres to the "Ink & Air" theme, utilizing a pure white, neutral gray, and emerald green palette. Features role-based color theming and responsive design with components like `ProgressRing` and a role-aware `AppLayout`.

**Feature Specifications:**

-   **BCBA Clinical Tools:** Integrated FBA (Functional Behavior Assessment), Functional Analysis, and BIP (Behavior Intervention Plan) generation, including ABC data observation and function-specific strategies.
-   **IEP Workflow:** MA 603 CMR 28.00 compliant IEP pages, goal management (with auto-target creation), accommodations, meeting management, DESE-compliant progress reports with PDF generation, and parent notifications.
-   **IEP Program Suggestions:** An engine generates suggestions for behaviors, DTTs, task analyses, academic programs, and related services based on IEP goals, with relevance scoring and one-click application.
-   **Protective Measures (603 CMR 46.00/46.06):** Full MA DESE-compliant tracking for restraint/seclusion/time-out incidents, featuring a 4-step form, compliance checklist, digital signatures, and DESE CSV/JSON export.
-   **Session-IEP Goal Integration:** Sessions can be linked to IEP goals with inline data collection for behavior and program data.
-   **Resource Management:** Caseload balancing, provider utilization, and budget tracking for staff and services.
-   **Compensatory Services:** Tracks owed compensatory minutes, calculates shortfalls, and manages compensation sessions.
-   **Parent Communication:** Manages parent contacts, follow-ups, and compliance notifications. Includes a "Share Progress" feature for secure progress report sharing.
-   **ABA Clinical Graphing & IOA Tracking:** Per-target line graphs with phase change lines (vertical dashed), least-squares trend lines, aim lines (baseline→goal), and PNG/SVG export. Inter-observer agreement (IOA) tracking with paired observations, automatic agreement calculation (point-by-point for frequency/interval, exact for duration), and per-target IOA summaries with 80% threshold indicators.
-   **Para Mobile Data Entry ("My Day"):** Mobile-first daily agenda for paraprofessionals showing schedule blocks, quick-start session timer with auto-populated fields, guided data collection with step-by-step DTT trial recording (correct/incorrect + prompt level), behavior frequency tally counters, and read-only IEP goal summaries. All controls use 44px+ touch targets. API: `GET /para/my-day`, `GET /para/student-targets/:studentId`. Para role has dedicated simplified navigation.
-   **FERPA Audit Logging:** Append-only audit trail tracking all access and modifications to student records. Logs actor identity (Clerk userId + role), action type (create/read/update/delete), target table and record, affected student, IP address, summary text, and old/new value diffs for mutations. Admin-only viewer at `/audit-log` with filters (action, table, date range, search), stats summary, detail dialog, and CSV export. Instrumented routes: students (CRUD + detail read), IEP goals (CRUD), sessions (create), protective measures (create). Backend: `audit_logs` table with indexes on actor, action, target, student, timestamp. Helper: `logAudit()` fires-and-forgets inserts to avoid blocking request latency.
-   **Admin Onboarding Wizard:** SIS-first setup flow at `/setup` accessible from admin sidebar. Four guided steps: (1) SIS Connection — select provider (PowerSchool, Infinite Campus, Skyward, CSV) and enter district/school info; (2) District & Schools — confirm/edit pulled data; (3) Service Types — select from 12 common SPED service types; (4) Staff Invite — add team members by name/email/role. Persistent `SetupChecklist` widget shows on the admin dashboard when setup is incomplete (auto-hides when all steps are done). API: `GET /api/onboarding/status`, `POST /api/onboarding/sis-connect`, `POST /api/onboarding/district-confirm`, `POST /api/onboarding/service-types`, `POST /api/onboarding/invite-staff`. All mutation endpoints admin-only, status endpoint admin/coordinator, with idempotent upsert logic and duplicate prevention.
-   **Soft Delete & Recovery:** Students, staff, session logs, and schedule blocks use soft-delete (`deletedAt` timestamp) instead of permanent removal. All list queries filter out soft-deleted records. Admin "Recently Deleted" page (`/recently-deleted`) shows deleted records across all 4 entity types with one-click restore.
-   **Error Boundaries:** Route-level React Error Boundaries wrap every page component via `BoundedRoute` in `App.tsx`. A crash in one page displays a friendly error message with retry button without affecting the rest of the application.
-   **API Rate Limiting:** Two-tier rate limiting — 200 req/min general limit + 60 req/min mutation limit (POST/PUT/PATCH/DELETE) per IP.
-   **Theme System:** 10 built-in themes controlled via `ThemeProvider` in `lib/theme-context.tsx`. Default: "Open Air" (borderless, minimal — no card borders/shadows, thin divider lines, emerald left-bar active indicator). Other themes: Classic, Warm, Cool, High Contrast, Large Text, Extra Large Text, Deuteranopia-Safe, Protanopia-Safe, Reduced Motion. Theme stored in localStorage (`trellis-theme`). CSS variable overrides in `index.css` under `:root.theme-*` selectors. ThemePicker component in sidebar footer (palette icon). Card component uses `border-card-border` so cards become borderless automatically in Open Air.
-   **Clinical Supervision Tracking:** Tracks BCBA supervision of RBTs and paraprofessionals, including session logging and compliance dashboards.
-   **Evaluation & Eligibility Tracking (IDEA/603 CMR 28.04):** Full evaluation lifecycle management — referral intake (source, concerns, consent tracking), evaluation assignments (areas, lead evaluator, due dates), and eligibility determinations (disability categories, re-evaluation cycles). Dashboard with compliance metrics: open referrals, pending consent, overdue evaluations, upcoming re-evaluations. 30-school-day deadline calculation (≈45 calendar days). Role-restricted to admin, coordinator, case_manager, sped_teacher, bcba. DB tables: `evaluation_referrals`, `evaluations`, `eligibility_determinations`. API: `/api/evaluations/*`. Frontend: `/evaluations` page with 4 tabs (Dashboard, Referrals, Evaluations, Eligibility).
-   **Transition Planning (IDEA §300.320(b)):** Post-secondary transition planning for students aged 14+. Domain-specific goal entry across education, employment, and independent living. Agency referral tracker (VR, adult services, etc.) with follow-up date tracking and overdue alerts. Graduation pathway and credit documentation. Dashboard surfacing: students approaching transition age (13), students 14+ missing plans, overdue agency follow-ups. Student detail page shows transition section conditionally for age-eligible students. DB tables: `transition_plans`, `transition_goals`, `transition_agency_referrals`. API: `/api/transitions/*`. Frontend: `/transitions` page with Dashboard, Plans, and Plan Detail tabs. Nav links added for admin and SPED teacher roles.
-   **Dashboards:** Role-specific dashboards (Admin, SPED Teacher, SPED Student) provide an overview of KPIs and activities.
-   **Student & Teacher Portals:** Blackboard-style student portal for assignments and grades; teacher portal for class management and gradebooks.
-   **Analytics & Reporting:** Multi-tab analytics covering overview, behavior, academic, minutes, student deep dives, and a **Safety** tab dedicated to protective measures analysis (incident trends, antecedent breakdown, episode→PM probability ratio, student frequency drill-down, compliance indicators). 251 realistic seed incidents across 16 students spanning SY 2025-26 with phase-based trend variation. Backend endpoints: `/analytics/pm-overview`, `/analytics/pm-by-student`, `/analytics/pm-antecedents`, `/analytics/pm-episode-ratio`, `/analytics/pm-phase-trends`. Protective Measures page includes a collapsible "Incident Trends & Insights" panel with monthly sparkline, antecedent bars, and high-frequency student alerts.

## External Dependencies

-   Node.js
-   PostgreSQL
-   Vite
-   Tailwind CSS
-   shadcn/ui
-   Recharts
-   wouter
-   Express
-   Drizzle ORM
-   Zod
-   Orval
-   Clerk (for authentication)