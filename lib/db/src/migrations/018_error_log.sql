-- Migration 018: error_log table for tracking 5xx server errors

CREATE TABLE IF NOT EXISTS error_log (
  id          serial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  http_status integer NOT NULL,
  path        text NOT NULL,
  message     text NOT NULL
);

CREATE INDEX IF NOT EXISTS error_log_occurred_at_idx ON error_log(occurred_at);
CREATE INDEX IF NOT EXISTS error_log_http_status_idx ON error_log(http_status);
