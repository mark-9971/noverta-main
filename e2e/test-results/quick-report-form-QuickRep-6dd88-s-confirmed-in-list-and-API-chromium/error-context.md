# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: quick-report-form.spec.ts >> QuickReportForm — UI >> submits a quick report and the new incident is confirmed in list and API
- Location: tests/quick-report-form.spec.ts:185:3

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
  5   |  * UI-level Playwright tests for the 2-step QuickReportForm.
  6   |  *
  7   |  * Coverage:
  8   |  *   - Step 1 blocks advancement when required fields (student, behavior
  9   |  *     description) are empty and surfaces an inline error banner.
  10  |  *   - Happy path: fill both steps, submit, and confirm the new incident is
  11  |  *     persisted (API) and visible in the protective-measures list.
  12  |  *
  13  |  * Tests sign in with Clerk test credentials and rely on sample data being
  14  |  * present (seeded automatically in beforeEach if missing).
  15  |  */
  16  | 
  17  | const ADMIN_EMAIL =
  18  |   process.env.E2E_ADMIN_EMAIL ?? "trellis-e2e-admin+clerk_test@example.com";
  19  | const ADMIN_PASSWORD =
  20  |   process.env.E2E_ADMIN_PASSWORD ?? "TrellisE2E!Test#2026";
  21  | 
  22  | // ---------------------------------------------------------------------------
  23  | // Shared helpers (mirrored from incident-form-wizard.spec.ts for independence)
  24  | // ---------------------------------------------------------------------------
  25  | 
  26  | async function signIn(page: Page): Promise<void> {
  27  |   await setupClerkTestingToken({ page });
> 28  |   await page.goto("/setup");
      |              ^ Error: page.goto: net::ERR_HTTP_RESPONSE_CODE_FAILURE at https://e07af80e-63e9-4ae5-a0cc-653c581de667-00-1s3iqwxjxu2kb-3y6414s2.kirk.replit.dev/setup
  29  |   await clerk.signIn({
  30  |     page,
  31  |     signInParams: {
  32  |       strategy: "password",
  33  |       identifier: ADMIN_EMAIL,
  34  |       password: ADMIN_PASSWORD,
  35  |     },
  36  |   });
  37  |   await page.goto("/setup");
  38  |   await expect(
  39  |     page.getByRole("heading", { name: "Set Up Trellis" }),
  40  |   ).toBeVisible({ timeout: 60_000 });
  41  | }
  42  | 
  43  | async function getSampleDataStatus(page: Page) {
  44  |   const res = await page.request.get("/api/sample-data");
  45  |   expect(res.ok(), "GET /api/sample-data should succeed").toBeTruthy();
  46  |   return res.json() as Promise<{
  47  |     hasSampleData: boolean;
  48  |     sampleStudents: number;
  49  |     sampleStaff: number;
  50  |   }>;
  51  | }
  52  | 
  53  | async function ensureSampleData(page: Page): Promise<void> {
  54  |   const status = await getSampleDataStatus(page);
  55  |   if (status.hasSampleData && status.sampleStudents > 0) return;
  56  | 
  57  |   const res = await page.request.post("/api/sample-data");
  58  |   expect(res.ok(), "POST /api/sample-data (seed) should succeed").toBeTruthy();
  59  | 
  60  |   await expect
  61  |     .poll(async () => (await getSampleDataStatus(page)).sampleStudents, {
  62  |       timeout: 120_000,
  63  |       message: "Sample data did not appear within 120 s",
  64  |     })
  65  |     .toBeGreaterThan(0);
  66  | }
  67  | 
  68  | interface StudentRow {
  69  |   id: number;
  70  |   firstName: string;
  71  |   lastName: string;
  72  |   grade: string;
  73  | }
  74  | 
  75  | async function getFirstStudent(page: Page): Promise<StudentRow> {
  76  |   const res = await page.request.get("/api/students?limit=1");
  77  |   expect(res.ok(), "GET /api/students should succeed").toBeTruthy();
  78  |   const data = await res.json();
  79  |   const rows: StudentRow[] = Array.isArray(data) ? data : (data.students ?? []);
  80  |   expect(
  81  |     rows.length,
  82  |     "At least one student must exist (seed sample data first)",
  83  |   ).toBeGreaterThan(0);
  84  |   return rows[0];
  85  | }
  86  | 
  87  | async function deleteIncidentsByBehaviorSnippet(
  88  |   page: Page,
  89  |   studentId: number,
  90  |   behaviorSnippet: string,
  91  | ): Promise<void> {
  92  |   try {
  93  |     const res = await page.request.get(
  94  |       `/api/protective-measures/incidents?studentId=${studentId}&limit=50`,
  95  |     );
  96  |     if (!res.ok()) return;
  97  |     const data = await res.json();
  98  |     const rows: Array<{ id: number; behaviorDescription?: string }> =
  99  |       Array.isArray(data) ? data : (data.incidents ?? []);
  100 |     for (const row of rows) {
  101 |       if (row.behaviorDescription?.includes(behaviorSnippet)) {
  102 |         await page.request.delete(
  103 |           `/api/protective-measures/incidents/${row.id}`,
  104 |         );
  105 |       }
  106 |     }
  107 |   } catch {
  108 |     // best-effort cleanup
  109 |   }
  110 | }
  111 | 
  112 | /**
  113 |  * Select a value in the student <select> element.
  114 |  *
  115 |  * The form renders the student field as a plain <label>/<select> pair without
  116 |  * an htmlFor/id binding, so getByLabel() is unreliable. We locate the select
  117 |  * by the unique placeholder option "Select student..." which is only present
  118 |  * in that particular dropdown.
  119 |  */
  120 | async function selectStudent(page: Page, studentId: number): Promise<void> {
  121 |   const studentSelect = page
  122 |     .locator("select")
  123 |     .filter({ has: page.locator('option[value=""]', { hasText: "Select student" }) });
  124 |   await expect(studentSelect).toBeVisible({ timeout: 10_000 });
  125 |   await studentSelect.selectOption({ value: String(studentId) });
  126 | }
  127 | 
  128 | // ---------------------------------------------------------------------------
```