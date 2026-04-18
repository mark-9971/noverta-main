import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function ensureMedicaidReportSnapshotsTable(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS medicaid_report_snapshots (
        id               serial PRIMARY KEY,
        district_id      integer NOT NULL,
        report_type      text NOT NULL,
        label            text,
        date_from        text,
        date_to          text,
        saved_by_clerk_id text NOT NULL,
        saved_by_name    text NOT NULL,
        data             jsonb NOT NULL,
        created_at       timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS mrs_district_idx ON medicaid_report_snapshots (district_id)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS mrs_report_type_idx ON medicaid_report_snapshots (report_type)
    `);
  } catch (err) {
    logger.warn({ err }, "ensureMedicaidReportSnapshotsTable: DDL failed (non-fatal)");
  }
}
