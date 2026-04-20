/**
 * Service Requirement v1 (Batch 1) backfill.
 *
 * Idempotent and restartable. For every row in `service_requirements`:
 *   1. Sets `school_id = students.school_id` when school_id is currently
 *      NULL. If the student row's school_id is NULL, leaves school_id
 *      NULL and writes a row to `migration_report_service_requirements`
 *      with reason `school_inferred_null` (or `student_school_null`
 *      when the student row itself is missing).
 *   2. Classifies `delivery_model` from the legacy `group_size` text:
 *        - "individual" when group_size IS NULL / "" / "1" / "1:1" / "1-1"
 *        - "group"      when group_size matches a small-group pattern
 *                       like "2", "2-3", "3:1", "small group", etc.
 *        - otherwise leaves delivery_model NULL and writes a report row
 *          with reason `ambiguous_group_size`.
 *   3. Flags requirements with `active = true` whose end_date is in the
 *      past with reason `active_but_expired` (no column changes).
 *
 * Constraints honoured:
 *   - Never touches requiredMinutes, intervalType, startDate, endDate,
 *     priority, notes, active, or providerId.
 *   - Only writes the four new columns (school_id, delivery_model,
 *     supersedes_id, replaced_at). supersedes_id and replaced_at remain
 *     NULL on every row — no supersede exists yet.
 *   - Idempotent: re-running on already-backfilled rows is a no-op for
 *     the column updates, and report rows are de-duplicated by
 *     (requirement_id, reason) before insert.
 *
 * At the end, writes one `migration_audits` row with pre/post counts and
 * a checksum of (id, school_id, delivery_model) so production-clone
 * rollback verification can confirm an identical result on re-run.
 *
 * Usage:
 *   pnpm --filter @workspace/db exec tsx ./src/scripts/backfill-sr-v1.ts
 */
import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";

const MIGRATION_KEY = "sr-v1-backfill";
const BATCH_SIZE = 500;

type Reason =
  | "school_inferred_null"
  | "student_school_null"
  | "ambiguous_group_size"
  | "active_but_expired";

type DeliveryModel = "individual" | "group";

interface DeliveryModelClassification {
  value: DeliveryModel;
  ambiguous: boolean;
}

/**
 * Classify the legacy `group_size` text into a delivery model.
 *
 * Every row is given a non-null delivery_model (per the v1 schema
 * contract that every existing requirement is classified). Values that
 * don't match any known individual or group pattern fall back to
 * "group" (the conservative choice — group sessions are subject to
 * tighter Medicaid documentation rules) and are flagged as ambiguous
 * so the backfill report can surface them for human confirmation.
 */
function classifyDeliveryModel(groupSize: string | null): DeliveryModelClassification {
  if (groupSize == null) return { value: "individual", ambiguous: false };
  const v = groupSize.trim().toLowerCase();
  if (v === "" || v === "1" || v === "1:1" || v === "1-1" || v === "individual") {
    return { value: "individual", ambiguous: false };
  }
  // Numeric "n" with n >= 2.
  const numMatch = v.match(/^(\d+)$/);
  if (numMatch && Number(numMatch[1]) >= 2) return { value: "group", ambiguous: false };
  // "n:1" or "n-m" patterns commonly used for small groups.
  if (/^\d+\s*[:\-]\s*\d+$/.test(v)) return { value: "group", ambiguous: false };
  if (v.includes("group")) return { value: "group", ambiguous: false };
  return { value: "group", ambiguous: true };
}

interface Counts {
  total: number;
  withSchoolId: number;
  withDeliveryModel: number;
  reportRows: number;
}

async function gatherCounts(): Promise<Counts> {
  const total = await db.execute<{ c: string }>(sql`SELECT COUNT(*)::text AS c FROM service_requirements`);
  const sched = await db.execute<{ c: string }>(sql`SELECT COUNT(*)::text AS c FROM service_requirements WHERE school_id IS NOT NULL`);
  const dm = await db.execute<{ c: string }>(sql`SELECT COUNT(*)::text AS c FROM service_requirements WHERE delivery_model IS NOT NULL`);
  const rep = await db.execute<{ c: string }>(sql`SELECT COUNT(*)::text AS c FROM migration_report_service_requirements`);
  return {
    total: Number(total.rows[0].c),
    withSchoolId: Number(sched.rows[0].c),
    withDeliveryModel: Number(dm.rows[0].c),
    reportRows: Number(rep.rows[0].c),
  };
}

