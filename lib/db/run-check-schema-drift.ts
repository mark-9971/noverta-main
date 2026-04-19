/**
 * CI entry point that catches schema drift before it reaches production.
 *
 * Mirrors the production bootstrap (`scripts/post-merge.sh` and the
 * `assertSchemaColumnsPresent()` call wired into the api-server boot
 * path) against the configured `DATABASE_URL` — intended to be a
 * freshly-created Postgres instance in CI:
 *
 *   1. Apply pending SQL migrations from `lib/db/src/migrations/`. This
 *      assumes the calling job has already run `pnpm --filter
 *      @workspace/db push-force` so the base tables exist (the
 *      migrations are deltas layered on top of the declarative push).
 *   2. Run `assertSchemaColumnsPresent()`, which compares every Drizzle
 *      table/column declared under `lib/db/src/schema/` against
 *      `information_schema.columns`.
 *
 * Exits non-zero — and prints the offending `<table>.<column>` pairs —
 * when the Drizzle schema declares objects the migrated database does
 * not contain. That is the signal that a PR added a column to the
 * Drizzle schema without a paired SQL migration under
 * `lib/db/src/migrations/`, the failure mode that produced silent 500s
 * in production and motivated the boot-time check in Task #827.
 *
 * Usage: pnpm --filter @workspace/db run check-drift
 */
import { runMigrations, assertSchemaColumnsPresent } from "./src/migrate";
import { pool } from "./src/db";

async function main() {
  const result = await runMigrations();
  console.log(
    `[check-drift] migrations applied=${result.applied.length} skipped=${result.skipped.length}`,
  );
  await assertSchemaColumnsPresent();
  console.log("[check-drift] no schema drift detected");
  await pool.end();
}

main().catch(async (err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`::error::${message}`);
  console.error(message);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
