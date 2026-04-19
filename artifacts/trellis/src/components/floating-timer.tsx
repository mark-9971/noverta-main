import { useState, useEffect, useCallback, useRef } from "react";
import { Play, Square, X, Clock, ChevronUp, ChevronDown, Trash2, Plus, Target, ExternalLink, AlertTriangle } from "lucide-react";
import { useSessionTimers, type TimerEntry, DEFAULT_WARN_THRESHOLD_MS, DEFAULT_CRITICAL_THRESHOLD_MS } from "@/lib/session-timer-context";
import { useRole } from "@/lib/role-context";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { QuickLogSheet } from "@/components/quick-log-sheet";
import { LiveDataPanel } from "@/components/live-data-panel";
import type { CollectedGoalEntry } from "@/components/live-data-panel/types";
import { usePopupWindow } from "@/components/live-data-panel/useDataPanelPopup";

interface Student { id: number; firstName: string; lastName: string; }
interface ServiceType { id: number; name: string; }
interface ServiceRequirement { id: number; serviceTypeId: number; serviceTypeName: string | null; active: boolean; }
interface MinuteProgressEntry { serviceTypeId: number; remainingMinutes: number; intervalType: string; }
interface RemainingByType { remainingMinutes: number; intervalType: string | null; }

function intervalLabel(intervalType: string | null): string {
  switch (intervalType) {
    case "weekly": return "this week";
    case "monthly": return "this month";
    case "quarterly": return "this quarter";
    case "daily": return "today";
    default: return "remaining";
  }
}

const BROADCAST_CHANNEL_NAME = "trellis-data-panel";

function detectIsMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform || navigator.platform || "";
  return /mac/i.test(platform);
}

const IS_MAC = detectIsMac();
const SHORTCUT_LABEL = IS_MAC ? "\u2318\u21E7T" : "Ctrl+Shift+T";
const SHORTCUT_BADGE = IS_MAC ? "\u2318\u21E7T" : "\u2303\u21E7T";

type WarningLevel = "none" | "warn" | "critical";

function getWarningLevel(
  startedAt: number,
  now: number,
  warnThresholdMs: number,
  criticalThresholdMs: number,
): WarningLevel {
  const elapsed = now - startedAt;
  if (elapsed >= criticalThresholdMs) return "critical";
  if (elapsed >= warnThresholdMs) return "warn";
  return "none";
}

function playAlertBeep() {
  try {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.6);
  } catch {
    // AudioContext not available
  }
}

