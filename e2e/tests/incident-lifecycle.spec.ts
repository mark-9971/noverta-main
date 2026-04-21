import { expect, test, type Page } from "@playwright/test";
import {
  signIn,
  ensureSampleData,
  teardownSampleData,
  getFirstStudent,
} from "./_helpers/incident";

/**
 * End-to-end coverage for the restraint incident lifecycle and parent
 * notification flow (603 CMR 46.00 compliance).
 *
 * Lifecycle under test:
 *   create draft → open → under_review (admin review) → resolved → dese_reported
 *
 * Notification flow under test:
 *   save draft → approve → send (non-email / certified-mail channel)
 *   save draft → return-for-correction → re-approve → send
 *
 * All state-changing assertions use the API directly (page.request) so they
 * are independent of UI layout changes while still requiring a valid Clerk
 * session for auth middleware to accept the requests.
 *
 * Prerequisites for the test environment:
 *   - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD Clerk test credentials
 *   - The Clerk user's publicMetadata.staffId must reference a real staff
 *     record in the database (required by terminal transitions and review
 *     endpoints).  Transitions that require a staffId are guarded by a
 *     soft-skip so the rest of the suite can still run.
 *   - Sample data must be seed-able via POST /api/sample-data.
 */

// ---------------------------------------------------------------------------
// Helpers (lifecycle-spec-specific)
// ---------------------------------------------------------------------------

interface StaffRow {
  id: number;
  firstName: string;
  lastName: string;
  role: string;
}

async function getAdminStaff(page: Page): Promise<StaffRow | null> {
  const res = await page.request.get("/api/staff?role=admin");
  if (!res.ok()) return null;
  const data = await res.json();
  const rows: StaffRow[] = Array.isArray(data) ? data : (data.staff ?? []);
  return rows.find((s) => s.role === "admin") ?? rows[0] ?? null;
}

interface Incident {
  id: number;
  status: string;
  studentId: number;
  parentNotificationSentAt: string | null;
  parentNotificationDraft: string | null;
}

async function createDraftIncident(
  page: Page,
  studentId: number,
  primaryStaffId?: number,
): Promise<Incident> {
  const body = {
    studentId,
    incidentDate: new Date().toISOString().split("T")[0],
    incidentTime: "10:30",
    incidentType: "physical_restraint",
    location: "Classroom 12 — E2E test",
    behaviorDescription:
      "E2E test incident — student was escalating and required physical restraint to ensure safety.",
    triggerDescription: "Transition between activities",
    deescalationAttempts: "Verbal prompts, redirection to sensory space",
    restraintType: "supine",
    durationMinutes: 5,
    bipInPlace: true,
    ...(primaryStaffId ? { primaryStaffId } : {}),
  };

  const res = await page.request.post("/api/protective-measures/incidents", {
    data: body,
  });
  expect(res.status(), "POST /api/protective-measures/incidents → 201").toBe(
    201,
  );
  return res.json() as Promise<Incident>;
}

async function deleteIncident(page: Page, id: number): Promise<void> {
  try {
    await page.request.delete(`/api/protective-measures/incidents/${id}`);
  } catch {
    // best-effort cleanup
  }
}

async function transitionIncident(
  page: Page,
  id: number,
  toStatus: string,
  note: string,
): Promise<{ ok: boolean; body: Record<string, unknown> }> {
  const res = await page.request.post(
    `/api/protective-measures/incidents/${id}/transition`,
    { data: { toStatus, note } },
  );
  const body = await res.json();
  return { ok: res.ok(), body };
}

