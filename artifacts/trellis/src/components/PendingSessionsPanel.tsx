/**
 * PendingSessionsPanel — surfaces locally-queued ABA sessions that failed to
 * sync to the server. Lets staff retry or discard them.
 *
 * IMPORTANT: the underlying API (POST /api/students/:id/data-sessions) is NOT
 * idempotent. If the original request reached the server but the client never
 * got the 201 response, retrying will create a DUPLICATE session. We make this
 * explicit in the UI and require an explicit "I understand" confirmation before
 * retrying.
 */

import { useState } from "react";
import { createDataSession } from "@workspace/api-client-react";
import { useOfflineQueue, type PendingSession } from "@/lib/useOfflineQueue";
import { AlertTriangle, CloudOff, RefreshCw, Trash2, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  /** Optionally restrict the panel to a specific student */
  studentId?: number;
}

type SyncState = "idle" | "syncing" | "done" | "error";

export function PendingSessionsPanel({ studentId }: Props) {
  const { queue, dequeue, markAttempt, clearAll } = useOfflineQueue();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const visible = studentId != null
    ? queue.filter(s => s.studentId === studentId)
    : queue;

  if (visible.length === 0) return null;

  async function retrySession(session: PendingSession) {
    setSyncingId(session.id);
    try {
      await createDataSession(session.studentId, session.payload as any);
      dequeue(session.id);
      toast.success(`Session from ${session.payload.sessionDate} synced successfully.`);
    } catch (err: any) {
      const msg = err?.message ?? "Network error";
      markAttempt(session.id, msg);
      toast.error(`Sync failed: ${msg}`);
    } finally {
      setSyncingId(null);
    }
  }

  async function retryAll() {
    for (const session of visible) {
      await retrySession(session);
    }
  }

  function discard(id: string) {
    if (!window.confirm(
      "Discard this locally-saved session? This cannot be undone — the session data will be permanently deleted from this device."
    )) return;
    dequeue(id);
    toast.info("Session discarded.");
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <CloudOff className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-amber-800">
            {visible.length} session{visible.length !== 1 ? "s" : ""} saved locally — not yet synced
          </p>
          <p className="text-[11px] text-amber-700 mt-0.5">
            These sessions were recorded on this device but could not be uploaded at the time.
            They are stored in your browser and will be lost if you clear browser data.
          </p>
        </div>
      </div>

      {/* Idempotency warning */}
      <div className="rounded-lg border border-amber-300 bg-amber-100 p-2.5 flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[11px] font-semibold text-amber-800">Before retrying:</p>
          <p className="text-[11px] text-amber-700 mt-0.5">
            If a session was already received by the server (e.g. the network recovered
            mid-save), retrying will create a <strong>duplicate</strong>. Check the session
            history before retrying if you are unsure.
          </p>
          <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-amber-400 text-amber-600"
            />
            <span className="text-[11px] text-amber-800 font-medium">
              I understand the duplicate risk
            </span>
          </label>
        </div>
      </div>

      <div className="space-y-2">
        {visible.map(session => (
          <div key={session.id} className="rounded-lg border border-amber-200 bg-white p-2.5 flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-gray-800">
                {session.studentName} — {session.payload.sessionDate}
              </p>
              <p className="text-[10px] text-gray-500">
                {session.payload.startTime}–{session.payload.endTime}
                {" · "}{session.payload.sessionType.replace("_", " ")}
                {session.payload.behaviorData.length > 0 && ` · ${session.payload.behaviorData.length} behavior target${session.payload.behaviorData.length !== 1 ? "s" : ""}`}
                {session.payload.programData.length > 0 && ` · ${session.payload.programData.length} program target${session.payload.programData.length !== 1 ? "s" : ""}`}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Saved locally: {new Date(session.savedAt).toLocaleString()}
                {session.attempts > 0 && ` · ${session.attempts} retry attempt${session.attempts !== 1 ? "s" : ""}`}
              </p>
              {session.lastError && (
                <p className="text-[10px] text-red-500 mt-0.5 truncate">Last error: {session.lastError}</p>
              )}
            </div>
            <div className="flex flex-col gap-1 flex-shrink-0">
              <button
                disabled={!confirmed || syncingId != null}
                onClick={() => retrySession(session)}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-amber-600 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-700"
              >
                {syncingId === session.id
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Syncing…</>
                  : <><RefreshCw className="w-3 h-3" /> Retry</>
                }
              </button>
              <button
                onClick={() => discard(session.id)}
                disabled={syncingId != null}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-red-50 text-red-500 border border-red-200 hover:bg-red-100 disabled:opacity-40"
              >
                <Trash2 className="w-3 h-3" /> Discard
              </button>
            </div>
          </div>
        ))}
      </div>

      {visible.length > 1 && (
        <button
          disabled={!confirmed || syncingId != null}
          onClick={retryAll}
          className="w-full text-[11px] py-1.5 rounded-lg border border-amber-300 text-amber-800 bg-amber-100 hover:bg-amber-200 font-medium flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RefreshCw className="w-3 h-3" /> Retry all {visible.length} sessions
        </button>
      )}
    </div>
  );
}
