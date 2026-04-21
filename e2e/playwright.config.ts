import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL
  ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:80");

// Allow overriding the Chromium executable (e.g. system Chromium in NixOS where
// Playwright's downloaded shell cannot load Nix-managed shared libraries).
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

// Memory-constrained mode (E2E_LOW_MEM=1): pass chromium flags that collapse
// renderer/utility/GPU into a single OS process and disable /dev/shm usage.
// Saves ~300-500 MB RSS at the cost of slower navigation. Required to run
// Playwright reliably in tightly constrained dev containers where the parent
// agent infrastructure already consumes most of available RAM.
const lowMemArgs =
  process.env.E2E_LOW_MEM === "1"
    ? [
        "--single-process",
        "--disable-dev-shm-usage",
        "--no-zygote",
        "--disable-gpu",
        "--disable-extensions",
      ]
    : [];

export default defineConfig({
  testDir: "./tests",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
  },
  globalSetup: "./tests/global-setup.ts",
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          ...(chromiumExecutablePath ? { executablePath: chromiumExecutablePath } : {}),
          ...(lowMemArgs.length > 0 ? { args: lowMemArgs } : {}),
        },
      },
    },
  ],
});
