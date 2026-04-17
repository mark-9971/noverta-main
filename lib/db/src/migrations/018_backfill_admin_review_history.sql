-- Migration 018: Back-fill incident_status_history for legacy admin-review rows
-- Idempotent: only inserts rows that do not already have a matching under_review
-- history entry for that incident.  Safe to re-run.
--
-- Background: the legacy POST /protective-measures/incidents/:id/admin-review
-- endpoint already wrote to incident_status_history, so in practice zero rows
-- need to be inserted on most deployments.  This migration exists as an
-- explicit safety net for any incidents that were reviewed before history
-- logging was introduced, ensuring full audit coverage.

INSERT INTO incident_status_history (incident_id, from_status, to_status, note, actor_staff_id, created_at)
SELECT
  ri.id                                                           AS incident_id,
  'open'                                                          AS from_status,
  'under_review'                                                  AS to_status,
  COALESCE(ri.admin_review_notes, '(legacy admin review — note not captured)') AS note,
  ri.admin_reviewed_by                                            AS actor_staff_id,
  COALESCE(
    ri.admin_reviewed_at::timestamptz,
    NOW()
  )                                                               AS created_at
FROM restraint_incidents ri
WHERE ri.admin_reviewed_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM incident_status_history ish
    WHERE ish.incident_id = ri.id
      AND ish.to_status = 'under_review'
  );
