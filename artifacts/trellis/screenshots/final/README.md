# Trellis — Acquisition Listing Screenshot Pack

8 polished screenshots for an acquisition listing. All were captured at 1440×900 from the live app with realistic seed data (district 6, school year 2025-2026, "today" = Apr 20, 2026), with debug banners and the feedback widget hidden via the `?screenshot=1` flag.

| # | File | Route | Caption |
|---|------|-------|---------|
| 01 | `01-dashboard.jpg` | `/action-center?screenshot=1` | Admin's morning command center — Urgent / This Week / Coming Up triage with one-click jumps to Compliance, Alerts, IEP Meetings, and Comp-Ed. |
| 02 | `02-alerts.jpg` | `/alerts?screenshot=1` | 5,445 open compliance alerts across 55 pages — every IEP-expiring and minute-shortfall risk surfaced before it becomes a finding. |
| 03 | `03-compliance-roster.jpg` | `/students?screenshot=1` | Compliance roster across 100 SPED students — each row shows real-time minute progress, status chip (On Track / At Risk / Critical), and case manager. |
| 04 | `04-student-detail.jpg` | `/students/9150?screenshot=1` | Student snapshot: Aaliyah Okonkwo, Grade 5 SLD — 100 % service-minute compliance, 5 active IEP goals, 5 recent sessions, and zero open incidents. |
| 05 | `05-sessions.jpg` | `/sessions?screenshot=1` | Service-minute session log — every PT/OT/SLP/Counseling/BCBA session captured with provider, duration, and goal linkage for audit trail. |
| 06 | `06-schedule.jpg` | `/schedule?screenshot=1` | Weekly schedule grid — 6,537 service blocks for the active week with AI "Suggest schedule" to fill gaps and flag uncovered minutes. |
| 07 | `07-compensatory.jpg` | `/compensatory?screenshot=1` | Comp-Ed exposure tracker — 239,599 minutes owed across 492 active obligations, the financial liability districts can't currently see. |
| 08 | `08-state-reporting.jpg` | `/state-reporting?screenshot=1` | One-click MA state filings — IDEA Part B child count, MA SIMS, DESE restraint, and IEP timeline reports validated and exported district-wide. |

## The wedge in one sentence
Massachusetts SPED directors are personally liable for service-minute compliance and have no system that tracks minutes-required vs minutes-delivered in real time. Trellis is the only platform that closes that gap — and turns the comp-ed liability number (currently $0 because it's invisible) into a board-ready exposure metric.

## How to recapture
1. Make sure `artifacts/trellis: web` workflow is running.
2. Append `?screenshot=1` to any route — this hides the sample-data banner, feedback widget, and disables the onboarding tour for the session.
3. Capture at 1440×900 for parity with this pack.
