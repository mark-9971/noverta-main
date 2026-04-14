import { useState, useMemo, useEffect } from "react";
import {
  useGetStudentMinuteSummaryReport, useGetMissedSessionsReport, useGetComplianceRiskReport,
  useGetExecutiveSummaryReport, useGetComplianceTrendReport, getAuditPackageReport,
} from "@workspace/api-client-react";
import type {
  GetExecutiveSummaryReportParams, GetComplianceTrendReportParams,
  GetAuditPackageReportParams, ComplianceTrendResponse, ExecutiveSummaryResponse,
  AuditPackageResponse, SchoolTrend,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MiniProgressRing } from "@/components/ui/progress-ring";
import { ProgressRing } from "@/components/ui/progress-ring";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Link } from "wouter";
import { Download, Printer, FileText, TrendingUp, Shield, BarChart3, Calendar, Users, AlertTriangle } from "lucide-react";
import { RISK_CONFIG } from "@/lib/constants";
import { formatDate } from "@/lib/formatters";
import { toast } from "sonner";
import { useSchoolContext } from "@/lib/school-context";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

function sanitizeCell(v: string): string {
  const s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) return "'" + s;
  return s;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => `"${sanitizeCell(v).replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map(r => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${rows.length} rows to ${filename}`);
}

