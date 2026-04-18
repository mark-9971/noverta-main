import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * UI-level Playwright tests for the 2-step QuickReportForm.
 *
 * Coverage:
 *   - Step 1 blocks advancement when required fields (student, behavior
 *     description) are empty and surfaces an inline error banner.
 *   - Happy path: fill both steps, submit, and confirm the new incident is
 *     persisted (API) and visible in the protective-measures list.
 *
 * Tests sign in with Clerk test credentials and rely on sample data being
 * present (seeded automatically in beforeEach if missing).
 */

const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";
const ADMIN_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD ?? "TrellisE2E!Test#2026";

// ---------------------------------------------------------------------------
// Shared helpers (mirrored from incident-form-wizard.spec.ts for independence)
// ---------------------------------------------------------------------------

async function signIn(page: Page): Promise<void> {
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
  await page.goto("/setup");
  await expect(
    page.getByRole("heading", { name: "Set Up Trellis" }),
  ).toBeVisible({ timeout: 60_000 });
}

async function getSampleDataStatus(page: Page) {
  const res = await page.request.get("/api/sample-data");
  expect(res.ok(), "GET /api/sample-data should succeed").toBeTruthy();
  return res.json() as Promise<{
    hasSampleData: boolean;
    sampleStudents: number;
    sampleStaff: number;
  }>;
}

async function ensureSampleData(page: Page): Promise<void> {
  const status = await getSampleDataStatus(page);
  if (status.hasSampleData && status.sampleStudents > 0) return;

  const res = await page.request.post("/api/sample-data");
  expect(res.ok(), "POST /api/sample-data (seed) should succeed").toBeTruthy();

  await expect
    .poll(async () => (await getSampleDataStatus(page)).sampleStudents, {
      timeout: 120_000,
      message: "Sample data did not appear within 120 s",
    })
    .toBeGreaterThan(0);
}

interface StudentRow {
  id: number;
  firstName: string;
  lastName: string;
  grade: string;
}

async function getFirstStudent(page: Page): Promise<StudentRow> {
  const res = await page.request.get("/api/students?limit=1");
  expect(res.ok(), "GET /api/students should succeed").toBeTruthy();
  const data = await res.json();
  const rows: StudentRow[] = Array.isArray(data) ? data : (data.students ?? []);
  expect(
    rows.length,
    "At least one student must exist (seed sample data first)",
  ).toBeGreaterThan(0);
  return rows[0];
}

async function deleteIncidentsByBehaviorSnippet(
  page: Page,
  studentId: number,
  behaviorSnippet: string,
): Promise<void> {
  try {
    const res = await page.request.get(
      `/api/protective-measures/incidents?studentId=${studentId}&limit=50`,
    );
    if (!res.ok()) return;
    const data = await res.json();
    const rows: Array<{ id: number; behaviorDescription?: string }> =
      Array.isArray(data) ? data : (data.incidents ?? []);
    for (const row of rows) {
      if (row.behaviorDescription?.includes(behaviorSnippet)) {
        await page.request.delete(
          `/api/protective-measures/incidents/${row.id}`,
        );
      }
    }
  } catch {
    // best-effort cleanup
  }
}

/**
 * Select a value in the student <select> element.
 *
 * The form renders the student field as a plain <label>/<select> pair without
 * an htmlFor/id binding, so getByLabel() is unreliable. We locate the select
 * by the unique placeholder option "Select student..." which is only present
 * in that particular dropdown.
 */
async function selectStudent(page: Page, studentId: number): Promise<void> {
  const studentSelect = page
    .locator("select")
    .filter({ has: page.locator('option[value=""]', { hasText: "Select student" }) });
  await expect(studentSelect).toBeVisible({ timeout: 10_000 });
  await studentSelect.selectOption({ value: String(studentId) });
}

// ---------------------------------------------------------------------------
// Open the Quick Report form from the protective-measures list page
// ---------------------------------------------------------------------------

