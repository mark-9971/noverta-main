# Noverta Pilot — Known Limitations & Beta Disclosure

**Version:** 1.0  
**Date:** April 15, 2026

This document must be reviewed and acknowledged by the district administrator before any student data is entered into the system. It is written in plain language and is not a legal contract.

---

## What "Beta" Means

Noverta is a working product used by a small number of pilot districts. It is not a completed, enterprise-certified SIS. Some parts of the software are stable and well-tested. Others are in active development and may change, break, or be removed. This document tells you which is which.

---

## What Is Stable (Pilot Scope)

The following modules have been manually tested and are considered reliable for daily use:

- Student roster and IEP document timeline
- Service session logging and minutes tracking
- Annual review compliance calendar and alerts
- Restraint/seclusion incident reporting
- Team meeting and consent tracking
- Parent contact log
- CSV and PDF compliance exports

These features may still have bugs. When they do, we will fix them. See the [Support Process](./support-process.md) for response times.

---

## What May Change

- **UI and navigation** may change during the pilot as we improve the product based on feedback.
- **Export formats** (CSV column order, PDF layout) may change. Column names will remain consistent within the pilot period.
- **Alert thresholds** (e.g., 30-day IEP advance warning) are configurable and may be adjusted.
- Any feature outside the [Pilot Scope](./scope.md) is experimental and may be removed or significantly changed without notice.

---

## Known Limitations

| Area | Limitation |
|---|---|
| **Email notifications** | Automated email delivery is available but not yet fully tested for all alert types. Some alerts are in-app only. |
| **SIS sync** | There is no guaranteed integration with your existing student information system. Student data must be entered manually or via CSV import. |
| **Document signing** | Electronic document signatures are available but not yet legally validated for Massachusetts DESE submissions. Do not use in-app signatures as a substitute for compliant IDEA consent documentation. |
| **Offline access** | Noverta is a web application and requires internet access. There is no offline mode. |
| **File attachments** | File upload is not yet available for IEP documents. Noverta tracks IEP metadata; actual PDF documents are stored outside the system. |
| **DESE direct submission** | Noverta does not currently submit data directly to DESE. The incident and IEP exports are designed to match DESE report formats for manual submission. |
| **Multi-district staff** | Staff members who work across districts are not yet fully supported. Each account belongs to one district. |

---

## Data Backups and Recovery

- **Daily backups:** The Noverta database is backed up automatically every 24 hours. Backups are retained for 7 days.
- **Recovery point objective (RPO):** In the event of data loss, we can restore to within 24 hours of the last backup. Up to 24 hours of data may be unrecoverable in a worst-case scenario.
- **Recovery time objective (RTO):** In the event of a full system outage, we target restoration within 4 hours during business hours.
- **Your responsibility:** Noverta is not a system of record for official IDEA documentation. Your district's paper IEPs and official DESE submissions remain your primary compliance record. Use Noverta as a tracking and workflow layer on top of your existing records.

---

## What Happens If Noverta Is Down for 24 Hours

1. All compliance tracking reverts to your existing manual process temporarily.
2. Noverta will notify the district admin by email as soon as an outage is detected (target: within 30 minutes).
3. If service is not restored within 4 hours, Noverta will provide an estimated restoration time.
4. When service is restored, no data entered into the system before the outage is lost (subject to the 24-hour RPO above).
5. If an outage causes you to miss a DESE reporting deadline, contact us immediately. We will provide a written incident summary you can share with DESE if needed.

---

## Acknowledgment

By proceeding with the Noverta pilot, the district administrator acknowledges that:

1. They have read this document.
2. They understand that Noverta is a pilot product with known limitations.
3. Their district's official IEP records and DESE submissions remain maintained outside of Noverta.
4. They understand the data backup and recovery limits described above.

**District Administrator Name:** ________________________________

**Signature:** ________________________________

**Date:** ________________________________
