-- Migration: Convert communication_events timestamp columns to timestamptz
-- Aligns DB types with Drizzle schema (withTimezone: true) and migration 003.
-- Idempotent: USING clause handles any NULL values cleanly.

ALTER TABLE communication_events
  ALTER COLUMN sent_at       TYPE timestamptz USING sent_at AT TIME ZONE 'UTC',
  ALTER COLUMN delivered_at  TYPE timestamptz USING delivered_at AT TIME ZONE 'UTC',
  ALTER COLUMN failed_at     TYPE timestamptz USING failed_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at    TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at    TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
