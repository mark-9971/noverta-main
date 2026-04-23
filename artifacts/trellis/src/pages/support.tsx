import { useState, useEffect, useMemo } from "react";
import { apiGet } from "@/lib/api";
import { useRole } from "@/lib/role-context";
import { useViewAs } from "@/lib/view-as-context";
import {
  Building2, Loader2, Search, AlertTriangle, CheckCircle, XCircle,
  Activity, Database, Users, FileWarning, ArrowLeft, ExternalLink, Clock,
  Sparkles, FlaskConical, CreditCard, ShieldOff, ListChecks, Mail, Lock,
  Layers, UserSearch, ShieldAlert,
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

interface ReadinessCheck { key: string; label: string; status: "ok" | "warn" | "fail" | "info"; message: string; group?: string }
interface ReadinessReport { districtId: number; summary: { passed: number; warnings: number; failures: number; checksRun: number }; checks: ReadinessCheck[] }
interface OnboardingStep { stepKey: string; completed: boolean; completedAt: string | null; updatedAt: string | null }
interface DistrictEmailEvent {
  id: number; status: string; type: string; subject: string;
  toEmail: string | null; toName: string | null; failedReason: string | null;
  sentAt: string | null; deliveredAt: string | null; failedAt: string | null;
  createdAt: string; studentName: string;
}
interface DistrictEmailReport {
  providerConfigured: boolean;
  summary: Record<string, number> | null;
  events: DistrictEmailEvent[];
}
interface FeatureAccessReport {
  districtId: number;
  isDemo: boolean; isPilot: boolean;
  baseTier: string; baseTierLabel: string;
  effectiveTier: string; effectiveTierLabel: string;
  tierOverridden: boolean;
  subscriptionPlanTier: string | null;
  subscriptionStatus: string | null;
  addOns: string[];
  grantsAllAccess: boolean;
  modules: Array<{
    moduleKey: string; moduleLabel: string;
    accessible: boolean; accessReason: string;
    features: Array<{ featureKey: string; accessible: boolean }>;
  }>;
}
interface AccessDenialEntry {
  at: string; kind: string; status: number; method: string; path: string;
  actorUserId: string | null; actorRole: string | null; districtId: number | null;
  ip: string | null; detail: string | null;
}
interface EmailStatusReport {
  providerConfigured: boolean; providerName: string; window: string;
  summary: Record<string, number>;
  recentFailures: Array<{ id: number; type: string; subject: string; toEmail: string | null; failedReason: string | null; failedAt: string | null; createdAt: string }>;
}
interface UserLookupReport {
  query: string;
  staffMatches: Array<{ staffId: number; name: string; email: string; role: string; status: string; schoolName: string | null; districtId: number | null; districtName: string | null; active: boolean }>;
  clerk: null | { userId: string; primaryEmail: string | null; role: string | null; districtId: number | null; staffId: number | null; platformAdmin: boolean; createdAt: number | null; lastSignInAt: number | null; viewAsAllowed: boolean };
  recentAudit: Array<{ id: number; action: string; targetTable: string | null; targetId: string | number | null; summary: string | null; createdAt: string }>;
  drift: string[];
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
          <p className="text-sm text-amber-800 mt-1">This page is reserved for Noverta support staff.</p>
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
      <EmailServiceStatusPanel />
      <AccessDenialsPanel />
      <UserLookupPanel />
    </div>
  );
}

