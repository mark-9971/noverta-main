# Noverta Pilot Support Process

**Version:** 1.0  
**Date:** April 15, 2026

---

## How to Report a Problem

**Email:** support@noverta.education  
**Subject line format:** `[DISTRICT NAME] P1/P2/P3 — brief description`  
Example: `[Millbrook SPED] P2 — service minutes CSV export returns blank file`

Include:
- What you were trying to do
- What happened instead
- Your role (admin, case manager, etc.)
- The student ID or name if relevant (do not include full SSN or other PII beyond what's needed)

---

## Severity Levels and Response Times

### P1 — System Down
**Definition:** The application is completely unavailable — no one at the district can log in or access any data.  
**Examples:** Sign-in page is unreachable; the app returns a 500 error for all users; all sessions are logged out and cannot be restored.  
**Response time:** Initial response within **4 hours** during business hours (8 AM – 6 PM ET, Mon–Fri). If a P1 occurs outside business hours, response by 9 AM the next business day.  
**Resolution target:** Best effort restoration within 4 hours. If not resolved, status updates every 2 hours.

### P2 — Data Loss Risk
**Definition:** There is an active risk that student data has been lost, corrupted, or is inaccessible. The system may be partially running.  
**Examples:** A submitted incident report disappeared after saving; an IEP record shows a different student's data; session logs are missing from a prior date; an export CSV contains corrupted or missing rows.  
**Response time:** Initial response within **24 hours** on business days.  
**Resolution target:** Confirmed data status (recovered, unrecoverable, or isolated) within 48 hours. Noverta provides a written incident summary within 5 business days.

### P3 — UX Issue or Non-Blocking Bug
**Definition:** Something doesn't look right or is inconvenient, but no data is at risk and the core workflow can still be completed.  
**Examples:** Button label is confusing; export file has a column formatting issue; alert threshold seems incorrect; a page loads slowly.  
**Response time:** Acknowledged within **1 business week**.  
**Resolution target:** Addressed in the next scheduled update cycle (2-week sprints).

---

## Who Is Responsible

| Role | Responsibility |
|---|---|
| **Noverta on-call (P1/P2)** | System availability, data integrity, and data loss incidents |
| **Noverta support lead** | P3 responses, feature questions, workflow support |
| **District admin** | First line of internal user questions; escalates to Noverta via email |

The district admin is the single point of contact. End users (case managers, teachers) should report issues to the district admin first. The district admin decides whether to escalate to Noverta.

---

## Scheduled Maintenance

- Maintenance windows are **Sundays, 10 PM – 2 AM ET**.
- The district admin will be notified by email at least **48 hours in advance** of any planned maintenance.
- Emergency patches (security fixes) may be applied outside the maintenance window. The district admin will be notified by email within 1 hour of an emergency patch, with a summary of what changed.
- Noverta targets **99% uptime** during the pilot period (excluding scheduled maintenance windows). Unplanned downtime events will be documented in a monthly summary sent to the district admin.

---

## Feedback

During the pilot, we want to hear from you beyond just bug reports. Use the same support email to share:

- Features that are confusing or feel like extra work
- Workflows you expected but couldn't find
- Reports or exports you need that don't exist yet

Pilot feedback directly shapes the product roadmap.
