import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  archiveStudent,
  reactivateStudent,
  saveEnrollmentEvent,
  deleteEnrollmentEvent,
  saveEmergencyContact,
  deleteEmergencyContact,
  saveMedicalAlert,
  deleteMedicalAlert,
  createServiceRequirementHandler,
  updateServiceRequirementHandler,
  deleteServiceRequirementHandler,
  addStaffAssignmentHandler,
  removeStaffAssignmentHandler,
  generateShareLinkHandler,
  fetchProgressSummaryHandler,
  svcFormToCreateBody,
  svcFormToUpdateBody,
  type EnrollmentEventInput,
  type EcInput,
  type MaInput,
  type SvcFormInput,
  type AssignFormInput,
} from "../src/pages/student-detail/handlers";

/**
 * These tests cover the handler logic for every major interaction on the
 * student detail page (`student-detail.tsx`):
 *  - archive / reactivate student
 *  - log/edit/delete enrollment events
 *  - add/edit/delete emergency contacts
 *  - add/edit/delete medical alerts
 *  - create/update/delete service requirements
 *  - add/remove staff assignments
 *  - generate progress-summary share links
 *
 * Each handler is exercised against both the success path (api responds 2xx)
 * and the error path (api throws or returns non-2xx). The assertions verify
 * the URL, HTTP method, and request body that would actually hit the API
 * server, so that regressions in the wiring on `student-detail.tsx` would be
 * caught before they ship.
 */

function okResponse(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function badResponse(status = 500): Response {
  return new Response("err", { status });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

// ─── Student lifecycle ────────────────────────────────────────────────────

describe("archiveStudent", () => {
  it("POSTs the reason to /archive on success", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const result = await archiveStudent(fetchFn, 42, "moved out of district");
    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith("/api/students/42/archive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "moved out of district" }),
    });
  });

  it("returns ok:false when the api responds non-2xx", async () => {
    const fetchFn = vi.fn().mockResolvedValue(badResponse(500));
    const result = await archiveStudent(fetchFn, 42, null);
    expect(result.ok).toBe(false);
  });

  it("returns ok:false when the network request throws", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await archiveStudent(fetchFn, 42, null);
    expect(result.ok).toBe(false);
  });
});

describe("reactivateStudent", () => {
  it("POSTs an empty body to /reactivate on success", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const result = await reactivateStudent(fetchFn, 7);
    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith("/api/students/7/reactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  });

  it("returns ok:false when the api errors", async () => {
    const fetchFn = vi.fn().mockResolvedValue(badResponse(403));
    const result = await reactivateStudent(fetchFn, 7);
    expect(result.ok).toBe(false);
  });
});

// ─── Enrollment events ────────────────────────────────────────────────────

const baseEvent: EnrollmentEventInput = {
  eventType: "note",
  eventDate: "2025-09-01",
  reasonCode: "",
  reason: "",
  notes: "first day back",
};

describe("saveEnrollmentEvent", () => {
  it("rejects without an event type or date", async () => {
    const fetchFn = vi.fn();
    expect(
      (await saveEnrollmentEvent(fetchFn, 1, { ...baseEvent, eventType: "" }, null)).ok,
    ).toBe(false);
    expect(
      (await saveEnrollmentEvent(fetchFn, 1, { ...baseEvent, eventDate: "" }, null)).ok,
    ).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("POSTs a new event to /enrollment when no editing id is given", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const result = await saveEnrollmentEvent(fetchFn, 9, baseEvent, null);
    expect(result.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/students/9/enrollment");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      eventType: "note",
      eventDate: "2025-09-01",
      reasonCode: null,
      reason: null,
      notes: "first day back",
    });
  });

  it("PATCHes /enrollment/:id when editing an existing event", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const result = await saveEnrollmentEvent(
      fetchFn,
      9,
      { ...baseEvent, reasonCode: "withdrawn", reason: "moved" },
      33,
    );
    expect(result.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/students/9/enrollment/33");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toMatchObject({
      reasonCode: "withdrawn",
      reason: "moved",
    });
  });

  it("returns ok:false on api error", async () => {
    const fetchFn = vi.fn().mockResolvedValue(badResponse(400));
    expect((await saveEnrollmentEvent(fetchFn, 1, baseEvent, null)).ok).toBe(false);
  });
});

