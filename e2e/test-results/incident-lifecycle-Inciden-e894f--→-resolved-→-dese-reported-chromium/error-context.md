# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: incident-lifecycle.spec.ts >> Incident lifecycle and parent notification (603 CMR 46.00) >> full incident lifecycle: draft → open → under_review → resolved → dese_reported
- Location: tests/incident-lifecycle.spec.ts:357:3

# Error details

```
Error: POST /api/sample-data (seed) should succeed

expect(received).toBeTruthy()

Received: false
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
        - navigation [ref=e59]:
          - generic [ref=e60]:
            - button "Overview" [ref=e61]:
              - img [ref=e62]
              - img [ref=e64]
              - generic [ref=e69]: Overview
            - generic [ref=e70]:
              - link "Dashboard" [ref=e72] [cursor=pointer]:
                - /url: /
                - img [ref=e73]
                - generic [ref=e78]: Dashboard
              - link "At a Glance" [ref=e80] [cursor=pointer]:
                - /url: /data-visualized
                - img [ref=e81]
                - generic [ref=e84]: At a Glance
              - link "Action Center" [ref=e86] [cursor=pointer]:
                - /url: /action-center
                - img [ref=e87]
                - generic [ref=e89]: Action Center
              - link "Directory" [ref=e91] [cursor=pointer]:
                - /url: /students
                - img [ref=e92]
                - generic [ref=e97]: Directory
              - link "Alerts 99+" [ref=e99] [cursor=pointer]:
                - /url: /alerts
                - img [ref=e100]
                - generic [ref=e102]: Alerts
                - generic [ref=e103]: 99+
          - generic [ref=e104]:
            - button "Compliance Tools" [ref=e105]:
              - img [ref=e106]
              - img [ref=e108]
              - generic [ref=e111]: Compliance Tools
            - generic [ref=e112]:
              - link "Compliance" [ref=e114] [cursor=pointer]:
                - /url: /compliance
                - img [ref=e115]
                - generic [ref=e118]: Compliance
              - link "Reports" [ref=e120] [cursor=pointer]:
                - /url: /reports
                - img [ref=e121]
                - generic [ref=e123]: Reports
              - link "Compensatory" [ref=e125] [cursor=pointer]:
                - /url: /compensatory-services
                - img [ref=e126]
                - generic [ref=e130]: Compensatory
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
            - button "ABA" [ref=e183]:
              - img [ref=e184]
              - img [ref=e186]
              - generic [ref=e188]: ABA
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
              - link "Sessions" [ref=e239] [cursor=pointer]:
                - /url: /sessions
                - img [ref=e240]
                - generic [ref=e243]: Sessions
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
          - button "Sign out" [ref=e288]:
            - img [ref=e289]
      - main [ref=e293]:
        - generic [ref=e294]:
          - generic [ref=e295]:
            - generic [ref=e296]:
              - heading "Protective Measures" [level=1] [ref=e297]:
                - img [ref=e298]
                - text: Protective Measures
              - paragraph [ref=e300]: Restraint & seclusion tracking · 603 CMR 46.00
            - generic [ref=e301]:
              - generic [ref=e302]:
                - textbox [ref=e303]: 2026-04
                - button "Monthly DESE Log" [ref=e304]:
                  - img [ref=e305]
                  - text: Monthly DESE Log
              - generic [ref=e308]:
                - combobox [ref=e309]:
                  - option "SY 2025-26" [selected]
                  - option "SY 2024-25"
                  - option "SY 2023-24"
                - button "DESE Export" [ref=e310]:
                  - img [ref=e311]
                  - text: DESE Export
              - button "Quick Report" [ref=e314]:
                - img [ref=e315]
                - text: Quick Report
              - button "Report Incident" [ref=e317]:
                - img [ref=e318]
                - text: Report Incident
          - generic [ref=e319]:
            - generic [ref=e320]:
              - generic [ref=e321]:
                - img [ref=e322]
                - generic [ref=e324]: Total Incidents
              - paragraph [ref=e325]: "5"
              - paragraph [ref=e326]: 1 restraint
            - generic [ref=e327]:
              - generic [ref=e328]:
                - img [ref=e329]
                - generic [ref=e332]: Needs Review
              - paragraph [ref=e333]: "3"
            - generic [ref=e334]:
              - generic [ref=e335]:
                - img [ref=e336]
                - generic [ref=e338]: Pending Signatures
              - paragraph [ref=e339]: "5"
            - generic [ref=e340]:
              - generic [ref=e341]:
                - img [ref=e342]
                - generic [ref=e345]: Action Items Due
              - paragraph [ref=e346]: "1"
              - paragraph [ref=e347]: 0 notices · 1 reports
            - generic [ref=e348]:
              - generic [ref=e349]:
                - img [ref=e350]
                - generic [ref=e353]: DESE Reports Due
              - paragraph [ref=e354]: "0"
          - generic [ref=e355]:
            - generic [ref=e356]:
              - img [ref=e357]
              - text: "Weekly Review Required: Students with 3+ incidents"
            - paragraph [ref=e359]: 1 student require review team assessment per 603 CMR 46.06(5).
          - generic [ref=e360]:
            - button "Incident Trends & Insights 5 incidents · 2 students · 0% injury rate" [ref=e361]:
              - generic [ref=e362]:
                - img [ref=e363]
                - text: Incident Trends & Insights
                - generic [ref=e364]: 5 incidents · 2 students · 0% injury rate
              - img [ref=e365]
            - generic [ref=e367]:
              - generic [ref=e368]:
                - paragraph [ref=e369]: Monthly Volume
                - img [ref=e373]:
                  - generic [ref=e375]:
                    - generic [ref=e377]: Oct
                    - generic [ref=e379]: Nov
                    - generic [ref=e381]: Feb
                    - generic [ref=e383]: Mar
              - generic [ref=e394]:
                - paragraph [ref=e395]: Top Antecedents
                - generic [ref=e396]:
                  - generic [ref=e397]:
                    - generic [ref=e398]: Denied Access
                    - generic [ref=e401]: 60%
                  - generic [ref=e402]:
                    - generic [ref=e403]: Social
                    - generic [ref=e406]: 20%
                  - generic [ref=e407]:
                    - generic [ref=e408]: Academic
                    - generic [ref=e411]: 20%
              - generic [ref=e412]:
                - paragraph [ref=e413]:
                  - img [ref=e414]
                  - text: High-Frequency Students (10+ incidents)
                - paragraph [ref=e416]: No students with 10+ incidents
                - generic [ref=e417]:
                  - generic [ref=e418]:
                    - generic [ref=e419]: 100%
                    - generic [ref=e420]: BIP in Place
                  - generic [ref=e421]:
                    - generic [ref=e422]: 100%
                    - generic [ref=e423]: Debrief Rate
          - generic [ref=e424]:
            - generic [ref=e425]:
              - img [ref=e426]
              - textbox "Search by student name or description..." [ref=e429]
            - generic [ref=e430]:
              - combobox [ref=e431]:
                - option "All Types" [selected]
                - option "Physical Restraint"
                - option "Seclusion"
                - option "Time-Out"
              - combobox [ref=e432]:
                - option "All Status" [selected]
                - option "Draft"
                - option "Open"
                - option "Under Review"
                - option "Resolved"
                - option "DESE Reported"
                - option "Notifications Pending"
          - generic [ref=e434]:
            - button "Lucas Kim physical_escort Open Student began yelling, threw materials onto floor, attempted to leave classroom. Mar 22, 2026 9:30 AM · 15 min" [ref=e435]:
              - img [ref=e438]
              - generic [ref=e440]:
                - generic [ref=e441]:
                  - generic [ref=e442]: Lucas Kim
                  - 'generic "Quick view: emergency contacts & alerts" [ref=e445] [cursor=pointer]':
                    - img [ref=e446]
                  - generic [ref=e448]: physical_escort
                  - generic [ref=e449]: Open
                - paragraph [ref=e450]: Student began yelling, threw materials onto floor, attempted to leave classroom.
              - generic [ref=e451]:
                - paragraph [ref=e452]: Mar 22, 2026
                - paragraph [ref=e453]: 9:30 AM · 15 min
              - img [ref=e455]
            - button "Lucas Kim physical_escort Open Student began yelling, threw materials onto floor, attempted to leave classroom. Mar 15, 2026 10:00 AM · 11 min" [ref=e457]:
              - img [ref=e460]
              - generic [ref=e462]:
                - generic [ref=e463]:
                  - generic [ref=e464]: Lucas Kim
                  - 'generic "Quick view: emergency contacts & alerts" [ref=e467] [cursor=pointer]':
                    - img [ref=e468]
                  - generic [ref=e470]: physical_escort
                  - generic [ref=e471]: Open
                - paragraph [ref=e472]: Student began yelling, threw materials onto floor, attempted to leave classroom.
              - generic [ref=e473]:
                - paragraph [ref=e474]: Mar 15, 2026
                - paragraph [ref=e475]: 10:00 AM · 11 min
              - img [ref=e477]
            - button "Ryan Young physical_escort Draft Student began crying, then escalated to verbal threats and self-injurious head-banging. Feb 17, 2026 9:00 AM · 16 min" [ref=e479]:
              - img [ref=e482]
              - generic [ref=e484]:
                - generic [ref=e485]:
                  - generic [ref=e486]: Ryan Young
                  - 'generic "Quick view: emergency contacts & alerts" [ref=e489] [cursor=pointer]':
                    - img [ref=e490]
                  - generic [ref=e492]: physical_escort
                  - generic [ref=e493]: Draft
                - paragraph [ref=e494]: Student began crying, then escalated to verbal threats and self-injurious head-banging.
              - generic [ref=e495]:
                - paragraph [ref=e496]: Feb 17, 2026
                - paragraph [ref=e497]: 9:00 AM · 16 min
              - img [ref=e499]
            - button "Ryan Young physical_escort Under Review Student began yelling, threw materials onto floor, attempted to leave classroom. Nov 1, 2025 11:15 AM · 7 min" [ref=e501]:
              - img [ref=e504]
              - generic [ref=e506]:
                - generic [ref=e507]:
                  - generic [ref=e508]: Ryan Young
                  - 'generic "Quick view: emergency contacts & alerts" [ref=e511] [cursor=pointer]':
                    - img [ref=e512]
                  - generic [ref=e514]: physical_escort
                  - generic [ref=e515]: Under Review
                - paragraph [ref=e516]: Student began yelling, threw materials onto floor, attempted to leave classroom.
              - generic [ref=e517]:
                - paragraph [ref=e518]: Nov 1, 2025
                - paragraph [ref=e519]: 11:15 AM · 7 min
              - img [ref=e521]
            - button "Ryan Young Physical Restraint Open Student began swearing loudly, stood on bench, attempted to overturn lunch tray. Oct 10, 2025 2:15 PM · 8 min" [ref=e523]:
              - img [ref=e526]
              - generic [ref=e528]:
                - generic [ref=e529]:
                  - generic [ref=e530]: Ryan Young
                  - 'generic "Quick view: emergency contacts & alerts" [ref=e533] [cursor=pointer]':
                    - img [ref=e534]
                  - generic [ref=e536]: Physical Restraint
                  - generic [ref=e537]: Open
                - paragraph [ref=e538]: Student began swearing loudly, stood on bench, attempted to overturn lunch tray.
              - generic [ref=e539]:
                - paragraph [ref=e540]: Oct 10, 2025
                - paragraph [ref=e541]: 2:15 PM · 8 min
              - img [ref=e543]
      - button "Start session timer (Ctrl+Shift+T)" [ref=e545]:
        - img [ref=e546]
        - generic: Ctrl+Shift+T
    - region "Notifications (F8)":
      - list
  - generic [ref=e548]:
    - generic [ref=e549]:
      - text: This is a temporary development preview, and these links are not for public use.
      - link "Publish your app" [ref=e550] [cursor=pointer]:
        - /url: https://docs.replit.com/category/replit-deployments?ref=replit-dev-banner
      - text: for secure sharing or use an invite link.
    - button "Close banner" [ref=e551] [cursor=pointer]:
      - img [ref=e552]
  - generic [ref=e554]: Oct
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
  65  |   await page.goto("/setup");
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
> 96  |   expect(res.ok(), "POST /api/sample-data (seed) should succeed").toBeTruthy();
      |                                                                   ^ Error: POST /api/sample-data (seed) should succeed
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
  166 |   primaryStaffId?: number,
  167 | ): Promise<Incident> {
  168 |   const body = {
  169 |     studentId,
  170 |     incidentDate: new Date().toISOString().split("T")[0],
  171 |     incidentTime: "10:30",
  172 |     incidentType: "physical_restraint",
  173 |     location: "Classroom 12 — E2E test",
  174 |     behaviorDescription:
  175 |       "E2E test incident — student was escalating and required physical restraint to ensure safety.",
  176 |     triggerDescription: "Transition between activities",
  177 |     deescalationAttempts: "Verbal prompts, redirection to sensory space",
  178 |     restraintType: "supine",
  179 |     durationMinutes: 5,
  180 |     bipInPlace: true,
  181 |     ...(primaryStaffId ? { primaryStaffId } : {}),
  182 |   };
  183 | 
  184 |   const res = await page.request.post("/api/protective-measures/incidents", {
  185 |     data: body,
  186 |   });
  187 |   expect(res.status(), "POST /api/protective-measures/incidents → 201").toBe(
  188 |     201,
  189 |   );
  190 |   return res.json() as Promise<Incident>;
  191 | }
  192 | 
  193 | async function deleteIncident(page: Page, id: number): Promise<void> {
  194 |   try {
  195 |     await page.request.delete(`/api/protective-measures/incidents/${id}`);
  196 |   } catch {
```