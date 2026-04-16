-- Migration: communication_events audit table
-- Records every parent/guardian notification attempt regardless of channel (email, certified mail, etc.).
-- Idempotent (safe to run multiple times).

CREATE TABLE IF NOT EXISTS communication_events (
  id                   serial PRIMARY KEY,
  student_id           integer NOT NULL,
  guardian_id          integer,
  staff_id             integer,
  channel              text    NOT NULL DEFAULT 'email',
  status               text    NOT NULL DEFAULT 'queued',
  type                 text    NOT NULL,
  subject              text    NOT NULL,
  body_text            text,
  to_email             text,
  to_name              text,
  from_email           text,
  provider_message_id  text,
  sent_at              timestamptz,
  delivered_at         timestamptz,
  failed_at            timestamptz,
  failed_reason        text,
  linked_incident_id   integer,
  linked_alert_id      integer,
  linked_contact_id    integer,
  metadata             jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS ce_student_id_idx         ON communication_events(student_id);
CREATE INDEX IF NOT EXISTS ce_provider_msg_id_idx    ON communication_events(provider_message_id);
CREATE INDEX IF NOT EXISTS ce_created_at_idx         ON communication_events(created_at DESC);
CREATE INDEX IF NOT EXISTS ce_status_idx             ON communication_events(status);
CREATE INDEX IF NOT EXISTS ce_type_student_idx       ON communication_events(type, student_id, created_at DESC);
