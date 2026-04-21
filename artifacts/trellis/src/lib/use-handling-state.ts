/**
 * Pilot Wedge Phase 1E — district-scoped, server-side shared handling
 * state for at-risk action items.
 *
 * Replaces the per-browser localStorage that Phase 1B/1D used. Two
 * admins viewing the same student or alert now see the SAME pill, with
 * the SAME ownership note, sourced from the `action_item_handling`
 * table on the API server.
 *
 * Public surface (intentionally unchanged from 1B/1D so callers don't
 * need to be rewritten):
 *   - `useHandlingState(itemIds, opts?)` returns `{ getState, setState, clear, isLoading }`.
 *     `itemIds` is the list of canonical IDs visible on this surface;
 *     the hook batch-fetches them in one round trip and exposes a
 *     synchronous `getState(id)` reader so the render path stays simple.
 *   - `useStudentHandlingAggregate(studentIds)` returns
 *     `Map<studentId, HandlingState>` of the worst non-default state per
 *     student, used by the dashboard "in progress" pill.
 *
 * The `userKey` argument that callers used to pass for localStorage
 * namespacing is now ignored — district scoping is enforced server-side
 * via `getEnforcedDistrictId`. We keep it in the signature for a clean
 * incremental migration.
 */

import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut } from "./api";
import type { HandlingState } from "./action-recommendations";

