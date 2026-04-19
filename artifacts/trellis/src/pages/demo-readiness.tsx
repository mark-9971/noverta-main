import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import { useRole } from "@/lib/role-context";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ArrowRight,
  Clock,
  CalendarClock,
  BanIcon,
  History,
  RotateCcw,
  Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

type Status = "pass" | "warn" | "fail";

interface ReadinessCheck {
  id: string;
  label: string;
  status: Status;
  message: string;
  remediation?: string;
  href?: string;
}

interface ReadinessReport {
  generatedAt: string;
  demoDistrict: { id: number; name: string } | null;
  checks: ReadinessCheck[];
  summary: { pass: number; warn: number; fail: number; total: number };
}

interface HistoryCheckEntry {
  id: string;
  label: string;
  status: Status;
}

interface HistoryRun {
  id: number;
  generatedAt: string;
  summary: { pass: number; warn: number; fail: number; total: number };
  checks: HistoryCheckEntry[];
}

interface HistoryResponse {
  runs: HistoryRun[];
}

interface ReseedJob {
  id: string;
  status: "running" | "done" | "failed";
  startedAt: string;
  finishedAt?: string;
  result?: {
    districtId: number;
    alertsInserted: number;
    alertsSkipped: number;
    totalStudents: number;
    nonCompliantStudents: number;
    compliancePct: string;
  };
  error?: string;
}

type Cadence = "off" | "hourly" | "before-demo";

interface DemoResetSchedule {
  id: number;
  cadence: Cadence;
  updatedAt: string | null;
  updatedBy: string | null;
}

interface DemoResetAuditRow {
  id: number;
  triggeredBy: "scheduler" | "manual";
  cadenceSnapshot: string;
  startedAt: string;
  finishedAt: string | null;
  success: boolean | null;
  errorMessage: string | null;
  elapsedMs: number | null;
  districtId: number | null;
  compliancePct: number | null;
}

function statusIcon(status: Status) {
  if (status === "pass") return <CheckCircle2 className="w-6 h-6 text-emerald-600" />;
  if (status === "warn") return <AlertTriangle className="w-6 h-6 text-amber-500" />;
  return <XCircle className="w-6 h-6 text-red-600" />;
}

function statusRingClasses(status: Status) {
  if (status === "pass") return "border-emerald-200 bg-emerald-50/40";
  if (status === "warn") return "border-amber-200 bg-amber-50/40";
  return "border-red-200 bg-red-50/40";
}

function summaryBadge(s: ReadinessReport["summary"]) {
  if (s.fail > 0) {
    return (
      <Badge variant="destructive">{s.fail} failing · {s.warn} warning</Badge>
    );
  }
  if (s.warn > 0) {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-500/90">
        {s.warn} warning
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-600 hover:bg-emerald-600/90">All clear</Badge>
  );
}

// ── History sparkline (readiness check run history) ────────────────────────

function runOverallStatus(run: HistoryRun): Status {
  if (run.summary.fail > 0) return "fail";
  if (run.summary.warn > 0) return "warn";
  return "pass";
}

