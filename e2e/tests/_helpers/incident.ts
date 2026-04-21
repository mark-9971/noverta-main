import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Credentials & auth constants
// ---------------------------------------------------------------------------

export const ADMIN_EMAIL =
  process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";

/**
 * Dev-bypass auth headers — the api-server's requireAuth middleware accepts
 * these when NODE_ENV=test or DEV_AUTH_BYPASS=1, both of which are true for
 * the dev workflows that back this E2E run. This keeps page.request.* calls
 * authenticated as the dev admin (matches the identity the running Trellis
 * frontend uses in this workflow).
 */
export const DEV_BYPASS_HEADERS = {
  "x-test-user-id": "dev_bypass_admin",
  "x-test-role": "admin",
  "x-test-district-id": "6",
} as const;

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Sign in as the E2E admin, wire up a Bearer token on the Playwright request
 * context so page.request.* calls authenticate, accept any pending legal
 * documents, and wait for the protective-measures page to confirm the app is
 * ready.
 *
 * Should be called at the start of every beforeEach that needs an
 * authenticated session.
 */
export async function signIn(page: Page): Promise<void> {
  // Suppress the SampleDataTour overlay (auto-fires when sample data is
  // present) so it doesn't redirect us to /compliance-risk-report mid-test.
  await page.addInitScript(() => {
    const origGet = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith("trellis.sampleTour.v1")) return "seen";
      return origGet.call(this, key);
    };
  });

  // Strip our Trellis-only auth headers from any cross-origin request before
  // they leave the browser. Without this, Clerk's own browser-side API calls
  // (e.g. star-skunk-*.clerk.accounts.dev) receive our `Authorization: Bearer`
  // header AND the browser-set `Origin` header, which Clerk rejects with HTTP
  // 400 ("only one of 'Origin' and 'Authorization' headers should be
  // provided"). That 400 silently breaks Clerk session restoration on
  // subsequent page navigations, so AppLayout never finishes rendering and the
  // test hangs on element-visibility waits.
  await page.context().route(
    /clerk\.(com|accounts\.dev|dev)/,
    async (route) => {
      const headers = { ...route.request().headers() };
      delete headers["authorization"];
      delete headers["x-test-user-id"];
      delete headers["x-test-role"];
      delete headers["x-test-district-id"];
      delete headers["x-test-staff-id"];
      await route.continue({ headers });
    },
  );

  // Authenticate page.request.* via dev-bypass headers.
  await page.context().setExtraHTTPHeaders({ ...DEV_BYPASS_HEADERS });

  await setupClerkTestingToken({ page });
  await page.goto("/setup");
  // Wait for Clerk SDK to finish loading before invoking the helper.
  await page.waitForFunction(
    () => {
      const w = window as unknown as { Clerk?: { loaded?: boolean } };
      return w.Clerk?.loaded === true;
    },
    null,
    { timeout: 30_000 },
  );

  // Use ticket-based sign-in (mints a one-time sign-in token via the Clerk
  // Backend API and exchanges it client-side). This bypasses any 2FA / MFA
  // requirements the Clerk instance may enforce on password sign-ins, which
  // is essential for headless test runs where there is no human to satisfy
  // the second factor.
  await clerk.signIn({ page, emailAddress: ADMIN_EMAIL });

  // Pull the active session JWT out of the browser context and attach it as a
  // Bearer token on the Playwright request context so subsequent
  // page.request.* calls authenticate as the signed-in user — this is more
  // reliable than relying on first-party Clerk cookies being mirrored into
  // the request context (which fails behind the Replit dev-domain proxy).
  const token = await page.waitForFunction(
    async () => {
      const w = window as unknown as {
        Clerk?: { session?: { getToken: () => Promise<string | null> } };
      };
      const t = await w.Clerk?.session?.getToken?.();
      return typeof t === "string" && t.length > 0 ? t : null;
    },
    null,
    { timeout: 30_000 },
  );
  const sessionJwt = (await token.jsonValue()) as string;
  await page.context().setExtraHTTPHeaders({
    Authorization: `Bearer ${sessionJwt}`,
  });

  // Accept all required legal documents (idempotent) so /api/* requests aren't
  // blocked by the requireLegalAcceptance middleware.
  const statusRes = await page.request.get("/api/legal/acceptance-status");
  expect(
    statusRes.ok(),
    `GET /api/legal/acceptance-status should succeed (status ${statusRes.status()})`,
  ).toBeTruthy();
  const statusBody = (await statusRes.json()) as {
    required?: boolean;
    documents?: Array<{
      documentType: string;
      documentVersion: string;
      required: boolean;
    }>;
  };
  const missing = (statusBody.documents ?? [])
    .filter((d) => d.required)
    .map((d) => ({
      documentType: d.documentType,
      documentVersion: d.documentVersion,
    }));
  if (missing.length > 0) {
    const acceptRes = await page.request.post("/api/legal/accept", {
      data: { acceptances: missing },
    });
    expect(
      acceptRes.ok(),
      `POST /api/legal/accept should succeed (status ${acceptRes.status()})`,
    ).toBeTruthy();
  }

  // Sanity check: the API must now accept page.request as authenticated.
  await expect
    .poll(
      async () => (await page.request.get("/api/sample-data")).status(),
      {
        timeout: 30_000,
        message:
          "API did not authenticate after clerk.signIn — Bearer token may be invalid or Clerk session not yet propagated.",
      },
    )
    .toBe(200);

  // Confirm the AppLayout has rendered before tests issue API calls.
  await page.goto("/protective-measures");
  await expect(
    page.getByRole("button", { name: /Report Incident/i }),
  ).toBeVisible({ timeout: 60_000 });
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

