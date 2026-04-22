/**
 * Test helpers for the api-server regression suite.
 *
 * Tests speak HTTP via supertest against the real express app, with
 * NODE_ENV=test enabling the x-test-* header bypass on the auth middleware.
 *
 * Each helper that creates a row returns the inserted id so tests can scope
 * assertions and clean up. Cleanup is handled per-suite via cleanupDistrict()
 * which walks the FK tree from the district down.
 */

import request from "supertest";
import { db } from "@workspace/db";
import {
  districtsTable,
  schoolsTable,
  staffTable,
  studentsTable,
  serviceTypesTable,
  cptCodeMappingsTable,
  sessionLogsTable,
  agenciesTable,
  agencyContractsTable,
  contractSessionLinksTable,
  subscriptionPlansTable,
  districtSubscriptionsTable,
  medicaidClaimsTable,
  communicationEventsTable,
  compensatoryObligationsTable,
} from "@workspace/db";
import { legalAcceptancesTable } from "@workspace/db/schema";
import { LEGAL_VERSIONS } from "../src/lib/legalVersions";
import { eq, inArray, sql } from "drizzle-orm";

import app from "../src/app";

export { app };

/** Returns a supertest agent with x-test-* headers preset for auth bypass. */
export function asUser(opts: {
  userId: string;
  role: "admin" | "coordinator" | "case_manager" | "provider" | "para" | "teacher";
  districtId: number | null;
}) {
  const agent = request(app);
  // supertest doesn't have a global header — we wrap each verb to attach.
  type Verb = "get" | "post" | "put" | "patch" | "delete";
  const wrap = (v: Verb) => (path: string) => {
    let r = agent[v](path).set("x-test-user-id", opts.userId).set("x-test-role", opts.role);
    if (opts.districtId != null) r = r.set("x-test-district-id", String(opts.districtId));
    return r;
  };
  return {
    get: wrap("get"),
    post: wrap("post"),
    put: wrap("put"),
    patch: wrap("patch"),
    delete: wrap("delete"),
  };
}

/** Anonymous (no auth headers). */
export const anon = request(app);

let _seq = 0;
function uniq(): string {
  _seq += 1;
  return `${Date.now()}_${process.pid}_${_seq}`;
}

export async function createDistrict(overrides: Partial<typeof districtsTable.$inferInsert> = {}) {
  const tag = uniq();
  const [d] = await db.insert(districtsTable).values({
    name: `Test District ${tag}`,
    state: "MA",
    tier: "essentials",
    ...overrides,
  }).returning();
  return d;
}

export async function createSchool(districtId: number, overrides: Partial<typeof schoolsTable.$inferInsert> = {}) {
  const tag = uniq();
  const [s] = await db.insert(schoolsTable).values({
    name: `Test School ${tag}`,
    districtId,
    ...overrides,
  }).returning();
  return s;
}

export async function createStaff(schoolId: number, overrides: Partial<typeof staffTable.$inferInsert> = {}) {
  const tag = uniq();
  const [s] = await db.insert(staffTable).values({
    firstName: "Test",
    lastName: `Staff${tag}`,
    role: "provider",
    schoolId,
    ...overrides,
  }).returning();
  return s;
}

export async function createStudent(schoolId: number, overrides: Partial<typeof studentsTable.$inferInsert> = {}) {
  const tag = uniq();
  const [s] = await db.insert(studentsTable).values({
    firstName: "Test",
    lastName: `Student${tag}`,
    schoolId,
    status: "active",
    ...overrides,
  }).returning();
  return s;
}

export async function createServiceType(overrides: Partial<typeof serviceTypesTable.$inferInsert> = {}) {
  const tag = uniq();
  const [s] = await db.insert(serviceTypesTable).values({
    name: `Service ${tag}`,
    category: "speech",
    ...overrides,
  }).returning();
  return s;
}

