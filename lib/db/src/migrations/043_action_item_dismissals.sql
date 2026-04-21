-- 043_action_item_dismissals.sql
--
-- Task #951 — Shared Action Center dismiss/snooze.
--
-- Sibling table to action_item_handling. Stores district-shared
-- dismiss/snooze intent for canonical action item ids. See
-- lib/db/src/schema/actionItemDismissals.ts for schema rationale.

CREATE TABLE IF NOT EXISTS action_item_dismissals (
  id                  SERIAL PRIMARY KEY,
  district_id         INTEGER NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  item_id             TEXT NOT NULL,
  state               TEXT NOT NULL,
  dismissed_until     TIMESTAMPTZ,
  snapshot_title      TEXT,
  snapshot_detail     TEXT,
  duration_label      TEXT,
  updated_by_user_id  TEXT NOT NULL,
  updated_by_name     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT aid_state_check CHECK (state IN ('dismissed', 'snoozed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS aid_district_item_uniq
  ON action_item_dismissals (district_id, item_id);

CREATE INDEX IF NOT EXISTS aid_district_until_idx
  ON action_item_dismissals (district_id, dismissed_until);

-- Rollback (manual, ship as a later migration if needed):
-- DROP TABLE IF EXISTS action_item_dismissals;
