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
  await db.execute(sql`DELETE FROM service_requirements WHERE student_id IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))))`);
  await db.execute(sql`DELETE FROM compensatory_obligations WHERE student_id IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))))`);
  await db.execute(sql`DELETE FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B')))`);
  await db.execute(sql`DELETE FROM staff WHERE school_id IN (SELECT id FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B')))`);
  await db.execute(sql`DELETE FROM cpt_code_mappings WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))`);
  await db.execute(sql`DELETE FROM agency_contracts WHERE agency_id IN (SELECT id FROM agencies WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B')))`);
  await db.execute(sql`DELETE FROM agencies WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))`);
  await db.execute(sql`DELETE FROM district_subscriptions WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))`);
  await db.execute(sql`DELETE FROM schools WHERE district_id IN (SELECT id FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B'))`);
  await db.execute(sql`DELETE FROM districts WHERE name LIKE 'Test District %' OR name LIKE 'Sample-%' OR name IN ('District A', 'District B')`);
  await db.execute(sql`DELETE FROM service_types WHERE name LIKE 'Service %'`);
  await db.execute(sql`DELETE FROM subscription_plans WHERE name LIKE 'Test Plan %'`);
  await db.execute(sql`DELETE FROM communication_events WHERE provider_message_id IN ('msg_pending_delivered', 'msg_pending_bounce')`);
});

afterAll(async () => {
  // No-op. Per-suite afterAll hooks own normal cleanup; we keep this slot so
  // adding global teardown later doesn't require restructuring setup.
});
