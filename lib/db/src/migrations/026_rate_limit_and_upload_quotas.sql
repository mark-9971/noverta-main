-- Rate limit bucket store (persists across restarts, supports multi-worker)
CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key   text PRIMARY KEY,
  count        integer NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rl_bucket_window_idx ON rate_limit_buckets (window_start);

-- Per-district daily upload byte tracking
CREATE TABLE IF NOT EXISTS upload_quotas (
  id             serial PRIMARY KEY,
  district_id    integer NOT NULL,
  quota_date     date NOT NULL,
  uploaded_bytes bigint NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (district_id, quota_date)
);

CREATE INDEX IF NOT EXISTS upload_quotas_district_idx ON upload_quotas (district_id);
