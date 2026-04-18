import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";
const ADMIN_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD ?? "TrellisE2E!Test#2026";

const SYNTHETIC_ALERT = {
  alertId: 9001,
  alertType: "Allergy",
  description: "Severe peanut allergy",
  treatmentNotes: "Administer EpiPen and call 911.",
  epiPenOnFile: true,
  studentId: 1,
  firstName: "Alex",
  lastName: "LifeAlertStudent",
  grade: "3",
};

async function signIn(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });
  await page.goto("/setup");
  await clerk.signIn({
    page,
    signInParams: { strategy: "password", identifier: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  await page.goto("/setup");
  await expect(page.getByRole("heading", { name: "Set Up Trellis" })).toBeVisible({ timeout: 60_000 });
}

function interceptAlerts(page: Page, body: unknown) {
  return page.route("**/api/students/life-threatening-alerts", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
  );
}

test.describe("GET /api/students/life-threatening-alerts", () => {
  test("returns an array for an authenticated admin", async ({ page }) => {
    await signIn(page);
    const res = await page.request.get("/api/students/life-threatening-alerts");
    expect(res.ok(), `Expected 200, got ${res.status()}`).toBeTruthy();
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    for (const row of body) {
      expect(typeof row.alertId).toBe("number");
      expect(typeof row.studentId).toBe("number");
      expect(typeof row.firstName).toBe("string");
      expect(typeof row.lastName).toBe("string");
      expect(row.grade === null || typeof row.grade === "string").toBe(true);
      expect(typeof row.alertType).toBe("string");
    }
  });
});

test.describe("LifeThreateningAlertsBanner — visibility", () => {
  test("banner is visible on PilotAdminHome when alerts exist", async ({ page }) => {
    await signIn(page);
    await interceptAlerts(page, [SYNTHETIC_ALERT]);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("LifeAlertStudent", { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("EpiPen", { exact: false })).toBeVisible();
  });

  test("banner is visible on DashboardFull when alerts exist", async ({ page }) => {
    await signIn(page);
    await interceptAlerts(page, [SYNTHETIC_ALERT]);
    await page.goto("/?view=full");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("LifeAlertStudent", { exact: false })).toBeVisible({ timeout: 15_000 });
  });

  test("banner is absent when no alerts are returned", async ({ page }) => {
    await signIn(page);
    await interceptAlerts(page, []);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);
    await expect(page.getByText("LifeAlertStudent", { exact: false })).not.toBeVisible();
  });
});

test.describe("LifeThreateningAlertsBanner — dismissal", () => {
  test("dismiss button hides the banner and writes session-keyed localStorage", async ({ page }) => {
    await signIn(page);
    await interceptAlerts(page, [SYNTHETIC_ALERT]);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("LifeAlertStudent", { exact: false })).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: /dismiss/i }).first().click();
    await expect(page.getByText("LifeAlertStudent", { exact: false })).not.toBeVisible({ timeout: 5_000 });

    // Verify the session-keyed key was written
    const key = await page.evaluate(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("life-threat-dismissed-")) return k;
      }
      return null;
    });
    expect(key).not.toBeNull();
    const value = await page.evaluate((k: string) => localStorage.getItem(k), key as string);
    expect(value).toBe("1");
  });

  test("banner stays dismissed after reload when localStorage key is set", async ({ page }) => {
    await signIn(page);
    await interceptAlerts(page, [SYNTHETIC_ALERT]);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("LifeAlertStudent", { exact: false })).toBeVisible({ timeout: 15_000 });

    // Dismiss via UI
    await page.getByRole("button", { name: /dismiss/i }).first().click();
    await expect(page.getByText("LifeAlertStudent", { exact: false })).not.toBeVisible({ timeout: 5_000 });

    // Reload with same intercept active
    await interceptAlerts(page, [SYNTHETIC_ALERT]);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await expect(page.getByText("LifeAlertStudent", { exact: false })).not.toBeVisible();
  });
});
