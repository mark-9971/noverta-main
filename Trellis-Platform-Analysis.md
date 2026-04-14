# Trellis Platform Analysis: PowerSchool Replacement Roadmap

## 1. Executive Verdict

Trellis is a strong demo-quality special education workflow tool with real clinical depth (FBA/FA/BIP, ABA data collection, service minute compliance, restraint/seclusion tracking). It has genuine product differentiation in the SPED/therapeutic school niche. However, it is **not remotely ready for real student data today**.

The gap is not feature depth — it is infrastructure. There is no authentication, no authorization enforcement on the API, no audit logging, no data access controls, no parent portal, and no SSO. Every API endpoint is publicly accessible to anyone who can reach the server. This is not a security weakness — it is the complete absence of a security layer.

The good news: the clinical and compliance feature set is legitimately strong, and the architecture (monorepo, Drizzle ORM, Express, React) is sound enough to build production infrastructure on top of without a rewrite.

---

## 2. Can This Replace PowerSchool Today?

**No. Not even close.**

Not because the features are wrong, but because:

1. **Zero authentication.** Anyone with the URL can read and write all student data. No login exists.
2. **Zero API authorization.** Every endpoint is publicly accessible. No middleware checks who is making the request.
3. **Zero audit trail.** No record of who viewed, created, modified, or deleted any record.
4. **No parent/guardian model.** Parent info is three flat fields on the student record.
5. **No attendance system.** The most fundamental SIS function does not exist.
6. **No enrollment history.** No tracking of enrollment dates, withdrawals, transfers, or historical placement.
7. **No grading periods.** The semester field is hardcoded to "2025-2026".
8. **No FERPA controls.** No concept of data access permissions, minimum necessary access, or consent records.

### What It Could Replace First

Trellis could credibly replace these **specific PowerSchool modules** for a therapeutic/SPED school:

- **IEP tracking and compliance monitoring** — already strong
- **Service minute delivery tracking** — already strong
- **ABA/behavior data collection** — FBA/FA/BIP module is clinical-grade
- **Restraint/seclusion incident reporting** — comprehensive, MA DESE compliant
- **Progress reporting for IEP goals** — functional

### What It Absolutely Cannot Replace Yet

- Student information system (enrollment, demographics, legal records)
- Attendance
- Scheduling / master schedule builder
- Report cards / transcripts
- Parent portal
- State reporting (SIMS, SCS, DESE submissions)
- Any function requiring authentication or data access controls

### Most Realistic First Target

**A private therapeutic day school (30-150 students) that contracts with public school districts to serve students with intensive SPED needs.**

Why:
- These schools have extreme pain around IEP compliance, service minutes, behavior data, and restraint reporting
- They often use cobbled-together systems (spreadsheets, paper, or clunky legacy tools)
- They typically do NOT need full SIS functions (the sending district keeps the official record)
- They have BCBA/clinical staff who would immediately value the FBA/BIP/ABA tools
- Regulatory burden is high (603 CMR 28.00 and 46.00) and Trellis already addresses this
- Staff size is small enough for manual account provisioning initially
- Parent communication needs are high but can start with email-based workflows

**Not realistic first targets:** Public school districts (too much SIS dependency), large charter networks (need state reporting), mainstream K-12 (Trellis has no general education value proposition currently).

---

## 3. Most Realistic Market Entry Point

**Collaborative/therapeutic day school SPED compliance platform.**

Position as: "The compliance and clinical platform your SPED school actually needs — IEP tracking, service minutes, behavior data, FBA/BIP, restraint reporting, all in one place."

Do NOT position as a PowerSchool replacement. Position as the clinical/compliance layer that replaces spreadsheets, binders, and disconnected tools. The SIS conversation comes later.

---

## 4. Gap Analysis by Category

### A. Core SIS / System-of-Record Requirements

