import { db, pool } from "@workspace/db";
import { schoolYearsTable, studentsTable, schoolsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

const cache = new Map<number, { id: number; expiresAt: number }>();
const CACHE_TTL = 60_000;

const BACKFILL_QUERIES = [
  `UPDATE session_logs sl
   SET school_year_id = sy.id
   FROM students st
   JOIN schools sc ON sc.id = st.school_id
   JOIN school_years sy ON sy.district_id = sc.district_id AND sy.is_active = true
   WHERE sl.school_year_id IS NULL AND sl.student_id = st.id`,

  `UPDATE compliance_events ce
   SET school_year_id = sy.id
   FROM students st
   JOIN schools sc ON sc.id = st.school_id
   JOIN school_years sy ON sy.district_id = sc.district_id AND sy.is_active = true
   WHERE ce.school_year_id IS NULL AND ce.student_id = st.id`,

  `UPDATE team_meetings tm
   SET school_year_id = sy.id
   FROM students st
   JOIN schools sc ON sc.id = st.school_id
   JOIN school_years sy ON sy.district_id = sc.district_id AND sy.is_active = true
   WHERE tm.school_year_id IS NULL AND tm.student_id = st.id`,

  `UPDATE schedule_blocks sb
   SET school_year_id = sy.id
   FROM students st
   JOIN schools sc ON sc.id = st.school_id
   JOIN school_years sy ON sy.district_id = sc.district_id AND sy.is_active = true
   WHERE sb.school_year_id IS NULL AND sb.student_id = st.id`,

  `UPDATE iep_documents id_
   SET school_year_id = sy.id
   FROM students st
   JOIN schools sc ON sc.id = st.school_id
   JOIN school_years sy ON sy.district_id = sc.district_id AND sy.is_active = true
   WHERE id_.school_year_id IS NULL AND id_.student_id = st.id`,
];

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

  for (const q of BACKFILL_QUERIES) {
    try {
      await pool.query(q);
    } catch (err: any) {
      console.warn("ensureDbConstraints: backfill query failed (non-fatal):", err.message);
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
