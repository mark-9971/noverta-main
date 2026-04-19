-- Task 423: Sandbox Training Mode for provider onboarding.
--
-- Adds a per-user flag on staff to opt into Training Mode and two columns
-- on session_logs to tag writes made while a user is in Training Mode so
-- (a) the normal app never surfaces them and (b) the per-user "Reset
-- training data" action can wipe just one user's sandbox writes without
-- touching anything else.
--
-- See lib/db/src/schema/staff.ts and lib/db/src/schema/sessionLogs.ts
-- for the column comments. drizzle-kit push will diff the schema and
-- apply this in environments that use the push workflow; this file is
-- the canonical reference for environments that apply migrations by
-- hand.

ALTER TABLE staff
  ADD COLUMN IF NOT EXISTS training_mode_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE session_logs
  ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sandbox_user_id text;

-- Cheap index for the per-user reset path. Sandbox writes are rare in
-- absolute terms but the reset query filters by sandbox_user_id and we
-- want it to stay fast as the table grows.
CREATE INDEX IF NOT EXISTS sl_sandbox_user_idx
  ON session_logs(sandbox_user_id)
  WHERE is_sandbox = true;