export default function Reports() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Reports</h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1">Compliance, service delivery, and audit reports</p>
      </div>

      <Tabs defaultValue="executive">
        <TabsList className="flex-wrap">
          <TabsTrigger value="executive" className="gap-1.5"><Shield className="w-3.5 h-3.5" /> Executive Summary</TabsTrigger>
          <TabsTrigger value="trend" className="gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> Compliance Trend</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><FileText className="w-3.5 h-3.5" /> Audit Package</TabsTrigger>
          <TabsTrigger value="minutes">Minutes</TabsTrigger>
          <TabsTrigger value="missed">Missed</TabsTrigger>
          <TabsTrigger value="risk">At-Risk</TabsTrigger>
        </TabsList>

        <TabsContent value="executive" className="mt-4"><ExecutiveSummaryTab /></TabsContent>
        <TabsContent value="trend" className="mt-4"><ComplianceTrendTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditPackageTab /></TabsContent>
        <TabsContent value="minutes" className="mt-4"><MinuteSummaryTab /></TabsContent>
        <TabsContent value="missed" className="mt-4"><MissedSessionsTab /></TabsContent>
        <TabsContent value="risk" className="mt-4"><RiskTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function ExecutiveSummaryTab() {
  const { filterParams } = useSchoolContext();
  const params: GetExecutiveSummaryReportParams = {};
  if (filterParams.schoolId) params.schoolId = Number(filterParams.schoolId);
  if (filterParams.districtId) params.districtId = Number(filterParams.districtId);
  const { data, isLoading: loading, isError } = useGetExecutiveSummaryReport(params);

  function handlePrint() {
    window.print();
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>;
  if (isError || !data) return <ErrorBanner message="Failed to load executive summary." />;

  const sd = data.serviceDelivery;
  const rc = data.riskCounts;
  const dl = data.iepDeadlines;
  const totalTracked = rc.onTrack + rc.slightlyBehind + rc.atRisk + rc.outOfCompliance;

  return (
    <div className="space-y-6 print:space-y-4" id="executive-summary">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-xs text-gray-400">Generated {new Date(data.generatedAt).toLocaleString()}</p>
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={handlePrint}>
          <Printer className="w-3.5 h-3.5" /> Print / PDF
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

function ComplianceTrendTab() {
  const { filterParams } = useSchoolContext();
  const [granularity, setGranularity] = useState<string>("monthly");
  const [selectedSchools, setSelectedSchools] = useState<Set<number>>(new Set());

  const now = new Date();
  const [startDate, setStartDate] = useState(() => new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => now.toISOString().split("T")[0]);

  const queryParams: GetComplianceTrendReportParams = { startDate, endDate, granularity: granularity as "weekly" | "monthly" };
  if (filterParams.schoolId) queryParams.schoolId = Number(filterParams.schoolId);
  if (filterParams.districtId) queryParams.districtId = Number(filterParams.districtId);

  const { data, isLoading: loading } = useGetComplianceTrendReport(queryParams);

  useEffect(() => {
    if (data?.schools && data.schools.length > 0 && selectedSchools.size === 0) {
      setSelectedSchools(new Set(data.schools.map(s => s.schoolId)));
    }
  }, [data?.schools]);

  const chartData = useMemo(() => {
    if (!data?.trend) return [];
    return data.trend.map(t => {
      const point: Record<string, string | number | null> = {
        period: t.period,
        label: formatPeriodLabel(t.period, granularity),
        overall: t.compliancePercent,
      };
      if (data.schools) {
        for (const school of data.schools) {
          if (selectedSchools.has(school.schoolId)) {
            const sp = school.trend.find(st => st.period === t.period);
            point[`school_${school.schoolId}`] = sp?.compliancePercent ?? null;
          }
        }
      }
      return point;
    });
  }, [data, selectedSchools, granularity]);

  const semesterLines = useMemo(() => {
    if (!data?.semesterMarkers || !chartData.length) return [];
    return data.semesterMarkers.map(m => {
      const closest = chartData.reduce((best, pt) => {
        const dist = Math.abs(new Date(pt.period as string).getTime() - new Date(m.date).getTime());
        return dist < best.dist ? { label: pt.label as string, dist } : best;
      }, { label: "", dist: Infinity });
      return { label: m.label, x: closest.label };
    }).filter(m => m.x);
  }, [data?.semesterMarkers, chartData]);

  const SCHOOL_COLORS = ["#059669", "#dc2626", "#6b7280", "#d97706"];

  function toggleSchool(id: number) {
    setSelectedSchools(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportTrend() {
    if (!data?.trend) return;
    downloadCsv("compliance_trend.csv",
      ["Period", "Compliance %", "Students Tracked", "Minutes Delivered"],
      data.trend.map(t => [t.period, String(t.compliancePercent), String(t.studentsTracked), String(t.totalDelivered)])
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">Granularity</label>
            <select value={granularity} onChange={e => setGranularity(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700">
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportTrend} disabled={!data?.trend?.length}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>

      {data?.schools && data.schools.length > 1 && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-400">Schools:</span>
          {data.schools.map((s, i) => (
            <button key={s.schoolId} onClick={() => toggleSchool(s.schoolId)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${selectedSchools.has(s.schoolId) ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200"}`}>
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: SCHOOL_COLORS[i % SCHOOL_COLORS.length] }} />
              {s.schoolName}
            </button>
          ))}
        </div>
      )}

      <Card className="border-gray-200/60">
        <CardContent className="p-4">
          {loading ? <Skeleton className="h-72" /> : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                  formatter={(v: number) => [`${v}%`, ""]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {semesterLines.map((m, i) => (
                  <ReferenceLine key={i} x={m.x} stroke="#d1d5db" strokeDasharray="4 4" label={{ value: m.label, position: "top", fontSize: 10, fill: "#9ca3af" }} />
                ))}
                <Line type="monotone" dataKey="overall" name="District Overall" stroke="#111827" strokeWidth={2.5} dot={{ r: 3 }} />
                {data?.schools?.filter(s => selectedSchools.has(s.schoolId)).map((s, i) => (
                  <Line
                    key={s.schoolId}
                    type="monotone"
                    dataKey={`school_${s.schoolId}`}
                    name={s.schoolName}
                    stroke={SCHOOL_COLORS[i % SCHOOL_COLORS.length]}
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                    dot={{ r: 2 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-72 flex items-center justify-center text-sm text-gray-400">No trend data available for this date range</div>
          )}
        </CardContent>
      </Card>

      {data?.trend && data.trend.length > 0 && (
        <Card className="border-gray-200/60">
          <CardContent className="p-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Period</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Compliance</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Students</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase">Minutes Delivered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.trend.map(t => (
                  <tr key={t.period}>
                    <td className="px-4 py-2 text-[13px] text-gray-700 font-medium">{formatPeriodLabel(t.period, granularity)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className={`text-[12px] font-bold ${t.compliancePercent >= 85 ? "text-emerald-600" : t.compliancePercent >= 70 ? "text-gray-600" : "text-red-600"}`}>
                        {t.compliancePercent}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[13px] text-gray-600 text-right">{t.studentsTracked}</td>
                    <td className="px-4 py-2 text-[13px] text-gray-600 font-mono text-right">{t.totalDelivered.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AuditPackageTab() {
  const { filterParams } = useSchoolContext();
  const [data, setData] = useState<AuditPackageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 6);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [expandedStudent, setExpandedStudent] = useState<number | null>(null);

  function generate() {
    const params: GetAuditPackageReportParams = { startDate, endDate };
    if (filterParams.schoolId) params.schoolId = Number(filterParams.schoolId);
    if (filterParams.districtId) params.districtId = Number(filterParams.districtId);
    setLoading(true);
    getAuditPackageReport(params)
      .then(d => setData(d as AuditPackageResponse))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }

  function exportAuditCsv() {
    if (!data?.students) return;
    const headers = ["Student", "Grade", "School", "Service", "Required (min)", "Interval",
      "Completed Sessions", "Missed Sessions", "Makeup Sessions", "Delivered (min)", "Parent Contacts"];
    const rows: string[][] = [];
    for (const s of data.students) {
      for (const req of s.serviceRequirements) {
        rows.push([
          s.studentName, s.grade ?? "", s.school ?? "", req.serviceTypeName ?? "",
          String(req.requiredMinutes), req.intervalType,
          String(s.sessionSummary.totalCompleted), String(s.sessionSummary.totalMissed),
          String(s.sessionSummary.totalMakeup), String(s.sessionSummary.deliveredMinutes),
          String(s.parentContacts.length),
        ]);
      }
      if (s.serviceRequirements.length === 0) {
        rows.push([
          s.studentName, s.grade ?? "", s.school ?? "", "None", "0", "",
          String(s.sessionSummary.totalCompleted), String(s.sessionSummary.totalMissed),
          String(s.sessionSummary.totalMakeup), String(s.sessionSummary.deliveredMinutes),
          String(s.parentContacts.length),
        ]);
      }
    }
    downloadCsv(`audit_package_${startDate}_${endDate}.csv`, headers, rows);
  }

  function exportDetailedCsv() {
    if (!data?.students) return;
    const headers = ["Student", "Date", "Service", "Duration (min)", "Status", "Missed Reason", "Makeup", "Provider", "Notes"];
    const rows: string[][] = [];
    for (const s of data.students) {
      for (const sess of s.sessions) {
        rows.push([
          s.studentName, sess.date, sess.service ?? "", String(sess.duration),
          sess.status, sess.missedReason ?? "", sess.isMakeup ? "Yes" : "No", sess.provider ?? "", sess.notes ?? "",
        ]);
      }
    }
    downloadCsv(`audit_sessions_detail_${startDate}_${endDate}.csv`, headers, rows);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">Date From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700" />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 block mb-0.5">Date To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700" />
          </div>
          <div className="pt-4">
            <Button size="sm" onClick={generate} disabled={loading} className="gap-1.5 text-[12px]"
              style={{ backgroundColor: "#059669" }}>
              {loading ? "Generating..." : "Generate Report"}
            </Button>
          </div>
        </div>
        {data?.students && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportAuditCsv}>
              <Download className="w-3.5 h-3.5" /> Summary CSV
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportDetailedCsv}>
              <Download className="w-3.5 h-3.5" /> Detailed CSV
            </Button>
          </div>
        )}
      </div>

      {data && (
        <div className="flex items-center gap-4 text-xs text-gray-400">
          <span>Generated: {new Date(data.generatedAt).toLocaleString()}</span>
          <span>Date range: {data.dateRange.start} to {data.dateRange.end}</span>
          <span>{data.students.length} students</span>
        </div>
      )}

      {data?.students && data.students.length > 0 ? (
        <Card className="border-gray-200/60">
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {data.students.map(student => (
                <div key={student.studentId}>
                  <button
                    onClick={() => setExpandedStudent(expandedStudent === student.studentId ? null : student.studentId)}
                    className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">
                        {student.studentName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-800">{student.studentName}</span>
                        <span className="text-xs text-gray-400 ml-2">Gr. {student.grade ?? "?"}</span>
                        {student.school && <span className="text-xs text-gray-400 ml-2">{student.school}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>{student.serviceRequirements.length} services</span>
                      <span className="text-emerald-600">{student.sessionSummary.totalCompleted} completed</span>
                      {student.sessionSummary.totalMissed > 0 && <span className="text-red-500">{student.sessionSummary.totalMissed} missed</span>}
                      <span>{student.sessionSummary.deliveredMinutes.toLocaleString()} min</span>
                      <span className={`transform transition-transform ${expandedStudent === student.studentId ? "rotate-180" : ""}`}>▼</span>
                    </div>
                  </button>
                  {expandedStudent === student.studentId && (
                    <div className="px-5 pb-4 bg-gray-50/50 space-y-3">
                      <div>
                        <h4 className="text-[11px] font-semibold text-gray-400 uppercase mb-1.5">Service Requirements</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {student.serviceRequirements.map((r, i) => (
                            <div key={i} className="bg-white rounded-lg border border-gray-100 p-2.5 text-xs">
                              <div className="font-medium text-gray-700">{r.serviceTypeName}</div>
                              <div className="text-gray-500 mt-0.5">{r.requiredMinutes} min/{r.intervalType} {r.provider && `· ${r.provider}`}</div>
                              <div className="text-gray-400 mt-0.5">{r.startDate} — {r.endDate ?? "ongoing"} {r.active ? "" : "(inactive)"}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {student.sessions.length > 0 && (
                        <div>
                          <h4 className="text-[11px] font-semibold text-gray-400 uppercase mb-1.5">
                            Recent Sessions ({student.sessions.length})
                          </h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-100">
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Date</th>
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Service</th>
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Duration</th>
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Status</th>
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Reason</th>
                                  <th className="text-left px-2 py-1.5 text-gray-400 font-semibold">Provider</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {student.sessions.slice(-20).map((s, i) => (
                                  <tr key={i}>
                                    <td className="px-2 py-1.5 text-gray-600">{s.date}</td>
                                    <td className="px-2 py-1.5 text-gray-600">{s.service}</td>
                                    <td className="px-2 py-1.5 text-gray-600">{s.duration} min</td>
                                    <td className="px-2 py-1.5">
                                      <span className={s.status === "missed" ? "text-red-500 font-medium" : s.isMakeup ? "text-emerald-600" : "text-gray-600"}>
                                        {s.status}{s.isMakeup ? " (makeup)" : ""}
                                      </span>
                                    </td>
                                    <td className="px-2 py-1.5 text-gray-500">{s.status === "missed" ? (s.missedReason ?? "—") : "—"}</td>
                                    <td className="px-2 py-1.5 text-gray-500">{s.provider ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {student.parentContacts.length > 0 && (
                        <div>
                          <h4 className="text-[11px] font-semibold text-gray-400 uppercase mb-1.5">
                            Parent Contacts ({student.parentContacts.length})
                          </h4>
                          <div className="space-y-1.5">
                            {student.parentContacts.map((c, i) => (
                              <div key={i} className="bg-white rounded-lg border border-gray-100 p-2.5 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-600 font-medium">{c.date}</span>
                                  <span className="text-gray-400">{c.method}</span>
                                  <span className="text-gray-700 font-medium">{c.subject}</span>
                                </div>
                                {c.outcome && <div className="text-gray-500 mt-0.5">Outcome: {c.outcome}</div>}
                                {c.parentName && <div className="text-gray-400 mt-0.5">Parent: {c.parentName}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : data && (
        <div className="py-12 text-center text-sm text-gray-400">No students found for the selected filters</div>
      )}

      {!data && !loading && (
        <div className="py-16 text-center">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-sm text-gray-500">Select a date range and click Generate Report</p>
          <p className="text-xs text-gray-400 mt-1">This report includes per-student service requirements, sessions, and parent contacts</p>
        </div>
      )}
    </div>
  );
}

function MinuteSummaryTab() {
  const { data: minuteSummary, isLoading: loadingMinutes, isError: errMinutes, refetch: refetchMinutes } = useGetStudentMinuteSummaryReport();
  const minuteList = Array.isArray(minuteSummary) ? minuteSummary : [];

  function exportMinutes() {
    downloadCsv("minute_summary.csv",
      ["Student", "Service", "Delivered (min)", "Required (min)", "% Complete", "Status"],
      minuteList.map(r => [r.studentName, r.serviceTypeName, String(r.deliveredMinutes), String(r.requiredMinutes), String(Math.round(r.percentComplete ?? 0)), r.riskStatus])
    );
  }

  return (
    <Card>
      {errMinutes ? <ErrorBanner message="Failed to load minute summary." onRetry={() => refetchMinutes()} /> : <>
      <div className="flex items-center justify-end px-5 pt-3">
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportMinutes} disabled={minuteList.length === 0}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Student</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Delivered</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Required</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Progress</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loadingMinutes ? [...Array(10)].map((_, i) => (
              <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
            )) : minuteList.slice(0, 200).map((row, i) => {
              const cfg = RISK_CONFIG[row.riskStatus] ?? RISK_CONFIG.on_track;
              const pct = Math.min(100, row.percentComplete ?? 0);
              return (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/students/${row.studentId}`} className="text-[13px] font-medium text-gray-800 hover:text-emerald-700">
                      {row.studentName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-gray-500 max-w-[160px] truncate">{row.serviceTypeName}</td>
                  <td className="px-5 py-3 text-[13px] text-gray-600 font-mono">{row.deliveredMinutes}</td>
                  <td className="px-5 py-3 text-[13px] text-gray-600 font-mono">{row.requiredMinutes}</td>
                  <td className="px-5 py-3 w-28">
                    <div className="flex items-center gap-2">
                      <MiniProgressRing value={pct} size={24} strokeWidth={2.5} color={cfg.ringColor} />
                      <span className="text-[12px] font-bold text-gray-700">{pct}%</span>
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
      </>}
    </Card>
  );
}

function MissedSessionsTab() {
  const { data: missedSessions, isLoading: loadingMissed, isError: errMissed, refetch: refetchMissed } = useGetMissedSessionsReport();
  const missedList = Array.isArray(missedSessions) ? missedSessions : [];

  function exportMissed() {
    downloadCsv("missed_sessions.csv",
      ["Student", "Service", "Date", "Reason", "Staff"],
      missedList.map(r => [r.studentName ?? "", r.serviceTypeName ?? "", r.sessionDate ?? "", r.missedReason ?? "—", r.staffName ?? "—"])
    );
  }

  return (
    <Card>
      {errMissed ? <ErrorBanner message="Failed to load missed sessions." onRetry={() => refetchMissed()} /> : <>
      <div className="flex items-center justify-end px-5 pt-3">
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportMissed} disabled={missedList.length === 0}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Student</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Provider</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Duration</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Makeup</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loadingMissed ? [...Array(10)].map((_, i) => (
              <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
            )) : missedList.slice(0, 200).map((s, i) => (
              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-5 py-3 text-[13px] text-gray-600 whitespace-nowrap">{formatDate(s.sessionDate)}</td>
                <td className="px-5 py-3">
                  <Link href={`/students/${s.studentId}`} className="text-[13px] font-medium text-gray-800 hover:text-emerald-700">
                    {s.studentName ?? `Student ${s.studentId}`}
                  </Link>
                </td>
                <td className="px-5 py-3 text-[13px] text-gray-500 max-w-[140px] truncate">{s.serviceTypeName ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-gray-500">{s.staffName ?? "—"}</td>
                <td className="px-5 py-3 text-[13px] text-gray-600">{s.durationMinutes ?? "—"} min</td>
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
      </>}
    </Card>
  );
}

function RiskTab() {
  const { data: complianceRisk, isLoading: loadingRisk, isError: errRisk, refetch: refetchRisk } = useGetComplianceRiskReport();
  const riskList = Array.isArray(complianceRisk) ? complianceRisk : [];

  function exportRisk() {
    downloadCsv("at_risk_students.csv",
      ["Student", "Service", "Risk Status", "Delivered", "Required", "% Complete"],
      riskList.map(r => [r.studentName, r.serviceTypeName, r.riskStatus, String(r.deliveredMinutes), String(r.requiredMinutes), String(Math.round(r.percentComplete ?? 0))])
    );
  }

  return (
    <Card>
      {errRisk ? <ErrorBanner message="Failed to load compliance risk data." onRetry={() => refetchRisk()} /> : <>
      <div className="flex items-center justify-end px-5 pt-3">
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportRisk} disabled={riskList.length === 0}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Student</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Risk Level</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Delivered</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Progress</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Behind</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loadingRisk ? [...Array(10)].map((_, i) => (
              <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
            )) : riskList.slice(0, 200).map((r, i) => {
              const cfg = RISK_CONFIG[r.riskStatus] ?? RISK_CONFIG.on_track;
              const pct = Math.min(100, r.percentComplete ?? 0);
              return (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/students/${r.studentId}`} className="text-[13px] font-medium text-gray-800 hover:text-emerald-700">
                      {r.studentName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-gray-500 max-w-[140px] truncate">{r.serviceTypeName}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-gray-600 font-mono">{r.deliveredMinutes} / {r.requiredMinutes}</td>
                  <td className="px-5 py-3 w-28">
                    <div className="flex items-center gap-2">
                      <MiniProgressRing value={pct} size={24} strokeWidth={2.5} color={cfg.ringColor} />
                      <span className="text-[12px] font-bold text-gray-700">{pct}%</span>
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
      </>}
    </Card>
  );
}

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

function formatPeriodLabel(period: string, granularity: string): string {
  if (granularity === "monthly") {
    const [y, m] = period.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[parseInt(m) - 1]} ${y}`;
  }
  const d = new Date(period + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
