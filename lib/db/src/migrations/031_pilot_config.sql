-- Pilot configuration fields on districts. Powers the in-app Pilot Status page
-- shown to district admins and Trellis support staff. All fields are nullable
-- because not every district is on a pilot; isPilot remains the gate for
-- whether the Pilot Status page is shown at all.
ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS pilot_start_date date,
  ADD COLUMN IF NOT EXISTS pilot_end_date date,
  ADD COLUMN IF NOT EXISTS pilot_stage text,
  ADD COLUMN IF NOT EXISTS pilot_account_manager_name text,
  ADD COLUMN IF NOT EXISTS pilot_account_manager_email text;

-- Stage is constrained at the API layer (kickoff / mid_pilot / readout) but we
-- keep it as plain text in the schema so future stages can be added without a
-- migration.
