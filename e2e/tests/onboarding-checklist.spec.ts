import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * E2E tests for the admin pilot onboarding checklist widget
 * (artifacts/trellis/src/components/onboarding/PilotOnboardingChecklist.tsx).
 *
 * Both GET /api/onboarding/status (variant selector in PilotAdminHome) and
 * GET /api/onboarding/checklist (component data) are intercepted via
 * page.route() so every test is deterministic regardless of backend state.
 * Authentication is real (Clerk testing token).
 */

const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "TrellisE2E!Test#2026";

const TEACHER_EMAIL =
  process.env.E2E_TEACHER_EMAIL ?? "trellis-e2e-teacher+clerk_test@example.com";
const TEACHER_PASSWORD =
  process.env.E2E_TEACHER_PASSWORD ?? "TrellisE2E!Teacher#2026";

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

/** Build a mock response payload for /api/onboarding/checklist and /api/onboarding/status. */
function buildChecklistPayload(
  overrides: Partial<Record<ItemKey, boolean>> = {},
) {
  const steps = Object.fromEntries(
    ALL_ITEM_KEYS.map((k) => [k, overrides[k] ?? false]),
  ) as Record<ItemKey, boolean>;

  const completedCount = Object.values(steps).filter(Boolean).length;
  const totalSteps = ALL_ITEM_KEYS.length; // 9
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
    // Legacy top-level fields present in the real response.
    completedCount: isComplete ? 4 : 2,
    totalSteps: 4,
    isComplete,
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

const allComplete = Object.fromEntries(
  ALL_ITEM_KEYS.map((k) => [k, true]),
) as Record<ItemKey, boolean>;

/**
 * Intercept BOTH onboarding API endpoints and return a controlled payload.
 * Must be called BEFORE page.goto so the intercepts are active when the
 * component's useQuery calls fire.
 *
 * @param overrides - per-step booleans; missing keys default to false
 */
async function mockBothOnboardingEndpoints(
  page: Page,
  overrides: Partial<Record<ItemKey, boolean>> = {},
) {
  const body = JSON.stringify(buildChecklistPayload(overrides));
  const fulfill = (route: Parameters<Parameters<Page["route"]>[1]>[0]) =>
    route.fulfill({ status: 200, contentType: "application/json", body });
  await page.route("**/api/onboarding/checklist", fulfill);
  await page.route("**/api/onboarding/status", fulfill);
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

async function signInAsTeacher(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });
  await page.goto("/setup");
  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: TEACHER_EMAIL,
      password: TEACHER_PASSWORD,
    },
  });
}

// ---------------------------------------------------------------------------
// API access-control (unauthenticated request context — no Clerk session)
// ---------------------------------------------------------------------------

test.describe("Checklist API access control", () => {
  test("returns 4xx for unauthenticated callers (no Clerk session)", async ({
    request,
  }) => {
    // Playwright's `request` fixture is a standalone APIRequestContext with no
    // browser cookies or Clerk tokens — it is fully unauthenticated.
    const res = await request.get("/api/onboarding/checklist");
    expect(
      res.status(),
      `Expected 4xx for unauthenticated caller, got ${res.status()}`,
    ).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });
});

// ---------------------------------------------------------------------------
// Main suite — admin user signed in for every test via beforeEach
// ---------------------------------------------------------------------------

