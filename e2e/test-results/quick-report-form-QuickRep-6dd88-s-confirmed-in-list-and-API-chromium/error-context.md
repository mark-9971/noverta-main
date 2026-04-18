# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: quick-report-form.spec.ts >> QuickReportForm — UI >> submits a quick report and the new incident is confirmed in list and API
- Location: tests/quick-report-form.spec.ts:185:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Set Up Trellis' })
Expected: visible
Timeout: 60000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 60000ms
  - waiting for getByRole('heading', { name: 'Set Up Trellis' })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - region "Notifications alt+T"
      - complementary [ref=e4]:
        - generic [ref=e5]:
          - generic [ref=e7]:
            - img [ref=e9]
            - generic [ref=e12]:
              - paragraph [ref=e13]: Trellis
              - paragraph [ref=e14]: Service-minute compliance for SPED.
          - generic [ref=e15]:
            - paragraph [ref=e16]: Demo Role
            - generic [ref=e17]:
              - button "Admin" [ref=e18]:
                - img [ref=e19]
                - generic [ref=e21]: Admin
              - button "SPED Teacher" [ref=e22]:
                - img [ref=e23]
                - generic [ref=e31]: SPED Teacher
              - button "SPED Student" [ref=e32]:
                - img [ref=e33]
                - generic [ref=e36]: SPED Student
              - button "Parent / Guardian" [ref=e37]:
                - img [ref=e38]
                - generic [ref=e43]: Parent / Guardian
          - generic [ref=e46]:
            - img [ref=e47]
            - combobox [ref=e51]:
              - option "All Schools" [selected]
              - option "All in MetroWest Collaborative"
              - option "All in Test Sample District"
              - option "All in Test Sample District"
        - button "Search… ⌘K" [ref=e53]:
          - img [ref=e54]
          - generic [ref=e57]: Search…
          - generic [ref=e58]: ⌘K
        - navigation [ref=e60]:
          - generic [ref=e61]:
            - button "Overview" [ref=e62]:
              - img [ref=e63]
              - img [ref=e65]
              - generic [ref=e70]: Overview
            - generic [ref=e71]:
              - link "Action Center" [ref=e73] [cursor=pointer]:
                - /url: /action-center
                - img [ref=e74]
                - generic [ref=e76]: Action Center
              - link "Dashboard" [ref=e78] [cursor=pointer]:
                - /url: /
                - img [ref=e79]
                - generic [ref=e84]: Dashboard
              - link "Directory" [ref=e86] [cursor=pointer]:
                - /url: /students
                - img [ref=e87]
                - generic [ref=e92]: Directory
              - link "Alerts 99+" [ref=e94] [cursor=pointer]:
                - /url: /alerts
                - img [ref=e95]
                - generic [ref=e97]: Alerts
                - generic [ref=e98]: 99+
          - generic [ref=e99]:
            - button "Compliance & Risk" [ref=e100]:
              - img [ref=e101]
              - img [ref=e103]
              - generic [ref=e106]: Compliance & Risk
            - generic [ref=e107]:
              - link "Compliance" [ref=e109] [cursor=pointer]:
                - /url: /compliance
                - img [ref=e110]
                - generic [ref=e113]: Compliance
              - link "Reports" [ref=e115] [cursor=pointer]:
                - /url: /reports
                - img [ref=e116]
                - generic [ref=e118]: Reports
              - link "Compensatory" [ref=e120] [cursor=pointer]:
                - /url: /compensatory-services
                - img [ref=e121]
                - generic [ref=e125]: Compensatory
              - link "Minutes at Risk" [ref=e127] [cursor=pointer]:
                - /url: /scheduling?tab=minutes
                - img [ref=e128]
                - generic [ref=e130]: Minutes at Risk
              - link "Document Workflow" [ref=e132] [cursor=pointer]:
                - /url: /document-workflow
                - img [ref=e133]
                - generic [ref=e136]: Document Workflow
          - generic [ref=e137]:
            - button "IEP & Services" [ref=e138]:
              - img [ref=e139]
              - img [ref=e141]
              - generic [ref=e144]: IEP & Services
            - generic [ref=e145]:
              - link "IEP Builder" [ref=e147] [cursor=pointer]:
                - /url: /iep-builder
                - img [ref=e148]
                - generic [ref=e151]: IEP Builder
              - link "IEP Meetings" [ref=e153] [cursor=pointer]:
                - /url: /iep-meetings
                - img [ref=e154]
                - generic [ref=e156]: IEP Meetings
              - link "Evaluations & Progress" [ref=e158] [cursor=pointer]:
                - /url: /evaluations
                - img [ref=e159]
                - generic [ref=e164]: Evaluations & Progress
              - link "Transition Planning" [ref=e166] [cursor=pointer]:
                - /url: /transitions
                - img [ref=e167]
                - generic [ref=e170]: Transition Planning
              - link "Accommodation Verification" [ref=e172] [cursor=pointer]:
                - /url: /accommodation-lookup
                - img [ref=e173]
                - generic [ref=e176]: Accommodation Verification
              - link "Parent Comms" [ref=e178] [cursor=pointer]:
                - /url: /parent-communication
                - img [ref=e179]
                - generic [ref=e181]: Parent Comms
          - generic [ref=e182]:
            - button "ABA & Behavior" [ref=e183]:
              - img [ref=e184]
              - img [ref=e186]
              - generic [ref=e188]: ABA & Behavior
            - generic [ref=e189]:
              - link "Learners" [ref=e191] [cursor=pointer]:
                - /url: /aba
                - img [ref=e192]
                - generic [ref=e197]: Learners
              - link "Sessions" [ref=e199] [cursor=pointer]:
                - /url: /program-data
                - img [ref=e200]
                - generic [ref=e202]: Sessions
              - link "Programs" [ref=e204] [cursor=pointer]:
                - /url: /iep-suggestions
                - img [ref=e205]
                - generic [ref=e207]: Programs
              - link "Analysis" [ref=e209] [cursor=pointer]:
                - /url: /aba?tab=analytics
                - img [ref=e210]
                - generic [ref=e213]: Analysis
              - link "Reporting" [ref=e215] [cursor=pointer]:
                - /url: /progress-reports
                - img [ref=e216]
                - generic [ref=e219]: Reporting
              - link "Supervision" [ref=e221] [cursor=pointer]:
                - /url: /supervision
                - img [ref=e222]
                - generic [ref=e226]: Supervision
          - generic [ref=e227]:
            - button "Scheduling" [ref=e228]:
              - img [ref=e229]
              - img [ref=e231]
              - generic [ref=e236]: Scheduling
            - generic [ref=e237]:
              - link "Session Log" [ref=e239] [cursor=pointer]:
                - /url: /sessions
                - img [ref=e240]
                - generic [ref=e243]: Session Log
              - link "Scheduling Hub" [ref=e245] [cursor=pointer]:
                - /url: /scheduling
                - img [ref=e246]
                - generic [ref=e249]: Scheduling Hub
              - link "Caseload Balancing" [ref=e251] [cursor=pointer]:
                - /url: /caseload-balancing
                - img [ref=e252]
                - generic [ref=e256]: Caseload Balancing
          - button "Financial / Executive" [ref=e258]:
            - img [ref=e259]
            - img [ref=e261]
            - generic [ref=e264]: Financial / Executive
          - button "Admin / Tools" [ref=e266]:
            - img [ref=e267]
            - img [ref=e269]
            - generic [ref=e272]: Admin / Tools
        - generic [ref=e275]:
          - generic [ref=e276]: U
          - generic [ref=e277]:
            - paragraph [ref=e278]: User
            - paragraph [ref=e279]: Administrator
          - button "Change theme" [ref=e281]:
            - img [ref=e282]
          - link "My Settings" [ref=e288] [cursor=pointer]:
            - /url: /my-settings
            - img [ref=e289]
          - button "Sign out" [ref=e301]:
            - img [ref=e302]
      - main [ref=e306]:
        - generic [ref=e307]:
          - generic [ref=e308]:
            - img [ref=e310]
            - generic [ref=e313]:
              - heading "Settings" [level=1] [ref=e314]
              - paragraph [ref=e315]: Manage your district configuration, integrations, and system tools.
          - generic [ref=e316]:
            - button "General" [ref=e317]:
              - img [ref=e318]
              - text: General
            - button "School Year" [ref=e321]:
              - img [ref=e322]
              - text: School Year
            - button "Billing Rates" [ref=e324]:
              - img [ref=e325]
              - text: Billing Rates
            - button "SIS Integration" [ref=e327]:
              - img [ref=e328]
              - text: SIS Integration
            - button "Notifications" [ref=e332]:
              - img [ref=e333]
              - text: Notifications
            - button "Audit Log" [ref=e336]:
              - img [ref=e337]
              - text: Audit Log
            - button "Recently Deleted" [ref=e339]:
              - img [ref=e340]
              - text: Recently Deleted
            - button "System Status" [ref=e343]:
              - img [ref=e344]
              - text: System Status
            - button "Legal & Compliance" [ref=e346]:
              - img [ref=e347]
              - text: Legal & Compliance
            - button "Data & Privacy" [ref=e351]:
              - img [ref=e352]
              - text: Data & Privacy
          - generic [ref=e354]:
            - generic [ref=e355]:
              - generic [ref=e356]:
                - img [ref=e357]
                - heading "Dashboard preferences" [level=2] [ref=e362]
              - generic [ref=e363]:
                - generic [ref=e364]:
                  - img [ref=e365]
                  - generic [ref=e368]:
                    - paragraph [ref=e369]: Setup checklist
                    - paragraph [ref=e370]: Visible on the dashboard until all steps are complete.
                - button "Hide from dashboard" [ref=e371]:
                  - img [ref=e372]
                  - text: Hide from dashboard
            - generic [ref=e379]:
              - img [ref=e381]
              - heading "Sign in to continue setup" [level=1] [ref=e384]
              - paragraph [ref=e385]: District onboarding writes to your account. Sign in first so we can attach your district, schools, and staff to the right user.
              - link "Sign in" [ref=e386] [cursor=pointer]:
                - /url: /sign-in?redirect_url=/setup
      - button "Start session timer (Ctrl+Shift+T)" [ref=e387]:
        - img [ref=e388]
        - generic: Ctrl+Shift+T
    - region "Notifications (F8)":
      - list
  - generic [ref=e390]:
    - generic [ref=e391]:
      - text: This is a temporary development preview, and these links are not for public use.
      - link "Publish your app" [ref=e392] [cursor=pointer]:
        - /url: https://docs.replit.com/category/replit-deployments?ref=replit-dev-banner
      - text: for secure sharing or use an invite link.
    - button "Close banner" [ref=e393] [cursor=pointer]:
      - img [ref=e394]
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
  28  |   await page.goto("/setup");
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
> 40  |   ).toBeVisible({ timeout: 60_000 });
      |     ^ Error: expect(locator).toBeVisible() failed
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
  129 | // Open the Quick Report form from the protective-measures list page
  130 | // ---------------------------------------------------------------------------
  131 | 
  132 | async function openQuickReportForm(page: Page): Promise<void> {
  133 |   await page.goto("/protective-measures");
  134 |   await expect(page).toHaveURL(/protective-measures/, { timeout: 30_000 });
  135 |   const quickBtn = page.getByRole("button", { name: /Quick Report/i });
  136 |   await expect(quickBtn).toBeVisible({ timeout: 20_000 });
  137 |   await quickBtn.click();
  138 |   await expect(
  139 |     page.getByRole("heading", { name: /Quick Report/i }),
  140 |   ).toBeVisible({ timeout: 10_000 });
```