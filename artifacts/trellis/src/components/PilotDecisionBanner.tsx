import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Sparkles, X } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useRole } from "@/lib/role-context";
import { migrateLocalGet } from "@/lib/storage-migration";

interface PilotDecisionStatus {
  isPilot: boolean;
  showBanner: boolean;
  dayInPilot: number | null;
  pilotLengthDays: number;
  decisionWindowOpensDay: number;
  decision: { outcome: string } | null;
}

const DISMISS_KEY = "noverta.pilot-decision-banner.dismissed-until";
const LEGACY_DISMISS_KEY = "trellis.pilot-decision-banner.dismissed-until";

export function PilotDecisionBanner() {
  const { role } = useRole();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<PilotDecisionStatus | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    // Read-fallback: prefer noverta.*; copy-forward from legacy
    // trellis.* and clear the old key only on a successful copy.
    const until = migrateLocalGet(DISMISS_KEY, LEGACY_DISMISS_KEY);
    if (!until) return false;
    return Date.now() < Number(until);
  });

  useEffect(() => {
    if (role !== "admin" && role !== "coordinator") return;
    let cancelled = false;
    apiGet<PilotDecisionStatus>("/pilot/decision/status")
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [role]);

  if (!status || !status.showBanner || dismissed) return null;
  if (role !== "admin" && role !== "coordinator") return null;

  const remaining =
    status.dayInPilot != null
      ? Math.max(0, status.pilotLengthDays - status.dayInPilot)
      : null;
  const message =
    remaining != null
      ? `You're on day ${status.dayInPilot} of your ${status.pilotLengthDays}-day pilot — ${remaining} days left. Take a moment to make your renewal decision.`
      : `Your pilot has reached the renewal decision window.`;

  const onDismiss = () => {
    setDismissed(true);
    if (typeof window !== "undefined") {
      // Hide for 24 hours so we don't pester, but the page is still reachable.
      try {
        window.localStorage.setItem(
          DISMISS_KEY,
          String(Date.now() + 24 * 60 * 60 * 1000),
        );
        // Clear the legacy key so a stale dismissal can't resurface via
        // the read-fallback after the new value expires.
        window.localStorage.removeItem(LEGACY_DISMISS_KEY);
      } catch { /* ignore storage errors */ }
    }
  };

  return (
    <div
      className="px-4 py-3 flex items-center justify-between bg-emerald-50 border-b border-emerald-200"
      data-testid="pilot-decision-banner"
    >
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-emerald-600 shrink-0" />
        <p className="text-sm text-emerald-900">{message}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => navigate("/pilot-decision")}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700"
          data-testid="pilot-decision-banner-cta"
        >
          Open Pilot Decision
        </button>
        <button
          onClick={onDismiss}
          className="text-emerald-700/70 hover:text-emerald-900"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
