import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DollarSign, CheckCircle, XCircle, AlertTriangle, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export function RevenueDashboardTab() {
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));

  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);

  const { data, isLoading } = useQuery({
    queryKey: ["medicaid-revenue", dateFrom, dateTo],
    queryFn: () => authFetch(`/api/medicaid/revenue-summary?${params}`).then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });

  const summary = data?.summary ?? {};
  const byService = data?.byService ?? [];
  const byMonth = data?.byMonth ?? [];
  const quality = data?.dataQuality ?? {};

  const fmt = (v: string) => parseFloat(v || "0").toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Honesty note: every dollar figure here is the *prepared* claim amount
  // (units × rate from CPT mappings). Noverta does not file claims with
  // Medicaid and never receives an adjudication or remittance, so we cannot
  // and do not display actual reimbursement, payment, or revenue. "Approved"
  // = an admin clicked Approve in this tool; "Exported" = the CSV was
  // downloaded for upload elsewhere.
  const kpis = [
    { label: "Prepared (Estimated Value)", value: `$${fmt(summary.totalBilled)}`, icon: DollarSign, accent: "emerald", sub: `${summary.totalClaims || 0} draft claims` },
    { label: "Pending Internal Review", value: `$${fmt(summary.pendingAmount)}`, icon: Clock, accent: "amber", sub: `${summary.pendingCount || 0} drafts` },
    { label: "Internally Approved / Exported", value: `$${(parseFloat(summary.approvedAmount || "0") + parseFloat(summary.exportedAmount || "0")).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: CheckCircle, accent: "emerald", sub: `${(summary.approvedCount || 0) + (summary.exportedCount || 0)} drafts` },
    { label: "Internally Rejected", value: `$${fmt(summary.rejectedAmount)}`, icon: XCircle, accent: "red", sub: `${summary.rejectedCount || 0} drafts` },
  ];

  const accents: Record<string, string> = { emerald: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600", red: "bg-red-50 text-red-500" };

  return (
    <div className="space-y-6">
      <div className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-3">
        <b>Estimated values, not booked revenue.</b> All amounts below are calculated from CPT/HCPCS mappings × units on
        Noverta-prepared claim drafts. Noverta does not file claims, does not receive Medicaid adjudication or
        remittance, and cannot show actual reimbursement. Use this to forecast and to prioritize internal review,
        not to recognize revenue.
      </div>

      <div className="flex items-center gap-3">
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-8 text-xs" />
        <span className="text-xs text-gray-400">to</span>
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 h-8 text-xs" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <Card key={k.label} className="border-gray-200/60">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accents[k.accent]}`}>
                  <k.icon className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] text-gray-500 font-medium">{k.label}</p>
                  <p className="text-lg font-bold text-gray-900">{isLoading ? "..." : k.value}</p>
                  <p className="text-[10px] text-gray-400">{k.sub}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {(quality.missingMedicaidId > 0 || quality.missingNpi > 0) && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardContent className="py-3 px-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-medium text-amber-800">Data Quality Issues</span>
            </div>
            <div className="mt-2 flex gap-4 text-[12px]">
              {quality.missingMedicaidId > 0 && (
                <span className="text-amber-700">{quality.missingMedicaidId} students missing Medicaid ID</span>
              )}
              {quality.missingNpi > 0 && (
                <span className="text-amber-700">{quality.missingNpi} providers missing NPI number</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-gray-200/60">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-gray-600">Prepared Claim Value by Month (estimated)</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {byMonth.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={byMonth} margin={{ top: 5, right: 10, left: -5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => [`$${parseFloat(String(v)).toLocaleString(undefined, { minimumFractionDigits: 2 })}`, ""]} />
                  <Bar dataKey="totalBilled" name="Prepared (estimated)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={28} />
                  <Bar dataKey="approvedAmount" name="Internally Approved" fill="#059669" radius={[4, 4, 0, 0]} barSize={28} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-gray-400 py-8 text-center">No billing data yet</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-gray-200/60">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-gray-600">Prepared Claim Value by Service Type (estimated)</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {byService.length > 0 ? byService.map((svc: any) => {
              const total = parseFloat(svc.totalBilled);
              const approved = parseFloat(svc.approvedAmount);
              const pct = total > 0 ? Math.round((approved / total) * 100) : 0;
              return (
                <div key={svc.serviceTypeId} className="space-y-1">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[13px] font-medium text-gray-800">{svc.serviceTypeName}</span>
                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-gray-500">{svc.claimCount} claims</span>
                      <span className="font-medium text-gray-700">${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            }) : (
              <p className="text-sm text-gray-400 py-8 text-center">No service data yet</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
