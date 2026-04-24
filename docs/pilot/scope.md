# Noverta Pilot Scope

**Version:** 1.0  
**Date:** April 15, 2026  
**Feature Freeze:** May 15, 2026  
**Pilot Duration:** 90 days from district go-live date

---

## What This Is

This document defines exactly what is included in the Noverta pilot, what is explicitly excluded, and what conditions govern the pilot period. Both Noverta and the pilot district agree to this scope before any real student data is entered.

---

## Modules In Scope

These modules are live, tested, and supported for the pilot.

| Module | What's Live |
|---|---|
| **Student Records** | Student roster, IEP document timeline, disability category, placement type, parent/guardian contacts |
| **IEP Compliance Tracking** | Active IEP status, annual review due dates, IEP calendar, compliance event log, overdue alerts |
| **Service Logging** | Session logs by service type, mandated vs. delivered minutes tracking, missed session recording |
| **Incident Reporting (Restraint/Seclusion)** | Restraint and seclusion incident entry, DESE 24-hour notification tracking, incident status workflow, written report tracking |
| **Staff & Caseload** | Staff directory, role assignments, caseload overview per case manager |
| **Compliance Reports** | Service minutes summary, executive compliance dashboard, compliance trend charts, at-risk student list |
| **Parent Contact Log** | Manual contact entries per student (phone, email, meeting) with outcome notes |
| **Evaluations** | Evaluation referral tracking, consent dates, timeline compliance |
| **Team Meetings** | IEP meeting scheduling, notice-sent tracking, consent status, meeting outcome notes |
| **Alerts** | System-generated alerts for overdue IEPs, missed sessions, and upcoming deadlines |
| **CSV/PDF Exports** | Active IEP timeline export, service minutes export, incident export, full student record PDF |

---

## Modules Explicitly Out of Scope (Pilot Period)

These features exist in the product but are **not part of the pilot agreement** and will not be supported during the 90-day period.

| Module | Status | Reason |
|---|---|---|
| **Billing & Stripe Payments** | Beta | Payment processing is available but not the focus of a compliance pilot |
| **SIS Sync** | Beta | Automated student information system sync is configurable but untested with district SIS |
| **FBA/BIP Management** | Beta | Functional Behavior Assessments and Behavior Intervention Plans are available but not validated for production use |
| **AI IEP Suggestions** | Beta | AI-generated goal recommendations require educator review; not included in pilot scope |
| **Parent Portal (Direct Login)** | Beta | Parent-facing portal is in development; parent contact log is in scope as the supported engagement method |
| **Agency & Contract Management** | Beta | Agency billing and contract utilization tracking are available but excluded from pilot |
| **District Executive Dashboard** | Enterprise | Available at the Enterprise tier; excluded from Essentials pilot |
| **Resource Management** | Enterprise | Caseload balancing and resource optimization excluded from pilot |
| **Analytics** | Beta | Advanced analytics charts are available but not audited for accuracy during the pilot |
| **SIS Import** | Beta | CSV bulk import is available but district-specific field mapping is not guaranteed |

---

## Feature Freeze

**Date: May 15, 2026**

After this date, no new features will be added to the in-scope modules until the pilot concludes. Bug fixes and critical security patches are not subject to the freeze.

The pilot school will be notified by email at least 7 days before any change to in-scope module behavior.

---

## Data Residency & Privacy

- Noverta is hosted on Replit's managed cloud infrastructure (United States).
- The database is a managed PostgreSQL instance. Backups run daily with a 7-day retention window.
- No student data is shared with third parties. The only third-party services that receive any external data are:
  - **Resend** — transactional email delivery (receives staff email addresses for alert routing; no student names, IDs, or record content)
  - **Sentry** — error monitoring (receives server-side error logs; Noverta policy is that no PII is included in error payloads)
- Staff authentication is handled through a secure identity service. Only staff/admin email addresses and session tokens are transmitted — no student records, IEP data, or SPED content leave the Noverta database.
- The pilot district retains ownership of all student data. Data will be returned or deleted within 30 days of pilot end upon written request.

---

## Onboarding

See the [Admin Quickstart Guide](./admin-quickstart.md) for the first steps after your district account is created. Before go-live, complete every item on the [Pilot Onboarding Checklist](./onboarding-checklist.md).

---

## Related Documents

- [Pilot Onboarding Checklist](./onboarding-checklist.md)
- [Success Metrics](./success-metrics.md)
- [Known Limitations & Beta Disclosure](./beta-disclosure.md)
- [Support Process](./support-process.md)
- [Admin Quickstart Guide](./admin-quickstart.md)
