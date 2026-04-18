/**
 * SIS sync withdrawal event tests.
 *
 * These tests verify that `archiveMissingStudents` (exercised via `runSync`)
 * correctly inserts a `withdrawn` enrollment event when a previously active
 * student disappears from the SIS feed, and that no event is created when the
 * student was already inactive.
 *
 * The connector is mocked at the module level so we can control which
 * externalIds the "SIS" reports without making real network calls.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@workspace/db";
import {
  sisConnectionsTable,
  sisSyncLogsTable,
  studentsTable,
  enrollmentEventsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { createDistrict, createSchool, cleanupDistrict } from "./helpers";
import { runSync } from "../src/lib/sis/syncEngine";

// ---------------------------------------------------------------------------
// Mock the SIS connector so tests never make network requests.
// We configure `fetchStudents` per-test via the `mockFetchStudents` ref.
// ---------------------------------------------------------------------------

const mockFetchStudents = vi.fn();
const mockFetchStaff = vi.fn();

vi.mock("../src/lib/sis/index", async (importActual) => {
  const actual = await importActual<typeof import("../src/lib/sis/index")>();
  return {
    ...actual,
    getConnector: (_provider: string) => ({
      provider: "powerschool",
      testConnection: vi.fn().mockResolvedValue({ ok: true, message: "ok" }),
      fetchStudents: mockFetchStudents,
      fetchStaff: mockFetchStaff,
      fetchAttendance: vi.fn().mockResolvedValue({ records: [], errors: [] }),
    }),
  };
});

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

let districtId: number;
let schoolId: number;
const connectionIds: number[] = [];

async function createConnection(): Promise<number> {
  const [conn] = await db
    .insert(sisConnectionsTable)
    .values({
      districtId,
      provider: "powerschool",
      label: `test-sis-conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      enabled: true,
      status: "connected",
      syncSchedule: "manual",
    })
    .returning();
  connectionIds.push(conn.id);
  return conn.id;
}

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "test");
  const district = await createDistrict();
  districtId = district.id;
  const school = await createSchool(districtId);
  schoolId = school.id;

  // Default staff mock so runSync's "full" path doesn't fail on fetchStaff.
  mockFetchStaff.mockResolvedValue({ records: [], errors: [] });
});

afterAll(async () => {
  // Clean up in FK order:
  //   enrollment_events → students → sis_sync_logs → sis_connections → district
  if (connectionIds.length > 0) {
    const studentRows = await db
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(inArray(studentsTable.sisConnectionId, connectionIds));
    const studentIds = studentRows.map((r) => r.id);

    if (studentIds.length > 0) {
      await db
        .delete(enrollmentEventsTable)
        .where(inArray(enrollmentEventsTable.studentId, studentIds));
      await db
        .delete(studentsTable)
        .where(inArray(studentsTable.id, studentIds));
    }

    await db
      .delete(sisSyncLogsTable)
      .where(inArray(sisSyncLogsTable.connectionId, connectionIds));
    await db
      .delete(sisConnectionsTable)
      .where(inArray(sisConnectionsTable.id, connectionIds));
  }

  await cleanupDistrict(districtId);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("archiveMissingStudents — withdrawal enrollment events", () => {
  it("inserts a withdrawn enrollment event when an active student is absent from the SIS feed", async () => {
    const connectionId = await createConnection();

    // Seed an active student linked to this connection.  She will NOT appear
    // in the mocked SIS response, so the engine must archive her.
    const [missingStudent] = await db
      .insert(studentsTable)
      .values({
        firstName: "Alice",
        lastName: "Missing",
        schoolId,
        status: "active",
        externalId: "sis-ext-missing-001",
        sisConnectionId: connectionId,
        sisManaged: "true",
      })
      .returning();

    // The SIS returns a different student — Alice is nowhere in the feed.
    mockFetchStudents.mockResolvedValueOnce({
      records: [
        {
          externalId: "sis-ext-present-001",
          firstName: "Bob",
          lastName: "Present",
          enrollmentStatus: "active",
        },
      ],
      errors: [],
    });

    const result = await runSync(connectionId, "full", "test:withdrawal-event");

    // Engine-level counter
    expect(result.studentsArchived).toBe(1);

    // The student must be inactive now.
    const [updated] = await db
      .select({ status: studentsTable.status })
      .from(studentsTable)
      .where(eq(studentsTable.id, missingStudent.id));
    expect(updated.status).toBe("inactive");

    // The withdrawal event must exist with the correct fields.
    const events = await db
      .select()
      .from(enrollmentEventsTable)
      .where(eq(enrollmentEventsTable.studentId, missingStudent.id));

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("withdrawn");
    expect(events[0].source).toBe("sis_sync");
    expect(events[0].reason).toBe("Not found in SIS feed");
    // eventDate is today's ISO date (YYYY-MM-DD)
    expect(events[0].eventDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("does not create a duplicate withdrawal event when a full sync runs twice with the student still missing", async () => {
    const connectionId = await createConnection();

    const [missingStudent] = await db
      .insert(studentsTable)
      .values({
        firstName: "Eve",
        lastName: "TwiceMissing",
        schoolId,
        status: "active",
        externalId: "sis-ext-twice-missing-001",
        sisConnectionId: connectionId,
        sisManaged: "true",
      })
      .returning();

    // The SIS feed never includes Eve, on either sync.
    mockFetchStudents.mockResolvedValue({
      records: [
        {
          externalId: "sis-ext-other-twice-001",
          firstName: "Frank",
          lastName: "Other",
          enrollmentStatus: "active",
        },
      ],
      errors: [],
    });

    // First sync archives Eve and writes one withdrawn event.
    const first = await runSync(connectionId, "full", "test:dup-withdrawal-1");
    expect(first.studentsArchived).toBe(1);

    // Reactivate her so archiveMissingStudents will consider her again on the
    // second sync — this simulates a retry/requeue where the same date's run
    // re-evaluates the same student.
    await db
      .update(studentsTable)
      .set({ status: "active" })
      .where(eq(studentsTable.id, missingStudent.id));

    const second = await runSync(connectionId, "full", "test:dup-withdrawal-2");
    expect(second.studentsArchived).toBe(1);

    // Despite two syncs archiving her on the same date, only ONE withdrawn
    // event should exist for this student.
    const events = await db
      .select()
      .from(enrollmentEventsTable)
      .where(eq(enrollmentEventsTable.studentId, missingStudent.id));

    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe("withdrawn");
    expect(events[0].source).toBe("sis_sync");
  });

  it("does not create a withdrawal event for a student who was already inactive", async () => {
    const connectionId = await createConnection();

    // Seed an already-inactive student.  archiveMissingStudents only
    // considers *active* students, so this one must never receive an event.
    const [inactiveStudent] = await db
      .insert(studentsTable)
      .values({
        firstName: "Carol",
        lastName: "Inactive",
        schoolId,
        status: "inactive",
        externalId: "sis-ext-inactive-001",
        sisConnectionId: connectionId,
        sisManaged: "true",
      })
      .returning();

    // The SIS returns a completely different student, so Carol is absent from
    // the feed — but she's inactive already and must be left untouched.
    mockFetchStudents.mockResolvedValueOnce({
      records: [
        {
          externalId: "sis-ext-active-002",
          firstName: "Dave",
          lastName: "Active",
          enrollmentStatus: "active",
        },
      ],
      errors: [],
    });

    const result = await runSync(connectionId, "full", "test:no-event-inactive");

    // Nothing should have been archived.
    expect(result.studentsArchived).toBe(0);

    // No enrollment event should have been created for the inactive student.
    const events = await db
      .select()
      .from(enrollmentEventsTable)
      .where(eq(enrollmentEventsTable.studentId, inactiveStudent.id));

    expect(events).toHaveLength(0);
  });
});
