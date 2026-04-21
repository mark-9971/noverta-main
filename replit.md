# Trellis — SPED Operations, Service Delivery & Compliance Platform

## Overview

Trellis is a SPED service-delivery and compliance-risk platform for Massachusetts school districts (603 CMR 28.00/46.00). Its core purpose is to help SPED teams track mandated service delivery, identify compliance gaps early, and mitigate compensatory risk. It integrates with existing SIS systems, focusing on IEP-delivery aspects such as service minutes, missed sessions, and documentation. The platform avoids "AI-powered" branding unless explicitly using AI models for features like IEP PDF extraction. The product tagline is: "Service-minute compliance for SPED."

**Key Capabilities:**

-   **Compliance Monitoring:** Tracks service minute delivery, identifies shortfalls, and calculates financial exposure.
-   **Reporting & Analytics:** Generates comprehensive compliance reports, weekly summaries, and executive dashboards.
-   **IEP Management:** Supports IEP creation, goal tracking, progress reporting, and meeting management compliant with MA 603 CMR 28.00.
-   **Operational Efficiency:** Streamlines scheduling, staff assignments, parent communication, and data import processes.
-   **Data Import & Onboarding:** Streamlined CSV import for staff and students, and AI-powered IEP document extraction.
-   **Clinical Tools:** Includes FBA, BIP generation, and ABA clinical graphing.
-   **Communication:** Facilitates parent communication and notifications.
-   **Resource Management:** Tools for caseload balancing, staff scheduling, and substitute management.
-   **Financial Tracking:** Manages Medicaid billing, cost avoidance, and compensatory finance.
-   **Security & Audit:** Implements FERPA-compliant audit logging and robust tenant isolation.
-   **Risk Mitigation:** Provides tools for protective measures (603 CMR 46.00/46.06), compliance risk forecasting, and compensatory service tracking.
-   **Data-Driven Insights:** Offers comprehensive reporting, analytics, and data health checks for district administrators.
-   **Goal:** Trellis's ambition is to streamline SPED operations, ensuring compliance and improving outcomes for students. It offers tools for managing student data, sessions, schedules, staff, reports, and communication, with a focus on ease of use and actionable insights. Key capabilities include comprehensive compliance reporting, automated workflows, and data-driven recommendations, designed to empower SPED administrators and clinicians.

**Standing tagline:** "Service-minute compliance for SPED."

## User Preferences

I want iterative development and detailed explanations of your thought process. Ask clarifying questions before making major architectural changes or implementing complex features. Do not change the fundamental project structure or core technologies without explicit approval.
NEVER hide, demote, remove, or delete nav items, pages, routes, components, or features. Reorganization that *adds* discoverability (e.g., listing a link in two nav groups) is fine; anything that reduces visibility is not. Re-parents that orphan a link from its previous group also count as hiding — preserve the original location and add the new one. The wedge-task prompt that said "hide or demote distracting modules" is overridden by this rule.

## Operating Model (binding for every future session — ACCEPTED NORMALIZED VERSION 2026-04-21)

**Product truth.** Trellis is strongest today as an operational workflow tool with a compliance reporting backbone. The wedge is: Action Center, Today / executive wedge surfaces, Compliance Risk Report, Quick Log, Student Detail "Recommended Next Step", shared handling state, and school-calendar-aware minute math. Biggest current risks: (1) Schedule Makeup / recovery orchestration is still not a true closed loop; (2) surrounding surface area still overstates maturity and creates confusion.

**Roadmap execution rule.**
- Immediate main build priority: closed-loop scheduling / makeup orchestration (roadmap Phase A; tasks T01–T05 + T07).
- In parallel, allow only narrow, high-value surface-honesty fixes that reduce current confusion without broadening scope (e.g., T06 truthful-CTA rename).
- After closed-loop makeup lands, continue broader maturity / surface-honesty consolidation (Phase B; T09–T11).
- Then proceed to durable case-manager persistence, audit-grade proof, and selective demo / sales polish (Phases C → G → F).
- Phase D (notifications) cannot start until Phase A is fully merged.

