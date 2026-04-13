import { useGetStudentMinuteSummaryReport, useGetMissedSessionsReport, useGetComplianceRiskReport } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { BarChart3, Download } from "lucide-react";

const RISK_COLORS: Record<string, string> = {
  on_track: "bg-green-100 text-green-700",
  slightly_behind: "bg-yellow-100 text-yellow-700",
  at_risk: "bg-orange-100 text-orange-700",
  out_of_compliance: "bg-red-100 text-red-700",
  completed: "bg-indigo-100 text-indigo-700",
};

export default function Reports() {
  const { data: minuteSummary, isLoading: loadingMinutes } = useGetStudentMinuteSummaryReport({} as any);
  const { data: missedSessions, isLoading: loadingMissed } = useGetMissedSessionsReport({} as any);
  const { data: complianceRisk, isLoading: loadingRisk } = useGetComplianceRiskReport();

  const minuteList = (minuteSummary as any[]) ?? [];
  const missedList = (missedSessions as any[]) ?? [];
  const riskList = (complianceRisk as any[]) ?? [];

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">Compliance and service delivery reports for IEP year 2025–2026</p>
        </div>
      </div>

      <Tabs defaultValue="minutes">
        <TabsList>
          <TabsTrigger value="minutes">Minute Summary</TabsTrigger>
          <TabsTrigger value="missed">Missed Sessions</TabsTrigger>
          <TabsTrigger value="risk">At-Risk Students</TabsTrigger>
        </TabsList>

        <TabsContent value="minutes" className="mt-4">
          <Card>
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-700">Student Minute Summary Report ({minuteList.length} records)</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Service</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Delivered</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Required</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">% Complete</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingMinutes ? [...Array(10)].map((_, i) => (
                    <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                  )) : minuteList.slice(0, 200).map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{row.studentName}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs max-w-[160px] truncate">{row.serviceTypeName}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs font-mono">{row.deliveredMinutes} min</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs font-mono">{row.requiredMinutes} min</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-bold ${row.percentComplete >= 80 ? "text-green-600" : row.percentComplete >= 60 ? "text-yellow-600" : "text-red-600"}`}>
                          {row.percentComplete}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge className={`text-[10px] ${RISK_COLORS[row.riskStatus] ?? "bg-slate-100 text-slate-600"}`}>
                          {row.riskStatus?.replace(/_/g, " ")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="missed" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Missed Sessions Report ({missedList.length} sessions)</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Service</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Provider</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Duration</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Makeup?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingMissed ? [...Array(10)].map((_, i) => (
                    <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                  )) : missedList.slice(0, 200).map((s: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">{s.sessionDate}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-800">{s.studentName ?? `Student ${s.studentId}`}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs max-w-[140px] truncate">{s.serviceTypeName ?? "—"}</td>
                      <td className="px-4 py-2.5 text-slate-500 text-xs">{s.staffName ?? "—"}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs">{s.durationMinutes ?? "—"} min</td>
                      <td className="px-4 py-2.5">
                        {s.isMakeup
                          ? <Badge className="bg-green-100 text-green-700 text-[10px]">Yes</Badge>
                          : <span className="text-red-400 text-xs font-medium">Needed</span>}
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
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Compliance Risk Report ({riskList.length} at-risk requirements)</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Service</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Risk Level</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Delivered / Required</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">% Complete</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Minutes Behind</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingRisk ? [...Array(10)].map((_, i) => (
                    <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                  )) : riskList.slice(0, 200).map((r: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-800">{r.studentName}</td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs max-w-[140px] truncate">{r.serviceTypeName}</td>
                      <td className="px-4 py-2.5">
                        <Badge className={`text-[10px] ${RISK_COLORS[r.riskStatus] ?? "bg-slate-100 text-slate-600"}`}>
                          {r.riskStatus?.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 text-xs font-mono">{r.deliveredMinutes} / {r.requiredMinutes}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-bold ${r.percentComplete >= 80 ? "text-yellow-600" : "text-red-600"}`}>
                          {r.percentComplete}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-medium text-red-600">{r.remainingMinutes} min</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
