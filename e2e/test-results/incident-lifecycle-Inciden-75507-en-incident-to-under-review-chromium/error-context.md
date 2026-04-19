# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: incident-lifecycle.spec.ts >> Incident lifecycle and parent notification (603 CMR 46.00) >> admin review transitions open incident to under_review
- Location: tests/incident-lifecycle.spec.ts:303:3

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
  5   |  * End-to-end coverage for the restraint incident lifecycle and parent
  6   |  * notification flow (603 CMR 46.00 compliance).
  7   |  *
  8   |  * Lifecycle under test:
  9   |  *   create draft → open → under_review (admin review) → resolved → dese_reported
  10  |  *
  11  |  * Notification flow under test:
  12  |  *   save draft → approve → send (non-email / certified-mail channel)
  13  |  *   save draft → return-for-correction → re-approve → send
  14  |  *
  15  |  * All state-changing assertions use the API directly (page.request) so they
  16  |  * are independent of UI layout changes while still requiring a valid Clerk
  17  |  * session for auth middleware to accept the requests.
  18  |  *
  19  |  * Prerequisites for the test environment:
  20  |  *   - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD Clerk test credentials
  21  |  *   - The Clerk user's publicMetadata.staffId must reference a real staff
  22  |  *     record in the database (required by terminal transitions and review
  23  |  *     endpoints).  Transitions that require a staffId are guarded by a
  24  |  *     soft-skip so the rest of the suite can still run.
  25  |  *   - Sample data must be seed-able via POST /api/sample-data.
  26  |  */
  27  | 
  28  | const ADMIN_EMAIL =
  29  |   process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";
  30  | const ADMIN_PASSWORD =
  31  |   process.env.E2E_ADMIN_PASSWORD ?? "TrellisE2E!Test#2026";
  32  | 
  33  | // ---------------------------------------------------------------------------
  34  | // Helpers
  35  | // ---------------------------------------------------------------------------
  36  | 
  37  | /**
  38  |  * Dev-bypass auth headers — the api-server's requireAuth middleware accepts
  39  |  * these when NODE_ENV=test or DEV_AUTH_BYPASS=1, both of which are true for
  40  |  * the dev workflows that back this E2E run. This keeps page.request.* calls
  41  |  * authenticated as the dev admin (matches the identity the running Trellis
  42  |  * frontend uses in this workflow).
  43  |  */
  44  | const DEV_BYPASS_HEADERS = {
  45  |   "x-test-user-id": "dev_bypass_admin",
  46  |   "x-test-role": "admin",
  47  |   "x-test-district-id": "6",
  48  | } as const;
  49  | 
  50  | async function signIn(page: Page): Promise<void> {
  51  |   // Suppress the SampleDataTour overlay (auto-fires when sample data is
  52  |   // present) so it doesn't redirect us to /compliance-risk-report mid-test.
  53  |   await page.addInitScript(() => {
  54  |     const origGet = Storage.prototype.getItem;
  55  |     Storage.prototype.getItem = function (key: string) {
  56  |       if (key.startsWith("trellis.sampleTour.v1")) return "seen";
  57  |       return origGet.call(this, key);
  58  |     };
  59  |   });
  60  | 
  61  |   // Authenticate page.request.* via dev-bypass headers.
  62  |   await page.context().setExtraHTTPHeaders({ ...DEV_BYPASS_HEADERS });
  63  | 
  64  |   await setupClerkTestingToken({ page });
> 65  |   await page.goto("/setup");
      |              ^ Error: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://e07af80e-63e9-4ae5-a0cc-653c581de667-00-1s3iqwxjxu2kb-3y6414s2.kirk.replit.dev/setup
  66  |   await clerk.signIn({
  67  |     page,
  68  |     signInParams: {
  69  |       strategy: "password",
  70  |       identifier: ADMIN_EMAIL,
  71  |       password: ADMIN_PASSWORD,
  72  |     },
  73  |   });
  74  |   // Confirm the AppLayout has rendered before tests issue API calls.
  75  |   await page.goto("/protective-measures");
  76  |   await expect(
  77  |     page.getByRole("button", { name: /Report Incident/i }),
  78  |   ).toBeVisible({ timeout: 60_000 });
  79  | }
  80  | 
  81  | async function getSampleDataStatus(page: Page) {
  82  |   const res = await page.request.get("/api/sample-data");
  83  |   expect(res.ok(), "GET /api/sample-data should succeed").toBeTruthy();
  84  |   return res.json() as Promise<{
  85  |     hasSampleData: boolean;
  86  |     sampleStudents: number;
  87  |     sampleStaff: number;
  88  |   }>;
  89  | }
  90  | 
  91  | async function ensureSampleData(page: Page): Promise<void> {
  92  |   const status = await getSampleDataStatus(page);
  93  |   if (status.hasSampleData && status.sampleStudents > 0) return;
  94  | 
  95  |   const res = await page.request.post("/api/sample-data");
  96  |   expect(res.ok(), "POST /api/sample-data (seed) should succeed").toBeTruthy();
  97  | 
  98  |   // Poll until students are visible server-side.
  99  |   await expect
  100 |     .poll(async () => (await getSampleDataStatus(page)).sampleStudents, {
  101 |       timeout: 120_000,
  102 |       message: "Sample data did not appear within 120 s",
  103 |     })
  104 |     .toBeGreaterThan(0);
  105 | }
  106 | 
  107 | async function teardownSampleData(page: Page): Promise<void> {
  108 |   const status = await getSampleDataStatus(page);
  109 |   if (!status.hasSampleData && status.sampleStudents === 0) return;
  110 | 
  111 |   const res = await page.request.delete("/api/sample-data");
  112 |   expect(res.ok(), "DELETE /api/sample-data should succeed").toBeTruthy();
  113 |   await expect
  114 |     .poll(async () => (await getSampleDataStatus(page)).sampleStudents, {
  115 |       timeout: 120_000,
  116 |     })
  117 |     .toBe(0);
  118 | }
  119 | 
  120 | interface StudentRow {
  121 |   id: number;
  122 |   firstName: string;
  123 |   lastName: string;
  124 | }
  125 | 
  126 | async function getFirstStudent(page: Page): Promise<StudentRow> {
  127 |   const res = await page.request.get("/api/students?limit=1");
  128 |   expect(res.ok(), "GET /api/students should succeed").toBeTruthy();
  129 |   const data = await res.json();
  130 |   const rows: StudentRow[] = Array.isArray(data)
  131 |     ? data
  132 |     : (data.data ?? data.students ?? []);
  133 |   expect(
  134 |     rows.length,
  135 |     "At least one student must exist (seed sample data first)",
  136 |   ).toBeGreaterThan(0);
  137 |   return rows[0];
  138 | }
  139 | 
  140 | interface StaffRow {
  141 |   id: number;
  142 |   firstName: string;
  143 |   lastName: string;
  144 |   role: string;
  145 | }
  146 | 
  147 | async function getAdminStaff(page: Page): Promise<StaffRow | null> {
  148 |   const res = await page.request.get("/api/staff?role=admin");
  149 |   if (!res.ok()) return null;
  150 |   const data = await res.json();
  151 |   const rows: StaffRow[] = Array.isArray(data) ? data : (data.staff ?? []);
  152 |   return rows.find((s) => s.role === "admin") ?? rows[0] ?? null;
  153 | }
  154 | 
  155 | interface Incident {
  156 |   id: number;
  157 |   status: string;
  158 |   studentId: number;
  159 |   parentNotificationSentAt: string | null;
  160 |   parentNotificationDraft: string | null;
  161 | }
  162 | 
  163 | async function createDraftIncident(
  164 |   page: Page,
  165 |   studentId: number,
```