async function computeChecksum(): Promise<string> {
  const h = crypto.createHash("sha256");
  let lastId = 0;
  // Stream in batches to avoid holding the entire table in memory.
  // Order by id so the checksum is stable across runs.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { rows } = await db.execute<{ id: number; school_id: number | null; delivery_model: string | null }>(sql`
      SELECT id, school_id, delivery_model
        FROM service_requirements
       WHERE id > ${lastId}
       ORDER BY id
       LIMIT ${BATCH_SIZE}
    `);
    if (rows.length === 0) break;
    for (const r of rows) {
      h.update(`${r.id}|${r.school_id ?? ""}|${r.delivery_model ?? ""}\n`);
      lastId = r.id;
    }
    if (rows.length < BATCH_SIZE) break;
  }
  return h.digest("hex");
}

async function recordReport(requirementId: number, reason: Reason, details: Record<string, unknown>): Promise<void> {
  // De-duplicate on (requirement_id, reason): if an unresolved row already
  // exists for this pair, skip — keeps the script idempotent across re-runs.
  await db.execute(sql`
    INSERT INTO migration_report_service_requirements (requirement_id, reason, details_json)
    SELECT ${requirementId}, ${reason}, ${JSON.stringify(details)}::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM migration_report_service_requirements
        WHERE requirement_id = ${requirementId} AND reason = ${reason} AND resolved_at IS NULL
     )
  `);
}

export async function backfillServiceRequirementsV1(opts: { logger?: { info: (m: string) => void } } = {}): Promise<{
  pre: Counts;
  post: Counts;
  checksum: string;
  processed: number;
}> {
  const log = opts.logger ?? { info: (m: string) => console.log(`[sr-v1] ${m}`) };

  const pre = await gatherCounts();
  log.info(`pre: ${JSON.stringify(pre)}`);

  let lastId = 0;
  let processed = 0;
  // Today's date for "active but expired" check (UTC, matching DB convention
  // for text dates stored as YYYY-MM-DD).
  const todayIso = new Date().toISOString().slice(0, 10);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { rows } = await db.execute<{
      id: number;
      student_id: number;
      group_size: string | null;
      end_date: string | null;
      active: boolean;
      school_id: number | null;
      delivery_model: string | null;
      student_school_id: number | null;
      student_exists: boolean;
      school_exists: boolean;
    }>(sql`
      SELECT sr.id,
             sr.student_id,
             sr.group_size,
             sr.end_date,
             sr.active,
             sr.school_id,
             sr.delivery_model,
             s.school_id AS student_school_id,
             (s.id IS NOT NULL) AS student_exists,
             (sch.id IS NOT NULL) AS school_exists
        FROM service_requirements sr
        LEFT JOIN students s   ON s.id   = sr.student_id
        LEFT JOIN schools  sch ON sch.id = s.school_id
       WHERE sr.id > ${lastId}
       ORDER BY sr.id
       LIMIT ${BATCH_SIZE}
    `);
    if (rows.length === 0) break;

    for (const r of rows) {
      lastId = r.id;
      processed++;

      // 1. school_id backfill — only when not already populated. Only write
      // a value when the referenced school still exists; orphan student
      // school_ids (legacy data with FK-less rows) are flagged for review.
      if (r.school_id == null) {
        if (r.student_school_id != null && r.school_exists) {
          await db.execute(sql`
            UPDATE service_requirements SET school_id = ${r.student_school_id} WHERE id = ${r.id}
          `);
        } else {
          const reason: Reason = r.student_exists ? "school_inferred_null" : "student_school_null";
          await recordReport(r.id, reason, {
            studentId: r.student_id,
            studentSchoolId: r.student_school_id,
            schoolExists: r.school_exists,
          });
        }
      }

      // 2. delivery_model backfill. Every row is classified — ambiguous
      // legacy values fall back to "group" AND get a report row so an
      // admin can confirm. We always write the column (when unset) so
      // the post-condition "every row has delivery_model populated"
      // holds.
      if (r.delivery_model == null) {
        const dm = classifyDeliveryModel(r.group_size);
        await db.execute(sql`
          UPDATE service_requirements SET delivery_model = ${dm.value} WHERE id = ${r.id}
        `);
        if (dm.ambiguous) {
          await recordReport(r.id, "ambiguous_group_size", { groupSize: r.group_size, classifiedAs: dm.value });
        }
      }

      // 3. active-but-expired flag (column-free; report only).
      if (r.active && r.end_date && r.end_date < todayIso) {
        await recordReport(r.id, "active_but_expired", { endDate: r.end_date });
      }
    }

    log.info(`processed ${processed} rows (lastId=${lastId})`);
    if (rows.length < BATCH_SIZE) break;
  }

  const post = await gatherCounts();
  log.info(`post: ${JSON.stringify(post)}`);

  const checksum = await computeChecksum();
  log.info(`checksum: ${checksum}`);

  await db.execute(sql`
    INSERT INTO migration_audits (migration_key, pre_counts, post_counts, checksum, notes)
    VALUES (${MIGRATION_KEY}, ${JSON.stringify(pre)}::jsonb, ${JSON.stringify(post)}::jsonb, ${checksum},
            ${`processed=${processed}`})
  `);

  return { pre, post, checksum, processed };
}

// CLI entrypoint when invoked directly.
const isMain = (() => {
  try {
    const invoked = process.argv[1] ?? "";
    return invoked.endsWith("backfill-sr-v1.ts") || invoked.endsWith("backfill-sr-v1.js");
  } catch { return false; }
})();

if (isMain) {
  backfillServiceRequirementsV1()
    .then(async (res) => {
      console.log(JSON.stringify({ ok: true, ...res }, null, 2));
      await pool.end();
    })
    .catch(async (err) => {
      console.error(err);
      try { await pool.end(); } catch {}
      process.exit(1);
    });
}
