/**
 * Report current `overlapping_chain_uncoupled` rows in
 * migration_report_service_requirements, grouped by district.
 *
 * Read-only. Surfaces rows written by getActiveRequirements when two
 * requirements for the same (student, service_type) overlap in time
 * but are not coupled through `supersedes_id`. Ops uses the output to
 * triage legacy data bugs that quietly inflate required minutes; the
 * resolution playbook is at docs/runbooks/uncoupled-overlap-resolution.md.
 *
 * Only unresolved rows (resolved_at IS NULL) are counted. Rows whose
 * service requirement points at a student with no school assignment
 * (and therefore no district) are bucketed under "Unassigned".
 *
 * Usage:
 *   pnpm --filter @workspace/db exec tsx ./src/scripts/report-uncoupled-overlaps.ts
 *   pnpm --filter @workspace/db exec tsx ./src/scripts/report-uncoupled-overlaps.ts --json
 */
import { sql } from "drizzle-orm";
import { db, pool } from "../db";

interface DistrictGroup {
  districtId: number | null;
  districtName: string;
  rowCount: number;
  requirementIds: number[];
  studentCount: number;
}

async function main(): Promise<void> {
  const asJson = process.argv.includes("--json");

  const result = await db.execute<{
    district_id: number | null;
    district_name: string | null;
    requirement_id: number;
    student_id: number;
  }>(sql`
    SELECT d.id AS district_id,
           d.name AS district_name,
           mrsr.requirement_id,
           sr.student_id
      FROM migration_report_service_requirements mrsr
      JOIN service_requirements sr ON sr.id = mrsr.requirement_id
      JOIN students s ON s.id = sr.student_id
 LEFT JOIN schools sc ON sc.id = s.school_id
 LEFT JOIN districts d ON d.id = sc.district_id
     WHERE mrsr.resolved_at IS NULL
       AND mrsr.reason = 'overlapping_chain_uncoupled'
     ORDER BY d.id NULLS LAST, mrsr.requirement_id
  `);

  const groups = new Map<string, DistrictGroup>();
  for (const row of result.rows) {
    const key = row.district_id == null ? "unassigned" : String(row.district_id);
    if (!groups.has(key)) {
      groups.set(key, {
        districtId: row.district_id,
        districtName: row.district_name ?? "Unassigned (no school/district)",
        rowCount: 0,
        requirementIds: [],
        studentCount: 0,
      });
    }
    const g = groups.get(key)!;
    g.rowCount += 1;
    g.requirementIds.push(row.requirement_id);
  }

  for (const g of groups.values()) {
    const studentIds = new Set(
      result.rows
        .filter((r) => (r.district_id ?? null) === (g.districtId ?? null))
        .map((r) => r.student_id),
    );
    g.studentCount = studentIds.size;
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    totalUnresolvedRows: result.rows.length,
    districts: [...groups.values()].sort((a, b) => b.rowCount - a.rowCount),
  };

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("Uncoupled requirement overlaps — unresolved rows by district");
    console.log(`Generated: ${summary.generatedAt}`);
    console.log(`Total unresolved rows: ${summary.totalUnresolvedRows}`);
    console.log("");
    if (summary.districts.length === 0) {
      console.log("No unresolved overlapping_chain_uncoupled rows. Nothing to do.");
    } else {
      for (const g of summary.districts) {
        const idLabel = g.districtId == null ? "—" : String(g.districtId);
        console.log(`District ${idLabel}  ${g.districtName}`);
        console.log(`  Rows:       ${g.rowCount}`);
        console.log(`  Students:   ${g.studentCount}`);
        const preview = g.requirementIds.slice(0, 10).join(", ");
        const more = g.requirementIds.length > 10 ? ` … (+${g.requirementIds.length - 10} more)` : "";
        console.log(`  Req ids:    ${preview}${more}`);
        console.log("");
      }
      console.log("Resolution playbook: docs/runbooks/uncoupled-overlap-resolution.md");
    }
  }

  await pool.end();
}

main().catch((err) => {
  console.error("[report-uncoupled-overlaps] failed:", err);
  process.exit(1);
});
