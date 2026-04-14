# Trellis — SPED Compliance & Behavior Analysis Platform

## Overview

Trellis is a specialized platform designed for K-12 Special Education (SPED) compliance and behavior analysis, primarily for Massachusetts 603 CMR 28.00/46.00 regulations. It provides tools for Admins, SPED Teachers, and SPED Students, focusing on comprehensive BCBA clinical functionalities like FBA, Functional Analysis, and BIP generation. The platform also includes robust features for managing IEPs, tracking protective measures (restraint/seclusion incidents with multi-signature workflows and parent notifications), and providing detailed analytics. While core General Education (Gen Ed) features are maintained in the backend, the current frontend prioritizes SPED-specific workflows. The project aims to be a leading solution for SPED compliance and clinical management, with future potential for broader K-12 integration.

The brand identity "Trellis" with the tagline "Built to support." uses a "Ink & Air" theme, characterized by pure white/near-white backgrounds, near-black typography, neutral gray tones, and emerald green accents (primary: HSL 160 84% 39%), emphasizing a clean, airy, and editorial aesthetic with generous whitespace and subtle shadows.

## User Preferences

I want iterative development and detailed explanations of your thought process. Ask clarifying questions before making major architectural changes or implementing complex features. Do not change the fundamental project structure or core technologies without explicit approval.

## System Architecture

Trellis is built as a monorepo using `pnpm` workspaces, with a distinct separation between frontend and backend.

**Technology Stack:**
-   **Frontend:** React 19, Vite, Tailwind CSS, shadcn/ui, Recharts, wouter.
-   **Backend (API):** Express 5, Node.js 24.
-   **Database:** PostgreSQL with Drizzle ORM.
-   **Data Validation:** Zod.
-   **API Generation:** Orval generates React Query hooks and Zod schemas from an OpenAPI 3.1 specification.

**Core Architectural Decisions:**

-   **Modular Monorepo:** Code is organized into `artifacts/minuteops` (frontend), `artifacts/api-server` (backend), `lib/api-spec` (OpenAPI spec), and shared libraries.
-   **RESTful API Design:** All backend interactions are exposed via a REST API.
-   **Role-Based Architecture:** Supports `admin`, `sped_teacher`, and `sped_student` roles, each with distinct dashboards and access permissions. Role switching is available via a sidebar.
-   **Comprehensive Database Schema:** A PostgreSQL database tracks districts, schools, students, staff, services, IEPs, compliance data, ABA data, and protective measures. Key tables include `districts`, `schools`, `restraint_incidents` (for MA DESE 603 CMR 46.00 compliance with over 60 fields), `incident_signatures` for multi-signature workflows, and extended `team_meetings`.
-   **BCBA Clinical Tools:** Integrated FBA (Functional Behavior Assessment), Functional Analysis, and BIP (Behavior Intervention Plan) generation. This includes structured ABC data observation forms, functional analysis session recording, and automatic BIP generation with function-specific strategies.
-   **IEP Workflow:** Implements MA 603 CMR 28.00 compliant IEP pages, goal management, accommodations, meeting management, and DESE-compliant progress reports with PDF generation and parent notification workflows. It includes an auto-target creation feature for new IEP goals.
-   **IEP Program Suggestions:** An engine generates suggestions for behaviors to track, DTTs (Discrete Trial Trainings), task analyses, academic programs, and related services based on student IEP goals, with relevance scoring and one-click application.
-   **UI/UX Design:** Adheres to the "Ink & Air" theme with pure white backgrounds, neutral gray palettes, near-black text, and emerald accents. Role-based color theming and responsive design are implemented, featuring `ProgressRing` components and a role-aware `AppLayout`.

**Feature Specifications:**

-   **Resource Management:** Caseload balancing page (`/resource-management`) with three tabs: Caseload Balance (per-school provider FTEs, student counts, avg caseload, utilization bars), Provider Utilization (sortable provider table with expandable service breakdowns), and Budget & Cost (cost by school/service/student with CSV export). Staff schema includes `hourly_rate` and `annual_salary` fields. API endpoints: `/api/resource-management/caseload`, `/api/resource-management/provider-utilization`, `/api/resource-management/budget`, `/api/resource-management/rebalancing`, `PATCH /api/staff/:id/rates`.
-   **Compensatory Services:** Tracks owed compensatory minutes when mandated IEP services fall short. Page at `/compensatory-services` with summary cards, status filters (pending/in_progress/completed/waived), expandable obligation rows with comp session logs. Features: shortfall calculator (auto-detect service deficits for a period), manual obligation creation, comp session logging (auto-updates delivered minutes and status via DB transaction), student detail widget showing comp time summary. Schema: `compensatory_obligations` table + `is_compensatory`/`compensatory_obligation_id` columns on `session_logs`. API endpoints: `/api/compensatory-obligations` (CRUD), `/api/compensatory-obligations/:id/sessions`, `/api/compensatory-obligations/summary/by-student/:studentId`, `/api/compensatory-obligations/calculate-shortfalls`, `/api/compensatory-obligations/generate-from-shortfalls`.
-   **Dashboards:** Role-specific dashboards (Admin, SPED Teacher, SPED Student) provide an overview of KPIs, caseloads, goals, and upcoming activities.
-   **Student Management:** CRUD operations for student profiles, service progress, behavior, and academic program tracking.
-   **Service & Schedule Management:** Tracking service requirements, logging sessions (including bulk imports), and recurring schedule blocks with conflict detection.
-   **Compliance Tracking:** IDEA compliance event tracking, automated deadline generation, and alerts.
-   **Analytics & Insights:** A multi-tab analytics page covers overview, behavior, academic, minutes, and student deep dives.
-   **Reporting:** Includes minute summaries, missed session reports, at-risk student reports, executive compliance summary, compliance trend analysis (line chart with school overlay), and audit package generation with per-student detail and CSV export. All report tabs support school/district filtering and date range selection.
-   **Global Search:** Functionality to search across IEP goals, accommodations, and students.
-   **Import Functionality:** Bulk CSV imports for students, service requirements, and session logs.

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
-   esbuild
-   Lucide React
-   Sonner (for toast notifications)