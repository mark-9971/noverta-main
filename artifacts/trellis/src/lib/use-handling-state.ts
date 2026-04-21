/**
 * Pilot Wedge Phase 1B — handling state for Action Center items.
 *
 * Persistence layer (currently localStorage) for the operationally
 * important "is anyone already handling this?" state. Mirrors the
 * existing `useHiddenItems` pattern so the two state machines compose
 * cleanly.
 *
 * Honesty notes:
 *   - This is per-user, per-browser localStorage. It is NOT a shared
 *     server-side assignment record. Two admins on two browsers will
 *     see different handling-state for the same item until that gets
 *     promoted to the database in a later phase.
 *   - The state is keyed by WorkItem `id` (already stable per source —
 *     `alert-N`, `risk-N`, `deadline-N`, `schedule-gap-N-M`).
 *   - Setting state to `needs_action` clears the entry (default).
 */

import { useCallback, useEffect, useState } from "react";
import type { HandlingState } from "./action-recommendations";

const HANDLING_KEY_PREFIX = "trellis:action-center:handling:";

export interface HandlingEntry {
  state: HandlingState;
  setAt: number;
  /** Optional free-text note (e.g. "asked Maria to confirm by Friday"). */
  note?: string;
}

export type HandlingMap = Record<string, HandlingEntry>;

function lsKeyForUser(userKey: string): string {
  return `${HANDLING_KEY_PREFIX}${userKey}`;
}

function readHandling(userKey: string): HandlingMap {
  try {
    const raw = localStorage.getItem(lsKeyForUser(userKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as HandlingMap;
  } catch {
    return {};
  }
}

function writeHandling(userKey: string, map: HandlingMap) {
  try {
    localStorage.setItem(lsKeyForUser(userKey), JSON.stringify(map));
  } catch {}
}

export function useHandlingState(userKey: string) {
  const [handling, setHandling] = useState<HandlingMap>(() => readHandling(userKey));

  useEffect(() => { setHandling(readHandling(userKey)); }, [userKey]);

  const setState = useCallback((id: string, state: HandlingState, note?: string) => {
    setHandling(prev => {
      // Setting back to the default needs_action clears the entry —
      // no state stored is the same as "needs action."
      if (state === "needs_action") {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        writeHandling(userKey, next);
        return next;
      }
      const next: HandlingMap = {
        ...prev,
        [id]: { state, setAt: Date.now(), ...(note ? { note } : {}) },
      };
      writeHandling(userKey, next);
      return next;
    });
  }, [userKey]);

  const clear = useCallback((id: string) => setState(id, "needs_action"), [setState]);

  const getState = useCallback((id: string): HandlingState => {
    return handling[id]?.state ?? "needs_action";
  }, [handling]);

  return { handling, setState, clear, getState };
}

// ─── Cross-surface aggregate readers (Phase 1D) ──────────────────────────────

/**
 * Severity ordering for picking the "worst" handling state when several
 * surfaces have marked the same student. Order is operationally
 * chosen: a row that is `awaiting_confirmation` or `under_review` is
 * still actively in flight, so it outranks `recovery_scheduled` /
 * `handed_off` / `resolved` for the purpose of showing "in progress"
 * on the dashboard. `needs_action` is the implicit lowest.
 */
const HANDLING_SEVERITY: Record<HandlingState, number> = {
  needs_action: 0,
  resolved: 1,
  recovery_scheduled: 2,
  handed_off: 3,
  under_review: 4,
  awaiting_confirmation: 5,
};

function pickWorstHandling(states: HandlingState[]): HandlingState {
  let worst: HandlingState = "needs_action";
  for (const s of states) {
    if (HANDLING_SEVERITY[s] > HANDLING_SEVERITY[worst]) worst = s;
  }
  return worst;
}

function readAllHandlingNamespaces(): HandlingMap {
  if (typeof localStorage === "undefined") return {};
  const merged: HandlingMap = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(HANDLING_KEY_PREFIX)) continue;
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          for (const [id, entry] of Object.entries(parsed as HandlingMap)) {
            // First-write wins → keep the most-recently-set entry per id.
            const cur = merged[id];
            if (!cur || (entry.setAt ?? 0) > (cur.setAt ?? 0)) {
              merged[id] = entry;
            }
          }
        }
      } catch {}
    }
  } catch {}
  return merged;
}

/**
 * Pure helper (testable) — given a merged handling map and a student
 * id, return the worst non-default handling state across the ids that
 * unambiguously belong to that student (`risk-row:<sid>:*`,
 * `student:<sid>:*`). Returns `needs_action` when nothing is in
 * progress.
 *
 * Note: Action Center alert ids (`alert-N`, `risk-N`) are NOT scanned
 * because they don't carry the studentId in a stable form here. Surfaces
 * that want their state to flow into this aggregate should adopt the
 * `risk-row:<sid>:<reqId>` or `student:<sid>:*` id patterns.
 */
export function pickHandlingForStudent(
  merged: HandlingMap,
  studentId: number,
): HandlingState {
  const prefixes = [`risk-row:${studentId}:`, `student:${studentId}:`];
  const matches: HandlingState[] = [];
  for (const [id, entry] of Object.entries(merged)) {
    if (prefixes.some(p => id.startsWith(p))) {
      matches.push(entry.state);
    }
  }
  return pickWorstHandling(matches);
}

/**
 * React hook — re-reads aggregate handling state for a list of
 * student ids on every render and reacts to localStorage `storage`
 * events from other tabs. Returns a `Map<studentId, HandlingState>`
 * containing only entries whose state is non-default, so callers can
 * cheaply check `aggregate.has(id)`.
 */
export function useAggregateHandlingForStudents(studentIds: number[]): Map<number, HandlingState> {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key && e.key.startsWith(HANDLING_KEY_PREFIX)) setTick(t => t + 1);
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Recompute on every render — cheap; localStorage scan is small in
  // pilot scale and avoids missing same-tab updates.
  void tick;
  const merged = readAllHandlingNamespaces();
  const out = new Map<number, HandlingState>();
  for (const sid of studentIds) {
    const state = pickHandlingForStudent(merged, sid);
    // Exclude `needs_action` (default) AND `resolved` — the dashboard
    // "Where are we at risk?" list is about *in-progress* work, so a
    // resolved row should not pollute it with a stale pill.
    if (state !== "needs_action" && state !== "resolved") out.set(sid, state);
  }
  return out;
}
