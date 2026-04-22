/**
 * Sample-data size profiles — dashboards render for small and large districts.
 *
 * The sample-data seeder produces three size profiles (small=20/3,
 * medium=60/10, large=120/18 students/staff). The "done looks like" criterion
 * for the size-profile work is that **dashboards render correctly across all
 * profiles** — a small profile has a single case manager and no OT/PT/
 * counselor staff, and a large profile has multiple case managers carrying
 * variety in their caseloads. A panel that only ever ran against the medium
 * profile could break at either end and ship undetected.
 *
 * This suite seeds a throwaway district end-to-end at each non-default
 * profile, hits the dashboard / overview API endpoints an admin first lands
 * on after seeding, and asserts:
 *
 *   1. The expected staff/student counts land in the database.
 *   2. Every dashboard endpoint returns 200 with a well-formed JSON body
 *      (no 500s, no partial-payload `error` keys).
 *   3. Caseload distribution looks right: the small profile has exactly one
 *      case manager owning all caseloaded students, and the large profile
 *      has multiple distinct case managers each carrying a non-zero share.
 *
 * The medium profile already has end-to-end coverage in
 * `e2e/tests/sample-data-flow.spec.ts` and `sample-data-tour.spec.ts`, so we
 * intentionally do not reseed it here.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asUser, createDistrict, cleanupDistrict, seedLegalAcceptances, cleanupLegalAcceptances } from "./helpers";
import {
  db,
  schoolsTable,
  studentsTable,
  staffTable,
  seedSampleDataForDistrict,
  teardownSampleData,
} from "@workspace/db";
import { and, eq, inArray, isNotNull } from "drizzle-orm";

/**
 * Endpoints the admin's overview / risk pages call on first load. Each must
 * return 200 with no `error` key for the seeded sample district. We hit the
 * tier-agnostic ones so an "essentials" district (the default for fresh
 * tenants) is what's exercised — the same surface a brand-new admin sees
 * after clicking "Try with sample data".
 */
const DASHBOARD_ENDPOINTS: ReadonlyArray<string> = [
  "/api/dashboard/summary",
  "/api/dashboard/risk-overview",
  "/api/dashboard/needs-attention",
  "/api/dashboard/alerts-summary",
  "/api/dashboard/critical-medical-alerts",
  "/api/dashboard/iep-expirations",
  "/api/dashboard/credential-expiration",
  "/api/dashboard/health-score-trend",
  "/api/dashboard/school-compliance",
  "/api/dashboard/missed-sessions-trend",
  "/api/dashboard/iep-calendar",
  "/api/dashboard/compliance-by-service",
  "/api/dashboard/compliance-trends",
  "/api/dashboard/parent-engagement",
  "/api/dashboard/makeup-obligations",
];

interface CaseloadShape {
  caseManagerCount: number;
  caseloadedStudents: number;
  perCaseManager: Map<number, number>;
}

async function caseloadShape(districtId: number): Promise<CaseloadShape> {
  const schools = await db.select({ id: schoolsTable.id })
    .from(schoolsTable).where(eq(schoolsTable.districtId, districtId));
  const schoolIds = schools.map(s => s.id);

  const cms = schoolIds.length === 0 ? [] : await db.select({ id: staffTable.id })
    .from(staffTable)
    .where(and(
      inArray(staffTable.schoolId, schoolIds),
      eq(staffTable.role, "case_manager"),
      eq(staffTable.isSample, true),
    ));

  const students = schoolIds.length === 0 ? [] : await db.select({
    id: studentsTable.id,
    caseManagerId: studentsTable.caseManagerId,
  })
    .from(studentsTable)
    .where(and(
      inArray(studentsTable.schoolId, schoolIds),
      eq(studentsTable.isSample, true),
      isNotNull(studentsTable.caseManagerId),
    ));

  const perCaseManager = new Map<number, number>();
  for (const s of students) {
    if (s.caseManagerId == null) continue;
    perCaseManager.set(s.caseManagerId, (perCaseManager.get(s.caseManagerId) ?? 0) + 1);
  }

  return {
    caseManagerCount: cms.length,
    caseloadedStudents: students.length,
    perCaseManager,
  };
}

async function totals(districtId: number): Promise<{ students: number; staff: number }> {
  const schools = await db.select({ id: schoolsTable.id })
    .from(schoolsTable).where(eq(schoolsTable.districtId, districtId));
  const schoolIds = schools.map(s => s.id);
  if (schoolIds.length === 0) return { students: 0, staff: 0 };
  const [studentRows, staffRows] = await Promise.all([
    db.select({ id: studentsTable.id }).from(studentsTable)
      .where(and(inArray(studentsTable.schoolId, schoolIds), eq(studentsTable.isSample, true))),
    db.select({ id: staffTable.id }).from(staffTable)
      .where(and(inArray(staffTable.schoolId, schoolIds), eq(staffTable.isSample, true))),
  ]);
  return { students: studentRows.length, staff: staffRows.length };
}

