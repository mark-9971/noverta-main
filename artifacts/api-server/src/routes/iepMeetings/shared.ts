import { requireRoles } from "../../middlewares/auth";
import { PRIVILEGED_STAFF_ROLES } from "../../lib/permissions";

export const meetingAccess = requireRoles(...PRIVILEGED_STAFF_ROLES);

export const MEETING_TYPES = [
  "annual_review", "initial_iep", "amendment", "reevaluation",
  "transition", "manifestation_determination", "eligibility",
  "progress_review", "other",
];

export const MEETING_STATUSES = ["scheduled", "confirmed", "in_progress", "completed", "cancelled", "rescheduled"];

export function pick(body: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const k of keys) {
    if (k in body) result[k] = body[k];
  }
  return result;
}
