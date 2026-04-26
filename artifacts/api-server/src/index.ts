// Run the managed-cloud posture check before any other import chain executes.
// ES module evaluation order means `import app from "./app"` would otherwise
// pull in routes, db, integrations, etc. — any of which may throw on a
// misconfigured managed deploy and obscure the underlying auth-posture bug.
// Keep this at the very top of the file.
import { assertManagedDeployPosture, isProductionLikeDeploy } from "./lib/deployEnv";
assertManagedDeployPosture();

import { initSentry, captureException, flushSentry, recordError5xx } from "./lib/sentry";
import app from "./app";
import { logger } from "./lib/logger";
import { startSisScheduler } from "./lib/sis/scheduler";
import { startSisWorker } from "./lib/sis/worker";
import { startReminderScheduler, ensureCaseloadSnapshotsTable, ensureScheduledReportsUnsubscribeColumn } from "./lib/reminders";
import { startErrorLogCleanup } from "./lib/errorLogCleanup";
import { startCostAvoidanceSnapshotScheduler } from "./lib/costAvoidanceSnapshots";
import { startComplianceTrendSnapshotScheduler } from "./lib/complianceTrendSnapshots";
import { startDistrictHealthSnapshotScheduler } from "./lib/districtHealthSnapshots";
import {
  ensurePilotBaselineSnapshotsTable,
  backfillPilotBaselines,
} from "./lib/pilotBaselineSnapshots";
import { ensureMedicaidReportSnapshotsTable } from "./lib/medicaidReportSnapshotsDb";
import { ensureDemoReadinessRunsTable } from "./lib/demoReadinessHistory";
import { startMedicaidReportSnapshotScheduler } from "./lib/medicaidReportSnapshotsScheduler";
import { db, districtSubscriptionsTable, districtsTable, runMigrations as runDbMigrations, assertCoreSchemaPresent, assertSchemaColumnsPresent } from "@workspace/db";
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { sql } from "drizzle-orm";
import { ensureDbConstraints } from "./lib/activeSchoolYear";
import { initDevDistrictFallback } from "./middlewares/auth";
import { reloadSchedule } from "./lib/demoResetScheduler";

initSentry();

// Clerk key guard: hard-fail in any production-like deploy when keys are
// absent or misconfigured. A test key (sk_test_*) is a mis-config — fail
// closed rather than silently serving unauthenticated requests.
const clerkSecretKey = process.env.CLERK_SECRET_KEY;
if (isProductionLikeDeploy()) {
  if (!clerkSecretKey) {
    logger.error("FATAL: CLERK_SECRET_KEY is not set. Cannot start a production-like deploy without Clerk auth.");
    process.exit(1);
  }
  if (clerkSecretKey.startsWith("sk_test_")) {
    logger.error("FATAL: Test Clerk key (sk_test_*) used in a production-like deploy. Set a live key (sk_live_*) and restart.");
    process.exit(1);
  }
} else {
  if (!clerkSecretKey) {
    logger.warn("CLERK_SECRET_KEY is not set — Clerk auth will not validate real sessions");
  } else {
    logger.info({ keyPrefix: clerkSecretKey.startsWith("sk_test_") ? "sk_test_*" : "sk_live_*" }, "Clerk auth configured");
  }
}

// Publishable key guard — baked into the frontend bundle at build time via
// VITE_CLERK_PUBLISHABLE_KEY. The server-side alias CLERK_PUBLISHABLE_KEY is
// used by clerkProxyMiddleware in app.ts. In a production-like deploy both
// must be live keys (pk_live_*); test keys (pk_test_*) indicate a
// mis-deployment.
const clerkPubKey = process.env.CLERK_PUBLISHABLE_KEY || process.env.VITE_CLERK_PUBLISHABLE_KEY;
if (isProductionLikeDeploy()) {
  if (!clerkPubKey) {
    logger.error("FATAL: CLERK_PUBLISHABLE_KEY is not set. Cannot start a production-like deploy.");
    process.exit(1);
  }
  if (clerkPubKey.startsWith("pk_test_")) {
    logger.error("FATAL: Test Clerk publishable key (pk_test_*) used in a production-like deploy. Set a live key (pk_live_*) and redeploy.");
    process.exit(1);
  }
} else if (clerkPubKey) {
  logger.info({ keyPrefix: clerkPubKey.startsWith("pk_test_") ? "pk_test_*" : "pk_live_*" }, "Clerk publishable key configured");
}

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — process will exit");
  recordError5xx();
  captureException(err, { source: "uncaughtException" });
  void flushSentry(2000).finally(() => process.exit(1));
});

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error({ err }, "Unhandled promise rejection");
  recordError5xx();
  captureException(err, { source: "unhandledRejection" });
});

