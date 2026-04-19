import { useEffect, useMemo, useState } from "react";
import { Loader2, Bug, Lightbulb, HelpCircle, Mail, ExternalLink, ChevronLeft, X } from "lucide-react";
import { useRole } from "@/lib/role-context";
import { apiGet, apiPatch } from "@/lib/api";

type FeedbackType = "bug" | "suggestion" | "question";
type FeedbackStatus = "new" | "triaged" | "in_progress" | "closed";

interface FeedbackRow {
  id: number;
  districtId: number | null;
  districtName: string | null;
  userId: string;
  userEmail: string | null;
  userRole: string | null;
  userName: string | null;
  type: FeedbackType;
  description: string;
  pageUrl: string | null;
  userAgent: string | null;
  hasScreenshot: boolean;
  consoleErrors: { at: string; message: string }[] | null;
  extraContext: Record<string, unknown> | null;
  status: FeedbackStatus;
  triageNotes: string | null;
  triagedByUserId: string | null;
  triagedAt: string | null;
  emailNotifiedTo: string | null;
  emailNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FeedbackDetail extends FeedbackRow {
  screenshotDataUrl: string | null;
}

const TYPE_ICONS: Record<FeedbackType, typeof Bug> = {
  bug: Bug,
  suggestion: Lightbulb,
  question: HelpCircle,
};

const TYPE_BADGE: Record<FeedbackType, string> = {
  bug: "bg-rose-100 text-rose-700 border-rose-200",
  suggestion: "bg-amber-100 text-amber-700 border-amber-200",
  question: "bg-sky-100 text-sky-700 border-sky-200",
};

const STATUS_BADGE: Record<FeedbackStatus, string> = {
  new: "bg-emerald-100 text-emerald-700 border-emerald-200",
  triaged: "bg-blue-100 text-blue-700 border-blue-200",
  in_progress: "bg-violet-100 text-violet-700 border-violet-200",
  closed: "bg-gray-100 text-gray-600 border-gray-200",
};

const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: "New",
  triaged: "Triaged",
  in_progress: "In progress",
  closed: "Closed",
};

function fmtDateTime(d: string | null): string {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleString();
}

