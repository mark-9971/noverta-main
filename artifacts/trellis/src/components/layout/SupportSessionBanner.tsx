/**
 * Persistent banner shown across every authenticated route while a
 * trellis_support user has an active read-only session pinned to a district.
 * Hidden when no session is active.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { LifeBuoy, X } from "lucide-react";
import { useSupportSession } from "@/lib/support-session-context";

function fmt(ms: number): string {
  if (ms <= 0) return "0:00";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function SupportSessionBanner() {
  const { session, remainingMs, endSession } = useSupportSession();
  const [, navigate] = useLocation();
  const [ending, setEnding] = useState(false);
  if (!session) return null;
  const urgent = remainingMs < 5 * 60 * 1000;
  const onEnd = async () => {
    if (ending) return;
    setEnding(true);
    try { await endSession(); navigate("/support-session"); } finally { setEnding(false); }
  };
  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="support-session-banner"
      className={`flex items-center justify-between gap-3 px-4 py-2 text-sm border-b ${
        urgent
          ? "bg-red-600 text-white border-red-700"
          : "bg-sky-700 text-white border-sky-800"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <LifeBuoy className="h-4 w-4 flex-shrink-0" />
        <span className="font-semibold whitespace-nowrap">Trellis Support read-only:</span>
        <span className="truncate" data-testid="support-session-district">
          District #{session.districtId}
        </span>
        <span className="hidden md:inline opacity-90 truncate text-xs italic">
          — {session.reason}
        </span>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span
          className="font-mono text-xs tabular-nums"
          data-testid="support-session-countdown"
          aria-label={`Session expires in ${fmt(remainingMs)}`}
        >
          {fmt(remainingMs)}
        </span>
        <button
          type="button"
          onClick={onEnd}
          disabled={ending}
          data-testid="support-session-end-button"
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/15 hover:bg-white/25 disabled:opacity-50 text-xs font-medium"
        >
          <X className="h-3 w-3" />
          End session
        </button>
      </div>
    </div>
  );
}
