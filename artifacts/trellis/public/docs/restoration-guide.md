# Restoring a District from an Archive ZIP

**Noverta — Manual Restoration Guide**

---

## Overview

When a district downloads its full archive from **Settings → Data & Privacy**, the resulting ZIP contains a CSV for every table in that district's data: districts, schools, students, IEPs, session logs, compliance records, documents, and more.

Noverta does **not** offer a one-click "restore from archive" button. Restoration is a **manual, supervised process** because:

- The order in which tables are re-imported matters — child rows reference parent rows by ID
- Auto-generated columns (primary keys, timestamps) must be regenerated, not preserved
- Tenant scoping (`district_id`) must match the destination district, which may be new
- Foreign key relationships must be re-mapped if the original IDs are no longer valid

For most districts the fastest, safest path is to **contact Noverta support** and we will run the restoration for you. The rest of this guide is for districts or partners who need to perform the restoration themselves.

---

## 1. Required Import Order

Re-import the CSVs in this exact order. Each step depends on the rows from previous steps already existing.

1. **`districts.csv`** — the district shell (skip if importing into an existing district)
2. **`schools.csv`** — schools belong to a district
3. **`staff.csv`** — staff (case managers, providers, paras, admins) belong to a district and reference a school
4. **`students.csv`** — students reference a school and (optionally) a case manager from staff
5. **`service_types.csv`** — the catalogue of service types used by IEPs and sessions
6. **`ieps.csv`** — IEPs reference a student
7. **`iep_goals.csv`** — goals reference an IEP
8. **`service_requirements.csv`** — minute requirements reference an IEP and service type
9. **`accommodations.csv`** — accommodations reference an IEP
10. **`session_logs.csv`** — sessions reference a student, staff member, and service type
11. **`documents.csv` / `iep_documents.csv`** — documents reference an IEP or student
12. **`compliance_*.csv`** — compliance snapshots, alerts, and timeline events reference students and IEPs
13. **`audit_log.csv`** — load last; references all of the above

If you skip a step, downstream imports for tables that reference it will fail with "foreign key not found" errors.

---

## 2. Columns to Omit

Before re-importing any CSV, **remove or blank these columns** so the database can regenerate them:

- **`id`** — primary keys are auto-incrementing and must be re-issued. Keeping the original ID will collide with existing rows.
- **`created_at`, `updated_at`** — timestamps are set by the database. Including stale values may break audit trails.
- **`deleted_at`** — leave blank unless you intentionally want to mark a row as soft-deleted.
- Any column ending in `_id` that referenced an old, no-longer-valid row — re-map these to the new IDs (see step 3 below) or use the natural-key lookup that the import endpoint provides (e.g. student name + DOB instead of `student_id`).

Do **keep** columns like `external_id`, `state_id`, or any natural keys your district uses — these are stable identifiers that the import endpoints use to deduplicate.

---

## 3. Use the `/api/imports` Endpoints for Bulk Data

For students, staff, sessions, IEP goal progress data, staff schedules, and service requirements, use the bulk import endpoints under `/api/imports` instead of raw SQL. These endpoints:

- Resolve foreign keys by name (e.g. school name → `school_id`, "Last, First" → `case_manager_id`)
- Deduplicate against existing rows for student and staff imports so those can be re-run safely (see per-endpoint notes below — sessions do **not** deduplicate)
- Validate every row and return a per-row error report
- Record the operation in the `imports` table for audit purposes

### CSV (JSON body) endpoints

These endpoints accept a JSON body containing the raw CSV text:

| Endpoint | Use for |
|---|---|
| `POST /api/imports/students` | `students.csv` |
| `POST /api/imports/staff` | `staff.csv` |
| `POST /api/imports/staff-schedules` | `staff_schedules.csv` |
| `POST /api/imports/service-requirements` | `service_requirements.csv` |
| `POST /api/imports/sessions` | `session_logs.csv` (does **not** dedupe — see warning below) |
| `POST /api/imports/goals-data` | progress data for IEP goals (CSV or TSV) |

Request shape:

```json
{
  "csvData": "first_name,last_name,grade,...\nJane,Doe,5,...\n",
  "fileName": "students.csv",
  "duplicateHandling": "skip"
}
```

`duplicateHandling` is honoured by `/imports/students` and `/imports/staff`
and accepts `"skip"` (default) or `"update"`. Other endpoints currently
ignore the field.

> ⚠️ **Sessions do not deduplicate.** Re-importing the same `session_logs.csv`
> will create duplicate session log rows. Before re-importing, either
> filter the CSV to only the date range you want to restore, or import
> into a clean district that has no existing session logs.

### Multipart (PDF) endpoint

| Endpoint | Use for |
|---|---|
| `POST /api/imports/iep-documents` | extracting a single IEP PDF into goals, services, and accommodations |

This endpoint is **not** a CSV importer — it accepts a `multipart/form-data`
upload with a `file` field containing one PDF per request. It is intended for
on-boarding new IEPs from PDFs, **not** for restoring an `iep_documents.csv`
from an archive. To restore archived `iep_documents.csv` and the related
`ieps.csv`, `iep_goals.csv`, and `accommodations.csv` rows, contact support
(see section 4) — these go in via a one-off SQL script that respects tenant
scoping and re-maps foreign keys.

### Dry-run with the validator

`POST /api/imports/validate` can pre-flight a CSV and return per-row schema
and lookup errors **without writing anything**. The body must include an
`importType`:

```json
{
  "csvData": "first_name,last_name,...\nJane,Doe,...\n",
  "importType": "students"
}
```

Supported `importType` values: `students`, `staff`, `service-requirements`,
`sessions`. The other CSV endpoints (`staff-schedules`, `goals-data`) do not
have a validator yet — import a small slice first and inspect the per-row
errors that the import endpoint itself returns.

### Recommended workflow

1. For supported types, run `POST /api/imports/validate` and fix the CSV until it is clean
2. Run the real import endpoint
3. Check **Settings → Data Health → Imports** for the per-row results

For tables not covered by the bulk endpoints (`ieps`, `iep_goals`,
`accommodations`, `iep_documents`, compliance snapshots, audit log, raw
documents), contact support — these need to be loaded with a one-off SQL
script that respects tenant scoping.

---

## 4. Need help?

Restoration is high-stakes work — a wrong import order or a stray `id` column can corrupt a live district. If you have any doubt, **email [support@trellis.education](mailto:support@trellis.education)** with:

- The district name and ID (if the destination already exists)
- The archive ZIP (or a link to it in your storage)
- Whether you want a fresh district created or data merged into an existing one

We will confirm receipt within one business day and complete most restorations within three business days.
