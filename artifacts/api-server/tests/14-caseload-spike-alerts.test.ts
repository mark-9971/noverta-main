/**
 * Tests for runCaseloadSnapshots — the weekly caseload snapshot job that also
 * generates `caseload_spike` alerts when a provider's caseload grows beyond
 * the configured threshold week-over-week.
 *
 * Covers:
 *  - Alert created when caseload grows beyond default +20% threshold
 *  - No alert when growth is at/below threshold
 *  - No alert without a prior-week baseline (first capture)
 *  - No alert when caseload shrinks
 *  - Configurable threshold via CASELOAD_SPIKE_THRESHOLD_PCT env var
 *  - Deduplication: a second run for the same week creates no extra alerts
 *  - Monday-only gate: non-Monday runs are no-ops
 *  - Alert message includes provider name and week-over-week delta
 *  - District isolation: a spike in one district does not surface in another
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import {
  db,
  alertsTable,
  caseloadSnapshotsTable,
  staffAssignmentsTable,
  staffTable,
  studentsTable,
  schoolsTable,
} from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import {
  createDistrict,
  createSchool,
  createStudent,
  createStaff,
  cleanupDistrict,
} from "./helpers";
import { runCaseloadSnapshots } from "../src/lib/reminders";
import { asUser, seedLegalAcceptances, cleanupLegalAcceptances } from "./helpers";

function mostRecentMonday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return d;
}

function getCaseloadWeekStart(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

let districtId: number;
let schoolId: number;
const insertedDistrictIds: number[] = [];

const MONDAY = mostRecentMonday();
const PREV_MONDAY = (() => {
  const d = new Date(MONDAY);
  d.setDate(d.getDate() - 7);
  return d;
})();

beforeAll(async () => {
  const district = await createDistrict({ name: "Test District Caseload Spikes" });
  districtId = district.id;
  insertedDistrictIds.push(districtId);
  const school = await createSchool(districtId);
  schoolId = school.id;
});

afterAll(async () => {
  // Drop spike alerts and caseload snapshots before letting cleanupDistrict
  // walk the FK tree. Also nuke staff_assignments that reference staff/students
  // in our test districts — helpers.cleanupDistrict deletes students directly
  // and the staff_assignments FK has no cascade.
  for (const id of insertedDistrictIds) {
    await db.delete(caseloadSnapshotsTable).where(eq(caseloadSnapshotsTable.districtId, id));

    const schoolIds = (
      await db.select({ id: schoolsTable.id }).from(schoolsTable).where(eq(schoolsTable.districtId, id))
    ).map(r => r.id);
    if (schoolIds.length > 0) {
      const staffIds = (
        await db.select({ id: staffTable.id }).from(staffTable).where(inArray(staffTable.schoolId, schoolIds))
      ).map(r => r.id);
      const studentIds = (
        await db.select({ id: studentsTable.id }).from(studentsTable).where(inArray(studentsTable.schoolId, schoolIds))
      ).map(r => r.id);
      if (staffIds.length > 0) {
        await db.delete(alertsTable).where(inArray(alertsTable.staffId, staffIds));
        await db.delete(staffAssignmentsTable).where(inArray(staffAssignmentsTable.staffId, staffIds));
      }
      if (studentIds.length > 0) {
        await db.delete(staffAssignmentsTable).where(inArray(staffAssignmentsTable.studentId, studentIds));
      }
    }

    await cleanupDistrict(id);
  }
});

beforeEach(async () => {
  // Ensure a clean slate for caseload_spike alerts and snapshots in our district
  // so each test starts from zero. Other test suites manage their own scopes.
  await db.delete(alertsTable).where(eq(alertsTable.type, "caseload_spike"));
  await db.delete(caseloadSnapshotsTable).where(eq(caseloadSnapshotsTable.districtId, districtId));
  delete process.env.CASELOAD_SPIKE_THRESHOLD_PCT;
});

/**
 * Create N students assigned to the given staff (active assignments).
 * Returns the inserted student IDs.
 */
async function assignStudents(staffId: number, count: number): Promise<number[]> {
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    const s = await createStudent(schoolId);
    await db.insert(staffAssignmentsTable).values({
      staffId,
      studentId: s.id,
      assignmentType: "primary",
    });
    ids.push(s.id);
  }
  return ids;
}

/**
 * Insert a snapshot row for the prior week so the spike comparison has a
 * baseline without needing a second runCaseloadSnapshots() invocation.
 */
async function seedPrevWeekSnapshot(staffId: number, studentCount: number): Promise<void> {
  await db.insert(caseloadSnapshotsTable).values({
    districtId,
    staffId,
    weekStart: getCaseloadWeekStart(PREV_MONDAY),
    studentCount,
  });
}

