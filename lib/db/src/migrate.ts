/**
 * Migration runner for the SQL files in `lib/db/src/migrations/`.
 *
 * - Discovers every `*.sql` file in the migrations directory.
 * - Sorts them lexicographically (matches the numeric prefix convention).
 * - Tracks applied migrations in the `_app_migrations` table.
 * - Each migration runs inside a transaction; on failure, it rolls back
 *   and the runner aborts. Migrations that have already been applied are
 *   skipped.
 *
 * Designed to be safe to call on every app start: pending migrations are
 * applied; an empty pending list is a no-op.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { pool } from "./db";
import * as schema from "./schema";

export interface MigrationRunResult {
  applied: string[];
  skipped: string[];
  baselined: string[];
  migrationsDir: string;
}

// Postgres SQLSTATE codes that indicate the DDL in a migration has already
// been applied (object already exists). When a migration that creates a new
// object hits one of these, we treat it as "already in place" and record the
// file as applied so subsequent runs become true no-ops. This lets us be
// resilient when migrations are mixed with `drizzle-kit push --force`, which
// creates schema declaratively from `lib/db/src/schema/`.
const ALREADY_EXISTS_CODES = new Set([
  "42P07", // duplicate_table
  "42710", // duplicate_object (constraint, type, etc.)
  "42701", // duplicate_column
  "42P06", // duplicate_schema
  "42723", // duplicate_function
  "42P16", // invalid_table_definition (e.g. PK already exists)
]);

function isAlreadyExistsError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code: unknown }).code;
    return typeof code === "string" && ALREADY_EXISTS_CODES.has(code);
  }
  return false;
}

const TRACKING_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS _app_migrations (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

function defaultMigrationsDir(): string {
  // Resolve relative to this file. In dev (tsx) this lives at
  // `lib/db/src/migrate.ts` and the SQL files are siblings under
  // `./migrations`. When bundled (esbuild) consumers pass an explicit dir.
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, "migrations");
}

function checksum(sql: string): string {
  return crypto.createHash("sha256").update(sql).digest("hex");
}

export async function runMigrations(opts: {
  migrationsDir?: string;
  logger?: { info: (msg: string) => void; warn: (msg: string) => void };
} = {}): Promise<MigrationRunResult> {
  const log = opts.logger ?? {
    info: (m: string) => console.log(`[migrate] ${m}`),
    warn: (m: string) => console.warn(`[migrate] ${m}`),
  };
  const migrationsDir = opts.migrationsDir ?? defaultMigrationsDir();

  if (!fs.existsSync(migrationsDir)) {
    throw new Error(
      `[migrate] migrations directory not found: ${migrationsDir}`,
    );
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];
  const baselined: string[] = [];
  try {
    await client.query(TRACKING_TABLE_DDL);

    // Explicit opt-in baseline: when MIGRATIONS_BASELINE=1, mark every
    // current migration file as already-applied without executing it. Use
    // this once when introducing the runner to an environment whose schema
    // is already at HEAD via prior `drizzle-kit push` / hand-applied SQL,
    // so we don't try to re-execute DDL that already ran. Default behavior
    // is to apply pending migrations.
    if (process.env.MIGRATIONS_BASELINE === "1") {
      log.info(
        `MIGRATIONS_BASELINE=1: recording ${files.length} migration(s) as already-applied without executing them`,
      );
      await client.query("BEGIN");
      try {
        for (const file of files) {
          const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
          await client.query(
            `INSERT INTO _app_migrations (name, checksum) VALUES ($1, $2)
             ON CONFLICT (name) DO NOTHING`,
            [file, checksum(sql)],
          );
          baselined.push(file);
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
      log.info(`baseline complete; subsequent runs will apply only new files`);
      return { applied, skipped, baselined, migrationsDir };
    }

    const { rows } = await client.query<{ name: string; checksum: string }>(
      `SELECT name, checksum FROM _app_migrations`,
    );
    const alreadyApplied = new Map(rows.map((r) => [r.name, r.checksum]));

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sqlText = fs.readFileSync(fullPath, "utf8");
      const sum = checksum(sqlText);

      const prior = alreadyApplied.get(file);
      if (prior) {
        if (prior !== sum) {
          log.warn(
            `migration "${file}" was modified after being applied (checksum mismatch). ` +
              `Migrations are immutable once applied; create a new file with a higher prefix instead.`,
          );
        }
        skipped.push(file);
        continue;
      }

      log.info(`applying ${file}`);
      try {
        await client.query("BEGIN");
        await client.query(sqlText);
        await client.query(
          `INSERT INTO _app_migrations (name, checksum) VALUES ($1, $2)`,
          [file, sum],
        );
        await client.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        if (isAlreadyExistsError(err)) {
          // Idempotency: the object this migration creates already exists in
          // the DB (very common when schema was bootstrapped via
          // `drizzle-kit push` from `lib/db/src/schema/`). Record the file
          // as applied so the same SQL is not re-attempted on every boot.
          log.warn(
            `${file}: target object already exists (sqlstate ${(err as { code?: string }).code}); recording as applied`,
          );
          await client.query(
            `INSERT INTO _app_migrations (name, checksum) VALUES ($1, $2)
             ON CONFLICT (name) DO NOTHING`,
            [file, sum],
          );
          applied.push(file);
          continue;
        }
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`[migrate] failed to apply ${file}: ${message}`);
      }
    }

    log.info(
      `done: ${applied.length} applied, ${skipped.length} already-applied`,
    );
    return { applied, skipped, baselined, migrationsDir };
  } finally {
    client.release();
  }
}

/**
 * Pre-flight check used by the api-server before opening the listening
 * socket. Confirms the migration runner reached a valid HEAD schema by
 * checking that core tables exist. Throws on miss so we fail closed
 * instead of serving 500s against a half-migrated DB (the symptom that
 * motivated the runner in the first place).
 */
