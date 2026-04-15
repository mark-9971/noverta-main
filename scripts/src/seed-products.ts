import { getUncachableStripeClient } from './stripeClient';

async function createProducts() {
  try {
    const stripe = await getUncachableStripeClient();
    console.log('Creating MinuteOps/Trellis subscription plans...');

    const plans = [
      {
        name: 'Starter',
        description: 'For small districts — up to 10 staff seats',
        metadata: { tier: 'starter', seatLimit: '10' },
        monthlyAmount: 9900,
        yearlyAmount: 99900,
      },
      {
        name: 'Professional',
        description: 'For growing districts — up to 50 staff seats',
        metadata: { tier: 'professional', seatLimit: '50' },
        monthlyAmount: 29900,
        yearlyAmount: 299900,
      },
      {
        name: 'Enterprise',
        description: 'For large districts — unlimited staff seats',
        metadata: { tier: 'enterprise', seatLimit: '9999' },
        monthlyAmount: 59900,
        yearlyAmount: 599900,
      },
    ];

    for (const plan of plans) {
      const existing = await stripe.products.search({
        query: `name:'${plan.name}' AND active:'true'`,
      });

      if (existing.data.length > 0) {
        console.log(`  ${plan.name} already exists (${existing.data[0].id}). Skipping.`);
        continue;
      }

      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: plan.metadata,
      });
      console.log(`  Created product: ${product.name} (${product.id})`);

      const monthlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.monthlyAmount,
        currency: 'usd',
        recurring: { interval: 'month' },
      });
      console.log(`    Monthly: $${(plan.monthlyAmount / 100).toFixed(2)}/mo (${monthlyPrice.id})`);

      const yearlyPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: plan.yearlyAmount,
        currency: 'usd',
        recurring: { interval: 'year' },
      });
      console.log(`    Yearly: $${(plan.yearlyAmount / 100).toFixed(2)}/yr (${yearlyPrice.id})`);
    }

    console.log('Done! Webhooks will sync this data to the database.');
  } catch (error: any) {
    console.error('Error creating products:', error.message);
    process.exit(1);
  }
}

createProducts();
