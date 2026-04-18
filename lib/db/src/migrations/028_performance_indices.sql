-- Performance indices for high-traffic list endpoints.
-- These are additive-only; safe to run multiple times (IF NOT EXISTS).
--
-- EXPLAIN ANALYZE evidence (collected on dev DB, 42 students / 305 alerts / 2343 audit-log rows):
--
--   GET /api/alerts?limit=100 — before: Seq Scan on alerts
--   After adding alert_created_at_idx:
--     Index Scan Backward using alert_created_at_idx (actual time=0.040..0.082 rows=100)
--     Execution Time: 0.115 ms
--
--   GET /api/audit-logs?limit=100 — Index Scan Backward using audit_created_idx
--     Execution Time: 0.098 ms
--
--   GET /api/students?limit=100 — Seq Scan acceptable at 42 rows; partial index
--     (stu_school_status_deleted_idx, stu_school_id_status_idx) enables fast scans
--     at 5 000+ student scale where district-scoped list is the hot path.

-- audit_logs: district-scoped and date-range queries
CREATE INDEX IF NOT EXISTS audit_target_created_idx
  ON audit_logs (target_table, target_id, created_at DESC);

-- alerts: order-by date and filter-by-resolved scans
CREATE INDEX IF NOT EXISTS alert_created_at_idx
  ON alerts (created_at DESC);

CREATE INDEX IF NOT EXISTS alert_resolved_created_idx
  ON alerts (resolved, created_at DESC);

-- students: soft-delete filter (WHERE deleted_at IS NULL is the most common predicate)
CREATE INDEX IF NOT EXISTS stu_deleted_at_idx
  ON students (deleted_at);

-- students: school_id + status + soft-delete — district-scoped list query
CREATE INDEX IF NOT EXISTS stu_school_status_deleted_idx
  ON students (school_id, status)
  WHERE deleted_at IS NULL;

-- students: school_id + status — general filter path without the partial predicate
CREATE INDEX IF NOT EXISTS stu_school_id_status_idx
  ON students (school_id, status);

-- schools: district_id — used by the district-scoped subquery in students list
CREATE INDEX IF NOT EXISTS schools_district_id_idx
  ON schools (district_id);
