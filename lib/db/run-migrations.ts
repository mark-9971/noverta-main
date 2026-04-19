/**
 * CLI entry point for the SQL migration runner.
 * Usage: pnpm --filter @workspace/db run migrate
 */
import { runMigrations } from "./src/migrate";
import { pool } from "./src/db";

async function main() {
  const result = await runMigrations();
  console.log(
    JSON.stringify(
      {
        ok: true,
        appliedCount: result.applied.length,
        skippedCount: result.skipped.length,
        applied: result.applied,
      },
      null,
      2,
    ),
  );
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
