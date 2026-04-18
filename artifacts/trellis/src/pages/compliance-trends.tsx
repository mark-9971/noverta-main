import { useEffect, useState, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, ComposedChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authFetch } from "@/lib/auth-fetch";
import { useSchoolContext } from "@/lib/school-context";

type ServicePoint   = { month: string; requiredMinutes: number; deliveredMinutes: number; compliancePercent: number | null };
type RiskPoint      = { month: string; atRiskCount: number | null; totalTracked: number };
type CompPoint      = { month: string; accruedMinutes: number; deliveredMinutes: number; cumulativeOwedMinutes: number };
type LoggingPoint   = { month: string; totalSessions: number; timelySessions: number; timelinessPercent: number | null };

type TrendsResponse = {
  months: string[];
  studentsTracked: number;
  activeStudents: number;
  serviceMinutes: ServicePoint[];
  atRiskStudents: RiskPoint[];
  compensatoryExposure: CompPoint[];
  loggingCompletion: LoggingPoint[];
  dataQuality: "ok" | "sparse" | "empty";
  notes: Record<string, unknown>;
  generatedAt: string;
};

function fmtMonth(ym: string): string {
  // "2026-01" → "Jan '26"
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleString("en-US", { month: "short", year: "2-digit" }).replace(" ", " '");
}

