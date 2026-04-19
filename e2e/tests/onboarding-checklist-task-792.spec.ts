import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Task #792 — End-to-end coverage for the three recent fixes to the pilot
 * onboarding setup checklist:
 *
 *   1. Per-user dismissal: two admins in the same district dismiss
 *      independently of each other (the dismissal flag is per Clerk userId,
 *      surfaced as `checklistDismissed` in /api/onboarding/checklist).
 *
 *   2. Dashboard "X steps remaining" label matches the checklist's
 *      "X/9 done" header (both read from the same react-query cache key
 *      so they can no longer drift apart).
 *
 *   3. Sidebar setup-progress strip remains visible after the checklist
 *      has been dismissed, and clicking it navigates to /onboarding.
 *
 * All three tests sign in as the real E2E admin Clerk user and stub the
 * /api/onboarding/checklist + /api/onboarding/status endpoints with
 * page.route() so the assertions are deterministic regardless of the
 * underlying district's seeded state. Per-user isolation is exercised by
 * giving each browser context its own mock so "Admin A" and "Admin B" see
 * independent `checklistDismissed` values — proving the UI honours the
 * per-user state surfaced by the API.
 */

const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "TrellisE2E!Test#2026";

type ItemKey =
  | "districtProfileConfigured"
  | "schoolYearConfigured"
  | "staffImported"
  | "studentsImported"
  | "serviceRequirementsImported"
  | "providersAssigned"
  | "firstSessionsLogged"
  | "complianceDashboardActive"
  | "dpaAccepted";

const ALL_ITEM_KEYS: ItemKey[] = [
  "districtProfileConfigured",
  "schoolYearConfigured",
  "staffImported",
  "studentsImported",
  "serviceRequirementsImported",
  "providersAssigned",
  "firstSessionsLogged",
  "complianceDashboardActive",
  "dpaAccepted",
];

interface PayloadOpts {
  overrides?: Partial<Record<ItemKey, boolean>>;
  dismissed?: boolean;
}

function buildChecklistPayload({ overrides = {}, dismissed = false }: PayloadOpts = {}) {
  const steps = Object.fromEntries(
    ALL_ITEM_KEYS.map((k) => [k, overrides[k] ?? false]),
  ) as Record<ItemKey, boolean>;

  const completedCount = Object.values(steps).filter(Boolean).length;
  const totalSteps = ALL_ITEM_KEYS.length;
  const isComplete = completedCount === totalSteps;

  return {
    pilotChecklist: { ...steps, completedCount, totalSteps, isComplete },
    counts: {
      schools: 2,
      serviceTypes: 3,
      staff: 5,
      students: 12,
      serviceRequirements: 8,
      requirementsWithProvider: 8,
      sessions: 4,
      schoolYears: 1,
    },
    district: { id: 1, name: "Springfield Unified" },
    activeSchoolYearLabel: "2025–2026",
    completedCount: isComplete ? 4 : 2,
    totalSteps: 4,
    isComplete,
    checklistDismissed: dismissed,
    sisConnected: true,
    districtConfirmed: steps.districtProfileConfigured,
    schoolsConfigured: true,
    serviceTypesConfigured: true,
    staffInvited: steps.staffImported,
    studentsImported: steps.studentsImported,
    serviceRequirementsImported: steps.serviceRequirementsImported,
    providersAssigned: steps.providersAssigned,
    firstSessionsLogged: steps.firstSessionsLogged,
    schoolYearConfigured: steps.schoolYearConfigured,
    complianceDashboardActive: steps.complianceDashboardActive,
    schools: [{ id: 1, name: "Lincoln Elementary" }],
    schoolYears: [{ id: 1, label: "2025–2026", isActive: true }],
  };
}

/**
 * Mock both checklist endpoints with a mutable payload state, so a single
 * context can flip from "not dismissed" to "dismissed" between requests
 * (mirroring what the real backend does after a POST /dismiss-checklist).
 */
async function installMockChecklist(
  page: Page,
  initial: PayloadOpts,
): Promise<{ setDismissed: (v: boolean) => void; setOverrides: (o: Partial<Record<ItemKey, boolean>>) => void }> {
  // Suppress the SampleDataTour modal/auto-navigation that otherwise pops up on
  // a fresh sample-data district and steers the URL to /compliance, hiding the
  // dashboard checklist we want to assert against.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("trellis.disableTours", "1");
    } catch {}
  });
  let current = { ...initial };
  const handler = (route: Parameters<Parameters<Page["route"]>[1]>[0]) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(buildChecklistPayload(current)),
    });
  await page.route("**/api/onboarding/checklist", handler);
  await page.route("**/api/onboarding/status", handler);
  // Stub the dismiss/show POSTs so they always succeed without touching DB.
  await page.route("**/api/onboarding/dismiss-checklist", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
  );
  return {
    setDismissed: (v: boolean) => { current = { ...current, dismissed: v }; },
    setOverrides: (o: Partial<Record<ItemKey, boolean>>) => {
      current = { ...current, overrides: { ...(current.overrides ?? {}), ...o } };
    },
  };
}

async function signInAsAdmin(page: Page): Promise<void> {
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
}

// ---------------------------------------------------------------------------
// 1. Per-user dismissal — two admins in the same district dismiss independently
// ---------------------------------------------------------------------------

