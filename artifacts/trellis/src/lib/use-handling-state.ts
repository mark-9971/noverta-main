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

export interface HandlingEntry {
  state: HandlingState;
  setAt: number;
  /** Optional free-text note (e.g. "asked Maria to confirm by Friday"). */
  note?: string;
}

export type HandlingMap = Record<string, HandlingEntry>;

function lsKeyForUser(userKey: string): string {
  return `trellis:action-center:handling:${userKey}`;
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
