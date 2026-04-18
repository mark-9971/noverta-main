-- Migration: schedule_change_requests
-- Adds provider self-service schedule change request table.
-- Providers submit requests (swap time, coverage, other).
-- Admins/coordinators/case_managers review and approve or deny.

CREATE TABLE IF NOT EXISTS schedule_change_requests (
  id                   serial PRIMARY KEY,
  staff_id             integer NOT NULL REFERENCES staff(id),
  schedule_block_id    integer REFERENCES schedule_blocks(id),
  request_type         text NOT NULL,
  notes                text,
  requested_date       text,
  requested_start_time text,
  requested_end_time   text,
  status               text NOT NULL DEFAULT 'pending',
  admin_notes          text,
  reviewed_by_staff_id integer REFERENCES staff(id),
  reviewed_at          timestamp with time zone,
  created_at           timestamp with time zone NOT NULL DEFAULT now(),
  updated_at           timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scr_staff_idx  ON schedule_change_requests(staff_id);
CREATE INDEX IF NOT EXISTS scr_status_idx ON schedule_change_requests(status);
