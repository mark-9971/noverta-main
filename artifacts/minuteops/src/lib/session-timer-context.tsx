import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRole } from "@/lib/role-context";

export interface TimerEntry {
  id: string;
  studentId: number;
  studentName: string;
  serviceTypeId: number | null;
  serviceTypeName: string;
  startedAt: number;
  stoppedAt: number | null;
}

interface SessionTimerContextValue {
  timers: TimerEntry[];
  completedTimers: TimerEntry[];
  startTimer: (entry: Omit<TimerEntry, "id" | "startedAt" | "stoppedAt">) => string;
  stopTimer: (id: string) => TimerEntry | null;
  removeTimer: (id: string) => void;
  clearCompleted: () => void;
  dismissCompleted: (id: string) => void;
}

const SessionTimerContext = createContext<SessionTimerContextValue | null>(null);

const MAX_COMPLETED = 10;

function storageKey(userId: string) {
  return `trellis_session_timers_v2_${userId}`;
}

function completedKey(userId: string) {
  return `trellis_session_timers_completed_v2_${userId}`;
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
  const timersRef = useRef(timers);
  timersRef.current = timers;
  const userIdRef = useRef(userId);

  useEffect(() => {
    if (userIdRef.current !== userId) {
      setTimers(loadFromStorage(storageKey(userId), []));
      setCompletedTimers(loadFromStorage(completedKey(userId), []));
      userIdRef.current = userId;
    }
  }, [userId]);

  useEffect(() => { saveToStorage(storageKey(userId), timers); }, [timers, userId]);
  useEffect(() => { saveToStorage(completedKey(userId), completedTimers.slice(0, MAX_COMPLETED)); }, [completedTimers, userId]);

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

  return (
    <SessionTimerContext.Provider value={{ timers, completedTimers, startTimer, stopTimer, removeTimer, clearCompleted, dismissCompleted }}>
      {children}
    </SessionTimerContext.Provider>
  );
}

export function useSessionTimers() {
  const ctx = useContext(SessionTimerContext);
  if (!ctx) throw new Error("useSessionTimers must be used within SessionTimerProvider");
  return ctx;
}
