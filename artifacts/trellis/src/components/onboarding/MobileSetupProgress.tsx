/**
 * MobileSetupProgress — compact setup progress strip for mobile.
 * Shown below the mobile top header when setup is incomplete and the
 * user has permission to view the onboarding checklist. Tapping
 * navigates to /onboarding. Hidden once setup is complete.
 *
 * Admins can temporarily dismiss the strip via the "×" button. The
 * dismissed state is stored in sessionStorage, so the strip returns
 * on the next session/app reload (it never hides permanently).
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Rocket, X } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

interface PilotChecklistSummary {
  pilotChecklist: {
    completedCount: number;
    totalSteps: number;
    isComplete: boolean;
  };
}

const DISMISS_STORAGE_KEY = "noverta:mobile-setup-progress:dismissed";
// Compat: pre-rename users may have dismissed under the legacy key. We
// read the legacy key as a fallback (and migrate on read) so they don't
// see a re-appearance of the dismissed banner. Safe to remove later.
const LEGACY_DISMISS_STORAGE_KEY = "trellis:mobile-setup-progress:dismissed";

function readDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.sessionStorage.getItem(DISMISS_STORAGE_KEY) === "1") return true;
    if (window.sessionStorage.getItem(LEGACY_DISMISS_STORAGE_KEY) === "1") {
      try { window.sessionStorage.setItem(DISMISS_STORAGE_KEY, "1"); } catch {}
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function MobileSetupProgress() {
  const [dismissed, setDismissed] = useState<boolean>(readDismissed);

  const { data, isError } = useQuery<PilotChecklistSummary, Error & { status?: number }>({
    queryKey: ["onboarding/pilot-checklist"],
    queryFn: async () => {
      const r = await authFetch("/api/onboarding/checklist");
      if (!r.ok) {
        const err = new Error("onboarding/checklist failed") as Error & { status?: number };
        err.status = r.status;
        throw err;
      }
      return r.json();
    },
    staleTime: 30_000,
    retry: (failureCount, err) => {
      const status = (err as Error & { status?: number })?.status;
      if (status === 401 || status === 403) return false;
      return failureCount < 2;
    },
  });

  useEffect(() => {
    if (dismissed) {
      try {
        window.sessionStorage.setItem(DISMISS_STORAGE_KEY, "1");
      } catch {
        /* ignore storage errors (private mode, quota) */
      }
    }
  }, [dismissed]);

  if (isError || !data) return null;
  const { completedCount, totalSteps, isComplete } = data.pilotChecklist;
  if (isComplete) return null;
  if (totalSteps <= 0) return null;
  if (dismissed) return null;

  const pct = Math.round((completedCount / totalSteps) * 100);

  return (
    <div
      className="lg:hidden flex items-center bg-emerald-50 border-b border-emerald-100"
      data-testid="mobile-setup-progress"
    >
      <Link
        href="/onboarding"
        className="flex-1 flex items-center gap-2.5 pl-4 pr-2 py-2 hover:bg-emerald-100 transition-colors"
        data-testid="mobile-setup-progress-link"
      >
        <Rocket className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Setup
            </span>
            <span
              className="text-[11px] font-semibold tabular-nums text-emerald-700"
              data-testid="mobile-setup-progress-count"
            >
              {completedCount}/{totalSteps}
            </span>
          </div>
          <div className="h-1 rounded-full bg-emerald-200 overflow-hidden">
            <div
              className="h-1 rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
              aria-label={`${pct}% of setup complete`}
              data-testid="mobile-setup-progress-bar"
            />
          </div>
        </div>
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss setup progress for this session"
        className="flex items-center justify-center w-9 h-9 mr-1 rounded-md text-emerald-700 hover:bg-emerald-100 active:bg-emerald-200 transition-colors flex-shrink-0"
        data-testid="mobile-setup-progress-dismiss"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
