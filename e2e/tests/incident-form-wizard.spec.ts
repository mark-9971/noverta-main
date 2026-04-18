import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * UI-level Playwright tests for the 5-step NewIncidentForm wizard.
 *
 * Coverage:
 *   - Step 1 blocks advancement when required fields (student, date, time) are empty.
 *   - Step 2 blocks advancement when the behavior description is empty.
 *   - Happy path: fill all 5 steps, submit, confirm the incident is persisted (API)
 *     and visible in the list after the wizard closes.
 *   - Back button navigation from step 2 returns to step 1.
 *   - Step 5 UI elements are present after navigating to the final step.
 *
 * Notes on step-5 required-field guard:
 *   The form's submit button validates studentId, incidentTime, incidentDate, and
 *   behaviorDescription before calling the API. However, steps 1 and 2 already
 *   enforce these same fields before allowing progression, so it is not possible to
 *   reach step 5 through the normal wizard UI with those fields empty. The
 *   "step 5 UI" test below reaches step 5 via proper navigation and verifies the
 *   summary review and signature elements render correctly.
 *
 * Tests sign in with Clerk test credentials and rely on sample data being
 * present (seeded automatically in beforeEach if missing).
 */

const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";
const ADMIN_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD ?? "TrellisE2E!Test#2026";

// ---------------------------------------------------------------------------
// Shared helpers (mirrored from incident-lifecycle.spec.ts for independence)
// ---------------------------------------------------------------------------

/**
 * Dev-bypass auth headers — same shape the Trellis frontend sends in
 * dev mode (VITE_DEV_AUTH_BYPASS=1). The api-server's requireAuth
 * middleware accepts these in lieu of a Clerk session whenever
 * NODE_ENV=test or DEV_AUTH_BYPASS=1, both of which are true for the
 * dev workflows that back this E2E run. This keeps `page.request.*`
 * authenticated without requiring a Clerk session round-trip.
 */
const DEV_BYPASS_HEADERS = {
  "x-test-user-id": "dev_bypass_admin",
  "x-test-role": "admin",
  "x-test-district-id": "6",
} as const;

async function signIn(page: Page): Promise<void> {
  // Suppress the SampleDataTour overlay (fires automatically when sample
  // data is loaded) so it doesn't redirect us to /compliance-risk-report
  // mid-test. We pretend every per-user/per-district tour key has already
  // been seen.
  await page.addInitScript(() => {
    const origGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("trellis.sampleTour.v1")) return "seen";
      return origGet.call(this, key);
    };
  });

  // Send the dev-bypass headers on every page.request.* call so server
  // endpoints accept us as the dev admin (the same identity the running
  // Trellis app uses in this workflow). Clerk sign-in is still performed
  // below so that frontend pages which gate on `useUser` render normally.
  await page.context().setExtraHTTPHeaders({ ...DEV_BYPASS_HEADERS });

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
  // Navigate to the page our tests actually exercise and confirm the
  // AppLayout has rendered. This is independent of /setup, which the
  // SampleDataTour can redirect away from, and proves the app is ready
  // to receive UI interactions.
  await page.goto("/protective-measures");
  await expect(
    page.getByRole("button", { name: /Report Incident/i }),
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
  const rows: StudentRow[] = Array.isArray(data)
    ? data
    : (data.students ?? data.data ?? []);
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

/** Clear any localStorage draft so tests start from a clean state. */
async function clearIncidentDraft(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.removeItem("pm-incident-draft");
    } catch {}
  });
}

/**
 * Select a value in the student <select> element.
 *
 * The form renders the student field as a plain <label>/<select> pair without an
 * htmlFor/id binding, so getByLabel() is unreliable. We locate the select by the
 * unique placeholder option "Select student..." which is only present in that
 * particular dropdown.
 */
async function selectStudent(page: Page, studentId: number): Promise<void> {
  const studentSelect = page
    .locator("select")
    .filter({ has: page.locator('option[value=""]', { hasText: "Select student" }) });
  await expect(studentSelect).toBeVisible({ timeout: 10_000 });
  await studentSelect.selectOption({ value: String(studentId) });
}

// ---------------------------------------------------------------------------
// Open the New Incident Form from the protective-measures list page
// ---------------------------------------------------------------------------

