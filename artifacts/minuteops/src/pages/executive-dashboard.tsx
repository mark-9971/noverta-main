import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing } from "@/components/ui/progress-ring";
import { Badge } from "@/components/ui/badge";
import { useSchoolContext } from "@/lib/school-context";
import { Link } from "wouter";
import {
  Users, AlertTriangle, ShieldAlert, TrendingDown,
  ArrowRight, Calendar, BarChart3, Clock
} from "lucide-react";
import { apiGet } from "@/lib/api";


interface ExecutiveData {
  complianceScore: number;
  totalStudents: number;
  riskCounts: {
    onTrack: number;
    slightlyBehind: number;
    atRisk: number;
    outOfCompliance: number;
  };
  topAtRiskStudents: {
    studentId: number;
    studentName: string;
    riskStatus: string;
    percentComplete: number;
  }[];
  openAlerts: number;
  criticalAlerts: number;
  deadlineCounts: {
    within30: number;
    within60: number;
    within90: number;
  };
}

interface CoverageData {
  byService: {
    serviceTypeId: number;
    serviceTypeName: string;
    mandatedWeeklyMinutes: number;
    scheduledWeeklyMinutes: number;
    coveragePercent: number;
    requirementCount: number;
    gap: number;
  }[];
  totalMandatedWeeklyMinutes: number;
  totalScheduledWeeklyMinutes: number;
  totalCoveragePercent: number;
  totalGap: number;
}

function riskBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    out_of_compliance: { label: "Non-Compliant", className: "bg-red-100 text-red-700 border-red-200" },
    at_risk: { label: "At Risk", className: "bg-red-50 text-red-600 border-red-100" },
    slightly_behind: { label: "Slightly Behind", className: "bg-gray-100 text-gray-600 border-gray-200" },
    on_track: { label: "On Track", className: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  };
  const info = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return <Badge variant="outline" className={`text-[11px] font-medium ${info.className}`}>{info.label}</Badge>;
}

function scoreColor(score: number): string {
  if (score >= 80) return "#059669";
  if (score >= 60) return "#d97706";
  return "#dc2626";
}

