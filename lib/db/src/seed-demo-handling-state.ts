/**
 * Phase 1E demo seed — pre-populate a few `action_item_handling` rows
 * for the MetroWest Collaborative showcase district so the in-progress
 * pills are visible the very first time anyone loads Action Center,
 * Risk Report, or the dashboard.
 *
 * Idempotent. Re-run any time after `seed-demo-district.ts`:
 *   pnpm --filter @workspace/db exec tsx src/seed-demo-handling-state.ts
 *
 * The rows are deliberately picked to demonstrate the cross-surface
 * sharing that 1E enables:
 *   - One `risk:<sid>:<reqId>` row, so the same pill renders on Action
 *     Center, the Risk Report row, AND the dashboard "Where are we at
 *     risk?" list.
 *   - One `student:<sid>:next-step` row driven by a case manager.
 *   - One `service-gap:<sid>:<reqId>` row owned by the scheduler role.
 */
import { db } from "./db";
import { sql } from "drizzle-orm";

const TAG = "[demo-handling-1e]";
const SEED_USER_ID = "u_demo_seed";
const SEED_USER_NAME = "Demo Seed";

async function getDistrictId(): Promise<number> {
  const r = await db.execute(sql`SELECT id FROM districts WHERE name='MetroWest Collaborative' AND is_demo=true LIMIT 1`);
  const id = (r.rows[0] as { id: number } | undefined)?.id;
  if (!id) throw new Error("MetroWest Collaborative demo district not found.");
  return id;
}

interface PickedRequirement {
  studentId: number;
  serviceRequirementId: number;
}

async function pickAtRiskRequirements(districtId: number, n: number): Promise<PickedRequirement[]> {
  // Prefer service requirements that the compliance-variety seeder
  // already flagged with an unresolved alert — those are the rows the
  // demoer will actually see in Action Center / Risk Report / Minutes-
  // at-Risk. Falls back to any active requirement on a different
  // student if not enough flagged ones exist (tiny districts, alert
  // suppression windows, etc.). We pick from DISTINCT students so the
  // seeded handling pills land on different rows; a single student
  // carrying every state would look unrealistic to a demoer.
  const flagged = await db.execute(sql`
    SELECT DISTINCT ON (sr.student_id)
      sr.student_id AS "studentId", sr.id AS "serviceRequirementId"
    FROM service_requirements sr
    JOIN students st ON st.id = sr.student_id
    JOIN schools sc ON sc.id = st.school_id
    JOIN alerts a ON a.service_requirement_id = sr.id AND a.resolved = false
    WHERE sc.district_id = ${districtId}
    ORDER BY sr.student_id ASC, sr.id ASC
    LIMIT ${n}
  `);
  const picks = flagged.rows as unknown as PickedRequirement[];
  if (picks.length >= n) return picks;

  // Backfill from any remaining students so we still cover all four
  // states even if fewer than `n` requirements have alerts.
  const usedStudentIds = new Set(picks.map(p => p.studentId));
  const remaining = await db.execute(sql`
    SELECT DISTINCT ON (sr.student_id)
      sr.student_id AS "studentId", sr.id AS "serviceRequirementId"
    FROM service_requirements sr
    JOIN students st ON st.id = sr.student_id
    JOIN schools sc ON sc.id = st.school_id
    WHERE sc.district_id = ${districtId}
    ORDER BY sr.student_id ASC, sr.id ASC
    LIMIT ${n * 2}
  `);
  for (const row of remaining.rows as unknown as PickedRequirement[]) {
    if (picks.length >= n) break;
    if (usedStudentIds.has(row.studentId)) continue;
    picks.push(row);
    usedStudentIds.add(row.studentId);
  }
  return picks;
}

interface DemoRow {
  itemId: string;
  state: string;
  note: string;
  recommendedOwnerRole: string | null;
  assignedToRole: string | null;
}

