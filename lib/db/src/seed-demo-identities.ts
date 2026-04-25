/**
 * Demo / e2e Clerk-test identities.
 *
 * These emails are the canonical Clerk "+clerk_test@example.com" accounts the
 * Noverta demo path, sales walkthrough, and Playwright e2e suite all sign in
 * with. Without a matching `staff` row in some district, `requireDistrictScope`
 * 403s any of these users — which is the trap task #526 set out to fix.
 *
 * Two integration points consume this list:
 *
 *   1. `seed-demo-district.ts` calls `seedDemoIdentities()` at the end of the
 *      canonical reseed so freshly-seeded demo environments come up with
 *      every demo identity already linked to the MetroWest district.
 *
 *   2. `auth.ts -> resolveDistrictFromClerkUser` calls
 *      `ensureDemoStaffForEmail()` as a fallback when a Clerk user has no
 *      staff row yet. If their email is in this list AND a demo district
 *      (is_demo = true) exists, a staff row is auto-provisioned in that
 *      district. This makes the showcase / e2e accounts work out of the box
 *      against any environment that has the demo seed loaded — no manual
 *      INSERT required.
 *
 * Add new demo accounts here, NOT inline in seed-demo-district.ts, so the
 * auto-provision fallback stays in sync with the seed script.
 */
import { db } from "./db";
import { districtsTable, schoolsTable, staffTable } from "./schema";
import { and, eq, isNull, sql } from "drizzle-orm";

export interface DemoIdentity {
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  title: string;
}

/**
 * Rename transition (Trellis → Noverta).
 *
 * Both `trellis-e2e-*` (legacy) and `noverta-e2e-*` (canonical Noverta-era)
 * Clerk-test identities are listed below. Both are auto-provisioned by
 * `ensureDemoStaffForEmail` so:
 *   - existing Clerk dev-instance test users with legacy emails keep
 *     working (no Clerk dashboard change required to ship this code),
 *   - newly-created Clerk dev-instance test users with canonical
 *     `noverta-e2e-*` emails work immediately when the e2e env defaults
 *     are eventually flipped (see e2e/README.md → Rename transition).
 *
 * Because `seedDemoIdentities` is idempotent (it skips an identity whose
 * email already has a row in the demo district and revives soft-deleted
 * rows in place), adding the canonical aliases is a non-destructive
 * extension. The legacy `trellis-e2e-*` rows are NOT removed; removal is
 * gated on Clerk dashboard rename (NEXT-7 §10) and in-repo retirement
 * (NEXT-8).
 */
export const DEMO_IDENTITIES: DemoIdentity[] = [
  {
    email: "trellis-e2e-admin+clerk_test@example.com",
    role: "admin",
    firstName: "E2E",
    lastName: "Admin",
    title: "Director of Student Services (E2E)",
  },
  {
    email: "trellis-e2e-teacher+clerk_test@example.com",
    role: "sped_teacher",
    firstName: "E2E",
    lastName: "Teacher",
    title: "Special Education Teacher (E2E)",
  },
  // Canonical Noverta-era aliases. Same role + auto-provision policy as
  // the legacy `trellis-e2e-*` rows above — added so the e2e suite can
  // be flipped to `noverta-e2e-*` defaults without a server-side code
  // change. Until E2E_*_EMAIL envs are pointed at these addresses,
  // these rows are inserted but unused.
  {
    email: "noverta-e2e-admin+clerk_test@example.com",
    role: "admin",
    firstName: "E2E",
    lastName: "Admin",
    title: "Director of Student Services (E2E)",
  },
  {
    email: "noverta-e2e-teacher+clerk_test@example.com",
    role: "sped_teacher",
    firstName: "E2E",
    lastName: "Teacher",
    title: "Special Education Teacher (E2E)",
  },
  {
    email: "showcase-walker+clerk_test@example.com",
    role: "admin",
    firstName: "Showcase",
    lastName: "Walker",
    title: "Demo Walkthrough Admin",
  },
];

const DEMO_EMAIL_SET = new Set(DEMO_IDENTITIES.map((i) => i.email.toLowerCase()));

export function isDemoIdentityEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return DEMO_EMAIL_SET.has(email.toLowerCase());
}

export function findDemoIdentity(email: string): DemoIdentity | null {
  const lower = email.toLowerCase();
  return DEMO_IDENTITIES.find((i) => i.email.toLowerCase() === lower) ?? null;
}

/**
 * Find the canonical demo district id (is_demo = true). Returns null when no
 * demo district exists — caller MUST treat this as "not auto-provisionable"
 * and fall through to the normal access-denied path. We intentionally do
 * NOT create a district here; that would let a demo email bootstrap a tenant
 * on any environment, including production.
 */
