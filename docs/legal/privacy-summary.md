# Privacy Summary

**Trellis — Plain-Language Privacy Summary**
*For school districts, parents/guardians, and staff*
*Last updated: [DATE]*

---

## What is Trellis?

Trellis is a software platform used by school districts to manage special education services. It helps districts track IEP compliance, record therapy sessions, manage staff schedules, and generate required reports. Trellis is a tool for district staff — it is not a consumer product and is not marketed to individual families.

---

## What Data Does Trellis Collect?

Trellis collects only the data that district staff enter into the platform and data needed to operate the service. No data is collected from students' devices, browsing behavior, or sources outside the platform.

### Student Education Records
- Student name, grade, date of birth, disability category, and placement type
- IEP goals and service requirements (e.g., "60 minutes/month of speech therapy")
- Session logs: dates, times, duration, service type, staff, and notes
- Behavioral data entered by staff (behavior observations, program data)
- Evaluation and eligibility records
- Transition plans (for students 16 and older)
- Restraint and seclusion incident records
- Parent/guardian name, phone number, and email address

These records are **education records** protected by the Family Educational Rights and Privacy Act (FERPA). Trellis processes them as a "school official" under FERPA's legitimate educational interest exception.

### Staff Records
- Staff name, job title, role, and school assignment
- Schedule blocks and session records logged by staff
- Supervision session records (for BCBAs and their supervisees)

### Account and Usage Data
- Email address and name used to create a Trellis account (via Clerk authentication)
- Log-in times and session activity for security audit purposes

---

## How Is Data Used?

Trellis uses data **only** to provide services to the school district:

- To display student records, session history, and compliance status to authorized staff
- To calculate compliance metrics (minutes delivered vs. required)
- To generate reports for district administrators and state reporting submissions
- To enable staff workflows (scheduling, session logging, behavior assessment)
- To maintain an audit trail of changes for compliance and legal purposes

Trellis **does not**:
- Sell student or staff data to any third party
- Use student data for advertising or machine learning model training
- Share data with any party other than the contracted sub-processors listed in the DPA
- Transfer data outside the United States

---

## Who Can Access the Data?

Access is controlled by the district. Trellis enforces role-based permissions:

| Role | What They Can See |
|---|---|
| Admin / Coordinator | Full access to all district data |
| Case Manager | Their assigned students and all compliance data |
| BCBA | Behavior data, programs, supervision records |
| Provider / Teacher | Their assigned students' session and goal data |
| Paraprofessional | Their own schedule, assigned student targets for session logging |
| Student (sped_student) | Their own goals, sessions, and services only |

Trellis staff access district data **only** when the district submits a support request requiring it, and only for the minimum time needed to resolve the issue.

---

## How Long Is Data Retained?

- **Active student records:** Retained for the life of the district's subscription
- **Withdrawn students:** Records are retained for **7 years** from withdrawal date, consistent with Massachusetts record-keeping requirements for education records
- **Upon subscription termination:** Data is available for export for 90 days, then permanently deleted from production systems. Backups are purged within 90 days after that.

Details are in the Backup & Retention Policy.

---

## Parent and Guardian Rights (FERPA)

Parents and eligible students (age 18+) have the right to:

- **Inspect and review** their child's education records. Contact your district's special education office to make a formal records request.
- **Request amendment** of records they believe are inaccurate
- **Consent (or withhold consent)** to disclosure of records beyond what FERPA permits without consent

These rights are administered by the school district, not by Trellis. Trellis provides the district with tools to fulfill these obligations.

---

## Data Security

Trellis protects data using industry-standard controls described in the Security Overview document:
- All data is encrypted in transit (TLS) and at rest
- Authentication is handled by Clerk with session expiry controls
- Every data modification is logged in a tamper-evident audit trail
- Trellis notifies the district within 72 hours of any confirmed data breach affecting student records

---

## Contact

For questions about data processing or to request data deletion:

**Trellis Support**
Email: [SUPPORT EMAIL]
Address: [COMPANY ADDRESS]

For FERPA-related rights regarding your child's records:
Contact your school district's Special Education Director.
