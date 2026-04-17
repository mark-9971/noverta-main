import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test } from "@playwright/test";

/**
 * End-to-end coverage for the new-tenant "Try with sample data" flow.
 *
 * Flow under test (artifacts/trellis + artifacts/api-server):
 *   1. Brand-new admin signs in.
 *   2. /setup shows the SampleDataCta. No SampleDataBanner yet.
 *   3. Click "Try with sample data" -> POST /api/sample-data ->
 *      redirect to /compliance-risk-report with non-empty content.
 *   4. SampleDataBanner appears across pages (mounted in AppLayout).
 *   5. Click "Remove sample data" -> "Yes, remove" -> DELETE /api/sample-data.
 *   6. Banner disappears, counts return to zero, CTA returns on /setup.
 */

const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "TrellisE2E!Test#2026";

async function getSampleDataStatus(page: import("@playwright/test").Page) {
  // Use page.request so the call inherits the signed-in browser session
  // (Clerk cookies). The standalone `request` fixture is unauthenticated
  // and would be rejected by requireAuth + district scope on /api/sample-data.
  const res = await page.request.get("/api/sample-data");
  expect(res.ok(), "GET /api/sample-data should succeed").toBeTruthy();
  return res.json() as Promise<{
    hasSampleData: boolean;
    sampleStudents: number;
    sampleStaff: number;
  }>;
}

test.describe("Sample data onboarding flow", () => {
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
  });

  test("admin can seed, view non-empty compliance report, and tear down", async ({
    page,
  }) => {
    await page.goto("/setup");
    await expect(
      page.getByRole("heading", { name: "Set Up Trellis" }),
    ).toBeVisible();

    // Defensive cleanup: query the server (not the DOM) for ground truth so
    // the decision doesn't race the sample-data react-query hydration.
    const initial = await getSampleDataStatus(page);
    if (initial.hasSampleData || initial.sampleStudents > 0) {
      // Wait for the banner the app renders for this state, then tear down.
      const banner = page.getByTestId("banner-sample-data");
      await expect(banner).toBeVisible({ timeout: 30_000 });
      await page.getByTestId("button-remove-sample").click();
      await page.getByTestId("button-confirm-teardown").click();
      await expect(banner).toHaveCount(0, { timeout: 120_000 });
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Set Up Trellis" }),
      ).toBeVisible();
    }

    // Pre-state: CTA visible, banner absent, status reports zero.
    const cta = page.getByTestId("sample-data-cta");
    await expect(cta).toBeVisible();
    await expect(page.getByTestId("button-seed-sample-data")).toBeEnabled();
    await expect(page.getByTestId("banner-sample-data")).toHaveCount(0);

    // Seed sample data.
    await page.getByTestId("button-seed-sample-data").click();

    // The CTA's onSuccess navigates to /compliance-risk-report after the
    // seeder finishes (which inserts ~10 students, IEPs, services, and
    // ~2 weeks of session logs — give it generous time).
    await page.waitForURL("**/compliance-risk-report", { timeout: 120_000 });

    // Compliance risk report must render real data, not the empty state.
    await expect(
      page.getByText("No Compliance Data Available"),
    ).toHaveCount(0);
    const studentsCard = page
      .locator("div", {
        has: page.getByText("Students with Services", { exact: true }),
      })
      .first();
    await expect(studentsCard).toBeVisible({ timeout: 30_000 });
    const studentsCount = await studentsCard
      .locator("div.text-3xl.font-bold")
      .first()
      .innerText();
    expect(Number(studentsCount.trim())).toBeGreaterThan(0);

    // Banner appears on the compliance-risk page.
    await expect(page.getByTestId("banner-sample-data")).toBeVisible();
    await expect(page.getByTestId("banner-sample-data")).toContainText(
      "Sample data",
    );

    // Banner persists across pages (mounted in AppLayout).
    await page.goto("/students");
    await expect(page.getByTestId("banner-sample-data")).toBeVisible();

    // Tear down via the banner's confirm flow.
    await page.getByTestId("button-remove-sample").click();
    await expect(page.getByText("Remove all sample data?")).toBeVisible();
    await page.getByTestId("button-confirm-teardown").click();
    await expect(page.getByTestId("banner-sample-data")).toHaveCount(0, {
      timeout: 120_000,
    });

    // Server-side confirmation: counts are zero.
    const status = await getSampleDataStatus(page);
    expect(status.hasSampleData).toBe(false);
    expect(status.sampleStudents).toBe(0);
    expect(status.sampleStaff).toBe(0);

    // CTA returns on /setup, proving the district is back to a clean slate.
    await page.goto("/setup");
    await expect(page.getByTestId("sample-data-cta")).toBeVisible();
    await expect(page.getByTestId("banner-sample-data")).toHaveCount(0);
  });
});
