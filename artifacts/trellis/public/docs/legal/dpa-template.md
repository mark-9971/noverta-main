# Data Processing Agreement (DPA) Template

**Version 1.0 — Template for Review by District Counsel**
*Last updated: [DATE]*

---

## Parties

This Data Processing Agreement ("Agreement") is entered into between:

**Trellis** ("Processor"), the provider of the Trellis special education compliance platform, and

**[DISTRICT NAME]** ("Controller"), a public school district located at **[DISTRICT ADDRESS]**, acting through its designee **[DISTRICT CONTACT NAME AND TITLE]**.

Together referred to as the "Parties."

---

## 1. Purpose of Processing

Trellis processes student education records and related personnel data solely for the purpose of enabling the District to:

- Track delivery of special education services mandated by Individualized Education Programs (IEPs)
- Monitor service minute compliance under IDEA and applicable state regulations
- Maintain records of staff schedules, absences, and coverage
- Conduct behavior assessments and maintain intervention plans
- Generate compliance reports and state-required data submissions
- Support case manager and service provider workflows

Trellis does not use student data for advertising, product improvement, or any commercial purpose unrelated to the District's contracted services.

---

## 2. Categories of Data Processed

Trellis may process the following categories of data on behalf of the District:

**Student Education Records (FERPA-protected):**
- Name, date of birth, grade, disability category, placement type
- IEP goals, service requirements, and session delivery records
- Behavioral data, functional behavior assessments, and behavior intervention plans
- Transition plans, evaluation records, and eligibility determinations
- Parent/guardian contact information
- Restraint and seclusion incident records

**Staff Records:**
- Name, role, contact email, qualifications, and assignment data
- Schedule blocks, absence records, and supervision session logs
- Compensation data (hourly rate / salary) if entered by the District

**District Administrative Data:**
- School year configurations, school records, agency contracts
- Compliance event records and audit logs
- IEP meeting attendance and consent records

---

## 3. Duration of Processing

Trellis will process data for the duration of the District's active subscription. Upon termination, Trellis will retain data for **90 days** to allow the District to export its records, after which data will be permanently deleted from production systems. Backup retention is described in the Backup & Retention Policy.

---

## 4. Sub-Processors

Trellis uses the following sub-processors to deliver its services. The District consents to their use under this Agreement:

| Sub-Processor | Role | Data Accessed | Location |
|---|---|---|---|
| Replit | Infrastructure / cloud hosting | All application data | United States |
| Neon / PostgreSQL | Database hosting | All structured data | United States |
| Clerk | Authentication and session management | User identity, session tokens | United States |
| Stripe | Payment processing (billing only) | Billing contact, subscription status — **no student data** | United States |
| Resend (if email enabled) | Transactional email delivery | Email addresses, notification content | United States |
| Sentry (if enabled) | Application error monitoring | Anonymized error traces; no PII in error payloads | United States |

Trellis will notify the District at least **30 days** before adding a new sub-processor. The District may object to a new sub-processor by providing written notice; if the Parties cannot reach agreement, either party may terminate the Agreement.

---

## 5. Data Subject Rights

Trellis will assist the District in fulfilling obligations to data subjects (students, parents/guardians, staff) under FERPA, including:

- **Right to access:** Trellis provides admin-level data export tools. The District remains responsible for responding to formal records requests.
- **Right to amendment:** Staff with appropriate permissions may correct records within the platform.
- **Right to deletion:** The District may request deletion of specific records through the platform or by submitting a written request to Trellis support. Trellis will complete deletion within **30 days** of a verified request.

---

## 6. Security Measures

Trellis maintains the technical and organizational security measures described in the Security Overview document, including:

- TLS 1.2+ encryption in transit for all data
- Encryption at rest for the PostgreSQL database
- Role-based access control (8 defined roles) enforced at the API layer
- Session management with time-limited tokens via Clerk
- Full audit logging of data access and modification events
- Tenant isolation: each district's data is logically isolated by district ID, enforced in production at the middleware level

Trellis will notify the District of any confirmed security incident that materially affects student education records within **72 hours** of discovery, consistent with FERPA breach notification requirements.

---

## 7. Deletion and Return of Data

Upon written request or upon termination of the Agreement:

1. Trellis will provide a full CSV export of the District's data within **10 business days**
2. Trellis will permanently delete production data within **30 days** of the export delivery
3. Backup copies will be purged within **90 days** consistent with the backup retention schedule
4. Trellis will provide written confirmation of deletion upon completion

---

## 8. Confidentiality

Trellis personnel with access to District data are subject to confidentiality obligations. Access is limited to personnel who need it to provide the contracted services or to respond to support requests authorized by the District.

---

## 9. Governing Law

This Agreement is governed by the laws of the Commonwealth of Massachusetts. Any disputes will be resolved in the courts of **[DISTRICT COUNTY]** County, Massachusetts.

---

## 10. Signatures

**On behalf of [DISTRICT NAME] (Controller):**

Name: ___________________________
Title: ___________________________
Date: ___________________________
Signature: ___________________________

**On behalf of Trellis (Processor):**

Name: ___________________________
Title: ___________________________
Date: ___________________________
Signature: ___________________________

---

*This template is provided for discussion and review by district counsel. It does not constitute legal advice. Districts should have this agreement reviewed by their legal counsel before signing.*