| Requirement | What a Real SIS Does | What Trellis Does | Gap Severity | Gap Type |
|---|---|---|---|---|
| Student legal identity | SSN (encrypted), state student ID, legal name vs preferred name, gender, race/ethnicity, citizenship, birth certificate data | firstName, lastName, dateOfBirth, externalId, grade | **Critical** | Product |
| Enrollment history | Date-stamped enrollment/withdrawal/transfer records per school, with reason codes | Single `status` field ("active"), no history | **Critical** | Product |
| Attendance | Daily and period-by-period attendance with absence types, tardies, excused/unexcused | **Does not exist** | **Critical** | Product |
| Guardians / family | Separate guardian entity with custody flags, relationship type, multiple guardians per student, household groupings | Three flat text fields on student record | **Critical** | Product + Architecture |
| Emergency contacts | Prioritized contact list with relationship, phone, authorized-for-pickup flags | parentGuardianName, parentEmail, parentPhone only | **Severe** | Product |
| Medical alerts | Allergies, medications, conditions, care plans, nursing notes | Not tracked (only incident-related medical fields) | **Severe** | Product |
| Discipline records | Incident types, actions taken, suspensions, expulsions, state reporting codes | Restraint incidents only (strong for that, but no general discipline) | **Moderate** | Product |
| Transcripts / report cards | Cumulative GPA, credits earned, course history, official transcript generation | No transcript system | **Severe** | Product |
| Grading periods | Quarter/trimester/semester definitions with date ranges, per school | Hardcoded semester string "2025-2026" | **Severe** | Product |
| Course catalog / sections | Master schedule, course codes, credit hours, prerequisites | Basic `classes` table with subject and course_code | **Moderate** | Product |
| Staff directory | Employment status, credentials, certifications, hire date | firstName, lastName, email, role, title, qualifications, status | **Moderate** | Product |
| Audit trail | Every create/update/delete logged with user ID, timestamp, old/new values | **Does not exist** | **Critical** | Architecture + Security |
| Withdrawals / transfers | Date-stamped records with reason codes, receiving school | Not tracked | **Severe** | Product |

### B. Special Education / Therapeutic School Requirements

| Requirement | What Trellis Does | Gap | Severity |
|---|---|---|---|
| IEP goal tracking | Strong — goals, baselines, progress, auto-suggestions | Missing: benchmark objectives, short-term objectives | Low |
| Service minute compliance | Strong — requirements vs delivered, compliance alerts | Functional and good | **None** |
| ABA/behavior data collection | Strong — behavior targets, program targets, data sessions, trends | Missing: interobserver agreement (IOA) | Low |
| FBA / Functional Analysis | Strong — full FBA workflow, ABC data, FA multi-element graph | Complete | **None** |
| BIP | Strong — auto-generated from FBA, editable, function-specific | Missing: fidelity checks | Low |
| Restraint / seclusion | Comprehensive — MA DESE compliant, signatures, parent notification | Best-in-class for this app | **None** |
| Progress reporting | Functional — auto-generates from data, period-based | Missing: parent-facing delivery mechanism | Moderate |
| Clinical notes | Session notes exist on service logs | Missing: separate clinical notes module, treatment plan notes | Moderate |
| Related services | Tracked via service types and requirements | Functional | Low |
| Family communication | Parent contact log exists | Missing: parent portal, messaging, document delivery | **Severe** |
| Compliance alerts | Auto-generated alerts for service gaps | Functional | Low |

### C. Parent / Guardian Portal Requirements

| Requirement | Current State | Gap Severity |
|---|---|---|
| Parent login | **Does not exist** | **Critical** |
| Linked students | Three text fields on student record | **Critical** |
| Permissions by guardian type | No guardian entity at all | **Critical** |
| View grades/attendance/behavior | No parent-facing views | **Critical** |
| Incident notifications | Manual only (no parent accounts to notify) | **Severe** |
| Document delivery | Restraint notification PDFs exist but manual delivery | **Severe** |
| E-signatures | Not implemented | **Severe** |
| Messaging | Parent contact log is staff-facing only | **Severe** |
| Language preferences | Not tracked | Moderate |