function useTimerWarning(
  startedAt: number,
  warnThresholdMs: number = DEFAULT_WARN_THRESHOLD_MS,
  criticalThresholdMs: number = DEFAULT_CRITICAL_THRESHOLD_MS,
): WarningLevel {
  const [level, setLevel] = useState<WarningLevel>(() =>
    getWarningLevel(startedAt, Date.now(), warnThresholdMs, criticalThresholdMs)
  );
  const playedCriticalRef = useRef(false);

  useEffect(() => {
    playedCriticalRef.current = false;
    const tick = () => {
      const newLevel = getWarningLevel(startedAt, Date.now(), warnThresholdMs, criticalThresholdMs);
      setLevel(newLevel);
      if (newLevel === "critical" && !playedCriticalRef.current) {
        playedCriticalRef.current = true;
        playAlertBeep();
      }
    };
    tick();
    const iv = setInterval(tick, 60_000);
    return () => clearInterval(iv);
  }, [startedAt, warnThresholdMs, criticalThresholdMs]);

  return level;
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatMinutes(ms: number): number {
  return Math.max(1, Math.round(ms / 60000));
}

function TimerTick({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const elapsed = now - startedAt;
  return <span className="font-mono text-lg font-bold tabular-nums">{formatElapsed(elapsed)}</span>;
}

function entriesToObj(entries: Map<number, CollectedGoalEntry>): Record<string, CollectedGoalEntry> {
  const obj: Record<string, CollectedGoalEntry> = {};
  entries.forEach((v, k) => { obj[String(k)] = v; });
  return obj;
}

function objToEntries(obj: Record<string, CollectedGoalEntry>): Map<number, CollectedGoalEntry> {
  const map = new Map<number, CollectedGoalEntry>();
  Object.entries(obj).forEach(([k, v]) => map.set(Number(k), v));
  return map;
}

function ActiveTimerCard({
  timer,
  goalCount,
  isOnlyTimer,
  warnThresholdMs,
  criticalThresholdMs,
  onOpenData,
  onStop,
  onDiscard,
}: {
  timer: TimerEntry;
  goalCount: number;
  isOnlyTimer: boolean;
  warnThresholdMs: number;
  criticalThresholdMs: number;
  onOpenData: () => void;
  onStop: () => void;
  onDiscard: () => void;
}) {
  const warning = useTimerWarning(timer.startedAt, warnThresholdMs, criticalThresholdMs);

  const borderClass =
    warning === "critical"
      ? "border-red-300"
      : warning === "warn"
      ? "border-amber-300"
      : "border-emerald-200";

  const dotClass =
    warning === "critical"
      ? "bg-red-500"
      : warning === "warn"
      ? "bg-amber-500"
      : "bg-emerald-500";

  return (
    <div className={`bg-white rounded-xl shadow-lg border overflow-hidden ${borderClass}`}>
      <div className="px-3 py-2.5 flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full animate-pulse flex-shrink-0 ${dotClass}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800 truncate">{timer.studentName}</p>
          <p className="text-[11px] text-gray-400">{timer.serviceTypeName}</p>
        </div>
        <TimerTick startedAt={timer.startedAt} />
        {warning !== "none" && (
          <span
            title={warning === "critical" ? "Timer running over 4 hours" : "Timer running over 2 hours"}
            className={`ml-1 flex-shrink-0 ${warning === "critical" ? "text-red-500" : "text-amber-500"}`}
          >
            <AlertTriangle className="w-4 h-4" />
          </span>
        )}
      </div>
      {warning !== "none" && (
        <div
          className={`px-3 py-1.5 text-[11px] font-medium flex items-center gap-1.5 ${
            warning === "critical"
              ? "bg-red-50 text-red-700 border-t border-red-100"
              : "bg-amber-50 text-amber-700 border-t border-amber-100"
          }`}
        >
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          {warning === "critical"
            ? "Timer has been running over 4 hours — did you forget to stop it?"
            : "Timer has been running over 2 hours — please verify it's still active."}
        </div>
      )}
      <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex gap-2">
        <button
          onClick={onOpenData}
          className={`flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all active:scale-[0.97] ${
            goalCount > 0
              ? "bg-emerald-100 text-emerald-700 border border-emerald-200 hover:bg-emerald-200"
              : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
          }`}
        >
          <Target className="w-3 h-3" />
          {goalCount > 0 ? `${goalCount} Goal${goalCount !== 1 ? "s" : ""}` : "Collect"}
        </button>
        <button
          onClick={onStop}
          className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 active:scale-[0.97] transition-all"
          title={isOnlyTimer ? `Stop & Log (${SHORTCUT_LABEL})` : undefined}
        >
          <Square className="w-3 h-3" /> Stop & Log
          {isOnlyTimer && (
            <span className="ml-1 text-[9px] opacity-60 font-normal hidden sm:inline">{SHORTCUT_BADGE}</span>
          )}
        </button>
        <button
          onClick={onDiscard}
          className="h-8 px-3 rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 text-xs transition-colors"
          title="Discard timer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

function DataCollectionOverlay({
  timer,
  entries,
  onClose,
  onPopOut,
  onEntriesChange,
}: {
  timer: TimerEntry;
  entries: Map<number, CollectedGoalEntry>;
  onClose: () => void;
  onPopOut: () => void;
  onEntriesChange: (entries: Map<number, CollectedGoalEntry>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="absolute top-3 right-12 z-10">
          <button
            onClick={onPopOut}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title="Open in separate window"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
        <LiveDataPanel
          studentId={timer.studentId}
          studentName={timer.studentName}
          timerStartedAt={timer.startedAt}
          onClose={onClose}
          collectedEntries={entries}
          onEntriesChange={onEntriesChange}
        />
      </div>
    </div>
  );
}

export function FloatingTimer() {
  const { timers, completedTimers, warnThresholdMs, criticalThresholdMs, startTimer, stopTimer, removeTimer, dismissCompleted, updateTimerData } = useSessionTimers();
  const { teacherId, role } = useRole();

  const [expanded, setExpanded] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [dataTimerId, setDataTimerId] = useState<string | null>(null);

  const [students, setStudents] = useState<Student[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [startStep, setStartStep] = useState<"student" | "service">("student");
  const [studentRequirements, setStudentRequirements] = useState<ServiceRequirement[]>([]);
  const [suggestedServiceTypeId, setSuggestedServiceTypeId] = useState<number | null>(null);
  const [remainingByType, setRemainingByType] = useState<Map<number, RemainingByType>>(new Map());

  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [loggingTimerId, setLoggingTimerId] = useState<string | null>(null);
  const [quickLogPrefill, setQuickLogPrefill] = useState<{
    studentId?: number;
    studentName?: string;
    serviceTypeId?: number;
    serviceTypeName?: string;
    durationMinutes?: number;
    startTime?: string;
    endTime?: string;
    sessionDate?: string;
  }>({});
  const [quickLogGoalData, setQuickLogGoalData] = useState<CollectedGoalEntry[]>([]);

  const { openPopup, closePopup, isPopupOpen } = usePopupWindow();
  const searchRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const selectedStudentIdRef = useRef<number | null>(null);

  const activeTimersRef = useRef(timers);
  activeTimersRef.current = timers;
  const showStartRef = useRef(showStart);
  showStartRef.current = showStart;
  const handleStopRef = useRef<(timer: TimerEntry) => void>(() => {});
  const openStartFlowRef = useRef<() => void>(() => {});

  const [liveEntries, setLiveEntries] = useState<Map<number, CollectedGoalEntry>>(() => new Map());
  const liveEntriesTimerIdRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const ch = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channelRef.current = ch;
      ch.onmessage = (e: MessageEvent) => {
        const msg = e.data;
        if (msg.type === "data-update" && msg.entries) {
          const map = objToEntries(msg.entries);
          setLiveEntries(map);
          updateTimerData(msg.timerId, msg.entries);
        }
        if (msg.type === "popup-ready" && msg.timerId) {
          const timer = timers.find(t => t.id === msg.timerId);
          if (timer?.collectedData) {
            ch.postMessage({ type: "data-update", timerId: msg.timerId, entries: timer.collectedData });
          }
        }
      };
      return () => { ch.close(); channelRef.current = null; };
    } catch {
      return;
    }
  }, [updateTimerData]);

  const getEntriesForTimer = useCallback((timer: TimerEntry): Map<number, CollectedGoalEntry> => {
    if (dataTimerId === timer.id && liveEntries.size > 0) {
      return liveEntries;
    }
    if (timer.collectedData) {
      return objToEntries(timer.collectedData);
    }
    return new Map();
  }, [dataTimerId, liveEntries]);

  const handleLocalEntriesChange = useCallback((timerId: string, newEntries: Map<number, CollectedGoalEntry>) => {
    setLiveEntries(newEntries);
    const obj = entriesToObj(newEntries);
    updateTimerData(timerId, obj);
    if (channelRef.current) {
      channelRef.current.postMessage({ type: "data-update", timerId, entries: obj });
    }
  }, [updateTimerData]);

  const staffRoles = ["admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider", "para"];
  if (!staffRoles.includes(role)) return null;

  const activeCount = timers.length;
  const hasActivity = activeCount > 0 || completedTimers.length > 0;

  const loadData = useCallback(async () => {
    try {
      const [sRes, stRes] = await Promise.all([
        authFetch("/api/students?limit=500"),
        authFetch("/api/service-types"),
      ]);
      const sData = await sRes.json();
      const stData = await stRes.json();
      const studentArr = Array.isArray(sData) ? sData : (sData && typeof sData === "object" && "data" in (sData as Record<string, unknown>) ? (sData as Record<string, unknown>).data : []);
      setStudents(Array.isArray(studentArr) ? studentArr as Student[] : []);
      setServiceTypes(Array.isArray(stData) ? stData as ServiceType[] : []);
    } catch {
      toast.error("Failed to load students or services");
    }
  }, []);

  const openStartFlow = useCallback(() => {
    setShowStart(true);
    setStartStep("student");
    setSelectedStudent(null);
    setStudentSearch("");
    setStudentRequirements([]);
    setSuggestedServiceTypeId(null);
    selectedStudentIdRef.current = null;
    loadData();
    setTimeout(() => searchRef.current?.focus(), 100);
  }, [loadData]);
  openStartFlowRef.current = openStartFlow;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const modifier = IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
      if (modifier && e.shiftKey && e.key.toLowerCase() === "t") {
        e.preventDefault();
        const activeTimers = activeTimersRef.current;
        if (activeTimers.length === 1) {
          const t = activeTimers[0];
          toast.success(`Timer stopped for ${t.studentName}`, { duration: 2000 });
          handleStopRef.current(t);
        } else if (activeTimers.length === 0 && !showStartRef.current) {
          openStartFlowRef.current();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelectStudent = async (s: Student) => {
    setSelectedStudent(s);
    setStudentRequirements([]);
    setSuggestedServiceTypeId(null);
    setRemainingByType(new Map());
    setStartStep("service");
    selectedStudentIdRef.current = s.id;
    try {
      const [reqRes, progRes] = await Promise.all([
        authFetch(`/api/service-requirements?studentId=${s.id}&active=true`),
        authFetch(`/api/minute-progress?studentId=${s.id}`),
      ]);
      if (!reqRes.ok) return;
      const reqs: ServiceRequirement[] = await reqRes.json();
      // Guard against race: discard result if the user already switched to a different student
      if (selectedStudentIdRef.current !== s.id) return;
      // Sort by priority descending (higher priority = more important), then by id for stability
      const sorted = [...reqs].sort((a, b) => {
        const pa = (a as any).priority ?? 0;
        const pb = (b as any).priority ?? 0;
        return pb - pa || a.id - b.id;
      });
      setStudentRequirements(sorted);
      if (sorted.length > 0 && sorted[0].serviceTypeId) {
        setSuggestedServiceTypeId(sorted[0].serviceTypeId);
      }
      if (progRes.ok) {
        const progress: MinuteProgressEntry[] = await progRes.json();
        if (selectedStudentIdRef.current !== s.id) return;
        const map = new Map<number, RemainingByType>();
        for (const p of progress) {
          const existing = map.get(p.serviceTypeId);
          if (existing) {
            existing.remainingMinutes += p.remainingMinutes;
            if (existing.intervalType !== p.intervalType) existing.intervalType = null;
          } else {
            map.set(p.serviceTypeId, { remainingMinutes: p.remainingMinutes, intervalType: p.intervalType });
          }
        }
        setRemainingByType(map);
      }
    } catch {
      // non-fatal — proceed without suggestions
    }
  };

  const handleSelectService = (svc: ServiceType | null) => {
    if (!selectedStudent) return;
    startTimer({
      studentId: selectedStudent.id,
      studentName: `${selectedStudent.firstName} ${selectedStudent.lastName}`,
      serviceTypeId: svc?.id ?? null,
      serviceTypeName: svc?.name ?? "General",
    });
    setShowStart(false);
    setExpanded(true);
    toast.success(`Timer started for ${selectedStudent.firstName} ${selectedStudent.lastName}`);
  };

  function buildPrefill(entry: TimerEntry & { stoppedAt: number }) {
    const durationMs = entry.stoppedAt - entry.startedAt;
    const durationMinutes = formatMinutes(durationMs);
    const startDate = new Date(entry.startedAt);
    const endDate = new Date(entry.stoppedAt);
    return {
      studentId: entry.studentId,
      studentName: entry.studentName,
      serviceTypeId: entry.serviceTypeId ?? undefined,
      serviceTypeName: entry.serviceTypeName,
      durationMinutes,
      startTime: startDate.toTimeString().slice(0, 5),
      endTime: endDate.toTimeString().slice(0, 5),
      sessionDate: `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`,
    };
  }

  function extractGoalData(entry: TimerEntry): CollectedGoalEntry[] {
    if (!entry.collectedData) return [];
    return Object.values(entry.collectedData);
  }

  const handleStop = (timer: TimerEntry) => {
    const goalData = extractGoalData(timer);
    const stopped = stopTimer(timer.id);
    if (!stopped || !stopped.stoppedAt) return;
    if (isPopupOpen) closePopup();
    setDataTimerId(null);
    setLoggingTimerId(stopped.id);
    setQuickLogPrefill(buildPrefill(stopped as TimerEntry & { stoppedAt: number }));
    setQuickLogGoalData(goalData);
    setQuickLogOpen(true);
  };
  handleStopRef.current = handleStop;

  const handleLogCompleted = (timer: TimerEntry) => {
    if (!timer.stoppedAt) return;
    setLoggingTimerId(timer.id);
    setQuickLogPrefill(buildPrefill(timer as TimerEntry & { stoppedAt: number }));
    setQuickLogGoalData(extractGoalData(timer));
    setQuickLogOpen(true);
  };

  const handleLogSuccess = () => {
    if (loggingTimerId) {
      dismissCompleted(loggingTimerId);
    }
    setLoggingTimerId(null);
    setQuickLogOpen(false);
    setQuickLogGoalData([]);
  };

  const handleLogClose = () => {
    setLoggingTimerId(null);
    setQuickLogOpen(false);
    setQuickLogGoalData([]);
  };

  const handleDiscard = (id: string) => {
    removeTimer(id);
    if (dataTimerId === id) { setDataTimerId(null); closePopup(); }
    toast("Timer discarded");
  };

  const handleOpenData = (timer: TimerEntry) => {
    setDataTimerId(timer.id);
    liveEntriesTimerIdRef.current = timer.id;
    if (timer.collectedData) {
      setLiveEntries(objToEntries(timer.collectedData));
    } else {
      setLiveEntries(new Map());
    }
  };

  const handlePopOut = (timer: TimerEntry) => {
    const opened = openPopup(timer.id, timer.studentId, timer.studentName, timer.startedAt);
    if (opened) {
      setDataTimerId(null);
      liveEntriesTimerIdRef.current = timer.id;
      toast.success("Data panel opened in new window");
    } else {
      toast.error("Popup blocked — using overlay instead");
    }
  };

  const filteredStudents = studentSearch.trim()
    ? students.filter(s =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(studentSearch.toLowerCase())
      )
    : students;

  const dataTimer = dataTimerId ? timers.find(t => t.id === dataTimerId) : null;

  if (!hasActivity && !showStart) {
    return (
      <button
        onClick={openStartFlow}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 w-14 h-14 rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center group"
        aria-label={`Start session timer (${SHORTCUT_LABEL})`}
        title={`Start session timer (${SHORTCUT_LABEL})`}
      >
        <Play className="w-6 h-6 ml-0.5" />
        <span className="absolute bottom-full right-0 mb-2 px-2 py-1 rounded-md bg-gray-800 text-white text-[10px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {SHORTCUT_LABEL}
        </span>
      </button>
    );
  }

  return (
    <>
      {showStart && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowStart(false)} />
          <div className="relative z-10 bg-white rounded-t-2xl md:rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {startStep === "student" ? "Start Timer" : "Select Service"}
                </h3>
                <p className="text-xs text-gray-500">
                  {startStep === "student"
                    ? "Choose a student to begin timing"
                    : `${selectedStudent?.firstName} ${selectedStudent?.lastName}`}
                </p>
              </div>
              <button onClick={() => setShowStart(false)} className="p-2 rounded-full hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            {startStep === "student" && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-4 py-3">
                  <input
                    ref={searchRef}
                    type="search"
                    placeholder="Search students..."
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
                  {filteredStudents.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-6">No students found</p>
                  )}
                  {filteredStudents.map(s => (
                    <button
                      key={s.id}
                      onClick={() => handleSelectStudent(s)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                        {s.firstName[0]}{s.lastName[0]}
                      </div>
                      <span className="text-sm font-medium text-gray-800">{s.firstName} {s.lastName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {startStep === "service" && (() => {
              const matchedTypeIds = new Set(studentRequirements.map(r => r.serviceTypeId));
              const sortedServiceTypes = [...serviceTypes].sort((a, b) => {
                const aMatched = matchedTypeIds.has(a.id) ? 0 : 1;
                const bMatched = matchedTypeIds.has(b.id) ? 0 : 1;
                return aMatched - bMatched;
              });
              const hasMatches = matchedTypeIds.size > 0;
              return (
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                  {hasMatches && (
                    <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide px-1 pb-1">
                      Based on IEP services
                    </p>
                  )}
                  {sortedServiceTypes.map((svc, idx) => {
                    const isMatched = matchedTypeIds.has(svc.id);
                    const isSuggested = svc.id === suggestedServiceTypeId;
                    const isFirstOther = hasMatches && !isMatched && sortedServiceTypes[idx - 1] && matchedTypeIds.has(sortedServiceTypes[idx - 1].id);
                    const remaining = isMatched ? remainingByType.get(svc.id) : undefined;
                    const remainingLabel = remaining
                      ? `${Math.round(remaining.remainingMinutes)} min ${intervalLabel(remaining.intervalType)}`
                      : null;
                    const tallRow = isSuggested || (isMatched && remainingLabel);
                    return (
                      <div key={svc.id}>
                        {isFirstOther && (
                          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide px-1 pt-2 pb-1">
                            Other services
                          </p>
                        )}
                        <button
                          onClick={() => handleSelectService(svc)}
                          className={`w-full px-4 py-2 rounded-lg border text-sm font-medium text-left transition-colors ${
                            isSuggested
                              ? `${tallRow ? "min-h-14" : "h-14"} bg-emerald-50 border-emerald-400 text-emerald-900 hover:bg-emerald-100`
                              : isMatched
                              ? `${tallRow ? "min-h-12" : "h-12"} bg-white border-emerald-200 text-gray-800 hover:bg-emerald-50`
                              : "h-12 bg-white border-gray-200 text-gray-800 hover:bg-emerald-50 hover:border-emerald-200"
                          } active:bg-emerald-100`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="block truncate">{svc.name}</span>
                            {remainingLabel && (
                              <span
                                className={`text-[10px] font-semibold whitespace-nowrap flex-shrink-0 ${
                                  remaining && remaining.remainingMinutes === 0
                                    ? "text-gray-400"
                                    : "text-emerald-700"
                                }`}
                              >
                                {remaining && remaining.remainingMinutes === 0 ? "Met" : remainingLabel}
                              </span>
                            )}
                          </div>
                          {isSuggested && (
                            <span className="text-[10px] font-semibold text-emerald-600">Suggested</span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => handleSelectService(null)}
                    className="w-full h-12 px-4 rounded-lg border border-dashed border-gray-200 text-sm font-medium text-gray-500 text-left hover:bg-gray-50 transition-colors"
                  >
                    General (no specific service)
                  </button>
                  <button
                    onClick={() => setStartStep("student")}
                    className="w-full text-center text-xs text-gray-400 pt-2 hover:text-gray-600"
                  >
                    Back to student selection
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {dataTimer && (
        <DataCollectionOverlay
          timer={dataTimer}
          entries={getEntriesForTimer(dataTimer)}
          onClose={() => setDataTimerId(null)}
          onPopOut={() => handlePopOut(dataTimer)}
          onEntriesChange={(newEntries) => handleLocalEntriesChange(dataTimer.id, newEntries)}
        />
      )}

      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 w-80 flex flex-col gap-2">
        {expanded && completedTimers.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Recent</span>
            </div>
            <div className="max-h-40 overflow-y-auto">
              {completedTimers.slice(0, 5).map(t => {
                const durationMs = (t.stoppedAt ?? 0) - t.startedAt;
                const goalCount = t.collectedData ? Object.keys(t.collectedData).length : 0;
                return (
                  <div key={t.id} className="px-3 py-2 flex items-center gap-2 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{t.studentName}</p>
                      <p className="text-[10px] text-gray-400">
                        {t.serviceTypeName} &middot; {formatMinutes(durationMs)} min
                        {goalCount > 0 && <span className="text-emerald-600 font-semibold"> &middot; {goalCount} goal{goalCount !== 1 ? "s" : ""}</span>}
                      </p>
                    </div>
                    <button
                      onClick={() => handleLogCompleted(t)}
                      className="px-2 py-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded-md hover:bg-emerald-100 flex-shrink-0"
                    >
                      Log
                    </button>
                    <button
                      onClick={() => dismissCompleted(t.id)}
                      className="p-1 text-gray-300 hover:text-gray-500 flex-shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {expanded && timers.map(timer => {
          const goalCount = timer.collectedData ? Object.keys(timer.collectedData).length : 0;
          return (
            <ActiveTimerCard
              key={timer.id}
              timer={timer}
              goalCount={goalCount}
              isOnlyTimer={timers.length === 1}
              warnThresholdMs={warnThresholdMs}
              criticalThresholdMs={criticalThresholdMs}
              onOpenData={() => handleOpenData(timer)}
              onStop={() => handleStop(timer)}
              onDiscard={() => handleDiscard(timer.id)}
            />
          );
        })}

        <div className="flex gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className={`flex-1 h-12 rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-[0.97] ${
              activeCount > 0
                ? "bg-emerald-600 text-white hover:bg-emerald-700"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            <Clock className="w-4 h-4" />
            {activeCount > 0 ? (
              <>
                <span className="text-sm font-semibold">
                  {activeCount} Active Timer{activeCount !== 1 ? "s" : ""}
                </span>
                {activeCount === 1 && <TimerTick startedAt={timers[0].startedAt} />}
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </>
            ) : (
              <>
                <span className="text-sm font-medium">Session Timers</span>
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </>
            )}
          </button>

          <button
            onClick={openStartFlow}
            className="relative w-12 h-12 rounded-xl shadow-lg bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center group"
            aria-label={`Start new timer (${SHORTCUT_LABEL})`}
            title={`Start new timer (${SHORTCUT_LABEL})`}
          >
            <Plus className="w-5 h-5" />
            <span className="absolute bottom-full right-0 mb-2 px-2 py-1 rounded-md bg-gray-800 text-white text-[10px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {SHORTCUT_LABEL}
            </span>
          </button>
        </div>
      </div>

      <QuickLogSheet
        isOpen={quickLogOpen}
        onClose={handleLogClose}
        onSuccess={handleLogSuccess}
        staffId={teacherId || null}
        prefillStudentId={quickLogPrefill.studentId}
        prefillStudentName={quickLogPrefill.studentName}
        prefillServiceTypeId={quickLogPrefill.serviceTypeId}
        prefillServiceTypeName={quickLogPrefill.serviceTypeName}
        prefillDurationMinutes={quickLogPrefill.durationMinutes}
        prefillStartTime={quickLogPrefill.startTime}
        prefillEndTime={quickLogPrefill.endTime}
        sessionDate={quickLogPrefill.sessionDate}
        collectedGoalData={quickLogGoalData}
      />
    </>
  );
}
