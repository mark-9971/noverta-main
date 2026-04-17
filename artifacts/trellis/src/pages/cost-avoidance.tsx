import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, AlertTriangle, TrendingDown, TrendingUp, Shield, Clock,
  ChevronDown, ChevronRight, ExternalLink, Bell, FileSearch,
  CalendarDays, Activity, Users, CalendarX, UserMinus, Minus
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, LineChart, Line, ReferenceLine } from "recharts";
import { Link } from "wouter";
import { toast } from "sonner";

type UrgencyLevel = "critical" | "high" | "medium" | "watch";

interface RiskItem {
  id: string;
  category: "evaluation_deadline" | "service_shortfall" | "iep_annual_review";
  urgency: UrgencyLevel;
  studentId: number;
  studentName: string;
  staffId: number | null;
  staffName: string | null;
  title: string;
  description: string;
  daysRemaining: number;
  // Null when the risk has no priced dollar exposure (either non-financial like
  // evaluation/IEP deadlines, or service shortfalls whose service type has no
  // configured hourly rate). The non-dollar reason is in exposureBasis.
  estimatedExposure: number | null;
  exposureBasis: string;
  actionNeeded: string;
  serviceTypeName?: string;
  eventType?: string;
}

interface RiskSummary {
  totalExposure: number;
  totalRisks: number;
  studentsAtRisk: number;
  byUrgency: Record<UrgencyLevel, { count: number; exposure: number }>;
  byCategory: Record<string, { count: number; exposure: number }>;
}

