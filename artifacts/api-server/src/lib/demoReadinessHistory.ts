import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function ensureDemoReadinessRunsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS demo_readiness_runs (
        id           serial PRIMARY KEY,
        generated_at timestamptz NOT NULL DEFAULT now(),
        pass         integer NOT NULL DEFAULT 0,
        warn         integer NOT NULL DEFAULT 0,
        fail         integer NOT NULL DEFAULT 0,
        total        integer NOT NULL DEFAULT 0,
        checks       jsonb NOT NULL
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS drr_generated_at_idx ON demo_readiness_runs (generated_at)
    `);
  } catch (err) {
    logger.warn({ err }, "ensureDemoReadinessRunsTable: DDL failed (non-fatal)");
  }
}
