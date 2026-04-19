# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: incident-lifecycle.spec.ts >> Incident lifecycle and parent notification (603 CMR 46.00) >> creates a draft incident with correct initial status
- Location: tests/incident-lifecycle.spec.ts:247:3

# Error details

```
Error: GET /api/protective-measures/incidents/275 should 200

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
      - generic [ref=e305]:
        - status "Sample data notice" [ref=e306]:
          - img [ref=e307]
          - generic [ref=e309]: Sample data
          - generic [ref=e310]: Your workspace includes 11 sample students and 5 sample staff so you can explore Trellis with realistic numbers. Replace with your real roster anytime.
          - generic [ref=e311]:
            - button "Replay tour" [ref=e312]:
              - img [ref=e313]
              - text: Replay tour
            - button "Remove sample data" [ref=e316]:
              - img [ref=e317]
              - text: Remove sample data
        - main [ref=e320]:
          - generic [ref=e321]:
            - generic [ref=e322]:
              - generic [ref=e323]:
                - heading "Protective Measures" [level=1] [ref=e324]:
                  - img [ref=e325]
                  - text: Protective Measures
                - paragraph [ref=e327]: Restraint & seclusion tracking · 603 CMR 46.00
              - generic [ref=e328]:
                - generic [ref=e329]:
                  - textbox [ref=e330]: 2026-04
                  - button "Monthly DESE Log" [ref=e331]:
                    - img [ref=e332]
                    - text: Monthly DESE Log
                - generic [ref=e335]:
                  - combobox [ref=e336]:
                    - option "SY 2025-26" [selected]
                    - option "SY 2024-25"
                    - option "SY 2023-24"
                  - button "DESE Export" [ref=e337]:
                    - img [ref=e338]
                    - text: DESE Export
                - button "Quick Report" [ref=e341]:
                  - img [ref=e342]
                  - text: Quick Report
                - button "Report Incident" [ref=e344]:
                  - img [ref=e345]
                  - text: Report Incident
            - generic [ref=e346]:
              - generic [ref=e347]:
                - generic [ref=e348]:
                  - img [ref=e349]
                  - generic [ref=e351]: Total Incidents
                - paragraph [ref=e352]: "5"
                - paragraph [ref=e353]: 1 restraint
              - generic [ref=e354]:
                - generic [ref=e355]:
                  - img [ref=e356]
                  - generic [ref=e359]: Needs Review
                - paragraph [ref=e360]: "3"
              - generic [ref=e361]:
                - generic [ref=e362]:
                  - img [ref=e363]
                  - generic [ref=e365]: Pending Signatures
                - paragraph [ref=e366]: "5"
              - generic [ref=e367]:
                - generic [ref=e368]:
                  - img [ref=e369]
                  - generic [ref=e372]: Action Items Due
                - paragraph [ref=e373]: "1"
                - paragraph [ref=e374]: 0 notices · 1 reports
              - generic [ref=e375]:
                - generic [ref=e376]:
                  - img [ref=e377]
                  - generic [ref=e380]: DESE Reports Due
                - paragraph [ref=e381]: "0"
            - generic [ref=e382]:
              - generic [ref=e383]:
                - img [ref=e384]
                - text: "Weekly Review Required: Students with 3+ incidents"
              - paragraph [ref=e386]: 1 student require review team assessment per 603 CMR 46.06(5).
            - generic [ref=e387]:
              - button "Incident Trends & Insights 5 incidents · 2 students · 0% injury rate" [ref=e388]:
                - generic [ref=e389]:
                  - img [ref=e390]
                  - text: Incident Trends & Insights
                  - generic [ref=e391]: 5 incidents · 2 students · 0% injury rate
                - img [ref=e392]
              - generic [ref=e394]:
                - generic [ref=e395]:
                  - paragraph [ref=e396]: Monthly Volume
                  - img [ref=e400]:
                    - generic [ref=e402]:
                      - generic [ref=e404]: Oct
                      - generic [ref=e406]: Nov
                      - generic [ref=e408]: Feb
                      - generic [ref=e410]: Mar
                - generic [ref=e421]:
                  - paragraph [ref=e422]: Top Antecedents
                  - generic [ref=e423]:
                    - generic [ref=e424]:
                      - generic [ref=e425]: Denied Access
                      - generic [ref=e428]: 60%
                    - generic [ref=e429]:
                      - generic [ref=e430]: Social
                      - generic [ref=e433]: 20%
                    - generic [ref=e434]:
                      - generic [ref=e435]: Academic
                      - generic [ref=e438]: 20%
                - generic [ref=e439]:
                  - paragraph [ref=e440]:
                    - img [ref=e441]
                    - text: High-Frequency Students (10+ incidents)
                  - paragraph [ref=e443]: No students with 10+ incidents
                  - generic [ref=e444]:
                    - generic [ref=e445]:
                      - generic [ref=e446]: 100%
                      - generic [ref=e447]: BIP in Place
                    - generic [ref=e448]:
                      - generic [ref=e449]: 100%
                      - generic [ref=e450]: Debrief Rate
            - generic [ref=e451]:
              - generic [ref=e452]:
                - img [ref=e453]
                - textbox "Search by student name or description..." [ref=e456]
              - generic [ref=e457]:
                - combobox [ref=e458]:
                  - option "All Types" [selected]
                  - option "Physical Restraint"
                  - option "Seclusion"
                  - option "Time-Out"
                - combobox [ref=e459]:
                  - option "All Status" [selected]
                  - option "Draft"
                  - option "Open"
                  - option "Under Review"
                  - option "Resolved"
                  - option "DESE Reported"
                  - option "Notifications Pending"
            - generic [ref=e461]:
              - button "Lucas Kim physical_escort Open Student began yelling, threw materials onto floor, attempted to leave classroom. Mar 22, 2026 9:30 AM · 15 min" [ref=e462]:
                - img [ref=e465]
                - generic [ref=e467]:
                  - generic [ref=e468]:
                    - generic [ref=e469]: Lucas Kim
                    - 'generic "Quick view: emergency contacts & alerts" [ref=e472] [cursor=pointer]':
                      - img [ref=e473]
                    - generic [ref=e475]: physical_escort
                    - generic [ref=e476]: Open
                  - paragraph [ref=e477]: Student began yelling, threw materials onto floor, attempted to leave classroom.
                - generic [ref=e478]:
                  - paragraph [ref=e479]: Mar 22, 2026
                  - paragraph [ref=e480]: 9:30 AM · 15 min
                - img [ref=e482]
              - button "Lucas Kim physical_escort Open Student began yelling, threw materials onto floor, attempted to leave classroom. Mar 15, 2026 10:00 AM · 11 min" [ref=e484]:
                - img [ref=e487]
                - generic [ref=e489]:
                  - generic [ref=e490]:
                    - generic [ref=e491]: Lucas Kim
                    - 'generic "Quick view: emergency contacts & alerts" [ref=e494] [cursor=pointer]':
                      - img [ref=e495]
                    - generic [ref=e497]: physical_escort
                    - generic [ref=e498]: Open
                  - paragraph [ref=e499]: Student began yelling, threw materials onto floor, attempted to leave classroom.
                - generic [ref=e500]:
                  - paragraph [ref=e501]: Mar 15, 2026
                  - paragraph [ref=e502]: 10:00 AM · 11 min
                - img [ref=e504]
              - button "Ryan Young physical_escort Draft Student began crying, then escalated to verbal threats and self-injurious head-banging. Feb 17, 2026 9:00 AM · 16 min" [ref=e506]:
                - img [ref=e509]
                - generic [ref=e511]:
                  - generic [ref=e512]:
                    - generic [ref=e513]: Ryan Young
                    - 'generic "Quick view: emergency contacts & alerts" [ref=e516] [cursor=pointer]':
                      - img [ref=e517]
                    - generic [ref=e519]: physical_escort
                    - generic [ref=e520]: Draft
                  - paragraph [ref=e521]: Student began crying, then escalated to verbal threats and self-injurious head-banging.
                - generic [ref=e522]:
                  - paragraph [ref=e523]: Feb 17, 2026
                  - paragraph [ref=e524]: 9:00 AM · 16 min
                - img [ref=e526]
              - button "Ryan Young physical_escort Under Review Student began yelling, threw materials onto floor, attempted to leave classroom. Nov 1, 2025 11:15 AM · 7 min" [ref=e528]:
                - img [ref=e531]
                - generic [ref=e533]:
                  - generic [ref=e534]:
                    - generic [ref=e535]: Ryan Young
                    - 'generic "Quick view: emergency contacts & alerts" [ref=e538] [cursor=pointer]':
                      - img [ref=e539]
                    - generic [ref=e541]: physical_escort
                    - generic [ref=e542]: Under Review
                  - paragraph [ref=e543]: Student began yelling, threw materials onto floor, attempted to leave classroom.
                - generic [ref=e544]:
                  - paragraph [ref=e545]: Nov 1, 2025
                  - paragraph [ref=e546]: 11:15 AM · 7 min
                - img [ref=e548]
              - button "Ryan Young Physical Restraint Open Student began swearing loudly, stood on bench, attempted to overturn lunch tray. Oct 10, 2025 2:15 PM · 8 min" [ref=e550]:
                - img [ref=e553]
                - generic [ref=e555]:
                  - generic [ref=e556]:
                    - generic [ref=e557]: Ryan Young
                    - 'generic "Quick view: emergency contacts & alerts" [ref=e560] [cursor=pointer]':
                      - img [ref=e561]
                    - generic [ref=e563]: Physical Restraint
                    - generic [ref=e564]: Open
                  - paragraph [ref=e565]: Student began swearing loudly, stood on bench, attempted to overturn lunch tray.
                - generic [ref=e566]:
                  - paragraph [ref=e567]: Oct 10, 2025
                  - paragraph [ref=e568]: 2:15 PM · 8 min
                - img [ref=e570]
      - button "Start session timer (Ctrl+Shift+T)" [ref=e572]:
        - img [ref=e573]
        - generic: Ctrl+Shift+T
    - region "Notifications (F8)":
      - list
  - generic [ref=e575]:
    - generic [ref=e576]:
      - text: This is a temporary development preview, and these links are not for public use.
      - link "Publish your app" [ref=e577] [cursor=pointer]:
        - /url: https://docs.replit.com/category/replit-deployments?ref=replit-dev-banner
      - text: for secure sharing or use an invite link.
    - button "Close banner" [ref=e578] [cursor=pointer]:
      - img [ref=e579]
  - generic [ref=e581]: Oct
```