export default function ExecutiveDashboard() {
  const { filterParams } = useSchoolContext();
  const [data, setData] = useState<ExecutiveData | null>(null);
  const [coverage, setCoverage] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qs = new URLSearchParams(filterParams).toString();
    Promise.all([
      apiGet(`/api/dashboard/executive${qs ? `?${qs}` : ""}`).catch(() => null),
      apiGet(`/api/dashboard/staff-coverage${qs ? `?${qs}` : ""}`).catch(() => null),
    ]).then(([exec, cov]) => {
      setData(exec);
      setCoverage(cov);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [filterParams]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-48" /><Skeleton className="h-48" /><Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  const rc = data?.riskCounts;
  const totalTracked = rc ? rc.onTrack + rc.slightlyBehind + rc.atRisk + rc.outOfCompliance : 0;
  const byService = coverage?.byService ?? [];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Executive Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Building-wide SPED compliance overview</p>
        </div>
        <Link href="/iep-calendar" className="inline-flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium">
          <Calendar className="w-4 h-4" />
          IEP Calendar
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-gray-200/60">
          <CardContent className="p-6 flex flex-col items-center">
            <ProgressRing
              value={data?.complianceScore ?? 0}
              size={140}
              strokeWidth={12}
              label={`${data?.complianceScore ?? 0}%`}
              sublabel="Compliant"
              color={scoreColor(data?.complianceScore ?? 0)}
            />
            <p className="text-sm font-medium text-gray-700 mt-3">Overall Compliance Score</p>
            <p className="text-xs text-gray-400 mt-1">{data?.totalStudents ?? 0} active students</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Users className="w-4 h-4 text-gray-400" />
              Risk Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <RiskBar label="On Track" count={rc?.onTrack ?? 0} total={totalTracked} color="#059669" href="/students?riskStatus=on_track" />
            <RiskBar label="Slightly Behind" count={rc?.slightlyBehind ?? 0} total={totalTracked} color="#9ca3af" href="/students?riskStatus=slightly_behind" />
            <RiskBar label="At Risk" count={rc?.atRisk ?? 0} total={totalTracked} color="#dc2626" href="/students?riskStatus=at_risk" />
            <RiskBar label="Non-Compliant" count={rc?.outOfCompliance ?? 0} total={totalTracked} color="#991b1b" href="/students?riskStatus=out_of_compliance" />
          </CardContent>
        </Card>

        <Card className="border-gray-200/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-gray-400" />
              Alert Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-gray-900">{data?.openAlerts ?? 0}</p>
                <p className="text-xs text-gray-500 mt-1">Open Alerts</p>
              </div>
              <div className="bg-red-50 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-red-600">{data?.criticalAlerts ?? 0}</p>
                <p className="text-xs text-red-500 mt-1">Critical</p>
              </div>
            </div>
            <Link href="/alerts" className="mt-4 block text-center text-xs text-emerald-600 hover:text-emerald-700 font-medium">
              View All Alerts →
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-gray-200/60 col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              Upcoming IEP Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Link href="/iep-calendar" className="block">
                <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                  <span className="text-sm text-gray-600">Next 30 days</span>
                  <span className="text-lg font-bold" style={{ color: (data?.deadlineCounts?.within30 ?? 0) > 0 ? "#dc2626" : "#059669" }}>
                    {data?.deadlineCounts?.within30 ?? 0}
                  </span>
                </div>
              </Link>
              <Link href="/iep-calendar" className="block">
                <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                  <span className="text-sm text-gray-600">Next 60 days</span>
                  <span className="text-lg font-bold text-gray-800">{data?.deadlineCounts?.within60 ?? 0}</span>
                </div>
              </Link>
              <Link href="/iep-calendar" className="block">
                <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                  <span className="text-sm text-gray-600">Next 90 days</span>
                  <span className="text-lg font-bold text-gray-800">{data?.deadlineCounts?.within90 ?? 0}</span>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="border-gray-200/60 col-span-1 md:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-gray-400" />
                Staff Coverage Adequacy
              </CardTitle>
              {coverage && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Overall:</span>
                  <span className={`text-sm font-bold ${coverage.totalCoveragePercent >= 90 ? "text-emerald-600" : coverage.totalCoveragePercent >= 70 ? "text-gray-700" : "text-red-600"}`}>
                    {coverage.totalCoveragePercent}%
                  </span>
                  <span className="text-xs text-gray-400">
                    ({coverage.totalScheduledWeeklyMinutes}/{coverage.totalMandatedWeeklyMinutes} min/wk)
                  </span>
                </div>
              )}
            </div>
            {coverage && coverage.totalGap > 0 && (
              <p className="text-xs text-red-500 mt-1">Total shortfall: {coverage.totalGap} min/wk</p>
            )}
          </CardHeader>
          <CardContent>
            {byService.length > 0 ? (
              <div className="space-y-3">
                {byService.map((c) => (
                  <div key={c.serviceTypeId} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-700">{c.serviceTypeName}</span>
                      <span className="text-gray-500">
                        {c.scheduledWeeklyMinutes}/{c.mandatedWeeklyMinutes} min/wk
                        <span className={`ml-2 font-semibold ${c.coveragePercent >= 90 ? "text-emerald-600" : c.coveragePercent >= 70 ? "text-gray-600" : "text-red-600"}`}>
                          {c.coveragePercent}%
                        </span>
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, c.coveragePercent)}%`,
                          backgroundColor: c.coveragePercent >= 90 ? "#059669" : c.coveragePercent >= 70 ? "#9ca3af" : "#dc2626",
                        }}
                      />
                    </div>
                    {c.gap > 0 && (
                      <p className="text-[11px] text-red-500">{c.gap} min/wk shortfall across {c.requirementCount} requirements</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-gray-400">No service data available</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-gray-200/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-gray-400" />
            Top At-Risk Students
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data?.topAtRiskStudents && data.topAtRiskStudents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              {data.topAtRiskStudents.map((s) => (
                <Link key={s.studentId} href={`/students/${s.studentId}`}>
                  <div className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer group">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600 flex-shrink-0">
                        {s.studentName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                      </div>
                      <span className="text-sm font-medium text-gray-800 truncate">{s.studentName}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-gray-400 font-mono">{Math.round(s.percentComplete)}%</span>
                      {riskBadge(s.riskStatus)}
                      <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-emerald-500 transition-colors" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-gray-400">
              <TrendingDown className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              No at-risk students
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RiskBar({ label, count, total, color, href }: { label: string; count: number; total: number; color: string; href: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <Link href={href} className="font-semibold text-gray-800 hover:text-emerald-600 transition-colors cursor-pointer underline-offset-2 hover:underline">
          {count}
        </Link>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500`} style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}
