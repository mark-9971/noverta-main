# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sample-data-flow.spec.ts >> Sample data onboarding flow >> admin can seed, view non-empty compliance report, and tear down
- Location: tests/sample-data-flow.spec.ts:48:3

# Error details

```
Error: page.evaluate: Execution context was destroyed, most likely because of a navigation
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e4]:
      - img [ref=e6]
      - generic [ref=e9]:
        - heading "Trellis" [level=1] [ref=e10]
        - paragraph [ref=e11]: Service-minute compliance for SPED.
    - region "Notifications (F8)":
      - list
  - generic [ref=e12]:
    - generic [ref=e13]:
      - text: This is a temporary development preview, and these links are not for public use.
      - link "Publish your app" [ref=e14] [cursor=pointer]:
        - /url: https://docs.replit.com/category/replit-deployments?ref=replit-dev-banner
      - text: for secure sharing or use an invite link.
    - button "Close banner" [ref=e15] [cursor=pointer]:
      - img [ref=e16]
```

# Test source

```ts
  1   | import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
  2   | import { expect, test } from "@playwright/test";
  3   | 
  4   | /**
  5   |  * End-to-end coverage for the new-tenant "Try with sample data" flow.
  6   |  *
  7   |  * Flow under test (artifacts/trellis + artifacts/api-server):
  8   |  *   1. Brand-new admin signs in.
  9   |  *   2. /setup shows the SampleDataCta. No SampleDataBanner yet.
  10  |  *   3. Click "Try with sample data" -> POST /api/sample-data ->
  11  |  *      redirect to /compliance-risk-report with non-empty content.
  12  |  *   4. SampleDataBanner appears across pages (mounted in AppLayout).
  13  |  *   5. Click "Remove sample data" -> "Yes, remove" -> DELETE /api/sample-data.
  14  |  *   6. Banner disappears, counts return to zero, CTA returns on /setup.
  15  |  */
  16  | 
  17  | const ADMIN_EMAIL =
  18  |   process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";
  19  | const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "TrellisE2E!Test#2026";
  20  | 
  21  | async function getSampleDataStatus(page: import("@playwright/test").Page) {
  22  |   // Use page.request so the call inherits the signed-in browser session
  23  |   // (Clerk cookies). The standalone `request` fixture is unauthenticated
  24  |   // and would be rejected by requireAuth + district scope on /api/sample-data.
  25  |   const res = await page.request.get("/api/sample-data");
  26  |   expect(res.ok(), "GET /api/sample-data should succeed").toBeTruthy();
  27  |   return res.json() as Promise<{
  28  |     hasSampleData: boolean;
  29  |     sampleStudents: number;
  30  |     sampleStaff: number;
  31  |   }>;
  32  | }
  33  | 
  34  | test.describe("Sample data onboarding flow", () => {
  35  |   test.beforeEach(async ({ page }) => {
  36  |     await setupClerkTestingToken({ page });
  37  |     await page.goto("/setup");
> 38  |     await clerk.signIn({
      |     ^ Error: page.evaluate: Execution context was destroyed, most likely because of a navigation
  39  |       page,
  40  |       signInParams: {
  41  |         strategy: "password",
  42  |         identifier: ADMIN_EMAIL,
  43  |         password: ADMIN_PASSWORD,
  44  |       },
  45  |     });
  46  |   });
  47  | 
  48  |   test("admin can seed, view non-empty compliance report, and tear down", async ({
  49  |     page,
  50  |   }) => {
  51  |     await page.goto("/setup");
  52  |     await expect(
  53  |       page.getByRole("heading", { name: "Set Up Trellis" }),
  54  |     ).toBeVisible();
  55  | 
  56  |     // Defensive cleanup: query the server (not the DOM) for ground truth so
  57  |     // the decision doesn't race the sample-data react-query hydration.
  58  |     const initial = await getSampleDataStatus(page);
  59  |     if (initial.hasSampleData || initial.sampleStudents > 0) {
  60  |       // Wait for the banner the app renders for this state, then tear down.
  61  |       const banner = page.getByTestId("banner-sample-data");
  62  |       await expect(banner).toBeVisible({ timeout: 30_000 });
  63  |       await page.getByTestId("button-remove-sample").click();
  64  |       await page.getByTestId("button-confirm-teardown").click();
  65  |       await expect(banner).toHaveCount(0, { timeout: 120_000 });
  66  |       await page.reload();
  67  |       await expect(
  68  |         page.getByRole("heading", { name: "Set Up Trellis" }),
  69  |       ).toBeVisible();
  70  |     }
  71  | 
  72  |     // Pre-state: CTA visible, banner absent, status reports zero.
  73  |     const cta = page.getByTestId("sample-data-cta");
  74  |     await expect(cta).toBeVisible();
  75  |     await expect(page.getByTestId("button-seed-sample-data")).toBeEnabled();
  76  |     await expect(page.getByTestId("banner-sample-data")).toHaveCount(0);
  77  | 
  78  |     // Seed sample data.
  79  |     await page.getByTestId("button-seed-sample-data").click();
  80  | 
  81  |     // The CTA's onSuccess navigates to /compliance-risk-report after the
  82  |     // seeder finishes (which inserts ~10 students, IEPs, services, and
  83  |     // ~2 weeks of session logs — give it generous time).
  84  |     await page.waitForURL("**/compliance-risk-report", { timeout: 120_000 });
  85  | 
  86  |     // Compliance risk report must render real data, not the empty state.
  87  |     await expect(
  88  |       page.getByText("No Compliance Data Available"),
  89  |     ).toHaveCount(0);
  90  |     const studentsCard = page
  91  |       .locator("div", {
  92  |         has: page.getByText("Students with Services", { exact: true }),
  93  |       })
  94  |       .first();
  95  |     await expect(studentsCard).toBeVisible({ timeout: 30_000 });
  96  |     const studentsCount = await studentsCard
  97  |       .locator("div.text-3xl.font-bold")
  98  |       .first()
  99  |       .innerText();
  100 |     expect(Number(studentsCount.trim())).toBeGreaterThan(0);
  101 | 
  102 |     // Banner appears on the compliance-risk page.
  103 |     await expect(page.getByTestId("banner-sample-data")).toBeVisible();
  104 |     await expect(page.getByTestId("banner-sample-data")).toContainText(
  105 |       "Sample data",
  106 |     );
  107 | 
  108 |     // Banner persists across pages (mounted in AppLayout).
  109 |     await page.goto("/students");
  110 |     await expect(page.getByTestId("banner-sample-data")).toBeVisible();
  111 | 
  112 |     // Tear down via the banner's confirm flow.
  113 |     await page.getByTestId("button-remove-sample").click();
  114 |     await expect(page.getByText("Remove all sample data?")).toBeVisible();
  115 |     await page.getByTestId("button-confirm-teardown").click();
  116 |     await expect(page.getByTestId("banner-sample-data")).toHaveCount(0, {
  117 |       timeout: 120_000,
  118 |     });
  119 | 
  120 |     // Server-side confirmation: counts are zero.
  121 |     const status = await getSampleDataStatus(page);
  122 |     expect(status.hasSampleData).toBe(false);
  123 |     expect(status.sampleStudents).toBe(0);
  124 |     expect(status.sampleStaff).toBe(0);
  125 | 
  126 |     // CTA returns on /setup, proving the district is back to a clean slate.
  127 |     await page.goto("/setup");
  128 |     await expect(page.getByTestId("sample-data-cta")).toBeVisible();
  129 |     await expect(page.getByTestId("banner-sample-data")).toHaveCount(0);
  130 |   });
  131 | });
  132 | 
```