export default function ComplianceTrendsPage({ embedded }: { embedded?: boolean } = {}) {
  const { filterParams } = useSchoolContext();
  const [months, setMonths] = useState(12);
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Re-fetch when months or district scope changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ months: String(months), ...filterParams }).toString();
    authFetch(`/api/dashboard/compliance-trends?${qs}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<TrendsResponse>;
      })
      .then(json => { if (!cancelled) setData(json); })
      .catch(e => { if (!cancelled) setError(String(e?.message ?? e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months, JSON.stringify(filterParams)]);

  const serviceChart = useMemo(() => data?.serviceMinutes.map(p => ({
    label: fmtMonth(p.month), Required: p.requiredMinutes, Delivered: p.deliveredMinutes, Compliance: p.compliancePercent,
  })) ?? [], [data]);

  const riskChart = useMemo(() => data?.atRiskStudents.map(p => ({
    label: fmtMonth(p.month), AtRisk: p.atRiskCount, Tracked: p.totalTracked,
  })) ?? [], [data]);

  const compChart = useMemo(() => data?.compensatoryExposure.map(p => ({
    label: fmtMonth(p.month), Accrued: p.accruedMinutes, Delivered: p.deliveredMinutes, Owed: p.cumulativeOwedMinutes,
  })) ?? [], [data]);

  const loggingChart = useMemo(() => data?.loggingCompletion.map(p => ({
    label: fmtMonth(p.month), Timeliness: p.timelinessPercent, Total: p.totalSessions,
  })) ?? [], [data]);

  return (
    <div className={embedded ? "space-y-5" : "p-6 space-y-6 max-w-[1400px] mx-auto"}>
      <header className="flex items-end justify-between flex-wrap gap-3">
        {!embedded && (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Compliance Trends</h1>
            <p className="text-sm text-gray-500 mt-1">
              Real time-series across service delivery, student risk, compensatory exposure, and logging timeliness.
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-gray-500">Window</label>
          <select
            value={months}
            onChange={e => setMonths(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700"
          >
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={18}>Last 18 months</option>
            <option value={24}>Last 24 months</option>
          </select>
        </div>
      </header>

      {error && (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="p-4 text-sm text-red-700">Couldn't load trends: {error}</CardContent>
        </Card>
      )}

      {data && data.dataQuality !== "ok" && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="p-3 text-xs text-amber-800">
            {data.dataQuality === "empty"
              ? "No session activity recorded in this window. Charts will appear empty until providers begin logging."
              : "Sparse data: only a few months in this window contain logged activity. Trend lines may have gaps and small-sample swings."}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          title="Service Minutes — Required vs Delivered"
          subtitle={data ? `${data.studentsTracked} students with active service requirements` : ""}
          loading={loading}
          empty={!loading && (!serviceChart.length || serviceChart.every(p => p.Delivered === 0 && p.Required === 0))}
        >
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={serviceChart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="Required" fill="#e5e7eb" />
              <Bar yAxisId="left" dataKey="Delivered" fill="#10b981" />
              <Line yAxisId="right" type="monotone" dataKey="Compliance" stroke="#111827" strokeWidth={2} dot={{ r: 3 }} />
              <ReferenceLine yAxisId="right" y={85} stroke="#9ca3af" strokeDasharray="4 4" label={{ value: "85% target", position: "right", fontSize: 10, fill: "#6b7280" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Students At Risk"
          subtitle="Active students delivered <70% of monthly required minutes"
          loading={loading}
          empty={!loading && (!riskChart.length || riskChart.every(p => p.AtRisk === null))}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={riskChart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="AtRisk" name="At Risk" fill="#dc2626" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Compensatory Exposure"
          subtitle="Monthly accrued vs delivered comp minutes; cumulative open balance"
          loading={loading}
          empty={!loading && (!compChart.length || compChart.every(p => p.Accrued === 0 && p.Delivered === 0 && p.Owed === 0))}
        >
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={compChart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
              <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="Accrued" fill="#fca5a5" />
              <Bar yAxisId="left" dataKey="Delivered" fill="#86efac" />
              <Area yAxisId="right" type="monotone" dataKey="Owed" stroke="#b91c1c" fill="#fee2e2" fillOpacity={0.5} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard
          title="Provider Logging Timeliness"
          subtitle="% of completed/missed sessions logged within 48h of the session date"
          loading={loading}
          empty={!loading && (!loggingChart.length || loggingChart.every(p => p.Total === 0))}
        >
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={loggingChart} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(v: any, n: any) => n === "Timeliness" ? [`${v}%`, n] : [v, n]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={90} stroke="#9ca3af" strokeDasharray="4 4" label={{ value: "90% target", position: "right", fontSize: 10, fill: "#6b7280" }} />
              <Line type="monotone" dataKey="Timeliness" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <Card className="border-gray-200/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-700">Methodology &amp; Limitations</CardTitle>
        </CardHeader>
        <CardContent className="text-[12px] text-gray-600 space-y-2 leading-relaxed">
          <p>
            <strong className="text-gray-800">Service Minutes</strong> — Required minutes per student are
            normalized to monthly (weekly &times; 4, quarterly &divide; 3) and summed across active
            requirements. Delivered counts only sessions in <code className="px-1 bg-gray-100 rounded">completed</code>
            {" "}or <code className="px-1 bg-gray-100 rounded">makeup</code> status. Soft-deleted sessions are excluded.
          </p>
          <p>
            <strong className="text-gray-800">At-Risk Students</strong> — A student is at risk for a given month
            if their delivered minutes that month are below 70% of their normalized monthly requirement.
            This is recomputed on read; if a service requirement was edited later, historical at-risk
            counts will shift.
          </p>
          <p>
            <strong className="text-gray-800">Compensatory Exposure</strong> — Accrued comp minutes use
            the obligation's <code className="px-1 bg-gray-100 rounded">created_at</code> month (when the obligation
            was recorded, not necessarily when the underlying service was missed). Delivered uses the comp
            session's date. Cumulative owed is seeded with the pre-window net balance so the trend doesn't
            falsely start at zero.
          </p>
          <p>
            <strong className="text-gray-800">Logging Timeliness</strong> — Of all sessions in a month with a
            terminal status (completed, missed, makeup), the percentage whose <code className="px-1 bg-gray-100 rounded">created_at</code>
            {" "}falls within 48 hours of end-of-session-day. Same-day logs are always counted as timely.
          </p>
          <p>
            <strong className="text-gray-800">Date axis</strong> — Calendar months in district local time, oldest
            on the left. Months with zero applicable activity are shown as gaps in lines (and zero in bars)
            rather than fabricated 0% / 100% values, so sparse pilot data reads honestly.
          </p>
          {data && (
            <p className="pt-1 text-[11px] text-gray-400">
              Generated {new Date(data.generatedAt).toLocaleString()} · {data.studentsTracked} of {data.activeStudents} active students have at least one active service requirement.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ChartCard({
  title, subtitle, loading, empty, children,
}: { title: string; subtitle?: string; loading: boolean; empty: boolean; children: React.ReactNode }) {
  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-800">{title}</CardTitle>
        {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
      </CardHeader>
      <CardContent className="pt-2">
        {loading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : empty ? (
          <div className="h-[260px] flex items-center justify-center text-xs text-gray-400">
            Insufficient data for this window
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