async function openNewIncidentForm(page: Page): Promise<void> {
  await page.goto("/protective-measures");
  await expect(page).toHaveURL(/protective-measures/, { timeout: 30_000 });
  const reportBtn = page.getByRole("button", { name: /Report Incident/i });
  await expect(reportBtn).toBeVisible({ timeout: 20_000 });
  await reportBtn.click();
  await expect(
    page.getByRole("heading", { name: /Report Incident/i }),
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Navigate through steps 1 and 2 with the minimum required data.
 * Returns when step 3 heading is visible.
 */
async function fillAndAdvanceThroughSteps1And2(
  page: Page,
  studentId: number,
  behaviorText: string,
): Promise<void> {
  // Step 1
  await selectStudent(page, studentId);
  await page.locator('input[type="time"]').first().fill("10:00");
  await page.getByRole("button", { name: /Next: Context & Behavior/i }).click();
  await expect(
    page.getByRole("heading", { name: /Behavioral Context/i }),
  ).toBeVisible({ timeout: 10_000 });

  // Step 2 — target required "Behavior That Prompted Restraint" textarea by
  // its unique placeholder. This is distinct from the first textarea on step 2
  // ("Activity Preceding Incident") which has a different placeholder.
  const behaviorTextarea = page.getByPlaceholder(
    /Describe the specific behavior that posed a threat of imminent/i,
  );
  await expect(behaviorTextarea).toBeVisible({ timeout: 5_000 });
  await behaviorTextarea.fill(behaviorText);
  await page.getByRole("button", { name: /Next: Staff & Environment/i }).click();
  await expect(
    page.getByRole("heading", { name: /Staff & Environment/i }),
  ).toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("NewIncidentForm wizard — UI", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await ensureSampleData(page);
    // Navigate to the page first so localStorage operations are on the correct origin
    await page.goto("/protective-measures");
    await clearIncidentDraft(page);
  });

  // -------------------------------------------------------------------------
  // Step 1 — required field validation
  // -------------------------------------------------------------------------

  test("step 1 shows error and blocks advancement when required fields are empty", async ({
    page,
  }) => {
    await openNewIncidentForm(page);

    // Default state: studentId is empty, incidentTime is empty.
    // incidentDate is pre-filled to today but is still insufficient without a student.
    const nextBtn = page.getByRole("button", {
      name: /Next: Context & Behavior/i,
    });
    await expect(nextBtn).toBeVisible();
    await nextBtn.click();

    // Error banner must appear
    await expect(
      page.getByText(/Please select a student and fill in the date\/time fields/i),
    ).toBeVisible({ timeout: 5_000 });

    // Wizard must still be on step 1
    await expect(
      page.getByRole("heading", { name: /Incident Details/i }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Step 2 — required field validation
  // -------------------------------------------------------------------------

  test("step 2 shows error and blocks advancement when behavior description is empty", async ({
    page,
  }) => {
    const student = await getFirstStudent(page);
    await openNewIncidentForm(page);

    // Fill step 1 with minimum required fields and advance
    await selectStudent(page, student.id);
    await page.locator('input[type="time"]').first().fill("09:30");
    await page.getByRole("button", { name: /Next: Context & Behavior/i }).click();

    await expect(
      page.getByRole("heading", { name: /Behavioral Context/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Click Next without filling in the behavior description
    await page.getByRole("button", { name: /Next: Staff & Environment/i }).click();

    // Error banner must appear
    await expect(
      page.getByText(/Behavior description is required/i),
    ).toBeVisible({ timeout: 5_000 });

    // Still on step 2
    await expect(
      page.getByRole("heading", { name: /Behavioral Context/i }),
    ).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // Happy path — full walk-through and successful submission
  // -------------------------------------------------------------------------

  test("walks through all 5 steps, submits, and the new incident is confirmed in list and API", async ({
    page,
  }) => {
    const student = await getFirstStudent(page);
    const BEHAVIOR_SNIPPET = "E2E-wizard-test-behavior";

    // Clean up any leftover incidents from previous failed runs
    await deleteIncidentsByBehaviorSnippet(page, student.id, BEHAVIOR_SNIPPET);

    await openNewIncidentForm(page);

    // ---- Steps 1 & 2 ----
    await fillAndAdvanceThroughSteps1And2(
      page,
      student.id,
      `${BEHAVIOR_SNIPPET}: student was escalating rapidly and posed imminent risk of harm to peers.`,
    );

    // ---- Step 3: Staff & Environment (no required fields) ----
    await page.getByRole("button", { name: /Next: Injuries & Safety/i }).click();
    await expect(
      page.getByRole("heading", { name: /Injuries & Medical Attention/i }),
    ).toBeVisible({ timeout: 10_000 });

    // ---- Step 4: Injuries & Safety (no required fields) ----
    await page.getByRole("button", { name: /Next: Debrief & Submit/i }).click();
    await expect(
      page.getByRole("heading", { name: /Post-Incident Debrief & Submission/i }),
    ).toBeVisible({ timeout: 10_000 });

    // ---- Step 5: Debrief, Sign & Submit ----

    // The summary review on step 5 should display the student name
    const studentName = `${student.firstName} ${student.lastName}`;
    await expect(page.getByText(studentName).first()).toBeVisible({
      timeout: 5_000,
    });

    // Provide an electronic signature and submit
    const signatureInput = page.getByPlaceholder(/Type your full name to sign/i);
    await expect(signatureInput).toBeVisible();
    await signatureInput.fill("E2E Test Staff");

    const submitBtn = page.getByRole("button", {
      name: /Submit Incident Report/i,
    });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // After submission the wizard closes and we return to the list.
    await expect(
      page.getByRole("button", { name: /Report Incident/i }),
    ).toBeVisible({ timeout: 30_000 });

    // UI-level check: use the search field (filters by behaviorDescription) to
    // isolate the newly submitted incident row. The placeholder text matches
    // what IncidentList.tsx renders: "Search by student name or description..."
    const searchInput = page.getByPlaceholder(/Search by student name or description/i);
    await expect(searchInput).toBeVisible({ timeout: 15_000 });
    await searchInput.fill(BEHAVIOR_SNIPPET);
    // The filtered list must show the student whose incident was just submitted.
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
          const rows: Array<{ behaviorDescription?: string }> = Array.isArray(data)
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

  // -------------------------------------------------------------------------
  // Step navigation — Back button returns to previous step
  // -------------------------------------------------------------------------

  test("Back button on step 2 returns to step 1", async ({ page }) => {
    const student = await getFirstStudent(page);
    await openNewIncidentForm(page);

    // Fill step 1 minimally and advance
    await selectStudent(page, student.id);
    await page.locator('input[type="time"]').first().fill("08:45");
    await page.getByRole("button", { name: /Next: Context & Behavior/i }).click();

    await expect(
      page.getByRole("heading", { name: /Behavioral Context/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Press Back
    await page.getByRole("button", { name: /^Back$/i }).click();

    // Should return to step 1
    await expect(
      page.getByRole("heading", { name: /Incident Details/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // Step 5 — UI elements render correctly after full navigation
  //
  // The step-5 submit button guards studentId/incidentTime/incidentDate and
  // behaviorDescription before calling the API. These fields are already guarded
  // at the step-1 and step-2 "Next" buttons respectively, so it is not possible
  // to reach step 5 through the normal wizard UI with those fields missing.
  // This test therefore reaches step 5 via proper navigation and asserts that
  // the summary review, compliance reminders, and signature input all render.
  // -------------------------------------------------------------------------

  test("step 5 renders summary review, compliance reminders, and signature field", async ({
    page,
  }) => {
    const student = await getFirstStudent(page);
    await openNewIncidentForm(page);

    // Navigate through steps 1 and 2 with minimum required data
    await fillAndAdvanceThroughSteps1And2(
      page,
      student.id,
      "E2E step-5 UI check — student posed imminent risk.",
    );

    // Step 3 — no required fields
    await page.getByRole("button", { name: /Next: Injuries & Safety/i }).click();
    await expect(
      page.getByRole("heading", { name: /Injuries & Medical Attention/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Step 4 — no required fields
    await page.getByRole("button", { name: /Next: Debrief & Submit/i }).click();

    // Verify step 5 heading
    await expect(
      page.getByRole("heading", { name: /Post-Incident Debrief & Submission/i }),
    ).toBeVisible({ timeout: 10_000 });

    // Summary review must show the selected student's name
    const studentName = `${student.firstName} ${student.lastName}`;
    await expect(page.getByText(studentName).first()).toBeVisible({
      timeout: 5_000,
    });

    // Compliance reminder section must appear ("After Submission" notice)
    await expect(
      page.getByText(/Written report to parent due within/i),
    ).toBeVisible({ timeout: 5_000 });

    // Signature input must be present
    await expect(
      page.getByPlaceholder(/Type your full name to sign/i),
    ).toBeVisible();

    // Submit button must be enabled (all required fields were filled upstream)
    await expect(
      page.getByRole("button", { name: /Submit Incident Report/i }),
    ).toBeEnabled();
  });
});
