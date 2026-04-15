import Stripe from 'stripe';
import { getUncachableStripeClient } from './stripeClient';

interface PlanConfig {
  name: string;
  description: string;
  tier: string;
  seatLimit: number;
  monthlyAmount: number;
  yearlyAmount: number;
  features: string;
  sortOrder: number;
}

const plans: PlanConfig[] = [
  {
    name: 'Starter',
    description: 'For small districts — up to 10 staff seats',
    tier: 'starter',
    seatLimit: 10,
    monthlyAmount: 9900,
    yearlyAmount: 99900,
    features: 'Up to 10 staff seats,Full compliance tracking,IEP management & reporting',
    sortOrder: 1,
  },
  {
    name: 'Professional',
    description: 'For growing districts — up to 50 staff seats',
    tier: 'professional',
    seatLimit: 50,
    monthlyAmount: 29900,
    yearlyAmount: 299900,
    features: 'Up to 50 staff seats,Full compliance tracking,IEP management & reporting,Priority support',
    sortOrder: 2,
  },
  {
    name: 'Enterprise',
    description: 'For large districts — unlimited staff seats',
    tier: 'enterprise',
    seatLimit: 9999,
    monthlyAmount: 59900,
    yearlyAmount: 599900,
    features: 'Unlimited staff seats,Full compliance tracking,IEP management & reporting,Priority support,Dedicated account manager',
    sortOrder: 3,
  },
];

async function createProducts() {
  try {
    const stripe = await getUncachableStripeClient();
    console.log('Creating MinuteOps/Trellis subscription plans...\n');

    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    for (const plan of plans) {
      const existing = await stripe.products.search({
        query: `name:'${plan.name}' AND active:'true'`,
      });

      let productId: string;
      let monthlyPriceId: string;
      let yearlyPriceId: string;

      if (existing.data.length > 0) {
        const product = existing.data[0];
        productId = product.id;
        console.log(`  ${plan.name} product exists (${productId}). Fetching prices...`);

        const prices = await stripe.prices.list({ product: productId, active: true });
        const monthly = prices.data.find((p: Stripe.Price) => p.recurring?.interval === 'month');
        const yearly = prices.data.find((p: Stripe.Price) => p.recurring?.interval === 'year');
        monthlyPriceId = monthly?.id ?? '';
        yearlyPriceId = yearly?.id ?? '';
      } else {
        const product = await stripe.products.create({
          name: plan.name,
          description: plan.description,
          metadata: { tier: plan.tier, seatLimit: String(plan.seatLimit) },
        });
        productId = product.id;
        console.log(`  Created product: ${plan.name} (${productId})`);

        const monthlyPrice = await stripe.prices.create({
          product: productId,
          unit_amount: plan.monthlyAmount,
          currency: 'usd',
          recurring: { interval: 'month' },
        });
        monthlyPriceId = monthlyPrice.id;
        console.log(`    Monthly: $${(plan.monthlyAmount / 100).toFixed(2)}/mo (${monthlyPriceId})`);

        const yearlyPrice = await stripe.prices.create({
          product: productId,
          unit_amount: plan.yearlyAmount,
          currency: 'usd',
          recurring: { interval: 'year' },
        });
        yearlyPriceId = yearlyPrice.id;
        console.log(`    Yearly: $${(plan.yearlyAmount / 100).toFixed(2)}/yr (${yearlyPriceId})`);
      }

      await pool.query(
        `INSERT INTO subscription_plans (tier, name, description, seat_limit, monthly_price_id, yearly_price_id, monthly_price_cents, yearly_price_cents, stripe_product_id, features, sort_order, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
         ON CONFLICT (tier) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           seat_limit = EXCLUDED.seat_limit,
           monthly_price_id = EXCLUDED.monthly_price_id,
           yearly_price_id = EXCLUDED.yearly_price_id,
           monthly_price_cents = EXCLUDED.monthly_price_cents,
           yearly_price_cents = EXCLUDED.yearly_price_cents,
           stripe_product_id = EXCLUDED.stripe_product_id,
           features = EXCLUDED.features,
           sort_order = EXCLUDED.sort_order`,
        [plan.tier, plan.name, plan.description, plan.seatLimit, monthlyPriceId, yearlyPriceId, plan.monthlyAmount, plan.yearlyAmount, productId, plan.features, plan.sortOrder]
      );
      console.log(`    Synced to subscription_plans table (tier=${plan.tier})`);
    }

    await pool.end();
    console.log('\nDone! Plans seeded in both Stripe and subscription_plans table.');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error creating products:', message);
    process.exit(1);
  }
}

createProducts();
