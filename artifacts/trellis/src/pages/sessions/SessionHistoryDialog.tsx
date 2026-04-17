import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { History, AlertCircle } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

type AuditEvent = {
  id: number;
  action: string;
  actorUserId: string;
  actorRole: string;
  ipAddress: string | null;
  summary: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

type HistoryResponse = {
  sessionId: number;
  studentId: number;
  sessionDate: string;
  deletedAt: string | null;
  lastEditedAt: string | null;
  lastEditedByUserId: string | null;
  events: AuditEvent[];
};

function shortId(id: string | null): string {
  if (!id) return "—";
  if (id === "anonymous") return "anonymous";
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
}

function ActionBadge({ action, isRestore }: { action: string; isRestore: boolean }) {
  const label = isRestore ? "restore" : action;
  const cls =
    isRestore ? "bg-emerald-100 text-emerald-700" :
    action === "create" ? "bg-blue-100 text-blue-700" :
    action === "update" ? "bg-amber-100 text-amber-700" :
    action === "delete" ? "bg-rose-100 text-rose-700" :
    "bg-slate-100 text-slate-700";
  return <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${cls}`}>{label}</span>;
}

function valueToString(v: unknown): string {
  if (v === null || v === undefined) return "∅";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function SessionHistoryDialog({
  sessionId,
  open,
  onClose,
  canRestore,
  onRestored,
}: {
  sessionId: number | null;
  open: boolean;
  onClose: () => void;
  canRestore: boolean;
  onRestored?: () => void;
}) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!open || sessionId == null) return;
    setLoading(true);
    setError(null);
    setData(null);
    authFetch(`/api/sessions/${sessionId}/history`)
      .then(async r => {
        if (!r.ok) throw new Error(`Failed to load history (${r.status})`);
        return r.json() as Promise<HistoryResponse>;
      })
      .then(setData)
      .catch(e => setError(e.message ?? "Failed to load history"))
      .finally(() => setLoading(false));
  }, [open, sessionId]);

  async function handleRestore() {
    if (sessionId == null) return;
    setRestoring(true);
    try {
      const r = await authFetch(`/api/sessions/${sessionId}/restore`, { method: "POST" });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `Restore failed (${r.status})`);
      }
      onRestored?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg flex items-center gap-2">
            <History className="w-4 h-4" /> Session #{sessionId} — Edit History
          </DialogTitle>
        </DialogHeader>

        {loading && <div className="text-[13px] text-slate-500 py-6 text-center">Loading audit trail…</div>}
        {error && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 rounded p-2 text-[12px] text-rose-700">
            <AlertCircle className="w-4 h-4 mt-0.5" /> <span>{error}</span>
          </div>
        )}

        {data && (
          <div className="space-y-3">
            <div className="text-[12px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 space-y-1">
              <div>Session date: <span className="font-medium">{data.sessionDate}</span></div>
              <div>
                Last edited: {data.lastEditedAt
                  ? <><span className="font-medium">{fmtTime(data.lastEditedAt)}</span> by <code className="text-[11px]">{shortId(data.lastEditedByUserId)}</code></>
                  : <span className="text-slate-400">never</span>}
              </div>
              {data.deletedAt && (
                <div className="text-rose-700">
                  Soft-deleted at <span className="font-medium">{fmtTime(data.deletedAt)}</span>
                  {canRestore && " — restore available below"}
                </div>
              )}
            </div>

            {data.events.length === 0 ? (
              <div className="text-[12px] text-slate-400 py-4 text-center">No audit entries recorded.</div>
            ) : (
              <ol className="space-y-2">
                {data.events.map(ev => {
                  const isRestore = ev.action === "update" && (ev.metadata as { restore?: boolean } | null)?.restore === true;
                  return (
                    <li key={ev.id} className="border border-slate-200 rounded p-2 text-[12px]">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <ActionBadge action={ev.action} isRestore={isRestore} />
                          <span className="text-slate-500">{fmtTime(ev.createdAt)}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          <code>{shortId(ev.actorUserId)}</code> · {ev.actorRole}
                          {ev.ipAddress && <> · {ev.ipAddress}</>}
                        </div>
                      </div>
                      {ev.summary && <div className="mt-1 text-slate-700">{ev.summary}</div>}
                      {ev.newValues && Object.keys(ev.newValues).length > 0 && (
                        <table className="mt-2 w-full text-[11px] border-collapse">
                          <thead>
                            <tr className="text-slate-400 text-left">
                              <th className="font-normal pr-2">Field</th>
                              <th className="font-normal pr-2">Before</th>
                              <th className="font-normal">After</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.keys(ev.newValues).map(k => (
                              <tr key={k} className="border-t border-slate-100">
                                <td className="pr-2 py-0.5 font-medium text-slate-600">{k}</td>
                                <td className="pr-2 py-0.5 text-rose-600 break-all">{valueToString(ev.oldValues?.[k])}</td>
                                <td className="py-0.5 text-emerald-700 break-all">{valueToString(ev.newValues?.[k])}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )}

        <DialogFooter>
          {data?.deletedAt && canRestore && (
            <Button
              size="sm"
              className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]"
              disabled={restoring}
              onClick={handleRestore}
            >
              {restoring ? "Restoring…" : "Restore Session"}
            </Button>
          )}
          <Button variant="outline" size="sm" className="text-[12px]" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
