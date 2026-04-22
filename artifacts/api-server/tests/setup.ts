/**
 * Global test setup. Runs once before any test file is imported.
 *
 * Critical: NODE_ENV must be set to "test" BEFORE the express app or auth
 * middleware is imported, because both check `process.env.NODE_ENV` at
 * import time to wire up the x-test-* header bypass and rate-limit skip.
 */
process.env.NODE_ENV = "test";

// Resend webhook secret is required for the /webhooks/resend route to do
// anything except 503. The webhook signature path is exercised by setting a
// stable secret here; tests that hit the route bypass signature verification
// by writing directly to the DB via the same code path the webhook uses.
process.env.RESEND_WEBHOOK_SECRET ??= "test_resend_webhook_secret";

// Quiet pino in tests.
process.env.LOG_LEVEL ??= "silent";

/**
 * Pre-suite sweep: remove any "Test District %" / "Sample-%" / "District A|B"
 * districts left behind by an aborted previous run so we don't accumulate
 * zombie tenants in the shared dev DB. Mirrors the FK-order cleanup the
 * per-suite afterAll hook does, but cast wider.
 */
import { afterAll, beforeAll } from "vitest";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

beforeAll(async () => {
  // SQL is intentionally inline + parameterless: schema is owned by us, names
  // are LIKE-matched, and this only ever runs against the dev/test DB.
  await db.execute(sql`
    WITH stale AS (
      SELECT id FROM districts
      WHERE name LIKE 'Test District %'
         OR name LIKE 'Sample-%'
         OR name IN ('District A', 'District B')
    ),
    stale_schools AS (SELECT id FROM schools WHERE district_id IN (SELECT id FROM stale)),
    stale_students AS (SELECT id FROM students WHERE school_id IN (SELECT id FROM stale_schools)),
    stale_staff AS (SELECT id FROM staff WHERE school_id IN (SELECT id FROM stale_schools)),
    stale_sessions AS (
      SELECT id FROM session_logs
      WHERE student_id IN (SELECT id FROM stale_students)
         OR staff_id IN (SELECT id FROM stale_staff)
    ),
    stale_agencies AS (SELECT id FROM agencies WHERE district_id IN (SELECT id FROM stale))
    SELECT 1;
  `);
  await db.execute(sql`DELETE FROM contract_session_links WHERE session_log_id IN (SELECT id FROM session_logs WHERE student_id IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B')))))`);
  await db.execute(sql`DELETE FROM medicaid_claims WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))`);
  await db.execute(sql`DELETE FROM session_logs WHERE student_id IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))))`);
  await db.execute(sql`DELETE FROM communication_events WHERE student_id IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))))`);
  await db.execute(sql`DELETE FROM alerts WHERE service_requirement_id IN (SELECT id FROM service_requirements WHERE student_id IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B')))))`);
  // Clean up student-scoped alerts (no service_requirement_id) so the
  // students delete below doesn't trip alerts_student_id_students_id_fk.
  await db.execute(sql`DELETE FROM alerts WHERE student_id IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))))`);
  await db.execute(sql`DELETE FROM service_requirements WHERE student_id IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))))`);
  await db.execute(sql`DELETE FROM compensatory_obligations WHERE student_id IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))))`);
  await db.execute(sql`DELETE FROM schedule_blocks WHERE staff_id IN (SELECT id FROM staff WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B')))) OR student_id IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))))`);
  // Wider sweep of FK-children added by the sample-data seeder. Any new
  // table the seeder writes to MUST be added here or the global cleanup
  // will fail with a stale-FK error and abort every subsequent test run.
  // The selector subquery is repeated to keep each statement standalone.
  const STALE_STUDENTS_SQL = sql.raw(`(SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))))`);
  const STALE_STAFF_SQL = sql.raw(`(SELECT id FROM staff WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))))`);
  // The seeder writes to ~40 child tables under students/staff. Maintaining
  // an exhaustive, FK-ordered DELETE cascade in this setup file is brittle
  // (every new schema table breaks it). For test cleanup we instead disable
  // FK enforcement for the duration of the sweep using
  // `session_replication_role = replica` — the standard Postgres pattern
  // for bulk truncates. This is safe because (a) we re-enable it before
  // the suite starts, and (b) the sweep only deletes rows scoped to
  // test-named districts, so any orphan rows it leaves behind belong to
  // the same about-to-be-deleted district subtree.
  await db.execute(sql`SET session_replication_role = 'replica'`);
  // Direct student-FK children. Tables without a `student_id` column are
  // handled below via their parent's id.
  for (const tbl of [
    "behavior_targets",
    "class_enrollments",
    "compliance_events",
    "data_sessions",
    "eligibility_determinations",
    "emergency_contacts",
    "enrollment_events",
    "evaluation_referrals",
    "evaluations",
    "guardians",
    "medical_alerts",
    "meeting_consent_records",
    "parent_contacts",
    "parent_messages",
    "prior_written_notices",
    "progress_reports",
    "restraint_incidents",
    "share_links",
    "staff_assignments",
    "student_check_ins",
    "student_notes",
    "student_wins",
    "submissions",
    "teacher_observations",
    "transition_plans",
  ]) {
    await db.execute(sql`DELETE FROM ${sql.identifier(tbl)} WHERE student_id IN ${STALE_STUDENTS_SQL}`);
  }
  // Indirect children — deleted via their parent rows so the parent
  // delete below doesn't trip an FK. Order matters: leaves first.
  await db.execute(sql`DELETE FROM accommodation_verifications WHERE accommodation_id IN (SELECT id FROM iep_accommodations WHERE student_id IN ${STALE_STUDENTS_SQL})`);
  await db.execute(sql`DELETE FROM iep_accommodations WHERE student_id IN ${STALE_STUDENTS_SQL}`);
  await db.execute(sql`DELETE FROM bip_fidelity_logs WHERE bip_id IN (SELECT id FROM behavior_intervention_plans WHERE student_id IN ${STALE_STUDENTS_SQL})`);
  await db.execute(sql`DELETE FROM bip_implementers WHERE bip_id IN (SELECT id FROM behavior_intervention_plans WHERE student_id IN ${STALE_STUDENTS_SQL})`);
  await db.execute(sql`DELETE FROM bip_status_history WHERE bip_id IN (SELECT id FROM behavior_intervention_plans WHERE student_id IN ${STALE_STUDENTS_SQL})`);
  await db.execute(sql`DELETE FROM behavior_intervention_plans WHERE student_id IN ${STALE_STUDENTS_SQL}`);
  await db.execute(sql`DELETE FROM document_versions WHERE document_id IN (SELECT id FROM documents WHERE student_id IN ${STALE_STUDENTS_SQL})`);
  await db.execute(sql`DELETE FROM documents WHERE student_id IN ${STALE_STUDENTS_SQL}`);
  await db.execute(sql`DELETE FROM progress_note_contributions WHERE progress_report_id IN (SELECT id FROM progress_reports WHERE student_id IN ${STALE_STUDENTS_SQL}) OR iep_goal_id IN (SELECT id FROM iep_goals WHERE student_id IN ${STALE_STUDENTS_SQL})`);
  await db.execute(sql`DELETE FROM iep_goals WHERE student_id IN ${STALE_STUDENTS_SQL}`);
  await db.execute(sql`DELETE FROM meeting_prep_items WHERE meeting_id IN (SELECT id FROM team_meetings WHERE student_id IN ${STALE_STUDENTS_SQL})`);
  await db.execute(sql`DELETE FROM iep_meeting_attendees WHERE meeting_id IN (SELECT id FROM team_meetings WHERE student_id IN ${STALE_STUDENTS_SQL})`);
  await db.execute(sql`DELETE FROM team_meetings WHERE student_id IN ${STALE_STUDENTS_SQL}`);
  await db.execute(sql`DELETE FROM iep_documents WHERE student_id IN ${STALE_STUDENTS_SQL}`);
  await db.execute(sql`DELETE FROM fba_observations WHERE fba_id IN (SELECT id FROM fbas WHERE student_id IN ${STALE_STUDENTS_SQL})`);
  await db.execute(sql`DELETE FROM functional_analyses WHERE fba_id IN (SELECT id FROM fbas WHERE student_id IN ${STALE_STUDENTS_SQL})`);
  await db.execute(sql`DELETE FROM fbas WHERE student_id IN ${STALE_STUDENTS_SQL}`);
  // Staff-FK children that aren't covered by the schedule_blocks delete above.
  await db.execute(sql`DELETE FROM staff_absences WHERE staff_id IN ${STALE_STAFF_SQL}`);
  await db.execute(sql`DELETE FROM supervision_sessions WHERE supervisor_id IN ${STALE_STAFF_SQL} OR supervisee_id IN ${STALE_STAFF_SQL}`);
  await db.execute(sql`DELETE FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B')))`);
  await db.execute(sql`DELETE FROM staff WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B')))`);
  await db.execute(sql`DELETE FROM cpt_code_mappings WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))`);
  await db.execute(sql`DELETE FROM agency_contracts WHERE agency_id IN (SELECT id FROM agencies WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B')))`);
  await db.execute(sql`DELETE FROM agencies WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))`);
  await db.execute(sql`DELETE FROM district_subscriptions WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))`);
  await db.execute(sql`DELETE FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))`);
  await db.execute(sql`DELETE FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B')`);
  // Re-enable FK enforcement for the actual test workload.
  await db.execute(sql`SET session_replication_role = 'origin'`);
  await db.execute(sql`DELETE FROM service_types WHERE name LIKE 'Service %'`);
  await db.execute(sql`DELETE FROM subscription_plans WHERE name LIKE 'Test Plan %'`);
  await db.execute(sql`DELETE FROM communication_events WHERE provider_message_id IN ('msg_pending_delivered', 'msg_pending_bounce')`);
});

afterAll(async () => {
  // No-op. Per-suite afterAll hooks own normal cleanup; we keep this slot so
  // adding global teardown later doesn't require restructuring setup.
});
