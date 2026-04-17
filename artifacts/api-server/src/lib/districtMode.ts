export type DistrictMode = "demo" | "pilot" | "paid" | "trial" | "unpaid" | "unconfigured";

export interface DistrictModeInputs {
  isDemo: boolean | null | undefined;
  isPilot: boolean | null | undefined;
  subscriptionStatus: string | null | undefined;
}

/**
 * Single source of truth for "what mode is this district in?".
 * Order: demo > pilot > paid > trial > unpaid > unconfigured.
 * Mirrors the contract used by the billing foundation (subscriptionGate / tier-context).
 */
export function deriveDistrictMode({ isDemo, isPilot, subscriptionStatus }: DistrictModeInputs): DistrictMode {
  if (isDemo) return "demo";
  if (isPilot) return "pilot";
  if (subscriptionStatus === "active") return "paid";
  if (subscriptionStatus === "trialing") return "trial";
  if (subscriptionStatus === "past_due" || subscriptionStatus === "canceled" || subscriptionStatus === "unpaid") return "unpaid";
  return "unconfigured";
}