export default function PilotFeedbackPage() {
  const { isPlatformAdmin } = useRole();
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [districtFilter, setDistrictFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<FeedbackType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Pre-select detail when ?id=N (deep-link from notification email).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (id) {
      const n = Number(id);
      if (Number.isInteger(n) && n > 0) setSelectedId(n);
    }
  }, []);

  useEffect(() => {
    if (!isPlatformAdmin) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (districtFilter !== "all") params.set("districtId", districtFilter);
    if (typeFilter !== "all") params.set("type", typeFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    const qs = params.toString();
    apiGet<{ feedback: FeedbackRow[] }>(`/support/pilot-feedback${qs ? `?${qs}` : ""}`)
      .then((r) => setRows(r.feedback))
      .catch((err: { status?: number }) => {
        if (err.status === 403) setAccessDenied(true);
      })
      .finally(() => setLoading(false));
  }, [isPlatformAdmin, districtFilter, typeFilter, statusFilter]);

  const districts = useMemo(() => {
    if (!rows) return [];
    const map = new Map<number, string>();
    for (const r of rows) {
      if (r.districtId !== null) map.set(r.districtId, r.districtName ?? `District #${r.districtId}`);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [rows]);

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

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Pilot Feedback</h1>
        <p className="text-sm text-gray-500 mt-1">
          User-submitted bug reports, suggestions, and questions from pilot districts.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-white border border-gray-200 rounded-lg p-3">
        <FilterSelect
          label="District" value={districtFilter} onChange={setDistrictFilter}
          options={[{ value: "all", label: "All districts" }, ...districts.map((d) => ({ value: String(d.id), label: d.name }))]}
        />
        <FilterSelect
          label="Type" value={typeFilter} onChange={(v) => setTypeFilter(v as FeedbackType | "all")}
          options={[
            { value: "all", label: "All types" },
            { value: "bug", label: "Bug" },
            { value: "suggestion", label: "Suggestion" },
            { value: "question", label: "Question" },
          ]}
        />
        <FilterSelect
          label="Status" value={statusFilter} onChange={(v) => setStatusFilter(v as FeedbackStatus | "all")}
          options={[
            { value: "all", label: "All statuses" },
            { value: "new", label: "New" },
            { value: "triaged", label: "Triaged" },
            { value: "in_progress", label: "In progress" },
            { value: "closed", label: "Closed" },
          ]}
        />
        <div className="ml-auto text-xs text-gray-500" data-testid="feedback-row-count">
          {rows ? `${rows.length} item${rows.length === 1 ? "" : "s"}` : ""}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-500 bg-white border border-dashed border-gray-200 rounded-lg">
          No feedback yet. Submissions from the floating widget will land here.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">District</th>
                <th className="text-left px-4 py-2 font-medium">User</th>
                <th className="text-left px-4 py-2 font-medium">Description</th>
                <th className="text-left px-4 py-2 font-medium">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const Icon = TYPE_ICONS[r.type];
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className="hover:bg-emerald-50/40 cursor-pointer"
                    data-testid={`feedback-row-${r.id}`}
                  >
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${TYPE_BADGE[r.type]}`}>
                        <Icon className="w-3 h-3" /> {r.type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{r.districtName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-gray-700">
                      <div className="font-medium">{r.userName ?? r.userEmail ?? r.userId}</div>
                      {r.userRole && <div className="text-xs text-gray-500">{r.userRole}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 max-w-md truncate">{r.description}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{fmtDateTime(r.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedId !== null && (
        <DetailPanel
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onUpdated={(updated) => {
            setRows((prev) => prev ? prev.map((r) => r.id === updated.id ? { ...r, ...updated } : r) : prev);
          }}
        />
      )}
    </div>
  );
}

function FilterSelect({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-gray-600">
      <span className="font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border border-gray-300 px-2 py-1 text-sm bg-white"
        data-testid={`filter-${label.toLowerCase()}`}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function DetailPanel({
  id, onClose, onUpdated,
}: {
  id: number;
  onClose: () => void;
  onUpdated: (row: { id: number; status: FeedbackStatus; triageNotes: string | null }) => void;
}) {
  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<FeedbackStatus>("new");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setLoading(true);
    apiGet<FeedbackDetail>(`/support/pilot-feedback/${id}`)
      .then((r) => {
        setDetail(r);
        setStatus(r.status);
        setNotes(r.triageNotes ?? "");
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function save() {
    setSaving(true);
    try {
      const updated = await apiPatch<{ id: number; status: FeedbackStatus; triageNotes: string | null }>(
        `/support/pilot-feedback/${id}`,
        { status, triageNotes: notes },
      );
      onUpdated(updated);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white w-full max-w-2xl h-full overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-3 flex items-center justify-between z-10">
          <button onClick={onClose} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
            <ChevronLeft className="w-4 h-4" /> Back to list
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading || !detail ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${TYPE_BADGE[detail.type]}`}>
                    {detail.type}
                  </span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_BADGE[detail.status]}`}>
                    {STATUS_LABEL[detail.status]}
                  </span>
                  <span className="text-xs text-gray-500">#{detail.id}</span>
                </div>
                <h2 className="text-lg font-semibold text-gray-900">{detail.districtName ?? "Unknown district"}</h2>
                <p className="text-sm text-gray-500">
                  {detail.userName ?? detail.userId}
                  {detail.userRole && <span className="text-gray-400"> · {detail.userRole}</span>}
                  {detail.userEmail && (
                    <a href={`mailto:${detail.userEmail}`} className="ml-2 text-emerald-700 hover:underline inline-flex items-center gap-1">
                      <Mail className="w-3 h-3" /> {detail.userEmail}
                    </a>
                  )}
                </p>
              </div>
            </div>

            <section>
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-1.5">Description</h3>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm whitespace-pre-wrap">{detail.description}</div>
            </section>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <DetailField label="Submitted" value={fmtDateTime(detail.createdAt)} />
              <DetailField label="Page" value={detail.pageUrl ?? "—"} link={detail.pageUrl ?? undefined} />
              <DetailField label="Browser" value={detail.userAgent ?? "—"} />
              <DetailField
                label="Email notified"
                value={detail.emailNotifiedAt
                  ? `${detail.emailNotifiedTo ?? "?"} · ${fmtDateTime(detail.emailNotifiedAt)}`
                  : detail.emailNotifiedTo
                    ? `${detail.emailNotifiedTo} (failed)`
                    : "Not sent"}
              />
            </div>

            {detail.screenshotDataUrl && (
              <section>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-1.5">Screenshot</h3>
                <a href={detail.screenshotDataUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={detail.screenshotDataUrl}
                    alt="User-submitted screenshot"
                    className="w-full rounded border border-gray-200 hover:opacity-95"
                  />
                </a>
              </section>
            )}

            {detail.consoleErrors && detail.consoleErrors.length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-1.5">
                  Recent console errors ({detail.consoleErrors.length})
                </h3>
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 max-h-64 overflow-y-auto space-y-2 font-mono text-[11px]">
                  {detail.consoleErrors.map((err, i) => (
                    <div key={i}>
                      <div className="text-rose-500">{fmtDateTime(err.at)}</div>
                      <div className="text-rose-900 whitespace-pre-wrap break-all">{err.message}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {detail.extraContext && Object.keys(detail.extraContext).length > 0 && (
              <section>
                <h3 className="text-xs font-medium text-gray-500 uppercase mb-1.5">Extra context</h3>
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-[11px] overflow-x-auto">
                  {JSON.stringify(detail.extraContext, null, 2)}
                </pre>
              </section>
            )}

            <section className="border-t border-gray-200 pt-4 space-y-3">
              <h3 className="text-xs font-medium text-gray-500 uppercase">Triage</h3>
              <label className="block text-xs">
                <span className="font-medium text-gray-700">Status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
                  className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm bg-white"
                  data-testid="detail-status-select"
                >
                  <option value="new">New</option>
                  <option value="triaged">Triaged</option>
                  <option value="in_progress">In progress</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <label className="block text-xs">
                <span className="font-medium text-gray-700">Triage notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="mt-1 block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  placeholder="What's the next step?"
                  data-testid="detail-notes"
                />
              </label>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2"
                  data-testid="detail-save"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save changes
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailField({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded p-2">
      <div className="text-gray-500 mb-0.5">{label}</div>
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className="text-emerald-700 hover:underline break-all flex items-center gap-1">
          {value} <ExternalLink className="w-3 h-3 inline" />
        </a>
      ) : (
        <div className="text-gray-900 break-all">{value}</div>
      )}
    </div>
  );
}