async function fetchSpikeAlertsForStaff(staffId: number) {
  return db
    .select()
    .from(alertsTable)
    .where(and(eq(alertsTable.type, "caseload_spike"), eq(alertsTable.staffId, staffId)));
}

describe("runCaseloadSnapshots — caseload_spike alerts", () => {
  it("creates an alert when a provider's caseload grows beyond the +20% default threshold", async () => {
    const staff = await createStaff(schoolId, { role: "provider", status: "active" });
    await seedPrevWeekSnapshot(staff.id, 10);
    await assignStudents(staff.id, 13); // 10 → 13 = +30%

    await runCaseloadSnapshots(MONDAY);

    const alerts = await fetchSpikeAlertsForStaff(staff.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].type).toBe("caseload_spike");
    expect(alerts[0].staffId).toBe(staff.id);
    expect(alerts[0].resolved).toBe(false);
  });

  it("does NOT create an alert when growth is at or below the threshold", async () => {
    const staff = await createStaff(schoolId, { role: "provider", status: "active" });
    await seedPrevWeekSnapshot(staff.id, 10);
    await assignStudents(staff.id, 12); // 10 → 12 = +20% (not strictly >)

    await runCaseloadSnapshots(MONDAY);

    const alerts = await fetchSpikeAlertsForStaff(staff.id);
    expect(alerts).toHaveLength(0);
  });

  it("does NOT create an alert without a prior-week baseline (first ever snapshot)", async () => {
    const staff = await createStaff(schoolId, { role: "provider", status: "active" });
    // No prev-week snapshot seeded.
    await assignStudents(staff.id, 25);

    await runCaseloadSnapshots(MONDAY);

    const alerts = await fetchSpikeAlertsForStaff(staff.id);
    expect(alerts).toHaveLength(0);
  });

  it("does NOT create an alert when a provider's caseload shrinks", async () => {
    const staff = await createStaff(schoolId, { role: "provider", status: "active" });
    await seedPrevWeekSnapshot(staff.id, 20);
    await assignStudents(staff.id, 5); // shrunk

    await runCaseloadSnapshots(MONDAY);

    const alerts = await fetchSpikeAlertsForStaff(staff.id);
    expect(alerts).toHaveLength(0);
  });

  it("respects a custom CASELOAD_SPIKE_THRESHOLD_PCT environment override", async () => {
    process.env.CASELOAD_SPIKE_THRESHOLD_PCT = "50";

    const staffBelow = await createStaff(schoolId, { role: "provider", status: "active" });
    await seedPrevWeekSnapshot(staffBelow.id, 10);
    await assignStudents(staffBelow.id, 14); // +40%, below 50% threshold

    const staffAbove = await createStaff(schoolId, { role: "provider", status: "active" });
    await seedPrevWeekSnapshot(staffAbove.id, 10);
    await assignStudents(staffAbove.id, 16); // +60%, above 50% threshold

    await runCaseloadSnapshots(MONDAY);

    expect(await fetchSpikeAlertsForStaff(staffBelow.id)).toHaveLength(0);
    expect(await fetchSpikeAlertsForStaff(staffAbove.id)).toHaveLength(1);
  });

  it("does not insert duplicate alerts when the job runs twice in the same week", async () => {
    const staff = await createStaff(schoolId, { role: "provider", status: "active" });
    await seedPrevWeekSnapshot(staff.id, 10);
    await assignStudents(staff.id, 15); // +50%

    await runCaseloadSnapshots(MONDAY);
    await runCaseloadSnapshots(MONDAY);

    const alerts = await fetchSpikeAlertsForStaff(staff.id);
    expect(alerts).toHaveLength(1);
  });

  it("is a no-op on non-Monday runs", async () => {
    const staff = await createStaff(schoolId, { role: "provider", status: "active" });
    await seedPrevWeekSnapshot(staff.id, 10);
    await assignStudents(staff.id, 20); // +100% — would alert on Monday

    const tuesday = new Date(MONDAY);
    tuesday.setDate(tuesday.getDate() + 1);
    expect(tuesday.getDay()).not.toBe(1);

    await runCaseloadSnapshots(tuesday);

    const alerts = await fetchSpikeAlertsForStaff(staff.id);
    expect(alerts).toHaveLength(0);
    // And no current-week snapshot should have been written either.
    const snaps = await db
      .select()
      .from(caseloadSnapshotsTable)
      .where(and(eq(caseloadSnapshotsTable.staffId, staff.id), eq(caseloadSnapshotsTable.weekStart, getCaseloadWeekStart(MONDAY))));
    expect(snaps).toHaveLength(0);
  });

  it("includes provider name and week-over-week delta in the alert message", async () => {
    const staff = await createStaff(schoolId, {
      role: "provider",
      status: "active",
      firstName: "Jordan",
      lastName: "Rivera",
    });
    await seedPrevWeekSnapshot(staff.id, 8);
    await assignStudents(staff.id, 12); // +50%, +4 students

    await runCaseloadSnapshots(MONDAY);

    const alerts = await fetchSpikeAlertsForStaff(staff.id);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toContain("Jordan Rivera");
    expect(alerts[0].message).toContain("+50%");
    expect(alerts[0].message).toContain("8");
    expect(alerts[0].message).toContain("12");
    const weekStr = getCaseloadWeekStart(MONDAY).toISOString().substring(0, 10);
    expect(alerts[0].message).toContain(`[week:${weekStr}]`);
  });
});