**Lane model (default 2 lanes; 3 max only when the third is clearly low-conflict).**
- *Main agent:* high-conflict wedge work; anything changing workflow shape; anything touching canonical wedge primitives, recommendation logic, shared handling hooks/routes, minute math, nav truth, replit.md truth, demo reset orchestration, or closed-loop scheduling.
- *Background lane:* isolated reliability work, isolated e2e, isolated seeder cleanup, isolated persistence work, buyer pack / docs, low-conflict module work.
Do not encourage many simultaneous coding lanes against wedge files.

**Hot files / high-conflict areas (call out overlap risk explicitly when a task touches these):**
- `artifacts/trellis/src/components/wedge-primitives.tsx`
- `artifacts/trellis/src/lib/action-recommendations.ts`
- `artifacts/trellis/src/lib/use-handling-state.ts`
- `artifacts/trellis/src/lib/use-dismissal-state.ts`
- `artifacts/trellis/src/pages/action-center.tsx`
- `artifacts/trellis/src/pages/compliance-risk-report.tsx`
- `artifacts/trellis/src/components/dashboard/*`
- `artifacts/api-server/src/routes/actionItemHandling.ts`
- `artifacts/api-server/src/routes/actionItemDismissals.ts`
- `artifacts/api-server/src/lib/minuteCalc.ts`
- `artifacts/api-server/src/lib/schoolCalendar.ts`
- `artifacts/trellis/src/lib/nav-config.ts`
- `replit.md`
- demo reset / seeding files
- scheduling orchestration files

**Output contract for substantial tasks.** Do the work, not just a plan. Reuse canonical helpers/models/components/routes; do not duplicate logic; do not broaden scope casually. Be explicit about what is persisted vs derived vs local-only vs shared. If prior summaries conflict with code, prefer the code. Substantial outputs return: (1) EXECUTIVE VERDICT, (2) EXACT CHANGES MADE, (3) USER-VISIBLE IMPACT, (4) ARCHITECTURE / MODEL IMPACT, (5) TEST / BUILD STATUS, (6) REMAINING GAPS, (7) EXACT NEXT TASKS — plus a clean plain-text FINAL ARTIFACT block. Verdicts are honest: COMPLETE / PARTIAL / INCORRECTLY IMPLEMENTED.

**Roadmap order to assume:**
1. Surface honesty / maturity clarity where needed
2. Closed-loop scheduling / makeup orchestration
3. Durable case-manager persistence
4. Audit-grade proof
5. Selective demo / sales polish

**Do not prioritize yet:** giant backend task engine, broad visual redesign, more clinical scaffolding, more executive dashboards, generic localStorage cleanup sweeps, more top-level nav breadth.

## System Architecture

Trellis is built as a monorepo using `pnpm` workspaces, separating frontend and backend components.

**Technology Stack:**

-   **Frontend:** React 19, Vite, Tailwind CSS, shadcn/ui, Recharts, wouter.
-   **Backend (API):** Express 5, Node.js 24.
-   **Database:** PostgreSQL with Drizzle ORM.
-   **Data Validation:** Zod.
-   **API Generation:** Orval (generates React Query hooks and Zod schemas from OpenAPI 3.1).

**Core Architectural Decisions:**

