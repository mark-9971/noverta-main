/**
 * MobileSetupProgress — compact setup progress strip for mobile.
 * Shown below the mobile top header when setup is incomplete and the
 * user has permission to view the onboarding checklist. Tapping
 * navigates to /onboarding. Hidden once setup is complete.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Rocket } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

interface PilotChecklistSummary {
  pilotChecklist: {
    completedCount: number;
    totalSteps: number;
    isComplete: boolean;
  };
}

export function MobileSetupProgress() {
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

  if (isError || !data) return null;
  const { completedCount, totalSteps, isComplete } = data.pilotChecklist;
  if (isComplete) return null;
  if (totalSteps <= 0) return null;

  const pct = Math.round((completedCount / totalSteps) * 100);

  return (
    <Link
      href="/onboarding"
      className="lg:hidden flex items-center gap-2.5 px-4 py-2 bg-emerald-50 border-b border-emerald-100 hover:bg-emerald-100 transition-colors"
      data-testid="mobile-setup-progress"
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
  );
}
