import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end coverage for the cross-module showcase tour
 * (artifacts/trellis/src/components/ShowcaseTour.tsx).
 *
 * The tour visits the strongest screen of each major Trellis module —
 * dashboard, compliance, IEP, progress reports, parent communication,
 * restraint incidents, comp obligations, Medicaid claims, SIS sync, and
 * reports — using `data-tour-id="showcase-..."` anchors. This spec
 * verifies each anchor is present, navigation between pages works, and
 * the per-user × per-district seen flag prevents re-launch on reload.
 *
 * Steps (order must match ShowcaseTour.STEPS):
 *   0. /                         — [data-testid="section-overall-compliance"]
 *   1. /compliance-risk-report   — [data-tour-id="cost-risk"]
 *   2. /iep-builder              — [data-tour-id="showcase-iep-builder"]
 *   3. /progress-reports         — [data-tour-id="showcase-progress-reports"]
 *   4. /parent-communication     — [data-tour-id="showcase-parent-portal"]
 *   5. /protective-measures      — [data-tour-id="showcase-protective-measures"]
 *   6. /compensatory-services    — [data-tour-id="showcase-compensatory"]
 *   7. /medicaid-billing         — [data-tour-id="showcase-medicaid"]
 *   8. /settings?tab=sis         — [data-tour-id="showcase-sis-sync"]
 *   9. /reports                  — [data-tour-id="showcase-reports"]
 */

const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "TrellisE2E!Test#2026";

const SHOWCASE_STORAGE_PREFIX = "trellis.showcaseTour.v1";
const SHOWCASE_START_FLAG = "trellis.showcaseTour.start";
const SAMPLE_TOUR_STORAGE_PREFIX = "trellis.sampleTour.v1";
const SAMPLE_TOUR_START_FLAG = "trellis.sampleTour.start";

const SHOWCASE_ANCHORS: ReadonlyArray<{ selector: string; label: string }> = [
  { selector: '[data-testid="section-overall-compliance"]', label: "dashboard compliance" },
  { selector: '[data-tour-id="cost-risk"]', label: "compliance cost risk" },
  { selector: '[data-tour-id="showcase-iep-builder"]', label: "IEP builder landing" },
  { selector: '[data-tour-id="showcase-progress-reports"]', label: "progress reports" },
  { selector: '[data-tour-id="showcase-parent-portal"]', label: "parent communication" },
  { selector: '[data-tour-id="showcase-protective-measures"]', label: "protective measures" },
  { selector: '[data-tour-id="showcase-compensatory"]', label: "compensatory services" },
  { selector: '[data-tour-id="showcase-medicaid"]', label: "medicaid claim queue" },
  { selector: '[data-tour-id="showcase-sis-sync"]', label: "SIS sync" },
  { selector: '[data-tour-id="showcase-reports"]', label: "reports & exports" },
];

async function getSampleDataStatus(page: Page) {
  const res = await page.request.get("/api/sample-data");
  expect(res.ok(), "GET /api/sample-data should succeed").toBeTruthy();
  return res.json() as Promise<{
    hasSampleData: boolean;
    sampleStudents: number;
    sampleStaff: number;
  }>;
}

async function ensureSampleData(page: Page) {
  const status = await getSampleDataStatus(page);
  if (status.hasSampleData && status.sampleStudents > 0) return;
  const res = await page.request.post("/api/sample-data");
  expect(res.ok(), "POST /api/sample-data should succeed").toBeTruthy();
  await expect
    .poll(async () => (await getSampleDataStatus(page)).hasSampleData, {
      timeout: 120_000,
    })
    .toBe(true);
}

async function teardownSampleDataIfPresent(page: Page) {
  const status = await getSampleDataStatus(page);
  if (!status.hasSampleData && status.sampleStudents === 0) return;
  const res = await page.request.delete("/api/sample-data");
  expect(res.ok(), "DELETE /api/sample-data should succeed").toBeTruthy();
  await expect
    .poll(async () => (await getSampleDataStatus(page)).sampleStudents, {
      timeout: 120_000,
    })
    .toBe(0);
}

async function clearTourLocalStorage(page: Page) {
  await page.evaluate(
    ({ scPrefix, scStart, sampPrefix, sampStart }) => {
      try {
        const toRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && (k.startsWith(scPrefix) || k.startsWith(sampPrefix))) {
            toRemove.push(k);
          }
        }
        toRemove.forEach((k) => window.localStorage.removeItem(k));
        window.localStorage.removeItem(scStart);
        window.localStorage.removeItem(sampStart);
      } catch {
        /* ignore — non-blocking */
      }
    },
    {
      scPrefix: SHOWCASE_STORAGE_PREFIX,
      scStart: SHOWCASE_START_FLAG,
      sampPrefix: SAMPLE_TOUR_STORAGE_PREFIX,
      sampStart: SAMPLE_TOUR_START_FLAG,
    },
  );
}