export async function findDemoDistrictId(): Promise<number | null> {
  const rows = await db
    .select({ id: districtsTable.id })
    .from(districtsTable)
    .where(eq(districtsTable.isDemo, true))
    .limit(1);
  return rows[0]?.id ?? null;
}

async function pickDemoSchoolId(districtId: number): Promise<number | null> {
  const rows = await db
    .select({ id: schoolsTable.id })
    .from(schoolsTable)
    .where(eq(schoolsTable.districtId, districtId))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * Insert (or revive) staff rows for every entry in DEMO_IDENTITIES under the
 * given demo district. Idempotent: existing rows for the same email under the
 * same district are left in place (only un-deleted if they were soft-deleted).
 *
 * Returns the count of rows newly inserted vs. already-present.
 */
export async function seedDemoIdentities(
  districtId: number,
): Promise<{ inserted: number; existing: number; revived: number }> {
  const schoolId = await pickDemoSchoolId(districtId);
  if (schoolId == null) {
    throw new Error(
      `seedDemoIdentities: demo district ${districtId} has no schools — run seedDemoDistrict first.`,
    );
  }
  let inserted = 0;
  let existing = 0;
  let revived = 0;
  for (const identity of DEMO_IDENTITIES) {
    const existingRows = await db
      .select({ id: staffTable.id, deletedAt: staffTable.deletedAt, schoolId: staffTable.schoolId })
      .from(staffTable)
      .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
      .where(
        and(
          eq(schoolsTable.districtId, districtId),
          eq(sql`lower(${staffTable.email})`, identity.email.toLowerCase()),
        ),
      )
      .limit(1);
    if (existingRows.length > 0) {
      const row = existingRows[0];
      if (row.deletedAt != null) {
        await db
          .update(staffTable)
          .set({ deletedAt: null, status: "active" })
          .where(eq(staffTable.id, row.id));
        revived += 1;
      } else {
        existing += 1;
      }
      continue;
    }
    await db.insert(staffTable).values({
      firstName: identity.firstName,
      lastName: identity.lastName,
      email: identity.email,
      role: identity.role,
      title: identity.title,
      schoolId,
      status: "active",
    });
    inserted += 1;
  }
  return { inserted, existing, revived };
}

/**
 * Auto-provision a single demo identity into the existing demo district.
 *
 * Called from `requireDistrictScope` when a Clerk user has no staff row but
 * their email matches a known demo / e2e identity. Returns the resolved
 * demo districtId on success, or null if:
 *   - the email is not in DEMO_IDENTITIES
 *   - no district has is_demo=true
 *   - the demo district has no schools yet (seed-demo-district hasn't run)
 *
 * Idempotent: if a staff row for this email already exists in the demo
 * district, it's left in place (or revived if soft-deleted) and the
 * districtId is returned.
 */
export async function ensureDemoStaffForEmail(
  email: string,
): Promise<number | null> {
  const identity = findDemoIdentity(email);
  if (!identity) return null;
  const districtId = await findDemoDistrictId();
  if (districtId == null) return null;
  const schoolId = await pickDemoSchoolId(districtId);
  if (schoolId == null) return null;

  const existingRows = await db
    .select({ id: staffTable.id, deletedAt: staffTable.deletedAt })
    .from(staffTable)
    .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
    .where(
      and(
        eq(schoolsTable.districtId, districtId),
        eq(sql`lower(${staffTable.email})`, identity.email.toLowerCase()),
      ),
    )
    .limit(1);

  if (existingRows.length > 0) {
    if (existingRows[0].deletedAt != null) {
      await db
        .update(staffTable)
        .set({ deletedAt: null, status: "active" })
        .where(eq(staffTable.id, existingRows[0].id));
    }
    return districtId;
  }

  // Race-safe insert: a parallel request for the same demo email may have
  // just created the row. Re-check via the active-staff lookup if the insert
  // surfaces a unique-constraint-style error and fall through.
  try {
    await db.insert(staffTable).values({
      firstName: identity.firstName,
      lastName: identity.lastName,
      email: identity.email,
      role: identity.role,
      title: identity.title,
      schoolId,
      status: "active",
    });
  } catch (err) {
    // Best-effort: if the row now exists thanks to another request, treat as success.
    const recheck = await db
      .select({ id: staffTable.id })
      .from(staffTable)
      .innerJoin(schoolsTable, eq(staffTable.schoolId, schoolsTable.id))
      .where(
        and(
          eq(schoolsTable.districtId, districtId),
          isNull(staffTable.deletedAt),
          eq(sql`lower(${staffTable.email})`, identity.email.toLowerCase()),
        ),
      )
      .limit(1);
    if (recheck.length === 0) throw err;
  }
  return districtId;
}