### D. Enterprise / District Requirements

| Requirement | Current State | Gap Severity |
|---|---|---|
| SSO | **Does not exist** | **Critical** |
| Role-based access control | Frontend role switching only. API has zero enforcement | **Critical** |
| Audit logging | **Does not exist** | **Critical** |
| Data encryption at rest | Relies on PostgreSQL/hosting provider defaults | Moderate |
| Multi-campus support | District → School hierarchy exists and works | Low |
| Import/export | CSV import for students, services, sessions. CSV export for reports | Moderate |
| API integration readiness | REST API exists but no API keys, rate limiting, or versioning | **Severe** |
| School-year rollover | Not implemented | **Severe** |
| State reporting | Not implemented (SIMS, SCS, DESE) | **Severe** |

---

## 5. FERPA-Safe / School-Safe Design Blueprint

### Authentication Architecture

**Current state:** No authentication. The "role switcher" in the sidebar is a demo UI feature. The API server accepts all requests without checking identity.

**Minimum acceptable (Stage 1):**
- Email/password login for staff accounts with bcrypt password hashing
- Session-based auth with HTTP-only secure cookies
- Auth middleware on every API route
- Password minimum 12 characters, complexity requirements
- Account lockout after 5 failed attempts
- Session timeout after 30 minutes of inactivity
- Forced password change on first login

**Strong implementation (Stage 2+):**
- SSO via Google Workspace for Education / Microsoft Entra (OIDC)
- MFA via TOTP (Google Authenticator) or WebAuthn
- Separate auth flows for staff vs parent accounts
- JIT provisioning from IdP
- Session revocation on role/permission change
- Device trust / IP allowlisting for admin functions

**What to build now:** Staff email/password auth + session middleware + forced HTTPS. SSO can come after.

### Role-Based Access Control (RBAC)

**Current state:** Roles exist as strings on the staff table and in a frontend context. Zero enforcement on API endpoints.

**Required design:**

```
Tables needed:
- users (id, email, password_hash, role, status, mfa_secret, last_login, created_at)
- user_sessions (id, user_id, token_hash, ip_address, user_agent, expires_at, created_at)
- permissions (id, role, resource, action, scope)
- audit_logs (id, user_id, action, resource_type, resource_id, old_values, new_values, ip_address, created_at)
```

**Permission model:**
- Admin: full read/write across their school(s)
- BCBA/Clinical: read/write on assigned students' clinical data
- Teacher/Provider: read/write on assigned students' service data
- Para: read-only on assigned students, write on data collection
- Parent: read-only on linked students, filtered views (no clinical notes, no staff-only fields)

**API enforcement:** Every route must check `req.user.role` and `req.user.schoolId` against the requested resource. No data should cross school boundaries without explicit district-admin authorization.

### Audit Trail

**Current state:** Does not exist.

**Minimum acceptable:**
- Every create, update, and delete operation logs: who, when, what changed, from what IP
- Audit log table is append-only (no updates or deletes permitted)
- Audit logs retained for 7 years minimum (FERPA requirement)
- Admin UI to search audit logs by user, student, date range, action type

**Schema:**
```
audit_logs:
  id: serial PK
  user_id: integer (who)
  action: text (create/update/delete/view/export)
  resource_type: text (student/session/fba/bip/restraint_incident)
  resource_id: integer
  old_values: jsonb (null for creates)
  new_values: jsonb (null for deletes)
  ip_address: text
  user_agent: text
  created_at: timestamp
```

### Data Access Controls

- Staff can only see students in their school(s)
- Providers can only see students on their caseload
- Clinical notes (FBA hypothesis narratives, BIP crisis plans) are restricted to clinical staff
- Parent views filter out: staff-only notes, clinical hypotheses, internal incident details, other students' data
- Export functions require admin role
- Bulk data access (CSV export, API list endpoints) log the access event

### Encryption & Secrets

