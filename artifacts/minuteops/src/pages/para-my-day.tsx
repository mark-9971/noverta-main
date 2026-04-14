import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Clock, MapPin, Play, Square, User, ChevronRight,
  Plus, Minus, Check, X, ArrowLeft, Target, BookOpen,
  AlertTriangle, Hand, Eye, Mic, Sparkles, Save,
  FileText, Activity, GraduationCap, Shield
} from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/lib/role-context";
import { apiGet, apiPost, apiPatch } from "@/lib/api";


interface ScheduleBlock {
  id: number;
  staffId: number;
  studentId: number | null;
  serviceTypeId: number | null;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location: string | null;
  blockLabel: string | null;
  blockType: string | null;
  notes: string | null;
  studentName: string | null;
  serviceTypeName: string | null;
}

interface IepGoal {
  id: number;
  goalArea: string;
  goalNumber: number;
  annualGoal: string;
  baseline: string | null;
  targetCriterion: string | null;
  measurementMethod: string | null;
  serviceArea: string | null;
  status: string;
  programTargetId: number | null;
  behaviorTargetId: number | null;
}

interface ProgramTarget {
  id: number;
  name: string;
  description: string | null;
  programType: string;
  domain: string | null;
  currentPromptLevel: string | null;
  currentStep: number | null;
  promptHierarchy: string[] | null;
  masteryCriterionPercent: number | null;
  masteryCriterionSessions: number | null;
  tutorInstructions: string | null;
  steps: ProgramStep[];
}

interface ProgramStep {
  id: number;
  stepNumber: number;
  name: string;
  sdInstruction: string | null;
  targetResponse: string | null;
  materials: string | null;
  promptStrategy: string | null;
  errorCorrection: string | null;
  mastered: boolean;
}

interface BehaviorTarget {
  id: number;
  name: string;
  description: string | null;
  measurementType: string;
  targetDirection: string;
  baselineValue: string | null;
  goalValue: string | null;
}

interface ActiveSession {
  blockId: number;
  studentId: number;
  studentName: string;
  serviceTypeId: number | null;
  serviceTypeName: string | null;
  startedAt: Date;
  location: string | null;
  serverSessionId: number | null;
}

interface TrialResult {
  programTargetId: number;
  correct: boolean;
  promptLevel: string;
}

interface BehaviorTally {
  behaviorTargetId: number;
  count: number;
}

interface BipSummary {
  id: number;
  targetBehavior: string;
  operationalDefinition: string;
  hypothesizedFunction: string;
  replacementBehaviors: string | null;
  preventionStrategies: string | null;
  teachingStrategies: string | null;
  consequenceStrategies: string | null;
  crisisPlan: string | null;
  dataCollectionMethod: string | null;
  status: string;
  version: number;
  effectiveDate: string | null;
}

interface GoalDataEntry {
  iepGoalId: number;
  programTargetId?: number;
  programData?: {
    trialsCorrect: number;
    trialsTotal: number;
    promptLevelUsed: string | null;
  };
  behaviorTargetId?: number;
  behaviorData?: { value: number };
}

interface SessionPayload {
  studentId: number;
  staffId: number | null;
  sessionDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: string;
  location: string | null;
  notes: string | null;
  serviceTypeId: number | null;
  isMakeup: boolean;
  goalData?: GoalDataEntry[];
}

type ViewMode = "agenda" | "session" | "goals" | "bip";

type LucideIcon = React.ComponentType<{ className?: string }>;

const PROMPT_LEVELS: { key: string; label: string; short: string; icon: LucideIcon; color: string }[] = [
  { key: "independent", label: "Independent", short: "I", icon: Sparkles, color: "bg-emerald-100 text-emerald-600 border-emerald-300" },
  { key: "verbal", label: "Verbal", short: "V", icon: Mic, color: "bg-gray-100 text-gray-700 border-gray-300" },
  { key: "gestural", label: "Gestural", short: "G", icon: Hand, color: "bg-gray-200 text-gray-700 border-gray-400" },
  { key: "model", label: "Model", short: "M", icon: Eye, color: "bg-amber-50 text-amber-700 border-amber-300" },
  { key: "partial_physical", label: "Partial Physical", short: "PP", icon: Hand, color: "bg-amber-100 text-amber-700 border-amber-400" },
  { key: "full_physical", label: "Full Physical", short: "FP", icon: Hand, color: "bg-red-100 text-red-700 border-red-300" },
];

