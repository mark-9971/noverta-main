/**
 * SidebarSetupProgress — persistent, lightweight progress indicator that
 * lives in the sidebar. Stays visible even when the dashboard checklist
 * widget has been dismissed, so districts in mid-setup never lose sight
 * of how far along they are. Hidden once setup is complete and hidden
 * for any user who lacks permission to read the onboarding checklist
 * (the API returns 401/403 in that case, which we swallow silently).
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Rocket } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { cn } from "@/lib/utils";

interface PilotChecklistSummary {
  pilotChecklist: {
    completedCount: number;
    totalSteps: number;
    isComplete: boolean;
  };
}

export function SidebarSetupProgress() {
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
      className={cn(
        "flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors group",
        "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
      )}
      title={`District onboarding — ${completedCount} of ${totalSteps} steps complete. Click to view checklist.`}
      data-testid="sidebar-setup-progress"
    >
      <Rocket className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-sidebar-foreground/60 group-hover:text-sidebar-foreground/80">
            Setup
          </span>
          <span
            className="text-[11px] font-semibold tabular-nums text-sidebar-foreground/80"
            data-testid="sidebar-setup-progress-count"
          >
            {completedCount}/{totalSteps}
          </span>
        </div>
        <div className="mt-1 h-1 rounded-full bg-sidebar-accent overflow-hidden">
          <div
            className="h-1 rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
            aria-label={`${pct}% of setup complete`}
            data-testid="sidebar-setup-progress-bar"
          />
        </div>
      </div>
    </Link>
  );
}
