/**
 * Task #951 — Shared, district-scoped dismiss/snooze for Action Center.
 *
 * Mirrors `useHandlingState` in shape/ergonomics, but backs the
 * orthogonal "hide this from the queue" intent. Replaces the per-browser
 * `useHiddenItems` localStorage that Action Center used previously.
 *
 * Public surface:
 *   - `useDismissalState(itemIds)` returns:
 *       - `hidden`: Record<itemId, DismissalEntry> for currently-active rows
 *       - `dismiss(itemId, snapshot)`: hide indefinitely or for the default 7d
 *       - `snooze(itemId, durationMs, label, snapshot)`: hide until expiry
 *       - `restore(itemId)`: un-hide
 *       - `restoreAll()`: clear every dismissal in the district
 *       - `isLoading`
 *
 * Caching is via React Query, with optimistic updates and invalidation
 * after each mutation. We periodically refetch (60s) so an item whose
 * snooze elapses on the server quietly reappears for everyone in the
 * district without a manual reload.
 */

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost } from "./api";

const DEFAULT_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface DismissalSnapshot {
  title: string;
  detail: string;
}

export interface DismissalRow {
  itemId: string;
  state: "dismissed" | "snoozed";
  dismissedUntil: string | null;
  durationLabel: string | null;
  snapshot: DismissalSnapshot;
  updatedByUserId: string;
  updatedByName: string | null;
  updatedAt: string;
}

export interface DismissalEntry {
  state: "dismissed" | "snoozed";
  /** Unix ms; Number.POSITIVE_INFINITY ⇒ indefinite. */
  expiresAt: number;
  durationLabel: string;
  hiddenAt: number;
  updatedByName: string | null;
  snapshot: DismissalSnapshot;
}

function batchKey(ids: readonly string[]) {
  return ["action-item-dismissals", "batch", [...ids].sort().join("|")] as const;
}

async function fetchBatch(ids: string[]): Promise<DismissalRow[]> {
  if (ids.length === 0) return [];
  if (ids.length <= 40) {
    const qs = encodeURIComponent(ids.join(","));
    const res = await apiGet<{ data: DismissalRow[] }>(`/action-item-dismissals?ids=${qs}`);
    return res.data;
  }
  const res = await apiPost<{ data: DismissalRow[] }>("/action-item-dismissals/batch", { ids });
  return res.data;
}

function rowToEntry(r: DismissalRow): DismissalEntry {
  const expiresAt = r.dismissedUntil ? Date.parse(r.dismissedUntil) : Number.POSITIVE_INFINITY;
  return {
    state: r.state,
    expiresAt,
    durationLabel: r.durationLabel ?? (r.state === "dismissed" ? "no auto-restore" : ""),
    hiddenAt: r.updatedAt ? Date.parse(r.updatedAt) : Date.now(),
    updatedByName: r.updatedByName,
    snapshot: r.snapshot,
  };
}

interface UpsertVars {
  itemId: string;
  state: "dismissed" | "snoozed";
  dismissedUntil: string | null;
  durationLabel: string;
  snapshot: DismissalSnapshot;
}