async function backfillDistrictSubscriptions() {
  try {
    const result = await db.execute(sql`
      INSERT INTO district_subscriptions (district_id, plan_tier, seat_limit, billing_cycle, status)
      SELECT d.id, 'trial', 10, 'monthly', 'trialing'
      FROM districts d
      LEFT JOIN district_subscriptions ds ON ds.district_id = d.id
      WHERE ds.id IS NULL
    `);
    const count = (result as { rowCount?: number }).rowCount ?? 0;
    if (count > 0) {
      logger.info({ count }, 'Backfilled district subscriptions');
    }
  } catch (err) {
    logger.warn({ err }, 'Failed to backfill district subscriptions (non-fatal)');
  }
}

function normalizeBareOrigin(raw: string, envName: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`${envName} must be a valid URL origin, got: ${raw}`);
  }
  if (parsed.protocol !== "https:" && isProductionLikeDeploy()) {
    throw new Error(`${envName} must use https in production-like deploys, got: ${raw}`);
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(`${envName} must be a bare origin without path/query/hash, got: ${raw}`);
  }
  return parsed.origin;
}

function resolveApiOrigin(): string {
  const explicit = process.env.API_ORIGIN || process.env.API_URL;
  if (explicit && explicit.trim() !== "") {
    return normalizeBareOrigin(explicit, process.env.API_ORIGIN ? "API_ORIGIN" : "API_URL");
  }

  if (isProductionLikeDeploy()) {
    throw new Error(
      "API_ORIGIN or API_URL is required in production-like deploys. " +
        "Set it to the API origin, e.g. https://api.noverta.app.",
    );
  }

  const replitDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  if (replitDomain) return `https://${replitDomain.replace(/\/+$/, "")}`;

  throw new Error("Unable to resolve API origin. Set API_ORIGIN or API_URL.");
}

async function initStripe() {
  try {
    const { runMigrations } = await import('stripe-replit-sync');
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      logger.warn('DATABASE_URL not set, skipping Stripe init');
      return;
    }

    logger.info('Initializing Stripe schema...');
    try {
      await runMigrations({ databaseUrl });
    } catch (migErr) {
      logger.warn({ err: migErr }, 'Stripe runMigrations failed (tables may already exist)');
    }
    logger.info('Stripe schema ready');

    const { getStripeSync } = await import('./lib/stripeClient');
    const stripeSync = await getStripeSync();

    const apiOrigin = resolveApiOrigin();
    await stripeSync.findOrCreateManagedWebhook(`${apiOrigin}/api/stripe/webhook`);
    logger.info({ apiOrigin }, 'Stripe webhook configured');

    stripeSync.syncBackfill()
      .then(() => logger.info('Stripe data synced'))
      .catch((err: unknown) => logger.error({ err }, 'Error syncing Stripe data'));
  } catch (err) {
    logger.error({ err }, 'Failed to initialize Stripe (non-fatal)');
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Spawns `drizzle-kit push --force` to provision the base schema from
// `lib/db/src/schema/`. Used to bootstrap empty DBs at startup so a fresh
// environment can come up without a manual operator step. Resolved via
// `pnpm exec` so it works in dev (tsx) and in deployed builds where
// node_modules is available.
async function runDrizzlePush(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["--filter", "@workspace/db", "push-force"],
      { stdio: ["ignore", "inherit", "inherit"] },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`drizzle-kit push exited with code ${code}`));
    });
  });
}

async function isCoreSchemaMissing(): Promise<boolean> {
  try {
    await assertCoreSchemaPresent();
    return false;
  } catch {
    return true;
  }
}