function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function formatDuration(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function isCurrentBlock(block: ScheduleBlock): boolean {
  const now = new Date();
  const [sh, sm] = block.startTime.split(":").map(Number);
  const [eh, em] = block.endTime.split(":").map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
}

function isUpcoming(block: ScheduleBlock): boolean {
  const now = new Date();
  const [sh, sm] = block.startTime.split(":").map(Number);
  return now.getHours() * 60 + now.getMinutes() < sh * 60 + sm;
}

export default function ParaMyDayPage() {
  const { teacherId } = useRole();
  const [loading, setLoading] = useState(true);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [view, setView] = useState<ViewMode>("agenda");
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [sessionNotes, setSessionNotes] = useState("");

  const [studentTargets, setStudentTargets] = useState<{
    goals: IepGoal[];
    programs: ProgramTarget[];
    behaviors: BehaviorTarget[];
    bips: BipSummary[];
  } | null>(null);
  const [trials, setTrials] = useState<TrialResult[]>([]);
  const [tallies, setTallies] = useState<BehaviorTally[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeProgram, setActiveProgram] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const staffId = teacherId;

  const loadDay = useCallback(async () => {
    if (!staffId) {
      setBlocks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiGet(`/api/para/my-day?staffId=${staffId}&date=${date}`);
      setBlocks(data.blocks || []);
    } catch {
      toast.error("Failed to load schedule");
    }
    setLoading(false);
  }, [staffId, date]);

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
      const qsRes = await apiPost(`/api/para/sessions/quick-start`, {
          scheduleBlockId: block.id,
          sessionDate: date,
          startTime,
        });
      if (qsRes.ok) {
        const qsData = await qsRes.json() as { session: { id: number } };
        setActiveSession(prev => prev ? { ...prev, serverSessionId: qsData.session.id } : prev);
      }
    } catch {
      // Session creation on stop will serve as fallback
    }

    try {
      const stUrl = block.serviceTypeId
        ? `/api/para/student-targets/${block.studentId}?serviceTypeId=${block.serviceTypeId}`
        : `/api/para/student-targets/${block.studentId}`;
      const data = await apiGet(stUrl);
      setStudentTargets(data);
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

    const goalData: GoalDataEntry[] = [];
    if (studentTargets) {
      for (const prog of studentTargets.programs) {
        const progTrials = trials.filter(t => t.programTargetId === prog.id);
        if (progTrials.length === 0) continue;

        const linkedGoal = studentTargets.goals.find(g => g.programTargetId === prog.id);
        if (linkedGoal) {
          const correct = progTrials.filter(t => t.correct).length;
          goalData.push({
            iepGoalId: linkedGoal.id,
            programTargetId: prog.id,
            programData: {
              trialsCorrect: correct,
              trialsTotal: progTrials.length,
              promptLevelUsed: progTrials[progTrials.length - 1]?.promptLevel || null,
            },
          });
        }
      }

      for (const beh of studentTargets.behaviors) {
        const tally = tallies.find(t => t.behaviorTargetId === beh.id);
        if (!tally || tally.count === 0) continue;

        const linkedGoal = studentTargets.goals.find(g => g.behaviorTargetId === beh.id);
        if (linkedGoal) {
          goalData.push({
            iepGoalId: linkedGoal.id,
            behaviorTargetId: beh.id,
            behaviorData: { value: tally.count },
          });
        }
      }
    }

    try {
      let saveOk = false;

      if (activeSession.serverSessionId) {
        const stopRes = await apiPatch(`/api/para/sessions/${activeSession.serverSessionId}/stop`, {
            endTime: endTimeStr,
            durationMinutes,
            notes: sessionNotes || null,
            status: "completed",
            goalData: goalData.length > 0 ? goalData : undefined,
          });
        saveOk = stopRes.ok;
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

        await apiPost(`/api/sessions`, body);
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
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">My Day</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white min-h-[44px]"
        />
      </div>

      {blocks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Clock className="w-10 h-10 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-400 text-sm">No sessions scheduled for today.</p>
            <p className="text-gray-300 text-xs mt-1">Check another day or contact your supervisor.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {blocks.map(block => {
            const current = isCurrentBlock(block);
            const upcoming = isUpcoming(block);
            const isPast = !current && !upcoming;

            return (
              <Card
                key={block.id}
                className={`transition-all ${current ? "ring-2 ring-emerald-600 shadow-md" : ""} ${isPast ? "opacity-60" : ""}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {current && (
                          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-pulse" />
                            NOW
                          </span>
                        )}
                        {upcoming && (
                          <span className="text-[11px] font-medium text-gray-400">UPCOMING</span>
                        )}
                      </div>

                      <p className="text-[16px] font-semibold text-gray-800 truncate">
                        {block.studentName || "Unassigned"}
                      </p>
                      <p className="text-[13px] text-gray-500 mt-0.5">
                        {block.serviceTypeName || block.blockLabel || "Session"}
                      </p>

                      <div className="flex items-center gap-4 mt-2 text-[12px] text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {formatTime(block.startTime)} – {formatTime(block.endTime)}
                        </span>
                        {block.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {block.location}
                          </span>
                        )}
                      </div>
                    </div>

                    {block.studentId && !isPast && (
                      <Button
                        size="lg"
                        className="bg-emerald-600 hover:bg-emerald-600/90 text-white min-h-[48px] min-w-[48px] px-5 text-[14px] font-semibold rounded-xl shadow-sm flex-shrink-0"
                        onClick={() => startSession(block)}
                      >
                        <Play className="w-5 h-5 mr-1.5" />
                        Start
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SessionView({
  session, elapsed, notes, onNotesChange, targets, trials, tallies,
  onAddTrial, onUpdateTally, onStop, onCancel, onViewGoals, onViewBip, saving,
  activeProgram, onSetActiveProgram,
}: {
  session: ActiveSession;
  elapsed: number;
  notes: string;
  onNotesChange: (v: string) => void;
  targets: { goals: IepGoal[]; programs: ProgramTarget[]; behaviors: BehaviorTarget[]; bips: BipSummary[] } | null;
  trials: TrialResult[];
  tallies: BehaviorTally[];
  onAddTrial: (pid: number, correct: boolean, prompt: string) => void;
  onUpdateTally: (bid: number, delta: number) => void;
  onStop: () => void;
  onCancel: () => void;
  onViewGoals: () => void;
  onViewBip: () => void;
  saving: boolean;
  activeProgram: number | null;
  onSetActiveProgram: (id: number | null) => void;
}) {
  const [selectedPrompt, setSelectedPrompt] = useState("independent");
  const [tab, setTab] = useState<"programs" | "behaviors">("programs");

  if (activeProgram && targets) {
    const prog = targets.programs.find(p => p.id === activeProgram);
    if (prog) {
      const progTrials = trials.filter(t => t.programTargetId === prog.id);
      const correct = progTrials.filter(t => t.correct).length;
      const total = progTrials.length;

      return (
        <div className="p-4 max-w-lg mx-auto space-y-4 pb-24">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onSetActiveProgram(null)}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-gray-100 text-gray-600"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-bold text-gray-800 truncate">{prog.name}</p>
              <p className="text-[12px] text-gray-400">{prog.domain || prog.programType}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-[20px] font-bold text-emerald-600">
                {total > 0 ? Math.round((correct / total) * 100) : 0}%
              </p>
              <p className="text-[11px] text-gray-400">{correct}/{total} correct</p>
            </div>
          </div>

          {prog.tutorInstructions && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Instructions</p>
              <p className="text-[13px] text-gray-600">{prog.tutorInstructions}</p>
            </div>
          )}

          {prog.steps.length > 0 && (
            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
              <p className="text-[11px] font-semibold text-gray-500 uppercase mb-2">Current Step</p>
              {prog.steps.filter(s => !s.mastered).slice(0, 1).map(step => (
                <div key={step.id}>
                  <p className="text-[14px] font-medium text-gray-700">Step {step.stepNumber}: {step.name}</p>
                  {step.sdInstruction && (
                    <p className="text-[12px] text-gray-500 mt-1">SD: "{step.sdInstruction}"</p>
                  )}
                  {step.targetResponse && (
                    <p className="text-[12px] text-gray-500">Target: {step.targetResponse}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="text-[12px] font-semibold text-gray-500 uppercase mb-2">Prompt Level</p>
            <div className="grid grid-cols-3 gap-2">
              {PROMPT_LEVELS.map(p => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.key}
                    onClick={() => setSelectedPrompt(p.key)}
                    className={`min-h-[48px] rounded-xl border-2 text-[12px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      selectedPrompt === p.key
                        ? p.color + " border-current shadow-sm"
                        : "bg-white text-gray-400 border-gray-200"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {p.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onAddTrial(prog.id, true, selectedPrompt)}
              className="min-h-[72px] rounded-2xl bg-emerald-50 border-2 border-emerald-200 text-emerald-600 flex flex-col items-center justify-center gap-1 active:bg-emerald-100 transition-colors"
            >
              <Check className="w-8 h-8" />
              <span className="text-[14px] font-bold">Correct</span>
            </button>
            <button
              onClick={() => onAddTrial(prog.id, false, selectedPrompt)}
              className="min-h-[72px] rounded-2xl bg-red-50 border-2 border-red-200 text-red-600 flex flex-col items-center justify-center gap-1 active:bg-red-100 transition-colors"
            >
              <X className="w-8 h-8" />
              <span className="text-[14px] font-bold">Incorrect</span>
            </button>
          </div>

          {progTrials.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase mb-2">Trial History</p>
              <div className="flex flex-wrap gap-1.5">
                {progTrials.map((t, i) => {
                  const pl = PROMPT_LEVELS.find(p => p.key === t.promptLevel);
                  return (
                    <span
                      key={i}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-bold border ${
                        t.correct
                          ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                          : "bg-red-50 text-red-600 border-red-200"
                      }`}
                      title={`${t.correct ? "✓" : "✗"} ${pl?.label || t.promptLevel}`}
                    >
                      {t.correct ? "✓" : "✗"}{pl?.short || ""}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      );
    }
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-24">
      <div className="bg-gray-800 text-white rounded-2xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider opacity-80">Active Session</p>
            <p className="text-[18px] font-bold truncate">{session.studentName}</p>
            <p className="text-[13px] opacity-80">{session.serviceTypeName || "Session"}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[32px] font-mono font-bold tracking-tight">{formatDuration(elapsed)}</p>
            {session.location && (
              <p className="text-[11px] opacity-70 flex items-center justify-end gap-1">
                <MapPin className="w-3 h-3" /> {session.location}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={onStop}
            disabled={saving}
            className="flex-1 bg-white text-emerald-600 hover:bg-gray-50 min-h-[48px] text-[14px] font-bold rounded-xl"
          >
            {saving ? (
              <span className="animate-pulse">Saving...</span>
            ) : (
              <>
                <Save className="w-5 h-5 mr-2" />
                Stop & Save
              </>
            )}
          </Button>
          <button
            onClick={onCancel}
            className="min-w-[48px] min-h-[48px] rounded-xl bg-white/20 text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onViewGoals}
          className="flex-1 min-h-[48px] rounded-xl bg-gray-50 border border-gray-200 text-gray-600 flex items-center justify-center gap-2 text-[13px] font-medium"
        >
          <BookOpen className="w-4 h-4" />
          View Goals
        </button>
        {targets && targets.bips.length > 0 && (
          <button
            onClick={onViewBip}
            className="flex-1 min-h-[48px] rounded-xl bg-gray-50 border border-gray-200 text-gray-600 flex items-center justify-center gap-2 text-[13px] font-medium"
          >
            <Shield className="w-4 h-4" />
            View BIP
          </button>
        )}
      </div>

      {targets && (
        <>
          <div className="flex items-center border-b border-gray-200">
            <button
              onClick={() => setTab("programs")}
              className={`flex-1 py-3 text-[13px] font-semibold border-b-2 flex items-center justify-center gap-1.5 ${
                tab === "programs" ? "border-emerald-600 text-emerald-600" : "border-transparent text-gray-400"
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              Programs ({targets.programs.length})
            </button>
            <button
              onClick={() => setTab("behaviors")}
              className={`flex-1 py-3 text-[13px] font-semibold border-b-2 flex items-center justify-center gap-1.5 ${
                tab === "behaviors" ? "border-emerald-600 text-emerald-600" : "border-transparent text-gray-400"
              }`}
            >
              <Activity className="w-4 h-4" />
              Behaviors ({targets.behaviors.length})
            </button>
          </div>

          {tab === "programs" && (
            <div className="space-y-2">
              {targets.programs.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">No active programs for this student.</p>
              ) : (
                targets.programs.map(prog => {
                  const progTrials = trials.filter(t => t.programTargetId === prog.id);
                  const correct = progTrials.filter(t => t.correct).length;
                  const total = progTrials.length;
                  const pct = total > 0 ? Math.round((correct / total) * 100) : null;

                  return (
                    <button
                      key={prog.id}
                      onClick={() => onSetActiveProgram(prog.id)}
                      className="w-full text-left"
                    >
                      <Card className="hover:shadow-sm transition-shadow active:bg-gray-50">
                        <CardContent className="p-4 flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-semibold text-gray-700 truncate">{prog.name}</p>
                            <p className="text-[12px] text-gray-400 mt-0.5">
                              {prog.domain || prog.programType}
                              {total > 0 && ` · ${correct}/${total} trials`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {pct !== null && (
                              <span className={`text-[14px] font-bold ${pct >= (prog.masteryCriterionPercent || 80) ? "text-emerald-600" : "text-gray-600"}`}>
                                {pct}%
                              </span>
                            )}
                            <ChevronRight className="w-5 h-5 text-gray-300" />
                          </div>
                        </CardContent>
                      </Card>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {tab === "behaviors" && (
            <div className="space-y-2">
              {targets.behaviors.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">No active behavior targets for this student.</p>
              ) : (
                targets.behaviors.map(beh => {
                  const tally = tallies.find(t => t.behaviorTargetId === beh.id);
                  const count = tally?.count || 0;

                  return (
                    <Card key={beh.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-semibold text-gray-700 truncate">{beh.name}</p>
                            <p className="text-[12px] text-gray-400 mt-0.5">
                              {beh.measurementType === "frequency" ? "Count" : beh.measurementType}
                              {beh.targetDirection === "decrease" ? " ↓" : " ↑"}
                              {beh.goalValue ? ` Goal: ${beh.goalValue}` : ""}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                              onClick={() => onUpdateTally(beh.id, -1)}
                              className="min-w-[48px] min-h-[48px] rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center active:bg-gray-200"
                            >
                              <Minus className="w-5 h-5" />
                            </button>
                            <span className="text-[24px] font-bold text-gray-800 w-12 text-center tabular-nums">
                              {count}
                            </span>
                            <button
                              onClick={() => onUpdateTally(beh.id, 1)}
                              className="min-w-[48px] min-h-[48px] rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center active:bg-emerald-200"
                            >
                              <Plus className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </>
      )}

      <div>
        <label className="text-[12px] font-semibold text-gray-500 uppercase mb-1 block">Session Notes</label>
        <textarea
          value={notes}
          onChange={e => onNotesChange(e.target.value)}
          placeholder="Optional notes about this session..."
          className="w-full border border-gray-200 rounded-xl p-3 text-[14px] text-gray-700 min-h-[80px] resize-none focus:outline-none focus:ring-2 focus:ring-emerald-200"
        />
      </div>
    </div>
  );
}

function GoalsSummary({
  goals, studentName, onBack,
}: {
  goals: IepGoal[];
  studentName: string;
  onBack: () => void;
}) {
  const grouped: Record<string, IepGoal[]> = {};
  for (const g of goals) {
    const area = g.serviceArea || g.goalArea || "General";
    if (!grouped[area]) grouped[area] = [];
    grouped[area].push(g);
  }

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-gray-100 text-gray-600"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-[18px] font-bold text-gray-800">IEP Goals</h1>
          <p className="text-[13px] text-gray-400">{studentName}</p>
        </div>
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Target className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-400 text-sm">No active goals found.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([area, areaGoals]) => (
          <div key={area}>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{area}</p>
            <div className="space-y-2">
              {areaGoals.map(g => (
                <Card key={g.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2 mb-2">
                      <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full flex-shrink-0">
                        Goal {g.goalNumber}
                      </span>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        g.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"
                      }`}>
                        {g.status}
                      </span>
                    </div>
                    <p className="text-[14px] text-gray-700 leading-relaxed">{g.annualGoal}</p>
                    {g.targetCriterion && (
                      <p className="text-[12px] text-gray-400 mt-2">
                        <span className="font-semibold">Target:</span> {g.targetCriterion}
                      </p>
                    )}
                    {g.baseline && (
                      <p className="text-[12px] text-gray-400 mt-1">
                        <span className="font-semibold">Baseline:</span> {g.baseline}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function BipSummaryView({
  bips, studentName, onBack,
}: {
  bips: BipSummary[];
  studentName: string;
  onBack: () => void;
}) {
  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-gray-100 text-gray-600"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-[18px] font-bold text-gray-800">Behavior Intervention Plans</h1>
          <p className="text-[13px] text-gray-400">{studentName}</p>
        </div>
      </div>

      {bips.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Shield className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-400 text-sm">No active BIPs found.</p>
          </CardContent>
        </Card>
      ) : (
        bips.map(bip => (
          <Card key={bip.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-bold text-gray-800">{bip.targetBehavior}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      bip.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"
                    }`}>
                      {bip.status}
                    </span>
                    <span className="text-[11px] text-gray-400">v{bip.version}</span>
                  </div>
                </div>
              </div>

              <BipSection label="Operational Definition" content={bip.operationalDefinition} />
              <BipSection label="Hypothesized Function" content={bip.hypothesizedFunction} />
              <BipSection label="Replacement Behaviors" content={bip.replacementBehaviors} />
              <BipSection label="Prevention Strategies" content={bip.preventionStrategies} />
              <BipSection label="Teaching Strategies" content={bip.teachingStrategies} />
              <BipSection label="Consequence Strategies" content={bip.consequenceStrategies} />
              <BipSection label="Crisis Plan" content={bip.crisisPlan} highlight />
              {bip.dataCollectionMethod && (
                <BipSection label="Data Collection" content={bip.dataCollectionMethod} />
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function BipSection({ label, content, highlight }: { label: string; content: string | null; highlight?: boolean }) {
  if (!content) return null;
  return (
    <div className={`rounded-lg p-3 ${highlight ? "bg-red-50 border border-red-100" : "bg-gray-50 border border-gray-100"}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wider mb-1 ${highlight ? "text-red-500" : "text-gray-500"}`}>
        {label}
      </p>
      <p className="text-[13px] text-gray-700 leading-relaxed whitespace-pre-line">{content}</p>
    </div>
  );
}
