import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { ChevronLeft, ChevronRight, Pause, Play, TrendingUp, TrendingDown } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { Link } from "wouter";

// ─── Data hooks ─────────────────────────────────────────────────────────────

function useTrends() {
  return useQuery({
    queryKey: ["viz/compliance-trends"],
    queryFn: () => authFetch("/api/dashboard/compliance-trends?months=12").then(r => r.json()),
    staleTime: 5 * 60_000,
  });
}

function useRisk() {
  return useQuery({
    queryKey: ["viz/compliance-risk"],
    queryFn: () => authFetch("/api/reports/compliance-risk-report").then(r => r.json()),
    staleTime: 5 * 60_000,
  });
}

function useByService() {
  return useQuery({
    queryKey: ["viz/compliance-by-service"],
    queryFn: () => authFetch("/api/dashboard/compliance-by-service").then(r => r.json()),
    staleTime: 5 * 60_000,
  });
}

function useSchools() {
  return useQuery({
    queryKey: ["viz/school-compliance"],
    queryFn: () => authFetch("/api/dashboard/school-compliance").then(r => r.json()),
    staleTime: 5 * 60_000,
  });
}

function useProviders() {
  return useQuery({
    queryKey: ["viz/provider-summary"],
    queryFn: () => authFetch("/api/dashboard/provider-summary").then(r => r.json()),
    staleTime: 5 * 60_000,
  });
}