// Apply pending SQL migrations from @workspace/db before opening the listening
// socket. Failure here is fatal: serving traffic against a stale schema is
// what produced the 500-storms this runner is meant to prevent.
async function applyPendingMigrations() {
  // In dev (tsx) the migrations live next to the source under
  // node_modules/@workspace/db/src/migrations (resolved by import.meta.url
  // inside @workspace/db). In the bundled build, build.mjs copies them next
  // to dist/index.mjs, so we point the runner at that directory.
  const bundledDir = path.join(__dirname, "migrations");
  const migrationsDir = fs.existsSync(bundledDir) ? bundledDir : undefined;

  // If the DB is empty (no `districts` table, etc.), bootstrap the base
  // schema declaratively from `lib/db/src/schema/` first. Migration 001 and
  // others backfill data against tables that must already exist, so this
  // step has to come before the SQL migration runner. After bootstrapping,
  // SQL files for objects already created by drizzle-kit push will be
  // recorded as applied via the runner's "already exists" idempotency path.
  if (await isCoreSchemaMissing()) {
    if (isProductionLikeDeploy()) {
      const message =
        "Core DB schema is missing in a production-like deploy. " +
        "Refusing to run `drizzle-kit push --force` automatically against a managed database. " +
        "Run the approved migration/bootstrap procedure manually, then redeploy.";
      logger.error(message);
      throw new Error(message);
    }

    logger.warn(
      "Core schema missing — bootstrapping local/dev database with `drizzle-kit push --force`",
    );
    try {
      await runDrizzlePush();
    } catch (err) {
      logger.error({ err }, "drizzle-kit push failed during local/dev bootstrap");
      throw err;
    }
  }

  const result = await runDbMigrations({
    migrationsDir,
    logger: {
      info: (msg) => logger.info({ subsystem: "migrate" }, msg),
      warn: (msg) => logger.warn({ subsystem: "migrate" }, msg),
    },
  });
  logger.info(
    {
      applied: result.applied,
      appliedCount: result.applied.length,
      baselinedCount: result.baselined.length,
      skippedCount: result.skipped.length,
      dir: result.migrationsDir,
    },
    "DB migrations complete",
  );
  // Fail fast if migrations did not produce a usable schema. Better to
  // refuse to start than to serve 500s against a half-configured DB.
  await assertCoreSchemaPresent();
  // Column-level drift check: every column declared in `lib/db/src/schema/*.ts`
  // must exist in the live DB. This catches the failure mode where a
  // Drizzle column is added without a paired migration (the symptom that
  // produced the silent onboarding-checklist 500s).
  await assertSchemaColumnsPresent();
}

try {
  await applyPendingMigrations();
} catch (err) {
  logger.error({ err }, "FATAL: DB migrations failed");
  captureException(err instanceof Error ? err : new Error(String(err)), { source: "applyPendingMigrations" });
  await flushSentry(2000);
  process.exit(1);
}

await initDevDistrictFallback().catch((e) => logger.warn({ err: e }, "initDevDistrictFallback failed (non-fatal)"));

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  startSisScheduler();
  void startSisWorker();
  startErrorLogCleanup();
  startCostAvoidanceSnapshotScheduler();
  startComplianceTrendSnapshotScheduler();
  startDistrictHealthSnapshotScheduler();
  initStripe();
  backfillDistrictSubscriptions();
  ensureDbConstraints().catch((err: unknown) => logger.warn({ err }, "ensureDbConstraints failed (non-fatal)"));
  ensureMedicaidReportSnapshotsTable()
    .catch((err: unknown) => logger.warn({ err }, "ensureMedicaidReportSnapshotsTable failed (non-fatal)"))
    .finally(() => startMedicaidReportSnapshotScheduler());
  ensureCaseloadSnapshotsTable()
    .catch((err: unknown) => logger.warn({ err }, "ensureCaseloadSnapshotsTable failed (non-fatal)"))
    .finally(() => startReminderScheduler());
  ensureScheduledReportsUnsubscribeColumn()
    .catch((err: unknown) => logger.warn({ err }, "ensureScheduledReportsUnsubscribeColumn failed (non-fatal)"));
  ensurePilotBaselineSnapshotsTable()
    .catch((err: unknown) => logger.warn({ err }, "ensurePilotBaselineSnapshotsTable failed (non-fatal)"))
    .finally(() => {
      backfillPilotBaselines().catch((err: unknown) =>
        logger.warn({ err }, "backfillPilotBaselines failed (non-fatal)"),
      );
    });
  ensureDemoReadinessRunsTable()
    .catch((err: unknown) => logger.warn({ err }, "ensureDemoReadinessRunsTable failed (non-fatal)"));
  reloadSchedule().catch((err: unknown) =>
    logger.warn({ err }, "demoResetScheduler: initial reloadSchedule failed (non-fatal)"),
  );
});
