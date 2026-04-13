# MinuteOps — SPED Service Delivery Operations Platform

## Overview

MinuteOps is a platform designed to streamline special education (SPED) and ABA service delivery operations. Its primary purpose is to enhance compliance, efficiency, and communication for professionals like BCBAs, special education coordinators, and case managers. Key functionalities include IEP service tracking, scheduling, delivered-minute tracking, compliance dashboards, alerts, and comprehensive reporting. The project aims to become a leading operational tool in SPED and ABA, reducing administrative burden and improving student outcomes.

## User Preferences

I want iterative development and detailed explanations of your thought process. Ask clarifying questions before making major architectural changes or implementing complex features. Do not change the fundamental project structure or core technologies without explicit approval.

## System Architecture

MinuteOps is built as a monorepo using `pnpm` workspaces, with a distinct separation between frontend and backend.

**Technology Stack:**
- **Frontend:** React 19, Vite, Tailwind CSS, shadcn/ui, Recharts, wouter.
- **Backend (API):** Express 5, Node.js 24.
- **Database:** PostgreSQL with Drizzle ORM.
- **Data Validation:** Zod.
- **API Generation:** Orval generates React Query hooks and Zod schemas from an OpenAPI 3.1 specification.

**Core Architectural Decisions:**

- **Modular Monorepo:** Organizes code into `artifacts/minuteops` (frontend), `artifacts/api-server` (backend), `lib/api-spec` (OpenAPI spec), and shared libraries for API clients, Zod schemas, and the database layer.
- **RESTful API Design:** Backend interactions are exposed via a REST API.
- **Comprehensive Database Schema:** PostgreSQL database supports detailed tracking of students, staff, services, IEPs, compliance, and ABA-specific data, including `service_types`, `session_logs`, `iep_documents`, `compliance_events`, `behavior_targets`, and `program_targets`.
- **UI/UX Design:** A modern, clean aesthetic using Tailwind CSS and shadcn/ui with an indigo accent. Features include `ProgressRing` components, an `AppLayout` for consistent navigation, a specific color scheme for status indicators, Inter font for readability, and Lucide React for iconography.

**Feature Specifications:**

- **Dashboard:** Overview of KPIs, compliance, and alerts.
- **Student Management:** CRUD operations for student profiles, service progress, behavior, and academic program tracking.
- **Service & Schedule Management:** Tracking service requirements, session logging (including bulk imports), and recurring schedule blocks with conflict detection.
- **IEP Workflow:** MA 603 CMR 28.00 compliant IEP pages, including document creation/editing, goal management (with goal bank), accommodations, meeting management, progress reports, and parent contact logs. Supports amendments and completeness checks.
- **Compliance Tracking:** IDEA compliance event tracking, automated deadline generation, and alerts system.
- **ABA Program Management:** Detailed behavior reduction and skill acquisition program management (with prompt hierarchies, auto-progression, mastery criteria), a comprehensive program builder (Type → Config → Steps → Review), and data collection interfaces. Includes a tiered template system for reusable program templates and a premium gate for advanced features.
- **Protective Measures (603 CMR 46.00/46.06):** Full MA DESE-compliant restraint/seclusion/time-out incident tracking, including a 4-step incident form, compliance checklist, digital signatures, and DESE CSV/JSON export capabilities.
- **Expandable Session Details:** Session rows expand to show clinical notes, linked IEP goals, behavior data, and program data.
- **Interactive Charts:** Reusable `InteractiveChart` component for behavior, academic, and minutes trend data, featuring sparkline view, expanded view with Recharts, staff filters, date range filters, and phase lines.
- **Reporting:** Generates minute summaries, missed session reports, and at-risk student reports with CSV export.
- **Session Edit/Delete:** Functionality to edit duration, status, location, notes, and missed reasons, with compliance warnings on deletion.
- **Date Range Filtering:** Server-side date range filtering for sessions.
- **Confirmation Dialogs:** Used for critical actions like alert resolution and session deletion.
- **Toast Notifications:** `sonner`-based system for user feedback.
- **Error States:** `ErrorBanner` for network failures on data-fetching pages.
- **Analytics & Insights (analytics.tsx):** Comprehensive school-wide data visualization page with 4 tabs — Overview (KPI cards, risk distribution donut, radial compliance gauge, service delivery heatmap), Behavior (weekly trends combo chart, measurement type distribution, top improving/worsening targets ranked lists), Academic (accuracy trends area chart, mastery funnel visualization, prompt level distribution horizontal bars, domain breakdown, top performers/needs support lists), Minutes (weekly delivery stacked bars completed vs missed, day-of-week pattern, compliance by service type progress bars, staff utilization ranked list). Backend: 5 new aggregate API endpoints under `/analytics/` (overview, behavior-summary, program-summary, minutes-summary, delivery-heatmap) with complex SQL aggregations.
- **Import Functionality:** Bulk CSV imports for students, service requirements, and session logs.
- **Global Search:** Search across IEP goals, accommodations, and students.
- **Staff Caseload Management:** Staff-specific dashboards with assigned students and IEP status summaries.
- **Scalability & Performance:** Optimized for large datasets with extensive database indexing, query optimization techniques (e.g., bulk queries, parallelization, grouped counts), and pagination support.

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