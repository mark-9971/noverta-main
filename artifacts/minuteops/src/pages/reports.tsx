import { useGetStudentMinuteSummaryReport, useGetMissedSessionsReport, useGetComplianceRiskReport } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MiniProgressRing } from "@/components/ui/progress-ring";
import { Link } from "wouter";
import { RISK_CONFIG } from "@/lib/constants";
import { formatDate } from "@/lib/formatters";

export default function Reports() {
  const { data: minuteSummary, isLoading: loadingMinutes } = useGetStudentMinuteSummaryReport({} as any);
  const { data: missedSessions, isLoading: loadingMissed } = useGetMissedSessionsReport({} as any);
  const { data: complianceRisk, isLoading: loadingRisk } = useGetComplianceRiskReport();

  const minuteList = (minuteSummary as any[]) ?? [];
  const missedList = (missedSessions as any[]) ?? [];
  const riskList = (complianceRisk as any[]) ?? [];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">Reports</h1>
        <p className="text-xs md:text-sm text-slate-400 mt-1">Compliance and service delivery reports for IEP year 2025–2026</p>
      </div>

      <Tabs defaultValue="minutes">
        <TabsList>
          <TabsTrigger value="minutes">Minute Summary ({minuteList.length})</TabsTrigger>
          <TabsTrigger value="missed">Missed Sessions ({missedList.length})</TabsTrigger>
          <TabsTrigger value="risk">At-Risk ({riskList.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="minutes" className="mt-4">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Student</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Service</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Delivered</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Required</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Progress</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loadingMinutes ? [...Array(10)].map((_, i) => (
                    <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                  )) : minuteList.slice(0, 200).map((row: any, i: number) => {
                    const cfg = RISK_CONFIG[row.riskStatus] ?? RISK_CONFIG.on_track;
                    const pct = Math.min(100, row.percentComplete ?? 0);
                    return (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3">
                          <Link href={`/students/${row.studentId}`} className="text-[13px] font-medium text-slate-800 hover:text-indigo-600">
                            {row.studentName}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-[13px] text-slate-500 max-w-[160px] truncate">{row.serviceTypeName}</td>
                        <td className="px-5 py-3 text-[13px] text-slate-600 font-mono">{row.deliveredMinutes}</td>
                        <td className="px-5 py-3 text-[13px] text-slate-600 font-mono">{row.requiredMinutes}</td>
                        <td className="px-5 py-3 w-28">
                          <div className="flex items-center gap-2">
                            <MiniProgressRing value={pct} size={24} strokeWidth={2.5} color={cfg.ringColor} />
                            <span className="text-[12px] font-bold text-slate-700">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="missed" className="mt-4">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Student</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Service</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Provider</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Duration</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Makeup</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loadingMissed ? [...Array(10)].map((_, i) => (
                    <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                  )) : missedList.slice(0, 200).map((s: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 text-[13px] text-slate-600 whitespace-nowrap">{formatDate(s.sessionDate)}</td>
                      <td className="px-5 py-3">
                        <Link href={`/students/${s.studentId}`} className="text-[13px] font-medium text-slate-800 hover:text-indigo-600">
                          {s.studentName ?? `Student ${s.studentId}`}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-[13px] text-slate-500 max-w-[140px] truncate">{s.serviceTypeName ?? "—"}</td>
                      <td className="px-5 py-3 text-[13px] text-slate-500">{s.staffName ?? "—"}</td>
                      <td className="px-5 py-3 text-[13px] text-slate-600">{s.durationMinutes ?? "—"} min</td>
                      <td className="px-5 py-3">
                        {s.isMakeup
                          ? <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">Made Up</span>
                          : <span className="text-[11px] font-medium text-red-500">Needed</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="risk" className="mt-4">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Student</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Service</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Risk Level</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Delivered</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Progress</th>
                    <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Behind</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {loadingRisk ? [...Array(10)].map((_, i) => (
                    <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                  )) : riskList.slice(0, 200).map((r: any, i: number) => {
                    const cfg = RISK_CONFIG[r.riskStatus] ?? RISK_CONFIG.on_track;
                    const pct = Math.min(100, r.percentComplete ?? 0);
                    return (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3">
                          <Link href={`/students/${r.studentId}`} className="text-[13px] font-medium text-slate-800 hover:text-indigo-600">
                            {r.studentName}
                          </Link>
                        </td>
                        <td className="px-5 py-3 text-[13px] text-slate-500 max-w-[140px] truncate">{r.serviceTypeName}</td>
                        <td className="px-5 py-3">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-[13px] text-slate-600 font-mono">{r.deliveredMinutes} / {r.requiredMinutes}</td>
                        <td className="px-5 py-3 w-28">
                          <div className="flex items-center gap-2">
                            <MiniProgressRing value={pct} size={24} strokeWidth={2.5} color={cfg.ringColor} />
                            <span className="text-[12px] font-bold text-slate-700">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          <span className="text-[12px] font-medium text-red-600">{r.remainingMinutes} min</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
