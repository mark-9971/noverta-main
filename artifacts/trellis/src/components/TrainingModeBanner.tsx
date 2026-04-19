import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { GraduationCap, Loader2, X, RotateCcw } from "lucide-react";

interface TrainingModeStatus {
  enabled: boolean;
  resetAvailable: boolean;
}

/**
 * Persistent yellow banner shown across the app while the current user has
 * Training Mode toggled on. Lets the provider exit training mode in one click
 * and reset just their own practice writes without leaving the page.
 *
 * The status is fetched separately from the toggle endpoint so the banner can
 * appear immediately on any page after the toggle, and also after a hard
 * refresh while training mode is still on.
 */
export function TrainingModeBanner() {
  const queryClient = useQueryClient();
  const [confirmingReset, setConfirmingReset] = useState(false);

  const { data } = useQuery<TrainingModeStatus>({
    queryKey: ["training-mode/status"],
    queryFn: async () => {
      const r = await authFetch("/api/training-mode");
      if (!r.ok) throw new Error("training-mode status failed");
      return r.json();
    },
    staleTime: 30_000,
  });

  const disable = useMutation({
    mutationFn: async () => {
      const r = await authFetch("/api/training-mode/disable", { method: "POST" });
      if (!r.ok) throw new Error("Failed to exit training mode");
      return r.json();
    },
    onSuccess: () => {
      // Invalidate every cached query — switching out of training mode means
      // the entire UI now needs to refetch against real data.
      queryClient.invalidateQueries();
    },
  });

  const reset = useMutation({
    mutationFn: async () => {
      const r = await authFetch("/api/training-mode/reset", { method: "POST" });
      if (!r.ok) throw new Error("Reset failed");
      return r.json();
    },
    onSuccess: () => {
      setConfirmingReset(false);
      queryClient.invalidateQueries();
    },
  });

  if (!data?.enabled) return null;

  return (
    <div
      role="status"
      aria-label="Training mode active"
      data-testid="banner-training-mode"
      className="flex flex-wrap items-center gap-2 px-4 py-1.5 bg-yellow-100 border-b border-yellow-300 text-[12px] text-yellow-900"
    >
      <GraduationCap className="w-3.5 h-3.5 flex-shrink-0 text-yellow-800" />
      <span className="font-semibold">Training Mode</span>
      <span className="text-yellow-900/90">
        You're practicing on sample students. Nothing you do here touches your real roster.
      </span>
      <div className="ml-auto flex items-center gap-2">
        {confirmingReset ? (
          <>
            <span className="text-yellow-900 font-medium">Reset all your training data?</span>
            <button
              onClick={() => reset.mutate()}
              disabled={reset.isPending}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-700 text-white hover:bg-yellow-800 disabled:opacity-50"
              data-testid="button-confirm-training-reset"
            >
              {reset.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Yes, reset
            </button>
            <button
              onClick={() => setConfirmingReset(false)}
              disabled={reset.isPending}
              className="px-2 py-0.5 rounded text-yellow-900 hover:text-yellow-950"
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmingReset(true)}
            className="inline-flex items-center gap-1 text-yellow-900 hover:text-yellow-950 underline"
            data-testid="button-reset-training-data"
            title="Delete all session logs you created in training mode"
          >
            <RotateCcw className="w-3 h-3" /> Reset training data
          </button>
        )}
        <button
          onClick={() => disable.mutate()}
          disabled={disable.isPending}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-yellow-800 text-white hover:bg-yellow-900 disabled:opacity-50"
          data-testid="button-exit-training-mode"
        >
          {disable.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
          Exit Training Mode
        </button>
      </div>
    </div>
  );
}

/**
 * Compact button rendered inside the sidebar profile menu that toggles
 * Training Mode on. Hidden once Training Mode is already on (the banner's
 * "Exit" button takes over from there).
 */
export function TrainingModeToggleButton() {
  const queryClient = useQueryClient();
  const { data } = useQuery<TrainingModeStatus>({
    queryKey: ["training-mode/status"],
    queryFn: async () => {
      const r = await authFetch("/api/training-mode");
      if (!r.ok) throw new Error("training-mode status failed");
      return r.json();
    },
    staleTime: 30_000,
  });

  const enable = useMutation({
    mutationFn: async () => {
      const r = await authFetch("/api/training-mode/enable", { method: "POST" });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body?.error || "Failed to enter training mode");
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
    },
  });

  if (data?.enabled) return null;

  return (
    <button
      onClick={() => enable.mutate()}
      disabled={enable.isPending}
      className="p-1.5 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors flex-shrink-0 disabled:opacity-50"
      title="Enter Training Mode — practice without touching real student data"
      data-testid="button-enter-training-mode"
    >
      {enable.isPending ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <GraduationCap className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
