import { useState, useEffect, useCallback, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusCircle } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/lib/role-context";
import {
  getParaMyDay, paraQuickStartSession, paraStopSession, createSession,
  getParaStudentTargets, useListMinuteProgress,
} from "@workspace/api-client-react";
import { QuickLogSheet } from "@/components/quick-log-sheet";
import { authFetch } from "@/lib/auth-fetch";

import type {
  ScheduleBlock, ActiveSession, TrialResult, BehaviorTally, AssignedBip,
  StudentTargets, StaffAlert, ViewMode, QuickLogPrefill,
  SessionPayload, BehaviorTarget,
} from "./types";
import { buildGoalData } from "./sessionHelpers";
import { AgendaView } from "./AgendaView";
import { SessionView } from "./SessionView";
import { GoalsSummary } from "./GoalsSummary";
import { BipSummaryView } from "./BipSummaryView";
import { AssignedBipListView } from "./AssignedBipListView";

export default function ParaMyDayPage() {
  const { teacherId } = useRole();
  const [loading, setLoading] = useState(true);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [view, setView] = useState<ViewMode>("agenda");
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [sessionNotes, setSessionNotes] = useState("");

  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogPrefill, setQuickLogPrefill] = useState<QuickLogPrefill>({});
  const [quickLogSkipToMissed, setQuickLogSkipToMissed] = useState(false);

  const [alerts, setAlerts] = useState<StaffAlert[]>([]);
  const [dismissingAlerts, setDismissingAlerts] = useState<Set<number>>(new Set());

  const [studentTargets, setStudentTargets] = useState<StudentTargets | null>(null);
  const [trials, setTrials] = useState<TrialResult[]>([]);
  const [tallies, setTallies] = useState<BehaviorTally[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeProgram, setActiveProgram] = useState<number | null>(null);
  const [assignedBips, setAssignedBips] = useState<AssignedBip[]>([]);
  const [bipDetailId, setBipDetailId] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const staffId = teacherId;

  const { data: caseloadProgressRaw } = useListMinuteProgress(
    staffId ? ({ staffId } as any) : (undefined as any)
  );
  const caseloadProgress = staffId && Array.isArray(caseloadProgressRaw) ? (caseloadProgressRaw as any[]) : undefined;

  const loadDay = useCallback(async () => {
    if (!staffId) {
      setBlocks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [dayData] = await Promise.all([
        getParaMyDay({ staffId, date } as any),
        authFetch(`/api/staff/${staffId}/assigned-bips`)
          .then(r => r.ok ? r.json() : [])
          .then((data: unknown) => {
            if (!Array.isArray(data)) return;
            setAssignedBips(data as AssignedBip[]);
          })
          .catch(() => {}),
        authFetch(`/api/alerts?staffId=${staffId}&resolved=false`)
          .then(r => r.ok ? r.json() : { data: [] })
          .then((data: unknown) => {
            const arr = Array.isArray(data) ? data : (data as any)?.data ?? [];
            if (!Array.isArray(arr)) return;
            setAlerts(
              (arr as Record<string, unknown>[])
                .filter(a => typeof a === "object" && a !== null && typeof a["id"] === "number")
                .map(a => ({
                  id: a["id"] as number,
                  severity: typeof a["severity"] === "string" ? a["severity"] : "info",
                  message: typeof a["message"] === "string" ? a["message"] : "",
                  suggestedAction: typeof a["suggestedAction"] === "string" ? a["suggestedAction"] : null,
                  studentName: typeof a["studentName"] === "string" ? a["studentName"] : null,
                }))
            );
          })
          .catch(() => {}),
      ]);
      setBlocks((dayData as any).blocks || []);
    } catch {
      toast.error("Failed to load schedule");
    }
    setLoading(false);
  }, [staffId, date]);

  const resolveAlert = async (alertId: number) => {
    setDismissingAlerts(prev => new Set([...prev, alertId]));
    try {
      const res = await authFetch(`/api/alerts/${alertId}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolvedNote: "Acknowledged from My Day" }),
      });
      if (res.ok) {
        setAlerts(prev => prev.filter(a => a.id !== alertId));
      } else {
        toast.error("Failed to acknowledge alert");
      }
    } catch {
      toast.error("Failed to acknowledge alert");
    }
    setDismissingAlerts(prev => { const s = new Set(prev); s.delete(alertId); return s; });
  };

  useEffect(() => { loadDay(); }, [loadDay]);

  useEffect(() => {
    if (activeSession) {
      timerRef.current = setInterval(() => {
        setElapsed(Date.now() - activeSession.startedAt.getTime());
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeSession]);

  const startSession = async (block: ScheduleBlock) => {
    if (!block.studentId) {
      toast.error("No student assigned to this block");
      return;
    }

    const now = new Date();
    const startTime = now.toTimeString().slice(0, 5);

    const sessionState: ActiveSession = {
      blockId: block.id,
      studentId: block.studentId,
      studentName: block.studentName || "Student",
      serviceTypeId: block.serviceTypeId,
      serviceTypeName: block.serviceTypeName,
      startedAt: now,
      location: block.location,
      serverSessionId: null,
    };

    setActiveSession(sessionState);
    setElapsed(0);
    setSessionNotes("");
    setTrials([]);
    setView("session");

    try {
      const qsData = await paraQuickStartSession({
          scheduleBlockId: block.id,
          sessionDate: date,
          startTime,
        } as any) as { session: { id: number } };
      setActiveSession(prev => prev ? { ...prev, serverSessionId: qsData.session.id } : prev);
    } catch {
      // Session creation on stop will serve as fallback
    }

    try {
      const data = await getParaStudentTargets(
          block.studentId,
          block.serviceTypeId ? { serviceTypeId: block.serviceTypeId } as any : undefined
        );
      setStudentTargets(data as any);
      setTallies(data.behaviors.map((b: BehaviorTarget) => ({ behaviorTargetId: b.id, count: 0 })));
    } catch {
      toast.error("Failed to load student targets");
    }
  };

  const stopAndSaveSession = async () => {
    if (!activeSession) return;
    setSaving(true);

    const durationMinutes = Math.max(1, Math.round(elapsed / 60000));
    const now = new Date();
    const startTimeStr = activeSession.startedAt.toTimeString().slice(0, 5);
    const endTimeStr = now.toTimeString().slice(0, 5);

    const goalData = buildGoalData(studentTargets, trials, tallies);

    try {
      let saveOk = false;

      if (activeSession.serverSessionId) {
        try {
          await paraStopSession(activeSession.serverSessionId, {
              endTime: endTimeStr,
              durationMinutes,
              notes: sessionNotes || null,
              status: "completed",
              goalData: goalData.length > 0 ? goalData : undefined,
            } as any);
          saveOk = true;
        } catch {
          saveOk = false;
        }
      }

      if (!saveOk) {
        const body: SessionPayload = {
          studentId: activeSession.studentId,
          staffId,
          sessionDate: date,
          startTime: startTimeStr,
          endTime: endTimeStr,
          durationMinutes,
          status: "completed",
          location: activeSession.location,
          notes: sessionNotes || null,
          serviceTypeId: activeSession.serviceTypeId,
          isMakeup: false,
        };
        if (goalData.length > 0) body.goalData = goalData;

        await createSession(body as any);
      }

      toast.success("Session saved!");
      setActiveSession(null);
      setElapsed(0);
      setStudentTargets(null);
      setTrials([]);
      setTallies([]);
      setView("agenda");
    } catch {
      toast.error("Failed to save session");
    }
    setSaving(false);
  };

  const cancelSession = () => {
    setActiveSession(null);
    setElapsed(0);
    setStudentTargets(null);
    setTrials([]);
    setTallies([]);
    setView("agenda");
  };

  const openQuickLog = (prefill: QuickLogPrefill = {}, skipToMissed = false) => {
    setQuickLogPrefill(prefill);
    setQuickLogSkipToMissed(skipToMissed);
    setQuickLogOpen(true);
  };

  const addTrial = (programTargetId: number, correct: boolean, promptLevel: string) => {
    setTrials(prev => [...prev, { programTargetId, correct, promptLevel }]);
  };

  const updateTally = (behaviorTargetId: number, delta: number) => {
    setTallies(prev =>
      prev.map(t =>
        t.behaviorTargetId === behaviorTargetId
          ? { ...t, count: Math.max(0, t.count + delta) }
          : t
      )
    );
  };

  if (loading) {
    return (
      <div className="p-4 max-w-lg mx-auto space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (view === "goals" && activeSession && studentTargets) {
    return (
      <GoalsSummary
        goals={studentTargets.goals}
        studentName={activeSession.studentName}
        onBack={() => setView("session")}
      />
    );
  }

  if (view === "bip" && activeSession && studentTargets) {
    return (
      <BipSummaryView
        bips={studentTargets.bips}
        studentName={activeSession.studentName}
        onBack={() => setView("session")}
      />
    );
  }

  if (view === "my-bips") {
    return (
      <AssignedBipListView
        bips={assignedBips}
        expandedId={bipDetailId}
        onExpand={id => setBipDetailId(prev => prev === id ? null : id)}
        onBack={() => setView("agenda")}
      />
    );
  }

  if (view === "session" && activeSession) {
    return (
      <SessionView
        session={activeSession}
        elapsed={elapsed}
        notes={sessionNotes}
        onNotesChange={setSessionNotes}
        targets={studentTargets}
        trials={trials}
        tallies={tallies}
        onAddTrial={addTrial}
        onUpdateTally={updateTally}
        onStop={stopAndSaveSession}
        onCancel={cancelSession}
        onViewGoals={() => setView("goals")}
        onViewBip={() => setView("bip")}
        saving={saving}
        activeProgram={activeProgram}
        onSetActiveProgram={setActiveProgram}
      />
    );
  }

  return (
    <>
      <AgendaView
        date={date}
        onDateChange={setDate}
        blocks={blocks}
        alerts={alerts}
        dismissingAlerts={dismissingAlerts}
        onResolveAlert={resolveAlert}
        assignedBips={assignedBips}
        onShowMyBips={() => setView("my-bips")}
        onStartSession={startSession}
        onQuickLog={openQuickLog}
        caseloadProgress={caseloadProgress}
      />

      <button
        onClick={() => openQuickLog()}
        className="fixed bottom-6 right-5 z-40 w-14 h-14 rounded-full bg-emerald-600 text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform hover:bg-emerald-700"
        aria-label="Quick Log session"
      >
        <PlusCircle className="w-6 h-6" />
      </button>

      <QuickLogSheet
        isOpen={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        onSuccess={loadDay}
        staffId={staffId}
        prefillStudentId={quickLogPrefill.studentId}
        prefillStudentName={quickLogPrefill.studentName}
        prefillServiceTypeId={quickLogPrefill.serviceTypeId}
        prefillServiceTypeName={quickLogPrefill.serviceTypeName}
        sessionDate={date}
        skipToMissed={quickLogSkipToMissed}
      />
    </>
  );
}
