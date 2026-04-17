import { useState, useEffect, useMemo } from "react";
import { apiGet } from "@/lib/api";
import { useRole } from "@/lib/role-context";
import {
  Building2, Loader2, Search, AlertTriangle, CheckCircle, XCircle,
  Activity, Database, Users, FileWarning, ArrowLeft, ExternalLink, Clock,
  Sparkles, FlaskConical, CreditCard,
} from "lucide-react";

type DistrictMode = "demo" | "pilot" | "paid" | "trial" | "unpaid" | "unconfigured";

interface DistrictRow {
  districtId: number;
  name: string;
  state: string | null;
  mode: DistrictMode;
  tier: string;
  subscriptionStatus: string | null;
  subscriptionPlan: string | null;
  currentPeriodEnd: string | null;
  activeStudents: number;
  activeStaff: number;
  sessionsLast7d: number;
  lastSessionDate: string | null;
  lastSyncAt: string | null;
  openCriticalAlerts: number;
}

interface DistrictDetail {
  district: { id: number; name: string; state: string | null; isDemo: boolean; isPilot: boolean; tier: string; createdAt: string };
  mode: DistrictMode;
  subscription: { planTier: string; status: string; seatLimit: number; currentPeriodEnd: string | null; addOns: string[]; stripeCustomerId: string | null } | null;
  counts: {
    schools: number; activeStudents: number; totalStudents: number; activeStaff: number; totalStaff: number;
    sessionsLast7d: number; missedLast7d: number;
  };
  activity: {
    lastSessionDate: string | null;
    lastSyncAt: string | null;
    sisConnections: Array<{ id: number; provider: string; label: string; status: string; enabled: boolean; lastSyncAt: string | null }>;
  };
}

interface HealthCheck {
  id: string; category: string; severity: "critical" | "warning" | "info";
  title: string; description: string; count: number; total: number;
  items: { id: number; label: string; detail: string }[];
}
interface DataHealthReport {
  overallStatus: "good" | "needs_attention" | "not_ready";
  summary: { totalStudents: number; totalStaff: number; totalServiceReqs: number; totalScheduleBlocks: number; checksRun: number; passed: number; warnings: number; critical: number };
  checks: HealthCheck[];
}

interface InactiveStaff { id: number; name: string; role: string; email: string | null; lastSessionDate: string | null; sessionsInWindow: number; assignedStudents: number; scheduleBlocks: number }
interface SyncLogEntry { id: number; connectionLabel: string; provider: string | null; syncType: string; status: string; studentsAdded: number; studentsUpdated: number; staffAdded: number; staffUpdated: number; errors: Array<{ field?: string; message: string }>; warnings: Array<{ field?: string; message: string }>; startedAt: string; completedAt: string | null }
interface ImportEntry { id: number; importType: string; fileName: string | null; status: string; rowsProcessed: number | null; rowsImported: number | null; rowsErrored: number | null; errorSummary: string | null; createdAt: string }
interface MetricDebug {
  districtId: number;
  schoolCount: number;
  snapshot: null | { activeStudents: number; totalStudents: number; activeStaff: number; activeServiceReqs: number; reqsMissingProvider: number; activeScheduleBlocks: number; iepDocuments: number; activeGoals: number };
  sessions: null | {
    last7d: { total: number; completed: number; missed: number };
    prev7d: { total: number };
    last30d: { total: number; completed: number; missed: number; distinctLoggers: number };
  };
}

const MODE_BADGE: Record<DistrictMode, { label: string; cls: string; icon: typeof Sparkles }> = {
  demo: { label: "Demo", cls: "bg-violet-100 text-violet-800", icon: Sparkles },
  pilot: { label: "Pilot", cls: "bg-sky-100 text-sky-800", icon: FlaskConical },
  paid: { label: "Paid", cls: "bg-emerald-100 text-emerald-800", icon: CreditCard },
  trial: { label: "Trial", cls: "bg-blue-100 text-blue-800", icon: Clock },
  unpaid: { label: "Unpaid", cls: "bg-red-100 text-red-800", icon: AlertTriangle },
  unconfigured: { label: "Unconfigured", cls: "bg-gray-100 text-gray-700", icon: AlertTriangle },
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString();
}
function fmtRelative(d: string | null): string {
  if (!d) return "Never";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days < 1) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString();
}

