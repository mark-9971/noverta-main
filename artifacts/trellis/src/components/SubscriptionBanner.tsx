import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiGet } from "@/lib/api";
import { AlertTriangle, ShieldAlert, CreditCard, Clock, X } from "lucide-react";
import { useRole } from "@/lib/role-context";
import { DEMO_MODE } from "@/lib/config";

interface BillingStatus {
  active: boolean;
  status: string;
  mode?: "paid" | "trial" | "pilot" | "demo" | "unpaid" | "unconfigured" | "error";
  requiresAttention: boolean;
  currentPeriodEnd: string | null;
  trialEndsAt?: string | null;
  gracePeriodEndsAt?: string | null;
  inGracePeriod?: boolean;
  trialEndingSoon?: boolean;
  lastPaymentFailureReason?: string | null;
  lastPaymentFailureAt?: string | null;
}

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function SubscriptionBanner() {
  const { role } = useRole();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    apiGet<BillingStatus>("/billing/status")
      .then(setStatus)
      .catch(() => {});
  }, []);

  if (DEMO_MODE || !status || dismissed) return null;
  // Defense in depth: never show the past-due/canceled banner to non-paying tracks,
  // even if a future server change accidentally sets requiresAttention=true on them.
  if (status.mode === "demo" || status.mode === "pilot") return null;
  if (!status.requiresAttention) return null;

  const isAdmin = role === "admin";

  // Decide which message to show. Priority: hard-block > grace > trial-ending.
  // (Hard-block must be most prominent because it actually denies access.)
  const isCanceled = status.status === "canceled" || status.status === "incomplete_expired";
  const isUnpaid = status.status === "unpaid";
  const isPastDueExpired = status.status === "past_due" && !status.inGracePeriod;
  const isHardBlock = isCanceled || isUnpaid || isPastDueExpired;
  const isGrace = Boolean(status.inGracePeriod);
  const isTrialEnding = Boolean(status.trialEndingSoon) && !isHardBlock && !isGrace;

  const graceDays = daysUntil(status.gracePeriodEndsAt);
  const trialDays = daysUntil(status.trialEndsAt);

  let icon = <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />;
  let bgClass = "bg-amber-50 border-b border-amber-200";
  let textClass = "text-amber-800";
  let buttonClass = "bg-amber-600 text-white hover:bg-amber-700";
  let message: string;

  if (isHardBlock) {
    icon = <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />;
    bgClass = "bg-red-50 border-b border-red-200";
    textClass = "text-red-800";
    buttonClass = "bg-red-600 text-white hover:bg-red-700";
    if (status.status === "canceled") {
      message = isAdmin
        ? "Your subscription has been canceled. Access is restricted. Please reactivate your plan below."
        : "Your district's subscription has been canceled. Please contact your administrator to restore access.";
    } else if (status.status === "incomplete_expired") {
      message = isAdmin
        ? "Your subscription was never activated because the initial charge failed. Please start a new subscription."
        : "Your district's subscription could not be activated. Please contact your administrator.";
    } else if (isPastDueExpired) {
      message = isAdmin
        ? `Your account has an unpaid balance and the grace period has ended.${status.lastPaymentFailureReason ? ` Last decline: ${status.lastPaymentFailureReason}.` : ""} Update your payment method to restore access.`
        : "Your district has an unpaid balance and access has been restricted. Please contact your administrator.";
    } else {
      message = isAdmin
        ? "Your account has an unpaid balance. Access is restricted until payment is resolved."
        : "Your district has an unpaid balance. Please contact your administrator to restore access.";
    }
  } else if (isGrace) {
    const reasonClause = status.lastPaymentFailureReason
      ? ` (${status.lastPaymentFailureReason})`
      : "";
    const dayClause = graceDays !== null
      ? graceDays === 0
        ? "today"
        : `in ${graceDays} day${graceDays === 1 ? "" : "s"}`
      : "soon";
    message = isAdmin
      ? `Your last payment failed${reasonClause}. Update your payment method ${dayClause} to avoid losing access.`
      : `Your district's last payment failed. Please contact your administrator to update the payment method.`;
  } else if (isTrialEnding) {
    icon = <Clock className="h-5 w-5 text-amber-600 shrink-0" />;
    const dayClause = trialDays !== null
      ? trialDays === 0
        ? "today"
        : `in ${trialDays} day${trialDays === 1 ? "" : "s"}`
      : "soon";
    message = isAdmin
      ? `Your trial ends ${dayClause}. Your card will be charged automatically — review your plan now if you'd like to make changes.`
      : `Your district's trial ends ${dayClause}.`;
  } else {
    return null;
  }

  return (
    <div className={`px-4 py-3 flex items-center justify-between ${bgClass}`}>
      <div className="flex items-center gap-3">
        {icon}
        <p className={`text-sm ${textClass}`}>{message}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isAdmin && (
          <button
            onClick={() => navigate("/billing")}
            className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md ${buttonClass}`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            Manage Billing
          </button>
        )}
        {!isHardBlock && (
          <button onClick={() => setDismissed(true)} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
