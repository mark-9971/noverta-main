import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * End-to-end coverage for the sample-data guided tour
 * (artifacts/trellis/src/components/SampleDataTour.tsx).
 *
 * The tour overlays five steps across two pages and depends on
 * `data-tour-id` markers that are easy to remove during refactors.
 * This spec asserts each step's anchor element is present, the popover
 * advances correctly, and the seen-flag dismissal behavior holds across
 * a reload.
 *
 * Steps (order must match SampleDataTour.STEPS):
 *   0. /compliance-risk-report — [data-tour-id="compliance-summary"]
 *   1. /compliance-risk-report — [data-tour-id="shortfall-student"]
 *   2. /compliance-risk-report — [data-tour-id="cost-risk"]
 *   3. /                       — [data-tour-id="readiness-checklist"]
 *   4. (no nav)                — [data-testid="banner-sample-data"]
 */

const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "TrellisE2E!Test#2026";

const TOUR_STORAGE_KEY = "noverta.sampleTour.v1";
const TOUR_START_FLAG = "noverta.sampleTour.start";

const TOUR_ANCHORS: ReadonlyArray<{ selector: string; label: string }> = [
  { selector: '[data-tour-id="compliance-summary"]', label: "compliance summary" },
  { selector: '[data-tour-id="shortfall-student"]', label: "shortfall student" },
  { selector: '[data-tour-id="cost-risk"]', label: "cost risk card" },
  { selector: '[data-tour-id="readiness-checklist"]', label: "readiness checklist" },
  { selector: '[data-testid="banner-sample-data"]', label: "sample data banner" },
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

async function teardownSampleDataIfPresent(page: Page) {
  const status = await getSampleDataStatus(page);
  if (!status.hasSampleData && status.sampleStudents === 0) return;
  const res = await page.request.delete("/api/sample-data");
  expect(res.ok(), "DELETE /api/sample-data should succeed").toBeTruthy();
  // Wait until the API agrees the district is clean before continuing.
  await expect
    .poll(async () => (await getSampleDataStatus(page)).sampleStudents, {
      timeout: 120_000,
    })
    .toBe(0);
}

async function clearTourLocalStorage(page: Page) {
  await page.evaluate(
    ({ seenKey, startKey }) => {
      try {
        window.localStorage.removeItem(seenKey);
        window.localStorage.removeItem(startKey);
      } catch {
        /* ignore — non-blocking */
      }
    },
    { seenKey: TOUR_STORAGE_KEY, startKey: TOUR_START_FLAG },
  );
}

test.describe("Sample data guided tour", () => {
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

    // Wait for an authenticated surface so page.request inherits the
    // signed-in session before we hit /api/sample-data.
    await page.goto("/setup");
    await expect(
      page.getByRole("heading", { name: "Set Up Noverta" }),
    ).toBeVisible({ timeout: 60_000 });

    await teardownSampleDataIfPresent(page);
    await clearTourLocalStorage(page);
  });

  test.afterEach(async ({ page }) => {
    // Best-effort cleanup so reruns and other suites start from a clean
    // district. Failures here shouldn't mask the real test outcome.
    try {
      await teardownSampleDataIfPresent(page);
    } catch {
      /* ignore */
    }
  });

  test("auto-opens after seeding, walks all five anchors, and stays dismissed on reload", async ({
    page,
  }) => {
    await page.goto("/setup");

    // Sanity: CTA visible, tour not yet present.
    await expect(page.getByTestId("sample-data-cta")).toBeVisible();
    await expect(page.getByTestId("sample-data-tour")).toHaveCount(0);

    // Seed sample data — this sets the START_FLAG and navigates to
    // /compliance-risk-report, where the tour should auto-open.
    await page.getByTestId("button-seed-sample-data").click();
    await page.waitForURL("**/compliance-risk-report", { timeout: 120_000 });

    // Tour overlay appears and starts on step 0.
    const tour = page.getByTestId("sample-data-tour");
    await expect(tour).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("tour-step-0")).toBeVisible();

    // Walk through each of the five steps, asserting the anchored element
    // is present in the DOM and the corresponding popover is visible.
    for (let i = 0; i < TOUR_ANCHORS.length; i++) {
      const { selector, label } = TOUR_ANCHORS[i];

      await expect(
        page.getByTestId(`tour-step-${i}`),
        `tour popover ${i} (${label}) should be visible`,
      ).toBeVisible({ timeout: 30_000 });

      await expect(
        page.locator(selector).first(),
        `anchor for step ${i} (${label}) should exist in the DOM`,
      ).toHaveCount(1, { timeout: 30_000 });

      const isLast = i === TOUR_ANCHORS.length - 1;
      const next = page.getByTestId("button-tour-next");
      await expect(next).toContainText(isLast ? "Finish" : "Next");
      await next.click();
    }

    // Finish closes the overlay and persists the seen flag.
    await expect(tour).toHaveCount(0, { timeout: 10_000 });
    const seenAfterFinish = await page.evaluate(
      (k) => window.localStorage.getItem(k),
      TOUR_STORAGE_KEY,
    );
    expect(seenAfterFinish).toBe("seen");

    // Reload while sample data is still loaded — tour must NOT reappear.
    await page.reload();
    await expect(page.getByTestId("banner-sample-data")).toBeVisible({
      timeout: 30_000,
    });
    // Give the SampleDataTour effect a chance to run before asserting absence.
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("sample-data-tour")).toHaveCount(0);

    // And on a different page where the tour also mounts.
    await page.goto("/");
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("sample-data-tour")).toHaveCount(0);
  });

  test("Skip tour also sets the seen flag and prevents re-appearance", async ({
    page,
  }) => {
    await page.goto("/setup");
    await page.getByTestId("button-seed-sample-data").click();
    await page.waitForURL("**/compliance-risk-report", { timeout: 120_000 });

    const tour = page.getByTestId("sample-data-tour");
    await expect(tour).toBeVisible({ timeout: 30_000 });

    // Click "Skip tour" on the first step.
    await page.getByTestId("button-tour-skip").click();
    await expect(tour).toHaveCount(0, { timeout: 10_000 });

    const seen = await page.evaluate(
      (k) => window.localStorage.getItem(k),
      TOUR_STORAGE_KEY,
    );
    expect(seen).toBe("seen");

    await page.reload();
    await expect(page.getByTestId("banner-sample-data")).toBeVisible({
      timeout: 30_000,
    });
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("sample-data-tour")).toHaveCount(0);
  });
});