- **In transit:** TLS/HTTPS required. Replit handles this for hosted deployments.
- **At rest:** PostgreSQL transparent data encryption. Sensitive fields (SSN if ever stored, medical data) should use application-level encryption with key rotation.
- **Secrets management:** DATABASE_URL, SESSION_SECRET already in environment variables. Add: encryption keys, SMTP credentials, SSO client secrets. Never in code.

### Environment Separation

- Production database must never be accessible from development
- Demo/seed data must never contain real student information
- Error messages in production must not leak schema details or stack traces (already implemented in app.ts error handler)
- Logging must redact student PII from log output

---

## 6. Parent Login / Guardian Portal Product Spec

### Data Model Changes

**New tables required:**

```
guardians:
  id: serial PK
  first_name: text
  last_name: text
  email: text (unique, used for login)
  phone: text
  preferred_language: text (default 'en')
  notification_preferences: jsonb
  status: text (active/inactive/invited)
  password_hash: text
  mfa_enabled: boolean
  last_login: timestamp
  created_at, updated_at: timestamp

student_guardians:
  id: serial PK
  student_id: integer FK -> students
  guardian_id: integer FK -> guardians
  relationship: text (mother/father/guardian/foster parent/emergency contact)
  is_primary: boolean
  has_custody: boolean (default true)
  can_view_academics: boolean (default true)
  can_view_behavior: boolean (default true)
  can_view_clinical: boolean (default false)
  can_receive_notifications: boolean (default true)
  can_sign_documents: boolean (default true)
  restricted: boolean (default false — for court-ordered restrictions)
  notes: text
  created_at: timestamp

guardian_documents:
  id: serial PK
  guardian_id: integer FK
  student_id: integer FK
  document_type: text (progress_report/iep/incident_notice/consent_form)
  title: text
  file_path: text
  requires_signature: boolean
  signed_at: timestamp
  signature_ip: text
  created_at: timestamp

guardian_messages:
  id: serial PK
  guardian_id: integer FK
  student_id: integer FK
  staff_id: integer FK (null for system messages)
  direction: text (inbound/outbound)
  subject: text
  body: text
  read_at: timestamp
  created_at: timestamp
```

### Authentication Flow

1. **Invitation:** Staff creates guardian record and sends email invitation with secure token
2. **Account setup:** Guardian clicks link, sets password, optionally enables MFA
3. **Login:** Email + password, session cookie, 30-minute timeout
4. **Password reset:** Email-based reset token, 1-hour expiry
5. **Multiple children:** One guardian account linked to multiple students via student_guardians
6. **Restricted access:** If `restricted = true`, guardian sees nothing for that student. If `has_custody = false`, limited view (no address, no pickup authorization)

### What Parents Should See

- **Student overview:** Name, grade, school, case manager name
- **IEP progress summary:** Goal names, current progress rating, last data point date (NOT raw clinical data)
- **Service delivery summary:** Service types, hours delivered this period vs required (NOT session-level notes)
- **Attendance summary:** Present/absent/tardy counts (when attendance module exists)
- **Behavior summary:** Number of incidents this period, severity distribution (NOT operational definitions or ABC data)
- **Restraint/seclusion notices:** Notification letters with acknowledgment tracking
- **Documents:** IEP documents, progress reports, consent forms requiring signature
- **Messages:** Communication thread with school staff
- **Announcements:** School-wide and class-level announcements

### What Parents Should NOT See

- FBA hypothesis narratives and raw ABC observation data
- BIP crisis plans (these contain staff response protocols)
- Staff-only notes on any record
- Other students' data (obvious but must be enforced at API level)
- Clinical session notes from providers
- Internal compliance alerts
- Staff directory details beyond their child's team
- Raw behavior data collection (frequency counts, interval data)

### Implementation Priority

1. Guardian and student_guardians tables + API
2. Guardian invitation and account creation flow
3. Auth middleware with guardian role type
4. Parent dashboard page (summary view)
5. Document delivery and acknowledgment
6. Messaging
7. E-signature workflows

