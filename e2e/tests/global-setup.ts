import { clerkSetup } from "@clerk/testing/playwright";
import type { FullConfig } from "@playwright/test";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";

const TEACHER_EMAIL =
  process.env.E2E_TEACHER_EMAIL ?? "trellis-e2e-teacher+clerk_test@example.com";

// Cross-district / cross-user fixtures used by shared-handling-state.spec.ts.
// Admin B sits in the same primary district as Admin A; Admin C lives in a
// dedicated secondary district so we can prove tenant isolation in the UI.
const ADMIN_B_EMAIL =
  process.env.E2E_ADMIN_B_EMAIL ?? "trellis-e2e-admin-b+clerk_test@example.com";
const ADMIN_C_EMAIL =
  process.env.E2E_ADMIN_C_EMAIL ?? "trellis-e2e-admin-c+clerk_test@example.com";

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

  // Track resolved scopes so the cross-district spec can read them without
  // re-calling Clerk. Written to e2e/.fixtures.json after all calls finish.
  const resolved: Record<
    string,
    { staffId?: number; districtId?: number; provisioned: boolean }
  > = {};

  async function provision(
    email: string,
    role: "admin" | "sped_teacher",
    opts: { districtSlot?: "primary" | "secondary"; key?: string } = {},
  ) {
    const key = opts.key ?? `${role}:${opts.districtSlot ?? "primary"}`;
    try {
      const res = await fetch(`${BASE_URL}/api/e2e/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-E2E-Key": provisionKey,
        },
        body: JSON.stringify({
          email,
          role,
          ...(opts.districtSlot ? { districtSlot: opts.districtSlot } : {}),
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          staffId: number;
          districtId: number;
          alreadyProvisioned?: boolean;
        };
        const verb = data.alreadyProvisioned ? "already provisioned" : "provisioned";
        console.log(
          `[global-setup] E2E ${role} (${opts.districtSlot ?? "primary"}) ${verb}: email=${email}, staffId=${data.staffId}, districtId=${data.districtId}`,
        );
        resolved[key] = {
          staffId: data.staffId,
          districtId: data.districtId,
          provisioned: true,
        };
      } else {
        const text = await res.text();
        console.warn(
          `[global-setup] E2E ${role} provision warning for ${email} (HTTP ${res.status}): ${text}`,
        );
        resolved[key] = { provisioned: false };
      }
    } catch (err: unknown) {
      console.warn(
        `[global-setup] Could not reach /api/e2e/setup for ${role} ${email}:`,
        err instanceof Error ? err.message : String(err),
      );
      resolved[key] = { provisioned: false };
    }
  }

  await provision(ADMIN_EMAIL, "admin", { key: "adminA" });
  await provision(TEACHER_EMAIL, "sped_teacher", { key: "teacher" });
  await provision(ADMIN_B_EMAIL, "admin", {
    districtSlot: "primary",
    key: "adminB",
  });
  await provision(ADMIN_C_EMAIL, "admin", {
    districtSlot: "secondary",
    key: "adminC",
  });

  // Persist resolved scopes for specs to import via tests/_helpers/fixtures.ts.
  try {
    writeFileSync(
      join(__dirname, "..", ".fixtures.json"),
      JSON.stringify(
        {
          adminA: { email: ADMIN_EMAIL, ...resolved.adminA },
          adminB: { email: ADMIN_B_EMAIL, ...resolved.adminB },
          adminC: { email: ADMIN_C_EMAIL, ...resolved.adminC },
          teacher: { email: TEACHER_EMAIL, ...resolved.teacher },
        },
        null,
        2,
      ),
    );
  } catch (err) {
    console.warn(
      "[global-setup] Could not write .fixtures.json:",
      err instanceof Error ? err.message : String(err),
    );
  }
}