describe("sample-data size profiles render dashboards", () => {
  describe.each([
    {
      profile: "small" as const,
      userId: "u_size_small",
      expectedStudents: 20,
      // PRE-1 hardening: load-aware floor adds +1 each to BCBA and Speech
      // for the 20-student small profile (1 CM + 2 BCBA + 2 SLP = 5).
      // Was 3 before the floor existed, but at 20 students × 0.40 share ×
      // 360 worst-case min the single BCBA was already over the
      // PROVIDER_MONTHLY_MIN_CAPACITY (≈8473 min/mo) envelope.
      expectedStaff: 5,
      expectedCaseManagers: 1,
    },
    {
      profile: "large" as const,
      userId: "u_size_large",
      expectedStudents: 120,
      // PRE-1 hardening: load-aware floor lifts BCBA (2→4, +2), Speech
      // (2→5, +3), OT (2→4, +2), PT (1→3, +2), Counselor (2→4, +2) at
      // 120 students with worst-case 360 min/mo. Net +11 over the unsafe
      // pre-PRE-1 baseline of 18 → 29. Case manager / para / admin slots
      // are unchanged because they have no SPECIALTY_LOAD_SHARE entry.
      expectedStaff: 29,
      // SCENARIO_COUNTS_BY_PROFILE.large maps to 6 case managers in
      // STAFF_BY_PROFILE.large — caseload-balancing UI groups by CM.
      expectedCaseManagers: 6,
    },
  ])("$profile profile (~$expectedStudents students / $expectedStaff staff)", (profileCase) => {
    let districtId: number;

    beforeAll(async () => {
      await seedLegalAcceptances([profileCase.userId]);
      const d = await createDistrict({ name: `Sample-Profile-${profileCase.profile}-${Date.now()}` });
      districtId = d.id;
      await seedSampleDataForDistrict(districtId, { sizeProfile: profileCase.profile });
    }, 240_000);

    afterAll(async () => {
      try {
        await teardownSampleData(districtId);
      } catch {
        // best-effort: cleanupDistrict below sweeps anything teardown missed
      }
      await cleanupDistrict(districtId);
      await cleanupLegalAcceptances([profileCase.userId]);
    }, 120_000);

    it(`seeds the expected number of sample students and staff`, async () => {
      const t = await totals(districtId);
      expect(t.students).toBe(profileCase.expectedStudents);
      expect(t.staff).toBe(profileCase.expectedStaff);
    });

    it(`caseload distribution matches the profile`, async () => {
      const shape = await caseloadShape(districtId);
      expect(shape.caseManagerCount).toBe(profileCase.expectedCaseManagers);
      // Every caseloaded student must be assigned to a real case manager
      // (the seeder must not leave students dangling on a CM that doesn't
      // exist for this profile). At least one student is caseloaded.
      expect(shape.caseloadedStudents).toBeGreaterThan(0);
      // Each case manager that exists should be carrying at least one
      // student — otherwise the seeder built a CM the dashboard would
      // render as empty, which is a regression on the size-profile work.
      expect(shape.perCaseManager.size).toBe(profileCase.expectedCaseManagers);
      for (const [cmId, n] of shape.perCaseManager) {
        expect(n, `case manager ${cmId} should carry at least one student`).toBeGreaterThan(0);
      }
      if (profileCase.profile === "large") {
        // Multi-CM grouping: the largest CM caseload must not contain every
        // caseloaded student (i.e. distribution actually spreads).
        const largest = Math.max(...shape.perCaseManager.values());
        expect(largest).toBeLessThan(shape.caseloadedStudents);
      }
    });

    it.each(DASHBOARD_ENDPOINTS)(
      `GET %s returns 200 without an error payload`,
      async (path) => {
        const admin = asUser({ userId: profileCase.userId, role: "admin", districtId });
        const res = await admin.get(path);
        expect(
          res.status,
          `${path} responded ${res.status}: ${JSON.stringify(res.body).slice(0, 400)}`,
        ).toBe(200);
        // Routes that fail soft return `{ error: "..." }` with a 200 in some
        // cases; the dashboards treat that as broken state. Reject it.
        if (res.body && typeof res.body === "object" && !Array.isArray(res.body)) {
          expect(res.body.error, `${path} returned soft error`).toBeUndefined();
        }
      },
      30_000,
    );
  });
});
