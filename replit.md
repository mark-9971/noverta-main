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
-   **Clinical Supervision Tracking:** Tracks BCBA supervision of RBTs and paraprofessionals, including session logging and compliance dashboards.
-   **Dashboards:** Role-specific dashboards (Admin, SPED Teacher, SPED Student) provide an overview of KPIs and activities.
-   **Student & Teacher Portals:** Blackboard-style student portal for assignments and grades; teacher portal for class management and gradebooks.
-   **Analytics & Reporting:** Multi-tab analytics covering overview, behavior, academic, minutes, student deep dives, and various compliance reports with filtering and export capabilities.

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