function SparklineBar({ run, maxTotal }: { run: HistoryRun; maxTotal: number }) {
  const status = runOverallStatus(run);
  const barColor =
    status === "pass"
      ? "bg-emerald-500"
      : status === "warn"
        ? "bg-amber-400"
        : "bg-red-500";

  const heightPct = maxTotal > 0 ? Math.max(20, Math.round((run.summary.pass / maxTotal) * 100)) : 20;
  const time = new Date(run.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = new Date(run.generatedAt).toLocaleDateString([], { month: "short", day: "numeric" });

  return (
    <div
      className="group flex flex-col items-center gap-1 cursor-default"
      title={`${date} ${time} — ${run.summary.pass}/${run.summary.total} passing${run.summary.warn > 0 ? `, ${run.summary.warn} warn` : ""}${run.summary.fail > 0 ? `, ${run.summary.fail} fail` : ""}`}
    >
      <div className="relative w-full flex items-end justify-center h-10">
        <div
          className={`w-full rounded-sm transition-opacity group-hover:opacity-80 ${barColor}`}
          style={{ height: `${heightPct}%` }}
        />
      </div>
      <div className="w-px h-1 bg-gray-300" />
    </div>
  );
}

// Per-check sparkline cell — narrow column showing one run's status for a single
// check. Color encodes pass/warn/fail; gaps render as light gray (the check
// didn't exist in that run, e.g. after we added a new check).
function CheckCell({
  status,
  run,
  checkLabel,
}: {
  status: Status | null;
  run: HistoryRun;
  checkLabel: string;
}) {
  const cls =
    status === "pass" ? "bg-emerald-500"
    : status === "warn" ? "bg-amber-400"
    : status === "fail" ? "bg-red-500"
    : "bg-gray-200";
  const time = new Date(run.generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const date = new Date(run.generatedAt).toLocaleDateString([], { month: "short", day: "numeric" });
  const tip = status
    ? `${checkLabel}: ${status.toUpperCase()} at ${date} ${time}`
    : `${checkLabel}: not recorded at ${date} ${time}`;
  return (
    <div className="flex flex-col items-center gap-1" title={tip}>
      <div className={`w-full h-6 rounded-sm ${cls}`} />
    </div>
  );
}

function HistorySparkline({ runs }: { runs: HistoryRun[] }) {
  // Track which check the SE has drilled into (null = overall view).
  const [selectedCheckId, setSelectedCheckId] = useState<string>("__overall__");

  if (runs.length === 0) {
    return (
      <Card className="border-dashed border-gray-200">
        <CardContent className="py-4 text-xs text-gray-400 text-center">
          No history yet — check results will appear here after the first run.
        </CardContent>
      </Card>
    );
  }

  const maxTotal = Math.max(...runs.map(r => r.summary.total), 1);
  const latestFails = runs[0]?.summary.fail ?? 0;
  const latestWarns = runs[0]?.summary.warn ?? 0;

  const allPassCount = runs.filter(r => runOverallStatus(r) === "pass").length;
  const anyFailCount = runs.filter(r => runOverallStatus(r) === "fail").length;

  // Build the union of all check ids/labels seen across the recorded runs so
  // SEs can drill into any check that ever ran — even one that's gone away.
  // Most-recent run wins for label resolution. Sorted alphabetically by label
  // for predictable ordering in the dropdown.
  const checkOptions = (() => {
    const seen = new Map<string, string>();
    for (const r of runs) {
      for (const c of r.checks) {
        if (!seen.has(c.id)) seen.set(c.id, c.label);
      }
    }
    return Array.from(seen.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  })();

  let trendLabel: string;
  let trendClass: string;
  if (anyFailCount === 0 && runs.length >= 2) {
    trendLabel = "Stable — no failures across all recorded runs";
    trendClass = "text-emerald-700";
  } else if (latestFails > 0) {
    trendLabel = `${latestFails} failing now`;
    trendClass = "text-red-700";
  } else if (latestWarns > 0) {
    trendLabel = `${latestWarns} warning(s) now`;
    trendClass = "text-amber-700";
  } else {
    trendLabel = "Currently passing";
    trendClass = "text-emerald-700";
  }

  const displayRuns = [...runs].reverse();

  // When a specific check is selected, compute that check's per-run status and
  // a quick "regressing?" trend label so the SE can spot flapping at a glance.
  const isCheckView = selectedCheckId !== "__overall__";
  const selectedLabel = checkOptions.find(c => c.id === selectedCheckId)?.label ?? selectedCheckId;
  const checkStatuses = isCheckView
    ? displayRuns.map(r => r.checks.find(c => c.id === selectedCheckId)?.status ?? null)
    : [];
  const checkSummary = (() => {
    if (!isCheckView) return null;
    let pass = 0, warn = 0, fail = 0, missing = 0;
    for (const s of checkStatuses) {
      if (s === "pass") pass++;
      else if (s === "warn") warn++;
      else if (s === "fail") fail++;
      else missing++;
    }
    const lastRecorded = [...checkStatuses].reverse().find(s => s !== null) ?? null;
    return { pass, warn, fail, missing, lastRecorded };
  })();

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-gray-400" />
            <CardTitle className="text-sm font-medium text-gray-700">
              Run history ({runs.length} run{runs.length !== 1 ? "s" : ""}, most-recent on right)
            </CardTitle>
          </div>
          <span className={`text-xs font-semibold ${trendClass}`}>{trendLabel}</span>
        </div>
        <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" /> {isCheckView ? "Pass" : `All-pass runs: ${allPassCount}`}
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className="inline-block w-2 h-2 rounded-sm bg-amber-400" /> Warn
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className="inline-block w-2 h-2 rounded-sm bg-red-500" /> Fail
            </span>
            {isCheckView && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <span className="inline-block w-2 h-2 rounded-sm bg-gray-200 border border-gray-300" /> Not recorded
              </span>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <span className="text-gray-500">Drill into check:</span>
            <select
              value={selectedCheckId}
              onChange={e => setSelectedCheckId(e.target.value)}
              className="border border-gray-200 rounded-md text-xs py-1 px-2 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              <option value="__overall__">Overall (pass/warn/fail per run)</option>
              {checkOptions.map(c => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        {isCheckView ? (
          <>
            <div
              className="grid gap-0.5 items-end"
              style={{ gridTemplateColumns: `repeat(${displayRuns.length}, minmax(0, 1fr))` }}
            >
              {displayRuns.map((run, i) => (
                <CheckCell
                  key={run.id}
                  status={checkStatuses[i] ?? null}
                  run={run}
                  checkLabel={selectedLabel}
                />
              ))}
            </div>
            {checkSummary && (
              <p className="text-xs text-gray-500 mt-2">
                <span className="font-medium text-gray-700">{selectedLabel}</span>{" "}
                across {displayRuns.length} run{displayRuns.length !== 1 ? "s" : ""}:{" "}
                <span className="text-emerald-700 font-medium">{checkSummary.pass} pass</span>
                {" · "}
                <span className="text-amber-700 font-medium">{checkSummary.warn} warn</span>
                {" · "}
                <span className="text-red-700 font-medium">{checkSummary.fail} fail</span>
                {checkSummary.missing > 0 && <> · {checkSummary.missing} not recorded</>}
                {checkSummary.lastRecorded && (
                  <> · last status <span className="font-medium uppercase">{checkSummary.lastRecorded}</span></>
                )}
              </p>
            )}
          </>
        ) : (
          <div
            className="grid gap-0.5 items-end"
            style={{ gridTemplateColumns: `repeat(${displayRuns.length}, minmax(0, 1fr))` }}
          >
            {displayRuns.map(run => (
              <SparklineBar key={run.id} run={run} maxTotal={maxTotal} />
            ))}
          </div>
        )}
        <div className="flex justify-between mt-1">
          <span className="text-xs text-gray-400">
            {new Date(displayRuns[0]?.generatedAt ?? "").toLocaleDateString([], { month: "short", day: "numeric" })}
          </span>
          <span className="text-xs text-gray-400">
            {new Date(displayRuns[displayRuns.length - 1]?.generatedAt ?? "").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Auto-reset schedule helpers ─────────────────────────────────────────────

const CADENCE_OPTIONS: { value: Cadence; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: "off",
    label: "Off",
    description: "No automatic resets. Use the manual Reset Demo button before each call.",
    icon: <BanIcon className="w-4 h-4 text-gray-400" />,
  },
  {
    value: "hourly",
    label: "Hourly",
    description: "Reset at the top of every hour, Monday–Friday 8 AM–6 PM ET.",
    icon: <Clock className="w-4 h-4 text-blue-500" />,
  },
  {
    value: "before-demo",
    label: "Before each demo",
    description: "Auto-reset 5 minutes before any booked demo on the demo-requests calendar.",
    icon: <CalendarClock className="w-4 h-4 text-emerald-600" />,
  },
];

function CadenceOption({
  option,
  selected,
  onSelect,
}: {
  option: (typeof CADENCE_OPTIONS)[number];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-start gap-3 w-full text-left rounded-lg border p-3 transition-colors ${
        selected
          ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400"
          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      <span className="pt-0.5">{option.icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900">{option.label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
      </div>
      {selected && (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 ml-auto mt-0.5 shrink-0" />
      )}
    </button>
  );
}

function formatElapsed(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Page component ──────────────────────────────────────────────────────────

export default function DemoReadinessPage() {
  const { isPlatformAdmin } = useRole();
  const queryClient = useQueryClient();

  const [reseedJobId, setReseedJobId] = useState<string | null>(null);
  const [reseedJob, setReseedJob] = useState<ReseedJob | null>(null);
  const [reseedError, setReseedError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<ReadinessReport>({
    queryKey: ["demo-readiness"],
    queryFn: () => apiGet<ReadinessReport>("/api/support/demo-readiness"),
    enabled: isPlatformAdmin,
    refetchInterval: 60_000,
  });

  const { data: historyData, refetch: refetchHistory } = useQuery<HistoryResponse>({
    queryKey: ["demo-readiness-history"],
    queryFn: () => apiGet<HistoryResponse>("/api/support/demo-readiness/history"),
    enabled: isPlatformAdmin,
    refetchInterval: 60_000,
  });

  const { data: scheduleData, isLoading: scheduleLoading } = useQuery<DemoResetSchedule>({
    queryKey: ["demo-reset-schedule"],
    queryFn: () => apiGet<DemoResetSchedule>("/api/admin/demo-reset-schedule"),
    enabled: isPlatformAdmin,
  });

  const { data: auditData, isLoading: auditLoading } = useQuery<DemoResetAuditRow[]>({
    queryKey: ["demo-reset-audit"],
    queryFn: () => apiGet<DemoResetAuditRow[]>("/api/admin/demo-reset-audit?limit=10"),
    enabled: isPlatformAdmin,
    refetchInterval: 30_000,
  });

  const [selectedCadence, setSelectedCadence] = useState<Cadence | null>(null);
  const effectiveCadence: Cadence = selectedCadence ?? scheduleData?.cadence ?? "off";

  const saveMutation = useMutation({
    mutationFn: (cadence: Cadence) =>
      apiPut("/api/admin/demo-reset-schedule", { cadence }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["demo-reset-schedule"] });
      setSelectedCadence(null);
    },
  });

  const isDirty = selectedCadence !== null && selectedCadence !== scheduleData?.cadence;

  useEffect(() => {
    if (!reseedJobId) return;

    pollRef.current = setInterval(async () => {
      try {
        const job = await apiGet<ReseedJob>(`/api/support/demo-reseed/${reseedJobId}`);
        setReseedJob(job);
        if (job.status === "done" || job.status === "failed") {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          if (job.status === "done") {
            queryClient.invalidateQueries({ queryKey: ["demo-readiness"] });
            setTimeout(() => { void refetchHistory(); }, 1500);
          }
        }
      } catch {
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setReseedError("Lost contact with the server while polling — check logs.");
      }
    }, 2500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [reseedJobId, queryClient, refetchHistory]);

  async function startReseed() {
    setReseedError(null);
    setReseedJob(null);
    setReseedJobId(null);
    try {
      const { jobId } = await apiPost<{ jobId: string }>("/api/support/demo-reseed");
      setReseedJobId(jobId);
      setReseedJob({ id: jobId, status: "running", startedAt: new Date().toISOString() });
    } catch (err: unknown) {
      setReseedError(err instanceof Error ? err.message : "Failed to start reseed.");
    }
  }

  const isReseeding = reseedJob?.status === "running";

  if (!isPlatformAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <h1 className="text-xl font-semibold text-gray-900">Restricted</h1>
        <p className="text-sm text-gray-500 mt-2">
          Demo Pre-Flight is available to platform administrators only.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Demo Pre-Flight</h1>
          <p className="text-sm text-gray-500 mt-1">
            One-glance readiness for the demo district before a sales call.
            {data?.demoDistrict && (
              <> Showing <span className="font-medium text-gray-700">{data.demoDistrict.name}</span>.</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetch();
              setTimeout(() => { void refetchHistory(); }, 1500);
            }}
            disabled={isFetching || isReseeding}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={startReseed}
            disabled={isReseeding}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <RotateCcw className={`w-4 h-4 ${isReseeding ? "animate-spin" : ""}`} />
            {isReseeding ? "Reseeding…" : "Reseed demo district"}
          </Button>
        </div>
      </div>

      {reseedJob && (
        <Card className={`border-2 ${
          reseedJob.status === "running"
            ? "border-indigo-200 bg-indigo-50/40"
            : reseedJob.status === "done"
              ? "border-emerald-200 bg-emerald-50/40"
              : "border-red-200 bg-red-50/40"
        }`}>
          <CardContent className="py-4 flex items-start gap-3">
            {reseedJob.status === "running" && (
              <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin mt-0.5 shrink-0" />
            )}
            {reseedJob.status === "done" && (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
            )}
            {reseedJob.status === "failed" && (
              <XCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            )}
            <div className="min-w-0">
              {reseedJob.status === "running" && (
                <p className="text-sm font-medium text-indigo-800">
                  Reseeding in progress — running seed scripts server-side…
                </p>
              )}
              {reseedJob.status === "done" && reseedJob.result && (
                <>
                  <p className="text-sm font-medium text-emerald-800">Reseed complete</p>
                  <p className="text-xs text-emerald-700 mt-1">
                    {reseedJob.result.totalStudents} students · {reseedJob.result.alertsInserted} new variety alerts
                    · compliance {reseedJob.result.compliancePct}% · checks refreshed automatically
                  </p>
                </>
              )}
              {reseedJob.status === "failed" && (
                <>
                  <p className="text-sm font-medium text-red-800">Reseed failed</p>
                  {reseedJob.error && (
                    <p className="text-xs text-red-700 mt-1 font-mono break-all">{reseedJob.error}</p>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {reseedError && (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="py-4 text-sm text-red-700">{reseedError}</CardContent>
        </Card>
      )}

      {data && (
        <Card className={`border-2 ${
          data.summary.fail > 0
            ? "border-red-200 bg-red-50/40"
            : data.summary.warn > 0
              ? "border-amber-200 bg-amber-50/40"
              : "border-emerald-200 bg-emerald-50/40"
        }`}>
          <CardContent className="py-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {statusIcon(data.summary.fail > 0 ? "fail" : data.summary.warn > 0 ? "warn" : "pass")}
              <div>
                <p className="font-semibold text-gray-900">
                  {data.summary.fail > 0
                    ? "Demo not ready — resolve failing checks before going live"
                    : data.summary.warn > 0
                      ? "Demo usable, but some checks need attention"
                      : "Demo is ready to show"}
                </p>
                <p className="text-xs text-gray-500">
                  {data.summary.pass} of {data.summary.total} checks passing · generated {new Date(data.generatedAt).toLocaleTimeString()}
                </p>
              </div>
            </div>
            {summaryBadge(data.summary)}
          </CardContent>
        </Card>
      )}

      <HistorySparkline runs={historyData?.runs ?? []} />

      {isLoading && (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      )}

      {isError && (
        <Card className="border-red-200 bg-red-50/40">
          <CardContent className="py-4 text-sm text-red-700">
            Failed to load demo readiness. Try refreshing — if it keeps failing, the
            API server may be down.
          </CardContent>
        </Card>
      )}

      {data && (
        <ul className="space-y-3">
          {data.checks.map(check => (
            <li key={check.id}>
              <Card className={`border ${statusRingClasses(check.status)}`}>
                <CardContent className="py-4 flex items-start gap-4">
                  <div className="pt-0.5">{statusIcon(check.status)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-gray-900">{check.label}</p>
                      <span className={`text-xs uppercase tracking-wide font-semibold ${
                        check.status === "pass"
                          ? "text-emerald-700"
                          : check.status === "warn"
                            ? "text-amber-700"
                            : "text-red-700"
                      }`}>
                        {check.status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{check.message}</p>
                    {check.remediation && (
                      <p className="text-xs text-gray-500 mt-2">
                        <span className="font-semibold text-gray-600">Fix:</span>{" "}
                        {check.remediation}
                      </p>
                    )}
                    {check.href && (
                      <Link
                        href={check.href}
                        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 mt-2"
                      >
                        Open related screen <ArrowRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* ── Auto-Reset Schedule ─────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-gray-500" />
            Auto-Reset Schedule
          </CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">
            Automatically restore the demo district to its canonical baseline so
            it's always fresh before a call. Uses the same full reseed as the
            manual Reset Demo button.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {scheduleLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-14 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {CADENCE_OPTIONS.map(opt => (
                  <CadenceOption
                    key={opt.value}
                    option={opt}
                    selected={effectiveCadence === opt.value}
                    onSelect={() => setSelectedCadence(opt.value)}
                  />
                ))}
              </div>

              {scheduleData?.updatedAt && !isDirty && (
                <p className="text-xs text-gray-400">
                  Last updated {new Date(scheduleData.updatedAt).toLocaleString()}
                  {scheduleData.updatedBy ? ` by ${scheduleData.updatedBy}` : ""}
                </p>
              )}

              {isDirty && (
                <div className="flex items-center gap-3 pt-1">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    onClick={() => saveMutation.mutate(effectiveCadence)}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    Save schedule
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedCadence(null)}
                    disabled={saveMutation.isPending}
                  >
                    Cancel
                  </Button>
                  {saveMutation.isError && (
                    <p className="text-xs text-red-600">Failed to save — please try again.</p>
                  )}
                </div>
              )}

              {saveMutation.isSuccess && !isDirty && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Schedule saved.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Reset History ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <History className="w-4 h-4 text-gray-500" />
            Reset History
          </CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">
            Audit trail of automatic and manual demo resets. Refreshes every 30 seconds.
          </p>
        </CardHeader>
        <CardContent>
          {auditLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-10 rounded bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : !auditData || auditData.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">
              No resets recorded yet. Automatic resets will appear here once the scheduler runs.
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {auditData.map(row => (
                <div key={row.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    {row.success === true ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    ) : row.success === false ? (
                      <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-blue-400 mt-0.5 shrink-0 animate-spin" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 font-medium">
                        {row.triggeredBy === "scheduler" ? "Scheduled reset" : "Manual reset"}
                        <span className="ml-1.5 text-xs font-normal text-gray-400">
                          ({row.cadenceSnapshot})
                        </span>
                      </p>
                      {row.success === false && row.errorMessage && (
                        <p className="text-xs text-red-600 mt-0.5 truncate">{row.errorMessage}</p>
                      )}
                      {row.success === true && row.compliancePct != null && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          {row.compliancePct}% compliance · {formatElapsed(row.elapsedMs)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gray-500">{formatRelative(row.startedAt)}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(row.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
