import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from "recharts";
import { ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
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
function useProgramTrends() {
  return useQuery({
    queryKey: ["viz/program-trends"],
    queryFn: () => authFetch("/api/dashboard/program-trends").then(r => r.json()),
    staleTime: 5 * 60_000,
  });
}
function useProtectiveMeasures() {
  return useQuery({
    queryKey: ["viz/protective-measures"],
    queryFn: () => authFetch("/api/protective-measures/summary?startDate=2025-04-01").then(r => r.json()),
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

// ─── Slide shells ────────────────────────────────────────────────────────────

interface SlideProps {
  eyebrow: string;
  headline: string;
  description: string;
  stat: string;
  statSub: string;
  accent: string;
  children: React.ReactNode;
}

function Slide({ eyebrow, headline, description, stat, statSub, accent, children }: SlideProps) {
  return (
    <div className="h-full flex flex-col md:flex-row gap-0">
      {/* Left panel — stat + copy */}
      <div className="flex flex-col justify-center px-10 md:px-16 py-8 md:w-72 lg:w-80 flex-shrink-0">
        <div
          className="text-[11px] font-bold uppercase tracking-widest mb-3"
          style={{ color: accent }}
        >
          {eyebrow}
        </div>
        <div
          className="text-6xl lg:text-7xl font-black leading-none tabular-nums mb-2"
          style={{ color: accent }}
        >
          {stat}
        </div>
        <div className="text-sm text-slate-400 mb-5 font-medium">{statSub}</div>
        <div className="w-8 h-px bg-slate-200 mb-4" />
        <h2 className="text-lg font-bold text-slate-800 leading-snug mb-2">{headline}</h2>
        <p className="text-[13px] text-slate-400 leading-relaxed">{description}</p>
      </div>

      {/* Right panel — chart, borderless */}
      <div className="flex-1 min-w-0 min-h-0 flex items-center py-8 pr-8 md:pr-12 lg:pr-16">
        {children}
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm">
      Loading…
    </div>
  );
}
function Empty({ message = "No data available" }: { message?: string }) {
  return (
    <div className="w-full h-full flex items-center justify-center text-slate-300 text-sm">
      {message}
    </div>
  );
}

// ─── Slide 1 — Compliance Trend ──────────────────────────────────────────────

function SlideComplianceTrend() {
  const { data, isLoading } = useTrends();
  const chartData = (data?.serviceMinutes ?? [])
    .filter((m: any) => m.compliancePercent != null)
    .map((m: any) => ({
      label: new Date(m.month + "-01").toLocaleString("default", { month: "short" }),
      rate: Math.round(m.compliancePercent),
    }));
  const latest = chartData[chartData.length - 1]?.rate;
  const first = chartData[0]?.rate;
  const delta = latest != null && first != null ? latest - first : null;

  return (
    <Slide
      eyebrow="12-Month Trend"
      headline="Compliance rate across the district"
      description="Service-minute delivery tracked month by month for all active students."
      stat={latest != null ? `${latest}%` : "—"}
      statSub={delta != null ? `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}pp vs. 12 months ago` : "current compliance rate"}
      accent="#10b981"
    >
      {isLoading || chartData.length === 0 ? <Loading /> : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 20, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gCompliance" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip
              contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 4px 24px rgba(0,0,0,0.07)", color: "#334155" }}
              formatter={(v: any) => [`${v}%`, "Compliance"]}
            />
            <Area type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={2.5} fill="url(#gCompliance)" dot={false} activeDot={{ r: 4, fill: "#10b981" }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Slide>
  );
}

// ─── Slide 2 — Risk Breakdown ─────────────────────────────────────────────────

function SlideRiskBreakdown() {
  const { data, isLoading } = useRisk();
  const summary = data?.summary;
  const total = summary?.totalStudents ?? 0;
  const rate = summary?.overallComplianceRate ?? 0;
  const slices = [
    { label: "On Track", value: summary?.studentsOnTrack ?? 0, color: "#10b981" },
    { label: "At Risk", value: summary?.studentsAtRisk ?? 0, color: "#f59e0b" },
    { label: "Out of Compliance", value: summary?.studentsOutOfCompliance ?? 0, color: "#ef4444" },
  ].filter(s => s.value > 0);

  return (
    <Slide
      eyebrow="Student Risk"
      headline="Where every student stands right now"
      description="Current risk classification across all active IEP service requirements."
      stat={pct(rate)}
      statSub={`${total} students tracked`}
      accent="#10b981"
    >
      {isLoading || total === 0 ? <Loading /> : (
        <div className="flex items-center gap-12 w-full h-full">
          <div className="flex-shrink-0">
            <ResponsiveContainer width={220} height={220}>
              <PieChart>
                <Pie data={slices} cx="50%" cy="50%" innerRadius={62} outerRadius={100} paddingAngle={3} dataKey="value">
                  {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}
                  formatter={(v: any) => [`${v} students`, ""]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-5">
            {slices.map(s => (
              <div key={s.label} className="flex items-center gap-4">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <div>
                  <div className="text-2xl font-bold text-slate-800 tabular-nums">{s.value}</div>
                  <div className="text-[12px] text-slate-400 font-medium">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Slide>
  );
}

// ─── Slide 3 — By Service ─────────────────────────────────────────────────────

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
  const avg = chartData.length > 0 ? Math.round(chartData.reduce((s, r) => s + r.rate, 0) / chartData.length) : null;

  return (
    <Slide
      eyebrow="By Service Type"
      headline="Delivery by service category"
      description="Average completion rate across all students per service type this school year."
      stat={avg != null ? `${avg}%` : "—"}
      statSub="avg across all services"
      accent="#6366f1"
    >
      {isLoading || chartData.length === 0 ? <Loading /> : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 50, left: 0, bottom: 4 }}>
            <XAxis type="number" domain={[0, 100]} tick={{ fill: "#cbd5e1", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} width={96} />
            <CartesianGrid strokeDasharray="2 4" stroke="#f1f5f9" horizontal={false} />
            <Tooltip
              contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}
              formatter={(v: any) => [`${v}%`, "Avg completion"]}
            />
            <Bar dataKey="rate" radius={[0, 6, 6, 0]} maxBarSize={22}>
              {chartData.map((_, i) => <Cell key={i} fill={chartData[i].fill} fillOpacity={0.8} />)}
              <LabelList dataKey="rate" position="right" formatter={(v: any) => `${v}%`} style={{ fill: "#94a3b8", fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Slide>
  );
}

// ─── Slide 4 — Schools ───────────────────────────────────────────────────────

function SlideSchools() {
  const { data, isLoading } = useSchools();
  const schools: any[] = Array.isArray(data) ? [...data].sort((a, b) => b.rate - a.rate) : [];
  const avg = schools.length > 0 ? Math.round(schools.reduce((s, r) => s + r.rate, 0) / schools.length) : null;

  return (
    <Slide
      eyebrow="School Breakdown"
      headline="Compliance by school"
      description="Service-minute delivery rate for each school in the district, sorted highest to lowest."
      stat={avg != null ? `${avg}%` : "—"}
      statSub="district average"
      accent="#38bdf8"
    >
      {isLoading || schools.length === 0 ? <Loading /> : (
        <div className="flex flex-col gap-3.5 w-full overflow-y-auto max-h-full pr-1">
          {schools.map(s => {
            const c = rateColor(s.rate);
            return (
              <div key={s.schoolId ?? s.schoolName}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[13px] font-semibold text-slate-700 truncate flex-1 mr-3">{s.schoolName}</span>
                  <span className="text-[13px] font-bold tabular-nums" style={{ color: c }}>{s.rate}%</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${s.rate}%`, background: c }}
                  />
                </div>
                <div className="flex gap-3 mt-1">
                  <span className="text-[11px] text-slate-400">{s.totalStudents} students</span>
                  {s.atRisk > 0 && <span className="text-[11px] text-red-400 font-medium">{s.atRisk} at risk</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Slide>
  );
}

// ─── Slide 5 — Providers ─────────────────────────────────────────────────────

function SlideProviders() {
  const { data, isLoading } = useProviders();
  const providers: any[] = (Array.isArray(data) ? data : [])
    .filter((p: any) => p.totalRequiredMinutes > 0)
    .sort((a: any, b: any) => a.utilizationPercent - b.utilizationPercent)
    .slice(0, 7);
  const avg = providers.length > 0
    ? Math.round(providers.reduce((s, p) => s + p.utilizationPercent, 0) / providers.length) : null;
  const chartData = providers.map(p => ({
    name: p.staffName?.split(" ").map((n: string, i: number) => i === 0 ? n[0] + "." : n).join(" ") ?? "—",
    rate: p.utilizationPercent,
    fill: rateColor(p.utilizationPercent),
  }));

  return (
    <Slide
      eyebrow="Provider Delivery"
      headline="Minutes delivered per provider"
      description="Utilization rate — delivered vs. required minutes across each provider's active caseload."
      stat={avg != null ? `${avg}%` : "—"}
      statSub="avg utilization"
      accent="#a78bfa"
    >
      {isLoading ? <Loading /> : chartData.length === 0 ? <Empty message="No provider data available" /> : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 50, left: 0, bottom: 4 }}>
            <XAxis type="number" domain={[0, 100]} tick={{ fill: "#cbd5e1", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <YAxis type="category" dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
            <CartesianGrid strokeDasharray="2 4" stroke="#f1f5f9" horizontal={false} />
            <Tooltip
              contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}
              formatter={(v: any) => [`${v}%`, "Utilization"]}
            />
            <Bar dataKey="rate" radius={[0, 6, 6, 0]} maxBarSize={22}>
              {chartData.map((_, i) => <Cell key={i} fill={chartData[i].fill} fillOpacity={0.85} />)}
              <LabelList dataKey="rate" position="right" formatter={(v: any) => `${v}%`} style={{ fill: "#94a3b8", fontSize: 11 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Slide>
  );
}

// ─── Slide 6 — Sessions ──────────────────────────────────────────────────────

function SlideMissedSessions() {
  const { data, isLoading } = useMissed();
  const weeks: any[] = Array.isArray(data) ? data.slice(-8) : [];
  const totalMissed = weeks.reduce((s: number, w: any) => s + w.missedCount, 0);
  const totalCompleted = weeks.reduce((s: number, w: any) => s + w.completedCount, 0);
  const missedRate = totalCompleted + totalMissed > 0
    ? Math.round((totalMissed / (totalCompleted + totalMissed)) * 100) : null;
  const chartData = weeks.map(w => ({ label: w.weekLabel, completed: w.completedCount, missed: w.missedCount }));

  return (
    <Slide
      eyebrow="Session History"
      headline="Missed vs. completed sessions"
      description="Weekly breakdown across all service types — past 8 weeks."
      stat={missedRate != null ? `${missedRate}%` : "—"}
      statSub={`${totalMissed} missed sessions`}
      accent="#f87171"
    >
      {isLoading || chartData.length === 0 ? <Loading /> : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 16, right: 8, left: -20, bottom: 0 }} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="2 4" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}
            />
            <Bar dataKey="completed" name="Completed" fill="#10b981" fillOpacity={0.75} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="missed" name="Missed" fill="#f87171" fillOpacity={0.8} radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Slide>
  );
}

// ─── Slide 7 — Skill Acquisition (DTT) ──────────────────────────────────────

function fmtMonth(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-US", { month: "short", year: "2-digit" });
}

function SlideSkillAcquisition() {
  const { data, isLoading } = useProgramTrends();
  const rows: any[] = data?.skillAcquisition ?? [];
  const chartData = rows.map(r => ({
    label: fmtMonth(r.month),
    rate: parseFloat(r.avg_correct),
    students: parseInt(r.students),
  }));
  const latest = chartData[chartData.length - 1]?.rate;
  const first = chartData[0]?.rate;
  const delta = latest != null && first != null ? Math.round(latest - first) : null;

  return (
    <Slide
      eyebrow="Skill Acquisition"
      headline="DTT mastery across active programs"
      description="Monthly average percent-correct across all discrete trial training programs. Tracking skill acquisition for 42 students."
      stat={latest != null ? `${latest}%` : "—"}
      statSub={delta != null ? `▲ ${delta}pp gain this year` : "avg percent correct"}
      accent="#6366f1"
    >
      {isLoading ? <Loading /> : chartData.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 20, right: 8, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gSkill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 4" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip
              contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 4px 24px rgba(0,0,0,0.07)", color: "#334155" }}
              formatter={(v: any) => [`${v}%`, "Avg correct"]}
            />
            <Area type="monotone" dataKey="rate" stroke="#6366f1" strokeWidth={2.5} fill="url(#gSkill)" dot={false} activeDot={{ r: 4, fill: "#6366f1" }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Slide>
  );
}

// ─── Slide 8 — Behavior Data ─────────────────────────────────────────────────

function SlideBehaviorData() {
  const { data, isLoading } = useProgramTrends();
  const rows: any[] = data?.behaviorReduction ?? [];
  const chartData = rows.map(r => ({
    label: fmtMonth(r.month),
    value: parseFloat(r.avg_value),
    targets: parseInt(r.active_targets),
    students: parseInt(r.students),
  }));
  const latest = chartData[chartData.length - 1]?.value;
  const latestTargets = chartData[chartData.length - 1]?.targets ?? 0;

  return (
    <Slide
      eyebrow="Behavior Tracking"
      headline="Active behavior targets across students"
      description={`Aggregated behavior data across ${latestTargets} active targets — monitoring frequency, rate, and duration.`}
      stat={latest != null ? `${latestTargets}` : "—"}
      statSub="active behavior targets"
      accent="#f59e0b"
    >
      {isLoading ? <Loading /> : chartData.length === 0 ? <Empty /> : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 20, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 4px 24px rgba(0,0,0,0.07)", color: "#334155" }}
              formatter={(v: any) => [v, "Avg value"]}
            />
            <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 4, fill: "#f59e0b", strokeWidth: 0 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Slide>
  );
}

// ─── Slide 9 — Protective Measures / Restraints ──────────────────────────────

function SlideProtectiveMeasures() {
  const { data, isLoading } = useProtectiveMeasures();
  const monthly: Record<string, any> = data?.monthlyBreakdown ?? {};
  const summary = data?.summary;
  const total: number = data?.total ?? 0;
  const chartData = Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, counts]: [string, any]) => ({
      label: fmtMonth(month),
      restraints: counts.restraints ?? 0,
      seclusions: counts.seclusions ?? 0,
      timeouts: counts.timeouts ?? 0,
    }));

  return (
    <Slide
      eyebrow="Safety & Restraints"
      headline="Protective measures tracked this year"
      description="Physical restraints, seclusions, and time-outs logged with full documentation, duration, and notification tracking."
      stat={String(total)}
      statSub={`incidents logged${summary?.physical_restraint != null ? ` · ${summary.physical_restraint} restraints` : ""}`}
      accent="#ef4444"
    >
      {isLoading ? <Loading /> : chartData.length === 0 ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-300">
          <div className="text-5xl font-black text-emerald-500">0</div>
          <div className="text-sm">No restraint incidents recorded</div>
          <div className="text-[12px] text-slate-400 text-center max-w-48">Protective measure tracking is active and monitoring continuously.</div>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 16, right: 8, left: -20, bottom: 0 }} barCategoryGap="35%">
            <CartesianGrid strokeDasharray="2 4" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}
            />
            <Bar dataKey="restraints" name="Restraints" fill="#ef4444" fillOpacity={0.75} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="seclusions" name="Seclusions" fill="#f59e0b" fillOpacity={0.75} radius={[4, 4, 0, 0]} maxBarSize={24} />
            <Bar dataKey="timeouts" name="Time-outs" fill="#94a3b8" fillOpacity={0.75} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Slide>
  );
}

// ─── Carousel ────────────────────────────────────────────────────────────────

const SLIDES = [
  { id: "trend",    label: "Trend",      component: SlideComplianceTrend },
  { id: "risk",     label: "Students",   component: SlideRiskBreakdown },
  { id: "service",  label: "Services",   component: SlideByService },
  { id: "schools",  label: "Schools",    component: SlideSchools },
  { id: "provider", label: "Providers",  component: SlideProviders },
  { id: "sessions", label: "Sessions",   component: SlideMissedSessions },
  { id: "skill",    label: "Skill Acq.", component: SlideSkillAcquisition },
  { id: "behavior", label: "Behavior",   component: SlideBehaviorData },
  { id: "safety",   label: "Safety",     component: SlideProtectiveMeasures },
];

const ROTATION_MS = 7000;

export default function DataVisualized() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const go = useCallback((next: number) => {
    setVisible(false);
    setProgress(0);
    setTimeout(() => {
      setActive(next);
      setVisible(true);
    }, 280);
  }, []);

  const prev = useCallback(() => go((active - 1 + SLIDES.length) % SLIDES.length), [active, go]);
  const next = useCallback(() => go((active + 1) % SLIDES.length), [active, go]);

  // Auto-rotation
  useEffect(() => {
    if (paused) { setProgress(0); return; }
    setProgress(0);
    const start = Date.now();
    if (progressRef.current) clearInterval(progressRef.current);
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(100, (elapsed / ROTATION_MS) * 100));
    }, 80);
    timerRef.current = setTimeout(() => {
      go((active + 1) % SLIDES.length);
    }, ROTATION_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [active, paused, go]);

  const ActiveSlide = SLIDES[active].component;

  return (
    // z-[60] sits above the sidebar (z-50) for true full-screen takeover
    <div className="fixed inset-0 bg-white flex flex-col" style={{ zIndex: 60 }}>

      {/* Progress bar */}
      <div className="h-0.5 w-full bg-slate-100 flex-shrink-0 relative overflow-hidden">
        {!paused && (
          <div
            className="absolute left-0 top-0 h-full bg-emerald-400 transition-none"
            style={{ width: `${progress}%` }}
          />
        )}
      </div>

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 flex-shrink-0 border-b border-slate-50">
        <Link href="/">
          <a className="flex items-center gap-1.5 text-[12px] font-medium text-slate-400 hover:text-slate-700 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </a>
        </Link>

        <div className="flex items-center gap-1">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => { setPaused(true); go(i); }}
              className={`transition-all rounded-full text-[10px] font-semibold ${
                i === active
                  ? "bg-slate-800 text-white px-3 py-1"
                  : "bg-slate-100 text-slate-400 hover:bg-slate-200 px-2.5 py-1"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setPaused(p => !p)}
          className="text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors w-16 text-right"
        >
          {paused ? "▶ Play" : "❙❙ Pause"}
        </button>
      </div>

      {/* Slide */}
      <div
        className="flex-1 min-h-0 transition-opacity duration-280"
        style={{ opacity: visible ? 1 : 0 }}
      >
        <ActiveSlide />
      </div>

      {/* Bottom nav */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-slate-50 flex-shrink-0">
        <button
          onClick={() => { setPaused(true); prev(); }}
          className="flex items-center gap-1.5 text-[12px] font-medium text-slate-400 hover:text-slate-700 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>
        <div className="flex gap-1.5">
          {SLIDES.map((_, i) => (
            <div
              key={i}
              className={`rounded-full transition-all duration-300 ${
                i === active ? "w-4 h-1.5 bg-slate-700" : "w-1.5 h-1.5 bg-slate-200"
              }`}
            />
          ))}
        </div>
        <button
          onClick={() => { setPaused(true); next(); }}
          className="flex items-center gap-1.5 text-[12px] font-medium text-slate-400 hover:text-slate-700 transition-colors"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
