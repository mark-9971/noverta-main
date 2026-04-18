import { useState, useEffect } from "react";
import { Download, Trash2, AlertTriangle, CheckCircle, Clock, XCircle, Shield, RefreshCw, X } from "lucide-react";

interface ArchiveJob {
  id: number;
  status: "pending" | "running" | "complete" | "failed";
  manifest?: {
    districtName: string;
    generatedAt: string;
    tables: Array<{ name: string; rows: number }>;
    totalRows: number;
    storageBytesEstimate: number;
  };
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
  errorMessage?: string;
}

interface DistrictStatus {
  districtId: number;
  districtName: string;
  pendingDelete: boolean;
  deleteInitiatedAt: string | null;
  deleteScheduledAt: string | null;
  deleteInitiatedBy: string | null;
}

function daysUntil(dateStr: string): number {
  const ms = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }: { status: ArchiveJob["status"] }) {
  const config: Record<ArchiveJob["status"], { icon: React.ReactNode; label: string; className: string }> = {
    pending: { icon: <Clock className="w-3 h-3" />, label: "Pending", className: "text-amber-700 bg-amber-50 border-amber-200" },
    running: { icon: <RefreshCw className="w-3 h-3 animate-spin" />, label: "Generating", className: "text-blue-700 bg-blue-50 border-blue-200" },
    complete: { icon: <CheckCircle className="w-3 h-3" />, label: "Ready", className: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    failed: { icon: <XCircle className="w-3 h-3" />, label: "Failed", className: "text-red-700 bg-red-50 border-red-200" },
  };
  const { icon, label, className } = config[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${className}`}>
      {icon} {label}
    </span>
  );
}

export default function DistrictDataPage() {
  const [jobs, setJobs] = useState<ArchiveJob[]>([]);
  const [status, setStatus] = useState<DistrictStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Delete dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  async function load() {
    try {
      const [jobsRes, statusRes] = await Promise.all([
        fetch("/api/district-data/archive"),
        fetch("/api/district-data/status"),
      ]);
      if (jobsRes.ok) setJobs(await jobsRes.json());
      if (statusRes.ok) setStatus(await statusRes.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Poll when a job is running/pending
  useEffect(() => {
    const running = jobs.some(j => j.status === "pending" || j.status === "running");
    if (!running) return;
    const id = setInterval(() => load(), 3000);
    return () => clearInterval(id);
  }, [jobs]);

  async function requestArchive() {
    setRequesting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/district-data/archive", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to start archive job");
      } else {
        setSuccess("Archive started! We'll email you when it's ready. You can also check the status below.");
        await load();
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setRequesting(false);
    }
  }

  async function downloadArchive(jobId: number) {
    window.location.href = `/api/district-data/archive/${jobId}/download`;
  }

  async function initiateSoftDelete() {
    if (!status || deleteConfirm !== status.districtName) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch("/api/district-data/soft-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ districtId: status.districtId, confirmName: deleteConfirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.error ?? "Failed to initiate deletion");
      } else {
        setShowDeleteDialog(false);
        setDeleteConfirm("");
        setSuccess("District deletion scheduled. You have 30 days to cancel before data is permanently removed.");
        await load();
      }
    } catch {
      setDeleteError("Network error — please try again");
    } finally {
      setDeleting(false);
    }
  }

  async function cancelSoftDelete() {
    if (!status) return;
    setIsCancelling(true);
    try {
      const res = await fetch("/api/district-data/soft-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ districtId: status.districtId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to cancel deletion");
      } else {
        setSuccess("District deletion has been cancelled.");
        await load();
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setIsCancelling(false);
    }
  }

  const latestJob = jobs[0];
  const hasActiveJob = latestJob && (latestJob.status === "pending" || latestJob.status === "running");

  return (
    <div className="space-y-6">
      {/* Soft-delete countdown banner */}
      {status?.pendingDelete && status.deleteScheduledAt && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-800">District deletion scheduled</p>
            <p className="text-sm text-red-700 mt-0.5">
              All district data will be permanently deleted on{" "}
              <strong>{formatDate(status.deleteScheduledAt)}</strong>{" "}
              ({daysUntil(status.deleteScheduledAt)} day(s) remaining).
              This action is irreversible after the purge runs.
            </p>
          </div>
          <button
            onClick={cancelSoftDelete}
            disabled={isCancelling}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            {isCancelling ? "Cancelling…" : "Cancel deletion"}
          </button>
        </div>
      )}

      {/* Flash messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 text-sm text-emerald-700 flex items-center justify-between gap-3">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Data Export Section */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Download className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Export All District Data</h2>
            <p className="text-xs text-gray-500">Generate a full archive of all district data as a ZIP containing CSVs for every table.</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            The archive includes all students, staff, IEPs, session logs, compliance records, and associated documents.
            A download link will be emailed to you and will remain active for 7 days.
          </p>

          <button
            onClick={requestArchive}
            disabled={requesting || !!hasActiveJob}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {requesting ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Queuing…</>
            ) : hasActiveJob ? (
              <><Clock className="w-4 h-4" /> Archive in progress…</>
            ) : (
              <><Download className="w-4 h-4" /> Generate district archive</>
            )}
          </button>

          {/* Job history */}
          {!loading && jobs.length > 0 && (
            <div className="border border-gray-100 rounded-lg divide-y divide-gray-100">
              {jobs.map(job => (
                <div key={job.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={job.status} />
                      <span className="text-xs text-gray-500">Requested {formatDate(job.createdAt)}</span>
                      {job.expired && <span className="text-xs text-gray-400">(expired)</span>}
                    </div>
                    {job.status === "complete" && job.manifest && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {job.manifest.totalRows.toLocaleString()} total records across {job.manifest.tables.length} tables
                        {job.expiresAt && !job.expired && ` — expires ${formatDate(job.expiresAt)}`}
                      </p>
                    )}
                    {job.status === "failed" && job.errorMessage && (
                      <p className="text-xs text-red-600 mt-0.5">{job.errorMessage}</p>
                    )}
                  </div>
                  {job.status === "complete" && !job.expired && (
                    <button
                      onClick={() => downloadArchive(job.id)}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
                    >
                      <Download className="w-3.5 h-3.5" /> Download ZIP
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {!loading && jobs.length === 0 && (
            <p className="text-xs text-gray-400">No archive jobs yet.</p>
          )}
        </div>
      </div>

      {/* Delete District Section */}
      <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-red-100 flex items-center gap-2.5 bg-red-50/50">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <Trash2 className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-red-900">Delete District Data</h2>
            <p className="text-xs text-red-600">Permanently remove all district data. This meets FERPA and DPA right-to-be-forgotten requirements.</p>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {status?.pendingDelete ? (
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 space-y-1">
                <p className="font-semibold">Deletion in progress</p>
                <p>District deletion was scheduled on {status.deleteInitiatedAt ? formatDate(status.deleteInitiatedAt) : "unknown"}.</p>
                <p>Permanent deletion will occur on <strong>{status.deleteScheduledAt ? formatDate(status.deleteScheduledAt) : "unknown"}</strong>.</p>
              </div>
              <button
                onClick={cancelSoftDelete}
                disabled={isCancelling}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
                {isCancelling ? "Cancelling…" : "Cancel scheduled deletion"}
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                Initiating deletion will begin a <strong>30-day soft-delete period</strong>. During this time, all logins
                will be disabled and you can cancel the deletion. After 30 days, a hard purge will permanently remove all
                data and a DPA-compliant deletion certificate will be emailed to you.
              </p>
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>Only platform administrators can initiate district deletion. This action is permanent after the 30-day window.</span>
              </div>
              <button
                onClick={() => { setShowDeleteDialog(true); setDeleteError(null); setDeleteConfirm(""); }}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-lg hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete district data…
              </button>
            </>
          )}
        </div>
      </div>

      {/* DPA info */}
      <div className="flex items-start gap-2.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
        <Shield className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
        <span>
          These tools fulfil contractual DPA obligations. Exported archives and deletion certificates are provided
          for your compliance records. Contact <a href="mailto:dpa@trellis.education" className="underline">dpa@trellis.education</a> with questions.
        </span>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteDialog && status && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="bg-red-600 px-5 py-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-white" />
              <h3 className="text-sm font-semibold text-white">Delete district data</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800 space-y-1">
                <p className="font-medium">You are initiating deletion of:</p>
                <p className="font-bold text-base">{status.districtName}</p>
                <p className="text-xs mt-1">This will schedule a hard purge in 30 days, deleting all students, staff, IEPs, sessions, documents, and compliance records. A DPA deletion certificate will be emailed on completion.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Type the district name to confirm
                </label>
                <input
                  type="text"
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder={status.districtName}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  autoComplete="off"
                />
                {deleteConfirm.length > 0 && deleteConfirm !== status.districtName && (
                  <p className="text-xs text-red-600 mt-1">Name does not match.</p>
                )}
              </div>

              {deleteError && (
                <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{deleteError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setShowDeleteDialog(false); setDeleteConfirm(""); setDeleteError(null); }}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={initiateSoftDelete}
                  disabled={deleting || deleteConfirm !== status.districtName}
                  className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? "Scheduling…" : "Schedule deletion"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
