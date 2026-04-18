import { clerkSetup } from "@clerk/testing/playwright";
import type { FullConfig } from "@playwright/test";

const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";

const TEACHER_EMAIL =
  process.env.E2E_TEACHER_EMAIL ?? "trellis-e2e-teacher+clerk_test@example.com";

const BASE_URL =
  process.env.E2E_BASE_URL ??
  (process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "http://localhost:80");

/**
 * Configure @clerk/testing once per test run. This pulls
 * CLERK_PUBLISHABLE_KEY / CLERK_SECRET_KEY from env and registers the
 * shared Clerk testing token used by `setupClerkTestingToken` in specs.
 *
 * Also provisions a dedicated admin staff record for the E2E test user so
 * that publicMetadata.staffId is populated — required for terminal-state
 * incident transitions and parent-notification review endpoints.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  await clerkSetup();

  if (!process.env.CLERK_SECRET_KEY) {
    console.warn(
      "[global-setup] CLERK_SECRET_KEY not set — skipping E2E admin provisioning.",
    );
    return;
  }

  // The provision endpoint requires a shared secret header.
  // Falls back to "e2e-dev-local" when E2E_PROVISION_KEY is not set.
  const provisionKey = process.env.E2E_PROVISION_KEY ?? "e2e-dev-local";

  async function provision(email: string, role: "admin" | "sped_teacher") {
    try {
      const res = await fetch(`${BASE_URL}/api/e2e/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-E2E-Key": provisionKey,
        },
        body: JSON.stringify({ email, role }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          staffId: number;
          districtId: number;
          alreadyProvisioned?: boolean;
        };
        const verb = data.alreadyProvisioned ? "already provisioned" : "provisioned";
        console.log(
          `[global-setup] E2E ${role} ${verb}: staffId=${data.staffId}, districtId=${data.districtId}`,
        );
      } else {
        const text = await res.text();
        console.warn(
          `[global-setup] E2E ${role} provision warning (HTTP ${res.status}): ${text}`,
        );
      }
    } catch (err: unknown) {
      console.warn(
        `[global-setup] Could not reach /api/e2e/setup for ${role} — staffId may not be set:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  await provision(ADMIN_EMAIL, "admin");
  await provision(TEACHER_EMAIL, "sped_teacher");
}