const URGENCY_CONFIG: Record<UrgencyLevel, { label: string; color: string; bg: string; border: string; dot: string }> = {
  critical: { label: "Critical", color: "text-red-700", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500" },
  high: { label: "High", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" },
  medium: { label: "Medium", color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200", dot: "bg-orange-400" },
  watch: { label: "Watch", color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", dot: "bg-blue-400" },
};

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  evaluation_deadline: { label: "Evaluation Deadlines", icon: FileSearch },
  service_shortfall: { label: "Service Shortfalls", icon: Clock },
  iep_annual_review: { label: "IEP Annual Reviews", icon: CalendarDays },
};

const CATEGORY_COLORS: Record<string, string> = {
  evaluation_deadline: "#ef4444",
  service_shortfall: "#f59e0b",
  iep_annual_review: "#6366f1",
};

interface Snapshot {
  id: number;
  districtId: number;
  weekStart: string;
  totalRisks: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  watchCount: number;
  totalExposure: number;
  studentsAtRisk: number;
  unpricedRiskCount: number;
  capturedAt: string;
}

function formatDollars(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(amount >= 10000 ? 0 : 1)}k`;
  return `$${amount.toLocaleString()}`;
}

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart);
  return `${d.toLocaleString("default", { month: "short" })} ${d.getDate()}`;
}

function WeekOverWeekBadge({ current, previous }: { current: number; previous: number | undefined }) {
  if (previous == null) return null;
  const diff = current - previous;
  const pct = previous > 0 ? Math.round((Math.abs(diff) / previous) * 100) : 0;
  if (diff === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
        <Minus className="w-3 h-3" /> Unchanged vs last week
      </span>
    );
  }
  const improved = diff < 0;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${improved ? "text-emerald-700 bg-emerald-50" : "text-red-700 bg-red-50"}`}>
      {improved ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
      {improved ? "↓" : "↑"}{pct}% vs last week
    </span>
  );
}

function ExposureTrendChart({ snapshots }: { snapshots: Snapshot[] }) {
  if (snapshots.length < 2) {
    return (
      <Card className="border-gray-200/60">
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-400" />
            Exposure Trend — last 12 weeks
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex flex-col items-center justify-center h-[180px] text-center">
            <Activity className="w-8 h-8 text-gray-200 mb-2" />
            <p className="text-xs text-gray-400">
              Trend data builds over time.<br />
              Snapshots are captured weekly — check back next week.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const data = snapshots.map(s => ({
    week: formatWeekLabel(s.weekStart),
    exposure: s.totalExposure,
    risks: s.totalRisks,
    critical: s.criticalCount,
  }));

  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
          <Activity className="w-4 h-4 text-indigo-400" />
          Exposure Trend — last 12 weeks
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 10, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
              width={48}
            />
            <Tooltip
              contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
              formatter={(value: number, name: string) => {
                if (name === "exposure") return [`$${value.toLocaleString()}`, "Exposure"];
                if (name === "risks") return [value, "Total Risks"];
                return [value, name];
              }}
            />
            <Line
              type="monotone"
              dataKey="exposure"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ fill: "#6366f1", r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2 px-1 justify-between text-[11px] text-gray-500">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 bg-indigo-500 rounded" />
            <span>Financial exposure ($)</span>
          </div>
          <span className="text-gray-400">
            {data.length} weekly snapshot{data.length !== 1 ? "s" : ""}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function RisksOverTimeMiniChart({ snapshots }: { snapshots: Snapshot[] }) {
  if (snapshots.length < 2) return null;

  const data = snapshots.map(s => ({
    week: formatWeekLabel(s.weekStart),
    critical: s.criticalCount,
    high: s.highCount,
    medium: s.mediumCount,
    watch: s.watchCount,
  }));

  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold text-gray-600">Risk Count Trend</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={14}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} width={24} />
            <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
            <Bar dataKey="critical" stackId="a" fill="#ef4444" name="Critical" radius={[0, 0, 0, 0]} />
            <Bar dataKey="high" stackId="a" fill="#f59e0b" name="High" />
            <Bar dataKey="medium" stackId="a" fill="#fb923c" name="Medium" />
            <Bar dataKey="watch" stackId="a" fill="#60a5fa" name="Watch" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2 justify-center flex-wrap">
          {[
            { key: "critical", color: "#ef4444", label: "Critical" },
            { key: "high", color: "#f59e0b", label: "High" },
            { key: "medium", color: "#fb923c", label: "Medium" },
            { key: "watch", color: "#60a5fa", label: "Watch" },
          ].map(d => (
            <div key={d.key} className="flex items-center gap-1.5 text-[11px]">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: d.color }} />
              <span className="text-gray-500">{d.label}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ExposureBanner({ summary, previousSnapshot }: { summary: RiskSummary; previousSnapshot?: Snapshot }) {
  const urgencyItems = [
    { key: "critical" as UrgencyLevel, ...summary.byUrgency.critical },
    { key: "high" as UrgencyLevel, ...summary.byUrgency.high },
    { key: "medium" as UrgencyLevel, ...summary.byUrgency.medium },
    { key: "watch" as UrgencyLevel, ...summary.byUrgency.watch },
  ].filter(u => u.count > 0);

  return (
    <Card className="border-red-200/60 bg-gradient-to-r from-red-50/60 via-white to-amber-50/40">
      <CardContent className="py-5 px-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider font-semibold text-gray-400 mb-1">
              Total Financial Exposure If No Action Taken
            </p>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-3xl md:text-4xl font-bold text-gray-900">
                ${summary.totalExposure.toLocaleString()}
              </span>
              <span className="text-sm text-gray-500">
                across {summary.studentsAtRisk} students
              </span>
              <WeekOverWeekBadge
                current={summary.totalExposure}
                previous={previousSnapshot?.totalExposure}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {urgencyItems.map(u => {
              const cfg = URGENCY_CONFIG[u.key];
              return (
                <div key={u.key} className={`${cfg.bg} ${cfg.border} border rounded-lg px-3 py-2`}>
                  <div className={`text-[10px] uppercase tracking-wide font-semibold ${cfg.color}`}>{cfg.label}</div>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-lg font-bold text-gray-900">{u.count}</span>
                    <span className="text-[11px] text-gray-500">{formatDollars(u.exposure)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryBreakdownChart({ summary }: { summary: RiskSummary }) {
  const data = Object.entries(summary.byCategory)
    .filter(([, v]) => v.count > 0)
    .map(([key, v]) => ({
      name: CATEGORY_LABELS[key]?.label || key,
      exposure: v.exposure,
      count: v.count,
      fill: CATEGORY_COLORS[key] || "#94a3b8",
    }));

  if (data.length === 0) return null;

  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold text-gray-600">Exposure by Category</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} axisLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6b7280" }} width={140} axisLine={false} tickLine={false} />
            <Tooltip formatter={(value: number) => [`$${value.toLocaleString()}`, "Exposure"]} contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
            <Bar dataKey="exposure" radius={[0, 4, 4, 0]} barSize={28}>
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-3 justify-center">
          {data.map(d => (
            <div key={d.name} className="flex items-center gap-2 text-[11px]">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
              <span className="text-gray-500">{d.name}</span>
              <span className="font-semibold text-gray-700">{d.count}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function UrgencyDistributionChart({ summary }: { summary: RiskSummary }) {
  const data = (["critical", "high", "medium", "watch"] as UrgencyLevel[])
    .filter(k => summary.byUrgency[k].count > 0)
    .map(k => ({
      name: URGENCY_CONFIG[k].label,
      value: summary.byUrgency[k].count,
      fill: k === "critical" ? "#ef4444" : k === "high" ? "#f59e0b" : k === "medium" ? "#fb923c" : "#60a5fa",
    }));

  if (data.length === 0) return null;

  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold text-gray-600">Risk Distribution</CardTitle>
      </CardHeader>
      <CardContent className="pt-2 flex flex-col items-center">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={data} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={3}>
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number, name: string) => [value, name]} contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 flex-wrap justify-center">
          {data.map(d => (
            <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
              <span className="text-gray-600">{d.name}: <span className="font-bold">{d.value}</span></span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RiskGroupSection({ urgency, risks }: { urgency: UrgencyLevel; risks: RiskItem[] }) {
  const [open, setOpen] = useState(urgency === "critical" || urgency === "high");
  const cfg = URGENCY_CONFIG[urgency];
  const totalExposure = risks.reduce((s, r) => s + (r.estimatedExposure ?? 0), 0);
  const unpricedCount = risks.filter(r => r.estimatedExposure == null).length;

  return (
    <div className={`rounded-xl border ${cfg.border} overflow-hidden`}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-3 px-4 py-3 ${cfg.bg} text-left transition-colors hover:opacity-90`}
      >
        <div className={`w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
        <span className={`text-sm font-semibold ${cfg.color} flex-1`}>
          {cfg.label} — {risks.length} risk{risks.length !== 1 ? "s" : ""}
        </span>
        <span className="text-sm font-bold text-gray-700">
          ${totalExposure.toLocaleString()}
          {unpricedCount > 0 && (
            <span className="ml-2 text-[11px] font-medium text-amber-700">
              + {unpricedCount} unpriced
            </span>
          )}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="divide-y divide-gray-100">
          {risks.map(risk => (
            <RiskRow key={risk.id} risk={risk} />
          ))}
        </div>
      )}
    </div>
  );
}

function RiskRow({ risk }: { risk: RiskItem }) {
  const catConfig = CATEGORY_LABELS[risk.category];
  const CatIcon = catConfig?.icon || AlertTriangle;

  return (
    <div className="px-4 py-3 hover:bg-gray-50/50 transition-colors">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          <CatIcon className="w-4 h-4 text-gray-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <h4 className="text-[13px] font-semibold text-gray-800 truncate">{risk.title}</h4>
              <p className="text-[12px] text-gray-500 mt-0.5 line-clamp-2">{risk.description}</p>
            </div>
            <div className="text-right flex-shrink-0 max-w-[180px]">
              {risk.estimatedExposure != null ? (
                <>
                  <span className="text-sm font-bold text-gray-900">${risk.estimatedExposure.toLocaleString()}</span>
                  <p className="text-[10px] text-gray-400 mt-0.5">est. exposure</p>
                </>
              ) : (
                <>
                  <span className="text-[11px] font-semibold text-amber-700">Not priced</span>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                    {risk.exposureBasis || "non-financial risk"}
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <Link href={`/students/${risk.studentId}`}>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full cursor-pointer hover:bg-emerald-100 transition-colors">
                <ExternalLink className="w-3 h-3" />
                {risk.studentName}
              </span>
            </Link>
            <span className="text-[11px] text-gray-400 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {risk.daysRemaining < 0 ? `${Math.abs(risk.daysRemaining)}d overdue` : `${risk.daysRemaining}d remaining`}
            </span>
            {risk.serviceTypeName && (
              <span className="text-[11px] text-gray-400">{risk.serviceTypeName}</span>
            )}
          </div>
          <div className="mt-2 text-[11px] text-gray-500 bg-gray-50 rounded-md px-3 py-1.5">
            <span className="font-medium text-gray-600">Action: </span>{risk.actionNeeded}
          </div>
        </div>
      </div>
    </div>
  );
}

type ForecastStatus = "on_track" | "slightly_behind" | "at_risk" | "out_of_compliance";

interface AbsenceImpact {
  date: string;
  staffId: number;
  staffName: string | null;
  blockId: number;
  blockMinutes: number;
  absenceType: string;
  isCovered: boolean;
  substituteStaffId: number | null;
  substituteStaffName: string | null;
}
interface ForecastRow {
  serviceRequirementId: number;
  studentId: number;
  studentName: string;
  serviceTypeName: string;
  providerId: number | null;
  providerName: string | null;
  intervalType: string;
  intervalEnd: string;
  horizonEnd: string;
  requiredMinutes: number;
  deliveredMinutes: number;
  plannedRemainingMinutes: number;
  plannedLostMinutes: number;
  projectedMinutes: number;
  projectedShortfallMinutes: number;
  projectedPercent: number;
  forecastRiskStatus: ForecastStatus;
  absenceImpacts: AbsenceImpact[];
}
interface ForecastSummary {
  totalRows: number;
  studentsAtRisk: number;
  totalProjectedShortfallMinutes: number;
  byStatus: Record<ForecastStatus, number>;
  topImpactedStaff: Array<{ staffId: number; staffName: string | null; lostMinutes: number; affectedStudents: number }>;
}
interface ForecastResp {
  rows: ForecastRow[];
  summary: ForecastSummary;
  generatedAt: string;
  horizonWeeks: number;
}

const FORECAST_STATUS_CONFIG: Record<ForecastStatus, { label: string; color: string; bg: string; border: string }> = {
  on_track: { label: "On track", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
  slightly_behind: { label: "Slightly behind", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200" },
  at_risk: { label: "At risk", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" },
  out_of_compliance: { label: "Will miss", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
};

function ForecastSection() {
  const [horizonWeeks, setHorizonWeeks] = useState(4);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const { data, isLoading, isError } = useQuery<ForecastResp>({
    queryKey: ["service-forecast", horizonWeeks],
    queryFn: () => authFetch(`/api/service-forecast?horizonWeeks=${horizonWeeks}`).then(r => {
      if (!r.ok) throw new Error("Failed to load forecast");
      return r.json();
    }),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card className="border-amber-200/60">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarX className="w-4 h-4 text-amber-500" /> Forecast — next {horizonWeeks} weeks</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }
  if (isError || !data) {
    return null;
  }

  const atRiskRows = data.rows.filter(r => r.forecastRiskStatus === "at_risk" || r.forecastRiskStatus === "out_of_compliance");
  const lostHours = (data.summary.totalProjectedShortfallMinutes / 60).toFixed(1);

  return (
    <Card className="border-amber-200/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarX className="w-4 h-4 text-amber-500" />
              Forecast — next {horizonWeeks} weeks
            </CardTitle>
            <p className="text-[11px] text-gray-400 mt-1">
              Projected delivery based on planned schedule blocks minus uncovered staff absences. Updated {new Date(data.generatedAt).toLocaleString()}.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {[2, 4, 8].map(w => (
              <button
                key={w}
                onClick={() => setHorizonWeeks(w)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${horizonWeeks === w ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
              >{w}w</button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="rounded-lg border border-gray-200/60 bg-white p-3">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">Students projected to miss</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{data.summary.studentsAtRisk}</p>
          </div>
          <div className="rounded-lg border border-gray-200/60 bg-white p-3">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">Projected lost minutes</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{lostHours}h</p>
          </div>
          <div className="rounded-lg border border-gray-200/60 bg-white p-3">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">Service requirements tracked</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{data.summary.totalRows}</p>
          </div>
          <div className="rounded-lg border border-gray-200/60 bg-white p-3">
            <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400">"Will miss" rows</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{data.summary.byStatus.out_of_compliance}</p>
          </div>
        </div>

        {data.summary.topImpactedStaff.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-200/60 bg-amber-50/30 p-3">
            <p className="text-[11px] uppercase tracking-wide font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
              <UserMinus className="w-3.5 h-3.5" /> Coverage gaps driving the forecast
            </p>
            <div className="space-y-1.5">
              {data.summary.topImpactedStaff.slice(0, 5).map(s => (
                <div key={s.staffId} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">{s.staffName ?? `Staff #${s.staffId}`}</span>
                  <span className="text-gray-500">
                    <span className="font-semibold text-amber-700">{(s.lostMinutes / 60).toFixed(1)}h</span> uncovered · {s.affectedStudents} student{s.affectedStudents === 1 ? "" : "s"}
                    <Link href={`/staff-calendar?staffId=${s.staffId}`}>
                      <a className="ml-2 text-emerald-600 hover:text-emerald-700 font-medium">Assign sub →</a>
                    </Link>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {atRiskRows.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-400">
            No forecast risks in the next {horizonWeeks} weeks. All scheduled coverage is intact.
          </div>
        ) : (
          <div className="space-y-1.5">
            {atRiskRows.slice(0, 20).map(row => {
              const cfg = FORECAST_STATUS_CONFIG[row.forecastRiskStatus];
              const isOpen = expanded[row.serviceRequirementId];
              const uncovered = row.absenceImpacts.filter(i => !i.isCovered);
              return (
                <div key={row.serviceRequirementId} className={`rounded-md border ${cfg.border} ${cfg.bg}`}>
                  <button
                    onClick={() => setExpanded(p => ({ ...p, [row.serviceRequirementId]: !p[row.serviceRequirementId] }))}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/40 transition-colors"
                  >
                    {isOpen ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
                    <span className={`text-[10px] uppercase tracking-wide font-semibold ${cfg.color} px-1.5 py-0.5 rounded ${cfg.bg} border ${cfg.border}`}>{cfg.label}</span>
                    <span className="text-xs font-semibold text-gray-800 truncate">{row.studentName}</span>
                    <span className="text-[11px] text-gray-500 truncate">· {row.serviceTypeName}</span>
                    <span className="ml-auto text-[11px] text-gray-600">
                      <span className="font-semibold">{row.projectedPercent}%</span> projected · short {(row.projectedShortfallMinutes / 60).toFixed(1)}h
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-3 text-[11px] text-gray-600 space-y-2 border-t border-white/60">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
                        <div><span className="text-gray-400">Required</span><div className="font-semibold text-gray-800">{row.requiredMinutes}m / {row.intervalType}</div></div>
                        <div><span className="text-gray-400">Delivered</span><div className="font-semibold text-gray-800">{row.deliveredMinutes}m</div></div>
                        <div><span className="text-gray-400">Planned remaining</span><div className="font-semibold text-emerald-700">+{row.plannedRemainingMinutes}m</div></div>
                        <div><span className="text-gray-400">Planned lost</span><div className="font-semibold text-red-700">−{row.plannedLostMinutes}m</div></div>
                      </div>
                      {uncovered.length > 0 && (
                        <div className="pt-1">
                          <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-400 mb-1">Uncovered absences</p>
                          <div className="space-y-1">
                            {uncovered.map((imp, idx) => (
                              <div key={idx} className="flex items-center justify-between bg-white/60 rounded px-2 py-1">
                                <span>{imp.date} · {imp.staffName ?? `Staff #${imp.staffId}`} ({imp.absenceType}) · {imp.blockMinutes}m</span>
                                <Link href={`/staff-calendar?staffId=${imp.staffId}&date=${imp.date}`}>
                                  <a className="text-emerald-600 hover:text-emerald-700 font-medium">Find sub →</a>
                                </Link>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="pt-1">
                        <Link href={`/students/${row.studentId}`}>
                          <a className="text-emerald-600 hover:text-emerald-700 font-medium inline-flex items-center gap-1">
                            View student <ExternalLink className="w-3 h-3" />
                          </a>
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {atRiskRows.length > 20 && (
              <p className="text-[11px] text-gray-400 text-center pt-2">
                Showing top 20 of {atRiskRows.length} forecast risks
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CostAvoidanceDashboard() {
  const queryClient = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const { data, isLoading, isError } = useQuery<{ risks: RiskItem[]; summary: RiskSummary }>({
    queryKey: ["cost-avoidance-risks"],
    queryFn: () => authFetch("/api/cost-avoidance/risks").then(r => {
      if (!r.ok) throw new Error("Failed to load risks");
      return r.json();
    }),
    staleTime: 60_000,
  });

  const { data: snapshotData } = useQuery<{ snapshots: Snapshot[] }>({
    queryKey: ["cost-avoidance-snapshots"],
    queryFn: () => authFetch("/api/cost-avoidance/snapshots?weeks=12").then(r => {
      if (!r.ok) throw new Error("Failed to load snapshots");
      return r.json();
    }),
    staleTime: 5 * 60_000,
  });

  const alertMutation = useMutation({
    mutationFn: () => authFetch("/api/cost-avoidance/generate-alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }).then(r => r.json()),
    onSuccess: (d) => {
      const msg = `Created ${d.created} alerts (${d.skipped} duplicates skipped)`;
      if (d.created > 0) {
        toast.success(msg);
      } else {
        toast.info(msg, { description: "No new risks above threshold — existing alerts are already in place." });
      }
      queryClient.invalidateQueries({ queryKey: ["cost-avoidance-risks"] });
    },
    onError: () => toast.error("Failed to generate alerts"),
  });

  const risks = data?.risks ?? [];
  const summary = data?.summary ?? null;
  const snapshots = snapshotData?.snapshots ?? [];
  const previousSnapshot = snapshots.length >= 2 ? snapshots[snapshots.length - 2] : undefined;

  const filteredRisks = useMemo(() => {
    if (!categoryFilter) return risks;
    return risks.filter(r => r.category === categoryFilter);
  }, [risks, categoryFilter]);

  const groupedByUrgency = useMemo(() => {
    const groups: Record<UrgencyLevel, RiskItem[]> = { critical: [], high: [], medium: [], watch: [] };
    for (const r of filteredRisks) {
      groups[r.urgency].push(r);
    }
    return groups;
  }, [filteredRisks]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !summary) {
    return (
      <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto">
        <Card className="border-red-200 bg-red-50/30">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-sm text-red-700 font-medium">Failed to load risk data</p>
            <p className="text-xs text-red-500 mt-1">Please try refreshing the page</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <TrendingDown className="w-6 h-6 text-red-500" />
            Cost Avoidance Dashboard
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Predicted compliance risks with estimated financial exposure
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => alertMutation.mutate()}
          disabled={alertMutation.isPending}
          className="h-8 text-xs"
        >
          <Bell className="w-3.5 h-3.5 mr-1.5" />
          {alertMutation.isPending ? "Sending..." : "Send Risk Alerts"}
        </Button>
      </div>

      <ExposureBanner summary={summary} previousSnapshot={previousSnapshot} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ExposureTrendChart snapshots={snapshots} />
        <RisksOverTimeMiniChart snapshots={snapshots} />
      </div>

      <ForecastSection />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-gray-200/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 font-medium">Total Exposure</p>
                <p className="text-xl font-bold text-gray-900">${summary.totalExposure.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-200/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 font-medium">Total Risks</p>
                <p className="text-xl font-bold text-gray-900">{summary.totalRisks}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-200/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 font-medium">Students at Risk</p>
                <p className="text-xl font-bold text-gray-900">{summary.studentsAtRisk}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-gray-200/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <Shield className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 font-medium">Critical Risks</p>
                <p className="text-xl font-bold text-gray-900">{summary.byUrgency.critical.count}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategoryBreakdownChart summary={summary} />
        <UrgencyDistributionChart summary={summary} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 mr-1">Filter:</span>
        {[
          { key: "", label: "All Risks" },
          { key: "evaluation_deadline", label: "Evaluations" },
          { key: "service_shortfall", label: "Service Shortfalls" },
          { key: "iep_annual_review", label: "IEP Reviews" },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setCategoryFilter(f.key)}
            className={`px-3 py-1.5 text-[11px] font-medium rounded-full transition-colors ${
              categoryFilter === f.key
                ? "bg-emerald-100 text-emerald-700"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="text-[11px] text-gray-400 ml-auto">{filteredRisks.length} risk items</span>
      </div>

      <div className="space-y-4">
        {(["critical", "high", "medium", "watch"] as UrgencyLevel[]).map(u => {
          const items = groupedByUrgency[u];
          if (items.length === 0) return null;
          return <RiskGroupSection key={u} urgency={u} risks={items} />;
        })}

        {filteredRisks.length === 0 && (
          <Card className="border-gray-200/60">
            <CardContent className="py-12 text-center">
              <Shield className="w-10 h-10 text-emerald-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-600">No compliance risks detected</p>
              <p className="text-xs text-gray-400 mt-1">All evaluations, services, and IEP reviews are on track</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
