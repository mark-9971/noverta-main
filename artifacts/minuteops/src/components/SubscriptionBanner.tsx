import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiGet } from "@/lib/api";
import { AlertTriangle, ShieldAlert, CreditCard, X } from "lucide-react";
import { useRole } from "@/lib/role-context";

interface BillingStatus {
  active: boolean;
  status: string;
  requiresAttention: boolean;
  currentPeriodEnd: string | null;
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

  if (!status || dismissed) return null;

  const isCanceled = status.status === "canceled" || status.status === "unpaid";
  const isPastDue = status.status === "past_due";
  const isBlocked = isCanceled;
  const showBanner = status.requiresAttention;

  if (!showBanner) return null;

  const isAdmin = role === "admin";

  return (
    <div className={`px-4 py-3 flex items-center justify-between ${
      isCanceled ? "bg-red-50 border-b border-red-200" : "bg-amber-50 border-b border-amber-200"
    }`}>
      <div className="flex items-center gap-3">
        {isCanceled ? (
          <ShieldAlert className="h-5 w-5 text-red-600 shrink-0" />
        ) : (
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
        )}
        <p className={`text-sm ${isCanceled ? "text-red-800" : "text-amber-800"}`}>
          {isPastDue && "Your district's payment is past due. Please ask your administrator to update the payment method."}
          {status.status === "canceled" && (isAdmin
            ? "Your subscription has been canceled. Access is restricted. Please reactivate your plan below."
            : "Your district's subscription has been canceled. Please contact your administrator to restore access.")}
          {status.status === "unpaid" && (isAdmin
            ? "Your account has an unpaid balance. Access is restricted until payment is resolved."
            : "Your district has an unpaid balance. Please contact your administrator to restore access.")}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isAdmin && (
          <button
            onClick={() => navigate("/billing")}
            className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md ${
              isCanceled
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-amber-600 text-white hover:bg-amber-700"
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            Manage Billing
          </button>
        )}
        {!isBlocked && (
          <button onClick={() => setDismissed(true)} className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