/** Wire shape of one action_item_handling row, as returned by the API. */
export interface HandlingRow {
  itemId: string;
  state: HandlingState;
  note: string | null;
  recommendedOwnerRole: string | null;
  assignedToRole: string | null;
  assignedToUserId: string | null;
  updatedByUserId: string;
  updatedByName: string | null;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface HandlingEntry {
  state: HandlingState;
  setAt: number;
  note?: string;
}
export type HandlingMap = Record<string, HandlingEntry>;

/**
 * Severity ordering for picking the "worst" handling state when several
 * surfaces have marked the same student. Order is operationally
 * chosen: a row that is `awaiting_confirmation` or `under_review` is
 * still actively in flight, so it outranks `recovery_scheduled` /
 * `handed_off` / `resolved` for the purpose of showing "in progress"
 * on the dashboard. `needs_action` is the implicit lowest.
 *
 * MUST stay in sync with the same map in
 * `artifacts/api-server/src/routes/actionItemHandling.ts`.
 */
export const HANDLING_SEVERITY: Record<HandlingState, number> = {
  needs_action: 0,
  resolved: 1,
  recovery_scheduled: 2,
  handed_off: 3,
  under_review: 4,
  awaiting_confirmation: 5,
};

export interface UseHandlingStateOptions {
  /** Optional handler called after a successful PUT. Useful for surfaces
   *  that want to also clear an inline open menu. */
  onChanged?: (id: string, state: HandlingState) => void;
}

interface PutVars {
  id: string;
  state: HandlingState;
  note?: string;
  recommendedOwnerRole?: string;
}

/**
 * Build a stable react-query key for a given set of itemIds. We sort to
 * make `["a","b"]` and `["b","a"]` share a cache entry.
 */
function batchKey(ids: readonly string[]) {
  return ["action-item-handling", "batch", [...ids].sort().join("|")] as const;
}

async function fetchBatch(ids: string[]): Promise<HandlingRow[]> {
  if (ids.length === 0) return [];
  // Use POST batch when the URL would be excessive, otherwise GET so
  // the response is HTTP-cacheable in dev tools.
  if (ids.length <= 40) {
    const qs = encodeURIComponent(ids.join(","));
    const res = await apiGet<{ data: HandlingRow[] }>(`/action-item-handling?ids=${qs}`);
    return res.data;
  }
  const res = await apiPost<{ data: HandlingRow[] }>("/action-item-handling/batch", { ids });
  return res.data;
}

/**
 * Phase 1E hook — accepts the list of canonical itemIds visible on the
 * current surface (so we can batch-fetch in one request), then exposes
 * the same `getState` / `setState` API older surfaces already use.
 *
 * Backwards-compat shim: if the first argument is a string (the legacy
 * `userKey`), the hook degrades to no-prefetch mode and reads on demand
 * via `getState`. Surfaces should migrate to the array form.
 */
export function useHandlingState(
  itemIdsOrUserKey: string | readonly string[],
  opts?: UseHandlingStateOptions,
) {
  const qc = useQueryClient();

  const ids = useMemo<string[]>(() => {
    if (typeof itemIdsOrUserKey === "string") return [];
    // Filter out empty / falsy ids defensively — surfaces sometimes
    // build the list before all data is loaded.
    return Array.from(new Set(itemIdsOrUserKey.filter(Boolean)));
  }, [itemIdsOrUserKey]);

  const query = useQuery({
    queryKey: batchKey(ids),
    queryFn: () => fetchBatch(ids),
    enabled: ids.length > 0,
    staleTime: 15_000,
  });

  // Convert rows to a map for O(1) lookup. We don't synthesize entries
  // for missing ids — `getState` returns `needs_action` by default.
  const handlingMap = useMemo<Record<string, HandlingRow>>(() => {
    const out: Record<string, HandlingRow> = {};
    for (const r of query.data ?? []) out[r.itemId] = r;
    return out;
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: async (vars: PutVars) => {
      const res = await apiPut<{ data: HandlingRow }>(
        `/action-item-handling/${encodeURIComponent(vars.id)}`,
        {
          state: vars.state,
          note: vars.note ?? null,
          recommendedOwnerRole: vars.recommendedOwnerRole ?? null,
        },
      );
      return res.data;
    },
    onMutate: async (vars) => {
      // Optimistic update — patch only batch queries (HandlingRow[]). The
      // aggregate-by-student cache lives under the same root key but has
      // a different row shape (`{studentId,state}`), so we MUST scope this
      // mutation to `["action-item-handling","batch"]` to avoid corrupting
      // it with synthetic HandlingRow objects (caught in code review).
      await qc.cancelQueries({ queryKey: ["action-item-handling", "batch"] });
      const snapshot = qc.getQueriesData<HandlingRow[]>({ queryKey: ["action-item-handling", "batch"] });
      qc.setQueriesData<HandlingRow[]>({ queryKey: ["action-item-handling", "batch"] }, (old) => {
        if (!old) return old;
        const others = old.filter(r => r.itemId !== vars.id);
        if (vars.state === "needs_action") return others;
        const prev = old.find(r => r.itemId === vars.id);
        const optimistic: HandlingRow = {
          itemId: vars.id,
          state: vars.state,
          note: vars.note ?? prev?.note ?? null,
          recommendedOwnerRole: vars.recommendedOwnerRole ?? prev?.recommendedOwnerRole ?? null,
          assignedToRole: prev?.assignedToRole ?? null,
          assignedToUserId: prev?.assignedToUserId ?? null,
          updatedByUserId: prev?.updatedByUserId ?? "(you)",
          updatedByName: prev?.updatedByName ?? null,
          updatedAt: new Date().toISOString(),
          resolvedAt: vars.state === "resolved" ? new Date().toISOString() : null,
        };
        return [...others, optimistic];
      });
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      // Roll back on failure.
      if (!ctx?.snapshot) return;
      for (const [key, data] of ctx.snapshot) qc.setQueryData(key, data);
    },
    onSettled: (_data, _err, vars) => {
      // Invalidate everything handling-related so the dashboard
      // aggregate also updates.
      qc.invalidateQueries({ queryKey: ["action-item-handling"] });
      if (vars) opts?.onChanged?.(vars.id, vars.state);
    },
  });

  const setState = useCallback((id: string, state: HandlingState, note?: string, recommendedOwnerRole?: string) => {
    mutation.mutate({ id, state, note, recommendedOwnerRole });
  }, [mutation]);

  const clear = useCallback((id: string) => setState(id, "needs_action"), [setState]);

  const getState = useCallback((id: string): HandlingState => {
    return handlingMap[id]?.state ?? "needs_action";
  }, [handlingMap]);

  const getEntry = useCallback((id: string): HandlingRow | undefined => handlingMap[id], [handlingMap]);

  // Synthesise the legacy `handling: HandlingMap` shape for any caller
  // that still wants to enumerate. Cheap; only contains visible ids.
  const handling = useMemo<HandlingMap>(() => {
    const out: HandlingMap = {};
    for (const [id, r] of Object.entries(handlingMap)) {
      out[id] = {
        state: r.state,
        setAt: r.updatedAt ? Date.parse(r.updatedAt) : Date.now(),
        ...(r.note ? { note: r.note } : {}),
      };
    }
    return out;
  }, [handlingMap]);

  return {
    handling,
    getState,
    getEntry,
    setState,
    clear,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
  };
}

// ─── Cross-surface aggregate readers (Phase 1E) ──────────────────────────────

/**
 * Pure helper retained from Phase 1D for tests — given a merged map of
 * id → state, return the worst non-default handling state across the
 * ids that unambiguously belong to a student. Phase 1E surfaces use the
 * canonical id forms `risk:<sid>:`, `student:<sid>:`, `service-gap:<sid>:`,
 * `deadline:<sid>:` — and we still recognise the legacy `risk-row:<sid>:`
 * form so old localStorage data isn't silently lost during the rollout.
 */
export function pickHandlingForStudent(
  merged: Record<string, { state: HandlingState }>,
  studentId: number,
): HandlingState {
  const prefixes = [
    `risk:${studentId}:`,
    `student:${studentId}:`,
    `service-gap:${studentId}:`,
    `deadline:${studentId}:`,
    `risk-row:${studentId}:`,
  ];
  let worst: HandlingState = "needs_action";
  for (const [id, entry] of Object.entries(merged)) {
    if (prefixes.some(p => id.startsWith(p))) {
      if (HANDLING_SEVERITY[entry.state] > HANDLING_SEVERITY[worst]) worst = entry.state;
    }
  }
  return worst;
}

interface AggregateRow { studentId: number; state: HandlingState }

/**
 * React hook — fetches the dashboard "Where are we at risk?" aggregate
 * from the API in a single round trip. Returns a `Map<studentId, HandlingState>`
 * containing only entries whose state is non-default. Excludes
 * `resolved` server-side.
 */
export function useStudentHandlingAggregate(studentIds: number[]): Map<number, HandlingState> {
  const sortedIds = useMemo(() => Array.from(new Set(studentIds.filter(n => Number.isFinite(n)))).sort((a, b) => a - b), [studentIds]);

  const query = useQuery({
    queryKey: ["action-item-handling", "aggregate-by-student", sortedIds.join(",")],
    queryFn: async () => {
      if (sortedIds.length === 0) return [] as AggregateRow[];
      const res = await apiPost<{ data: AggregateRow[] }>("/action-item-handling/aggregate-by-student", { studentIds: sortedIds });
      return res.data;
    },
    enabled: sortedIds.length > 0,
    staleTime: 15_000,
  });

  return useMemo(() => {
    const out = new Map<number, HandlingState>();
    for (const r of query.data ?? []) {
      if (r.state !== "needs_action" && r.state !== "resolved") out.set(r.studentId, r.state);
    }
    return out;
  }, [query.data]);
}

/** Alias kept for back-compat with the Phase 1D import name. */
export const useAggregateHandlingForStudents = useStudentHandlingAggregate;
