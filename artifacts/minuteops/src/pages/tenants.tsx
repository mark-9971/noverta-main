import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api";
import {
  Building2, Users, Crown, CheckCircle, AlertTriangle, XCircle,
  Loader2, Search
} from "lucide-react";

interface Tenant {
  districtId: number;
  districtName: string;
  state: string | null;
  planTier: string | null;
  seatLimit: number | null;
  billingCycle: string | null;
  seatsUsed: number;
  status: string | null;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  createdAt: string | null;
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    apiGet<{ tenants: Tenant[] }>("/billing/tenants")
      .then((res) => setTenants(res.tenants))
      .catch((err: { status?: number }) => {
        if (err.status === 403) setAccessDenied(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = tenants.filter((t) =>
    (t.districtName || "").toLowerCase().includes(search.toLowerCase())
  );

  const statusIcon = (status: string | null) => {
    switch (status) {
      case "active":
        return <CheckCircle className="h-4 w-4 text-emerald-600" />;
      case "trialing":
        return <Crown className="h-4 w-4 text-blue-600" />;
      case "past_due":
        return <AlertTriangle className="h-4 w-4 text-amber-600" />;
      case "canceled":
      case "unpaid":
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <span className="h-4 w-4 rounded-full bg-gray-300 inline-block" />;
    }
  };

  const statusLabel = (status: string | null) => {
    if (!status) return "No Subscription";
    return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
  };

  const tierLabels: Record<string, string> = {
    trial: "Trial",
    starter: "Starter",
    professional: "Professional",
    enterprise: "Enterprise",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <Building2 className="h-12 w-12 text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-900">Access Restricted</h2>
        <p className="text-sm text-gray-500 mt-2 max-w-md">
          Tenant Management is only available to Trellis platform administrators.
          Contact Trellis support if you believe you should have access.
        </p>
      </div>
    );
  }

  const activeCount = tenants.filter((t) => t.status === "active").length;
  const trialCount = tenants.filter((t) => t.status === "trialing" || !t.status).length;
  const atRiskCount = tenants.filter((t) => ["past_due", "canceled", "unpaid"].includes(t.status || "")).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Tenant Management</h1>
        <p className="text-sm text-gray-500 mt-1">View and manage all district subscriptions</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Tenants</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{tenants.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-semibold text-emerald-600 mt-1">{activeCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Trial / No Plan</p>
          <p className="text-2xl font-semibold text-blue-600 mt-1">{trialCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">At Risk</p>
          <p className="text-2xl font-semibold text-red-600 mt-1">{atRiskCount}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search districts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left font-medium text-gray-500">District</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Plan</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Seats</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Renewal</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((t) => (
                <tr key={t.districtId} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-gray-900">{t.districtName}</span>
                      {t.state && <span className="text-xs text-gray-400">{t.state}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {tierLabels[t.planTier || ""] || t.planTier || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {statusIcon(t.status)}
                      <span className="text-gray-700">{statusLabel(t.status)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-gray-700">
                        {t.seatsUsed} / {t.seatLimit ?? "—"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {t.currentPeriodEnd
                      ? new Date(t.currentPeriodEnd).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {t.createdAt
                      ? new Date(t.createdAt).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    {search ? "No districts match your search" : "No districts found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