---

## 7. SSO / Identity Architecture Plan

### Recommended Approach

**Phase 1 (immediate):** Local email/password auth for staff. This unblocks everything.

**Phase 2:** Google Workspace for Education OIDC. This is the single most requested SSO in K-12. Implementation:
- Use `passport-google-oauth20` or a managed provider (Clerk, Auth0)
- Map Google Workspace domain to school/district
- JIT provision user on first login if email matches a staff record
- Staff must exist in the system before SSO works (no self-registration)

**Phase 3:** Microsoft Entra ID (Azure AD) OIDC. Same pattern as Google. Many districts use Microsoft 365 for Education.

**Phase 4:** SAML 2.0 support. Required for enterprise district sales. Use `passport-saml` or a managed provider that handles SAML.

### Identity Architecture

```
users:
  id: serial PK
  email: text UNIQUE
  password_hash: text (null if SSO-only)
  auth_provider: text (local/google/microsoft/saml)
  auth_provider_id: text (external IdP user ID)
  staff_id: integer FK -> staff (null for parent accounts)
  guardian_id: integer FK -> guardians (null for staff accounts)
  role: text (admin/bcba/provider/teacher/para/parent)
  status: text (active/invited/disabled)
  mfa_enabled: boolean
  mfa_secret: text
  last_login: timestamp
  created_at, updated_at: timestamp
```

**Key decisions:**
- Separate `users` table from `staff` and `guardians` — the user account is an identity concern, staff/guardian records are domain data
- Support account linking: a user can have both a local password and an SSO provider
- Staff accounts are pre-provisioned; SSO links on first login
- Parent accounts are invitation-based; SSO is optional enhancement
- Role comes from the application, not the IdP (IdP says "this is a valid staff member at your school," Trellis assigns the role)

### What to Avoid

- Do not use the IdP as the source of truth for roles/permissions
- Do not allow self-registration for any account type
- Do not store SSO tokens in localStorage
- Do not use JWTs as the primary session mechanism (use HTTP-only cookies)
- Do not build your own SAML parser — use a library or managed service

### Recommended Path

The easiest enterprise-credible path for this stack: **Clerk** (already available as a Replit integration). It handles email/password, Google, Microsoft, SAML, MFA, session management, and webhook-based provisioning. It eliminates the need to build password hashing, reset flows, MFA, and token management from scratch.

---

## 8. Staged Roadmap to PowerSchool Replacement

### Stage 0: Current App Reality

**What it is:** A richly-featured demo/internal tool with strong SPED clinical workflows but zero security infrastructure.

**Cannot be used with real student data.** Not because of features, but because of the complete absence of authentication, authorization, and audit controls.

### Stage 1: Credible Therapeutic-School Internal Platform

**What must be true:**
- Staff authentication (login required, sessions, password policy)
- API authorization middleware (every route checks auth)
- Role-based access control enforced on backend
- Audit logging for all write operations
- HTTPS enforced
- Remove demo role-switcher; replace with real login
- School-scoped data isolation
- Basic backup strategy

**Features required (already built):**
- Dashboard, student management, service minutes
- FBA/FA/BIP workflow
- ABA/behavior data collection
- Restraint/seclusion reporting
- IEP goal tracking and progress reporting
- Compliance alerts
- Staff directory

**Features required (must add):**
- Daily attendance tracking
- Guardian data model (separate table, not flat fields on student)
- Basic parent notification via email (not a portal yet)

**Timeline estimate:** 4-6 weeks of focused engineering

**Risks:** Without auth, this cannot be piloted at any school.

### Stage 2: Parent-Capable Secure Platform

**What must be true:**
- Everything from Stage 1
- Guardian entity and student-guardian relationships
- Parent invitation and account creation
- Parent portal with summary views
- Document delivery (progress reports, IEP documents, restraint notices)
- E-signature/acknowledgment tracking
- Messaging between parents and staff
- Parent access restrictions enforced at API level

