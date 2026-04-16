import { useState, useEffect, useCallback, useRef } from "react";
import { Play, Square, X, Clock, ChevronUp, ChevronDown, Trash2, Plus } from "lucide-react";
import { useSessionTimers, type TimerEntry } from "@/lib/session-timer-context";
import { useRole } from "@/lib/role-context";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { QuickLogSheet } from "@/components/quick-log-sheet";

interface Student { id: number; firstName: string; lastName: string; }
interface ServiceType { id: number; name: string; }

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

export function FloatingTimer() {
  const { timers, completedTimers, startTimer, stopTimer, removeTimer, dismissCompleted } = useSessionTimers();
  const { teacherId, role } = useRole();

  const [expanded, setExpanded] = useState(false);
  const [showStart, setShowStart] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [startStep, setStartStep] = useState<"student" | "service">("student");

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

  const searchRef = useRef<HTMLInputElement>(null);

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
    loadData();
    setTimeout(() => searchRef.current?.focus(), 100);
  }, [loadData]);

  const handleSelectStudent = (s: Student) => {
    setSelectedStudent(s);
    setStartStep("service");
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

  const handleStop = (timer: TimerEntry) => {
    const stopped = stopTimer(timer.id);
    if (!stopped || !stopped.stoppedAt) return;
    setLoggingTimerId(stopped.id);
    setQuickLogPrefill(buildPrefill(stopped as TimerEntry & { stoppedAt: number }));
    setQuickLogOpen(true);
  };

  const handleLogCompleted = (timer: TimerEntry) => {
    if (!timer.stoppedAt) return;
    setLoggingTimerId(timer.id);
    setQuickLogPrefill(buildPrefill(timer as TimerEntry & { stoppedAt: number }));
    setQuickLogOpen(true);
  };

  const handleLogSuccess = () => {
    if (loggingTimerId) {
      dismissCompleted(loggingTimerId);
    }
    setLoggingTimerId(null);
    setQuickLogOpen(false);
  };

  const handleLogClose = () => {
    setLoggingTimerId(null);
    setQuickLogOpen(false);
  };

  const handleDiscard = (id: string) => {
    removeTimer(id);
    toast("Timer discarded");
  };

  const filteredStudents = studentSearch.trim()
    ? students.filter(s =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(studentSearch.toLowerCase())
      )
    : students;

  if (!hasActivity && !showStart) {
    return (
      <button
        onClick={openStartFlow}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-40 w-14 h-14 rounded-full bg-emerald-600 text-white shadow-lg hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center"
        aria-label="Start session timer"
      >
        <Play className="w-6 h-6 ml-0.5" />
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

            {startStep === "service" && (
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                {serviceTypes.map(svc => (
                  <button
                    key={svc.id}
                    onClick={() => handleSelectService(svc)}
                    className="w-full h-12 px-4 rounded-lg border border-gray-200 text-sm font-medium text-gray-800 text-left hover:bg-emerald-50 hover:border-emerald-200 active:bg-emerald-100 transition-colors"
                  >
                    {svc.name}
                  </button>
                ))}
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
            )}
          </div>
        </div>
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
                return (
                  <div key={t.id} className="px-3 py-2 flex items-center gap-2 border-b border-gray-50 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-700 truncate">{t.studentName}</p>
                      <p className="text-[10px] text-gray-400">{t.serviceTypeName} &middot; {formatMinutes(durationMs)} min</p>
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

        {expanded && timers.map(timer => (
          <div key={timer.id} className="bg-white rounded-xl shadow-lg border border-emerald-200 overflow-hidden">
            <div className="px-3 py-2.5 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{timer.studentName}</p>
                <p className="text-[11px] text-gray-400">{timer.serviceTypeName}</p>
              </div>
              <TimerTick startedAt={timer.startedAt} />
            </div>
            <div className="px-3 py-2 bg-gray-50 border-t border-gray-100 flex gap-2">
              <button
                onClick={() => handleStop(timer)}
                className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 active:scale-[0.97] transition-all"
              >
                <Square className="w-3 h-3" /> Stop & Log
              </button>
              <button
                onClick={() => handleDiscard(timer.id)}
                className="h-8 px-3 rounded-lg border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 text-xs transition-colors"
                title="Discard timer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}

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
            className="w-12 h-12 rounded-xl shadow-lg bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center"
            aria-label="Start new timer"
          >
            <Plus className="w-5 h-5" />
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
      />
    </>
  );
}