function useMissed() {
  return useQuery({
    queryKey: ["viz/missed-sessions"],
    queryFn: () => authFetch("/api/dashboard/missed-sessions-trend").then(r => r.json()),
    staleTime: 5 * 60_000,
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function rateColor(rate: number) {
  if (rate >= 90) return "#10b981";
  if (rate >= 75) return "#f59e0b";
  return "#ef4444";
}

function pct(n: number | null | undefined) {
  return n == null ? "—" : `${Math.round(n)}%`;
}

// ─── Slide components ────────────────────────────────────────────────────────

function SlideComplianceTrend() {
  const { data, isLoading } = useTrends();

  const chartData = (data?.serviceMinutes ?? [])
    .filter((m: any) => m.compliancePercent != null)
    .map((m: any) => ({
      month: m.month.slice(5), // "MM"
      rate: Math.round(m.compliancePercent),
      label: new Date(m.month + "-01").toLocaleString("default", { month: "short" }),
    }));

  const latest = chartData[chartData.length - 1]?.rate;
  const first = chartData[0]?.rate;
  const delta = latest != null && first != null ? latest - first : null;

  return (
    <SlideShell
      label="12-Month Trend"
      title="Compliance Rate Over Time"
      subtitle="District-wide service-minute delivery, month by month"
      stat={latest != null ? `${latest}%` : "—"}
      statLabel="current compliance"
      accent="#10b981"
      trend={delta}
    >
      {isLoading || chartData.length === 0 ? (
        <NoData />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="grad-compliance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip
              contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9" }}
              formatter={(v: any) => [`${v}%`, "Compliance"]}
            />
            <Area type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2.5} fill="url(#grad-compliance)" dot={{ fill: "#10b981", r: 3, strokeWidth: 0 }} activeDot={{ r: 5 }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </SlideShell>
  );
}

function SlideRiskBreakdown() {
  const { data, isLoading } = useRisk();
  const summary = data?.summary;

  const total = summary?.totalStudents ?? 0;
  const slices = [
    { label: "On Track", value: summary?.studentsOnTrack ?? 0, color: "#10b981" },
    { label: "At Risk", value: summary?.studentsAtRisk ?? 0, color: "#f59e0b" },
    { label: "Out of Compliance", value: summary?.studentsOutOfCompliance ?? 0, color: "#ef4444" },
  ].filter(s => s.value > 0);

  const rate = summary?.overallComplianceRate ?? 0;

  return (
    <SlideShell
      label="Student Risk"
      title="Where Every Student Stands"
      subtitle="Current risk classification across all active service requirements"
      stat={pct(rate)}
      statLabel="overall compliance"
      accent="#10b981"
      trend={null}
    >
      {isLoading || total === 0 ? (
        <NoData />
      ) : (
        <div className="flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 h-full">
          <ResponsiveContainer width={260} height={260}>
            <PieChart>
              <Pie
                data={slices}
                cx="50%"
                cy="50%"
                innerRadius={72}
                outerRadius={110}
                paddingAngle={3}
                dataKey="value"
              >
                {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9" }}
                formatter={(v: any) => [`${v} students`, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-4">
            {slices.map(s => (
              <div key={s.label} className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <div>
                  <div className="text-2xl font-bold text-white tabular-nums">{s.value}</div>
                  <div className="text-sm text-slate-400">{s.label}</div>
                </div>
              </div>
            ))}
            <div className="mt-2 pt-4 border-t border-white/10">
              <div className="text-2xl font-bold text-white tabular-nums">{total}</div>
              <div className="text-sm text-slate-400">total students tracked</div>
            </div>
          </div>
        </div>
      )}
    </SlideShell>
  );
}

function SlideByService() {
  const { data, isLoading } = useByService();

  const chartData = (Array.isArray(data) ? data : [])
    .sort((a: any, b: any) => a.avgPercentComplete - b.avgPercentComplete)
    .slice(0, 8)
    .map((s: any) => ({
      name: s.serviceTypeName?.replace(/therapy/i, "Tx")?.replace(/services?/i, "Svc") ?? "—",
      rate: s.avgPercentComplete,
      fill: rateColor(s.avgPercentComplete),
    }));

  const avg = chartData.length > 0
    ? Math.round(chartData.reduce((s, r) => s + r.rate, 0) / chartData.length)
    : null;

  return (
    <SlideShell
      label="By Service Type"
      title="Minutes Delivered by Service"
      subtitle="Average completion rate across all active students per service"
      stat={avg != null ? `${avg}%` : "—"}
      statLabel="avg completion"
      accent="#818cf8"
      trend={null}
    >
      {isLoading || chartData.length === 0 ? (
        <NoData />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
            <XAxis type="number" domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
            <Tooltip
              contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9" }}
              formatter={(v: any) => [`${v}%`, "Avg completion"]}
            />
            <Bar dataKey="rate" radius={[0, 6, 6, 0]} maxBarSize={28}>
              {chartData.map((_, i) => <Cell key={i} fill={chartData[i].fill} fillOpacity={0.85} />)}
              <LabelList dataKey="rate" position="right" formatter={(v: any) => `${v}%`} style={{ fill: "#94a3b8", fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </SlideShell>
  );
}

function SlideSchools() {
  const { data, isLoading } = useSchools();
  const schools: any[] = Array.isArray(data) ? data : [];
  const best = [...schools].sort((a, b) => b.rate - a.rate)[0];
  const districtAvg = schools.length > 0
    ? Math.round(schools.reduce((s, r) => s + r.rate, 0) / schools.length)
    : null;

  return (
    <SlideShell
      label="School Breakdown"
      title="Compliance by School"
      subtitle="Service-minute delivery rate for each school, this school year"
      stat={districtAvg != null ? `${districtAvg}%` : "—"}
      statLabel="district average"
      accent="#38bdf8"
      trend={null}
    >
      {isLoading || schools.length === 0 ? (
        <NoData />
      ) : (
        <div className="space-y-3 w-full max-w-xl mx-auto overflow-y-auto max-h-full pr-1">
          {schools.map(s => {
            const c = rateColor(s.rate);
            return (
              <div key={s.schoolId ?? s.schoolName}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-200 truncate flex-1 mr-3">{s.schoolName}</span>
                  <span className="text-sm font-bold tabular-nums" style={{ color: c }}>{s.rate}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${s.rate}%`, background: c }}
                  />
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-[11px] text-slate-500">{s.totalStudents} students</span>
                  {s.atRisk > 0 && <span className="text-[11px] text-red-400">{s.atRisk} at risk</span>}
                  {s.schoolName === best?.schoolName && <span className="text-[11px] text-emerald-400 font-medium">★ District best</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SlideShell>
  );
}

function SlideProviders() {
  const { data, isLoading } = useProviders();
  const providers: any[] = (Array.isArray(data) ? data : [])
    .filter((p: any) => p.totalRequiredMinutes > 0)
    .sort((a: any, b: any) => a.utilizationPercent - b.utilizationPercent)
    .slice(0, 7);

  const avg = providers.length > 0
    ? Math.round(providers.reduce((s, p) => s + p.utilizationPercent, 0) / providers.length)
    : null;

  const chartData = providers.map(p => ({
    name: p.staffName?.split(" ").map((n: string, i: number) => i === 0 ? n[0] + "." : n).join(" ") ?? "—",
    rate: p.utilizationPercent,
    fill: rateColor(p.utilizationPercent),
  }));

  return (
    <SlideShell
      label="Provider Delivery"
      title="Minutes Delivered Per Provider"
      subtitle="Utilization rate — delivered vs required minutes for active caseloads"
      stat={avg != null ? `${avg}%` : "—"}
      statLabel="avg utilization"
      accent="#818cf8"
      trend={null}
    >
      {isLoading || chartData.length === 0 ? (
        <NoData />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
            <XAxis type="number" domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#cbd5e1", fontSize: 12 }} axisLine={false} tickLine={false} width={90} />
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
            <Tooltip
              contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9" }}
              formatter={(v: any) => [`${v}%`, "Utilization"]}
            />
            <Bar dataKey="rate" radius={[0, 6, 6, 0]} maxBarSize={28}>
              {chartData.map((_, i) => <Cell key={i} fill={chartData[i].fill} fillOpacity={0.85} />)}
              <LabelList dataKey="rate" position="right" formatter={(v: any) => `${v}%`} style={{ fill: "#94a3b8", fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </SlideShell>
  );
}

function SlideMissedSessions() {
  const { data, isLoading } = useMissed();
  const weeks: any[] = Array.isArray(data) ? data.slice(-8) : [];

  const totalMissed = weeks.reduce((s: number, w: any) => s + w.missedCount, 0);
  const totalCompleted = weeks.reduce((s: number, w: any) => s + w.completedCount, 0);
  const missedRate = totalCompleted + totalMissed > 0
    ? Math.round((totalMissed / (totalCompleted + totalMissed)) * 100)
    : null;

  const chartData = weeks.map(w => ({
    label: w.weekLabel,
    missed: w.missedCount,
    completed: w.completedCount,
  }));

  return (
    <SlideShell
      label="Session History"
      title="Missed vs Completed Sessions"
      subtitle="Weekly breakdown across all service types — last 8 weeks"
      stat={missedRate != null ? `${missedRate}%` : "—"}
      statLabel="missed rate"
      accent="#f87171"
    >
      {isLoading || chartData.length === 0 ? (
        <NoData />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }} barCategoryGap="30%">
            <defs>
              <linearGradient id="grad-completed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.9} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0.6} />
              </linearGradient>
              <linearGradient id="grad-missed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.9} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.6} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8, color: "#f1f5f9" }}
            />
            <Bar dataKey="completed" name="Completed" fill="url(#grad-completed)" radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Bar dataKey="missed" name="Missed" fill="url(#grad-missed)" radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </SlideShell>
  );
}

// ─── Shell / chrome ──────────────────────────────────────────────────────────

interface SlideShellProps {
  label: string;
  title: string;
  subtitle: string;
  stat: string;
  statLabel: string;
  accent: string;
  trend?: number | null;
  children: React.ReactNode;
}

function SlideShell({ label, title, subtitle, stat, statLabel, accent, trend, children }: SlideShellProps) {
  return (
    <div className="flex flex-col h-full px-8 py-6 md:px-16 md:py-10">
      {/* Header row */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6 flex-shrink-0">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: accent }}>{label}</div>
          <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight">{title}</h2>
          <p className="text-sm text-slate-400 mt-1">{subtitle}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-4xl md:text-5xl font-black tabular-nums" style={{ color: accent }}>{stat}</div>
          <div className="text-sm text-slate-400 mt-0.5 flex items-center justify-end gap-1">
            {trend != null && trend > 0 && <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
            {trend != null && trend < 0 && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
            {statLabel}
            {trend != null && (
              <span className={trend > 0 ? "text-emerald-400" : "text-red-400"}>
                {trend > 0 ? ` ▲${trend}pp` : ` ▼${Math.abs(trend)}pp`}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}

function NoData() {
  return (
    <div className="h-full flex items-center justify-center text-slate-500 text-sm">
      Loading data…
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

const SLIDES = [
  { id: "trend", component: SlideComplianceTrend },
  { id: "risk", component: SlideRiskBreakdown },
  { id: "service", component: SlideByService },
  { id: "schools", component: SlideSchools },
  { id: "providers", component: SlideProviders },
  { id: "missed", component: SlideMissedSessions },
];

const ROTATION_MS = 7000;

export default function DataVisualized() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = useCallback((next: number) => {
    setVisible(false);
    setTimeout(() => {
      setActive(next);
      setVisible(true);
    }, 300);
  }, []);

  const prev = useCallback(() => {
    go((active - 1 + SLIDES.length) % SLIDES.length);
  }, [active, go]);

  const next = useCallback(() => {
    go((active + 1) % SLIDES.length);
  }, [active, go]);

  // Auto-rotation
  useEffect(() => {
    if (paused) return;
    timerRef.current = setTimeout(() => {
      go((active + 1) % SLIDES.length);
    }, ROTATION_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [active, paused, go]);

  const ActiveSlide = SLIDES[active].component;

  return (
    <div
      className="fixed inset-0 bg-slate-950 flex flex-col overflow-hidden"
      style={{ zIndex: 10 }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 flex-shrink-0">
        <Link href="/">
          <a className="text-xs text-slate-500 hover:text-slate-300 transition-colors">← Dashboard</a>
        </Link>
        <div className="flex items-center gap-1">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => go(i)}
              className={`transition-all rounded-full ${i === active ? "w-5 h-2 bg-white" : "w-2 h-2 bg-slate-600 hover:bg-slate-400"}`}
            />
          ))}
        </div>
        <button
          onClick={() => setPaused(p => !p)}
          className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1.5"
        >
          {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          {paused ? "Resume" : "Pause"}
        </button>
      </div>

      {/* Slide area */}
      <div
        className="flex-1 min-h-0 transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <ActiveSlide />
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-white/5 flex-shrink-0">
        <button
          onClick={prev}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </button>
        <div className="text-xs text-slate-600 tabular-nums">
          {active + 1} / {SLIDES.length}
        </div>
        <button
          onClick={next}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