-   **Modular Monorepo:** Organizes code into `artifacts/trellis` (frontend), `artifacts/api-server` (backend), `lib/api-spec` (OpenAPI spec), and shared libraries for maintainability and scalability.
-   **RESTful API Design:** Backend functionality is exposed through a well-defined REST API.
-   **Authentication & Authorization:** Clerk handles user authentication and authorization. Role-based access control is enforced at both frontend and backend levels for 9 distinct roles (e.g., `admin`, `case_manager`, `sped_parent`). Guardian portal routes are path-scoped with specific middleware.
-   **Comprehensive Database Schema:** A PostgreSQL database underpins all operations, storing data related to districts, students, staff, IEPs, compliance, and clinical tools.
-   **UI/UX Design:** Adheres to an "Ink & Air" theme with a pure white/near-white background, near-black typography, neutral grays, and emerald green accents (primary: HSL 160 84% 39%). Supports role-based color theming, responsive design, and accessible components.
-   **Error Handling & Monitoring:** Implements React Error Boundaries for robust frontend behavior and integrates Sentry for error reporting. Health check endpoints (`/health`, `/api/health`) provide real-time system status.
-   **API Rate Limiting:** Enforces two-tier rate limits (general and mutation-specific) per IP to ensure stability and prevent abuse.
-   **Theme System:** Provides 10 built-in themes, including accessibility-focused options, stored in local storage for user preference persistence.
-   **Tenant Isolation:** Strict tenant isolation is enforced at the API level to prevent cross-district data access, especially in production environments.
-   **FERPA Audit Logging:** An append-only audit trail tracks all access and modifications to student records, capturing actor identity, action type, affected records, and value diffs.
-   **Soft Delete & Recovery:** Key entities (students, staff, sessions) use soft-deletion, allowing administrators to restore accidentally deleted records.
-   **Billing Modes:** Districts operate in `demo`, `pilot`, `paid`, `trial`, `unpaid`, or `unconfigured` modes, managed by `GET /api/billing/status` and `GET /api/district-tier`.
-   **Module & Tier Gating:** Product modules (Compliance Core, Clinical & Instruction, District Operations, Engagement & Access) are gated by subscription tier (Essentials, Professional, Enterprise).

**Feature Specifications:**

