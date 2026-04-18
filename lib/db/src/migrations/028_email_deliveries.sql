-- email_deliveries table — tracks outbound parent-facing emails for
-- signature requests, share links, and IEP meeting invitations.
-- Added as part of Task #245 (was missing from earlier migrations).

CREATE TABLE IF NOT EXISTS email_deliveries (
  id                      serial PRIMARY KEY,
  message_type            text NOT NULL,
  recipient_email         text NOT NULL,
  recipient_name          text,
  subject                 text NOT NULL,
  status                  text NOT NULL DEFAULT 'queued',
  provider_message_id     text,
  signature_request_id    integer REFERENCES signature_requests(id) ON DELETE SET NULL,
  share_link_id           integer REFERENCES share_links(id)          ON DELETE SET NULL,
  iep_meeting_id          integer REFERENCES team_meetings(id)         ON DELETE SET NULL,
  attempted_at            timestamptz NOT NULL DEFAULT now(),
  accepted_at             timestamptz,
  delivered_at            timestamptz,
  failed_at               timestamptz,
  failed_reason           text,
  last_webhook_event_type text,
  last_webhook_at         timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ed_provider_msg_idx ON email_deliveries (provider_message_id);
CREATE INDEX IF NOT EXISTS ed_sig_req_idx      ON email_deliveries (signature_request_id);
CREATE INDEX IF NOT EXISTS ed_share_link_idx   ON email_deliveries (share_link_id);
CREATE INDEX IF NOT EXISTS ed_iep_meeting_idx  ON email_deliveries (iep_meeting_id);
CREATE INDEX IF NOT EXISTS ed_status_idx       ON email_deliveries (status);
CREATE INDEX IF NOT EXISTS ed_attempted_idx    ON email_deliveries (attempted_at);
