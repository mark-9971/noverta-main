# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: incident-form-wizard.spec.ts >> NewIncidentForm wizard — UI >> step 5 renders summary review, compliance reminders, and signature field
- Location: tests/incident-form-wizard.spec.ts:439:3

# Error details

```
Error: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://e07af80e-63e9-4ae5-a0cc-653c581de667-00-1s3iqwxjxu2kb-3y6414s2.kirk.replit.dev/setup
Call log:
  - navigating to "https://e07af80e-63e9-4ae5-a0cc-653c581de667-00-1s3iqwxjxu2kb-3y6414s2.kirk.replit.dev/setup", waiting until "load"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e6]:
    - heading "This page isn’t working" [level=1] [ref=e7]
    - paragraph [ref=e8]:
      - strong [ref=e9]: e07af80e-63e9-4ae5-a0cc-653c581de667-00-1s3iqwxjxu2kb-3y6414s2.kirk.replit.dev
      - text: is currently unable to handle this request.
    - generic [ref=e10]: HTTP ERROR 502
  - button "Reload" [ref=e13] [cursor=pointer]
```

# Test source

```ts
  1   | import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
  2   | import { expect, test, type Page } from "@playwright/test";
  3   | 
  4   | /**
  5   |  * UI-level Playwright tests for the 5-step NewIncidentForm wizard.
  6   |  *
  7   |  * Coverage:
  8   |  *   - Step 1 blocks advancement when required fields (student, date, time) are empty.
  9   |  *   - Step 2 blocks advancement when the behavior description is empty.
  10  |  *   - Happy path: fill all 5 steps, submit, confirm the incident is persisted (API)
  11  |  *     and visible in the list after the wizard closes.
  12  |  *   - Back button navigation from step 2 returns to step 1.
  13  |  *   - Step 5 UI elements are present after navigating to the final step.
  14  |  *
  15  |  * Notes on step-5 required-field guard:
  16  |  *   The form's submit button validates studentId, incidentTime, incidentDate, and
  17  |  *   behaviorDescription before calling the API. However, steps 1 and 2 already
  18  |  *   enforce these same fields before allowing progression, so it is not possible to
  19  |  *   reach step 5 through the normal wizard UI with those fields empty. The
  20  |  *   "step 5 UI" test below reaches step 5 via proper navigation and verifies the
  21  |  *   summary review and signature elements render correctly.
  22  |  *
  23  |  * Tests sign in with Clerk test credentials and rely on sample data being
  24  |  * present (seeded automatically in beforeEach if missing).
  25  |  */
  26  | 
  27  | const ADMIN_EMAIL =
  28  |   process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";
  29  | const ADMIN_PASSWORD =
  30  |   process.env.E2E_ADMIN_PASSWORD ?? "TrellisE2E!Test#2026";
  31  | 
  32  | // ---------------------------------------------------------------------------
  33  | // Shared helpers (mirrored from incident-lifecycle.spec.ts for independence)
  34  | // ---------------------------------------------------------------------------
  35  | 
  36  | /**
  37  |  * Dev-bypass auth headers — same shape the Trellis frontend sends in
  38  |  * dev mode (VITE_DEV_AUTH_BYPASS=1). The api-server's requireAuth
  39  |  * middleware accepts these in lieu of a Clerk session whenever
  40  |  * NODE_ENV=test or DEV_AUTH_BYPASS=1, both of which are true for the
  41  |  * dev workflows that back this E2E run. This keeps `page.request.*`
  42  |  * authenticated without requiring a Clerk session round-trip.
  43  |  */
  44  | const DEV_BYPASS_HEADERS = {
  45  |   "x-test-user-id": "dev_bypass_admin",
  46  |   "x-test-role": "admin",
  47  |   "x-test-district-id": "6",
  48  | } as const;
  49  | 
  50  | async function signIn(page: Page): Promise<void> {
  51  |   // Suppress the SampleDataTour overlay (fires automatically when sample
  52  |   // data is loaded) so it doesn't redirect us to /compliance-risk-report
  53  |   // mid-test. We pretend every per-user/per-district tour key has already
  54  |   // been seen.
  55  |   await page.addInitScript(() => {
  56  |     const origGet = Storage.prototype.getItem;
  57  |     Storage.prototype.getItem = function (key: string) {
  58  |       if (key.startsWith("trellis.sampleTour.v1")) return "seen";
  59  |       return origGet.call(this, key);
  60  |     };
  61  |   });
  62  | 
  63  |   // Send the dev-bypass headers on every page.request.* call so server
  64  |   // endpoints accept us as the dev admin (the same identity the running
  65  |   // Trellis app uses in this workflow). Clerk sign-in is still performed
  66  |   // below so that frontend pages which gate on `useUser` render normally.
  67  |   await page.context().setExtraHTTPHeaders({ ...DEV_BYPASS_HEADERS });
  68  | 
  69  |   await setupClerkTestingToken({ page });
> 70  |   await page.goto("/setup");
      |              ^ Error: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://e07af80e-63e9-4ae5-a0cc-653c581de667-00-1s3iqwxjxu2kb-3y6414s2.kirk.replit.dev/setup
  71  |   await clerk.signIn({
  72  |     page,
  73  |     signInParams: {
  74  |       strategy: "password",
  75  |       identifier: ADMIN_EMAIL,
  76  |       password: ADMIN_PASSWORD,
  77  |     },
  78  |   });
  79  |   // Navigate to the page our tests actually exercise and confirm the
  80  |   // AppLayout has rendered. This is independent of /setup, which the
  81  |   // SampleDataTour can redirect away from, and proves the app is ready
  82  |   // to receive UI interactions.
  83  |   await page.goto("/protective-measures");
  84  |   await expect(
  85  |     page.getByRole("button", { name: /Report Incident/i }),
  86  |   ).toBeVisible({ timeout: 60_000 });
  87  | }
  88  | 
  89  | async function getSampleDataStatus(page: Page) {
  90  |   const res = await page.request.get("/api/sample-data");
  91  |   expect(res.ok(), "GET /api/sample-data should succeed").toBeTruthy();
  92  |   return res.json() as Promise<{
  93  |     hasSampleData: boolean;
  94  |     sampleStudents: number;
  95  |     sampleStaff: number;
  96  |   }>;
  97  | }
  98  | 
  99  | async function ensureSampleData(page: Page): Promise<void> {
  100 |   const status = await getSampleDataStatus(page);
  101 |   if (status.hasSampleData && status.sampleStudents > 0) return;
  102 | 
  103 |   const res = await page.request.post("/api/sample-data");
  104 |   expect(res.ok(), "POST /api/sample-data (seed) should succeed").toBeTruthy();
  105 | 
  106 |   await expect
  107 |     .poll(async () => (await getSampleDataStatus(page)).sampleStudents, {
  108 |       timeout: 120_000,
  109 |       message: "Sample data did not appear within 120 s",
  110 |     })
  111 |     .toBeGreaterThan(0);
  112 | }
  113 | 
  114 | interface StudentRow {
  115 |   id: number;
  116 |   firstName: string;
  117 |   lastName: string;
  118 |   grade: string;
  119 | }
  120 | 
  121 | async function getFirstStudent(page: Page): Promise<StudentRow> {
  122 |   const res = await page.request.get("/api/students?limit=1");
  123 |   expect(res.ok(), "GET /api/students should succeed").toBeTruthy();
  124 |   const data = await res.json();
  125 |   const rows: StudentRow[] = Array.isArray(data)
  126 |     ? data
  127 |     : (data.students ?? data.data ?? []);
  128 |   expect(
  129 |     rows.length,
  130 |     "At least one student must exist (seed sample data first)",
  131 |   ).toBeGreaterThan(0);
  132 |   return rows[0];
  133 | }
  134 | 
  135 | async function deleteIncidentsByBehaviorSnippet(
  136 |   page: Page,
  137 |   studentId: number,
  138 |   behaviorSnippet: string,
  139 | ): Promise<void> {
  140 |   try {
  141 |     const res = await page.request.get(
  142 |       `/api/protective-measures/incidents?studentId=${studentId}&limit=50`,
  143 |     );
  144 |     if (!res.ok()) return;
  145 |     const data = await res.json();
  146 |     const rows: Array<{ id: number; behaviorDescription?: string }> =
  147 |       Array.isArray(data) ? data : (data.incidents ?? []);
  148 |     for (const row of rows) {
  149 |       if (row.behaviorDescription?.includes(behaviorSnippet)) {
  150 |         await page.request.delete(
  151 |           `/api/protective-measures/incidents/${row.id}`,
  152 |         );
  153 |       }
  154 |     }
  155 |   } catch {
  156 |     // best-effort cleanup
  157 |   }
  158 | }
  159 | 
  160 | /** Clear any localStorage draft so tests start from a clean state. */
  161 | async function clearIncidentDraft(page: Page): Promise<void> {
  162 |   await page.evaluate(() => {
  163 |     try {
  164 |       localStorage.removeItem("pm-incident-draft");
  165 |     } catch {}
  166 |   });
  167 | }
  168 | 
  169 | /**
  170 |  * Select a value in the student <select> element.
```