describe("deleteEnrollmentEvent", () => {
  it("DELETEs /enrollment/:id on success", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const result = await deleteEnrollmentEvent(fetchFn, 5, 17);
    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith("/api/students/5/enrollment/17", {
      method: "DELETE",
    });
  });

  it("returns ok:false on error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("nope"));
    expect((await deleteEnrollmentEvent(fetchFn, 5, 17)).ok).toBe(false);
  });
});

// ─── Emergency contacts ───────────────────────────────────────────────────

const baseEc: EcInput = {
  firstName: "Pat",
  lastName: "Doe",
  relationship: "parent",
  phone: "555-1212",
  phoneSecondary: "",
  email: "pat@example.com",
  isAuthorizedForPickup: true,
  priority: 1,
  notes: "",
};

describe("saveEmergencyContact", () => {
  it("rejects when required fields are missing", async () => {
    const fetchFn = vi.fn();
    expect(
      (await saveEmergencyContact(fetchFn, 1, { ...baseEc, firstName: "" }, null)).ok,
    ).toBe(false);
    expect(
      (await saveEmergencyContact(fetchFn, 1, { ...baseEc, phone: "" }, null)).ok,
    ).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("POSTs a new contact scoped to the student", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const result = await saveEmergencyContact(fetchFn, 11, baseEc, null);
    expect(result.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/students/11/emergency-contacts");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.studentId).toBe(11);
    expect(body.firstName).toBe("Pat");
  });

  it("PATCHes /emergency-contacts/:id when editing", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const result = await saveEmergencyContact(fetchFn, 11, baseEc, 88);
    expect(result.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/emergency-contacts/88");
    expect(init.method).toBe("PATCH");
  });

  it("returns ok:false on api error", async () => {
    const fetchFn = vi.fn().mockResolvedValue(badResponse(500));
    expect((await saveEmergencyContact(fetchFn, 11, baseEc, null)).ok).toBe(false);
  });
});

describe("deleteEmergencyContact", () => {
  it("DELETEs /emergency-contacts/:id on success", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const result = await deleteEmergencyContact(fetchFn, 99);
    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith("/api/emergency-contacts/99", {
      method: "DELETE",
    });
  });

  it("returns ok:false on error", async () => {
    const fetchFn = vi.fn().mockResolvedValue(badResponse(404));
    expect((await deleteEmergencyContact(fetchFn, 99)).ok).toBe(false);
  });
});

// ─── Medical alerts ───────────────────────────────────────────────────────

const baseMa: MaInput = {
  alertType: "allergy",
  description: "peanut allergy",
  severity: "severe",
  treatmentNotes: "epi-pen if exposed",
  epiPenOnFile: true,
  notifyAllStaff: true,
};

describe("saveMedicalAlert", () => {
  it("rejects when required fields are missing", async () => {
    const fetchFn = vi.fn();
    expect(
      (await saveMedicalAlert(fetchFn, 1, { ...baseMa, description: "" }, null)).ok,
    ).toBe(false);
    expect(
      (await saveMedicalAlert(fetchFn, 1, { ...baseMa, alertType: "" }, null)).ok,
    ).toBe(false);
    expect(
      (await saveMedicalAlert(fetchFn, 1, { ...baseMa, severity: "" }, null)).ok,
    ).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("POSTs a new alert scoped to the student", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const result = await saveMedicalAlert(fetchFn, 12, baseMa, null);
    expect(result.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/students/12/medical-alerts");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.studentId).toBe(12);
    expect(body.epiPenOnFile).toBe(true);
  });

  it("PATCHes /medical-alerts/:id when editing", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const result = await saveMedicalAlert(fetchFn, 12, baseMa, 71);
    expect(result.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/medical-alerts/71");
    expect(init.method).toBe("PATCH");
  });

  it("returns ok:false on api error", async () => {
    const fetchFn = vi.fn().mockResolvedValue(badResponse(400));
    expect((await saveMedicalAlert(fetchFn, 12, baseMa, null)).ok).toBe(false);
  });
});

describe("deleteMedicalAlert", () => {
  it("DELETEs /medical-alerts/:id on success", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());
    const result = await deleteMedicalAlert(fetchFn, 55);
    expect(result.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith("/api/medical-alerts/55", { method: "DELETE" });
  });

  it("returns ok:false on error", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("network"));
    expect((await deleteMedicalAlert(fetchFn, 55)).ok).toBe(false);
  });
});

// ─── Service requirements ────────────────────────────────────────────────

