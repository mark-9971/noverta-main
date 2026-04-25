# Incident Response Plan

**Noverta — Data Security Incident Response Outline**
*Last updated: [DATE]*

---

## Overview

This document describes Noverta's process for detecting, responding to, and notifying affected parties in the event of a data security incident that may affect student education records or other sensitive district data.

Noverta is subject to FERPA breach notification requirements. Under FERPA, school districts (as the data controllers) must notify affected families when education records are impermissibly disclosed. Noverta, as the data processor, will support the district in fulfilling this obligation.

---

## 1. What Constitutes an Incident

A **security incident** is any event that represents or may represent:

- Unauthorized access to Noverta systems or data
- Accidental disclosure of student or staff records to unauthorized parties
- Data loss or corruption affecting student records
- Unauthorized modification of student data
- Account compromise (credential theft, session hijacking)
- Infrastructure outage caused by a malicious actor

**Not covered by this plan:** routine system errors, performance issues, or single-user operational mistakes (e.g., accidentally deleting a record — covered by the backup/restore process).

---

## 2. Detection

Noverta detects potential incidents through multiple mechanisms:

**Automated detection:**
- **Sentry error monitoring** — flags anomalous error spikes, unexpected authentication failures, and application crashes
- **System Status dashboard** — district admins can see recent error counts in the app
- **Database activity monitoring** — unusual query volumes or off-hours access patterns

**Human detection:**
- District admin reports an anomaly (unexpected data, missing records, unauthorized login)
- Noverta engineering team identifies a vulnerability during code review or dependency audit
- Third-party security researcher responsible disclosure

---

## 3. Internal Triage (First 4 Hours)

Upon identifying a potential incident:

**Step 1 — Confirm and classify (0–1 hour)**
- Determine whether the event constitutes a confirmed incident or a false positive
- Classify severity:
  - **P1 (Critical):** Active unauthorized access, confirmed data exfiltration, production database compromise
  - **P2 (High):** Suspected data exposure, account compromise with student data access
  - **P3 (Medium):** Vulnerability discovered but not yet exploited; no confirmed data exposure

**Step 2 — Contain (1–2 hours, P1/P2 only)**
- Revoke compromised sessions or API keys
- If infrastructure is compromised: take affected systems offline and restore from clean backup
- Block malicious IP addresses at the network layer
- Preserve logs and forensic evidence (do not delete or overwrite)

**Step 3 — Assess scope (2–4 hours)**
- Identify which districts, students, and record types may have been affected
- Determine whether the incident constitutes an impermissible disclosure under FERPA
- Document: timeline, vector of access, records potentially exposed, and containment actions taken

**Step 4 — Internal escalation**
- Notify Noverta leadership within 1 hour of confirming a P1/P2 incident
- Engage legal counsel if the incident may involve litigation exposure

---

## 4. District Notification (FERPA 72-Hour Requirement)

Under FERPA, when an unauthorized disclosure of education records occurs, the school district (as the entity responsible for student records) must notify affected families. Noverta will notify the affected district(s) within **72 hours** of confirming that an impermissible disclosure has occurred.

**Notification to district includes:**
1. Date and time incident was discovered and confirmed
2. Nature of the incident (what happened)
3. Categories of records affected (e.g., student session logs, IEP goals)
4. Number of students or staff records estimated to be affected
5. Actions Noverta has taken to contain the incident
6. Actions the district should consider taking (e.g., password resets, parent notifications)
7. Noverta point of contact for ongoing communication

**Delivery method:** Direct email to the district's designated Security/Privacy contact, followed by a phone call for P1 incidents.

---

## 5. District Notification Letter Template

```
Subject: Noverta Security Incident Notification — [DATE]

Dear [DISTRICT CONTACT NAME],

Noverta is writing to notify [DISTRICT NAME] of a security incident 
that occurred on [DATE/TIME] and was confirmed on [DATE/TIME].

Nature of the incident:
[Describe what happened in plain language]

Records potentially affected:
[Describe record types and estimated number of students/staff]

Actions taken by Noverta:
[Describe containment steps completed]

Recommended actions for the district:
[Describe any steps the district should take]

Noverta remains available to support your response. Please contact:

[TRELLIS INCIDENT CONTACT NAME]
[EMAIL]
[PHONE]

We are committed to transparency and will provide updates as our 
investigation continues.

Sincerely,
[TRELLIS SIGNATORY]
```

---

## 6. Family Notification (District Responsibility)

When a FERPA breach affects student education records, the **school district** (not Noverta) is the responsible party for notifying affected families. Noverta will:

- Provide the district with a complete list of affected student records
- Provide documentation of the incident for the district's use in notifications
- Make a Noverta representative available to answer questions for district counsel

The district's obligation under FERPA: notify affected families as soon as reasonably practicable. FERPA does not specify a deadline for family notification, but most privacy attorneys recommend notification within 30 days of confirmed breach.

---

## 7. Regulatory Reporting

**FERPA:** The district, as the data controller, is responsible for notifying the U.S. Department of Education of significant FERPA breaches if required. Noverta will provide supporting documentation.

**State law:** Massachusetts does not have a separate education-specific breach notification law, but M.G.L. c. 93H requires notification to the Massachusetts Attorney General and affected individuals for breaches of personal information. Noverta will cooperate with the district in fulfilling M.G.L. c. 93H obligations.

---

## 8. Post-Incident Review

Within **14 days** of closing a P1 or P2 incident:

1. Conduct a blameless post-mortem review with the engineering team
2. Document: root cause, timeline, effectiveness of response, missed detection opportunities
3. Identify and prioritize remediation actions (patches, configuration changes, process improvements)
4. Update this Incident Response Plan if any steps were ineffective
5. Provide the affected district with a written summary of findings and remediation actions taken

---

## 9. Contact Information

**Noverta Security Incident Hotline:** [PHONE NUMBER]
**Security Email:** [SECURITY EMAIL]
**Response SLA:** P1 incidents — acknowledged within 1 hour, 24/7. P2 incidents — acknowledged within 4 hours.

---

*This document is an internal operational outline and does not constitute legal advice. Noverta recommends that districts consult with legal counsel to ensure their own incident response obligations are satisfied.*