-   **AI-Powered IEP PDF Import:** Utilizes GPT-5.2 for automated extraction of structured data from IEP PDF documents, including student information, goals, and service requirements.
-   **Compliance Risk Reporting & Dashboard:** Provides a meeting-ready compliance report and a redesigned dashboard focused on service minute compliance, gap detection, and compensatory exposure. Includes executive summaries, at-risk student lists, and provider delivery summaries.
-   **Weekly SPED Compliance Summary:** Generates a weekly report with executive summaries, urgent flags, student shortfalls, and provider delivery data, available for export in various formats (print, CSV, PDF).
-   **Deterministic Recommendations Panel:** Offers data-driven operational guidance on the compliance dashboard, with transparent rules and data source tracking (no AI involved).
-   **Onboarding Checklist:** A completion-based checklist that guides new districts through setup, with steps derived from actual database state.
-   **Data Health Check:** An admin-facing diagnostic tool that verifies data integrity before pilot initiation.
-   **CSV Import Flow Upgrade:** Enhanced system for self-onboarding, supporting multiple data types with pre-import validation, column mapping, and duplicate handling.
-   **Protective Measures (603 CMR 46.00):** Comprehensive tracking for restraint/seclusion/time-out incidents, including a detailed incident form, compliance checklist, and DESE-compliant exports.
-   **IEP Goal Progress Visualization:** Displays per-goal trend charts on student detail pages, showing progress data over time with baselines, mastery criteria, and trend indicators.
-   **Student Snapshot:** Provides an at-a-glance view of key student information, including active goals, upcoming deadlines, recent sessions, and compliance status.
-   **IEP Meeting Prep Checklist:** A guided readiness tracking tool for IEP team meetings, with auto-detection of completed items and a draft agenda generator.
-   **Team Collaboration Notes:** Shared student-level comment threads for staff coordination with @mention functionality.
-   **Accommodation Tracking & Verification:** Manages IEP accommodations, including a workflow for general education teacher verification and a district-wide compliance dashboard.
-   **Medicaid Billing Integration:** Features CPT code mapping, claim generation, a review queue, and export capabilities for Medicaid reimbursement.
-   **Cost Avoidance Dashboard:** Predicts compliance risk with financial exposure estimates related to evaluation deadlines, service shortfalls, and IEP annual reviews.
-   **Compensatory Services Financial Tracker:** Provides a dollar-value exposure view for compensatory service obligations, including rate configuration and burn-down charts.
-   **Caseload Balancing:** An administrative tool to visualize and rebalance provider workload distribution.
-   **Staff Scheduling & Availability:** Manages staff schedules, detects conflicts, and identifies coverage gaps.
-   **Substitute & Coverage Management:** Tools for managing provider absences and assigning substitutes.
-   **Parent Communication Hub:** An in-app messaging system for staff and guardians, including message templates and conference scheduling.
-   **ABA Clinical Graphing & IOA Tracking:** Visualizes ABA goal progress with trend lines and tracks inter-observer agreement.
-   **Para Mobile Data Entry ("My Day"):** A mobile-first daily agenda for paraprofessionals with quick session logging and guided data collection.
-   **Live Session Data Collection:** Integrated data collection during timed sessions with goal-specific widgets.
-   **Document Management & E-Signatures:** Object storage-backed document management with e-signature workflows for compliance.
-   **FERPA Audit Logging:** An append-only audit trail for all access and modifications to student records.
-   **SIS Integration:** Connectors for popular SIS (PowerSchool, Infinite Campus, Skyward, CSV) with sync capabilities and encrypted credentials.
-   **Subscription & Tenant Billing:** Stripe integration for managing district-level subscriptions and plan tiers.
-   **Module & Tier Gating:** Features and modules are gated based on subscription tier.
-   **Unified Compliance Hub:** A single page with tabs for Service Minutes, Checklist, and Timeline.
-   **Overdue Session Log Reminders:** Automated alerts for unlogged sessions with email notifications.
-   **Alerts Workflow Hub:** A centralized page for managing open, snoozed, and resolved alerts.
-   **Pilot Success Metrics Dashboard:** Tracks key performance indicators for pilot programs.
-   **Generated Document Pipeline:** Stores rendered HTML snapshots of documents for re-printing and sharing.
-   **Security Hardening:** Implements tenant isolation, path-scoped role guards, and a permission matrix test suite.
-   **Compliance Trends Page:** Provides a unified time-series view of four key compliance metrics (service minutes, at-risk students, compensatory exposure, logging completion).
-   **Per-tenant sample data:** Admins/coordinators can one-click seed a small realistic district inside their own tenant for quick setup. Sample data spans a realistic 6–8 month service-delivery window with historical sessions, IEP-year-relative mastery, and multi-period progress reports for pilot demos. An "Advanced — tailor this demo for a specific district" form on the setup CTA also accepts v1 custom inputs (district name, school count, SPED student count, CM/provider/para/BCBA counts, avg goals/week minutes, backfill months, 5 health intensities, and a demo-emphasis story) which the seeder applies via `resolveSeedShape()` to scale roster size, staffing, completion rate, on-time logging, scenario weights, and backfill window for per-district demos.
-   **Role-Based IA & Navigation:** Top-level navigation is carved per role (admin, case manager, related-service provider, paraprofessional, guardian, etc.) with an "Ink & Air" two-rail layout. Internal/diagnostic surfaces are gated behind support roles only.
-   **Trellis Support View-As (Impersonation):** Platform-admin support agents can impersonate any user with full audit-log coverage. Sessions are token-based with TTL expiry, single-active-session-per-admin (auto-supersede), and customer-visible audit_logs rows for every transition (start, end, supersede, expiry self-heal). `/api/audit-logs` surfaces these to district admins via `targetTable=view_as_sessions`.
-   **Trust & Security Readiness:** Unconditional district scope enforcement on all data routes (`enforceDistrictScope`), per-tenant audit isolation, and a permission-matrix regression suite for impersonation, view-as token reuse, and stale-token attribution edge cases.
-   **Multi-Artifact Workspace:** The monorepo also hosts pitch/demo decks (`trellis-pitch`, `trellis-demo`, `trellis-deck`), a dashboard concepts deck, an API server, and a mockup sandbox for component variant exploration on the canvas.

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
-   Clerk (Authentication)
-   Stripe (Payment processing via Replit integration)
-   stripe-replit-sync (Stripe webhook processing and data sync)
-   Resend (Transactional email delivery)
-   pdf-parse (PDF document parsing)
-   OpenAI (GPT-5.2 for IEP PDF extraction)