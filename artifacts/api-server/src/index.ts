import app from "./app";
import { logger } from "./lib/logger";
import { startSisScheduler } from "./lib/sis/scheduler";
import { db, districtSubscriptionsTable, districtsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

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

    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(',')[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    logger.info('Stripe webhook configured');

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  startSisScheduler();
  initStripe();
  backfillDistrictSubscriptions();
});