export async function getSampleDataStatus(page: Page): Promise<{
  hasSampleData: boolean;
  sampleStudents: number;
  sampleStaff: number;
}> {
  const res = await page.request.get("/api/sample-data");
  expect(res.ok(), "GET /api/sample-data should succeed").toBeTruthy();
  return res.json() as Promise<{
    hasSampleData: boolean;
    sampleStudents: number;
    sampleStaff: number;
  }>;
}

export async function ensureSampleData(page: Page): Promise<void> {
  const status = await getSampleDataStatus(page);
  if (status.hasSampleData && status.sampleStudents > 0) return;

  const res = await page.request.post("/api/sample-data");
  expect(res.ok(), "POST /api/sample-data (seed) should succeed").toBeTruthy();

  // Poll until students are visible server-side.
  await expect
    .poll(async () => (await getSampleDataStatus(page)).sampleStudents, {
      timeout: 120_000,
      message: "Sample data did not appear within 120 s",
    })
    .toBeGreaterThan(0);
}

export async function teardownSampleData(page: Page): Promise<void> {
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

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

export interface StudentRow {
  id: number;
  firstName: string;
  lastName: string;
  grade?: string;
}

export async function getFirstStudent(page: Page): Promise<StudentRow> {
  const res = await page.request.get("/api/students?limit=1");
  expect(res.ok(), "GET /api/students should succeed").toBeTruthy();
  const data = await res.json();
  const rows: StudentRow[] = Array.isArray(data)
    ? data
    : (data.data ?? data.students ?? []);
  expect(
    rows.length,
    "At least one student must exist (seed sample data first)",
  ).toBeGreaterThan(0);
  return rows[0];
}

/**
 * Select a value in the student <select> element.
 *
 * The form renders the student field as a plain <label>/<select> pair without
 * an htmlFor/id binding, so getByLabel() is unreliable. We locate the select
 * by the unique placeholder option "Select student..." which is only present
 * in that particular dropdown.
 */
export async function selectStudent(
  page: Page,
  studentId: number,
): Promise<void> {
  const studentSelect = page
    .locator("select")
    .filter({
      has: page.locator('option[value=""]', { hasText: "Select student" }),
    });
  await expect(studentSelect).toBeVisible({ timeout: 10_000 });
  await studentSelect.selectOption({ value: String(studentId) });
}

// ---------------------------------------------------------------------------
// Incidents
// ---------------------------------------------------------------------------

/**
 * Delete all incidents for the given student whose behaviorDescription
 * contains the provided snippet. Best-effort: errors are swallowed so
 * cleanup never causes a test to fail.
 */
export async function deleteIncidentsByBehaviorSnippet(
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
