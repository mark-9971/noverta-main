import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";

interface ChecklistVisibilityData {
  checklistDismissed: boolean;
  isLoading: boolean;
  isDismissing: boolean;
  isShowing: boolean;
  dismiss: () => void;
  show: () => void;
}

export function useChecklistVisibility(): ChecklistVisibilityData {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<{ checklistDismissed?: boolean }>({
    queryKey: ["onboarding/pilot-checklist"],
    queryFn: async () => {
      const r = await authFetch("/api/onboarding/checklist");
      if (!r.ok) throw new Error("onboarding/checklist failed");
      return r.json();
    },
    staleTime: 30_000,
  });

  const invalidate = () => {
    // Dashboard, sidebar, and checklist all share this single cache key now,
    // so one invalidation refreshes every surface that displays setup state.
    queryClient.invalidateQueries({ queryKey: ["onboarding/pilot-checklist"] });
  };

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const r = await authFetch("/api/onboarding/dismiss-checklist", { method: "POST" });
      if (!r.ok) throw new Error("dismiss-checklist failed");
      return r.json();
    },
    onSuccess: invalidate,
  });

  const showMutation = useMutation({
    mutationFn: async () => {
      const r = await authFetch("/api/onboarding/show-checklist", { method: "POST" });
      if (!r.ok) throw new Error("show-checklist failed");
      return r.json();
    },
    onSuccess: invalidate,
  });

  return {
    checklistDismissed: data?.checklistDismissed ?? false,
    isLoading,
    isDismissing: dismissMutation.isPending,
    isShowing: showMutation.isPending,
    dismiss: () => dismissMutation.mutate(),
    show: () => showMutation.mutate(),
  };
}
