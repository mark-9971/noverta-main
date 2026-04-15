import { db, pool } from "@workspace/db";
import { schoolYearsTable, studentsTable, schoolsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

const cache = new Map<number, { id: number; expiresAt: number }>();
const CACHE_TTL = 60_000;

export async function ensureDbConstraints(): Promise<void> {
  try {
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS sy_district_active_unique
      ON school_years (district_id)
      WHERE is_active = true;
    `);
  } catch (err: any) {
    if (!err.message?.includes("already exists")) {
      console.warn("ensureDbConstraints: could not create sy_district_active_unique:", err.message);
    }
  }
}

export async function getActiveSchoolYearId(districtId: number): Promise<number | null> {
  const cached = cache.get(districtId);
  if (cached && Date.now() < cached.expiresAt) return cached.id;

  const [year] = await db
    .select({ id: schoolYearsTable.id })
    .from(schoolYearsTable)
    .where(and(eq(schoolYearsTable.districtId, districtId), eq(schoolYearsTable.isActive, true)));

  if (!year) return null;
  cache.set(districtId, { id: year.id, expiresAt: Date.now() + CACHE_TTL });
  return year.id;
}

export function invalidateActiveYearCache(districtId: number) {
  cache.delete(districtId);
}

export async function getActiveSchoolYearIdForStudent(studentId: number): Promise<number | null> {
  const result = await db
    .select({ yearId: schoolYearsTable.id })
    .from(studentsTable)
    .innerJoin(schoolsTable, eq(schoolsTable.id, studentsTable.schoolId))
    .innerJoin(
      schoolYearsTable,
      and(
        eq(schoolYearsTable.districtId, schoolsTable.districtId),
        eq(schoolYearsTable.isActive, true)
      )
    )
    .where(eq(studentsTable.id, studentId))
    .limit(1);

  return result[0]?.yearId ?? null;
}
