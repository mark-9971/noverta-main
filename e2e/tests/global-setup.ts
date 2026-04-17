import { clerkSetup } from "@clerk/testing/playwright";
import type { FullConfig } from "@playwright/test";

/**
 * Configure @clerk/testing once per test run. This pulls
 * CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY from env and registers the
 * shared Clerk testing token used by `setupClerkTestingToken` in specs.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  await clerkSetup();
}
