# Trellis Pilot Support Process

**Version:** 1.0  
**Date:** April 15, 2026

---

## How to Report a Problem

**Email:** support@trellis.education  
**Subject line format:** `[DISTRICT NAME] P1/P2/P3 — brief description`  
Example: `[Millbrook SPED] P2 — service minutes CSV export returns blank file`

Include:
- What you were trying to do
- What happened instead
- Your role (admin, case manager, etc.)
- The student ID or name if relevant (do not include full SSN or other PII beyond what's needed)

---

## Severity Levels and Response Times

### P1 — System Down or Data Loss Risk
**Definition:** The system is completely unavailable, or there is an active risk that student data has been lost or corrupted.  
**Examples:** Cannot log in at all; a submitted incident report disappeared; an IEP record shows incorrect student data.  
**Response time:** Initial response within **4 hours** during business hours (8 AM – 6 PM ET, Mon–Fri). If a P1 occurs outside business hours, response by 9 AM the next business day.  
**Resolution target:** Best effort within 24 hours. If not resolved, daily status updates provided.

### P2 — Compliance Workflow Blocked
**Definition:** A feature in the [Pilot Scope](./scope.md) is broken in a way that prevents a required compliance task from being completed.  
**Examples:** Cannot save a session log; incident report form won't submit; IEP compliance dates are displaying incorrectly.  
**Response time:** Initial response within **24 hours** on business days.  
**Resolution target:** Fix or documented workaround within 5 business days.

### P3 — UX Issue or Non-Blocking Bug
**Definition:** Something doesn't look right or is inconvenient, but the core workflow can still be completed.  
**Examples:** Button label is confusing; export file has a formatting issue; alert threshold seems wrong.  
**Response time:** Acknowledged within **1 business week**.  
**Resolution target:** Addressed in the next scheduled update cycle (2-week sprints).

---

## Who Is Responsible

| Role | Responsibility |
|---|---|
| **Trellis on-call (P1)** | System availability and data integrity |
| **Trellis support lead** | P2 and P3 responses, feature questions, export help |
| **District admin** | First line of internal user questions; escalates to Trellis via email |

The district admin is the single point of contact. End users (case managers, teachers) should report issues to the district admin first. The district admin decides whether to escalate to Trellis.

---

## Scheduled Maintenance

- Maintenance windows are **Sundays, 10 PM – 2 AM ET**.
- The district admin will be notified by email at least **48 hours in advance** of any planned maintenance.
- Emergency patches (security fixes) may be applied outside the maintenance window. The district admin will be notified by email within 1 hour of an emergency patch, with a summary of what changed.
- Trellis targets **99% uptime** during the pilot period (excluding scheduled maintenance windows). Unplanned downtime events will be documented in a monthly summary sent to the district admin.

---

## Feedback

During the pilot, we want to hear from you beyond just bug reports. Use the same support email to share:

- Features that are confusing or feel like extra work
- Workflows you expected but couldn't find
- Reports or exports you need that don't exist yet

Pilot feedback directly shapes the product roadmap.
