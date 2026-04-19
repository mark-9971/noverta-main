/**
 * Sample-data teardown — no orphan rows.
 *
 * The teardown path in `seed-sample-data.ts` walks pg_constraint to find
 * every table that holds a (possibly indirect) FK to `students` so it can
 * delete those rows in the same transaction the student rows are deleted in.
 * That introspection is what fixed the historical "district 7 & 8 had to be
 * wiped by hand" bug — but nothing was guarding the invariant.
 *
 * This test seeds a throwaway district end-to-end, captures every sample
 * student id, runs `teardownSampleData`, then re-queries pg_constraint and
 * asserts that *every* table with a direct FK to `students` has zero rows
 * referencing those ids. If a future migration adds a new student-FK table
 * and the teardown's introspection is bypassed (e.g. because the new table
 * is created with the FK marked DEFERRABLE in a way the seeder skips, or
 * because someone reverts to the hand-maintained list), this test fails
 * before the manual cleanup pain returns.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDistrict, cleanupDistrict } from "./helpers";
import { db, schoolsTable, studentsTable, seedSampleDataForDistrict, teardownSampleData } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";

describe("sample-data teardown leaves no orphans", () => {
  let districtId: number;
  let seededStudentIds: number[] = [];

  beforeAll(async () => {
    const d = await createDistrict({ name: `Sample-Teardown-${Date.now()}` });
    districtId = d.id;
    await seedSampleDataForDistrict(districtId);

    const schoolIds = (
      await db.select({ id: schoolsTable.id }).from(schoolsTable).where(eq(schoolsTable.districtId, districtId))
    ).map((r) => r.id);
    seededStudentIds = (
      await db
        .select({ id: studentsTable.id })
        .from(studentsTable)
        .where(and(eq(studentsTable.isSample, true), inArray(studentsTable.schoolId, schoolIds)))
    ).map((r) => r.id);
  }, 120_000);

  afterAll(async () => {
    await cleanupDistrict(districtId);
  });

  it("seeded students for the throwaway district", () => {
    expect(seededStudentIds.length).toBeGreaterThan(0);
  });

  it("after teardown, every table with a direct FK to students has zero rows for the seeded ids", async () => {
    const result = await teardownSampleData(districtId);
    expect(result.studentsRemoved).toBe(seededStudentIds.length);

    // Re-query at run time so a newly added student-FK table is automatically
    // included in this assertion the next time the test runs. This is the
    // whole point of the test — drift detection.
    const fkRowsRes = await db.execute(sql`
      SELECT cl.relname  AS child_table,
             att.attname AS child_col
      FROM pg_constraint c
      JOIN pg_class cl  ON cl.oid  = c.conrelid
      JOIN pg_class rcl ON rcl.oid = c.confrelid
      JOIN pg_attribute att ON att.attrelid = c.conrelid AND att.attnum = ANY(c.conkey)
      WHERE c.contype = 'f' AND rcl.relname = 'students'
    `);
    const studentFkTables = (fkRowsRes.rows as Array<{ child_table: string; child_col: string }>);
    expect(studentFkTables.length).toBeGreaterThan(0);

    // Defensive: avoid building `IN ()` (invalid SQL) if the prior assertion
    // somehow passed with an empty array. The earlier expect would have
    // already failed in that case, but guard so the failure is readable.
    expect(seededStudentIds.length).toBeGreaterThan(0);

    const idsParam = sql.join(seededStudentIds.map((id) => sql`${id}`), sql`, `);
    const orphans: Array<{ table: string; col: string; count: number }> = [];
    for (const { child_table, child_col } of studentFkTables) {
      // Identifiers (table/column) come from pg_constraint metadata, not
      // user input; values use a parameterized list.
      const res = await db.execute(sql`
        SELECT COUNT(*)::int AS c
        FROM ${sql.identifier(child_table)}
        WHERE ${sql.identifier(child_col)} IN (${idsParam})
      `);
      const count = Number((res.rows[0] as { c: number }).c);
      if (count > 0) orphans.push({ table: child_table, col: child_col, count });
    }

    expect(
      orphans,
      `Orphan rows found after teardown:\n${orphans.map(o => `  ${o.table}.${o.col}: ${o.count}`).join("\n")}`,
    ).toEqual([]);

    // Students themselves should also be gone.
    const remaining = await db
      .select({ id: studentsTable.id })
      .from(studentsTable)
      .where(inArray(studentsTable.id, seededStudentIds));
    expect(remaining).toEqual([]);
  }, 120_000);
});
