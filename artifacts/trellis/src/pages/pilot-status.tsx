import { useEffect, useState } from "react";
import {
  Calendar, CheckCircle2, AlertCircle, AlertTriangle, Activity,
  Users, Bell, RefreshCw, Mail, Compass, Loader2, Info,
} from "lucide-react";
import { apiGet } from "@/lib/api";
import { useRole } from "@/lib/role-context";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

type Health = "green" | "yellow" | "red" | "neutral";

interface PilotStatusResponse {
  district: { id: number; name: string; isPilot: boolean };
  pilot: {
    startDate: string | null;
    endDate: string | null;
    stage: "kickoff" | "mid_pilot" | "readout" | null;
    accountManagerName: string | null;
    accountManagerEmail: string | null;
  };
  timeline: { totalDays: number | null; daysElapsed: number | null; daysRemaining: number | null; health: Health };
  adoption: { totalProviders: number; activeProviders7d: number; percent: number; sessionsLast7d: number; health: Health };
  sync: { lastSyncAt: string | null; health: Health };
  alerts: { total: number; acknowledged: number; open: number; health: Health };
  stage: { value: string | null; health: Health };
}

const STAGE_LABEL: Record<string, string> = {
  kickoff: "Kickoff",
  mid_pilot: "Mid-pilot",
  readout: "Readout",
};

function HealthDot({ health }: { health: Health }) {
  const cls =
    health === "green" ? "bg-emerald-500"
    : health === "yellow" ? "bg-amber-500"
    : health === "red" ? "bg-rose-500"
    : "bg-gray-300";
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${cls}`} aria-hidden="true" />;
}

function HealthBadge({ health, label }: { health: Health; label?: string }) {
  const styles =
    health === "green" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : health === "yellow" ? "bg-amber-50 text-amber-700 border-amber-200"
    : health === "red" ? "bg-rose-50 text-rose-700 border-rose-200"
    : "bg-gray-50 text-gray-600 border-gray-200";
  const text = label ?? (
    health === "green" ? "On track"
    : health === "yellow" ? "Watch"
    : health === "red" ? "At risk"
    : "—"
  );
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium ${styles}`}>
      <HealthDot health={health} />
      {text}
    </span>
  );
}