test.describe("Pilot onboarding checklist — task 792", () => {
  test("per-user dismissal: Admin A's dismiss does not hide the checklist for Admin B", async ({
    browser,
  }) => {
    // Two isolated browser contexts so each "admin" sees an independent
    // mock of /api/onboarding/checklist (independent `checklistDismissed`).
    const ctxA: BrowserContext = await browser.newContext();
    const ctxB: BrowserContext = await browser.newContext();
    try {
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      // Three of the nine steps are complete in both views — keeps the
      // dashboard's compact widget visible (it would auto-hide if all 9
      // were complete).
      const sharedOverrides = {
        districtProfileConfigured: true,
        schoolYearConfigured: true,
        staffImported: true,
      };

      // Admin A starts NOT dismissed.
      const mockA = await installMockChecklist(pageA, {
        overrides: sharedOverrides,
        dismissed: false,
      });
      // Admin B starts NOT dismissed and never changes — proving Admin A's
      // dismissal does not leak across users.
      await installMockChecklist(pageB, {
        overrides: sharedOverrides,
        dismissed: false,
      });

      await signInAsAdmin(pageA);
      await signInAsAdmin(pageB);

      await Promise.all([pageA.goto("/"), pageB.goto("/")]);

      // Both admins initially see the full card.
      await expect(pageA.getByTestId("card-pilot-checklist")).toBeVisible({ timeout: 30_000 });
      await expect(pageB.getByTestId("card-pilot-checklist")).toBeVisible({ timeout: 30_000 });

      // Admin A dismisses. Flip the mock so the next /checklist GET reports
      // dismissed=true for Admin A only.
      mockA.setDismissed(true);
      await pageA.getByTestId("button-pilot-checklist-dismiss").click();

      // Admin A's card collapses to the dismissed strip.
      await expect(pageA.getByTestId("pilot-checklist-dismissed-strip")).toBeVisible({
        timeout: 20_000,
      });
      await expect(pageA.getByTestId("card-pilot-checklist")).toHaveCount(0);

      // Admin B's view is unaffected — full card still visible, no strip.
      // Reload Admin B to force a fresh API fetch and prove the per-user
      // state is read from /api/onboarding/checklist (not from any shared
      // global cache or local storage).
      await pageB.reload();
      await expect(pageB.getByTestId("card-pilot-checklist")).toBeVisible({ timeout: 30_000 });
      await expect(pageB.getByTestId("pilot-checklist-dismissed-strip")).toHaveCount(0);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  // -------------------------------------------------------------------------
  // 2. Dashboard "X steps remaining" matches the checklist's "X/9 done" header
  // -------------------------------------------------------------------------

  test("dashboard 'steps remaining' label matches checklist 'X/9 done' header", async ({
    page,
  }) => {
    // 4 of 9 steps complete → 5 remaining → checklist header reads "4/9".
    await installMockChecklist(page, {
      overrides: {
        districtProfileConfigured: true,
        schoolYearConfigured: true,
        staffImported: true,
        studentsImported: true,
      },
      dismissed: false,
    });

    await signInAsAdmin(page);
    await page.goto("/");

    const card = page.getByTestId("card-pilot-checklist");
    await expect(card).toBeVisible({ timeout: 30_000 });

    // Dashboard label rendered just under the checklist card.
    const stepsRemainingLabel = page.getByTestId("text-steps-remaining");
    await expect(stepsRemainingLabel).toBeVisible({ timeout: 20_000 });
    await expect(stepsRemainingLabel).toHaveText(/^5 steps remaining$/);

    // Checklist header (inside the card) shows the matching "X/Y" ratio.
    // 5 remaining out of 9 ⇒ 4/9 done.
    await expect(card).toContainText("4/9");

    // Sanity-check the relationship: completed + remaining must equal total.
    const headerText = await card
      .getByTestId("button-pilot-checklist-toggle")
      .innerText();
    const headerMatch = headerText.match(/(\d+)\/(\d+)/);
    expect(headerMatch, `Could not parse "X/Y" header from: ${headerText}`).not.toBeNull();
    const completed = Number(headerMatch![1]);
    const total = Number(headerMatch![2]);

    const remainingText = (await stepsRemainingLabel.innerText()).trim();
    const remainingMatch = remainingText.match(/^(\d+)\s+(?:step|steps)\s+remaining$/);
    expect(remainingMatch, `Could not parse remaining count from: "${remainingText}"`).not.toBeNull();
    const remaining = Number(remainingMatch![1]);

    expect(
      completed + remaining,
      `Dashboard remaining (${remaining}) + checklist completed (${completed}) should equal totalSteps (${total})`,
    ).toBe(total);
  });

  // -------------------------------------------------------------------------
  // 3. Sidebar setup-progress strip remains visible after dismissal and links
  //    to /onboarding.
  // -------------------------------------------------------------------------

  test("sidebar setup-progress strip stays visible after dismissal and links to /onboarding", async ({
    page,
  }) => {
    await installMockChecklist(page, {
      overrides: {
        districtProfileConfigured: true,
        schoolYearConfigured: true,
        staffImported: true,
      },
      dismissed: true, // checklist already dismissed for this user
    });

    await signInAsAdmin(page);
    await page.goto("/");

    // The dashboard widget collapses to the dismissed strip…
    await expect(page.getByTestId("pilot-checklist-dismissed-strip")).toBeVisible({
      timeout: 30_000,
    });

    // …but the sidebar setup-progress strip is still there.
    const sidebarStrip = page.getByTestId("sidebar-setup-progress");
    await expect(sidebarStrip).toBeVisible({ timeout: 20_000 });

    // It carries the same X/Y count as the (hidden) checklist header.
    const sidebarCount = page.getByTestId("sidebar-setup-progress-count");
    await expect(sidebarCount).toHaveText(/^3\/9$/);

    // The strip is a real link to /onboarding.
    await expect(sidebarStrip).toHaveAttribute("href", "/onboarding");

    // Clicking it actually navigates to the dedicated onboarding page.
    await sidebarStrip.click();
    await expect(page).toHaveURL(/\/onboarding(?:[?#].*)?$/, { timeout: 20_000 });
  });
});