test.describe("Admin pilot onboarding checklist", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
  });

  // -------------------------------------------------------------------------
  // 1. Widget renders on the dashboard for admin users
  //
  // Mock status as incomplete → PilotAdminHome renders variant="full"
  // (full variant is always expanded and always shows the card).
  // -------------------------------------------------------------------------

  test("renders checklist card on the dashboard for admin users", async ({
    page,
  }) => {
    // status incomplete → full variant; checklist has 3 of 9 done.
    await mockBothOnboardingEndpoints(page, {
      districtProfileConfigured: true,
      schoolYearConfigured: true,
      staffImported: true,
    });

    await page.goto("/");

    const card = page.getByTestId("card-pilot-checklist");
    await expect(card).toBeVisible({ timeout: 30_000 });

    // Header shows the 3/9 completion ratio and percentage.
    await expect(card).toContainText("3");
    await expect(card).toContainText("9");
    await expect(card).toContainText("33%");
  });

  // -------------------------------------------------------------------------
  // 2. Step-level checkmark tests
  //
  // Tested on /onboarding (full variant — always expanded) to avoid needing
  // the toggle interaction, and to sidestep the status/variant interplay.
  // -------------------------------------------------------------------------

  test.describe("step completion icons", () => {
    for (const key of ALL_ITEM_KEYS) {
      test(`shows done checkmark for "${key}" when API reports it complete`, async ({
        page,
      }) => {
        await mockBothOnboardingEndpoints(page, { [key]: true } as Partial<
          Record<ItemKey, boolean>
        >);

        await page.goto("/onboarding");

        const row = page.getByTestId(`pilot-checklist-item-${key}`);
        await expect(row).toBeVisible({ timeout: 30_000 });

        await expect(page.getByTestId(`icon-done-${key}`)).toBeVisible();
        await expect(page.getByTestId(`icon-todo-${key}`)).toHaveCount(0);
      });

      test(`shows pending circle for "${key}" when API reports it incomplete`, async ({
        page,
      }) => {
        await mockBothOnboardingEndpoints(page, {});

        await page.goto("/onboarding");

        const row = page.getByTestId(`pilot-checklist-item-${key}`);
        await expect(row).toBeVisible({ timeout: 30_000 });

        await expect(page.getByTestId(`icon-todo-${key}`)).toBeVisible();
        await expect(page.getByTestId(`icon-done-${key}`)).toHaveCount(0);
      });
    }
  });

  // -------------------------------------------------------------------------
  // 3. Widget is absent when all 9 steps are complete (compact mode)
  //
  // All 9 complete → status says isComplete=true → PilotAdminHome renders
  // variant="compact". Compact variant with isComplete=true returns null.
  // -------------------------------------------------------------------------

  test("widget is absent on the dashboard when all 9 steps are complete", async ({
    page,
  }) => {
    // Both endpoints report all-complete so: status → compact; checklist → null.
    await mockBothOnboardingEndpoints(page, allComplete);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByTestId("card-pilot-checklist"),
    ).toHaveCount(0, { timeout: 20_000 });
  });

  // -------------------------------------------------------------------------
  // 4. Widget is absent for non-admin roles
  //
  // The Vite dev server sets import.meta.env.DEV=true, so RoleContext reads
  // "trellis_role" from localStorage (devRole) before Clerk publicMetadata.
  // page.addInitScript sets that key before React boots, exercising the real
  // isAdmin gate in PilotAdminHome without needing a second Clerk user.
  // -------------------------------------------------------------------------

  test("widget is absent on the dashboard for non-admin role (sped_teacher)", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("trellis_role", "sped_teacher");
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // With isAdmin=false, PilotAdminHome never renders the checklist widget.
    await expect(
      page.getByTestId("card-pilot-checklist"),
    ).toHaveCount(0, { timeout: 20_000 });
  });

  // -------------------------------------------------------------------------
  // 4b. Compact widget renders nothing when the checklist API returns an error
  //     (complements the role-gate test by verifying the isError render path).
  //     See the bottom of this file for a parallel "real Clerk sped_teacher
  //     sign-in" test that exercises the role gate end-to-end.
  // -------------------------------------------------------------------------

  test("compact widget renders nothing when the checklist API returns an error", async ({
    page,
  }) => {
    // status: all-complete → compact variant selected in PilotAdminHome.
    const statusBody = JSON.stringify(buildChecklistPayload(allComplete));
    await page.route("**/api/onboarding/status", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: statusBody }),
    );
    // checklist: 403 → compact isError branch → returns null.
    await page.route("**/api/onboarding/checklist", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ error: "Forbidden" }),
      }),
    );

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByTestId("card-pilot-checklist"),
    ).toHaveCount(0, { timeout: 20_000 });

    // The full-mode error card is also absent (compact suppresses it).
    await expect(
      page.getByTestId("card-pilot-checklist-error"),
    ).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // 5. Admin API contract: 200 + valid pilotChecklist for authorised caller
  // -------------------------------------------------------------------------

  test("checklist API returns 200 with a valid 9-step pilotChecklist for an admin session", async ({
    page,
  }) => {
    const res = await page.request.get("/api/onboarding/checklist");
    expect(
      res.ok(),
      `Expected 200 for admin, got ${res.status()}`,
    ).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty("pilotChecklist");
    expect(typeof body.pilotChecklist.completedCount).toBe("number");
    expect(body.pilotChecklist.totalSteps).toBe(9);
  });

  // -------------------------------------------------------------------------
  // 6. DPA step action link points to /settings#legal
  // -------------------------------------------------------------------------

  test("DPA step action link targets /settings#legal", async ({ page }) => {
    await mockBothOnboardingEndpoints(page, { dpaAccepted: false });

    await page.goto("/onboarding");

    const actionLink = page.getByTestId("pilot-checklist-action-dpaAccepted");
    await expect(actionLink).toBeVisible({ timeout: 30_000 });
    await expect(actionLink).toContainText("Review & sign");

    // Wouter's Link renders an <a> wrapping the action span.
    const href = await page
      .locator("li[data-testid='pilot-checklist-item-dpaAccepted'] a")
      .getAttribute("href");
    expect(href).toContain("/settings");
    expect(href).toContain("#legal");
  });

  // -------------------------------------------------------------------------
  // 7. Expand / collapse toggle in compact mode
  //
  // status: all-complete → compact variant; checklist: 1/9 done → card shown
  // (compact returns null only when ALL 9 are done, not just because status
  // reported "complete" for the legacy step check).
  // -------------------------------------------------------------------------

  test("checklist card expands and collapses via the toggle on the dashboard", async ({
    page,
  }) => {
    // Status: all 9 complete → PilotAdminHome renders compact variant.
    // Checklist: only 1 step done → compact card is visible (isComplete=false).
    // The two endpoints are mocked independently because they carry different data.
    const statusBody = JSON.stringify(buildChecklistPayload(allComplete));
    await page.route("**/api/onboarding/status", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: statusBody }),
    );
    const checklistBody = JSON.stringify(
      buildChecklistPayload({ districtProfileConfigured: true }),
    );
    await page.route("**/api/onboarding/checklist", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: checklistBody }),
    );

    await page.goto("/");

    const card = page.getByTestId("card-pilot-checklist");
    await expect(card).toBeVisible({ timeout: 30_000 });

    // Dashboard default: collapsed (defaultExpanded={false} in compact mode).
    const firstItem = page.getByTestId(
      "pilot-checklist-item-districtProfileConfigured",
    );
    await expect(firstItem).toHaveCount(0);

    // Expand.
    await page.getByTestId("button-pilot-checklist-toggle").click();
    await expect(firstItem).toBeVisible({ timeout: 10_000 });

    // Collapse.
    await page.getByTestId("button-pilot-checklist-toggle").click();
    await expect(firstItem).toHaveCount(0, { timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// Non-admin (sped_teacher) — real Clerk session, no localStorage override
//
// The teacher user is provisioned by global-setup.ts via /api/e2e/setup with
// role="sped_teacher", which sets publicMetadata.role on the Clerk user.
// RoleProvider then resolves role to "sped_teacher" (clerkRole wins because
// devRole is null without a localStorage seed), so PilotAdminHome's
// `isAdmin && <PilotOnboardingChecklist />` gate evaluates false and the
// widget is never mounted — even if the API would have returned data.
// ---------------------------------------------------------------------------

test.describe("Non-admin pilot dashboard", () => {
  test("widget is absent on the dashboard for a real sped_teacher Clerk session", async ({
    page,
  }) => {
    await signInAsTeacher(page);

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByTestId("card-pilot-checklist"),
    ).toHaveCount(0, { timeout: 20_000 });
    await expect(
      page.getByTestId("card-pilot-checklist-error"),
    ).toHaveCount(0);
  });
});