export default function SupportPage() {
  const { isPlatformAdmin } = useRole();
  const [districts, setDistricts] = useState<DistrictRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState<DistrictMode | "all">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    apiGet<{ districts: DistrictRow[] }>("/support/districts")
      .then((r) => setDistricts(r.districts))
      .catch((err: { status?: number }) => {
        if (err.status === 403) setAccessDenied(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!districts) return [];
    return districts.filter((d) => {
      if (modeFilter !== "all" && d.mode !== modeFilter) return false;
      if (search && !`${d.name} ${d.state ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [districts, search, modeFilter]);

  if (!isPlatformAdmin && !loading && !accessDenied) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-6">
          <h2 className="font-semibold text-amber-900">Platform admin required</h2>
          <p className="text-sm text-amber-800 mt-1">This page is reserved for Trellis support staff.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="rounded-lg bg-red-50 border border-red-200 p-6">
          <h2 className="font-semibold text-red-900">Access denied</h2>
          <p className="text-sm text-red-800 mt-1">Your account is not flagged as a platform admin.</p>
        </div>
      </div>
    );
  }

  if (selectedId !== null) {
    return <DistrictDetailView districtId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Pilot Support</h1>
        <p className="text-sm text-gray-500 mt-1">Triage districts, inspect data health, and diagnose dashboard discrepancies.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search districts…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <select
          value={modeFilter}
          onChange={(e) => setModeFilter(e.target.value as DistrictMode | "all")}
          className="border border-gray-300 rounded-md px-3 py-2 text-sm"
        >
          <option value="all">All modes</option>
          <option value="demo">Demo</option>
          <option value="pilot">Pilot</option>
          <option value="paid">Paid</option>
          <option value="trial">Trial</option>
          <option value="unpaid">Unpaid</option>
          <option value="unconfigured">Unconfigured</option>
        </select>
        <span className="text-sm text-gray-500 ml-auto">{filtered.length} of {districts?.length ?? 0}</span>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2 font-medium">District</th>
              <th className="px-4 py-2 font-medium">Mode</th>
              <th className="px-4 py-2 font-medium text-right">Students</th>
              <th className="px-4 py-2 font-medium text-right">Staff</th>
              <th className="px-4 py-2 font-medium text-right">Sessions (7d)</th>
              <th className="px-4 py-2 font-medium">Last session</th>
              <th className="px-4 py-2 font-medium">Last sync</th>
              <th className="px-4 py-2 font-medium text-right">Critical</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No districts match.</td></tr>
            )}
            {filtered.map((d) => {
              const badge = MODE_BADGE[d.mode];
              const Icon = badge.icon;
              const stale = d.lastSessionDate
                ? Math.floor((Date.now() - new Date(d.lastSessionDate).getTime()) / 86400000) > 14
                : true;
              return (
                <tr key={d.districtId} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-900">{d.name}</div>
                        <div className="text-xs text-gray-500">{d.state || "—"} · #{d.districtId}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                      <Icon className="h-3 w-3" />{badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{d.activeStudents}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{d.activeStaff}</td>
                  <td className={`px-4 py-3 text-right ${d.sessionsLast7d === 0 ? "text-red-600 font-medium" : "text-gray-700"}`}>{d.sessionsLast7d}</td>
                  <td className={`px-4 py-3 ${stale ? "text-amber-700" : "text-gray-700"}`}>{fmtRelative(d.lastSessionDate)}</td>
                  <td className="px-4 py-3 text-gray-700">{fmtRelative(d.lastSyncAt)}</td>
                  <td className={`px-4 py-3 text-right ${d.openCriticalAlerts > 0 ? "text-red-600 font-medium" : "text-gray-400"}`}>{d.openCriticalAlerts}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setSelectedId(d.districtId)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RecentImportsPanel />
    </div>
  );
}

function RecentImportsPanel() {
  const [imports, setImports] = useState<ImportEntry[] | null>(null);
  useEffect(() => {
    apiGet<{ imports: ImportEntry[] }>("/support/imports/recent?limit=15")
      .then((r) => setImports(r.imports))
      .catch(() => setImports([]));
  }, []);
  if (!imports) return null;
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><FileWarning className="h-4 w-4 text-gray-500" />Recent CSV imports (global)</h2>
        <span className="text-xs text-gray-500">Imports table is not district-scoped — this is a global feed.</span>
      </div>
      {imports.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-500">No recent imports.</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">File</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium text-right">Imported / Errored</th>
              <th className="px-4 py-2 font-medium">Error summary</th>
            </tr>
          </thead>
          <tbody>
            {imports.map((i) => (
              <tr key={i.id} className="border-t border-gray-100">
                <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{fmtRelative(i.createdAt)}</td>
                <td className="px-4 py-2 text-gray-700">{i.importType}</td>
                <td className="px-4 py-2 text-gray-700 truncate max-w-[200px]">{i.fileName || "—"}</td>
                <td className="px-4 py-2">
                  <StatusPill status={i.status} />
                </td>
                <td className="px-4 py-2 text-right text-gray-700">
                  {i.rowsImported ?? 0} / <span className={i.rowsErrored ? "text-red-600 font-medium" : ""}>{i.rowsErrored ?? 0}</span>
                </td>
                <td className="px-4 py-2 text-xs text-gray-600 max-w-md truncate" title={i.errorSummary ?? ""}>{i.errorSummary || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const okStatuses = new Set(["completed", "success", "active"]);
  const errorStatuses = new Set(["failed", "error", "canceled"]);
  const cls = okStatuses.has(status) ? "bg-emerald-100 text-emerald-800"
    : errorStatuses.has(status) ? "bg-red-100 text-red-800"
    : "bg-amber-100 text-amber-800";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{status}</span>;
}

function DistrictDetailView({ districtId, onBack }: { districtId: number; onBack: () => void }) {
  const [detail, setDetail] = useState<DistrictDetail | null>(null);
  const [health, setHealth] = useState<DataHealthReport | null>(null);
  const [inactive, setInactive] = useState<InactiveStaff[] | null>(null);
  const [syncs, setSyncs] = useState<SyncLogEntry[] | null>(null);
  const [metrics, setMetrics] = useState<MetricDebug | null>(null);
  const [tab, setTab] = useState<"overview" | "health" | "inactive" | "syncs" | "metrics">("overview");
  const [days, setDays] = useState(14);

  useEffect(() => {
    apiGet<DistrictDetail>(`/support/districts/${districtId}`).then(setDetail).catch(() => {});
    apiGet<DataHealthReport>(`/support/districts/${districtId}/data-health`).then(setHealth).catch(() => {});
    apiGet<{ syncs: SyncLogEntry[] }>(`/support/districts/${districtId}/recent-syncs`).then((r) => setSyncs(r.syncs)).catch(() => setSyncs([]));
    apiGet<MetricDebug>(`/support/districts/${districtId}/metric-debug`).then(setMetrics).catch(() => {});
  }, [districtId]);

  useEffect(() => {
    apiGet<{ inactiveStaff: InactiveStaff[] }>(`/support/districts/${districtId}/inactive-staff?days=${days}`)
      .then((r) => setInactive(r.inactiveStaff)).catch(() => setInactive([]));
  }, [districtId, days]);

  if (!detail) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const badge = MODE_BADGE[detail.mode];
  const Icon = badge.icon;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" /> Back to districts
      </button>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{detail.district.name}</h1>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
              <Icon className="h-3 w-3" />{badge.label}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {detail.district.state || "—"} · District #{detail.district.id} · Tier: <span className="font-medium">{detail.district.tier}</span>
            {detail.subscription && <> · Plan: <span className="font-medium">{detail.subscription.planTier}</span></>}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Active students" value={detail.counts.activeStudents} sub={`of ${detail.counts.totalStudents} total`} />
        <StatCard label="Active staff" value={detail.counts.activeStaff} sub={`of ${detail.counts.totalStaff} total`} />
        <StatCard label="Sessions last 7d" value={detail.counts.sessionsLast7d} sub={`${detail.counts.missedLast7d} missed`} warn={detail.counts.sessionsLast7d === 0} />
        <StatCard label="Last sync" value={fmtRelative(detail.activity.lastSyncAt)} sub={`${detail.activity.sisConnections.length} connection(s)`} />
      </div>

      <div className="border-b border-gray-200 flex gap-1">
        {([
          ["overview", "Overview", Activity],
          ["health", "Data health", health ? `(${health.summary.critical}c/${health.summary.warnings}w)` : ""],
          ["inactive", "Inactive providers", inactive ? `(${inactive.length})` : ""],
          ["syncs", "SIS sync log", syncs ? `(${syncs.length})` : ""],
          ["metrics", "Metric debug", ""],
        ] as Array<[string, string, unknown]>).map(([key, label, badge]) => (
          <button
            key={key}
            onClick={() => setTab(key as typeof tab)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === key ? "border-blue-600 text-blue-700" : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {label} {typeof badge === "string" && badge && <span className="text-xs text-gray-400 ml-1">{badge}</span>}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <OverviewTab detail={detail} />
      )}
      {tab === "health" && (
        <HealthTab health={health} />
      )}
      {tab === "inactive" && (
        <InactiveTab staff={inactive} days={days} setDays={setDays} />
      )}
      {tab === "syncs" && (
        <SyncsTab syncs={syncs} />
      )}
      {tab === "metrics" && (
        <MetricsTab metrics={metrics} />
      )}
    </div>
  );
}

function StatCard({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div className={`bg-white rounded-lg border p-4 ${warn ? "border-red-200" : "border-gray-200"}`}>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={`text-xl font-semibold mt-1 ${warn ? "text-red-700" : "text-gray-900"}`}>{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

function OverviewTab({ detail }: { detail: DistrictDetail }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Section title="Subscription">
        {detail.subscription ? (
          <dl className="text-sm space-y-1">
            <Row label="Plan tier" value={detail.subscription.planTier} />
            <Row label="Status" value={<StatusPill status={detail.subscription.status} />} />
            <Row label="Seat limit (advisory)" value={String(detail.subscription.seatLimit)} />
            <Row label="Renews" value={fmtDate(detail.subscription.currentPeriodEnd)} />
            <Row label="Add-ons" value={detail.subscription.addOns.length === 0 ? "None" : detail.subscription.addOns.join(", ")} />
            <Row label="Stripe customer" value={detail.subscription.stripeCustomerId || "—"} />
          </dl>
        ) : <p className="text-sm text-gray-500">No subscription on file.</p>}
      </Section>
      <Section title="SIS connections">
        {detail.activity.sisConnections.length === 0 ? (
          <p className="text-sm text-gray-500">No SIS connections configured.</p>
        ) : (
          <ul className="text-sm space-y-2">
            {detail.activity.sisConnections.map((c) => (
              <li key={c.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-800">{c.label}</div>
                  <div className="text-xs text-gray-500">{c.provider} · {c.enabled ? "enabled" : "disabled"} · last sync {fmtRelative(c.lastSyncAt)}</div>
                </div>
                <StatusPill status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function HealthTab({ health }: { health: DataHealthReport | null }) {
  if (!health) return <Loader2 className="h-6 w-6 animate-spin text-gray-400" />;
  const issueChecks = health.checks.filter((c) => c.count > 0);
  const sevIcon = (s: string) => s === "critical" ? <XCircle className="h-4 w-4 text-red-600" /> : s === "warning" ? <AlertTriangle className="h-4 w-4 text-amber-600" /> : <CheckCircle className="h-4 w-4 text-emerald-600" />;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">{health.summary.critical} critical</span>
        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">{health.summary.warnings} warnings</span>
        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">{health.summary.passed} passed</span>
        <span className="text-gray-500">of {health.summary.checksRun} checks</span>
      </div>
      {issueChecks.length === 0 ? (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          All checks passed.
        </div>
      ) : (
        <div className="space-y-3">
          {issueChecks.map((c) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-2">
                  {sevIcon(c.severity)}
                  <div>
                    <div className="font-medium text-gray-900">{c.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{c.description}</div>
                  </div>
                </div>
                <div className="text-sm text-gray-600 ml-4 whitespace-nowrap">
                  <span className="font-semibold text-gray-900">{c.count}</span> / {c.total}
                </div>
              </div>
              {c.items.length > 0 && (
                <ul className="mt-3 text-xs text-gray-600 space-y-0.5 max-h-40 overflow-y-auto">
                  {c.items.map((it) => (
                    <li key={`${c.id}-${it.id}`}>· <span className="font-medium text-gray-800">{it.label}</span> — {it.detail}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InactiveTab({ staff, days, setDays }: { staff: InactiveStaff[] | null; days: number; setDays: (n: number) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm">
        <label className="text-gray-700">Lookback window:</label>
        {[7, 14, 30, 60, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-2 py-1 rounded ${days === d ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            {d} days
          </button>
        ))}
      </div>
      {!staff ? <Loader2 className="h-6 w-6 animate-spin text-gray-400" /> : staff.length === 0 ? (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
          Every clinical staff member logged at least one session in the last {days} days.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-2 font-medium">Staff</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Last session</th>
                <th className="px-4 py-2 font-medium text-right">Assigned</th>
                <th className="px-4 py-2 font-medium text-right">Schedule blocks</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-4 py-2 text-gray-900">{s.name}</td>
                  <td className="px-4 py-2 text-gray-700">{s.role}</td>
                  <td className="px-4 py-2 text-gray-600 text-xs">{s.email || "—"}</td>
                  <td className="px-4 py-2 text-gray-700">{fmtRelative(s.lastSessionDate)}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{s.assignedStudents}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{s.scheduleBlocks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SyncsTab({ syncs }: { syncs: SyncLogEntry[] | null }) {
  if (!syncs) return <Loader2 className="h-6 w-6 animate-spin text-gray-400" />;
  if (syncs.length === 0) return <div className="text-sm text-gray-500">No sync log entries.</div>;
  return (
    <div className="space-y-2">
      {syncs.map((s) => (
        <div key={s.id} className="bg-white border border-gray-200 rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-gray-400" />
              <span className="font-medium text-gray-900">{s.connectionLabel}</span>
              <span className="text-xs text-gray-500">{s.provider}</span>
              <StatusPill status={s.status} />
            </div>
            <span className="text-xs text-gray-500">{fmtRelative(s.startedAt)}</span>
          </div>
          <div className="mt-1 text-xs text-gray-600">
            +{s.studentsAdded} / ~{s.studentsUpdated} students, +{s.staffAdded} / ~{s.staffUpdated} staff · {s.syncType}
          </div>
          {s.errors.length > 0 && (
            <ul className="mt-1 text-xs text-red-700 list-disc list-inside">
              {s.errors.slice(0, 5).map((e, idx) => <li key={idx}>{e.field ? `${e.field}: ` : ""}{e.message}</li>)}
            </ul>
          )}
          {s.warnings.length > 0 && (
            <ul className="mt-1 text-xs text-amber-700 list-disc list-inside">
              {s.warnings.slice(0, 3).map((w, idx) => <li key={idx}>{w.field ? `${w.field}: ` : ""}{w.message}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function MetricsTab({ metrics }: { metrics: MetricDebug | null }) {
  if (!metrics) return <Loader2 className="h-6 w-6 animate-spin text-gray-400" />;
  if (!metrics.snapshot || !metrics.sessions) {
    return <div className="text-sm text-gray-500">District has no schools — no metrics to compute.</div>;
  }
  const s = metrics.snapshot, sess = metrics.sessions;
  const pctCompleted7d = sess.last7d.total === 0 ? 0 : Math.round((sess.last7d.completed / sess.last7d.total) * 100);
  const pctCompleted30d = sess.last30d.total === 0 ? 0 : Math.round((sess.last30d.completed / sess.last30d.total) * 100);
  const trend = sess.prev7d.total === 0 ? null : Math.round(((sess.last7d.total - sess.prev7d.total) / sess.prev7d.total) * 100);
  return (
    <div className="space-y-4">
      <Section title="Snapshot — what the dashboard reads from">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <Row label="Active students" value={String(s.activeStudents)} />
          <Row label="Total students (incl. archived)" value={String(s.totalStudents)} />
          <Row label="Active staff" value={String(s.activeStaff)} />
          <Row label="Active service requirements" value={String(s.activeServiceReqs)} />
          <Row label="Service reqs missing provider" value={String(s.reqsMissingProvider)} warn={s.reqsMissingProvider > 0} />
          <Row label="Active schedule blocks" value={String(s.activeScheduleBlocks)} />
          <Row label="IEP documents on file" value={String(s.iepDocuments)} />
          <Row label="Active goals" value={String(s.activeGoals)} />
        </dl>
      </Section>
      <Section title="Sessions — windowed counts">
        <dl className="text-sm space-y-1">
          <Row label="Last 7 days" value={`${sess.last7d.total} (${sess.last7d.completed} completed, ${sess.last7d.missed} missed) — ${pctCompleted7d}% completion`} />
          <Row label="Previous 7 days" value={`${sess.prev7d.total} ${trend !== null ? `(${trend > 0 ? "+" : ""}${trend}% week-over-week)` : ""}`} />
          <Row label="Last 30 days" value={`${sess.last30d.total} (${sess.last30d.completed} completed, ${sess.last30d.missed} missed) — ${pctCompleted30d}% completion`} />
          <Row label="Distinct providers logging in 30d" value={`${sess.last30d.distinctLoggers} of ${s.activeStaff} active staff`} warn={s.activeStaff > 0 && sess.last30d.distinctLoggers / s.activeStaff < 0.5} />
        </dl>
      </Section>
      <p className="text-xs text-gray-500">
        These are the underlying counts the dashboard widgets aggregate. If the dashboard shows
        unexpected numbers, compare here first — discrepancies typically come from school scope,
        archived students, or session status filters.
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="font-semibold text-gray-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`font-medium ${warn ? "text-red-700" : "text-gray-900"}`}>{value}</dd>
    </div>
  );
}
