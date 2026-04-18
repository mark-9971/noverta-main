import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRole } from "@/lib/role-context";
import type { CollectedGoalEntry } from "@/components/live-data-panel/types";

export interface TimerEntry {
  id: string;
  studentId: number;
  studentName: string;
  serviceTypeId: number | null;
  serviceTypeName: string;
  startedAt: number;
  stoppedAt: number | null;
  collectedData?: Record<string, CollectedGoalEntry>;
}

export interface TimerWarningThresholds {
  warnThresholdMs: number;
  criticalThresholdMs: number;
}

export const DEFAULT_WARN_THRESHOLD_MS = 2 * 60 * 60 * 1000;
export const DEFAULT_CRITICAL_THRESHOLD_MS = 4 * 60 * 60 * 1000;

interface SessionTimerContextValue {
  timers: TimerEntry[];
  completedTimers: TimerEntry[];
  warnThresholdMs: number;
  criticalThresholdMs: number;
  setWarningThresholds: (thresholds: TimerWarningThresholds) => void;
  startTimer: (entry: Omit<TimerEntry, "id" | "startedAt" | "stoppedAt">) => string;
  stopTimer: (id: string) => TimerEntry | null;
  removeTimer: (id: string) => void;
  clearCompleted: () => void;
  dismissCompleted: (id: string) => void;
  updateTimerData: (id: string, data: Record<string, CollectedGoalEntry>) => void;
}

const SessionTimerContext = createContext<SessionTimerContextValue | null>(null);

const MAX_COMPLETED = 10;

function storageKey(userId: string) {
  return `trellis_session_timers_v3_${userId}`;
}

function completedKey(userId: string) {
  return `trellis_session_timers_completed_v3_${userId}`;
}

function thresholdsKey(userId: string) {
  return `trellis_session_timer_thresholds_v1_${userId}`;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return fallback;
}

function saveToStorage(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

export function SessionTimerProvider({ children }: { children: ReactNode }) {
  const { teacherId } = useRole();
  const userId = String(teacherId || "anon");

  const [timers, setTimers] = useState<TimerEntry[]>(() =>
    loadFromStorage(storageKey(userId), [])
  );
  const [completedTimers, setCompletedTimers] = useState<TimerEntry[]>(() =>
    loadFromStorage(completedKey(userId), [])
  );
  const [thresholds, setThresholds] = useState<TimerWarningThresholds>(() =>
    loadFromStorage(thresholdsKey(userId), {
      warnThresholdMs: DEFAULT_WARN_THRESHOLD_MS,
      criticalThresholdMs: DEFAULT_CRITICAL_THRESHOLD_MS,
    })
  );

  const timersRef = useRef(timers);
  timersRef.current = timers;
  const userIdRef = useRef(userId);

  useEffect(() => {
    if (userIdRef.current !== userId) {
      setTimers(loadFromStorage(storageKey(userId), []));
      setCompletedTimers(loadFromStorage(completedKey(userId), []));
      setThresholds(loadFromStorage(thresholdsKey(userId), {
        warnThresholdMs: DEFAULT_WARN_THRESHOLD_MS,
        criticalThresholdMs: DEFAULT_CRITICAL_THRESHOLD_MS,
      }));
      userIdRef.current = userId;
    }
  }, [userId]);

  useEffect(() => { saveToStorage(storageKey(userId), timers); }, [timers, userId]);
  useEffect(() => { saveToStorage(completedKey(userId), completedTimers.slice(0, MAX_COMPLETED)); }, [completedTimers, userId]);
  useEffect(() => { saveToStorage(thresholdsKey(userId), thresholds); }, [thresholds, userId]);

  const startTimer = useCallback((entry: Omit<TimerEntry, "id" | "startedAt" | "stoppedAt">) => {
    const id = `timer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timer: TimerEntry = { ...entry, id, startedAt: Date.now(), stoppedAt: null };
    setTimers(prev => [...prev, timer]);
    return id;
  }, []);

  const stopTimer = useCallback((id: string) => {
    const timer = timersRef.current.find(t => t.id === id);
    if (!timer) return null;
    const stopped = { ...timer, stoppedAt: Date.now() };
    setTimers(prev => prev.filter(t => t.id !== id));
    setCompletedTimers(prev => [stopped, ...prev].slice(0, MAX_COMPLETED));
    return stopped;
  }, []);

  const removeTimer = useCallback((id: string) => {
    setTimers(prev => prev.filter(t => t.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setCompletedTimers([]);
  }, []);

  const dismissCompleted = useCallback((id: string) => {
    setCompletedTimers(prev => prev.filter(t => t.id !== id));
  }, []);

  const updateTimerData = useCallback((id: string, data: Record<string, CollectedGoalEntry>) => {
    setTimers(prev => prev.map(t => t.id === id ? { ...t, collectedData: data } : t));
  }, []);

  const setWarningThresholds = useCallback((t: TimerWarningThresholds) => {
    setThresholds(t);
  }, []);

  return (
    <SessionTimerContext.Provider value={{
      timers,
      completedTimers,
      warnThresholdMs: thresholds.warnThresholdMs,
      criticalThresholdMs: thresholds.criticalThresholdMs,
      setWarningThresholds,
      startTimer,
      stopTimer,
      removeTimer,
      clearCompleted,
      dismissCompleted,
      updateTimerData,
    }}>
      {children}
    </SessionTimerContext.Provider>
  );
}

export function useSessionTimers() {
  const ctx = useContext(SessionTimerContext);
  if (!ctx) throw new Error("useSessionTimers must be used within SessionTimerProvider");
  return ctx;
}
