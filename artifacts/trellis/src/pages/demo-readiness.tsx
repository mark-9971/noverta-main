import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api";
import { useRole } from "@/lib/role-context";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ArrowRight,
  History,
  RotateCcw,
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

interface HistoryRun {
  id: number;
  generatedAt: string;
  summary: { pass: number; warn: number; fail: number; total: number };
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

function HistorySparkline({ runs }: { runs: HistoryRun[] }) {
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

  return (
    <Card className="border-gray-200">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-gray-400" />
            <CardTitle className="text-sm font-medium text-gray-700">
              Run history ({runs.length} run{runs.length !== 1 ? "s" : ""}, most-recent on right)
            </CardTitle>
          </div>
          <span className={`text-xs font-semibold ${trendClass}`}>{trendLabel}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" /> All-pass runs: {allPassCount}
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <span className="inline-block w-2 h-2 rounded-sm bg-amber-400" /> Warn
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <span className="inline-block w-2 h-2 rounded-sm bg-red-500" /> Fail
          </span>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div
          className="grid gap-0.5 items-end"
          style={{ gridTemplateColumns: `repeat(${displayRuns.length}, minmax(0, 1fr))` }}
        >
          {displayRuns.map(run => (
            <SparklineBar key={run.id} run={run} maxTotal={maxTotal} />
          ))}
        </div>
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
    </div>
  );
}
