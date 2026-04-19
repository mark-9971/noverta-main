-- In-app pilot feedback widget: persistent capture surface for pilot users.
-- Submissions auto-attach context (page URL, role, district, browser, recent
-- console errors, user email) so support can triage without a follow-up.
--
-- Pilot account manager email lives on the district row so each pilot can be
-- routed to a different AM without a separate config table.

ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS pilot_account_manager_email text;

CREATE TYPE pilot_feedback_type AS ENUM ('bug', 'suggestion', 'question');
CREATE TYPE pilot_feedback_status AS ENUM ('new', 'triaged', 'in_progress', 'closed');

CREATE TABLE pilot_feedback (
  id serial PRIMARY KEY,
  district_id integer REFERENCES districts(id) ON DELETE SET NULL,
  user_id text NOT NULL,
  user_email text,
  user_role text,
  user_name text,
  type pilot_feedback_type NOT NULL,
  description text NOT NULL,
  page_url text,
  user_agent text,
  -- Screenshot is stored inline as a data URL. Capped at ~2 MB on the API
  -- side; for larger needs we'll move to object storage.
  screenshot_data_url text,
  console_errors jsonb,
  extra_context jsonb,
  status pilot_feedback_status NOT NULL DEFAULT 'new',
  triage_notes text,
  triaged_by_user_id text,
  triaged_at timestamptz,
  email_notified_to text,
  email_notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pilot_feedback_district_id_idx ON pilot_feedback(district_id);
CREATE INDEX pilot_feedback_status_idx ON pilot_feedback(status);
CREATE INDEX pilot_feedback_created_at_idx ON pilot_feedback(created_at);
