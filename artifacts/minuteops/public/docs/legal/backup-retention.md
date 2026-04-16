# Backup and Data Retention Policy

**Trellis — Backup and Data Retention Policy**
*Last updated: [DATE]*

---

## Summary

This document describes how Trellis backs up district data, how long data is retained, and how districts can request data export or deletion.

---

## 1. Database Backup

### Backup Provider
The Trellis PostgreSQL database is hosted on **Neon** (managed PostgreSQL), which performs automated backups as part of the platform.

### Backup Frequency
- **Continuous WAL (Write-Ahead Log) streaming** with point-in-time recovery available for the previous 7 days
- **Daily snapshots** retained for **30 days**

### Backup Storage
- Backups are stored in encrypted storage in the same US-based region as the primary database
- Backups are encrypted at rest (AES-256) and are not accessible to application users

### Recovery
- In the event of data loss or corruption, Trellis can restore from backup to any point within the previous 7 days, or from a daily snapshot within the previous 30 days
- Recovery time objective (RTO): **4 hours** for full restoration
- Recovery point objective (RPO): **1 hour** maximum data loss

---

## 2. How to Request a Restore

If a district admin accidentally deletes data and needs it restored:

1. Submit a support request to **[SUPPORT EMAIL]** with the subject line: `Data Restore Request — [DISTRICT NAME]`
2. Include: the type of records affected, approximate date of deletion, and the district name
3. Trellis will confirm receipt within **1 business day** and complete the restore within **3 business days** if the data falls within the backup window

Note: Trellis provides a built-in "Recently Deleted" recovery page that allows admins to restore soft-deleted student and staff records within 90 days without needing to contact support.

---

## 3. Data Retention Policy

### Active Records
Records for active students, active staff, and all associated data (sessions, goals, evaluations, etc.) are retained for the lifetime of the district's active subscription.

### Withdrawn Students
Student records that have been marked as withdrawn are retained in the platform for **7 years** from the withdrawal date, consistent with Massachusetts record retention requirements for public school education records (603 CMR 23.00 and M.G.L. c. 71, § 34D).

After 7 years, withdrawn student records may be permanently deleted unless the district has placed a litigation hold.

### Staff Records
Staff records for departed employees are retained for **3 years** from their departure date.

### Audit Logs
Audit logs are retained for **7 years** and are not deletable by application users (they are append-only).

### Export History
State report export history and compliance report export records are retained for **7 years**.

---

## 4. Data Deletion Request Process

**Individual Record Deletion**
Any admin-role user can soft-delete individual student or staff records within the platform. Soft-deleted records are recoverable via the "Recently Deleted" page for 90 days, then permanently deleted automatically.

**District-Level Deletion (Subscription Termination)**
When a district's subscription is terminated:

1. The district has **90 days** to export all data using the built-in export tools
2. At the end of the 90-day window, Trellis will permanently delete all production data associated with the district
3. Backup copies will be purged within **90 days** after production deletion (following the natural backup expiry cycle)
4. Trellis will provide written confirmation of deletion upon request

**Early Deletion Request**
To request deletion of district data before subscription termination, submit a written request to **[SUPPORT EMAIL]**. Trellis will complete deletion within **30 days** of receiving a verified request from an authorized district representative.

---

## 5. Data Export

Districts can export their data at any time using the built-in reporting tools:

- **Student Minute Summary, Compliance Risk Report, Audit Package** — available on the Reports page (admin/coordinator/case_manager roles)
- **State Reporting exports** — available on the State Reports page
- **Session logs, IEP goals, student records** — exportable via the Reports page as CSV files

For a full database export (all tables), contact Trellis support. Full exports are provided within **10 business days** of a verified request.

---

## 6. Legal Holds

If a district notifies Trellis of pending litigation or a state compliance investigation involving specific student records, Trellis will place those records on a legal hold, suspending any automated deletion until the hold is lifted in writing by the district.

To place a legal hold: Email **[SUPPORT EMAIL]** with the subject line: `Legal Hold Request — [DISTRICT NAME]`.

---

## Questions

For questions about data retention or to request deletion or export:

**Trellis Support:** [SUPPORT EMAIL]
**Response SLA:** 1 business day acknowledgment; 10 business days for full requests.