export async function createCptMapping(districtId: number, serviceTypeId: number, overrides: Partial<typeof cptCodeMappingsTable.$inferInsert> = {}) {
  const tag = uniq();
  const [m] = await db.insert(cptCodeMappingsTable).values({
    districtId,
    serviceTypeId,
    cptCode: `T${tag.slice(-4)}`,
    ratePerUnit: "12.50",
    unitDurationMinutes: 15,
    isActive: "true",
    ...overrides,
  }).returning();
  return m;
}

export async function createSessionLog(opts: {
  studentId: number; staffId: number; serviceTypeId: number;
  sessionDate: string; durationMinutes: number; status?: string;
}) {
  const [s] = await db.insert(sessionLogsTable).values({
    studentId: opts.studentId,
    staffId: opts.staffId,
    serviceTypeId: opts.serviceTypeId,
    sessionDate: opts.sessionDate,
    durationMinutes: opts.durationMinutes,
    status: opts.status ?? "completed",
  } as typeof sessionLogsTable.$inferInsert).returning();
  return s;
}

export async function createAgency(districtId: number, overrides: Partial<typeof agenciesTable.$inferInsert> = {}) {
  const tag = uniq();
  const [a] = await db.insert(agenciesTable).values({
    name: `Agency ${tag}`,
    districtId,
    ...overrides,
  }).returning();
  return a;
}

export async function createSubscriptionPlan(overrides: Partial<typeof subscriptionPlansTable.$inferInsert> = {}) {
  const tag = uniq();
  const [p] = await db.insert(subscriptionPlansTable).values({
    tier: `essentials_test_${tag}`,
    name: `Test Plan ${tag}`,
    seatLimit: 10,
    monthlyPriceId: `price_test_m_${tag}`,
    yearlyPriceId: `price_test_y_${tag}`,
    monthlyPriceCents: 1000,
    yearlyPriceCents: 10000,
    isActive: true,
    ...overrides,
  }).returning();
  return p;
}

/**
 * Postgres caps `IN (...)` / `ANY(VALUES ...)` ROW expressions at 1664 items
 * (PG error 54011: "ROW expressions can have at most 1664 entries"). The
 * sample-data seeder can write thousands of session_logs per district, so
 * any list-based delete must be chunked. 1000 is a comfortable margin under
 * the limit and keeps statement parse-times reasonable.
 */
