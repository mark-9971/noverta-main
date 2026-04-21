import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface UserFixture {
  email: string;
  staffId?: number;
  districtId?: number;
  provisioned?: boolean;
}

export interface E2EFixtures {
  adminA: UserFixture;
  adminB: UserFixture;
  adminC: UserFixture;
  teacher: UserFixture;
}

const FIXTURES_PATH = join(__dirname, "..", "..", ".fixtures.json");

const DEFAULTS: E2EFixtures = {
  adminA: {
    email:
      process.env.E2E_ADMIN_EMAIL ??
      "trellis-e2e-admin+clerk_test@example.com",
  },
  adminB: {
    email:
      process.env.E2E_ADMIN_B_EMAIL ??
      "trellis-e2e-admin-b+clerk_test@example.com",
  },
  adminC: {
    email:
      process.env.E2E_ADMIN_C_EMAIL ??
      "trellis-e2e-admin-c+clerk_test@example.com",
  },
  teacher: {
    email:
      process.env.E2E_TEACHER_EMAIL ??
      "trellis-e2e-teacher+clerk_test@example.com",
  },
};

/**
 * Reads the resolved scopes (staffId, districtId) that global-setup
 * persisted after calling /api/e2e/setup for each fixture user. Falls
 * back to email-only defaults so specs can still import the module
 * even when global-setup didn't run (e.g. quick local debugging).
 */
export function loadFixtures(): E2EFixtures {
  if (!existsSync(FIXTURES_PATH)) return DEFAULTS;
  try {
    const raw = JSON.parse(readFileSync(FIXTURES_PATH, "utf-8")) as Partial<E2EFixtures>;
    return {
      adminA: { ...DEFAULTS.adminA, ...(raw.adminA ?? {}) },
      adminB: { ...DEFAULTS.adminB, ...(raw.adminB ?? {}) },
      adminC: { ...DEFAULTS.adminC, ...(raw.adminC ?? {}) },
      teacher: { ...DEFAULTS.teacher, ...(raw.teacher ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}