function MetricCard({
  icon: Icon, title, value, sub, health, tooltip, testId,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  health: Health;
  tooltip: string;
  testId?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" data-testid={testId}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0">
            <Icon className="w-4 h-4 text-gray-600" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h3 className="text-xs font-medium text-gray-600 truncate">{title}</h3>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-gray-400 hover:text-gray-600" aria-label={`${title} threshold help`}>
                      <Info className="w-3 h-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
                    {tooltip}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
        <HealthBadge health={health} />
      </div>
      <div className="mt-3">
        <div className="text-2xl font-semibold text-gray-900 leading-none">{value}</div>
        {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Never";
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function buildMailto(data: PilotStatusResponse): string {
  const am = data.pilot.accountManagerEmail ?? "";
  const subject = `Schedule pilot readout — ${data.district.name}`;
  const stageLabel = data.pilot.stage ? STAGE_LABEL[data.pilot.stage] : "Not set";
  const lines = [
    `Hi${data.pilot.accountManagerName ? ` ${data.pilot.accountManagerName}` : ""},`,
    "",
    `We'd like to schedule the pilot readout meeting for ${data.district.name}.`,
    "",
    "Pilot summary as of today:",
    `• Stage: ${stageLabel}`,
    `• Start date: ${fmtDate(data.pilot.startDate)}`,
    `• End date: ${fmtDate(data.pilot.endDate)}`,
    `• Days elapsed / remaining: ${data.timeline.daysElapsed ?? "—"} / ${data.timeline.daysRemaining ?? "—"}`,
    `• Provider adoption (last 7 days): ${data.adoption.percent}% (${data.adoption.activeProviders7d} of ${data.adoption.totalProviders})`,
    `• Sessions logged in last 7 days: ${data.adoption.sessionsLast7d}`,
    `• Last SIS sync: ${data.sync.lastSyncAt ? fmtRelative(data.sync.lastSyncAt) : "Never"}`,
    `• Alerts surfaced / acknowledged: ${data.alerts.total} / ${data.alerts.acknowledged}`,
    "",
    "Please reply with a few times that work for a 45-minute readout review.",
    "",
    "Thanks!",
  ];
  const body = encodeURIComponent(lines.join("\n"));
  return `mailto:${encodeURIComponent(am)}?subject=${encodeURIComponent(subject)}&body=${body}`;
}

export default function PilotStatusPage() {
  const { role, isPlatformAdmin } = useRole();
  const [data, setData] = useState<PilotStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Platform admins / Trellis support can target any district via the URL
  // (e.g. /pilot-status?districtId=42). Without a districtId platform admins
  // who don't carry a tenant context get a 400 from the API, so we surface
  // a small picker to set it explicitly.
  const initialDistrictId = (() => {
    if (typeof window === "undefined") return "";
    const p = new URLSearchParams(window.location.search).get("districtId");
    return p ?? "";
  })();
  const [districtIdInput, setDistrictIdInput] = useState<string>(initialDistrictId);
  const [activeDistrictId, setActiveDistrictId] = useState<string>(initialDistrictId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const path = activeDistrictId
      ? `/pilot-status?districtId=${encodeURIComponent(activeDistrictId)}`
      : "/pilot-status";
    apiGet<PilotStatusResponse>(path)
      .then((r) => {
        if (cancelled) return;
        if (r && typeof r === "object" && "error" in r && !(r as any).district) {
          setError((r as any).error ?? "Failed to load pilot status");
          setData(null);
        } else {
          setData(r);
          setError(null);
        }
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeDistrictId]);

  // Page is open to district admins and platform admins / support roles. Hide
  // the page from staff who shouldn't see pilot ops health (providers, paras,
  // students, parents) — they get a polite message instead of a 403 surface.
  const allowed = role === "admin" || isPlatformAdmin;
  if (!allowed) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-lg font-semibold text-amber-900">Pilot Status</h1>
          <p className="text-sm text-amber-800 mt-2">
            This page is reserved for district administrators and Trellis support staff.
          </p>
        </div>
      </div>
    );
  }

  const platformPicker = isPlatformAdmin ? (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => { e.preventDefault(); setActiveDistrictId(districtIdInput.trim()); }}
      data-testid="form-platform-district-picker"
    >
      <label className="text-xs text-gray-500" htmlFor="pilot-district-id">District ID</label>
      <input
        id="pilot-district-id"
        type="number"
        min={1}
        value={districtIdInput}
        onChange={(e) => setDistrictIdInput(e.target.value)}
        placeholder="e.g. 42"
        className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
        data-testid="input-platform-district-id"
      />
      <button
        type="submit"
        className="text-xs bg-gray-900 text-white px-2 py-1 rounded hover:bg-gray-800"
        data-testid="button-platform-load-district"
      >
        Load
      </button>
    </form>
  ) : null;

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error || !data || !data.district) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6">
          <h1 className="text-lg font-semibold text-rose-900">Couldn't load pilot status</h1>
          <p className="text-sm text-rose-800 mt-2">{error ?? "Unknown error"}</p>
        </div>
      </div>
    );
  }

  if (!data.district.isPilot) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-gray-900">Pilot Status</h1>
          <p className="text-sm text-gray-600 mt-2">
            {data.district.name} is not currently flagged as a pilot district. A platform
            administrator can flip the pilot flag from district settings to enable this page.
          </p>
        </div>
      </div>
    );
  }

  const stageLabel = data.pilot.stage ? STAGE_LABEL[data.pilot.stage] : "Not set";
  const hasAccountManager = !!(data.pilot.accountManagerEmail && data.pilot.accountManagerEmail.trim());

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Compass className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Pilot Status</h1>
            <p className="text-sm text-gray-500">{data.district.name} · {stageLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {platformPicker}
          {hasAccountManager ? (
            <a
              href={buildMailto(data)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3 py-2"
              data-testid="button-schedule-readout"
            >
              <Mail className="w-4 h-4" />
              Schedule readout meeting
            </a>
          ) : (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-200 text-gray-500 text-sm font-medium px-3 py-2 cursor-not-allowed"
                    data-testid="button-schedule-readout-disabled"
                  >
                    <Mail className="w-4 h-4" />
                    Schedule readout meeting
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-xs max-w-xs">
                  Add an account manager email under Settings → Pilot Configuration to enable this.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard
          icon={Calendar}
          title="Pilot timeline"
          value={
            data.timeline.daysRemaining == null ? "—"
            : data.timeline.daysRemaining < 0 ? `${Math.abs(data.timeline.daysRemaining)}d overdue`
            : `${data.timeline.daysRemaining}d remaining`
          }
          sub={
            <>
              {fmtDate(data.pilot.startDate)} → {fmtDate(data.pilot.endDate)}
              {data.timeline.daysElapsed != null && data.timeline.totalDays != null && (
                <> · {data.timeline.daysElapsed}/{data.timeline.totalDays} elapsed</>
              )}
            </>
          }
          health={data.timeline.health}
          tooltip="Green: on schedule. Yellow: less than 10% of pilot days remain — start the readout. Red: pilot end date is in the past."
          testId="card-pilot-timeline"
        />
        <MetricCard
          icon={Users}
          title="Provider adoption (7 days)"
          value={`${data.adoption.percent}%`}
          sub={`${data.adoption.activeProviders7d} of ${data.adoption.totalProviders} providers logged a session`}
          health={data.adoption.health}
          tooltip="Share of active providers (case managers, BCBAs, SPED teachers, providers) who logged at least one session in the last 7 days. Green ≥ 70%, Yellow ≥ 40%, Red below."
          testId="card-pilot-adoption"
        />
        <MetricCard
          icon={Activity}
          title="Sessions logged (7 days)"
          value={data.adoption.sessionsLast7d}
          sub="Total session logs across the district"
          health="neutral"
          tooltip="Raw count of session logs in the last 7 days for context. No threshold; pair with provider adoption above."
          testId="card-pilot-sessions"
        />
        <MetricCard
          icon={RefreshCw}
          title="Last data sync"
          value={data.sync.lastSyncAt ? fmtRelative(data.sync.lastSyncAt) : "Never"}
          sub={data.sync.lastSyncAt ? new Date(data.sync.lastSyncAt).toLocaleString() : "No SIS sync recorded yet"}
          health={data.sync.health}
          tooltip="Most recent successful SIS sync across all configured connections. Green ≤ 24h, Yellow ≤ 72h, Red older."
          testId="card-pilot-sync"
        />
        <MetricCard
          icon={Bell}
          title="Alerts surfaced / acknowledged"
          value={`${data.alerts.acknowledged} / ${data.alerts.total}`}
          sub={`${data.alerts.open} still open`}
          health={data.alerts.health}
          tooltip="Of all compliance alerts ever surfaced, the share that have been acknowledged (resolved). Green ≥ 80%, Yellow ≥ 50%, Red below."
          testId="card-pilot-alerts"
        />
        <MetricCard
          icon={CheckCircle2}
          title="Pilot stage"
          value={stageLabel}
          sub={
            data.pilot.stage === "readout" ? "Time to schedule the readout"
            : data.pilot.stage === "mid_pilot" ? "Mid-pilot health check"
            : data.pilot.stage === "kickoff" ? "Kickoff phase"
            : "Stage not set — update in Settings → Pilot Configuration"
          }
          health={data.stage.health}
          tooltip="Pilot lifecycle stage set by district admins under Settings → Pilot Configuration. Informational; no thresholds."
          testId="card-pilot-stage"
        />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">Account manager</h2>
        </div>
        {hasAccountManager ? (
          <div className="text-sm text-gray-700">
            <div className="font-medium">{data.pilot.accountManagerName ?? "(name not set)"}</div>
            <div className="text-gray-500 mt-0.5">
              <a href={`mailto:${data.pilot.accountManagerEmail}`} className="text-emerald-700 hover:underline">
                {data.pilot.accountManagerEmail}
              </a>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            No account manager assigned. Update under Settings → Pilot Configuration.
          </div>
        )}
      </div>
    </div>
  );
}
