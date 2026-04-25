/**
 * useOfflineQueue — localStorage-backed queue for failed ABA data-session saves.
 *
 * Safety design:
 *  - Enqueue BEFORE the network call succeeds. If the call succeeds we dequeue.
 *    If it fails (or the tab closes mid-request) the local copy survives.
 *  - The API is NOT idempotent. If a network request succeeds but the client
 *    never receives the 201, retrying will create a DUPLICATE session. We surface
 *    this risk explicitly in the UI and require the user to confirm before retry.
 *  - Max QUEUE_LIMIT entries. Oldest entries are dropped when the limit is hit to
 *    prevent unbounded localStorage growth (each session payload is typically <5 KB).
 *  - This is NOT a service worker or background sync. Retries only run when the
 *    user explicitly triggers them inside the app.
 */

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "noverta_aba_pending_sessions_v1";
const LEGACY_STORAGE_KEY = "trellis_aba_pending_sessions_v1";
const QUEUE_LIMIT = 20;

export interface PendingSession {
  id: string;
  studentId: number;
  studentName: string;
  savedAt: string;
  attempts: number;
  lastError: string | null;
  payload: {
    sessionDate: string;
    startTime: string;
    endTime: string;
    behaviorData: unknown[];
    programData: unknown[];
    sessionType: string;
    notes?: string | null;
  };
}

function readQueue(): PendingSession[] {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    // Read-fallback for the legacy `trellis_*` key. Copy-forward to the
    // new key and clear the legacy key only if the copy succeeds. Never
    // discard pending session payloads.
    if (!raw) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        try {
          localStorage.setItem(STORAGE_KEY, legacy);
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        } catch {
          // copy failed — leave the legacy queue intact
        }
        raw = legacy;
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as PendingSession[];
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    /* localStorage full — can't help it, session data stays in component state */
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useOfflineQueue() {
  const [queue, setQueue] = useState<PendingSession[]>(() => readQueue());

  /* Sync state when another tab modifies localStorage */
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY || e.key === LEGACY_STORAGE_KEY) setQueue(readQueue());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const enqueue = useCallback((
    session: Omit<PendingSession, "id" | "savedAt" | "attempts" | "lastError">,
  ): string => {
    const id = generateId();
    const entry: PendingSession = {
      ...session,
      id,
      savedAt: new Date().toISOString(),
      attempts: 0,
      lastError: null,
    };
    setQueue(prev => {
      const next = [...prev, entry];
      /* Enforce limit: drop oldest entries if we exceed QUEUE_LIMIT */
      const trimmed = next.length > QUEUE_LIMIT ? next.slice(next.length - QUEUE_LIMIT) : next;
      writeQueue(trimmed);
      return trimmed;
    });
    return id;
  }, []);

  const dequeue = useCallback((id: string): void => {
    setQueue(prev => {
      const next = prev.filter(s => s.id !== id);
      writeQueue(next);
      return next;
    });
  }, []);

  const markAttempt = useCallback((id: string, error: string | null): void => {
    setQueue(prev => {
      const next = prev.map(s =>
        s.id === id
          ? { ...s, attempts: s.attempts + 1, lastError: error }
          : s,
      );
      writeQueue(next);
      return next;
    });
  }, []);

  const clearAll = useCallback((): void => {
    writeQueue([]);
    setQueue([]);
  }, []);

  return {
    queue,
    pendingCount: queue.length,
    enqueue,
    dequeue,
    markAttempt,
    clearAll,
  };
}