const baseSvc: SvcFormInput = {
  serviceTypeId: "3",
  providerId: "7",
  deliveryType: "direct",
  requiredMinutes: "120",
  intervalType: "weekly",
  startDate: "2025-09-01",
  endDate: "2026-06-15",
  priority: "high",
  notes: "increase minutes",
};

describe("svcFormToCreateBody / svcFormToUpdateBody", () => {
  it("converts numeric fields and treats __none provider as null", () => {
    const body = svcFormToCreateBody(42, { ...baseSvc, providerId: "__none" });
    expect(body.studentId).toBe(42);
    expect(body.serviceTypeId).toBe(3);
    expect(body.providerId).toBeNull();
    expect(body.requiredMinutes).toBe(120);
    expect(body.endDate).toBe("2026-06-15");
    expect(body.active).toBe(true);
  });

  it("normalizes blank end date and notes to null on update body", () => {
    const body = svcFormToUpdateBody({ ...baseSvc, endDate: "", notes: "" });
    expect(body.endDate).toBeNull();
    expect(body.notes).toBeNull();
    expect(body.providerId).toBe(7);
  });

  it("normalizes blank start date to null on update body", () => {
    const body = svcFormToUpdateBody({ ...baseSvc, startDate: "" });
    expect(body.startDate).toBeNull();
  });
});

describe("createServiceRequirementHandler", () => {
  it("rejects without service type or minutes", async () => {
    const api = vi.fn();
    expect(
      (await createServiceRequirementHandler(api, 1, { ...baseSvc, serviceTypeId: "" })).ok,
    ).toBe(false);
    expect(
      (await createServiceRequirementHandler(api, 1, { ...baseSvc, requiredMinutes: "" })).ok,
    ).toBe(false);
    expect(api).not.toHaveBeenCalled();
  });

  it("calls the api-client with the converted body on success", async () => {
    const api = vi.fn().mockResolvedValue({ id: 100 });
    const result = await createServiceRequirementHandler(api, 42, baseSvc);
    expect(result.ok).toBe(true);
    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: 42,
        serviceTypeId: 3,
        providerId: 7,
        requiredMinutes: 120,
        intervalType: "weekly",
        startDate: "2025-09-01",
        priority: "high",
        active: true,
      }),
    );
  });

  it("returns ok:false when the api throws", async () => {
    const api = vi.fn().mockRejectedValue(new Error("boom"));
    expect((await createServiceRequirementHandler(api, 42, baseSvc)).ok).toBe(false);
  });
});