# Test source

```ts
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
  197 |     // best-effort cleanup
  198 |   }
  199 | }
  200 | 
  201 | async function transitionIncident(
  202 |   page: Page,
  203 |   id: number,
  204 |   toStatus: string,
  205 |   note: string,
  206 | ): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  207 |   const res = await page.request.post(
  208 |     `/api/protective-measures/incidents/${id}/transition`,
  209 |     { data: { toStatus, note } },
  210 |   );
  211 |   const body = await res.json();
  212 |   return { ok: res.ok(), body };
  213 | }
  214 | 
  215 | async function fetchIncident(page: Page, id: number): Promise<Incident> {
  216 |   const res = await page.request.get(
  217 |     `/api/protective-measures/incidents/${id}`,
  218 |   );
> 219 |   expect(res.ok(), `GET /api/protective-measures/incidents/${id} should 200`).toBeTruthy();
      |                                                                               ^ Error: GET /api/protective-measures/incidents/275 should 200
  220 |   return res.json() as Promise<Incident>;
  221 | }
  222 | 
  223 | // ---------------------------------------------------------------------------
  224 | // Test suite
  225 | // ---------------------------------------------------------------------------
  226 | 
  227 | test.describe("Incident lifecycle and parent notification (603 CMR 46.00)", () => {
  228 |   // Per-test incident IDs collected for cleanup.
  229 |   const createdIds: number[] = [];
  230 | 
  231 |   test.beforeEach(async ({ page }) => {
  232 |     await signIn(page);
  233 |     await ensureSampleData(page);
  234 |   });
  235 | 
  236 |   test.afterEach(async ({ page }) => {
  237 |     for (const id of [...createdIds]) {
  238 |       await deleteIncident(page, id);
  239 |     }
  240 |     createdIds.length = 0;
  241 |   });
  242 | 
  243 |   // -------------------------------------------------------------------------
  244 |   // Lifecycle: draft → open
  245 |   // -------------------------------------------------------------------------
  246 | 
  247 |   test("creates a draft incident with correct initial status", async ({
  248 |     page,
  249 |   }) => {
  250 |     const student = await getFirstStudent(page);
  251 |     const incident = await createDraftIncident(page, student.id);
  252 |     createdIds.push(incident.id);
  253 | 
  254 |     expect(incident.status).toBe("draft");
  255 |     expect(incident.studentId).toBe(student.id);
  256 | 
  257 |     // Verify the record is retrievable.
  258 |     const fetched = await fetchIncident(page, incident.id);
  259 |     expect(fetched.id).toBe(incident.id);
  260 |     expect(fetched.status).toBe("draft");
  261 |   });
  262 | 
  263 |   test("transitions incident from draft → open", async ({ page }) => {
  264 |     const student = await getFirstStudent(page);
  265 |     const incident = await createDraftIncident(page, student.id);
  266 |     createdIds.push(incident.id);
  267 | 
  268 |     const { ok, body } = await transitionIncident(
  269 |       page,
  270 |       incident.id,
  271 |       "open",
  272 |       "Incident submitted for admin review.",
  273 |     );
  274 | 
  275 |     expect(ok, `Transition draft→open failed: ${JSON.stringify(body)}`).toBe(
  276 |       true,
  277 |     );
  278 |     expect((body as Incident).status).toBe("open");
  279 | 
  280 |     const fetched = await fetchIncident(page, incident.id);
  281 |     expect(fetched.status).toBe("open");
  282 |   });
  283 | 
  284 |   test("rejects invalid transition (draft → resolved)", async ({ page }) => {
  285 |     const student = await getFirstStudent(page);
  286 |     const incident = await createDraftIncident(page, student.id);
  287 |     createdIds.push(incident.id);
  288 | 
  289 |     const res = await page.request.post(
  290 |       `/api/protective-measures/incidents/${incident.id}/transition`,
  291 |       { data: { toStatus: "resolved", note: "Skipping review — invalid." } },
  292 |     );
  293 |     expect(res.ok()).toBe(false);
  294 |     expect(res.status()).toBe(400);
  295 |     const body = await res.json();
  296 |     expect(body.error).toMatch(/Cannot transition/);
  297 |   });
  298 | 
  299 |   // -------------------------------------------------------------------------
  300 |   // Lifecycle: open → under_review (transition endpoint with toStatus)
  301 |   // -------------------------------------------------------------------------
  302 | 
  303 |   test("admin review transitions open incident to under_review", async ({
  304 |     page,
  305 |   }) => {
  306 |     const student = await getFirstStudent(page);
  307 |     const incident = await createDraftIncident(page, student.id);
  308 |     createdIds.push(incident.id);
  309 | 
  310 |     // draft → open
  311 |     const openResult = await transitionIncident(
  312 |       page,
  313 |       incident.id,
  314 |       "open",
  315 |       "Submitted for review.",
  316 |     );
  317 |     expect(
  318 |       openResult.ok,
  319 |       `draft→open failed: ${JSON.stringify(openResult.body)}`,
```