async function upsertHandling(districtId: number, row: DemoRow): Promise<boolean> {
  // Skip if already present — keeps the seeder idempotent.
  const existing = await db.execute(sql`
    SELECT id FROM action_item_handling
    WHERE district_id = ${districtId} AND item_id = ${row.itemId}
    LIMIT 1
  `);
  if (existing.rows.length > 0) {
    console.log(`${TAG} skip existing ${row.itemId}`);
    return false;
  }
  await db.execute(sql`
    INSERT INTO action_item_handling
      (district_id, item_id, state, note, recommended_owner_role, assigned_to_role,
       updated_by_user_id, updated_by_name)
    VALUES
      (${districtId}, ${row.itemId}, ${row.state}, ${row.note},
       ${row.recommendedOwnerRole}, ${row.assignedToRole},
       ${SEED_USER_ID}, ${SEED_USER_NAME})
  `);
  await db.execute(sql`
    INSERT INTO action_item_handling_events
      (district_id, item_id, from_state, to_state, note, changed_by_user_id, changed_by_name)
    VALUES
      (${districtId}, ${row.itemId}, NULL, ${row.state}, ${row.note},
       ${SEED_USER_ID}, ${SEED_USER_NAME})
  `);
  console.log(`${TAG} inserted ${row.itemId} → ${row.state}`);
  return true;
}

export interface SeedDemoHandlingStateResult {
  districtId: number;
  inserted: number;
  considered: number;
}

/**
 * Pure row-composition step — exposed so tests can verify the demo
 * coverage (states + canonical itemId shapes) without needing a real
 * demo district / DB. Order of `picks` determines which student gets
 * which state; callers should pass DISTINCT students for a believable
 * spread.
 */
export function buildDemoHandlingRows(picks: PickedRequirement[]): DemoRow[] {
  const rows: DemoRow[] = [];
  if (picks[0]) {
    rows.push({
      itemId: `risk:${picks[0].studentId}:${picks[0].serviceRequirementId}`,
      state: "awaiting_confirmation",
      note: "Asked SLP to confirm last week's recovery sessions.",
      recommendedOwnerRole: "case_manager",
      assignedToRole: "case_manager",
    });
  }
  if (picks[1]) {
    rows.push({
      itemId: `risk:${picks[1].studentId}:${picks[1].serviceRequirementId}`,
      state: "recovery_scheduled",
      note: "Makeup OT block added Thursday 2:15–3:00; awaiting parent ack.",
      recommendedOwnerRole: "scheduler",
      assignedToRole: "scheduler",
    });
  }
  if (picks[2]) {
    rows.push({
      itemId: `student:${picks[2].studentId}:next-step`,
      state: "under_review",
      note: "CM reviewing whether re-eval timeline is realistic.",
      recommendedOwnerRole: "case_manager",
      assignedToRole: "case_manager",
    });
  }
  if (picks[3]) {
    rows.push({
      itemId: `service-gap:${picks[3].studentId}:${picks[3].serviceRequirementId}`,
      state: "handed_off",
      note: "Scheduler is rebuilding the OT block to close the gap.",
      recommendedOwnerRole: "scheduler",
      assignedToRole: "scheduler",
    });
  }
  return rows;
}

/**
 * Seed the four "in-flight" handling states a district admin should
 * see on first login of the showcase district:
 *
 *   - `awaiting_confirmation` on a risk:<sid>:<reqId> row
 *   - `recovery_scheduled`    on a risk:<sid>:<reqId> row
 *     (added in the demo-readiness pass — proves the Schedule-makeup
 *      flow leaves a visible breadcrumb on the Risk Report)
 *   - `under_review`          on a student:<sid>:next-step row
 *   - `handed_off`            on a service-gap:<sid>:<reqId> row
 *
 * Each row lands on a different student so the Risk Report shows a
 * realistic spread of pills rather than one student carrying every
 * state. Idempotent.
 */
export async function seedDemoHandlingState(): Promise<SeedDemoHandlingStateResult> {
  const districtId = await getDistrictId();
  const picks = await pickAtRiskRequirements(districtId, 4);
  const rows = buildDemoHandlingRows(picks);

  let inserted = 0;
  for (const row of rows) {
    if (await upsertHandling(districtId, row)) inserted += 1;
  }
  console.log(`${TAG} done — inserted ${inserted}/${rows.length} candidate row(s).`);
  return { districtId, inserted, considered: rows.length };
}

if (process.argv[1] && process.argv[1].endsWith("seed-demo-handling-state.ts")) {
  seedDemoHandlingState()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
