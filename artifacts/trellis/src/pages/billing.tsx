import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { apiGet, apiPost } from "@/lib/api";
import {
  CreditCard, Building2, Users, Calendar, ExternalLink,
  CheckCircle, AlertTriangle, XCircle, Loader2, Crown, LogIn
} from "lucide-react";

interface BillingMode {
  mode: "paid" | "trial" | "unpaid" | "unconfigured" | "error";
  status: string;
}

interface Subscription {
  id: number;
  districtId: number;
  districtName: string;
  planTier: string;
  seatLimit: number;
  seatsUsed: number;
  status: string;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd: string;
}

interface Plan {
  id: string;
  name: string;
  description: string;
  metadata: Record<string, string>;
  prices: Array<{
    id: string;
    unitAmount: number;
    currency: string;
    recurring: { interval: string } | null;
  }>;
}

export default function BillingPage() {
  const { isLoaded: clerkLoaded, isSignedIn } = useUser();
  if (clerkLoaded && !isSignedIn) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-emerald-100 mx-auto flex items-center justify-center mb-4">
            <LogIn className="w-5 h-5 text-emerald-700" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Sign in to view billing</h1>
          <p className="text-sm text-gray-500 mt-2">
            Your district's plan, seat usage, and Stripe billing portal live behind sign-in.
          </p>
          <a
            href="/sign-in?redirect_url=/billing"
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
          >
            Sign in
          </a>
        </div>
      </div>
    );
  }
  if (!clerkLoaded) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }
  return <BillingPageInner />;
}

