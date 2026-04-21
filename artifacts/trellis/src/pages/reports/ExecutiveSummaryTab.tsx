import { useState } from "react";
import { useGetExecutiveSummaryReport } from "@workspace/api-client-react";
import type { GetExecutiveSummaryReportParams } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing } from "@/components/ui/progress-ring";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState, EmptyStateStep, EmptyStateHeading, EmptyStateDetail } from "@/components/ui/empty-state";
import { Printer, BarChart3, Calendar, Users } from "lucide-react";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";

function RiskRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className="font-semibold text-gray-800">{count}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function ExecutiveSummaryTab() {
  const { filterParams } = useSchoolContext();
  const { user } = useRole();
  const now = new Date();
  const [startDate, setStartDate] = useState(() => new Date(now.getFullYear(), now.getMonth() - 6, 1).toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => now.toISOString().split("T")[0]);

  const params: GetExecutiveSummaryReportParams = { preparedBy: user.name, startDate, endDate };
  if (filterParams.schoolId) params.schoolId = Number(filterParams.schoolId);
  if (filterParams.districtId) params.districtId = Number(filterParams.districtId);
  const { data, isLoading: loading, isError } = useGetExecutiveSummaryReport(params);

  function handlePrint() {
    window.print();
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>;
  if (isError || !data) return <ErrorBanner message="Failed to load executive summary." />;

  if (data.serviceDelivery.totalRequiredMinutes === 0 && data.riskCounts.onTrack === 0 && data.riskCounts.atRisk === 0 && data.riskCounts.outOfCompliance === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Executive Summary Has No Data Yet"
        action={{ label: "Go to Students", href: "/students" }}
        secondaryAction={{ label: "View Compliance Dashboard", href: "/compliance", variant: "outline" }}
      >
        <EmptyStateDetail>
          The Executive Summary gives SPED leadership a single-page overview of district compliance health — overall delivery rate, risk distribution, IEP deadline status, and service delivery breakdowns. It's designed to print cleanly for board presentations and administrative reviews.
        </EmptyStateDetail>
        <EmptyStateHeading>To populate this summary:</EmptyStateHeading>
        <EmptyStateStep number={1}>Add students with active IEPs and define their service requirements.</EmptyStateStep>
        <EmptyStateStep number={2}>Have providers log sessions against those requirements.</EmptyStateStep>
        <EmptyStateStep number={3}>Return here — the summary aggregates all compliance data automatically.</EmptyStateStep>
      </EmptyState>
    );
  }

  const sd = data.serviceDelivery;
  const rc = data.riskCounts;
  const dl = data.iepDeadlines;
  const totalTracked = rc.onTrack + rc.slightlyBehind + rc.atRisk + rc.outOfCompliance;

  return (
    <div className="space-y-6 print:space-y-4" id="executive-summary">
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">Date From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">Date To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-700" />
          </div>
          <p className="text-xs text-gray-400 self-end pb-1">Generated {new Date(data.generatedAt).toLocaleString()}{data.preparedBy ? ` by ${data.preparedBy}` : ""}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={handlePrint}>
          <Printer className="w-3.5 h-3.5" /> Print / Save as PDF
        </Button>
      </div>

      <div className="print:block hidden text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">SPED Compliance Executive Summary</h2>
        <p className="text-sm text-gray-500">Generated {new Date(data.generatedAt).toLocaleString()}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-gray-200/60">
          <CardContent className="p-5 flex flex-col items-center">
            <ProgressRing
              value={data.complianceRate}
              size={100}
              strokeWidth={10}
              label={`${data.complianceRate}%`}
              sublabel="Compliant"
              color={data.complianceRate >= 80 ? "#059669" : data.complianceRate >= 60 ? "#d97706" : "#dc2626"}
            />
            <p className="text-xs text-gray-500 mt-2">{data.totalActiveStudents} active students</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Risk Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <RiskRow label="On Track" count={rc.onTrack} total={totalTracked} color="#059669" />
            <RiskRow label="Slightly Behind" count={rc.slightlyBehind} total={totalTracked} color="#9ca3af" />
            <RiskRow label="At Risk" count={rc.atRisk} total={totalTracked} color="#dc2626" />
            <RiskRow label="Non-Compliant" count={rc.outOfCompliance} total={totalTracked} color="#991b1b" />
          </CardContent>
        </Card>

        <Card className="border-gray-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" /> Service Delivery
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Delivered</span>
              <span className="font-mono text-gray-800">{sd.totalDeliveredMinutes.toLocaleString()} min</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Required</span>
              <span className="font-mono text-gray-800">{sd.totalRequiredMinutes.toLocaleString()} min</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Overall</span>
              <span className={`font-bold ${sd.overallPercent >= 85 ? "text-emerald-600" : "text-red-600"}`}>{sd.overallPercent}%</span>
            </div>
            <div className="h-px bg-gray-100 my-1" />
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Missed Sessions</span>
              <span className="text-red-500 font-medium">{sd.totalMissedSessions}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Makeup Sessions</span>
              <span className="text-emerald-600 font-medium">{sd.totalMakeupSessions}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" /> IEP Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {dl.overdue > 0 && (
              <div className="flex justify-between text-xs">
                <span className="text-red-600 font-medium">Overdue</span>
                <span className="font-bold text-red-600">{dl.overdue}</span>
              </div>
            )}
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Next 30 days</span>
              <span className="font-medium text-gray-800">{dl.within30}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Next 60 days</span>
              <span className="font-medium text-gray-800">{dl.within60}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-600">Next 90 days</span>
              <span className="font-medium text-gray-800">{dl.within90}</span>
            </div>
            <div className="h-px bg-gray-100 my-1" />
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Open Alerts</span>
              <span className="text-gray-800 font-medium">{data.alerts.openAlerts}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Critical</span>
              <span className="text-red-600 font-medium">{data.alerts.criticalAlerts}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">Service Delivery by Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Service</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Students</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Delivered</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Required</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Complete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sd.byService.map((s, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 text-[13px] text-gray-700 font-medium">{s.serviceTypeName}</td>
                    <td className="px-4 py-2 text-[13px] text-gray-600 text-right">{s.studentCount}</td>
                    <td className="px-4 py-2 text-[13px] text-gray-600 font-mono text-right">{s.deliveredMinutes.toLocaleString()}</td>
                    <td className="px-4 py-2 text-[13px] text-gray-600 font-mono text-right">{s.requiredMinutes.toLocaleString()}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`text-[12px] font-bold ${s.percentComplete >= 85 ? "text-emerald-600" : s.percentComplete >= 70 ? "text-gray-600" : "text-red-600"}`}>
                        {s.percentComplete}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
