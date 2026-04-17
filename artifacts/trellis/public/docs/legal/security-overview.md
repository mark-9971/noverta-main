# Security Overview

**Trellis — Security Architecture Overview**
*For district IT directors, privacy officers, and security reviewers*
*Last updated: [DATE]*

---

## Summary

Trellis is a web-based SaaS platform hosted on Replit's cloud infrastructure in the United States. It uses industry-standard controls for authentication, authorization, encryption, and audit logging. This document describes the security architecture as of the current production deployment.

---

## 1. Hosting Environment

- **Provider:** Replit (cloud-hosted, US region)
- **Database:** PostgreSQL (Neon, US-based managed service)
- **Network:** All traffic routed through Replit's infrastructure with TLS termination at the edge
- **Data residency:** All data stored and processed within the United States

Replit maintains infrastructure-level security controls including physical security at data centers, network isolation, and DDoS mitigation. Trellis is responsible for application-layer security described in this document.

---

## 2. Encryption

### In Transit
- All communication between clients (browser) and the Trellis application server uses **TLS 1.2 or higher**
- The Replit proxy enforces HTTPS; plain HTTP connections are not accepted
- API communication between frontend and backend travels over the same TLS-protected channel

### At Rest
- The PostgreSQL database is hosted on Neon, which provides **encryption at rest** for all stored data using AES-256
- No student or staff PII is stored in application logs, environment variables, or configuration files

---

## 3. Authentication

Authentication is handled by **Clerk**, a managed identity platform:

- Users log in with email + password or via SSO (if configured by the district)
- Clerk issues short-lived **JSON Web Tokens (JWTs)** that expire after **8 hours** by default (target session window for school-day use)
- Sessions are managed server-side; tokens are verified on every authenticated API request
- Clerk supports **multi-factor authentication (MFA)** — districts can enforce MFA for all users through their Clerk organization settings
- Password hashing is managed by Clerk using bcrypt with appropriate work factors
- No passwords are stored in the Trellis database

---

## 4. Role-Based Access Control (RBAC)

Access to data is enforced at the API layer, not only in the UI:

- Eight defined roles: **admin, coordinator, case_manager, bcba, sped_teacher, provider, para, sped_student**
- Every API endpoint requires authentication and checks the caller's role before returning data
- In production, the user's `districtId` is extracted from their authenticated token and applied to all database queries — a user cannot request data from another district by crafting a request
- Sensitive endpoints (workload summaries, uncovered sessions, student exports) are restricted to admin and coordinator roles

---

## 5. Tenant Isolation

Trellis is a multi-tenant platform. Each school district is a separate tenant:

- Every database record that belongs to a district is linked to that district via a `school_id` or cascading FK chain to `schools → districts`
- In production, the `enforceDistrictScope` middleware reads the authenticated user's district from their Clerk token and overwrites any client-supplied district parameter, preventing cross-tenant data access through query-string manipulation
- There is no shared session state between districts

---

## 6. Session Management

- Browser sessions use Clerk's managed session cookies with `HttpOnly` and `Secure` flags
- Session tokens expire after 8 hours of inactivity (school-day session window; configurable by district admin via Clerk settings)
- Sign-out invalidates the session server-side via Clerk's session revocation API
- There is no "remember me" persistent session by default

---

## 7. Audit Logging

All significant data operations generate an entry in the `audit_logs` table:

- Actor (user ID, display name, role)
- Action type (create, update, delete, export, login)
- Record type and record ID affected
- Timestamp (UTC)
- IP address of the request (where available)

Audit logs are append-only — they are not editable or deletable by application users. Admins can view and export the audit log from the Admin section of the application.

---

## 8. Vulnerability Management

- Application dependencies are tracked and updated on a regular basis
- The codebase is scanned for known vulnerabilities using dependency audit tooling
- SAST (static application security testing) is run as part of the development workflow
- A secret scanning step checks for inadvertently committed credentials before deployment

---

## 9. Error Monitoring

Application errors are monitored via **Sentry** (when enabled):

- Error reports include stack traces and request context; they are configured to **exclude PII** from error payloads
- Sentry alerts the engineering team of high-severity errors in real time
- Error counts are surfaced on the System Status page for district admins to view

---

## 10. Employee Access Controls

Trellis limits internal access to production systems:

- Production database access requires individual authenticated credentials — no shared root passwords
- Trellis employees do not routinely access district data; access is logged when it occurs for support purposes
- All Trellis engineers are subject to confidentiality obligations

---

## 11. What This Document Does Not Cover

- **SOC 2 certification:** Not yet obtained. Trellis plans to pursue SOC 2 Type II as the product scales.
- **HIPAA:** FERPA (not HIPAA) governs student education records. Trellis does not process Protected Health Information (PHI) as defined by HIPAA.
- **Penetration testing:** Not yet performed on the current production environment. Planned before enterprise deployment.

---

## Questions and Security Contact

To report a security vulnerability or request additional security documentation:

**Security Contact:** [SECURITY EMAIL]
**Response SLA:** Critical vulnerabilities acknowledged within 24 hours.