describe("Alerts API — caseload_spike visibility", () => {
  it("returns caseload_spike alerts to district admins via /api/alerts when filtering by districtId", async () => {
    const adminId = "u_admin_caseload_spike_visibility";
    await seedLegalAcceptances([adminId]);

    const staff = await createStaff(schoolId, {
      role: "provider",
      status: "active",
      firstName: "Casey",
      lastName: "Diaz",
    });
    await seedPrevWeekSnapshot(staff.id, 6);
    await assignStudents(staff.id, 12); // +100% — guaranteed spike

    await runCaseloadSnapshots(MONDAY);

    const admin = asUser({ userId: adminId, role: "admin", districtId });
    const res = await admin.get(`/api/alerts?type=caseload_spike&districtId=${districtId}`);

    expect(res.status).toBe(200);
    const spikeAlerts = (res.body.data as Array<Record<string, unknown>>).filter(
      a => a.staffId === staff.id,
    );
    expect(spikeAlerts).toHaveLength(1);
    expect(spikeAlerts[0].type).toBe("caseload_spike");
    expect(spikeAlerts[0].staffName).toBe("Casey Diaz");
    expect(String(spikeAlerts[0].message)).toContain("+100%");

    await cleanupLegalAcceptances([adminId]);
  });

  it("returns caseload_spike alerts when filtering by schoolId", async () => {
    const adminId = "u_admin_caseload_spike_school";
    await seedLegalAcceptances([adminId]);

    const staff = await createStaff(schoolId, {
      role: "provider",
      status: "active",
      firstName: "Avery",
      lastName: "Khan",
    });
    await seedPrevWeekSnapshot(staff.id, 5);
    await assignStudents(staff.id, 10); // +100% — guaranteed spike

    await runCaseloadSnapshots(MONDAY);

    const admin = asUser({ userId: adminId, role: "admin", districtId });
    const res = await admin.get(`/api/alerts?type=caseload_spike&schoolId=${schoolId}`);

    expect(res.status).toBe(200);
    const spikeAlerts = (res.body.data as Array<Record<string, unknown>>).filter(
      a => a.staffId === staff.id,
    );
    expect(spikeAlerts).toHaveLength(1);

    await cleanupLegalAcceptances([adminId]);
  });
});

describe("runCaseloadSnapshots — district isolation", () => {
  it("does not raise alerts in another district when a provider there spikes", async () => {
    const otherDistrict = await createDistrict({ name: "Test District Caseload Spikes Other" });
    insertedDistrictIds.push(otherDistrict.id);
    const otherSchool = await createSchool(otherDistrict.id);
    const otherStaff = await createStaff(otherSchool.id, { role: "provider", status: "active" });

    // Seed prev-week snapshot for the other-district provider.
    await db.insert(caseloadSnapshotsTable).values({
      districtId: otherDistrict.id,
      staffId: otherStaff.id,
      weekStart: getCaseloadWeekStart(PREV_MONDAY),
      studentCount: 5,
    });
    // Assign new students in the other district.
    for (let i = 0; i < 10; i++) {
      const s = await createStudent(otherSchool.id);
      await db.insert(staffAssignmentsTable).values({
        staffId: otherStaff.id,
        studentId: s.id,
        assignmentType: "primary",
      });
    }

    // Primary-district provider with NO spike.
    const mainStaff = await createStaff(schoolId, { role: "provider", status: "active" });
    await seedPrevWeekSnapshot(mainStaff.id, 10);
    await assignStudents(mainStaff.id, 11); // +10%, no alert

    await runCaseloadSnapshots(MONDAY);

    expect(await fetchSpikeAlertsForStaff(otherStaff.id)).toHaveLength(1);
    expect(await fetchSpikeAlertsForStaff(mainStaff.id)).toHaveLength(0);

    // Cleanup snapshots for the other district before afterAll cascade.
    await db.delete(caseloadSnapshotsTable).where(eq(caseloadSnapshotsTable.districtId, otherDistrict.id));
    await db.delete(alertsTable).where(and(eq(alertsTable.type, "caseload_spike"), inArray(alertsTable.staffId, [otherStaff.id, mainStaff.id])));
  });
});
