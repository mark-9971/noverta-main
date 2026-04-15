import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { apiGet } from "@/lib/api";
import { ShieldAlert, CreditCard, Loader2 } from "lucide-react";
import { useRole } from "@/lib/role-context";
import { DEMO_MODE } from "@/lib/config";

interface BillingStatus {
  active: boolean;
  status: string;
  requiresAttention: boolean;
  code?: string;
}

const EXEMPT_PATHS = ["/billing", "/tenants"];

export function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { role } = useRole();
  const [location, navigate] = useLocation();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<BillingStatus>("/billing/status")
      .then(setStatus)
      .catch(() => setStatus({ active: true, status: "unknown", requiresAttention: false }))
      .finally(() => setLoading(false));
  }, []);

  if (DEMO_MODE) return <>{children}</>;
  if (loading) return <>{children}</>;

  const isExemptPath = EXEMPT_PATHS.some((p) => location.startsWith(p));
  if (isExemptPath) return <>{children}</>;

  const isBlocked = status && !status.active;
  if (!isBlocked) return <>{children}</>;

  const isAdmin = role === "admin";

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-6">
      <div className="bg-red-50 rounded-2xl border border-red-200 p-8 max-w-lg">
        <ShieldAlert className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-semibold text-gray-900">Subscription Required</h2>
        <p className="text-sm text-gray-600 mt-3 leading-relaxed">
          {status?.status === "canceled"
            ? "Your district's subscription has been canceled. Access to Trellis features is restricted until the subscription is reactivated."
            : "Your district's subscription has an unpaid balance. Access is restricted until payment is resolved."}
        </p>
        {isAdmin ? (
          <button
            onClick={() => navigate("/billing")}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            <CreditCard className="h-4 w-4" />
            Go to Billing
          </button>
        ) : (
          <p className="text-sm text-gray-500 mt-4">
            Please contact your district administrator to resolve this issue.
          </p>
        )}
      </div>
    </div>
  );
}