test.describe("Showcase guided tour", () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto("/setup");
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
      },
    });
    await page.goto("/");
    // Wait for an authenticated surface so page.request inherits the
    // session before we hit /api/sample-data.
    await expect(
      page.locator('[data-testid="section-overall-compliance"], [data-tour-id="readiness-checklist"]').first(),
    ).toBeVisible({ timeout: 60_000 });
    await ensureSampleData(page);
    await clearTourLocalStorage(page);
    // Reload so the dashboard re-runs sample-data status with fresh
    // localStorage state and the showcase tour entry button shows.
    await page.reload();
    await expect(page.getByTestId("banner-sample-data")).toBeVisible({
      timeout: 30_000,
    });
  });

  test.afterEach(async ({ page }) => {
    try {
      await teardownSampleDataIfPresent(page);
    } catch {
      /* ignore */
    }
  });

  test("dashboard button launches tour, walks all ten anchors, persists seen flag", async ({
    page,
  }) => {
    // Sanity: dashboard CTA button is rendered for admins on demo districts.
    const launch = page.getByTestId("button-launch-showcase-tour");
    await expect(launch).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("showcase-tour")).toHaveCount(0);

    await launch.click();

    const tour = page.getByTestId("showcase-tour");
    await expect(tour).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("showcase-step-0")).toBeVisible();

    for (let i = 0; i < SHOWCASE_ANCHORS.length; i++) {
      const { selector, label } = SHOWCASE_ANCHORS[i];

      await expect(
        page.getByTestId(`showcase-step-${i}`),
        `showcase popover ${i} (${label}) should be visible`,
      ).toBeVisible({ timeout: 30_000 });

      await expect(
        page.locator(selector).first(),
        `anchor for step ${i} (${label}) should exist`,
      ).toHaveCount(1, { timeout: 30_000 });

      const isLast = i === SHOWCASE_ANCHORS.length - 1;
      const next = page.getByTestId("button-showcase-next");
      await expect(next).toContainText(isLast ? "Finish" : "Next");
      await next.click();
    }

    // Finish closes the overlay and persists a per-user × per-district
    // seen flag (key prefix `trellis.showcaseTour.v1.<district>.<user>`).
    await expect(tour).toHaveCount(0, { timeout: 10_000 });
    const seenKeys = await page.evaluate((prefix) => {
      const out: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(prefix) && window.localStorage.getItem(k) === "seen") {
          out.push(k);
        }
      }
      return out;
    }, SHOWCASE_STORAGE_PREFIX);
    expect(seenKeys.length, "showcase seen flag should be set").toBeGreaterThan(0);

    // Reload — the tour must NOT auto-relaunch.
    await page.goto("/");
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("showcase-tour")).toHaveCount(0);
  });

  test("SampleDataTour final step hands off into the showcase tour", async ({
    page,
  }) => {
    // Arm the sample-data tour by clearing local-storage and setting
    // its start flag, then reload to land into it.
    await page.evaluate(
      ({ start }) => window.localStorage.setItem(start, "1"),
      { start: SAMPLE_TOUR_START_FLAG },
    );
    await page.goto("/compliance-risk-report");
    const sampleTour = page.getByTestId("sample-data-tour");
    await expect(sampleTour).toBeVisible({ timeout: 30_000 });

    // Click Next until reaching the final step (5 steps, 0..4).
    for (let i = 0; i < 4; i++) {
      await page.getByTestId("button-tour-next").click();
    }
    await expect(page.getByTestId("tour-step-4")).toBeVisible({ timeout: 30_000 });

    // The final-step handoff CTA closes the sample tour and starts the showcase tour.
    const handoff = page.getByTestId("button-tour-handoff-showcase");
    await expect(handoff).toBeVisible();
    await handoff.click();

    await expect(sampleTour).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId("showcase-tour")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("showcase-step-0")).toBeVisible();
  });

  test("Skip on first step records seen flag and the settings replay control re-opens it", async ({
    page,
  }) => {
    await page.getByTestId("button-launch-showcase-tour").click();
    const tour = page.getByTestId("showcase-tour");
    await expect(tour).toBeVisible({ timeout: 30_000 });

    await page.getByTestId("button-showcase-skip").click();
    await expect(tour).toHaveCount(0, { timeout: 10_000 });

    const seenKeys = await page.evaluate((prefix) => {
      const out: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith(prefix) && window.localStorage.getItem(k) === "seen") {
          out.push(k);
        }
      }
      return out;
    }, SHOWCASE_STORAGE_PREFIX);
    expect(seenKeys.length).toBeGreaterThan(0);

    // Settings replay — confirm the control exists and re-opens the tour.
    await page.goto("/settings");
    const replay = page.getByTestId("button-settings-replay-showcase");
    await expect(replay).toBeVisible({ timeout: 30_000 });
    await replay.click();
    await expect(page.getByTestId("showcase-tour")).toBeVisible({
      timeout: 30_000,
    });
  });
});
