/**
 * Verifies the live database actually has the document_versions unique
 * constraint that prevents duplicate (district, type, id, version_number)
 * rows, and that the route's "find max + insert + retry on 23505" loop
 * correctly serializes concurrent saves into distinct version numbers.
 *
 * The constraint is created at server boot via ensureDbConstraints() in
 * src/lib/activeSchoolYear.ts using `CREATE UNIQUE INDEX IF NOT EXISTS`.
 * If that ever silently fails, double-saves would land as duplicate
 * version 1s instead of being rejected and retried as 2 / 3 / etc.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, documentVersionsTable } from "@workspace/db";
import { sql, eq, inArray, asc } from "drizzle-orm";
import {
  asUser,
  createDistrict,
  createSchool,
  createStudent,
  cleanupDistrict,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";
import { ensureDbConstraints } from "../src/lib/activeSchoolYear";

const ADMIN_USER = "u_admin_doc_ver_unique";

describe("document_versions unique constraint (live DB)", () => {
  let districtId: number;
  let studentId: number;
  const documentType = "iep";
  // Synthetic document id — the POST route does not require the row to
  // exist (it only validates the student is in-district), so any positive
  // integer that no other test is using works here.
  const documentId = 987654321;
  const createdVersionIds: number[] = [];

  beforeAll(async () => {
    await ensureDbConstraints();
    await seedLegalAcceptances([ADMIN_USER]);

    const d = await createDistrict();
    districtId = d.id;
    const school = await createSchool(districtId);
    const student = await createStudent(school.id);
    studentId = student.id;
  });

  afterAll(async () => {
    if (createdVersionIds.length > 0) {
      await db
        .delete(documentVersionsTable)
        .where(inArray(documentVersionsTable.id, createdVersionIds));
    }
    // Belt-and-suspenders: also drop anything keyed to our synthetic doc id
    // in case the concurrency test inserted rows we didn't capture.
    await db
      .delete(documentVersionsTable)
      .where(eq(documentVersionsTable.documentId, documentId));
    await cleanupDistrict(districtId);
    await cleanupLegalAcceptances([ADMIN_USER]);
  });

  it("doc_ver_unique_version_idx exists on document_versions with the expected columns", async () => {
    const rows = await db.execute<{
      indexname: string;
      indexdef: string;
    }>(sql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'document_versions'
        AND indexname = 'doc_ver_unique_version_idx'
    `);
    // drizzle's pg execute returns { rows: [...] } shape
    const list = (rows as unknown as { rows: Array<{ indexname: string; indexdef: string }> }).rows
      ?? (rows as unknown as Array<{ indexname: string; indexdef: string }>);
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(1);

    const def = list[0].indexdef.toLowerCase();
    expect(def).toContain("unique");
    expect(def).toContain("district_id");
    expect(def).toContain("document_type");
    expect(def).toContain("document_id");
    expect(def).toContain("version_number");
  });

  it("concurrent POSTs allocate distinct version numbers, never duplicate version 1", async () => {
    const admin = asUser({ userId: ADMIN_USER, role: "admin", districtId });
    const url = "/api/document-workflow/versions";
    const body = {
      documentType,
      documentId,
      studentId,
      title: "Concurrent save test",
    };

    const N = 3;
    const results = await Promise.all(
      Array.from({ length: N }, () => admin.post(url).send(body)),
    );

    for (const r of results) {
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      if (r.body?.id) createdVersionIds.push(r.body.id);
    }

    const versionNumbers = results
      .map((r) => r.body.versionNumber as number)
      .sort((a, b) => a - b);
    expect(versionNumbers).toEqual([1, 2, 3]);

    // Confirm at the DB level too — the unique index must guarantee no two
    // rows share (district, type, id, version_number).
    const stored = await db
      .select({
        versionNumber: documentVersionsTable.versionNumber,
      })
      .from(documentVersionsTable)
      .where(eq(documentVersionsTable.documentId, documentId))
      .orderBy(asc(documentVersionsTable.versionNumber));
    expect(stored.map((s) => s.versionNumber)).toEqual([1, 2, 3]);
  });
});
