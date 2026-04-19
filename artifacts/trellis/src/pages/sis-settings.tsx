import { useState, useCallback, useEffect, useRef } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database, Plus, RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Trash2, TestTube, Upload, Clock, Plug, Settings2, FileSpreadsheet,
  ChevronDown, ChevronRight, Ban, RotateCcw, List, Info,
} from "lucide-react";

interface SisProvider {
  key: string;
  label: string;
  description: string;
  // Mirrors `SUPPORTED_PROVIDERS` in `api-server/src/lib/sis/index.ts`.
  // "ga" connectors are supported for self-serve setup; "early_pilot"
  // connectors are wired in code but have not been validated against a real
  // vendor tenant and require Trellis engineering for first sync.
  tier?: "ga" | "early_pilot";
}

interface SisConnection {
  id: number;
  provider: string;
  label: string;
  schoolId: number | null;
  status: string;
  syncSchedule: string;
  lastSyncAt: string | null;
  enabled: boolean;
  createdAt: string;
}

interface SyncJob {
  id: number;
  connectionId: number;
  syncType: string;
  status: "queued" | "running" | "completed" | "failed" | "canceled";
  attempts: number;
  maxAttempts: number;
  progress: {
    phase: string;
    recordsProcessed?: number;
    totalRecords?: number;
    message?: string;
    updatedAt?: string;
  } | null;
  lastError: { message: string; attempt: number; failedAt: string } | null;
  syncLogId: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

const TERMINAL_JOB_STATUSES = new Set(["completed", "failed", "canceled"]);

function isTerminalJob(status: string | undefined | null): boolean {
  return !!status && TERMINAL_JOB_STATUSES.has(status);
}

interface SyncLog {
  id: number;
  connectionId: number;
  syncType: string;
  status: string;
  studentsAdded: number;
  studentsUpdated: number;
  studentsArchived: number;
  staffAdded: number;
  staffUpdated: number;
  totalRecords: number;
  errors: Array<{ field?: string; message: string }>;
  warnings: Array<{ field?: string; message: string }>;
  triggeredBy: string;
  startedAt: string;
  completedAt: string | null;
}

const PROVIDER_ICONS: Record<string, typeof Database> = {
  powerschool: Database,
  infinite_campus: Database,
  skyward: Database,
  sftp: Upload,
  csv: FileSpreadsheet,
};

const CREDENTIAL_FIELDS: Record<string, Array<{ key: string; label: string; type: string; placeholder: string }>> = {
  powerschool: [
    { key: "baseUrl", label: "PowerSchool Base URL", type: "url", placeholder: "https://district.powerschool.com" },
    { key: "clientId", label: "Client ID", type: "text", placeholder: "OAuth2 Client ID" },
    { key: "clientSecret", label: "Client Secret", type: "password", placeholder: "OAuth2 Client Secret" },
  ],
  infinite_campus: [
    { key: "baseUrl", label: "Infinite Campus Base URL", type: "url", placeholder: "https://district.infinitecampus.com" },
    { key: "apiToken", label: "API Token", type: "password", placeholder: "API Bearer Token" },
  ],
  skyward: [
    { key: "baseUrl", label: "Skyward Base URL", type: "url", placeholder: "https://district.skyward.com" },
    { key: "apiKey", label: "API Key", type: "text", placeholder: "API Key" },
    { key: "apiSecret", label: "API Secret", type: "password", placeholder: "API Secret" },
  ],
  sftp: [
    { key: "dropPath", label: "SFTP Drop Directory", type: "text", placeholder: "/data/sftp/sis-drop" },
  ],
  csv: [],
};

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  connected: { bg: "bg-emerald-50", text: "text-emerald-700", icon: CheckCircle2 },
  disconnected: { bg: "bg-gray-100", text: "text-gray-500", icon: Plug },
  error: { bg: "bg-red-50", text: "text-red-700", icon: XCircle },
  completed: { bg: "bg-emerald-50", text: "text-emerald-700", icon: CheckCircle2 },
  completed_with_errors: { bg: "bg-amber-50", text: "text-amber-700", icon: AlertTriangle },
  failed: { bg: "bg-red-50", text: "text-red-700", icon: XCircle },
  running: { bg: "bg-blue-50", text: "text-blue-700", icon: RefreshCw },
  queued: { bg: "bg-blue-50", text: "text-blue-700", icon: Clock },
  canceled: { bg: "bg-gray-100", text: "text-gray-500", icon: XCircle },
};

