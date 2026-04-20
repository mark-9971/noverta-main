import {
  createServiceRequirement,
  updateServiceRequirement,
  deleteServiceRequirement,
  createStaffAssignment,
  deleteStaffAssignment,
  createProgressShareLink,
  type CreateServiceRequirementBody,
  type UpdateServiceRequirementBody,
  type ShareLink,
} from "@workspace/api-client-react";
import type { SupersedeFlow, AttemptUpdateResult } from "./supersede-flow";

/**
 * Pure handler functions extracted from `student-detail.tsx`. These mirror the
 * shape of the inline async handlers on the page but take their dependencies
 * explicitly (fetch impl, api-client functions, ids, and the form payload) so
 * they can be unit-tested without rendering the 1600-line page.
 *
 * Every handler resolves to a discriminated `{ ok: boolean }` instead of
 * throwing so the calling component can map the result to a toast.
 */

export type FetchFn = (input: RequestInfo, init?: RequestInit) => Promise<Response>;

export type HandlerResult = { ok: true } | { ok: false };

async function postJson(
  fetchFn: FetchFn,
  url: string,
  body: unknown,
  method: "POST" | "PATCH" | "DELETE" = "POST",
): Promise<HandlerResult> {
  try {
    const init: RequestInit =
      method === "DELETE"
        ? { method }
        : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
    const r = await fetchFn(url, init);
    if (!r.ok) return { ok: false };
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ─── Student lifecycle ────────────────────────────────────────────────────

export function archiveStudent(
  fetchFn: FetchFn,
  studentId: number,
  reason: string | null,
): Promise<HandlerResult> {
  return postJson(fetchFn, `/api/students/${studentId}/archive`, { reason });
}

export function reactivateStudent(
  fetchFn: FetchFn,
  studentId: number,
): Promise<HandlerResult> {
  return postJson(fetchFn, `/api/students/${studentId}/reactivate`, {});
}

// ─── Enrollment events ────────────────────────────────────────────────────

export type EnrollmentEventInput = {
  eventType: string;
  eventDate: string;
  reasonCode: string;
  reason: string;
  notes: string;
};

export function saveEnrollmentEvent(
  fetchFn: FetchFn,
  studentId: number,
  form: EnrollmentEventInput,
  editingId: number | null,
): Promise<HandlerResult> {
  if (!form.eventType || !form.eventDate) return Promise.resolve({ ok: false });
  const body = {
    eventType: form.eventType,
    eventDate: form.eventDate,
    reasonCode: form.reasonCode || null,
    reason: form.reason || null,
    notes: form.notes || null,
  };
  if (editingId != null) {
    return postJson(
      fetchFn,
      `/api/students/${studentId}/enrollment/${editingId}`,
      body,
      "PATCH",
    );
  }
  return postJson(fetchFn, `/api/students/${studentId}/enrollment`, body, "POST");
}

export function deleteEnrollmentEvent(
  fetchFn: FetchFn,
  studentId: number,
  eventId: number,
): Promise<HandlerResult> {
  return postJson(
    fetchFn,
    `/api/students/${studentId}/enrollment/${eventId}`,
    null,
    "DELETE",
  );
}

// ─── Emergency contacts ───────────────────────────────────────────────────

export type EcInput = {
  firstName: string;
  lastName: string;
  relationship: string;
  phone: string;
  phoneSecondary: string;
  email: string;
  isAuthorizedForPickup: boolean;
  priority: number;
  notes: string;
};

export function saveEmergencyContact(
  fetchFn: FetchFn,
  studentId: number,
  form: EcInput,
  editingId: number | null,
): Promise<HandlerResult> {
  if (!form.firstName || !form.lastName || !form.relationship || !form.phone) {
    return Promise.resolve({ ok: false });
  }
  if (editingId != null) {
    return postJson(fetchFn, `/api/emergency-contacts/${editingId}`, form, "PATCH");
  }
  return postJson(
    fetchFn,
    `/api/students/${studentId}/emergency-contacts`,
    { ...form, studentId },
    "POST",
  );
}

export function deleteEmergencyContact(
  fetchFn: FetchFn,
  contactId: number,
): Promise<HandlerResult> {
  return postJson(fetchFn, `/api/emergency-contacts/${contactId}`, null, "DELETE");
}

// ─── Medical alerts ───────────────────────────────────────────────────────

export type MaInput = {
  alertType: string;
  description: string;
  severity: string;
  treatmentNotes: string;
  epiPenOnFile: boolean;
  notifyAllStaff: boolean;
};

export function saveMedicalAlert(
  fetchFn: FetchFn,
  studentId: number,
  form: MaInput,
  editingId: number | null,
): Promise<HandlerResult> {
  if (!form.description || !form.alertType || !form.severity) {
    return Promise.resolve({ ok: false });
  }
  if (editingId != null) {
    return postJson(fetchFn, `/api/medical-alerts/${editingId}`, form, "PATCH");
  }
  return postJson(
    fetchFn,
    `/api/students/${studentId}/medical-alerts`,
    { ...form, studentId },
    "POST",
  );
}

export function deleteMedicalAlert(
  fetchFn: FetchFn,
  alertId: number,
): Promise<HandlerResult> {
  return postJson(fetchFn, `/api/medical-alerts/${alertId}`, null, "DELETE");
}

// ─── Service requirements ────────────────────────────────────────────────

export type SvcFormInput = {
  serviceTypeId: string;
  providerId: string;
  deliveryType: string;
  requiredMinutes: string;
  intervalType: string;
  startDate: string;
  endDate: string;
  priority: string;
  notes: string;
};

function svcProviderId(form: SvcFormInput): number | null {
  return form.providerId && form.providerId !== "__none"
    ? Number(form.providerId)
    : null;
}

export function svcFormToCreateBody(
  studentId: number,
  form: SvcFormInput,
): CreateServiceRequirementBody {
  return {
    studentId,
    serviceTypeId: Number(form.serviceTypeId),
    providerId: svcProviderId(form),
    deliveryType: form.deliveryType,
    requiredMinutes: Number(form.requiredMinutes),
    intervalType: form.intervalType,
    startDate: form.startDate,
    endDate: form.endDate || null,
    priority: form.priority,
    notes: form.notes || null,
    active: true,
  };
}

export function svcFormToUpdateBody(form: SvcFormInput): UpdateServiceRequirementBody {
  return {
    providerId: svcProviderId(form),
    deliveryType: form.deliveryType,
    requiredMinutes: Number(form.requiredMinutes),
    intervalType: form.intervalType,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    priority: form.priority,
    notes: form.notes || null,
  };
}

export type CreateServiceRequirementFn = typeof createServiceRequirement;
export type UpdateServiceRequirementFn = typeof updateServiceRequirement;
export type DeleteServiceRequirementFn = typeof deleteServiceRequirement;

export async function createServiceRequirementHandler(
  api: CreateServiceRequirementFn,
  studentId: number,
  form: SvcFormInput,
): Promise<HandlerResult> {
  if (!form.serviceTypeId || !form.requiredMinutes) return { ok: false };
  try {
    await api(svcFormToCreateBody(studentId, form));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Edit an existing service requirement, deferring to the supersede flow when
 * the api responds with a 409 REQUIRES_SUPERSEDE. The supersede flow's
 * `attempt` callback handles 409 detection internally, opens the modal with
 * the pending edits, and returns a discriminated result. We map that result
 * down to the same `{ ok }` shape as the other handlers so the page can show
 * a single toast on the unrecoverable error path while letting the modal
 * drive the supersede UX.
 */
export async function updateServiceRequirementHandler(
  flow: Pick<SupersedeFlow, "attempt">,
  api: UpdateServiceRequirementFn,
  serviceRequirementId: number,
  studentId: number,
  form: SvcFormInput,
): Promise<HandlerResult & { kind: AttemptUpdateResult["kind"] }> {
  if (!form.serviceTypeId || !form.requiredMinutes) {
    return { ok: false, kind: "error" };
  }
  const edits = svcFormToUpdateBody(form);
  void studentId; // studentId is informational; the api derives it from the row.
  const result = await flow.attempt(api, serviceRequirementId, edits);
  if (result.kind === "ok") return { ok: true, kind: "ok" };
  if (result.kind === "supersede") return { ok: true, kind: "supersede" };
  return { ok: false, kind: "error" };
}

export async function deleteServiceRequirementHandler(
  api: DeleteServiceRequirementFn,
  serviceRequirementId: number,
): Promise<HandlerResult> {
  try {
    await api(serviceRequirementId);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ─── Staff assignments ────────────────────────────────────────────────────

export type AssignFormInput = {
  staffId: string;
  assignmentType: string;
  startDate: string;
  endDate: string;
  notes: string;
};

export type CreateStaffAssignmentFn = typeof createStaffAssignment;
export type DeleteStaffAssignmentFn = typeof deleteStaffAssignment;

export async function addStaffAssignmentHandler(
  api: CreateStaffAssignmentFn,
  studentId: number,
  form: AssignFormInput,
): Promise<HandlerResult> {
  if (!form.staffId || !form.assignmentType) return { ok: false };
  try {
    await api({
      staffId: Number(form.staffId),
      studentId,
      assignmentType: form.assignmentType,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      notes: form.notes || null,
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function removeStaffAssignmentHandler(
  api: DeleteStaffAssignmentFn,
  assignmentId: number,
): Promise<HandlerResult> {
  try {
    await api(assignmentId);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ─── Share progress (summary fetch + share link) ────────────────────────

export type GetProgressSummaryFn = (
  studentId: number,
  query: { days: number },
) => Promise<unknown>;

export type ProgressSummaryResult =
  | { ok: true; data: unknown }
  | { ok: false };

/**
 * Backs the "Share Progress" button: fetches the progress summary the modal
 * displays before the user generates a share link. Returns `{ ok: false }` on
 * any error so the page can render an empty state without crashing.
 */
export async function fetchProgressSummaryHandler(
  api: GetProgressSummaryFn,
  studentId: number,
  days: number,
): Promise<ProgressSummaryResult> {
  try {
    const data = await api(studentId, { days });
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}



export type CreateProgressShareLinkFn = (
  studentId: number,
  body: { days: number; expiresInHours: number },
) => Promise<ShareLink>;

export type ShareLinkResult =
  | { ok: true; url: string }
  | { ok: false };

export async function generateShareLinkHandler(
  api: CreateProgressShareLinkFn,
  studentId: number,
  days: number,
  origin: string,
  expiresInHours = 72,
): Promise<ShareLinkResult> {
  try {
    const data = await api(studentId, { days, expiresInHours });
    return { ok: true, url: `${origin}${data.url}` };
  } catch {
    return { ok: false };
  }
}

// Type assertion that the local fn type is compatible with the api-client's
// generated function — keeps us honest if the generated signature changes.
const _typeCheckShareLinkFn: CreateProgressShareLinkFn = (
  studentId,
  body,
) => createProgressShareLink(studentId, body);
void _typeCheckShareLinkFn;
