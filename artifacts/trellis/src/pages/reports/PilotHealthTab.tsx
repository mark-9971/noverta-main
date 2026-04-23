import { useGetPilotHealthReport } from "@workspace/api-client-react";
import type { PilotHealthMetric } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { downloadCsv } from "./utils";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Users,
  Clock,
  FileCheck,
  BookOpen,
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  Printer,
} from "lucide-react";
import { ResponsiveContainer, LineChart, Line, YAxis, Tooltip } from "recharts";

const METRIC_ICONS: Record<string, React.ReactNode> = {
  iepRosterCoverage: <BookOpen className="w-4 h-4" />,
  serviceLoggingAdoption: <FileCheck className="w-4 h-4" />,
  incidentReportingTimeliness: <Clock className="w-4 h-4" />,
  annualReviewVisibility: <AlertTriangle className="w-4 h-4" />,
  staffEngagement: <Users className="w-4 h-4" />,
};

type MetricKey =
  | "iepRosterCoverage"
  | "serviceLoggingAdoption"
  | "incidentReportingTimeliness"
  | "annualReviewVisibility"
  | "staffEngagement";

function StatusIcon({ onTrack }: { onTrack: boolean }) {
  return onTrack ? (
    <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
  ) : (
    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
  );
}

function TrendBadge({ trendValue, previousValue, unit }: {
  trendValue: string | null | undefined;
  previousValue: number | null | undefined;
  unit: string;
}) {
  if (!trendValue || trendValue === "flat" || previousValue == null) {
    if (trendValue === "flat" && previousValue != null) {
      return (
        <span className="flex items-center gap-0.5 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
          <Minus className="w-2.5 h-2.5" />
          No change from prior period
        </span>
      );
    }
    return null;
  }

  const isUp = trendValue === "up";
  const prevDisplay = previousValue !== null
    ? unit === "percent" ? `${previousValue}% prior` : `${previousValue} prior`
    : null;

  return (
    <span className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full ${
      isUp
        ? "bg-emerald-50 text-emerald-600"
        : "bg-red-50 text-red-600"
    }`}>
      {isUp
        ? <TrendingUp className="w-2.5 h-2.5" />
        : <TrendingDown className="w-2.5 h-2.5" />
      }
      {isUp ? "Improving" : "Declining"}{prevDisplay ? ` (was ${prevDisplay})` : " vs prior period"}
    </span>
  );
}

function MetricBar({ value, target, unit }: { value: number; target: number; unit: string }) {
  if (unit !== "percent") return null;
  const pct = Math.min(value, 100);
  const targetPct = Math.min(target, 100);
  const color = value >= target ? "#059669" : value >= target * 0.8 ? "#d97706" : "#dc2626";
  return (
    <div className="mt-3 space-y-1">
      <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-gray-400 opacity-60"
          style={{ left: `${targetPct}%` }}
          title={`Target: ${target}%`}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-400">
        <span>0%</span>
        <span className="text-gray-500">Target: {target}%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function MetricDetail({ metricKey, metric }: { metricKey: MetricKey; metric: PilotHealthMetric }) {
  const detail = metric.detail as Record<string, number> | undefined;
  if (!detail) return null;

  switch (metricKey) {
    case "iepRosterCoverage":
      return (
        <p className="text-[11px] text-gray-400 mt-1">
          {detail.studentsWithIep} of {detail.totalStudents} active students have an IEP (proxy — official district roster not in Noverta)
        </p>
      );
    case "serviceLoggingAdoption":
      return (
        <p className="text-[11px] text-gray-400 mt-1">
          {detail.timelyLogs} timely logs out of {detail.expectedSessions} expected sessions (last 30 days)
          {detail.previousExpectedSessions > 0 && ` · ${detail.previousTimelyLogs} / ${detail.previousExpectedSessions} prior period`}
        </p>
      );
    case "incidentReportingTimeliness":
      return (
        <p className="text-[11px] text-gray-400 mt-1">
          {detail.totalIncidents === 0
            ? "No incidents in the last 30 days"
            : `${detail.timelyIncidents} of ${detail.totalIncidents} incidents on time (last 30 days)`}
          {detail.previousTotalIncidents > 0 && ` · ${detail.previousTimelyIncidents} of ${detail.previousTotalIncidents} prior period`}
        </p>
      );
    case "annualReviewVisibility":
      return (
        <p className="text-[11px] text-gray-400 mt-1">
          {detail.overdueIeps} overdue IEP{detail.overdueIeps !== 1 ? "s" : ""} total
          {detail.unacknowledgedOverdue > 0
            ? ` · ${detail.unacknowledgedOverdue} without a resolved 30-day advance alert`
            : " · all had resolved 30-day advance alerts"}
        </p>
      );
    case "staffEngagement":
      return (
        <p className="text-[11px] text-gray-400 mt-1">
          {detail.engagedStaff} of {detail.totalActiveStaff} staff averaging {detail.minWeeklyAvg}+ sessions/week over {detail.pilotWeeks}-week pilot
        </p>
      );
    default:
      return null;
  }
}

function Sparkline({ history, unit, target, lowerIsBetter }: {
  history: { periodEnd: string; value: number }[];
  unit: string;
  target: number;
  lowerIsBetter: boolean;
}) {
  if (!history || history.length < 2) return null;
  const values = history.map(h => h.value);
  const min = Math.min(...values, lowerIsBetter ? target : 0);
  const max = Math.max(...values, lowerIsBetter ? 0 : target);
  const last = values[values.length - 1];
  const onTarget = lowerIsBetter ? last <= target : last >= target;
  const stroke = onTarget ? "#059669" : last >= (lowerIsBetter ? target : target * 0.8) && !lowerIsBetter ? "#d97706" : lowerIsBetter && last <= target * 2 ? "#d97706" : "#dc2626";
  const fmt = (v: number) => unit === "percent" ? `${v}%` : `${v}`;
  return (
    <div className="mt-3 print:hidden" aria-label="Trend over time">
      <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
        <span>Trend over last {history.length} periods</span>
        <span>{fmt(history[0].value)} → {fmt(last)}</span>
      </div>
      <div style={{ width: "100%", height: 40 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
            <YAxis hide domain={[min, max]} />
            <Tooltip
              contentStyle={{ fontSize: 11, padding: "4px 6px", borderRadius: 4 }}
              formatter={(v: number) => [fmt(v), "Value"]}
              labelFormatter={(l: string) => `Period ending ${l}`}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={stroke}
              strokeWidth={1.75}
              dot={{ r: 2, stroke, fill: stroke }}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MetricCard({ metricKey, metric }: { metricKey: MetricKey; metric: PilotHealthMetric }) {
  const icon = METRIC_ICONS[metricKey];
  const isCount = metric.unit === "count";
  const lowerIsBetter = metricKey === "annualReviewVisibility";

  return (
    <Card className={`border ${metric.onTrack ? "border-emerald-100 bg-emerald-50/30" : "border-red-100 bg-red-50/20"}`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-xs font-semibold text-gray-500 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5">
            {icon}
            {metric.label}
          </span>
          <StatusIcon onTrack={metric.onTrack} />
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="flex items-end gap-1.5">
          <span className={`text-3xl font-bold tracking-tight ${metric.onTrack ? "text-emerald-700" : "text-red-600"}`}>
            {isCount ? metric.value : `${metric.value}%`}
          </span>
          <span className="text-xs text-gray-400 mb-1">
            {isCount
              ? `target: ${metric.target}`
              : `/ ${metric.target}% target`}
          </span>
        </div>

        <div className="mt-1.5">
          <TrendBadge
            trendValue={metric.trend}
            previousValue={metric.previousValue}
            unit={metric.unit}
          />
        </div>

        <MetricDetail metricKey={metricKey} metric={metric} />
        <MetricBar value={metric.value} target={metric.target} unit={metric.unit} />
        {metric.history && metric.history.length >= 2 && (
          <Sparkline
            history={metric.history}
            unit={metric.unit}
            target={metric.target}
            lowerIsBetter={lowerIsBetter}
          />
        )}
        <p className="text-[11px] text-gray-500 mt-2.5 leading-relaxed">{metric.description}</p>
      </CardContent>
    </Card>
  );
}

const METRIC_ORDER: MetricKey[] = [
  "iepRosterCoverage",
  "serviceLoggingAdoption",
  "incidentReportingTimeliness",
  "annualReviewVisibility",
  "staffEngagement",
];

export function PilotHealthTab() {
  const { data, isLoading, isError } = useGetPilotHealthReport();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-52" />)}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorBanner message="Failed to load pilot health metrics." />;
  }

  const m = data.metrics;
  const onTrackCount = METRIC_ORDER.filter(k => m[k]?.onTrack).length;
  const totalMetrics = METRIC_ORDER.length;

  function exportCsv() {
    if (!data) return;
    const headers = ["Metric", "Value", "Target", "Unit", "On Track", "Trend", "Description"];
    const rows: string[][] = METRIC_ORDER.map(key => {
      const metric = data.metrics[key];
      if (!metric) return [key, "", "", "", "", "", ""];
      return [
        metric.label,
        metric.unit === "percent" ? `${metric.value}%` : String(metric.value),
        metric.unit === "percent" ? `${metric.target}%` : String(metric.target),
        metric.unit,
        metric.onTrack ? "Yes" : "No",
        metric.trend ?? "",
        metric.description ?? "",
      ];
    });
    downloadCsv(
      `pilot_health_${new Date().toISOString().split("T")[0]}.csv`,
      headers,
      rows,
      { generatedAt: data.generatedAt },
    );
  }

  const overallStatus =
    onTrackCount === totalMetrics
      ? "Pilot On Track"
      : onTrackCount >= 3
      ? "Needs Attention"
      : "Action Required";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-500" />
            Pilot Health Dashboard
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {onTrackCount} of {totalMetrics} metrics on track · Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap print:hidden">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
            onTrackCount === totalMetrics
              ? "bg-emerald-100 text-emerald-700"
              : onTrackCount >= 3
              ? "bg-amber-100 text-amber-700"
              : "bg-red-100 text-red-700"
          }`}>
            {onTrackCount === totalMetrics ? (
              <><CheckCircle className="w-3.5 h-3.5" /> Pilot On Track</>
            ) : onTrackCount >= 3 ? (
              <><AlertTriangle className="w-3.5 h-3.5" /> Needs Attention</>
            ) : (
              <><XCircle className="w-3.5 h-3.5" /> Action Required</>
            )}
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={exportCsv}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-[12px]" onClick={() => window.print()}>
            <Printer className="w-3.5 h-3.5" /> Print / Save as PDF
          </Button>
        </div>
      </div>

      <div className="hidden print:block mb-6">
        <h2 className="text-xl font-bold text-gray-900 text-center">Pilot Health Dashboard</h2>
        <p className="text-sm text-gray-500 text-center mt-1">
          {onTrackCount} of {totalMetrics} metrics on track · {overallStatus} · Generated {new Date(data.generatedAt).toLocaleString()}
        </p>
      </div>

      <div className="hidden print:block mb-6">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-300">
              <th className="text-left py-2 pr-4 font-semibold text-gray-700">Metric</th>
              <th className="text-right py-2 pr-4 font-semibold text-gray-700">Value</th>
              <th className="text-right py-2 pr-4 font-semibold text-gray-700">Target</th>
              <th className="text-center py-2 font-semibold text-gray-700">On Track</th>
            </tr>
          </thead>
          <tbody>
            {METRIC_ORDER.map(key => {
              const metric = m[key];
              if (!metric) return null;
              return (
                <tr key={key} className="border-b border-gray-100">
                  <td className="py-2 pr-4 text-gray-800">{metric.label}</td>
                  <td className="py-2 pr-4 text-right font-medium text-gray-900">
                    {metric.unit === "percent" ? `${metric.value}%` : metric.value}
                  </td>
                  <td className="py-2 pr-4 text-right text-gray-500">
                    {metric.unit === "percent" ? `${metric.target}%` : metric.target}
                  </td>
                  <td className="py-2 text-center font-semibold">
                    <span style={{ color: metric.onTrack ? "#059669" : "#dc2626" }}>
                      {metric.onTrack ? "Yes" : "No"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 print:hidden">
        {METRIC_ORDER.map(key => {
          const metric = m[key];
          if (!metric) return null;
          return <MetricCard key={key} metricKey={key} metric={metric} />;
        })}
      </div>

      <p className="text-[11px] text-gray-400 border-t border-gray-100 pt-3">
        Metrics 1–4 must be fully met and Metric 5 must reach ≥80% of case managers for the pilot to be declared a success.
        Service logging and incident timeliness reflect the last 30 days vs the prior 30 days.
        Staff engagement reflects the 90-day pilot window. IEP coverage and annual review are current as of today.
      </p>
    </div>
  );
}