function StatusBadge({ status, label }: { status: string; label?: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.disconnected;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      <Icon className={`w-3 h-3 ${status === "running" ? "animate-spin" : status === "queued" ? "animate-pulse" : ""}`} />
      {(label ?? status).replace(/_/g, " ")}
    </span>
  );
}

function ConnectionCard({
  connection,
  onRefresh,
}: {
  connection: SisConnection;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [enqueuing, setEnqueuing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const [enqueueError, setEnqueueError] = useState<string | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showCsvUpload, setShowCsvUpload] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvType, setCsvType] = useState<"students" | "staff">("students");
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showJobHistory, setShowJobHistory] = useState(false);

  // On mount (or when the connection id changes) reconcile with the most
  // recent job for this connection. If a sync is already queued/running on
  // the server (e.g. user refreshed mid-sync), resume the running UI state
  // instead of falling back to "Idle". We always seed activeJobId from the
  // latest job so a just-completed sync keeps showing its result until the
  // admin triggers another action.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/sis/connections/${connection.id}/jobs?limit=1`);
        if (!res.ok) return;
        const jobs = (await res.json()) as SyncJob[];
        if (cancelled) return;
        const latest = jobs[0];
        if (latest) setActiveJobId(latest.id);
      } catch {
        // Best-effort reconciliation; surface nothing on failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [connection.id]);

  // Poll the active job until terminal. react-query handles unmount cleanup
  // and `refetchInterval` returning false stops polling on completion so we
  // never leak intervals.
  const { data: activeJob } = useQuery<SyncJob | null>({
    queryKey: ["sis-job", activeJobId],
    enabled: activeJobId !== null,
    queryFn: async () => {
      if (activeJobId === null) return null;
      const res = await authFetch(`/api/sis/jobs/${activeJobId}`);
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: (query) => {
      const job = query.state.data as SyncJob | null | undefined;
      if (!job) return 2000;
      return isTerminalJob(job.status) ? false : 2000;
    },
    refetchIntervalInBackground: false,
  });

  // Once the active job lands in a terminal state, refresh the surrounding
  // connection list (so the connection's `lastSyncAt` / `status` reflect the
  // new run) and the sync history table so the new row shows up. We guard
  // with a ref so each terminal transition fires exactly one refresh, even
  // if the polled job object's identity changes between renders. We also
  // proactively refetch the linked sync log because the worker writes the
  // sync log row right around the same time it marks the job terminal —
  // without an explicit refetch the completion counters can show null on
  // the first render after completion.
  const lastTerminalRefreshedRef = useRef<number | null>(null);
  useEffect(() => {
    if (
      activeJob &&
      isTerminalJob(activeJob.status) &&
      lastTerminalRefreshedRef.current !== activeJob.id
    ) {
      lastTerminalRefreshedRef.current = activeJob.id;
      onRefresh();
      queryClient.invalidateQueries({
        queryKey: ["sis-sync-log-for-job", activeJob.syncLogId],
      });
    }
  }, [activeJob, onRefresh, queryClient]);

  // Find the linked sync log so the completion message can show real
  // "+N students added" counters once the worker has flushed them.
  const { data: linkedSyncLog } = useQuery<SyncLog | null>({
    queryKey: ["sis-sync-log-for-job", activeJob?.syncLogId],
    enabled: !!activeJob && isTerminalJob(activeJob.status) && !!activeJob.syncLogId,
    queryFn: async () => {
      const res = await authFetch(`/api/sis/sync-logs?connectionId=${connection.id}&limit=15`);
      if (!res.ok) return null;
      const logs = (await res.json()) as SyncLog[];
      return logs.find((l) => l.id === activeJob?.syncLogId) ?? null;
    },
  });

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await authFetch(`/api/sis/connections/${connection.id}/test`, { method: "POST" });
      if (res.ok) setTestResult(await res.json());
      else setTestResult({ ok: false, message: "Test request failed" });
    } finally {
      setTesting(false);
      onRefresh();
    }
  }, [connection.id, onRefresh]);

  const handleSync = useCallback(async () => {
    setEnqueuing(true);
    setEnqueueError(null);
    try {
      const res = await authFetch(`/api/sis/connections/${connection.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncType: "full" }),
      });
      const body = (await res.json().catch(() => ({}))) as { jobId?: number; error?: string };
      if (res.ok && body.jobId) {
        setActiveJobId(body.jobId);
      } else {
        setEnqueueError(body.error ?? "Failed to start sync");
      }
    } catch (err) {
      setEnqueueError(err instanceof Error ? err.message : "Failed to start sync");
    } finally {
      setEnqueuing(false);
    }
  }, [connection.id]);

  const handleCancel = useCallback(async () => {
    if (!activeJobId) return;
    setCanceling(true);
    setEnqueueError(null);
    try {
      const res = await authFetch(`/api/sis/jobs/${activeJobId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setEnqueueError(body.error ?? "Failed to cancel sync");
      } else {
        queryClient.invalidateQueries({ queryKey: ["sis-job", activeJobId] });
      }
    } catch (err) {
      setEnqueueError(err instanceof Error ? err.message : "Failed to cancel sync");
    } finally {
      setCanceling(false);
    }
  }, [activeJobId, queryClient]);

  const handleDelete = useCallback(async () => {
    if (!confirm("Delete this SIS connection? Sync history will also be removed.")) return;
    setDeleting(true);
    try {
      await authFetch(`/api/sis/connections/${connection.id}`, { method: "DELETE" });
      onRefresh();
    } finally {
      setDeleting(false);
    }
  }, [connection.id, onRefresh]);

  const handleCsvUpload = useCallback(async () => {
    if (!csvText.trim()) return;
    setUploading(true);
    setEnqueueError(null);
    try {
      const res = await authFetch(`/api/sis/connections/${connection.id}/upload-csv`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText, dataType: csvType }),
      });
      const body = (await res.json().catch(() => ({}))) as { jobId?: number; error?: string };
      if (res.ok && body.jobId) {
        setActiveJobId(body.jobId);
        setCsvText("");
      } else {
        setEnqueueError(body.error ?? "CSV upload failed");
      }
    } catch (err) {
      setEnqueueError(err instanceof Error ? err.message : "CSV upload failed");
    } finally {
      setUploading(false);
    }
  }, [connection.id, csvText, csvType]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(reader.result as string);
    reader.readAsText(file);
  }, []);

  const handleRequeue = useCallback(async (syncType: string) => {
    const validApiTypes = new Set(["full", "students", "staff"]);
    const type = validApiTypes.has(syncType) ? syncType : "full";
    setEnqueueError(null);
    try {
      const res = await authFetch(`/api/sis/connections/${connection.id}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncType: type }),
      });
      const body = (await res.json().catch(() => ({}))) as { jobId?: number; error?: string };
      if (res.ok && body.jobId) {
        setActiveJobId(body.jobId);
        setShowJobHistory(false);
      } else {
        setEnqueueError(body.error ?? "Failed to re-enqueue sync");
      }
    } catch (err) {
      setEnqueueError(err instanceof Error ? err.message : "Failed to re-enqueue sync");
    }
  }, [connection.id]);

  const ProviderIcon = PROVIDER_ICONS[connection.provider] ?? Database;

  return (
    <Card className="border border-gray-100 shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <ProviderIcon className="w-4.5 h-4.5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-[13px] font-semibold text-gray-800 truncate">{connection.label}</h3>
              <StatusBadge status={connection.status} />
              {activeJob && !isTerminalJob(activeJob.status) && (
                <StatusBadge
                  status={activeJob.status}
                  label={activeJob.status === "running" ? "Running…" : "Queued…"}
                />
              )}
              {activeJob && isTerminalJob(activeJob.status) && (
                <StatusBadge status={activeJob.status} />
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {connection.provider.replace(/_/g, " ")} &middot;{" "}
              {connection.lastSyncAt
                ? `Last sync: ${new Date(connection.lastSyncAt).toLocaleDateString()}`
                : "Never synced"}
              {" "}&middot; Schedule: {connection.syncSchedule}
            </p>
          </div>
          <button onClick={() => setExpanded((e) => !e)} className="text-gray-300 hover:text-gray-500">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>

        {expanded && (
          <div className="space-y-3 pt-2 border-t border-gray-50">
            <div className="flex gap-2 flex-wrap">
              {connection.provider !== "csv" && (
                <>
                  <Button size="sm" variant="outline" onClick={handleTest} disabled={testing} className="text-[11px] gap-1 h-7">
                    <TestTube className={`w-3 h-3 ${testing ? "animate-spin" : ""}`} />
                    {testing ? "Testing…" : "Test Connection"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleSync}
                    disabled={enqueuing || (!!activeJob && !isTerminalJob(activeJob.status))}
                    className="text-[11px] gap-1 h-7"
                  >
                    <RefreshCw className={`w-3 h-3 ${enqueuing || (activeJob && !isTerminalJob(activeJob.status)) ? "animate-spin" : ""}`} />
                    {enqueuing
                      ? "Starting…"
                      : activeJob && activeJob.status === "queued"
                      ? "Queued…"
                      : activeJob && activeJob.status === "running"
                      ? "Running…"
                      : "Sync Now"}
                  </Button>
                </>
              )}
              {(connection.provider === "csv" || connection.provider === "sftp") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowCsvUpload((v) => !v)}
                  className="text-[11px] gap-1 h-7"
                >
                  <Upload className="w-3 h-3" />
                  Upload CSV
                </Button>
              )}
              {activeJob && !isTerminalJob(activeJob.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancel}
                  disabled={canceling}
                  className="text-[11px] gap-1 h-7 text-amber-700 hover:text-amber-800 hover:bg-amber-50 border-amber-200"
                >
                  <Ban className="w-3 h-3" />
                  {canceling ? "Canceling…" : "Cancel Sync"}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={handleDelete}
                disabled={deleting}
                className="text-[11px] gap-1 h-7 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
              >
                <Trash2 className="w-3 h-3" />
                {deleting ? "Deleting…" : "Remove"}
              </Button>
            </div>

            {testResult && (
              <div className={`text-[12px] px-3 py-2 rounded-lg ${testResult.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                {testResult.ok ? <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> : <XCircle className="w-3.5 h-3.5 inline mr-1" />}
                {testResult.message}
              </div>
            )}

            {enqueueError && (
              <div className="text-[12px] px-3 py-2 rounded-lg bg-red-50 text-red-700">
                <XCircle className="w-3.5 h-3.5 inline mr-1" />
                {enqueueError}
              </div>
            )}

            {activeJob && !isTerminalJob(activeJob.status) && (
              <div className="text-[12px] px-3 py-2 rounded-lg bg-blue-50 text-blue-700 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  {activeJob.status === "queued" ? "Sync queued…" : "Sync running…"}
                </p>
                {activeJob.progress?.message && (
                  <p>{activeJob.progress.message}</p>
                )}
                {activeJob.progress?.phase && !activeJob.progress?.message && (
                  <p>Phase: {activeJob.progress.phase.replace(/_/g, " ")}</p>
                )}
                {typeof activeJob.progress?.recordsProcessed === "number" && (
                  <p>
                    {activeJob.progress.recordsProcessed.toLocaleString()}
                    {typeof activeJob.progress.totalRecords === "number"
                      ? ` / ${activeJob.progress.totalRecords.toLocaleString()}`
                      : ""}{" "}
                    records processed
                  </p>
                )}
              </div>
            )}

            {activeJob && activeJob.status === "completed" && (
              <div className="text-[12px] px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Completed
                  {linkedSyncLog
                    ? ` — ${(linkedSyncLog.studentsAdded + linkedSyncLog.studentsUpdated).toLocaleString()} students synced, ${linkedSyncLog.warnings.length} warning${linkedSyncLog.warnings.length === 1 ? "" : "s"}`
                    : typeof activeJob.progress?.recordsProcessed === "number"
                    ? ` — ${activeJob.progress.recordsProcessed.toLocaleString()} records processed`
                    : ""}
                </p>
                {linkedSyncLog && (
                  <>
                    <p>
                      Students: +{linkedSyncLog.studentsAdded} added, {linkedSyncLog.studentsUpdated} updated
                      {linkedSyncLog.studentsArchived > 0 && `, ${linkedSyncLog.studentsArchived} archived`}
                    </p>
                    {(linkedSyncLog.staffAdded > 0 || linkedSyncLog.staffUpdated > 0) && (
                      <p>Staff: +{linkedSyncLog.staffAdded} added, {linkedSyncLog.staffUpdated} updated</p>
                    )}
                  </>
                )}
                {activeJob.completedAt && (
                  <p className="text-[11px] text-emerald-600/80">
                    Finished {new Date(activeJob.completedAt).toLocaleString(undefined, {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                )}
              </div>
            )}

            {activeJob && activeJob.status === "failed" && (
              <div className="text-[12px] px-3 py-2 rounded-lg bg-red-50 text-red-700 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5" />
                  Sync failed
                </p>
                <p>{activeJob.lastError?.message ?? "Unknown error"}</p>
                {activeJob.completedAt && (
                  <p className="text-[11px] text-red-600/80">
                    Failed {new Date(activeJob.completedAt).toLocaleString(undefined, {
                      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                    })}
                    {activeJob.attempts > 1 && ` after ${activeJob.attempts} attempts`}
                  </p>
                )}
              </div>
            )}

            {activeJob && activeJob.status === "canceled" && (
              <div className="text-[12px] px-3 py-2 rounded-lg bg-gray-100 text-gray-600">
                Sync canceled.
              </div>
            )}

            {showCsvUpload && (
              <div className="space-y-2 p-3 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex gap-2">
                  <button
                    onClick={() => setCsvType("students")}
                    className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${csvType === "students" ? "bg-emerald-100 text-emerald-700" : "bg-white text-gray-500"}`}
                  >
                    Student Roster
                  </button>
                  <button
                    onClick={() => setCsvType("staff")}
                    className={`text-[11px] px-2.5 py-1 rounded-md font-medium transition-colors ${csvType === "staff" ? "bg-emerald-100 text-emerald-700" : "bg-white text-gray-500"}`}
                  >
                    Staff Directory
                  </button>
                </div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="text-[12px] text-gray-600"
                />
                {csvText && (
                  <p className="text-[11px] text-gray-400">
                    {csvText.split("\n").length - 1} rows detected
                  </p>
                )}
                <Button size="sm" onClick={handleCsvUpload} disabled={uploading || !csvText} className="text-[11px] gap-1 h-7 bg-emerald-600 hover:bg-emerald-700">
                  <Upload className={`w-3 h-3 ${uploading ? "animate-spin" : ""}`} />
                  {uploading ? "Uploading…" : `Import ${csvType}`}
                </Button>
              </div>
            )}

            <div className="pt-1 border-t border-gray-50">
              <button
                onClick={() => setShowJobHistory((v) => !v)}
                className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-gray-600 transition-colors font-medium"
              >
                <List className="w-3 h-3" />
                {showJobHistory ? "Hide job history" : "Show job history"}
                {showJobHistory ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
              {showJobHistory && (
                <div className="mt-2">
                  <SyncJobsHistory connectionId={connection.id} onRequeue={handleRequeue} />
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const CSV_SYNC_TYPES = new Set(["csv_students", "csv_staff"]);

function durationLabel(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function SyncJobsHistory({
  connectionId,
  onRequeue,
}: {
  connectionId: number;
  onRequeue: (syncType: string) => void;
}) {
  const [limit, setLimit] = useState(10);
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const { data: jobs, isLoading, refetch } = useQuery<SyncJob[]>({
    queryKey: ["sis-connection-jobs", connectionId, limit],
    queryFn: async () => {
      const res = await authFetch(`/api/sis/connections/${connectionId}/jobs?limit=${limit}`);
      if (!res.ok) throw new Error("Failed to fetch jobs");
      return res.json();
    },
  });

  const handleRetry = useCallback(async (job: SyncJob) => {
    setRetryingId(job.id);
    try {
      await onRequeue(job.syncType);
      refetch();
    } finally {
      setRetryingId(null);
    }
  }, [onRequeue, refetch]);

  if (isLoading) return <Skeleton className="h-24 w-full rounded-lg" />;

  if (!jobs || jobs.length === 0) {
    return (
      <p className="text-[11px] text-gray-400 py-2 text-center">No job history for this connection yet.</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-gray-400 bg-gray-50 border-b border-gray-100">
              <th className="py-1.5 px-2 font-medium">Started</th>
              <th className="py-1.5 px-2 font-medium">Completed</th>
              <th className="py-1.5 px-2 font-medium">Type</th>
              <th className="py-1.5 px-2 font-medium">Status</th>
              <th className="py-1.5 px-2 font-medium">Attempts</th>
              <th className="py-1.5 px-2 font-medium">Duration</th>
              <th className="py-1.5 px-2 font-medium">Error / Action</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const isCsvJob = CSV_SYNC_TYPES.has(job.syncType);
              const canRetry = job.status === "failed" && !isCsvJob;
              const dur = durationLabel(job.startedAt, job.completedAt);
              return (
                <tr key={job.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap">
                    {job.startedAt
                      ? new Date(job.startedAt).toLocaleString(undefined, {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })
                      : new Date(job.createdAt).toLocaleString(undefined, {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                  </td>
                  <td className="py-1.5 px-2 text-gray-500 whitespace-nowrap">
                    {job.completedAt
                      ? new Date(job.completedAt).toLocaleString(undefined, {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="py-1.5 px-2 text-gray-600 whitespace-nowrap">
                    {job.syncType.replace(/_/g, " ")}
                  </td>
                  <td className="py-1.5 px-2 whitespace-nowrap">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="py-1.5 px-2 text-gray-500 text-center">
                    {job.attempts}/{job.maxAttempts}
                  </td>
                  <td className="py-1.5 px-2 text-gray-400 whitespace-nowrap">
                    {dur || "—"}
                  </td>
                  <td className="py-1.5 px-2 min-w-[160px]">
                    {job.status === "failed" ? (
                      <div className="flex items-start gap-1.5 flex-wrap">
                        <span className="text-red-500 truncate max-w-[100px]" title={job.lastError?.message ?? "Unknown error"}>
                          {job.lastError?.message ?? "Unknown error"}
                        </span>
                        {canRetry ? (
                          <button
                            onClick={() => handleRetry(job)}
                            disabled={retryingId === job.id}
                            className="flex-shrink-0 flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                            title="Re-enqueue this sync"
                          >
                            <RotateCcw className={`w-2.5 h-2.5 ${retryingId === job.id ? "animate-spin" : ""}`} />
                            Retry
                          </button>
                        ) : isCsvJob ? (
                          <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600" title="Re-upload your CSV file to run this sync again">
                            Re-upload CSV
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {jobs.length >= limit && (
        <button
          onClick={() => setLimit((l) => l + 15)}
          className="text-[11px] text-emerald-600 hover:text-emerald-700 font-medium"
        >
          Show more
        </button>
      )}
    </div>
  );
}

const SCHEDULE_OPTIONS = [
  { value: "nightly", label: "Nightly (every 24h)" },
  { value: "every_12h", label: "Every 12 hours" },
  { value: "every_6h", label: "Every 6 hours" },
  { value: "hourly", label: "Hourly" },
  { value: "manual", label: "Manual only" },
];

function NewConnectionForm({ onCreated }: { onCreated: () => void }) {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [syncSchedule, setSyncSchedule] = useState("nightly");
  const [saving, setSaving] = useState(false);

  const { data: providers } = useQuery<SisProvider[]>({
    queryKey: ["sis-providers"],
    queryFn: async () => {
      const res = await authFetch("/api/sis/providers");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const handleCreate = useCallback(async () => {
    if (!selectedProvider || !label.trim()) return;
    setSaving(true);
    try {
      const res = await authFetch("/api/sis/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: selectedProvider,
          label: label.trim(),
          credentials,
          syncSchedule,
        }),
      });
      if (res.ok) {
        setSelectedProvider(null);
        setLabel("");
        setCredentials({});
        onCreated();
      }
    } finally {
      setSaving(false);
    }
  }, [selectedProvider, label, credentials, onCreated]);

  if (!selectedProvider) {
    return (
      <Card className="border border-dashed border-gray-200 shadow-none">
        <CardContent className="p-4">
          <p className="text-[13px] font-semibold text-gray-700 mb-1">Add a roster source</p>
          <p className="text-[11px] text-gray-500 mb-3">
            CSV is fully supported. Direct API connectors are in early pilot — Trellis support will validate the first sync with you.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(providers ?? []).map((p) => {
              const Icon = PROVIDER_ICONS[p.key] ?? Database;
              const isPilot = p.tier === "early_pilot";
              return (
                <button
                  key={p.key}
                  onClick={() => { setSelectedProvider(p.key); setLabel(p.label); }}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/50 transition-colors text-center"
                >
                  <Icon className="w-5 h-5 text-emerald-600" />
                  <div className="flex items-center gap-1">
                    <span className="text-[12px] font-semibold text-gray-700">{p.label}</span>
                    {isPilot && (
                      <span className="text-[9px] uppercase tracking-wide px-1 py-px rounded bg-amber-100 text-amber-800 font-medium">Pilot</span>
                    )}
                    {p.tier === "ga" && (
                      <span className="text-[9px] uppercase tracking-wide px-1 py-px rounded bg-emerald-100 text-emerald-800 font-medium">GA</span>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 leading-snug">{p.description}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  }

  const fields = CREDENTIAL_FIELDS[selectedProvider] ?? [];

  return (
    <Card className="border border-emerald-200 shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-gray-700">
            New {(providers ?? []).find((p) => p.key === selectedProvider)?.label ?? selectedProvider} Connection
          </p>
          <button onClick={() => setSelectedProvider(null)} className="text-[11px] text-gray-400 hover:text-gray-600">
            Cancel
          </button>
        </div>

        <div>
          <label className="text-[11px] font-medium text-gray-500 block mb-1">Connection Label</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full text-[13px] px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400"
            placeholder="e.g., District PowerSchool"
          />
        </div>

        {fields.map((f) => (
          <div key={f.key}>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">{f.label}</label>
            <input
              type={f.type}
              value={credentials[f.key] ?? ""}
              onChange={(e) => setCredentials((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="w-full text-[13px] px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400"
              placeholder={f.placeholder}
            />
          </div>
        ))}

        {selectedProvider !== "csv" && (
          <div>
            <label className="text-[11px] font-medium text-gray-500 block mb-1">Sync Schedule</label>
            <select
              value={syncSchedule}
              onChange={(e) => setSyncSchedule(e.target.value)}
              className="w-full text-[13px] px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white"
            >
              {SCHEDULE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        <Button onClick={handleCreate} disabled={saving || !label.trim()} className="text-[12px] gap-1.5 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-3.5 h-3.5" />
          {saving ? "Creating…" : "Create Connection"}
        </Button>
      </CardContent>
    </Card>
  );
}

function SyncLogTable({ connectionId }: { connectionId?: number }) {
  const { data: logs, isLoading } = useQuery<SyncLog[]>({
    queryKey: ["sis-sync-logs", connectionId],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "15" });
      if (connectionId) params.set("connectionId", String(connectionId));
      const res = await authFetch(`/api/sis/sync-logs?${params}`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (isLoading) return <Skeleton className="h-32 w-full rounded-xl" />;

  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-8 text-[12px] text-gray-400">
        No sync history yet. Run a sync to see results here.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-100">
            <th className="py-2 px-3 font-medium">Date</th>
            <th className="py-2 px-3 font-medium">Type</th>
            <th className="py-2 px-3 font-medium">Status</th>
            <th className="py-2 px-3 font-medium">Students</th>
            <th className="py-2 px-3 font-medium">Staff</th>
            <th className="py-2 px-3 font-medium">Total</th>
            <th className="py-2 px-3 font-medium">Issues</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50">
              <td className="py-2 px-3 text-gray-600">
                {new Date(log.startedAt).toLocaleString(undefined, {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </td>
              <td className="py-2 px-3 text-gray-600">{log.syncType.replace(/_/g, " ")}</td>
              <td className="py-2 px-3"><StatusBadge status={log.status} /></td>
              <td className="py-2 px-3 text-gray-600">
                {log.studentsAdded > 0 && <span className="text-emerald-600">+{log.studentsAdded}</span>}
                {log.studentsAdded > 0 && log.studentsUpdated > 0 && " / "}
                {log.studentsUpdated > 0 && <span className="text-blue-600">{log.studentsUpdated} upd</span>}
                {log.studentsAdded === 0 && log.studentsUpdated === 0 && "—"}
              </td>
              <td className="py-2 px-3 text-gray-600">
                {log.staffAdded > 0 && <span className="text-emerald-600">+{log.staffAdded}</span>}
                {log.staffAdded > 0 && log.staffUpdated > 0 && " / "}
                {log.staffUpdated > 0 && <span className="text-blue-600">{log.staffUpdated} upd</span>}
                {log.staffAdded === 0 && log.staffUpdated === 0 && "—"}
              </td>
              <td className="py-2 px-3 text-gray-600">{log.totalRecords}</td>
              <td className="py-2 px-3">
                {log.errors.length > 0 && (
                  <span className="text-red-500">{log.errors.length} error{log.errors.length !== 1 ? "s" : ""}</span>
                )}
                {log.warnings.length > 0 && (
                  <span className="text-amber-500 ml-1">{log.warnings.length} warn</span>
                )}
                {log.errors.length === 0 && log.warnings.length === 0 && (
                  <span className="text-gray-300">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SisSettings() {
  const queryClient = useQueryClient();

  const { data: connections, isLoading } = useQuery<SisConnection[]>({
    queryKey: ["sis-connections"],
    queryFn: async () => {
      const res = await authFetch("/api/sis/connections");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["sis-connections"] });
    queryClient.invalidateQueries({ queryKey: ["sis-sync-logs"] });
  }, [queryClient]);

  const hasConnections = (connections ?? []).length > 0;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-5" data-tour-id="showcase-sis-sync">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-emerald-600" />
            SIS Integration
          </h1>
          <p className="text-[13px] text-gray-500 mt-1">
            CSV roster upload is fully supported today. Direct PowerSchool, Infinite Campus, Skyward, and SFTP connectors are in early pilot — the connector is built but Trellis engineering will validate the first sync with you. Aspen, Synergy, Aeries, Genesis, and other systems have no live connector — bring your roster as a CSV export.
          </p>
        </div>
      </div>

      <div
        className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4"
        data-testid="sis-relationship-explainer"
      >
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-emerald-700 mt-0.5 flex-shrink-0" />
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-emerald-900">
              How Trellis works with your SIS
            </p>
            <p className="text-[12px] text-emerald-900/80 leading-relaxed">
              Your SIS (PowerSchool, Infinite Campus, Skyward, etc.) stays the
              system of record for student demographics, enrollment, and IEP
              metadata. Trellis reads roster data from your SIS on a schedule,
              then layers service-delivery tracking, minutes-at-risk
              calculations, and compliance reporting on top of it.
            </p>
            <p className="text-[12px] text-emerald-900/80 leading-relaxed">
              <span className="font-semibold">Trellis flags gaps; it does not
              replace your SIS.</span> Edits to demographics or enrollment still
              happen in your SIS and flow into Trellis on the next sync.
            </p>
          </div>
        </div>
      </div>

      {!hasConnections && !isLoading && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-[13px] font-semibold text-amber-800">No roster source connected</p>
              <p className="text-[12px] text-amber-600 mt-0.5">
                Upload a CSV roster below to start using Trellis today. If you'd like to set up a direct PowerSchool, Infinite Campus, Skyward, or SFTP connector, you can save the credentials below and Trellis support will schedule a verified first sync — these connectors are in early pilot and not yet self-serve.
              </p>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      )}

      {(connections ?? []).map((conn) => (
        <ConnectionCard key={conn.id} connection={conn} onRefresh={refresh} />
      ))}

      <NewConnectionForm onCreated={refresh} />

      {hasConnections && (
        <Card className="border border-gray-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-[14px] font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              Sync History
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <SyncLogTable />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
