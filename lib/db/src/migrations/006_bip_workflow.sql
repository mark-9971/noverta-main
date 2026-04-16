-- Migration 006: BIP approval & implementation workflow
-- Adds status history, implementer assignments, and fidelity logging to BIPs

-- Add new lifecycle columns to behavior_intervention_plans
ALTER TABLE behavior_intervention_plans
  ADD COLUMN IF NOT EXISTS implementation_start_date date,
  ADD COLUMN IF NOT EXISTS discontinued_date date,
  ADD COLUMN IF NOT EXISTS version_group_id integer;

CREATE INDEX IF NOT EXISTS bip_version_group_idx ON behavior_intervention_plans(version_group_id);

-- Status transition history
CREATE TABLE IF NOT EXISTS bip_status_history (
  id serial PRIMARY KEY,
  bip_id integer NOT NULL REFERENCES behavior_intervention_plans(id) ON DELETE CASCADE,
  from_status text NOT NULL,
  to_status text NOT NULL,
  changed_by_id integer REFERENCES staff(id),
  notes text,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bip_status_history_bip_idx ON bip_status_history(bip_id);
CREATE INDEX IF NOT EXISTS bip_status_history_changed_at_idx ON bip_status_history(changed_at);

-- Implementer assignments
CREATE TABLE IF NOT EXISTS bip_implementers (
  id serial PRIMARY KEY,
  bip_id integer NOT NULL REFERENCES behavior_intervention_plans(id) ON DELETE CASCADE,
  staff_id integer NOT NULL REFERENCES staff(id),
  assigned_by_id integer REFERENCES staff(id),
  notes text,
  active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bip_implementers_bip_idx ON bip_implementers(bip_id);
CREATE INDEX IF NOT EXISTS bip_implementers_staff_idx ON bip_implementers(staff_id);

-- Fidelity implementation logs
CREATE TABLE IF NOT EXISTS bip_fidelity_logs (
  id serial PRIMARY KEY,
  bip_id integer NOT NULL REFERENCES behavior_intervention_plans(id) ON DELETE CASCADE,
  staff_id integer REFERENCES staff(id),
  log_date date NOT NULL,
  fidelity_rating integer,
  student_response text,
  implementation_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bip_fidelity_logs_bip_idx ON bip_fidelity_logs(bip_id);
CREATE INDEX IF NOT EXISTS bip_fidelity_logs_date_idx ON bip_fidelity_logs(log_date);
