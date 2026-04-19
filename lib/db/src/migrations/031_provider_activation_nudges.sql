-- Provider activation nudges (Task #420)
--
-- Adds:
--   * staff.supervisor_staff_id  — optional self-FK to route 5+ day escalations
--   * staff.nudge_snoozed_until  — provider-controlled snooze (one week)
--   * staff.nudge_snooze_token   — random capability token for the footer link
--   * districts.time_zone        — IANA tz used for "7am local" delivery and
--                                   "school day" boundaries

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS supervisor_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nudge_snoozed_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS nudge_snooze_token  TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS staff_nudge_snooze_token_uniq
  ON staff (nudge_snooze_token)
  WHERE nudge_snooze_token IS NOT NULL;

ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS time_zone TEXT NOT NULL DEFAULT 'America/New_York';