async function fetchIncident(page: Page, id: number): Promise<Incident> {
  const res = await page.request.get(
    `/api/protective-measures/incidents/${id}`,
  );
  expect(res.ok(), `GET /api/protective-measures/incidents/${id} should 200`).toBeTruthy();
  return res.json() as Promise<Incident>;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Incident lifecycle and parent notification (603 CMR 46.00)", () => {
  // Per-test incident IDs collected for cleanup.
  const createdIds: number[] = [];

  test.beforeEach(async ({ page }) => {
    // Stub out /api/sample-data so the SampleDataTour component (mounted
    // globally in AppLayout) sees `hasSampleData: false` and never auto-
    // activates. The tour's Step 1 navigates to /compliance-risk-report,
    // which would hijack any later page-under-test navigations. This must be
    // installed BEFORE signIn() — AppLayout mounts on the very first page
    // load and useQuery caches the response in the QueryClient, so a route
    // installed later would never be hit.
    // Suppress the sample-data tour (which auto-navigates to
    // /compliance-risk-report on Step 1) via the in-app E2E escape hatch
    // and a localStorage proto monkey-patch as a belt-and-braces fallback.
    await page.addInitScript(() => {
      try {
        (window as unknown as { __TRELLIS_DISABLE_TOURS__?: boolean })
          .__TRELLIS_DISABLE_TOURS__ = true;
        window.localStorage.setItem("trellis.disableTours", "1");
      } catch {
        // best-effort
      }
    });
    page.on("console", (msg) => {
      const t = msg.type();
      if (t === "error" || t === "warning") {
        // eslint-disable-next-line no-console
        console.log(`[browser ${t}] ${msg.text().slice(0, 400)}`);
      }
    });
    page.on("pageerror", (err) => {
      // eslint-disable-next-line no-console
      console.log(`[browser pageerror] ${err.message}`);
    });
    await page.addInitScript(() => {
      try {
        const orig = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key: string) {
          if (typeof key === "string" && key.startsWith("trellis.sampleTour.v1.")) {
            return "seen";
          }
          if (key === "trellis.sampleTour.start" || key === "trellis.showcaseTour.start") {
            return null;
          }
          return orig.call(this, key);
        };
        const origSet = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key: string, value: string) {
          // Block any code path that tries to (re-)arm the tour start flag.
          if (key === "trellis.sampleTour.start" || key === "trellis.showcaseTour.start") {
            return;
          }
          return origSet.call(this, key, value);
        };
      } catch {
        // best-effort
      }
    });
    await signIn(page);
    await ensureSampleData(page);
  });

  test.afterEach(async ({ page }) => {
    for (const id of [...createdIds]) {
      await deleteIncident(page, id);
    }
    createdIds.length = 0;
  });

  // -------------------------------------------------------------------------
  // Lifecycle: draft → open
  // -------------------------------------------------------------------------

  test("creates a draft incident with correct initial status", async ({
    page,
  }) => {
    const student = await getFirstStudent(page);
    const incident = await createDraftIncident(page, student.id);
    createdIds.push(incident.id);

    expect(incident.status).toBe("draft");
    expect(incident.studentId).toBe(student.id);

    // Verify the record is retrievable.
    const fetched = await fetchIncident(page, incident.id);
    expect(fetched.id).toBe(incident.id);
    expect(fetched.status).toBe("draft");
  });

  test("transitions incident from draft → open", async ({ page }) => {
    const student = await getFirstStudent(page);
    const incident = await createDraftIncident(page, student.id);
    createdIds.push(incident.id);

    const { ok, body } = await transitionIncident(
      page,
      incident.id,
      "open",
      "Incident submitted for admin review.",
    );

    expect(ok, `Transition draft→open failed: ${JSON.stringify(body)}`).toBe(
      true,
    );
    expect((body as Incident).status).toBe("open");

    const fetched = await fetchIncident(page, incident.id);
    expect(fetched.status).toBe("open");
  });

  test("rejects invalid transition (draft → resolved)", async ({ page }) => {
    const student = await getFirstStudent(page);
    const incident = await createDraftIncident(page, student.id);
    createdIds.push(incident.id);

    const res = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/transition`,
      { data: { toStatus: "resolved", note: "Skipping review — invalid." } },
    );
    expect(res.ok()).toBe(false);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Cannot transition/);
  });

  // -------------------------------------------------------------------------
  // Lifecycle: open → under_review (transition endpoint with toStatus)
  // -------------------------------------------------------------------------

  test("admin review transitions open incident to under_review", async ({
    page,
  }) => {
    const student = await getFirstStudent(page);
    const incident = await createDraftIncident(page, student.id);
    createdIds.push(incident.id);

    // draft → open
    const openResult = await transitionIncident(
      page,
      incident.id,
      "open",
      "Submitted for review.",
    );
    expect(
      openResult.ok,
      `draft→open failed: ${JSON.stringify(openResult.body)}`,
    ).toBe(true);

    // open → under_review via transition endpoint
    const reviewRes = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/transition`,
      {
        data: {
          toStatus: "under_review",
          note: "Reviewed. Restraint was justified given the antecedents.",
        },
      },
    );
    const reviewBody = await reviewRes.json();

    if (reviewRes.status() === 401) {
      test.skip(
        true,
        "E2E admin user lacks publicMetadata.staffId — skipping under_review transition. " +
          "Run the E2E global setup to provision staffId on the Clerk test user.",
      );
      return;
    }

    expect(
      reviewRes.ok(),
      `open→under_review transition failed: ${JSON.stringify(reviewBody)}`,
    ).toBe(true);
    expect((reviewBody as Incident).status).toBe("under_review");

    const fetched = await fetchIncident(page, incident.id);
    expect(fetched.status).toBe("under_review");
  });

  // -------------------------------------------------------------------------
  // Full lifecycle: draft → open → under_review → resolved → dese_reported
  // -------------------------------------------------------------------------

  test("full incident lifecycle: draft → open → under_review → resolved → dese_reported", async ({
    page,
  }) => {
    const student = await getFirstStudent(page);
    const incident = await createDraftIncident(page, student.id);
    createdIds.push(incident.id);

    // --- draft → open ---
    {
      const { ok, body } = await transitionIncident(
        page,
        incident.id,
        "open",
        "Incident report submitted for administrator review.",
      );
      expect(ok, `draft→open: ${JSON.stringify(body)}`).toBe(true);
    }

    // --- open → under_review ---
    {
      const res = await page.request.post(
        `/api/protective-measures/incidents/${incident.id}/transition`,
        {
          data: {
            toStatus: "under_review",
            note: "Admin review complete. All documentation is adequate.",
          },
        },
      );
      const body = await res.json();
      if (res.status() === 401) {
        test.skip(
          true,
          "Admin staffId not present on Clerk test user — cannot complete full lifecycle test.",
        );
        return;
      }
      expect(res.ok(), `open→under_review: ${JSON.stringify(body)}`).toBe(true);
      expect((body as Incident).status).toBe("under_review");
    }

    // --- under_review → resolved ---
    {
      const { ok, body } = await transitionIncident(
        page,
        incident.id,
        "resolved",
        "All parties have been notified. Incident is resolved.",
      );
      if (!ok && (body as { error?: string }).error?.includes("Actor identity")) {
        test.skip(true, "staffId not available — skipping resolved step.");
        return;
      }
      expect(ok, `under_review→resolved: ${JSON.stringify(body)}`).toBe(true);
      expect((body as Incident).status).toBe("resolved");
    }

    // --- resolved → dese_reported ---
    {
      const res = await page.request.post(
        `/api/protective-measures/incidents/${incident.id}/dese-report`,
        {
          data: {
            thirtyDayLogSent: true,
            note: "DESE 30-day log transmitted via secure file transfer.",
          },
        },
      );
      const body = await res.json();
      if (res.status() === 401) {
        test.skip(true, "staffId not available — skipping dese-reported step.");
        return;
      }
      expect(res.ok(), `resolved→dese_reported: ${JSON.stringify(body)}`).toBe(
        true,
      );
      expect((body as Incident).status).toBe("dese_reported");
    }

    // Final state verification.
    const final = await fetchIncident(page, incident.id);
    expect(final.status).toBe("dese_reported");

    // Status history must record all transitions.
    const histRes = await page.request.get(
      `/api/protective-measures/incidents/${incident.id}/status-history`,
    );
    expect(histRes.ok()).toBe(true);
    const history = (await histRes.json()) as Array<{
      fromStatus: string;
      toStatus: string;
    }>;
    const toStatuses = history.map((h) => h.toStatus);
    expect(toStatuses).toContain("open");
    expect(toStatuses).toContain("under_review");
    expect(toStatuses).toContain("resolved");
    expect(toStatuses).toContain("dese_reported");
  });

  // -------------------------------------------------------------------------
  // dese_reported is terminal — no further transitions allowed
  // -------------------------------------------------------------------------

  test("dese_reported status is terminal and rejects further transitions", async ({
    page,
  }) => {
    const student = await getFirstStudent(page);
    const incident = await createDraftIncident(page, student.id);
    createdIds.push(incident.id);

    // Drive through the full lifecycle via the transition endpoint so we can
    // reach dese_reported. Abort gracefully if staffId is missing.
    const draftToOpen = await transitionIncident(
      page,
      incident.id,
      "open",
      "Submitted.",
    );
    expect(draftToOpen.ok).toBe(true);

    const reviewRes = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/transition`,
      { data: { toStatus: "under_review", note: "Reviewed." } },
    );
    if (reviewRes.status() === 401) {
      test.skip(true, "staffId not present — cannot reach dese_reported.");
      return;
    }

    const toResolved = await transitionIncident(
      page,
      incident.id,
      "resolved",
      "Resolved.",
    );
    if (!toResolved.ok) {
      test.skip(true, "staffId not present — cannot reach dese_reported.");
      return;
    }

    const deseRes = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/dese-report`,
      { data: { note: "Filed." } },
    );
    if (deseRes.status() === 401) {
      test.skip(true, "staffId not present — cannot reach dese_reported.");
      return;
    }
    expect(deseRes.ok()).toBe(true);

    // Attempt a transition out of dese_reported — must be rejected.
    const res = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/transition`,
      { data: { toStatus: "resolved", note: "Trying to roll back." } },
    );
    expect(res.ok()).toBe(false);
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/none|Cannot transition/i);
  });

  // -------------------------------------------------------------------------
  // Parent notification: save draft
  // -------------------------------------------------------------------------

  test("saves parent notification draft text against an incident", async ({
    page,
  }) => {
    const student = await getFirstStudent(page);
    const incident = await createDraftIncident(page, student.id);
    createdIds.push(incident.id);

    const draftText =
      "Dear Parent/Guardian,\n\nWe are writing to inform you of an incident on [date]...\n\nSincerely,\nSchool Staff";

    const res = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/parent-notification-draft`,
      { data: { draft: draftText } },
    );
    expect(res.ok(), "Saving notification draft should succeed").toBeTruthy();
    const body = await res.json() as Incident;
    expect(body.parentNotificationDraft).toBe(draftText);
  });

  test("generates a notification draft from incident data via the generate-draft endpoint", async ({
    page,
  }) => {
    const student = await getFirstStudent(page);
    const incident = await createDraftIncident(page, student.id);
    createdIds.push(incident.id);

    const res = await page.request.get(
      `/api/protective-measures/incidents/${incident.id}/generate-draft`,
    );
    expect(res.ok(), "generate-draft should return 200").toBeTruthy();
    const body = await res.json() as { draft: string; parentEmail: string | null };
    expect(typeof body.draft).toBe("string");
    expect(body.draft.length).toBeGreaterThan(50);
    expect(body.draft).toContain("603 CMR 46.00");
  });

  // -------------------------------------------------------------------------
  // Parent notification: approve
  // -------------------------------------------------------------------------

  test("approves a parent notification draft", async ({ page }) => {
    const student = await getFirstStudent(page);
    const incident = await createDraftIncident(page, student.id);
    createdIds.push(incident.id);

    // Reach under_review so the review-notification endpoint accepts the call.
    const { ok: openOk } = await transitionIncident(
      page,
      incident.id,
      "open",
      "Submitted.",
    );
    expect(openOk).toBe(true);

    const reviewRes = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/transition`,
      { data: { toStatus: "under_review", note: "Approved by admin." } },
    );
    if (reviewRes.status() === 401) {
      test.skip(true, "staffId not present — cannot reach under_review.");
      return;
    }
    expect(reviewRes.ok()).toBe(true);

    // Save a draft.
    const draftText = "Dear Parent, your child was involved in an incident...";
    await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/parent-notification-draft`,
      { data: { draft: draftText } },
    );

    // Approve the notification.
    const approveRes = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/review-notification`,
      { data: { action: "approve", note: "Letter reviewed and approved." } },
    );
    const approveBody = await approveRes.json();
    if (approveRes.status() === 401) {
      test.skip(true, "staffId not present — cannot test notification approval.");
      return;
    }
    expect(
      approveRes.ok(),
      `review-notification (approve) failed: ${JSON.stringify(approveBody)}`,
    ).toBe(true);
    expect((approveBody as { success: boolean; action: string }).success).toBe(true);
    expect((approveBody as { action: string }).action).toBe("approve");

    // Verify status history records the approval.
    const histRes = await page.request.get(
      `/api/protective-measures/incidents/${incident.id}/status-history`,
    );
    const history = (await histRes.json()) as Array<{ toStatus: string }>;
    expect(history.some((h) => h.toStatus === "notification_approved")).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Parent notification: return-for-correction
  // -------------------------------------------------------------------------

  test("returns notification draft for correction then re-approves", async ({
    page,
  }) => {
    const student = await getFirstStudent(page);
    const incident = await createDraftIncident(page, student.id);
    createdIds.push(incident.id);

    // Reach under_review.
    const { ok: openOk } = await transitionIncident(
      page,
      incident.id,
      "open",
      "Submitted.",
    );
    expect(openOk).toBe(true);

    const reviewRes = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/transition`,
      { data: { toStatus: "under_review", note: "Reviewed." } },
    );
    if (reviewRes.status() === 401) {
      test.skip(true, "staffId not present — cannot reach under_review.");
      return;
    }
    expect(reviewRes.ok()).toBe(true);

    // Return for correction.
    const returnRes = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/review-notification`,
      {
        data: {
          action: "return",
          note: "Please update the de-escalation section before sending.",
        },
      },
    );
    const returnBody = await returnRes.json();
    if (returnRes.status() === 401) {
      test.skip(true, "staffId not present — cannot test return-for-correction.");
      return;
    }
    expect(
      returnRes.ok(),
      `review-notification (return) failed: ${JSON.stringify(returnBody)}`,
    ).toBe(true);
    expect((returnBody as { action: string }).action).toBe("return");

    // Verify history records the return event.
    const histAfterReturn = (await (
      await page.request.get(
        `/api/protective-measures/incidents/${incident.id}/status-history`,
      )
    ).json()) as Array<{ toStatus: string }>;
    expect(
      histAfterReturn.some((h) => h.toStatus === "notification_returned"),
    ).toBe(true);

    // Re-approve after correction.
    const reapproveRes = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/review-notification`,
      { data: { action: "approve", note: "Updated draft looks good." } },
    );
    expect(reapproveRes.ok()).toBe(true);
    const histAfterApprove = (await (
      await page.request.get(
        `/api/protective-measures/incidents/${incident.id}/status-history`,
      )
    ).json()) as Array<{ toStatus: string }>;
    const approvals = histAfterApprove.filter(
      (h) => h.toStatus === "notification_approved",
    );
    expect(approvals.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // Parent notification: send via certified mail (non-email channel)
  // -------------------------------------------------------------------------

  test("sends parent notification via certified mail after approval", async ({
    page,
  }) => {
    const student = await getFirstStudent(page);
    const incident = await createDraftIncident(page, student.id);
    createdIds.push(incident.id);

    // Reach under_review.
    const { ok: openOk } = await transitionIncident(
      page,
      incident.id,
      "open",
      "Submitted.",
    );
    expect(openOk).toBe(true);

    const reviewRes = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/transition`,
      { data: { toStatus: "under_review", note: "Reviewed." } },
    );
    if (reviewRes.status() === 401) {
      test.skip(true, "staffId not present — cannot complete notification send test.");
      return;
    }
    expect(reviewRes.ok()).toBe(true);

    // Save draft and approve.
    const draftText = "Dear Parent, this is the official 603 CMR 46.00 notification.";
    await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/parent-notification-draft`,
      { data: { draft: draftText } },
    );

    const approveRes = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/review-notification`,
      { data: { action: "approve", note: "Approved for sending." } },
    );
    if (approveRes.status() === 401) {
      test.skip(true, "staffId not present — cannot approve notification.");
      return;
    }
    expect(approveRes.ok()).toBe(true);

    // Send via certified_mail (avoids email-provider dependency).
    const sendRes = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/send-parent-notification`,
      { data: { draft: draftText, method: "certified_mail" } },
    );
    const sendBody = await sendRes.json();
    if (sendRes.status() === 401) {
      test.skip(true, "staffId not present — cannot send notification.");
      return;
    }
    expect(
      sendRes.ok(),
      `send-parent-notification failed: ${JSON.stringify(sendBody)}`,
    ).toBe(true);

    const sent = sendBody as Incident & {
      emailNotSent?: boolean;
      communicationEventId?: number | null;
    };
    // Notification timestamps should be populated.
    expect(sent.parentNotificationSentAt).not.toBeNull();
    expect(sent.parentNotified).toBe(true);
    expect(sent.writtenReportSent).toBe(true);
    // Non-email channel must record a communication event id.
    expect(sent.communicationEventId).not.toBeNull();

    // Re-fetching the incident should reflect the sent state.
    const final = await fetchIncident(page, incident.id);
    expect(final.parentNotificationSentAt).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Parent notification: cannot send without prior approval
  // -------------------------------------------------------------------------

  test("rejects send-parent-notification when not yet approved", async ({
    page,
  }) => {
    const student = await getFirstStudent(page);
    const incident = await createDraftIncident(page, student.id);
    createdIds.push(incident.id);

    // Reach under_review.
    const { ok: openOk } = await transitionIncident(
      page,
      incident.id,
      "open",
      "Submitted.",
    );
    expect(openOk).toBe(true);

    const reviewRes = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/transition`,
      { data: { toStatus: "under_review", note: "Reviewed." } },
    );
    if (reviewRes.status() === 401) {
      test.skip(true, "staffId not present.");
      return;
    }
    expect(reviewRes.ok()).toBe(true);

    // Attempt to send WITHOUT approving the notification first.
    const sendRes = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/send-parent-notification`,
      { data: { draft: "Some draft text", method: "certified_mail" } },
    );
    if (sendRes.status() === 401) {
      test.skip(true, "staffId not present.");
      return;
    }
    // Must be rejected with 400 — approval required.
    expect(sendRes.ok()).toBe(false);
    expect(sendRes.status()).toBe(400);
    const body = await sendRes.json();
    expect(body.error).toMatch(/approved|approve/i);
  });

  // -------------------------------------------------------------------------
  // Parent notification: idempotency — cannot send twice
  // -------------------------------------------------------------------------

  test("rejects duplicate send-parent-notification", async ({ page }) => {
    const student = await getFirstStudent(page);
    const incident = await createDraftIncident(page, student.id);
    createdIds.push(incident.id);

    const { ok: openOk } = await transitionIncident(
      page,
      incident.id,
      "open",
      "Submitted.",
    );
    expect(openOk).toBe(true);

    const reviewRes = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/transition`,
      { data: { toStatus: "under_review", note: "Reviewed." } },
    );
    if (reviewRes.status() === 401) {
      test.skip(true, "staffId not present.");
      return;
    }
    expect(reviewRes.ok()).toBe(true);

    const draftText = "Official notification letter content.";
    await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/parent-notification-draft`,
      { data: { draft: draftText } },
    );
    const approveRes = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/review-notification`,
      { data: { action: "approve", note: "Approved." } },
    );
    if (approveRes.status() === 401) {
      test.skip(true, "staffId not present.");
      return;
    }
    expect(approveRes.ok()).toBe(true);

    const send1 = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/send-parent-notification`,
      { data: { draft: draftText, method: "hand_delivered" } },
    );
    if (send1.status() === 401) {
      test.skip(true, "staffId not present.");
      return;
    }
    expect(send1.ok()).toBe(true);

    // Second send must be rejected.
    const send2 = await page.request.post(
      `/api/protective-measures/incidents/${incident.id}/send-parent-notification`,
      { data: { draft: draftText, method: "hand_delivered" } },
    );
    expect(send2.ok()).toBe(false);
    expect(send2.status()).toBe(400);
    const body2 = await send2.json();
    expect(body2.error).toMatch(/already been sent/i);
  });

  // -------------------------------------------------------------------------
  // UI smoke: protective measures page renders and lists incidents
  // -------------------------------------------------------------------------

  test("protective-measures page loads and shows incident list", async ({
    page,
  }) => {
    const student = await getFirstStudent(page);
    const incident = await createDraftIncident(page, student.id);
    createdIds.push(incident.id);

    // Clear the test-only Authorization header before navigating: Clerk's
    // browser SDK refuses any request that has BOTH the browser-set Origin
    // header and an Authorization header ("only one of 'Origin' and
    // 'Authorization' headers should be provided"). With the header set,
    // Clerk fails to load the session client-side and the React app never
    // mounts past <RedirectToSignIn />, leaving the page blank. We clear it
    // for the navigation, let Clerk initialize from session cookies, then
    // restore the Bearer token so the in-app API calls authenticate.
    const savedAuth = `Bearer ${await page.evaluate(async () => {
      const w = window as unknown as {
        Clerk?: { session?: { getToken: () => Promise<string | null> } };
      };
      return (await w.Clerk?.session?.getToken?.()) ?? "";
    })}`;
    await page.context().setExtraHTTPHeaders({});

    await page.goto("/protective-measures");

    // Wait for Clerk's browser SDK to finish loading on the new page (it
    // re-initializes on every full navigation) before re-attaching the
    // Authorization header — otherwise the very next Clerk fetch races and
    // rejects with the same Origin/Authorization conflict.
    await page.waitForFunction(
      () => {
        const w = window as unknown as { Clerk?: { loaded?: boolean } };
        return w.Clerk?.loaded === true;
      },
      null,
      { timeout: 30_000 },
    );
    await page.context().setExtraHTTPHeaders({ Authorization: savedAuth });

    // The page should not show a hard error.
    await expect(page.getByText("Something went wrong")).toHaveCount(0, {
      timeout: 20_000,
    });
    await expect(page.getByText("Not Found")).toHaveCount(0);

    // The page heading should be present (varies by copy; accept any heading).
    const heading = page
      .getByRole("heading")
      .filter({ hasNotText: /set up trellis/i })
      .first();
    await expect(heading).toBeVisible({ timeout: 30_000 });

    // The incident we just created should appear in the list once the query
    // resolves.  The list does not render numeric incident IDs, so we match
    // the student's full name (which is rendered as the row title for each
    // incident button).
    const studentFullName = `${student.firstName} ${student.lastName}`;
    await expect(
      page.getByText(studentFullName, { exact: false }).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  // -------------------------------------------------------------------------
  // Cleanup: afterAll — remove sample data if present
  // -------------------------------------------------------------------------

  test.afterAll(async ({ browser }) => {
    // When this spec is run in isolation (e.g. `--grep` selecting a single
    // test), Playwright proactively tears down the worker browser before
    // afterAll fires, which makes `browser.newContext()` throw "Target page,
    // context or browser has been closed" and report a fake post-test
    // failure. Skip cleanup gracefully in that case — the per-test afterEach
    // hooks already remove any incidents created during the run, and the
    // sample-data fixture is intentionally durable across runs.
    if (!browser.isConnected()) return;
    let ctx;
    try {
      ctx = await browser.newContext();
      const page = await ctx.newPage();
      await signIn(page);
      await teardownSampleData(page);
    } catch {
      // best-effort
    } finally {
      if (ctx) await ctx.close().catch(() => {});
    }
  });
});