const PG_IN_CHUNK = 1000;
async function deleteByIdChunks(
  ids: number[],
  exec: (chunk: number[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < ids.length; i += PG_IN_CHUNK) {
    await exec(ids.slice(i, i + PG_IN_CHUNK));
  }
}

/**
 * Tear down everything that hangs off a test district. Order matters: child
 * rows first, parents last, FKs satisfied throughout.
 */
export async function cleanupDistrict(districtId: number) {
  const schoolIds = (
    await db.select({ id: schoolsTable.id }).from(schoolsTable).where(eq(schoolsTable.districtId, districtId))
  ).map((r) => r.id);

  const studentIds = schoolIds.length === 0 ? [] : (
    await db.select({ id: studentsTable.id }).from(studentsTable).where(inArray(studentsTable.schoolId, schoolIds))
  ).map((r) => r.id);

  const staffIds = schoolIds.length === 0 ? [] : (
    await db.select({ id: staffTable.id }).from(staffTable).where(inArray(staffTable.schoolId, schoolIds))
  ).map((r) => r.id);

  const sessionIds = (studentIds.length === 0 && staffIds.length === 0) ? [] : (
    await db
      .select({ id: sessionLogsTable.id })
      .from(sessionLogsTable)
      .where(
        sql`${sessionLogsTable.studentId} IN (${sql.join(studentIds.length ? studentIds.map((id) => sql`${id}`) : [sql`-1`], sql`, `)})
            OR ${sessionLogsTable.staffId} IN (${sql.join(staffIds.length ? staffIds.map((id) => sql`${id}`) : [sql`-1`], sql`, `)})`,
      )
  ).map((r) => r.id);

  if (sessionIds.length > 0) {
    await deleteByIdChunks(sessionIds, (chunk) =>
      db.delete(contractSessionLinksTable).where(inArray(contractSessionLinksTable.sessionLogId, chunk)),
    );
    // session_goal_data references session_logs(id); must die before sessions.
    // Chunk via raw IN-list (drizzle's ${array} interpolation expands every
    // id to its own positional param, so a single ANY($N) here would still
    // hit the 1664-arg row-expression cap once N > 1664).
    await deleteByIdChunks(sessionIds, (chunk) => {
      const list = sql.raw(`(${chunk.join(",")})`);
      return db.execute(sql`DELETE FROM session_goal_data WHERE session_log_id IN ${list}`);
    });
  }

  await db.delete(medicaidClaimsTable).where(eq(medicaidClaimsTable.districtId, districtId));
  if (sessionIds.length > 0) {
    await deleteByIdChunks(sessionIds, (chunk) =>
      db.delete(sessionLogsTable).where(inArray(sessionLogsTable.id, chunk)),
    );
  }
  // Sweep every FK-child of students/staff that the sample-data seeder
  // (or any test) may have written. Listed explicitly so the suite fails
  // *here* (not mid-test) when a new schema table is introduced. Order
  // is leaves → roots; raw SQL is used for tables not exported from the
  // helpers' import list to keep the import surface narrow.
  // The seeder writes to ~40 child tables under students/staff. Rather
  // than maintain an exhaustive FK-ordered cascade (every new schema
  // table would break it), we run the per-district sweep inside a
  // single transaction with `session_replication_role = 'replica'` —
  // FK enforcement is suspended for the duration of the transaction
  // *only*. This is safe because the sweep only touches rows scoped to
  // the test district subtree we're tearing down. Using a transaction
  // is required because each db.execute borrows a fresh pool connection
  // by default, and the SET would not persist across queries otherwise.
  if (studentIds.length > 0 || staffIds.length > 0) {
    // Chunk every IN-list against the same 1664-arg PG cap that bit
    // session_goal_data above. A district seeded by sample-data carries
    // far fewer than 1000 students/staff today, but the cleanup runs in
    // every suite and must not regress when seed sizes grow.
    const studentChunks: number[][] = [];
    for (let i = 0; i < studentIds.length; i += PG_IN_CHUNK) {
      studentChunks.push(studentIds.slice(i, i + PG_IN_CHUNK));
    }
    const staffChunks: number[][] = [];
    for (let i = 0; i < staffIds.length; i += PG_IN_CHUNK) {
      staffChunks.push(staffIds.slice(i, i + PG_IN_CHUNK));
    }

    await db.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session_replication_role = 'replica'`);
      if (studentIds.length > 0) {
        // Bulk-delete every direct student-FK row. Anything we miss is
        // cleaned up implicitly by the suspended FK constraint.
        for (const tbl of [
          "alerts", "behavior_targets", "class_enrollments",
          "compliance_events", "data_sessions", "documents",
          "eligibility_determinations", "emergency_contacts",
          "enrollment_events", "evaluation_referrals", "evaluations",
          "fbas", "guardians", "iep_accommodations", "iep_documents",
          "iep_goals", "medical_alerts", "meeting_consent_records",
          "parent_contacts", "parent_messages", "prior_written_notices",
          "progress_reports", "restraint_incidents",
          "service_requirements", "share_links", "staff_assignments",
          "student_check_ins", "student_notes", "student_wins",
          "submissions", "teacher_observations", "team_meetings",
          "transition_plans",
        ]) {
          for (const chunk of studentChunks) {
            const sIds = sql.raw(`(${chunk.join(",")})`);
            await tx.execute(sql`DELETE FROM ${sql.identifier(tbl)} WHERE student_id IN ${sIds}`);
          }
        }
        for (const chunk of studentChunks) {
          await tx.delete(communicationEventsTable).where(inArray(communicationEventsTable.studentId, chunk));
          await tx.delete(compensatoryObligationsTable).where(inArray(compensatoryObligationsTable.studentId, chunk));
          await tx.delete(studentsTable).where(inArray(studentsTable.id, chunk));
        }
      }
      if (staffIds.length > 0) {
        for (const chunk of staffChunks) {
          const stIds = sql.raw(`(${chunk.join(",")})`);
          await tx.execute(sql`DELETE FROM schedule_blocks WHERE staff_id IN ${stIds}`);
          await tx.execute(sql`DELETE FROM staff_absences WHERE staff_id IN ${stIds}`);
          await tx.execute(sql`DELETE FROM staff_assignments WHERE staff_id IN ${stIds}`);
        }
        for (const chunk of staffChunks) {
          await tx.delete(staffTable).where(inArray(staffTable.id, chunk));
        }
      }
    });
  }

  await db.delete(cptCodeMappingsTable).where(eq(cptCodeMappingsTable.districtId, districtId));

  const agencyIds = (
    await db.select({ id: agenciesTable.id }).from(agenciesTable).where(eq(agenciesTable.districtId, districtId))
  ).map((r) => r.id);
  if (agencyIds.length > 0) {
    await db.delete(agencyContractsTable).where(inArray(agencyContractsTable.agencyId, agencyIds));
    await db.delete(agenciesTable).where(inArray(agenciesTable.id, agencyIds));
  }

  await db.delete(districtSubscriptionsTable).where(eq(districtSubscriptionsTable.districtId, districtId));
  if (schoolIds.length > 0) {
    await db.delete(schoolsTable).where(inArray(schoolsTable.id, schoolIds));
  }
  await db.delete(districtsTable).where(eq(districtsTable.id, districtId));
}

export async function cleanupSubscriptionPlan(planId: number) {
  await db.delete(subscriptionPlansTable).where(eq(subscriptionPlansTable.id, planId));
}

export async function cleanupServiceType(serviceTypeId: number) {
  // Drop dependents in FK order so the parent service_type delete succeeds
  // even when the test left contracts, sessions, or CPT mappings behind.
  await db.delete(cptCodeMappingsTable).where(eq(cptCodeMappingsTable.serviceTypeId, serviceTypeId));
  await db.delete(agencyContractsTable).where(eq(agencyContractsTable.serviceTypeId, serviceTypeId));
  const sessionRows = await db.select({ id: sessionLogsTable.id }).from(sessionLogsTable).where(eq(sessionLogsTable.serviceTypeId, serviceTypeId));
  if (sessionRows.length > 0) {
    const sessionIds = sessionRows.map((r) => r.id);
    await db.delete(contractSessionLinksTable).where(inArray(contractSessionLinksTable.sessionLogId, sessionIds));
    await db.delete(sessionLogsTable).where(inArray(sessionLogsTable.id, sessionIds));
  }
  await db.delete(serviceTypesTable).where(eq(serviceTypesTable.id, serviceTypeId));
}

/**
 * Seed legal acceptances for a set of test user IDs so they pass
 * the requireLegalAcceptance middleware on data routes.
 *
 * Safe to call multiple times (ON CONFLICT DO NOTHING).
 */
export async function seedLegalAcceptances(userIds: string[]): Promise<void> {
  const rows = userIds.flatMap(userId =>
    Object.entries(LEGAL_VERSIONS).map(([documentType, documentVersion]) => ({
      userId,
      documentType,
      documentVersion,
      acceptedAt: new Date(),
    }))
  );
  if (rows.length > 0) {
    await db.insert(legalAcceptancesTable).values(rows).onConflictDoNothing();
  }
}

/** Remove legal acceptances seeded for test users. */
export async function cleanupLegalAcceptances(userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    await db.delete(legalAcceptancesTable).where(eq(legalAcceptancesTable.userId, userId));
  }
}
