-- 042_school_calendar_exceptions.sql
--
-- School Calendar v0 — Slice 1
--
-- Per-school day-level exceptions to the default Mon–Fri instructional
-- calendar: full closures (snow days, holidays, PD days) and early-release
-- days (half days, PD afternoons). Read-only model for now: no consumer
-- (minute totals, schedule generator, expected-slot, Today view) reads from
-- this table yet — those joins land in later slices.
--
-- The shape is intentionally narrow:
--   * one row per (school_id, exception_date)
--   * type ∈ {'closure','early_release'} — extension space reserved
--   * dismissal_time is non-null only when type='early_release'
--   * reason is required (free text); notes is optional
--
-- Idempotent: uses IF NOT EXISTS guards so re-running the migration is safe.
-- Rollback: see DROP block at the bottom (commented), to be uncommented and
-- shipped as 043 if we need to roll back this slice cleanly.

CREATE TABLE IF NOT EXISTS school_calendar_exceptions (
  id              SERIAL PRIMARY KEY,
  school_id       INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  exception_date  DATE NOT NULL,
  type            TEXT NOT NULL,
  dismissal_time  TEXT,
  reason          TEXT NOT NULL,
  notes           TEXT,
  created_by      INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sce_type_check
    CHECK (type IN ('closure','early_release')),
  CONSTRAINT sce_dismissal_only_for_early_release
    CHECK (
      (type = 'early_release' AND dismissal_time IS NOT NULL)
      OR (type = 'closure' AND dismissal_time IS NULL)
    ),
  CONSTRAINT sce_dismissal_time_format
    CHECK (dismissal_time IS NULL OR dismissal_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);

CREATE UNIQUE INDEX IF NOT EXISTS sce_school_date_unique
  ON school_calendar_exceptions (school_id, exception_date);

CREATE INDEX IF NOT EXISTS sce_school_idx
  ON school_calendar_exceptions (school_id);

CREATE INDEX IF NOT EXISTS sce_date_idx
  ON school_calendar_exceptions (exception_date);

-- Rollback (manual, ship as 043 if needed):
-- DROP TABLE IF EXISTS school_calendar_exceptions;