describe("updateServiceRequirementHandler", () => {
  function makeFlow(
    attemptImpl: (
      api: (id: number, body: unknown) => Promise<unknown>,
      id: number,
      edits: unknown,
    ) => Promise<{ kind: "ok" } | { kind: "supersede" } | { kind: "error" }>,
  ) {
    return { attempt: vi.fn(attemptImpl) };
  }

  it("returns ok:false / kind:error when required fields are missing", async () => {
    const flow = makeFlow(async () => ({ kind: "ok" }));
    const api = vi.fn();
    const r = await updateServiceRequirementHandler(
      flow,
      api,
      7,
      1,
      { ...baseSvc, serviceTypeId: "" },
    );
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("error");
    expect(flow.attempt).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it("delegates to flow.attempt with the update body and returns ok on success", async () => {
    const flow = makeFlow(async () => ({ kind: "ok" }));
    const api = vi.fn();
    const r = await updateServiceRequirementHandler(flow, api, 99, 1, baseSvc);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("ok");
    expect(flow.attempt).toHaveBeenCalledTimes(1);
    const [calledApi, calledId, calledEdits] = flow.attempt.mock.calls[0];
    expect(calledApi).toBe(api);
    expect(calledId).toBe(99);
    expect(calledEdits).toEqual(svcFormToUpdateBody(baseSvc));
  });

  it("returns kind:supersede (ok:true) when the flow opens the supersede modal on a 409", async () => {
    const flow = makeFlow(async () => ({ kind: "supersede" }));
    const api = vi.fn();
    const r = await updateServiceRequirementHandler(flow, api, 99, 1, baseSvc);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("supersede");
    expect(flow.attempt).toHaveBeenCalledTimes(1);
  });

  it("returns ok:false / kind:error when the flow reports an unrecoverable error", async () => {
    const flow = makeFlow(async () => ({ kind: "error" }));
    const api = vi.fn();
    const r = await updateServiceRequirementHandler(flow, api, 99, 1, baseSvc);
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("error");
  });
});

describe("deleteServiceRequirementHandler", () => {
  it("calls the api-client with the requirement id on success", async () => {
    const api = vi.fn().mockResolvedValue(undefined);
    const result = await deleteServiceRequirementHandler(api, 33);
    expect(result.ok).toBe(true);
    expect(api).toHaveBeenCalledWith(33);
  });

  it("returns ok:false when the api throws", async () => {
    const api = vi.fn().mockRejectedValue(new Error("conflict"));
    expect((await deleteServiceRequirementHandler(api, 33)).ok).toBe(false);
  });
});

// ─── Staff assignments ────────────────────────────────────────────────────

const baseAssign: AssignFormInput = {
  staffId: "21",
  assignmentType: "service_provider",
  startDate: "2025-09-01",
  endDate: "",
  notes: "",
};

describe("addStaffAssignmentHandler", () => {
  it("rejects without staff id or assignment type", async () => {
    const api = vi.fn();
    expect(
      (await addStaffAssignmentHandler(api, 1, { ...baseAssign, staffId: "" })).ok,
    ).toBe(false);
    expect(
      (
        await addStaffAssignmentHandler(api, 1, { ...baseAssign, assignmentType: "" })
      ).ok,
    ).toBe(false);
    expect(api).not.toHaveBeenCalled();
  });

  it("calls the api with normalized fields on success", async () => {
    const api = vi.fn().mockResolvedValue({ id: 9 });
    const result = await addStaffAssignmentHandler(api, 50, baseAssign);
    expect(result.ok).toBe(true);
    expect(api).toHaveBeenCalledWith({
      staffId: 21,
      studentId: 50,
      assignmentType: "service_provider",
      startDate: "2025-09-01",
      endDate: null,
      notes: null,
    });
  });

  it("returns ok:false when the api throws", async () => {
    const api = vi.fn().mockRejectedValue(new Error("dup"));
    expect((await addStaffAssignmentHandler(api, 50, baseAssign)).ok).toBe(false);
  });
});

describe("removeStaffAssignmentHandler", () => {
  it("calls the api with the assignment id on success", async () => {
    const api = vi.fn().mockResolvedValue(undefined);
    const result = await removeStaffAssignmentHandler(api, 14);
    expect(result.ok).toBe(true);
    expect(api).toHaveBeenCalledWith(14);
  });

  it("returns ok:false when the api throws", async () => {
    const api = vi.fn().mockRejectedValue(new Error("nope"));
    expect((await removeStaffAssignmentHandler(api, 14)).ok).toBe(false);
  });
});

// ─── Share progress link ──────────────────────────────────────────────────

describe("fetchProgressSummaryHandler", () => {
  it("returns the data with the requested days when the api resolves", async () => {
    const summary = { totals: { sessions: 4 } };
    const api = vi.fn().mockResolvedValue(summary);
    const r = await fetchProgressSummaryHandler(api, 7, 30);
    expect(r).toEqual({ ok: true, data: summary });
    expect(api).toHaveBeenCalledWith(7, { days: 30 });
  });

  it("returns ok:false when the api rejects (modal stays in empty state)", async () => {
    const api = vi.fn().mockRejectedValue(new Error("nope"));
    const r = await fetchProgressSummaryHandler(api, 7, 30);
    expect(r.ok).toBe(false);
    expect(api).toHaveBeenCalledTimes(1);
  });
});

describe("generateShareLinkHandler", () => {
  it("returns the absolute share url on success", async () => {
    const api = vi.fn().mockResolvedValue({ url: "/share/abc123" });
    const result = await generateShareLinkHandler(api, 42, 30, "https://app.example.com");
    expect(result).toEqual({ ok: true, url: "https://app.example.com/share/abc123" });
    expect(api).toHaveBeenCalledWith(42, { days: 30, expiresInHours: 72 });
  });

  it("forwards a custom expiresInHours value to the api-client", async () => {
    const api = vi.fn().mockResolvedValue({ url: "/share/x" });
    await generateShareLinkHandler(api, 1, 7, "https://x", 12);
    expect(api).toHaveBeenCalledWith(1, { days: 7, expiresInHours: 12 });
  });

  it("returns ok:false when the api throws", async () => {
    const api = vi.fn().mockRejectedValue(new Error("rate limited"));
    const result = await generateShareLinkHandler(api, 42, 30, "https://x");
    expect(result.ok).toBe(false);
  });
});
