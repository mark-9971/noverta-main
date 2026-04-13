# MinuteOps — SPED Service Delivery Operations Platform

## Overview

MinuteOps is a production-quality platform designed for special education and ABA service delivery operations. It streamlines operations for BCBAs, special education coordinators, paraeducators, providers, and case managers. The platform's core purpose is to enhance compliance, efficiency, and communication in managing special education services. Key capabilities include IEP service requirement tracking, scheduling, delivered-minute tracking, compliance/risk dashboards, alerts, and comprehensive reporting. The project aims to become the leading operational tool for SPED and ABA providers, reducing administrative burden and improving student outcomes.

## User Preferences

I want iterative development and detailed explanations of your thought process. Ask clarifying questions before making major architectural changes or implementing complex features. Do not change the fundamental project structure or core technologies without explicit approval.

## System Architecture

MinuteOps is built as a monorepo using `pnpm` workspaces, featuring a clear separation between frontend and backend.

**Technology Stack:**
- **Frontend:** React 19, Vite, Tailwind CSS, shadcn/ui, Recharts, wouter. The frontend (`artifacts/minuteops`) consumes the API and provides a rich user interface.
- **Backend (API):** Express 5, Node.js 24. The API server (`artifacts/api-server`) handles all business logic and data persistence.
- **Database:** PostgreSQL with Drizzle ORM. The database schema (`lib/db`) is designed to support detailed tracking of students, staff, services, IEPs, compliance, and ABA-specific data.
- **Data Validation:** Zod is used for robust schema validation.
- **API Generation:** Orval generates React Query hooks and Zod schemas from an OpenAPI 3.1 specification (`lib/api-spec`), ensuring type safety and consistency between frontend and backend.

**Core Architectural Decisions:**

- **Modular Monorepo:** Separates concerns into distinct packages: `artifacts/minuteops` (frontend), `artifacts/api-server` (backend), `lib/api-spec` (OpenAPI spec), `lib/api-client-react` (generated API client), `lib/api-zod` (generated Zod schemas), and `lib/db` (database layer).
- **RESTful API Design:** All backend interactions are exposed via a REST API, with clear endpoints for managing resources like students, staff, sessions, IEPs, and ABA data.
- **Comprehensive Database Schema:** The PostgreSQL database includes tables for:
    - **Students:** Core student demographic and IEP-related data.
    - **Staff:** Provider and case manager details with roles.
    - **Service Management:** `service_types`, `service_requirements`, `session_logs`, `schedule_blocks`, `staff_assignments`.
    - **IEP Management:** `iep_documents` (including versioning and amendments), `iep_accommodations`, `goal_bank`, `team_meetings`, `parent_contacts`.
    - **Compliance:** `compliance_events` for tracking deadlines and `alerts` for notifications.
    - **ABA Specifics:** `behavior_targets`, `program_targets` (skill acquisition with steps, prompt hierarchies, mastery criteria), `program_templates`, `data_sessions`, `behavior_data`, `program_data`.
- **UI/UX Design:**
    - **Aesthetic:** Modern, clean design using Tailwind CSS and shadcn/ui with an indigo accent.
    - **Key Components:** `ProgressRing` and `MiniProgressRing` for visual progress tracking, `AppLayout` for consistent navigation.
    - **Color Scheme:** `slate-50/80` background, white cards, `indigo-600` primary, with status colors (emerald, amber, orange, red, indigo) for compliance indicators.
    - **Typography:** Inter font, emphasizing readability with distinct sizes for body, labels, and headings.
    - **Accessibility:** Filter pills use `aria-pressed`.
    - **Icons:** Lucide React for consistent iconography.

**Feature Specifications:**

- **Dashboard:** Provides an overview of KPIs, compliance status, and recent alerts.
- **Student Management:** CRUD operations for students, detailed student profiles with service progress, behavior, and academic program tracking.
- **Service & Schedule Management:** Tracking service requirements, session logging (including bulk imports and quick logs), and recurring schedule block management with conflict detection.
- **IEP Workflow:** Comprehensive MA 603 CMR 28.00 compliant IEP pages, including document creation/editing, goal management (with a goal bank), accommodations, meeting management, progress reports, and parent contact logs. Supports IEP amendments and completeness checks.
- **Compliance Tracking:** IDEA compliance event tracking (annual reviews, reevaluations), automated deadline generation, and alerts system.
- **ABA Program Management:** Detailed behavior reduction target tracking, skill acquisition program management (with prompt hierarchies, auto-progression, mastery criteria), and data collection interface for live and manual sessions. Includes trend charting for behavior and program data.
- **Reporting:** Generates reports for minute summaries, missed sessions, and at-risk students.
- **Import Functionality:** Supports bulk CSV imports for students, service requirements, and session logs, with downloadable templates.
- **Global Search:** Allows searching across IEP goals, accommodations, and students.
- **Staff Caseload Management:** Provides staff-specific dashboards with assigned students and IEP status summaries.

## Demo Data

Database is seeded with realistic demo data:
- 50 students across grades K-12 with varied disability categories
- 18 staff (3 BCBAs, 2 SLPs, 2 OTs, 1 PT, 2 counselors, 6 paras, 2 case managers)
- 187 IEP service requirements with staggered start/end dates
- 8,035 session logs spanning Sep 2025-Apr 2026 with realistic durations by service type (ABA: 45-75min, OT/SLP: 20-45min, Para: 45-90min, BCBA: 15-45min), ~11% miss rate (higher in winter)
- IEP documents with staggered start dates across the entire school year (Sep 2025 - Apr 2026), not all starting together
- 42 behavior targets across 14 students with natural trend patterns (steady improvement, plateau-then-improve, regression-then-recovery)
- 42 program targets across 14 students with varied learning curves and mastery tracking
- 370+ data collection sessions with behavior and program data
- School holidays/breaks modeled (Thanksgiving, winter, February, April breaks)
- 44 goal bank entries across 7 domains

## External Dependencies

- **Node.js**: Runtime environment for the backend.
- **PostgreSQL**: Primary database for data storage.
- **Vite**: Frontend build tool.
- **Tailwind CSS**: Utility-first CSS framework.
- **shadcn/ui**: Reusable UI components.
- **Recharts**: Charting library for data visualization.
- **wouter**: Frontend routing library.
- **Express**: Web application framework for the API server.
- **Drizzle ORM**: TypeScript ORM for PostgreSQL.
- **Zod**: Schema declaration and validation library.
- **Orval**: OpenAPI to client code generator.
- **esbuild**: JavaScript bundler for the API server.
- **Lucide React**: Icon library.