async function openQuickReportForm(page: Page): Promise<void> {
  await page.goto("/protective-measures");
  await expect(page).toHaveURL(/protective-measures/, { timeout: 30_000 });
  const quickBtn = page.getByRole("button", { name: /Quick Report/i });
  await expect(quickBtn).toBeVisible({ timeout: 20_000 });
  await quickBtn.click();
  await expect(
    page.getByRole("heading", { name: /Quick Report/i }),
  ).toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("QuickReportForm — UI", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await ensureSampleData(page);
  });

  // -------------------------------------------------------------------------
  // Step 1 — required field validation
  // -------------------------------------------------------------------------

  test("step 1 shows error and blocks advancement when required fields are empty", async ({
    page,
  }) => {
    await openQuickReportForm(page);

    // Default state: studentId is empty, behaviorDescription is empty.
    // incidentDate and incidentTime are pre-filled but studentId is missing.
    const nextBtn = page.getByRole("button", {
      name: /Next: Staff & Injuries/i,
    });
    await expect(nextBtn).toBeVisible();
    await nextBtn.click();

    // Error banner must appear
    await expect(
      page.getByText(/Please fill in all required fields/i),
    ).toBeVisible({ timeout: 5_000 });

    // Wizard must still be on step 1 — heading "What happened?" is unique to step 1
    await expect(
      page.getByRole("heading", { name: /What happened\?/i }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Happy path — full submission, list visibility, and API persistence
  // -------------------------------------------------------------------------

  test("submits a quick report and the new incident is confirmed in list and API", async ({
    page,
  }) => {
    const student = await getFirstStudent(page);
    const BEHAVIOR_SNIPPET = "E2E-quick-report-test-behavior";

    // Clean up any leftover incidents from previous failed runs
    await deleteIncidentsByBehaviorSnippet(page, student.id, BEHAVIOR_SNIPPET);

    await openQuickReportForm(page);

    // ---- Step 1: Incident Basics ----
    await selectStudent(page, student.id);
    // incidentDate/incidentTime are pre-filled with today/now, leave as-is
    const behaviorTextarea = page.getByPlaceholder(
      /What behavior prompted this incident/i,
    );
    await expect(behaviorTextarea).toBeVisible({ timeout: 5_000 });
    await behaviorTextarea.fill(
      `${BEHAVIOR_SNIPPET}: rapid escalation requiring brief restraint.`,
    );

    await page
      .getByRole("button", { name: /Next: Staff & Injuries/i })
      .click();

    // ---- Step 2: Staff & Injuries (no required fields) ----
    await expect(
      page.getByRole("heading", { name: /Who was involved\?/i }),
    ).toBeVisible({ timeout: 10_000 });

    const submitBtn = page.getByRole("button", {
      name: /Save Quick Report/i,
    });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // After submission the form closes and we return to the list.
    await expect(
      page.getByRole("button", { name: /Quick Report/i }),
    ).toBeVisible({ timeout: 30_000 });

    // UI-level check: the search field on the list filters by behaviorDescription.
    const searchInput = page.getByPlaceholder(
      /Search by student name or description/i,
    );
    await expect(searchInput).toBeVisible({ timeout: 15_000 });
    await searchInput.fill(BEHAVIOR_SNIPPET);

    const studentName = `${student.firstName} ${student.lastName}`;
    await expect(page.getByText(studentName).first()).toBeVisible({
      timeout: 15_000,
    });

    // API-level check: poll until the incident with the unique behavior snippet
    // is returned, proving it was persisted (not just rendered from stale cache).
    await expect
      .poll(
        async () => {
          const res = await page.request.get(
            `/api/protective-measures/incidents?studentId=${student.id}&limit=50`,
          );
          if (!res.ok()) return false;
          const data = await res.json();
          const rows: Array<{ behaviorDescription?: string }> = Array.isArray(
            data,
          )
            ? data
            : (data.incidents ?? []);
          return rows.some((r) =>
            r.behaviorDescription?.includes(BEHAVIOR_SNIPPET),
          );
        },
        {
          timeout: 30_000,
          message: `API did not return an incident with behavior snippet "${BEHAVIOR_SNIPPET}" within 30 s`,
        },
      )
      .toBe(true);

    // Cleanup
    await deleteIncidentsByBehaviorSnippet(page, student.id, BEHAVIOR_SNIPPET);
  });
});
