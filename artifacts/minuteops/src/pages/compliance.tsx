import { useListMinuteProgress, useGetComplianceByService } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { AlertTriangle, CheckCircle, TrendingDown } from "lucide-react";

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string; barColor: string }> = {
  on_track: { label: "On Track", color: "text-green-700", bg: "bg-green-50 border-green-200", barColor: "#10b981" },
  slightly_behind: { label: "Slightly Behind", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200", barColor: "#f59e0b" },
  at_risk: { label: "At Risk", color: "text-orange-700", bg: "bg-orange-50 border-orange-200", barColor: "#f97316" },
  out_of_compliance: { label: "Out of Compliance", color: "text-red-700", bg: "bg-red-50 border-red-200", barColor: "#ef4444" },
  completed: { label: "Completed", color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200", barColor: "#6366f1" },
};

export default function Compliance() {
  const [riskFilter, setRiskFilter] = useState<string>("out_of_compliance");
  const { data: progress, isLoading } = useListMinuteProgress({} as any);
  const { data: complianceByService } = useGetComplianceByService();

  const progressList = (progress as any[]) ?? [];
  const serviceData = (complianceByService as any[]) ?? [];

  const filtered = progressList.filter(p =>
    riskFilter === "all" || p.riskStatus === riskFilter
  ).sort((a, b) => {
    const order = ["out_of_compliance", "at_risk", "slightly_behind", "on_track", "completed"];
    return order.indexOf(a.riskStatus) - order.indexOf(b.riskStatus);
  });

  const counts = progressList.reduce((acc: any, p: any) => {
    acc[p.riskStatus] = (acc[p.riskStatus] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Compliance & Risk</h1>
        <p className="text-sm text-slate-500 mt-0.5">IEP minute delivery compliance for current school year</p>
      </div>

      {/* Risk summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {["out_of_compliance", "at_risk", "slightly_behind", "on_track", "completed"].map(status => {
          const cfg = RISK_CONFIG[status];
          return (
            <button
              key={status}
              onClick={() => setRiskFilter(riskFilter === status ? "all" : status)}
              className={`p-3 rounded-lg border text-left transition-all ${
                riskFilter === status ? `${cfg.bg} shadow-sm` : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <p className={`text-[10px] font-bold uppercase tracking-wide ${cfg.color}`}>{cfg.label}</p>
              <p className={`text-2xl font-bold mt-0.5 ${cfg.color}`}>{counts[status] ?? 0}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">requirements</p>
            </button>
          );
        })}
      </div>

      {/* Compliance by service chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-slate-700">Compliance Rate by Service Type</CardTitle>
        </CardHeader>
        <CardContent>
          {serviceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={serviceData.map(d => ({
                name: d.serviceTypeName?.replace("/", "/ ")?.split(" ").slice(0, 2).join(" "),
                onTrack: d.onTrack,
                atRisk: d.atRisk + d.outOfCompliance,
                total: d.totalRequirements,
              }))} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="onTrack" name="On Track" fill="#10b981" radius={[2, 2, 0, 0]} stackId="a" />
                <Bar dataKey="atRisk" name="At Risk/OOC" fill="#ef4444" radius={[2, 2, 0, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Skeleton className="w-full h-48" />
          )}
        </CardContent>
      </Card>

      {/* Detail table */}
      <Card>
        <CardHeader className="pb-2 flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-700">
            {riskFilter !== "all" ? RISK_CONFIG[riskFilter]?.label : "All"} Requirements ({filtered.length})
          </CardTitle>
          <button
            onClick={() => setRiskFilter("all")}
            className="text-xs text-slate-400 hover:text-slate-600"
          >Clear filter</button>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Service</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Progress</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Delivered / Required</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? [...Array(10)].map((_, i) => (
                <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
              )) : filtered.slice(0, 100).map((p: any, i: number) => {
                const cfg = RISK_CONFIG[p.riskStatus] ?? RISK_CONFIG.on_track;
                return (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{p.studentName}</td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs max-w-[140px] truncate">{p.serviceTypeName}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <Progress value={Math.min(100, p.percentComplete)} className="h-1.5 flex-1" />
                        <span className="text-xs text-slate-500 w-8 text-right">{p.percentComplete}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs font-mono">
                      {p.deliveredMinutes} / {p.requiredMinutes} min
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium ${p.remainingMinutes > 0 ? cfg.color : "text-green-600"}`}>
                        {p.remainingMinutes > 0 ? `${p.remainingMinutes} min left` : "Complete"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">No requirements found for this filter</td>
                </tr>
              )}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <p className="text-xs text-slate-400 text-center py-2">Showing first 100 of {filtered.length} results</p>
          )}
        </div>
      </Card>
    </div>
  );
}
