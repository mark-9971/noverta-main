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

async function pickTwoAtRiskRequirements(districtId: number): Promise<PickedRequirement[]> {
  // Look for service requirements on demo students whose risk is
  // surfaced. Falls back to any active requirement if the risk view
  // isn't populated yet.
  const r = await db.execute(sql`
    SELECT sr.student_id AS "studentId", sr.id AS "serviceRequirementId"
    FROM service_requirements sr
    JOIN students st ON st.id = sr.student_id
    JOIN schools sc ON sc.id = st.school_id
    WHERE sc.district_id = ${districtId}
    ORDER BY sr.id ASC
    LIMIT 2
  `);
  return r.rows as unknown as PickedRequirement[];
}

interface DemoRow {
  itemId: string;
  state: string;
  note: string;
  recommendedOwnerRole: string | null;
  assignedToRole: string | null;
}

async function upsertHandling(districtId: number, row: DemoRow) {
  // Skip if already present — keeps the seeder idempotent.
  const existing = await db.execute(sql`
    SELECT id FROM action_item_handling
    WHERE district_id = ${districtId} AND item_id = ${row.itemId}
    LIMIT 1
  `);
  if (existing.rows.length > 0) {
    console.log(`${TAG} skip existing ${row.itemId}`);
    return;
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
}

export async function seedDemoHandlingState(): Promise<void> {
  const districtId = await getDistrictId();
  const picks = await pickTwoAtRiskRequirements(districtId);

  const rows: DemoRow[] = [];

  if (picks[0]) {
    rows.push({
      itemId: `risk:${picks[0].studentId}:${picks[0].serviceRequirementId}`,
      state: "awaiting_confirmation",
      note: "Asked SLP to confirm last week's recovery sessions.",
      recommendedOwnerRole: "case_manager",
      assignedToRole: "case_manager",
    });
    rows.push({
      itemId: `student:${picks[0].studentId}:next-step`,
      state: "under_review",
      note: "CM reviewing whether re-eval timeline is realistic.",
      recommendedOwnerRole: "case_manager",
      assignedToRole: "case_manager",
    });
  }
  if (picks[1]) {
    rows.push({
      itemId: `service-gap:${picks[1].studentId}:${picks[1].serviceRequirementId}`,
      state: "handed_off",
      note: "Scheduler is rebuilding the OT block to close the gap.",
      recommendedOwnerRole: "scheduler",
      assignedToRole: "scheduler",
    });
  }

  for (const row of rows) await upsertHandling(districtId, row);
  console.log(`${TAG} done — ${rows.length} candidate row(s) considered.`);
}

if (process.argv[1] && process.argv[1].endsWith("seed-demo-handling-state.ts")) {
  seedDemoHandlingState()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