function EmailServiceStatusPanel() {
  const [data, setData] = useState<EmailStatusReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    apiGet<EmailStatusReport>("/support/email-status").then(setData).catch((e) => setErr(String(e)));
  }, []);
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Email service status</h2>
        </div>
        {data && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${data.providerConfigured ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            {data.providerConfigured ? `${data.providerName}: configured` : "RESEND_API_KEY missing"}
          </span>
        )}
      </div>
      <div className="p-4 text-sm">
        {err && <div className="text-red-600">Failed to load: {err}</div>}
        {!data && !err && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
        {data && (
          <>
            <div className="flex flex-wrap gap-2 mb-3 text-xs">
              <span className="text-gray-500">{data.window}:</span>
              {Object.entries(data.summary).length === 0
                ? <span className="text-gray-500">No events sent.</span>
                : Object.entries(data.summary).map(([s, n]) => (
                    <span key={s} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                      {s}: <span className="font-medium">{n}</span>
                    </span>
                  ))}
            </div>
            {data.recentFailures.length === 0 ? (
              <div className="text-xs text-gray-500">No recent email failures.</div>
            ) : (
              <div className="border border-gray-200 rounded">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-left text-gray-500 uppercase">
                    <tr>
                      <th className="px-2 py-1">When</th>
                      <th className="px-2 py-1">Type</th>
                      <th className="px-2 py-1">To</th>
                      <th className="px-2 py-1">Failure reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.recentFailures.map((f) => (
                      <tr key={f.id}>
                        <td className="px-2 py-1 text-gray-600">{fmtRelative(f.createdAt)}</td>
                        <td className="px-2 py-1 font-mono">{f.type}</td>
                        <td className="px-2 py-1">{f.toEmail ?? "—"}</td>
                        <td className="px-2 py-1 text-red-700">{f.failedReason ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AccessDenialsPanel() {
  const [data, setData] = useState<{ denials: AccessDenialEntry[]; note: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const refresh = () => {
    apiGet<{ denials: AccessDenialEntry[]; note: string }>("/support/access-denials?limit=200")
      .then(setData).catch((e) => setErr(String(e)));
  };
  useEffect(() => { refresh(); }, []);
  const filtered = data?.denials.filter((d) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return d.kind.toLowerCase().includes(q)
      || d.path.toLowerCase().includes(q)
      || (d.actorUserId ?? "").toLowerCase().includes(q)
      || (d.actorRole ?? "").toLowerCase().includes(q)
      || String(d.districtId ?? "").includes(q)
      || (d.detail ?? "").toLowerCase().includes(q);
  }) ?? [];
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <ShieldOff className="h-4 w-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-900">Recent access denials (401/403)</h2>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by path, role, kind, user…"
            className="text-xs px-2 py-1 border border-gray-300 rounded w-64"
          />
          <button onClick={refresh} className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50">Refresh</button>
        </div>
      </div>
      <div className="p-4 text-sm">
        {err && <div className="text-red-600 text-xs">Failed to load: {err}</div>}
        {!data && !err && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
        {data && (
          <>
            <div className="text-xs text-gray-500 mb-2">{data.note} · Showing {filtered.length} of {data.denials.length}.</div>
            {filtered.length === 0 ? (
              <div className="text-xs text-gray-500">No matching denials recorded.</div>
            ) : (
              <div className="border border-gray-200 rounded max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-left text-gray-500 uppercase sticky top-0">
                    <tr>
                      <th className="px-2 py-1">When</th>
                      <th className="px-2 py-1">Status</th>
                      <th className="px-2 py-1">Kind</th>
                      <th className="px-2 py-1">Method/Path</th>
                      <th className="px-2 py-1">User</th>
                      <th className="px-2 py-1">Role</th>
                      <th className="px-2 py-1">District</th>
                      <th className="px-2 py-1">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((d, i) => (
                      <tr key={`${d.at}-${i}`}>
                        <td className="px-2 py-1 text-gray-600 whitespace-nowrap">{fmtRelative(d.at)}</td>
                        <td className="px-2 py-1">
                          <span className={`px-1.5 py-0.5 rounded font-medium ${d.status >= 500 ? "bg-red-100 text-red-700" : d.status === 403 ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700"}`}>{d.status}</span>
                        </td>
                        <td className="px-2 py-1 font-mono">{d.kind}</td>
                        <td className="px-2 py-1 font-mono text-gray-700">{d.method} {d.path}</td>
                        <td className="px-2 py-1 font-mono">{d.actorUserId ?? "—"}</td>
                        <td className="px-2 py-1">{d.actorRole ?? "—"}</td>
                        <td className="px-2 py-1">{d.districtId ?? "—"}</td>
                        <td className="px-2 py-1 text-gray-600 max-w-md truncate" title={d.detail ?? ""}>{d.detail ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface ViewAsCandidate {
  userId: string;
  role: string;
  displayName: string;
  districtId: number | null;
  staffId: number | null;
}

function ViewAsStartDialog({ candidate, onClose }: { candidate: ViewAsCandidate; onClose: () => void }) {
  const { startSession } = useViewAs();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [policyBlocked, setPolicyBlocked] = useState(false);
  const tooShort = reason.trim().length < 8;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tooShort || submitting || policyBlocked) return;
    setSubmitting(true); setErr(null);
    const r = await startSession({
      targetUserId: candidate.userId,
      reason: reason.trim(),
      targetSnapshot: {
        role: candidate.role,
        displayName: candidate.displayName,
        districtId: candidate.districtId,
        staffId: candidate.staffId,
      },
    });
    setSubmitting(false);
    if (!r.ok) {
      setErr(r.error);
      if (r.policyBlocked) setPolicyBlocked(true);
      return;
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      data-testid="view-as-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-3">
          <ShieldAlert className="h-6 w-6 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-gray-900">Start view-as session</h3>
            <p className="text-xs text-gray-600 mt-1">
              You'll act as <span className="font-medium">{candidate.displayName}</span>{" "}
              <span className="font-mono text-gray-500">({candidate.role})</span> for up to 30 minutes.
              All actions you take will be tagged in the audit log with your admin identity.
            </p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Reason <span className="text-red-600">*</span>{" "}
              <span className="text-gray-500 font-normal">(min 8 chars, required)</span>
            </label>
            <textarea
              data-testid="view-as-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Investigating ticket #4821 — user reports IEP draft won't save"
              className="w-full text-sm px-3 py-2 border border-gray-300 rounded resize-none"
              autoFocus
            />
          </div>
          {err && (
            policyBlocked ? (
              <div
                className="rounded border border-amber-300 bg-amber-50 p-3 text-xs"
                data-testid="view-as-policy-block"
                role="alert"
              >
                <div className="flex items-start gap-2">
                  <ShieldAlert className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="font-semibold text-amber-900 mb-0.5">View-as blocked by policy</div>
                    <div className="text-amber-800" data-testid="view-as-error">{err}</div>
                    <div className="text-amber-700 mt-1">
                      This restriction is contractual. Contact the customer's account owner if a temporary exception is needed.
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-red-600" data-testid="view-as-error">{err}</div>
            )
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50"
            >Cancel</button>
            <button
              type="submit"
              disabled={tooShort || submitting || policyBlocked}
              data-testid="view-as-submit"
              className="text-sm px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 inline-flex items-center gap-1"
            >
              {submitting ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldAlert className="h-3 w-3" />}
              Start session
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UserLookupPanel() {
  const [q, setQ] = useState("");
  const [data, setData] = useState<UserLookupReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [viewAsCandidate, setViewAsCandidate] = useState<ViewAsCandidate | null>(null);
  const { isActive: viewAsActive } = useViewAs();
  const lookup = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true); setErr(null); setData(null);
    apiGet<UserLookupReport>(`/support/users/lookup?q=${encodeURIComponent(q.trim())}`)
      .then((r) => { setData(r); setLoading(false); })
      .catch((e2) => { setErr(String(e2)); setLoading(false); });
  };
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      {viewAsCandidate && (
        <ViewAsStartDialog candidate={viewAsCandidate} onClose={() => setViewAsCandidate(null)} />
      )}
      <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
        <UserSearch className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">User lookup</h2>
      </div>
      <div className="p-4">
        <form onSubmit={lookup} className="flex gap-2 mb-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Email address or Clerk user ID (user_…)"
            className="flex-1 text-sm px-3 py-1.5 border border-gray-300 rounded"
          />
          <button type="submit" className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Look up"}
          </button>
        </form>
        {err && <div className="text-red-600 text-xs">{err}</div>}
        {data && (
          <div className="space-y-3">
            {data.drift.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs space-y-1">
                <div className="font-medium text-amber-900 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />Discrepancies
                </div>
                {data.drift.map((d, i) => <div key={i} className="text-amber-800">• {d}</div>)}
              </div>
            )}
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              <div className="border border-gray-200 rounded p-3">
                <div className="font-semibold text-gray-700 mb-2 flex items-center gap-1"><Users className="h-3 w-3" />Staff matches ({data.staffMatches.length})</div>
                {data.staffMatches.length === 0
                  ? <div className="text-gray-500">No staff rows found.</div>
                  : data.staffMatches.map((s) => (
                      <div key={s.staffId} className="border-t border-gray-100 pt-1 mt-1 first:border-0 first:mt-0 first:pt-0">
                        <div className="font-medium">{s.name} <span className="font-mono text-gray-500">#{s.staffId}</span></div>
                        <div className="text-gray-600">{s.email} · {s.role} · {s.active ? "active" : "inactive"}</div>
                        <div className="text-gray-500">{s.districtName ?? "no district"} → {s.schoolName ?? "no school"}</div>
                      </div>
                    ))}
              </div>
              <div className="border border-gray-200 rounded p-3">
                <div className="font-semibold text-gray-700 mb-2 flex items-center gap-1"><Lock className="h-3 w-3" />Clerk record</div>
                {!data.clerk
                  ? <div className="text-gray-500">No Clerk user found for this identifier.</div>
                  : (
                    <div className="space-y-0.5">
                      <div><span className="text-gray-500">User ID:</span> <span className="font-mono">{data.clerk.userId}</span></div>
                      <div><span className="text-gray-500">Email:</span> {data.clerk.primaryEmail ?? "—"}</div>
                      <div><span className="text-gray-500">Role (metadata):</span> {data.clerk.role ?? "—"}</div>
                      <div><span className="text-gray-500">District (metadata):</span> {data.clerk.districtId ?? "—"}</div>
                      <div><span className="text-gray-500">Staff (metadata):</span> {data.clerk.staffId ?? "—"}</div>
                      <div><span className="text-gray-500">Platform admin:</span> {data.clerk.platformAdmin ? "yes" : "no"}</div>
                      <div><span className="text-gray-500">Last sign in:</span> {data.clerk.lastSignInAt ? fmtRelative(new Date(data.clerk.lastSignInAt).toISOString()) : "never"}</div>
                      {data.clerk.role && !data.clerk.platformAdmin && (
                        <div className="pt-2 mt-2 border-t border-gray-100 space-y-1">
                          <button
                            type="button"
                            data-testid="view-as-start-button"
                            disabled={viewAsActive || !data.clerk.viewAsAllowed}
                            onClick={() => setViewAsCandidate({
                              userId: data.clerk!.userId,
                              role: data.clerk!.role!,
                              displayName: data.clerk!.primaryEmail ?? data.clerk!.userId,
                              districtId: data.clerk!.districtId ?? null,
                              staffId: data.clerk!.staffId ?? null,
                            })}
                            title={
                              !data.clerk.viewAsAllowed
                                ? `View-as is not permitted for the role "${data.clerk.role}" in this district. This restriction may be contractual (e.g. PHI access under a clinical provider identity).`
                                : viewAsActive
                                ? "End the current view-as session before starting another"
                                : "Open the view-as start dialog"
                            }
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <ShieldAlert className="h-3 w-3" />
                            {viewAsActive ? "View-as already active" : "View as this user…"}
                          </button>
                          {!data.clerk.viewAsAllowed && (
                            <p className="text-xs text-red-700 flex items-center gap-1">
                              <ShieldAlert className="h-3 w-3 shrink-0" />
                              View-as is blocked for role <span className="font-mono font-medium">{data.clerk.role}</span> in this district.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
              </div>
            </div>
            <div className="border border-gray-200 rounded p-3 text-xs">
              <div className="font-semibold text-gray-700 mb-2 flex items-center gap-1"><ListChecks className="h-3 w-3" />Recent audit activity ({data.recentAudit.length})</div>
              {data.recentAudit.length === 0
                ? <div className="text-gray-500">No audit log entries for this user.</div>
                : (
                  <table className="w-full">
                    <tbody className="divide-y divide-gray-100">
                      {data.recentAudit.map((a) => (
                        <tr key={a.id}>
                          <td className="py-1 text-gray-500 whitespace-nowrap pr-2">{fmtRelative(a.createdAt)}</td>
                          <td className="py-1 font-mono pr-2">{a.action}</td>
                          <td className="py-1 text-gray-600 pr-2">{a.targetTable ?? ""}{a.targetId ? `#${a.targetId}` : ""}</td>
                          <td className="py-1 text-gray-700">{a.summary ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
            </div>
          </div>
        )}
      </div>
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
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [onboarding, setOnboarding] = useState<OnboardingStep[] | null>(null);
  const [emails, setEmails] = useState<DistrictEmailReport | null>(null);
  const [features, setFeatures] = useState<FeatureAccessReport | null>(null);
  const [tab, setTab] = useState<
    "overview" | "health" | "readiness" | "onboarding" | "tier" | "emails" | "inactive" | "syncs" | "metrics"
  >("overview");
  const [days, setDays] = useState(14);

  useEffect(() => {
    apiGet<DistrictDetail>(`/support/districts/${districtId}`).then(setDetail).catch(() => {});
    apiGet<DataHealthReport>(`/support/districts/${districtId}/data-health`).then(setHealth).catch(() => {});
    apiGet<{ syncs: SyncLogEntry[] }>(`/support/districts/${districtId}/recent-syncs`).then((r) => setSyncs(r.syncs)).catch(() => setSyncs([]));
    apiGet<MetricDebug>(`/support/districts/${districtId}/metric-debug`).then(setMetrics).catch(() => {});
    apiGet<ReadinessReport>(`/support/districts/${districtId}/readiness`).then(setReadiness).catch(() => {});
    apiGet<{ steps: OnboardingStep[] }>(`/support/districts/${districtId}/onboarding`).then((r) => setOnboarding(r.steps)).catch(() => setOnboarding([]));
    apiGet<DistrictEmailReport>(`/support/districts/${districtId}/recent-emails?limit=50`).then(setEmails).catch(() => {});
    apiGet<FeatureAccessReport>(`/support/districts/${districtId}/feature-access`).then(setFeatures).catch(() => {});
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

      <div className="border-b border-gray-200 flex gap-1 flex-wrap">
        {([
          ["overview", "Overview", ""],
          ["health", "Data health", health ? `(${health.summary.critical}c/${health.summary.warnings}w)` : ""],
          ["readiness", "Pilot readiness", readiness ? `(${readiness.summary.failures}f/${readiness.summary.warnings}w)` : ""],
          ["onboarding", "Onboarding", onboarding ? `(${onboarding.filter(s => s.completed).length}/${onboarding.length})` : ""],
          ["tier", "Feature access", features ? `(${features.effectiveTier})` : ""],
          ["emails", "Emails", emails ? `(${emails.summary?.failed ?? 0} failed)` : ""],
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
      {tab === "readiness" && (
        <ReadinessTab report={readiness} />
      )}
      {tab === "onboarding" && (
        <OnboardingTab steps={onboarding} />
      )}
      {tab === "tier" && (
        <FeatureAccessTab report={features} />
      )}
      {tab === "emails" && (
        <DistrictEmailsTab report={emails} />
      )}
    </div>
  );
}

function ReadinessTab({ report }: { report: ReadinessReport | null }) {
  if (!report) return <Loader2 className="h-6 w-6 animate-spin text-gray-400" />;
  const groups = new Map<string, ReadinessCheck[]>();
  for (const c of report.checks) {
    const g = c.group || "general";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(c);
  }
  const STATUS: Record<ReadinessCheck["status"], { cls: string; icon: typeof CheckCircle; label: string }> = {
    ok: { cls: "text-emerald-700 bg-emerald-50", icon: CheckCircle, label: "OK" },
    warn: { cls: "text-amber-700 bg-amber-50", icon: AlertTriangle, label: "Warning" },
    fail: { cls: "text-red-700 bg-red-50", icon: XCircle, label: "Fail" },
    info: { cls: "text-gray-700 bg-gray-50", icon: Activity, label: "Info" },
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-medium">{report.summary.failures} failures</span>
        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">{report.summary.warnings} warnings</span>
        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium">{report.summary.passed} passed</span>
        <span className="text-gray-500">of {report.summary.checksRun} checks</span>
      </div>
      {Array.from(groups.entries()).map(([groupName, checks]) => (
        <div key={groupName} className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">{groupName}</div>
          <ul className="divide-y divide-gray-100">
            {checks.map((c) => {
              const s = STATUS[c.status];
              const SIcon = s.icon;
              return (
                <li key={c.key} className="px-3 py-2 flex items-start gap-3">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>
                    <SIcon className="h-3 w-3" />{s.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900">{c.label}</div>
                    <div className="text-xs text-gray-600">{c.message}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function OnboardingTab({ steps }: { steps: OnboardingStep[] | null }) {
  if (!steps) return <Loader2 className="h-6 w-6 animate-spin text-gray-400" />;
  if (steps.length === 0) {
    return <div className="text-sm text-gray-500">No onboarding progress recorded yet for this district.</div>;
  }
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-3 py-2">Step</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Completed at</th>
            <th className="px-3 py-2">Last updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {steps.map((s) => (
            <tr key={s.stepKey}>
              <td className="px-3 py-2 font-mono text-xs">{s.stepKey}</td>
              <td className="px-3 py-2">
                {s.completed
                  ? <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium"><CheckCircle className="h-3 w-3" />Done</span>
                  : <span className="inline-flex items-center gap-1 text-gray-500 text-xs"><Clock className="h-3 w-3" />Pending</span>}
              </td>
              <td className="px-3 py-2 text-gray-600">{s.completedAt ? fmtRelative(s.completedAt) : "—"}</td>
              <td className="px-3 py-2 text-gray-600">{s.updatedAt ? fmtRelative(s.updatedAt) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeatureAccessTab({ report }: { report: FeatureAccessReport | null }) {
  if (!report) return <Loader2 className="h-6 w-6 animate-spin text-gray-400" />;
  return (
    <div className="space-y-4">
      <div className="border border-gray-200 rounded-lg p-4 bg-white">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-gray-500">Base tier</div>
            <div className="font-medium">{report.baseTierLabel}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Effective tier</div>
            <div className="font-medium">
              {report.effectiveTierLabel}
              {report.tierOverridden && <span className="ml-2 text-xs px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded">override</span>}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Subscription</div>
            <div className="font-medium">{report.subscriptionPlanTier ?? "—"} <span className="text-xs text-gray-500">{report.subscriptionStatus ?? "no row"}</span></div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Add-ons</div>
            <div className="font-medium">{report.addOns.length === 0 ? "none" : report.addOns.join(", ")}</div>
          </div>
        </div>
        {report.grantsAllAccess && (
          <div className="mt-3 text-xs text-violet-700 bg-violet-50 inline-flex items-center gap-1 px-2 py-1 rounded">
            <Sparkles className="h-3 w-3" />
            {report.isDemo ? "Demo district — all features open regardless of tier." : "Pilot district — all features open regardless of tier."}
          </div>
        )}
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Module</th>
              <th className="px-3 py-2">Access</th>
              <th className="px-3 py-2">Reason</th>
              <th className="px-3 py-2">Features</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.modules.map((m) => (
              <tr key={m.moduleKey}>
                <td className="px-3 py-2 font-medium">{m.moduleLabel} <span className="block text-xs font-mono text-gray-400">{m.moduleKey}</span></td>
                <td className="px-3 py-2">
                  {m.accessible
                    ? <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium"><CheckCircle className="h-3 w-3" />Accessible</span>
                    : <span className="inline-flex items-center gap-1 text-red-700 text-xs font-medium"><Lock className="h-3 w-3" />Gated</span>}
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">{m.accessReason}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{m.features.length} feature{m.features.length === 1 ? "" : "s"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DistrictEmailsTab({ report }: { report: DistrictEmailReport | null }) {
  if (!report) return <Loader2 className="h-6 w-6 animate-spin text-gray-400" />;
  const summary = report.summary ?? {};
  const summaryEntries = Object.entries(summary);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${report.providerConfigured ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
          <Mail className="h-3 w-3" />
          {report.providerConfigured ? "Email provider configured" : "RESEND_API_KEY missing — emails not sending"}
        </span>
        {summaryEntries.length === 0 && <span className="text-xs text-gray-500">No events in last 7 days.</span>}
        {summaryEntries.map(([status, n]) => (
          <span key={status} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">
            {status}: <span className="font-medium">{n}</span>
          </span>
        ))}
      </div>
      {report.events.length === 0 ? (
        <div className="text-sm text-gray-500">No notification events for this district yet.</div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">To</th>
                <th className="px-3 py-2">Student</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Failure reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.events.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2 text-xs text-gray-600">{fmtRelative(e.createdAt)}</td>
                  <td className="px-3 py-2 text-xs font-mono">{e.type}</td>
                  <td className="px-3 py-2 text-xs">{e.toEmail ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{e.studentName}</td>
                  <td className="px-3 py-2 text-xs">
                    <DeliveryStatusPill status={e.status} />
                  </td>
                  <td className="px-3 py-2 text-xs text-red-700">{e.failedReason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DeliveryStatusPill({ status }: { status: string }) {
  const cls = status === "delivered" ? "bg-emerald-50 text-emerald-700"
    : status === "sent" ? "bg-sky-50 text-sky-700"
    : status === "failed" ? "bg-red-50 text-red-700"
    : status === "not_configured" ? "bg-amber-50 text-amber-700"
    : "bg-gray-100 text-gray-700";
  return <span className={`inline-flex px-1.5 py-0.5 rounded font-medium ${cls}`}>{status}</span>;
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