export async function assertCoreSchemaPresent(): Promise<void> {
  const required = ["districts", "staff", "students", "_app_migrations"];
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ name: string; present: boolean }>(
      `SELECT unnest($1::text[]) AS name,
              (to_regclass('public.' || unnest($1::text[])) IS NOT NULL) AS present`,
      [required],
    );
    const missing = rows.filter((r) => !r.present).map((r) => r.name);
    if (missing.length > 0) {
      throw new Error(
        `[migrate] post-migration schema check failed: missing tables ${missing.join(", ")}. ` +
          `Run \`pnpm --filter @workspace/db push-force\` to create the schema, then re-run migrations.`,
      );
    }
  } finally {
    client.release();
  }
}

/**
 * Compares every column declared by a Drizzle table in
 * `lib/db/src/schema/*.ts` against `information_schema.columns` for the
 * live database. Throws a descriptive error listing the offending
 * `<table>.<column>` pairs when a declared column is absent.
 *
 * Motivation: a column added to the Drizzle schema without a paired
 * migration (e.g. `districts.view_as_excluded_roles`) silently produces
 * 500s the first time an endpoint references it. Running this at boot
 * turns that class of drift into a fail-fast startup error.
 *
 * Only checks declared-but-missing direction. Extra columns present in
 * the DB but not declared by Drizzle are tolerated (legacy / out-of-band
 * additions are common and not the failure mode we are guarding against).
 */
export async function assertSchemaColumnsPresent(): Promise<void> {
  const declared = new Map<string, Set<string>>();
  for (const value of Object.values(schema)) {
    if (!is(value as object, PgTable)) continue;
    const cfg = getTableConfig(value as PgTable);
    if (cfg.schema && cfg.schema !== "public") continue;
    const cols = new Set(cfg.columns.map((c) => c.name));
    declared.set(cfg.name, cols);
  }

  if (declared.size === 0) return;

  const tableNames = [...declared.keys()];
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ANY($1::text[])`,
      [tableNames],
    );
    const live = new Map<string, Set<string>>();
    for (const r of rows) {
      let set = live.get(r.table_name);
      if (!set) {
        set = new Set();
        live.set(r.table_name, set);
      }
      set.add(r.column_name);
    }

    const missing: string[] = [];
    const missingTables: string[] = [];
    for (const [table, cols] of declared) {
      const liveCols = live.get(table);
      if (!liveCols) {
        missingTables.push(table);
        continue;
      }
      for (const col of cols) {
        if (!liveCols.has(col)) missing.push(`${table}.${col}`);
      }
    }

    if (missingTables.length > 0 || missing.length > 0) {
      const parts: string[] = [];
      if (missingTables.length > 0) {
        parts.push(`missing tables: ${missingTables.sort().join(", ")}`);
      }
      if (missing.length > 0) {
        parts.push(`missing columns: ${missing.sort().join(", ")}`);
      }
      throw new Error(
        `[migrate] schema drift detected — Drizzle schema declares objects that do not exist in the database (${parts.join("; ")}). ` +
          `Add a migration under \`lib/db/src/migrations/\` (or run \`pnpm --filter @workspace/db push-force\`) to bring the database in sync.`,
      );
    }
  } finally {
    client.release();
  }
}