**Timeline estimate:** 6-8 weeks after Stage 1

**Risks:** Parent-facing surfaces multiply the security attack surface. Thorough access control testing is critical.

### Stage 3: Small-School System of Record

**What must be true:**
- Everything from Stage 2
- Full enrollment history (admission, withdrawal, transfer tracking)
- Attendance system (daily + by period)
- Grading periods with date ranges
- Report cards / progress reports generation
- Course catalog and scheduling
- Medical alerts and allergy tracking
- Emergency contact list (multiple per student)
- School-year rollover process
- Data retention policies
- SSO (Google Workspace minimum)
- Import from existing SIS (Aspen, PowerSchool CSV export)

**Timeline estimate:** 3-4 months after Stage 2

**Risks:** Becoming a system of record means data integrity requirements are absolute. Need automated backups, point-in-time recovery, and migration tooling.

### Stage 4: District-Capable SIS Alternative

**What must be true:**
- Everything from Stage 3
- Multi-school district management
- District-level reporting and aggregation
- SAML SSO for enterprise districts
- State reporting integration (MA SIMS, SCS)
- Transcript generation
- Staff credentialing and certification tracking
- Formal API with versioning, rate limiting, API keys
- SOC 2 Type I compliance (or equivalent security audit)
- Data processing agreement (DPA) template
- Uptime SLA

**Timeline estimate:** 6-12 months after Stage 3

**Risks:** This is a different business, not just a bigger app. Requires support infrastructure, implementation services, and sales process.

### Stage 5: Realistic PowerSchool Competitor

**What must be true:**
- Everything from Stage 4
- Multi-state compliance (not just Massachusetts)
- Full master schedule builder
- Discipline management system
- Transportation integration
- Health office module
- 504 plan tracking alongside IEP
- Special education billing integration (Medicaid)
- Professional development tracking
- Custom report builder
- Mobile app for staff and parents
- LMS integration (Google Classroom, Canvas)
- EdFi API compliance
- SOC 2 Type II
- VPAT / Section 508 accessibility compliance
- 99.9% uptime SLA

**This is a 2-3 year journey from Stage 4.** It requires a team, not a solo effort.

---

## 9. Engineering Blueprint

### Recommended Architecture Changes

1. **Add a `users` table** — separate from `staff` and `guardians`. Holds auth credentials, session references, and links to domain entities.

2. **Add auth middleware** — Express middleware that validates session cookie on every `/api` route. Returns 401 if no valid session. Attaches `req.user` with role, userId, schoolId.

3. **Add RBAC middleware** — Per-route permission checks: `requireRole('admin', 'bcba')`, `requireStudentAccess(studentId)`.

4. **Add audit log table and middleware** — Drizzle-level hooks or Express middleware that logs every write operation with user context.

5. **Add guardian tables** — `guardians`, `student_guardians` with relationship/custody/permission flags.

6. **Add attendance tables** — `attendance_records` with student, date, period, status, notes.

7. **Add enrollment history** — `enrollment_events` with student, school, date, event_type (enrolled/withdrawn/transferred), reason.

### Database Schema Additions Needed

**Priority 1 — Security (must build immediately):**
```
users, user_sessions, audit_logs, permissions
```

**Priority 2 — Parent capability:**
```
guardians, student_guardians, guardian_documents, guardian_messages
```

**Priority 3 — SIS foundation:**
```
attendance_records, enrollment_events, grading_periods,
emergency_contacts, medical_alerts, discipline_incidents
```

### Notification Infrastructure

- Email: Use a transactional email service (Resend, Postmark, or SendGrid)
- Templates: Progress report delivery, restraint notification, parent invitation, password reset
- Job queue: For async email sending, report generation, nightly compliance checks
- Consider: Bull/BullMQ with Redis for job queues, or a simpler cron-based approach initially

### Testing Strategy

