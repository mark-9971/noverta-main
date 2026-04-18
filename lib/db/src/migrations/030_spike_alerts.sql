-- Spike alert detection: bypass digest mode for newly-critical risks.
-- A risk is a "spike" when it becomes critical for the first time (no prior
-- critical cost_avoidance_risk alert exists for the same baseKey).
-- Districts can disable spike detection or raise/lower the per-staff threshold
-- that distinguishes an "isolated spike" (immediate email) from a normal batch
-- (still digested).
ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS spike_alert_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE districts
  ADD COLUMN IF NOT EXISTS spike_alert_threshold integer NOT NULL DEFAULT 3;
