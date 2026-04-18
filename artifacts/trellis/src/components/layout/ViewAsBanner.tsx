/**
 * Persistent banner that appears whenever a platform admin has an active
 * view-as session. Always visible across every route in AppLayout — there is
 * no way to dismiss it short of ending the session, which is intentional:
 * the admin must be constantly aware that their actions are being recorded
 * against the target user's identity.
 *
 * Renders nothing when no session is active, so it is cheap to mount globally.
 */
import { useViewAs } from "@/lib/view-as-context";
import { ShieldAlert, X } from "lucide-react";
import { useState } from "react";

function fmtRemaining(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ViewAsBanner() {
  const { session, remainingMs, endSession } = useViewAs();
  const [ending, setEnding] = useState(false);
  if (!session) return null;

  // Visual urgency cue when under 5 minutes remain.
  const urgent = remainingMs < 5 * 60 * 1000;
  const onEnd = async () => {
    if (ending) return;
    setEnding(true);
    try { await endSession(); } finally { setEnding(false); }
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="view-as-banner"
      className={`flex items-center justify-between gap-3 px-4 py-2 text-sm border-b ${
        urgent
          ? "bg-red-600 text-white border-red-700"
          : "bg-amber-500 text-white border-amber-600"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <ShieldAlert className="h-4 w-4 flex-shrink-0" />
        <span className="font-semibold whitespace-nowrap">Viewing as:</span>
        <span className="truncate" data-testid="view-as-target">
          {session.target.displayName}{" "}
          <span className="opacity-80 font-mono text-xs">({session.target.role})</span>
        </span>
        <span className="hidden md:inline opacity-90 truncate text-xs italic">
          — {session.reason}
        </span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span
          className="font-mono text-xs tabular-nums"
          data-testid="view-as-countdown"
          aria-label={`Session expires in ${fmtRemaining(remainingMs)}`}
        >
          {fmtRemaining(remainingMs)}
        </span>
        <button
          type="button"
          onClick={onEnd}
          disabled={ending}
          data-testid="view-as-end-button"
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/15 hover:bg-white/25 disabled:opacity-50 text-xs font-medium"
        >
          <X className="h-3 w-3" />
          End session
        </button>
      </div>
    </div>
  );
}