function BillingPageInner() {
  const [location] = useLocation();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [billingMode, setBillingMode] = useState<BillingMode | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");

  const params = new URLSearchParams(location.split("?")[1] || "");
  const showSuccess = params.get("success") === "true";
  const showCanceled = params.get("canceled") === "true";
  const requestedPlan = params.get("plan");
  const checkoutSessionId = params.get("session_id");
  const [autoCheckoutAttempted, setAutoCheckoutAttempted] = useState(false);
  const [endingTrial, setEndingTrial] = useState(false);

  useEffect(() => {
    // When the visitor returns from a successful Stripe Checkout we force a
    // server-side reconciliation BEFORE rendering, so the tier/status reflect
    // the new subscription immediately rather than waiting for the webhook.
    (async () => {
      if (showSuccess) {
        try {
          await apiPost("/billing/sync-subscription", checkoutSessionId ? { sessionId: checkoutSessionId } : {});
        } catch { /* webhook may not have run yet — ignore */ }
      }
      await loadData();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the visitor arrives from /pricing with ?plan=<tier>, auto-launch Stripe
  // Checkout for the matching monthly price as soon as plans are loaded. This
  // closes the loop between the marketing pricing page and self-serve checkout.
  useEffect(() => {
    if (autoCheckoutAttempted) return;
    if (loading || !requestedPlan || plans.length === 0) return;
    if (subscription?.stripeSubscriptionId) return; // already paying
    const plan = plans.find((p) => {
      const meta = typeof p.metadata === "string" ? JSON.parse(p.metadata) : p.metadata;
      return meta?.tier === requestedPlan;
    });
    const monthly = plan?.prices.find((pr) => pr.recurring?.interval === "month");
    if (monthly) {
      setAutoCheckoutAttempted(true);
      handleCheckout(monthly.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, plans, requestedPlan, subscription?.stripeSubscriptionId]);

  async function loadData() {
    try {
      const [subRes, plansRes, modeRes] = await Promise.all([
        apiGet<{ subscription: Subscription }>("/billing/subscription").catch(() => ({ subscription: null })),
        apiGet<{ plans: Plan[] }>("/billing/plans").catch(() => ({ plans: [] })),
        apiGet<BillingMode>("/billing/status").catch(() => null),
      ]);
      setSubscription((subRes as any)?.subscription ?? null);
      setPlans(Array.isArray((plansRes as any)?.plans) ? (plansRes as any).plans : []);
      setBillingMode(modeRes);
    } catch (err) {
      console.error("Failed to load billing data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckout(priceId: string) {
    setCheckoutLoading(priceId);
    try {
      const res = await apiPost<{ url: string }>("/billing/checkout", { priceId });
      if (res.url) window.location.href = res.url;
    } catch (err) {
      console.error("Checkout error:", err);
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const res = await apiPost<{ url: string }>("/billing/portal");
      if (res.url) window.location.href = res.url;
    } catch (err) {
      console.error("Portal error:", err);
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleSync() {
    try {
      await apiPost("/billing/sync-subscription");
      await loadData();
    } catch (err) {
      console.error("Sync error:", err);
    }
  }

  // Single-click upgrade from the trial banner: ends the Stripe trial right
  // now so the customer is billed today using the card they already put on
  // file at checkout. No portal round-trip required.
  async function handleEndTrial() {
    if (!confirm("End your free trial now and start your paid subscription? Your card on file will be charged today.")) return;
    setEndingTrial(true);
    try {
      await apiPost("/billing/end-trial");
      await apiPost("/billing/sync-subscription").catch(() => {});
      await loadData();
    } catch (err) {
      console.error("End trial error:", err);
      alert("Could not end the trial. Please try again or use the billing portal.");
    } finally {
      setEndingTrial(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const statusConfig: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
    active: { icon: CheckCircle, color: "text-emerald-600", label: "Active" },
    trialing: { icon: Crown, color: "text-blue-600", label: "Trial" },
    past_due: { icon: AlertTriangle, color: "text-amber-600", label: "Past Due" },
    canceled: { icon: XCircle, color: "text-red-600", label: "Canceled" },
    unpaid: { icon: XCircle, color: "text-red-600", label: "Unpaid" },
    incomplete: { icon: AlertTriangle, color: "text-amber-600", label: "Incomplete" },
  };

  const currentStatus = statusConfig[subscription?.status || "trialing"] || statusConfig.trialing;
  const StatusIcon = currentStatus.icon;
  const seatPct = subscription ? Math.round((subscription.seatsUsed / subscription.seatLimit) * 100) : 0;
  const isActiveSubscription = ["active", "trialing"].includes(subscription?.status || "");
  const needsUpgrade = !subscription?.stripeSubscriptionId && subscription?.status === "trialing";

  const tierLabels: Record<string, string> = {
    trial: "Trial",
    essentials: "Essentials",
    starter: "Essentials", // legacy seed value
    professional: "Professional",
    enterprise: "Enterprise",
  };

  // Days remaining on the Stripe-managed free trial. We compute from
  // currentPeriodEnd because Stripe treats the trial end as the period end
  // until the first invoice posts.
  const trialDaysRemaining = (() => {
    if (subscription?.status !== "trialing" || !subscription.currentPeriodEnd) return null;
    const ms = new Date(subscription.currentPeriodEnd).getTime() - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  })();

  return (
    <div className="space-y-6">
      {showSuccess && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 flex items-center gap-3">
          <CheckCircle className="h-5 w-5 text-emerald-600" />
          <p className="text-sm text-emerald-800">Subscription activated successfully! Your account is now upgraded.</p>
        </div>
      )}
      {trialDaysRemaining !== null && billingMode?.mode === "trial" && (
        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 flex items-start gap-3">
          <Crown className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="flex-1 text-sm text-blue-900">
            <p className="font-medium">
              {trialDaysRemaining > 0
                ? `${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"} left in your free trial`
                : "Your free trial ends today"}
            </p>
            <p className="text-blue-800 mt-0.5">
              Your card will be charged automatically when the trial ends. Cancel anytime from the billing portal.
            </p>
          </div>
          {subscription?.stripeSubscriptionId && (
            <button
              onClick={handleEndTrial}
              disabled={endingTrial}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {endingTrial ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upgrade now"}
            </button>
          )}
          {subscription?.stripeCustomerId && (
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              Manage
            </button>
          )}
        </div>
      )}
      {showCanceled && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600" />
          <p className="text-sm text-amber-800">Checkout was canceled. You can try again anytime.</p>
        </div>
      )}

      {billingMode?.mode === "unconfigured" && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">No subscription on file</p>
            <p className="text-amber-800 mt-0.5">
              Choose a plan below to activate your district. Your administrator will be billed via Stripe.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Billing & Subscription</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your district's plan, seats, and payment method</p>
        </div>
        {subscription?.stripeSubscriptionId && (
          <button onClick={handleSync} className="text-sm text-gray-500 hover:text-gray-700">
            Sync with Stripe
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Current Plan</span>
            <Crown className="h-4 w-4 text-gray-400" />
          </div>
          <p className="text-xl font-semibold text-gray-900">
            {tierLabels[subscription?.planTier || "trial"] || subscription?.planTier}
          </p>
          <div className="flex items-center gap-1.5 mt-2">
            <StatusIcon className={`h-4 w-4 ${currentStatus.color}`} />
            <span className={`text-sm font-medium ${currentStatus.color}`}>{currentStatus.label}</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Staff Seats</span>
            <Users className="h-4 w-4 text-gray-400" />
          </div>
          <p className="text-xl font-semibold text-gray-900">
            {subscription?.seatsUsed ?? 0} / {subscription?.seatLimit ?? 10}
          </p>
          <div className="mt-2">
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  seatPct >= 90 ? "bg-red-500" : seatPct >= 75 ? "bg-amber-500" : "bg-emerald-500"
                }`}
                style={{ width: `${Math.min(seatPct, 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Next Billing Date</span>
            <Calendar className="h-4 w-4 text-gray-400" />
          </div>
          <p className="text-xl font-semibold text-gray-900">
            {subscription?.currentPeriodEnd
              ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
              : "—"}
          </p>
          {subscription?.cancelAtPeriodEnd === "true" && (
            <p className="text-xs text-amber-600 mt-2">Cancels at period end</p>
          )}
        </div>
      </div>

      {subscription?.stripeCustomerId && (
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Payment & Invoices</h3>
              <p className="text-sm text-gray-500 mt-1">
                Update payment method, view invoices, or manage your subscription through the Stripe billing portal.
              </p>
            </div>
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {portalLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Billing Portal
            </button>
          </div>
        </div>
      )}

      {(needsUpgrade || !isActiveSubscription) && plans.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              {needsUpgrade ? "Choose a Plan" : "Upgrade Your Plan"}
            </h2>
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
              <button
                onClick={() => setBillingInterval("month")}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  billingInterval === "month" ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingInterval("year")}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  billingInterval === "year" ? "bg-gray-900 text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Yearly
                <span className="ml-1 text-xs text-emerald-600 font-medium">Save ~17%</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const price = plan.prices.find(
                (p) => p.recurring && p.recurring.interval === billingInterval
              );
              if (!price) return null;

              const metadata = typeof plan.metadata === "string" ? JSON.parse(plan.metadata) : plan.metadata;
              const seats = metadata?.seatLimit || "?";
              const isPopular = metadata?.tier === "professional";

              return (
                <div
                  key={plan.id}
                  className={`relative bg-white rounded-lg border p-6 ${
                    isPopular ? "border-emerald-300 ring-1 ring-emerald-300" : "border-gray-200"
                  }`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs px-3 py-1 rounded-full font-medium">
                      Most Popular
                    </div>
                  )}
                  <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">{plan.description}</p>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-gray-900">
                      ${(price.unitAmount / 100).toFixed(0)}
                    </span>
                    <span className="text-gray-500 text-sm">/{billingInterval === "month" ? "mo" : "yr"}</span>
                  </div>
                  <ul className="mt-4 space-y-2 text-sm text-gray-600">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      {Number(seats) >= 9999 ? "Unlimited" : `Up to ${seats}`} staff seats
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      Full compliance tracking
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      IEP management & reporting
                    </li>
                  </ul>
                  <button
                    onClick={() => handleCheckout(price.id)}
                    disabled={!!checkoutLoading}
                    className={`mt-6 w-full rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
                      isPopular
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-gray-900 text-white hover:bg-gray-800"
                    } disabled:opacity-50`}
                  >
                    {checkoutLoading === price.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                    ) : (
                      "Subscribe"
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {plans.length === 0 && needsUpgrade && (
        <div className="bg-blue-50 rounded-lg border border-blue-200 p-6 text-center">
          <CreditCard className="h-8 w-8 text-blue-500 mx-auto mb-3" />
          <h3 className="font-medium text-blue-900">Plans Coming Soon</h3>
          <p className="text-sm text-blue-700 mt-1">
            Subscription plans are being configured. Your trial access continues in the meantime.
          </p>
        </div>
      )}

      {(subscription?.status === "canceled" || subscription?.status === "unpaid") && (
        <div className="bg-red-50 rounded-lg border border-red-200 p-6">
          <div className="flex items-center gap-3">
            <XCircle className="h-6 w-6 text-red-600" />
            <div>
              <h3 className="font-medium text-red-900">Subscription {subscription.status === "canceled" ? "Canceled" : "Unpaid"}</h3>
              <p className="text-sm text-red-700 mt-1">
                {subscription.status === "canceled"
                  ? "Your subscription has been canceled. Choose a plan below to reactivate."
                  : "Your payment is overdue. Please update your payment method to continue using Noverta."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