- **Unit tests:** Zod schema validation, permission logic, minute calculation
- **Integration tests:** API routes with auth context, RBAC enforcement
- **E2E tests:** Login flow, parent portal access, role-based view filtering
- **Security tests:** Unauthorized access attempts, cross-school data leakage, SQL injection, XSS
- **Penetration testing:** Before any real school pilot

---

## 10. Prioritized Build Plan

### 1. Must Build Immediately to Become School-Safe

These are non-negotiable before any real student data touches the system:

1. **Users table and password auth** — email/password login, bcrypt hashing, session cookies
2. **Auth middleware on all API routes** — 401 for unauthenticated requests
3. **RBAC enforcement** — role checked on every route, school-scoped data access
4. **Audit log table and write hooks** — who changed what, when, from where
5. **Remove demo role-switcher** — replace with real login page
6. **Rate limiting on auth endpoints** — prevent brute force
7. **Security headers** — helmet.js, CSRF protection, strict CORS
8. **Session management** — timeout, forced logout, concurrent session limits
9. **Guardian data model** — separate guardians table, student-guardian relationships
10. **Daily attendance tracking** — basic present/absent/tardy per day

### 2. Must Build to Support Parent Login

11. Parent invitation flow (email with secure link)
12. Guardian account creation (set password, link to student)
13. Parent auth middleware (separate from staff auth)
14. Parent dashboard (summary views, not raw data)
15. Document delivery and acknowledgment tracking
16. Parent messaging (threaded conversations with staff)
17. Incident notification delivery (restraint notices)
18. Access restriction enforcement (custody flags, restricted guardians)

### 3. Must Build to Support SSO

19. SSO integration (Google Workspace for Education via OIDC)
20. Account linking (SSO identity → existing staff user)
21. JIT provisioning (first login creates session, links to staff record)
22. Microsoft Entra ID support
23. SAML 2.0 support (for enterprise district sales)

### 4. Must Build to Become a Real System of Record

24. Enrollment history tracking (admit/withdraw/transfer events)
25. Grading periods with date ranges
26. School-year rollover process
27. Emergency contact list (multiple per student)
28. Medical alerts and allergy tracking
29. Report card generation
30. Transcript generation
31. State reporting exports (MA SIMS format)
32. Automated database backups with point-in-time recovery

### 5. Must Build to Replace PowerSchool Functions

33. Master schedule builder
34. Full discipline management (beyond restraint/seclusion)
35. Course catalog with prerequisites and credits
36. Staff credentialing and certification tracking
37. Custom report builder
38. API versioning and external API keys
39. LMS integration (Google Classroom sync)
40. Mobile app (React Native / Expo)

### 6. Nice-to-Have Later

41. Medicaid billing integration
42. Transportation management
43. Health office module
44. 504 plan tracking
45. Professional development tracking
46. Multi-state compliance
47. Custom form builder
48. Advanced analytics / data warehouse

---

## 11. What to Stop Claiming Until These Pieces Exist

| Claim | Required to Make It True |
|---|---|
| "FERPA compliant" | Auth + RBAC + audit logging + data access controls + encryption + backup |
| "School-safe" | Auth + RBAC + audit logging (minimum) |
| "Parent portal" | Guardian data model + parent auth + parent-facing views + access restrictions |
| "System of record" | Enrollment history + attendance + grading periods + audit trail |
| "PowerSchool replacement" | Everything through Stage 3, at minimum |
| "Enterprise ready" | SSO + SOC 2 + DPA + SLA + state reporting |
| "District capable" | Multi-school RBAC + district reporting + SAML SSO + state reporting |

**What you CAN credibly claim today (with the pending features complete):**

- "Purpose-built SPED compliance platform for therapeutic schools"
- "IEP service minute tracking with automated compliance alerts"
- "Clinical-grade FBA/FA/BIP workflow with data-driven behavior analysis"
- "MA 603 CMR 46.00 compliant restraint/seclusion reporting"
- "ABA data collection with program mastery tracking"

These are genuinely strong claims. Lead with them. The clinical depth is real — the infrastructure just needs to catch up.