export function useDismissalState(itemIds: readonly string[]) {
  const qc = useQueryClient();

  const ids = useMemo<string[]>(
    () => Array.from(new Set(itemIds.filter(Boolean))),
    [itemIds],
  );

  const query = useQuery({
    queryKey: batchKey(ids),
    queryFn: () => fetchBatch(ids),
    enabled: ids.length > 0,
    staleTime: 15_000,
    // Drive automatic re-evaluation: a snooze that expires server-side
    // quietly reappears on the next tick without a manual reload.
    refetchInterval: 60_000,
  });

  const hidden = useMemo<Record<string, DismissalEntry>>(() => {
    const out: Record<string, DismissalEntry> = {};
    const now = Date.now();
    for (const r of query.data ?? []) {
      const e = rowToEntry(r);
      // Defensive: server already filters expired, but a race is possible.
      if (e.expiresAt > now) out[r.itemId] = e;
    }
    return out;
  }, [query.data]);

  const upsertMutation = useMutation({
    mutationFn: async (vars: UpsertVars) => {
      const res = await apiPost<{ data: DismissalRow }>("/action-item-dismissals", {
        itemId: vars.itemId,
        state: vars.state,
        dismissedUntil: vars.dismissedUntil,
        durationLabel: vars.durationLabel,
        snapshot: vars.snapshot,
      });
      return res.data;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["action-item-dismissals", "batch"] });
      const snapshot = qc.getQueriesData<DismissalRow[]>({ queryKey: ["action-item-dismissals", "batch"] });
      const optimistic: DismissalRow = {
        itemId: vars.itemId,
        state: vars.state,
        dismissedUntil: vars.dismissedUntil,
        durationLabel: vars.durationLabel,
        snapshot: vars.snapshot,
        updatedByUserId: "(you)",
        updatedByName: null,
        updatedAt: new Date().toISOString(),
      };
      qc.setQueriesData<DismissalRow[]>({ queryKey: ["action-item-dismissals", "batch"] }, (old) => {
        if (!old) return old;
        const others = old.filter(r => r.itemId !== vars.itemId);
        return [...others, optimistic];
      });
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.snapshot) return;
      for (const [key, data] of ctx.snapshot) qc.setQueryData(key, data);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["action-item-dismissals"] });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await apiDelete(`/action-item-dismissals/${encodeURIComponent(itemId)}`);
    },
    onMutate: async (itemId) => {
      await qc.cancelQueries({ queryKey: ["action-item-dismissals", "batch"] });
      const snapshot = qc.getQueriesData<DismissalRow[]>({ queryKey: ["action-item-dismissals", "batch"] });
      qc.setQueriesData<DismissalRow[]>({ queryKey: ["action-item-dismissals", "batch"] }, (old) => {
        if (!old) return old;
        return old.filter(r => r.itemId !== itemId);
      });
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.snapshot) return;
      for (const [key, data] of ctx.snapshot) qc.setQueryData(key, data);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["action-item-dismissals"] });
    },
  });

  const restoreAllMutation = useMutation({
    mutationFn: async (idsToRestore?: string[]) => {
      await apiPost("/action-item-dismissals/restore-all", idsToRestore ? { ids: idsToRestore } : {});
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["action-item-dismissals", "batch"] });
      const snapshot = qc.getQueriesData<DismissalRow[]>({ queryKey: ["action-item-dismissals", "batch"] });
      qc.setQueriesData<DismissalRow[]>({ queryKey: ["action-item-dismissals", "batch"] }, () => []);
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.snapshot) return;
      for (const [key, data] of ctx.snapshot) qc.setQueryData(key, data);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["action-item-dismissals"] });
    },
  });

  const dismiss = useCallback((itemId: string, snapshot: DismissalSnapshot) => {
    const until = new Date(Date.now() + DEFAULT_DISMISS_TTL_MS).toISOString();
    upsertMutation.mutate({
      itemId,
      state: "dismissed",
      dismissedUntil: until,
      durationLabel: "auto-restore in 7d",
      snapshot,
    });
  }, [upsertMutation]);

  const snooze = useCallback((itemId: string, durationMs: number, label: string, snapshot: DismissalSnapshot) => {
    const until = new Date(Date.now() + durationMs).toISOString();
    upsertMutation.mutate({
      itemId,
      state: "snoozed",
      dismissedUntil: until,
      durationLabel: label,
      snapshot,
    });
  }, [upsertMutation]);

  const restore = useCallback((itemId: string) => {
    restoreMutation.mutate(itemId);
  }, [restoreMutation]);

  const restoreAll = useCallback(() => {
    restoreAllMutation.mutate(undefined);
  }, [restoreAllMutation]);

  const isHidden = useCallback((itemId: string): boolean => {
    return itemId in hidden;
  }, [hidden]);

  return {
    hidden,
    dismiss,
    snooze,
    restore,
    restoreAll,
    isHidden,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  };
}
