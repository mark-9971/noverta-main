import { useListMinuteProgress, useGetComplianceByService, useGetDashboardRiskOverview } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing, MiniProgressRing } from "@/components/ui/progress-ring";
import { useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Link } from "wouter";

const RISK_CONFIG: Record<string, { label: string; color: string; ringColor: string; bg: string }> = {
  on_track: { label: "On Track", color: "text-emerald-700", ringColor: "#10b981", bg: "bg-emerald-50 border-emerald-200" },
  slightly_behind: { label: "Slightly Behind", color: "text-amber-700", ringColor: "#f59e0b", bg: "bg-amber-50 border-amber-200" },
  at_risk: { label: "At Risk", color: "text-orange-700", ringColor: "#f97316", bg: "bg-orange-50 border-orange-200" },
  out_of_compliance: { label: "Out of Compliance", color: "text-red-700", ringColor: "#ef4444", bg: "bg-red-50 border-red-200" },
  completed: { label: "Completed", color: "text-indigo-700", ringColor: "#6366f1", bg: "bg-indigo-50 border-indigo-200" },
};

export default function Compliance() {
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const { data: progress, isLoading } = useListMinuteProgress({} as any);
  const { data: complianceByService } = useGetComplianceByService();
  const { data: riskOverview } = useGetDashboardRiskOverview();

  const progressList = (progress as any[]) ?? [];
  const serviceData = (complianceByService as any[]) ?? [];
  const ro = riskOverview as any;

  const totalReqs = progressList.length;
  const onTrackCount = progressList.filter(p => p.riskStatus === "on_track" || p.riskStatus === "completed").length;
  const onTrackPct = totalReqs > 0 ? Math.round((onTrackCount / totalReqs) * 100) : 0;

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

  const chartData = serviceData.map(d => ({
    name: d.serviceTypeName?.split(" ").slice(0, 2).join(" "),
    "On Track": d.onTrack,
    "Behind": d.slightlyBehind ?? 0,
    "At Risk": (d.atRisk ?? 0) + (d.outOfCompliance ?? 0),
  }));

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">Compliance & Risk</h1>
        <p className="text-xs md:text-sm text-slate-400 mt-1">IEP minute delivery compliance for current school year</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-3">
          <CardContent className="flex flex-col items-center py-6">
            <ProgressRing
              value={onTrackPct}
              size={130}
              strokeWidth={12}
              label={`${onTrackPct}%`}
              sublabel="On Track"
              color={onTrackPct >= 70 ? "#10b981" : onTrackPct >= 40 ? "#f59e0b" : "#ef4444"}
            />
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-5 w-full">
              {["out_of_compliance", "at_risk", "slightly_behind", "on_track"].map(s => {
                const cfg = RISK_CONFIG[s];
                return (
                  <button key={s} onClick={() => setRiskFilter(riskFilter === s ? "all" : s)}
                    className={`flex items-center gap-1.5 p-1.5 rounded transition-all ${riskFilter === s ? "bg-slate-100" : "hover:bg-slate-50"}`}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cfg.ringColor }} />
                    <span className="text-[11px] text-slate-600">{cfg.label}</span>
                    <span className="text-[11px] font-bold text-slate-800 ml-auto">{counts[s] ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-9">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-slate-600">Compliance by Service Type</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }} />
                  <Bar dataKey="On Track" fill="#10b981" radius={[2, 2, 0, 0]} stackId="a" />
                  <Bar dataKey="Behind" fill="#f59e0b" radius={[0, 0, 0, 0]} stackId="a" />
                  <Bar dataKey="At Risk" fill="#ef4444" radius={[2, 2, 0, 0]} stackId="a" />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="w-full h-[240px]" />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button aria-pressed={riskFilter === "all"} onClick={() => setRiskFilter("all")} className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all ${
          riskFilter === "all" ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200"
        }`}>All ({totalReqs})</button>
        {["out_of_compliance", "at_risk", "slightly_behind", "on_track"].map(r => {
          const cfg = RISK_CONFIG[r];
          return (
            <button key={r} aria-pressed={riskFilter === r} onClick={() => setRiskFilter(riskFilter === r ? "all" : r)} className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              riskFilter === r ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200"
            }`}>{cfg.label} ({counts[r] ?? 0})</button>
          );
        })}
      </div>

      <div className="md:hidden space-y-2">
        {isLoading ? [...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />) :
          filtered.length === 0 ? <p className="text-center text-slate-400 text-sm py-12">No requirements found</p> :
          filtered.slice(0, 100).map((p: any, i: number) => {
            const cfg = RISK_CONFIG[p.riskStatus] ?? RISK_CONFIG.on_track;
            const pct = Math.min(100, p.percentComplete ?? 0);
            return (
              <Link key={i} href={`/students/${p.studentId}`}>
                <Card className="p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{p.studentName}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{p.serviceTypeName}</p>
                    </div>
                    <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} flex-shrink-0`}>
                      {cfg.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: cfg.ringColor }} />
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">{pct}%</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{p.deliveredMinutes} / {p.requiredMinutes} min</p>
                </Card>
              </Link>
            );
          })}
      </div>

      <Card className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Student</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Service</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Progress</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Delivered</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Remaining</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? [...Array(10)].map((_, i) => (
                <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
              )) : filtered.slice(0, 100).map((p: any, i: number) => {
                const cfg = RISK_CONFIG[p.riskStatus] ?? RISK_CONFIG.on_track;
                const pct = Math.min(100, p.percentComplete ?? 0);
                return (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/students/${p.studentId}`} className="text-[13px] font-medium text-slate-800 hover:text-indigo-600">
                        {p.studentName}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-slate-500 max-w-[160px] truncate">{p.serviceTypeName}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 w-32">
                      <div className="flex items-center gap-2">
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: cfg.ringColor }} />
                        </div>
                        <span className="text-[11px] text-slate-500 w-8 text-right font-medium">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-slate-600 font-mono">{p.deliveredMinutes} / {p.requiredMinutes}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[12px] font-medium ${p.remainingMinutes > 0 ? cfg.color : "text-emerald-600"}`}>
                        {p.remainingMinutes > 0 ? `${p.remainingMinutes} min left` : "Complete"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-16 text-center text-slate-400 text-sm">No requirements found</td></tr>
              )}
            </tbody>
          </table>
          {filtered.length > 100 && (
            <p className="text-[11px] text-slate-400 text-center py-2 border-t border-slate-100">Showing first 100 of {filtered.length}</p>
          )}
        </div>
      </Card>
    </div>
  );
}
