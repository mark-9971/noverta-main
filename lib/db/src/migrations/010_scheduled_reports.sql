-- Migration 010: Scheduled reports + export history enhancements

CREATE TABLE IF NOT EXISTS scheduled_reports (
  id          serial PRIMARY KEY,
  district_id integer NOT NULL,
  report_type text NOT NULL,
  frequency   text NOT NULL,
  filters     jsonb,
  recipient_emails jsonb NOT NULL DEFAULT '[]',
  created_by  text NOT NULL,
  enabled     boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sched_report_district_idx ON scheduled_reports(district_id);
CREATE INDEX IF NOT EXISTS sched_report_next_run_idx ON scheduled_reports(next_run_at);

ALTER TABLE export_history ADD COLUMN IF NOT EXISTS district_id integer;
ALTER TABLE export_history ADD COLUMN IF NOT EXISTS format text NOT NULL DEFAULT 'csv';

CREATE INDEX IF NOT EXISTS export_hist_district_idx ON export_history(district_id);
