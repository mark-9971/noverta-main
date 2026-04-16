import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";

export const VALID_CLAIM_STATUSES = ["pending", "approved", "rejected", "exported", "void"] as const;

export function getDistrictId(req: AuthedRequest): number | null {
  return getEnforcedDistrictId(req);
}
