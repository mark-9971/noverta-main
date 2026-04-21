import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Activity, GraduationCap, X, Save, Play, Pause, Square, Minus, Plus, Check, CheckCircle, RotateCcw, Hand, BookOpen,
  CloudOff, RefreshCw, AlertTriangle,
} from "lucide-react";
import { createDataSession } from "@workspace/api-client-react";
import { useOfflineQueue } from "@/lib/useOfflineQueue";
import { PendingSessionsPanel } from "@/components/PendingSessionsPanel";
import {
  BehaviorTarget, ProgramTarget, Student, PROMPT_LABELS, measureLabel,
} from "./constants";

interface Props {
  studentId: number;
  student: Student;
  behaviorTargets: BehaviorTarget[];
  programTargets: ProgramTarget[];
  onSessionSaved: () => void;
}

export default function LiveDataCollection({ studentId, student, behaviorTargets, programTargets, onSessionSaved }: Props) {
  const { enqueue, dequeue, pendingCount } = useOfflineQueue();

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [behaviorCounts, setBehaviorCounts] = useState<Record<number, number>>({});
  const [programResults, setProgramResults] = useState<Record<number, { correct: number; total: number; prompted: number; promptLevel: string }>>({});
  const [trialHistory, setTrialHistory] = useState<Record<number, Array<{ correct: boolean; prompted: boolean }>>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [isIoaSession, setIsIoaSession] = useState(false);
  const [ioaObserverNumber, setIoaObserverNumber] = useState<1 | 2>(1);
  const [ioaSessionId, setIoaSessionId] = useState<string>("");
  const [ioaObserverName, setIoaObserverName] = useState("");
  const [eventTimestamps, setEventTimestamps] = useState<Record<number, number[]>>({});
  const [ioaObservedTargets, setIoaObservedTargets] = useState<Record<number, boolean>>({});
  const [intervalScoresMap, setIntervalScoresMap] = useState<Record<number, boolean[]>>({});
  const [durationBoutsMap, setDurationBoutsMap] = useState<Record<number, number[]>>({});
  const [durationStartedAtMap, setDurationStartedAtMap] = useState<Record<number, number | null>>({});
  const [latencyTrialsMap, setLatencyTrialsMap] = useState<Record<number, number[]>>({});
  const [latencyPhaseMap, setLatencyPhaseMap] = useState<Record<number, "idle" | "running">>({});
  const [latencyStartedAtMap, setLatencyStartedAtMap] = useState<Record<number, number | null>>({});
  const [sessionType, setSessionType] = useState<"acquisition" | "maintenance_probe" | "generalization_probe">("acquisition");
  const timerRef = useRef<any>(null);
  const startTimeRef = useRef<string>("");

  useEffect(() => {
    const bc: Record<number, number> = {};
    behaviorTargets.forEach(bt => { bc[bt.id] = 0; });
    setBehaviorCounts(bc);
    const pr: Record<number, { correct: number; total: number; prompted: number; promptLevel: string }> = {};
    const th: Record<number, Array<{ correct: boolean; prompted: boolean }>> = {};
    programTargets.forEach(pt => {
      pr[pt.id] = { correct: 0, total: 0, prompted: 0, promptLevel: pt.currentPromptLevel ?? "verbal" };
      th[pt.id] = [];
    });
    setProgramResults(pr);
    setTrialHistory(th);
  }, [behaviorTargets, programTargets]);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startSession() {
    setRunning(true);
    setSaved(false);
    setSaveError(null);
    setSavedOffline(false);
    setElapsed(0);
    setEventTimestamps({});
    setIoaObservedTargets({});
    setIntervalScoresMap({});
    setDurationBoutsMap({});
    setDurationStartedAtMap({});
    setLatencyTrialsMap({});
    setLatencyPhaseMap({});
    setLatencyStartedAtMap({});
    startTimeRef.current = new Date().toTimeString().slice(0, 5);
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
  }

  function stopSession() {
    setRunning(false);
    if (timerRef.current) clearInterval(timerRef.current);
  }

  async function saveSession() {
    setSaving(true);
    setSaveError(null);
    setSavedOffline(false);

    const now = new Date();
    const endTime = now.toTimeString().slice(0, 5);
    const sessionDate = now.toISOString().split("T")[0];

    const ioaSessId = isIoaSession ? (ioaSessionId ? parseInt(ioaSessionId) : Math.floor(Math.random() * 2000000000) + 1) : null;
    const behaviorData = behaviorTargets
      .filter(bt => {
        if (bt.measurementType === "interval") return (intervalScoresMap[bt.id] || []).length > 0;
        if (bt.measurementType === "duration") return (durationBoutsMap[bt.id] || []).length > 0;
        if (bt.measurementType === "latency") return (latencyTrialsMap[bt.id] || []).length > 0;
        return behaviorCounts[bt.id] > 0 || (isIoaSession && ioaObservedTargets[bt.id]);
      })
      .map(bt => {
        const scores = intervalScoresMap[bt.id] || [];
        const isInterval = bt.measurementType === "interval";
        const isDuration = bt.measurementType === "duration";
        const isLatency = bt.measurementType === "latency";
        const intervalWith = isInterval ? scores.filter(Boolean).length : null;
        const intervalTotal = isInterval ? scores.length : null;
        const intervalValue = isInterval && intervalTotal && intervalTotal > 0
          ? Math.round((intervalWith! / intervalTotal) * 100)
          : null;
        const bouts = durationBoutsMap[bt.id] || [];
        const durationTotal = isDuration ? bouts.reduce((a, b) => a + b, 0) : null;
        const trials = latencyTrialsMap[bt.id] || [];
        const latencyMean = isLatency && trials.length > 0
          ? parseFloat((trials.reduce((a, b) => a + b, 0) / trials.length).toFixed(1))
          : null;
        let value: number;
        let storedEventTimestamps: number[] | null = null;
        if (isInterval) {
          value = intervalValue ?? 0;
        } else if (isDuration) {
          value = durationTotal ?? 0;
          storedEventTimestamps = bouts.length ? bouts : null;
        } else if (isLatency) {
          value = latencyMean ?? 0;
          storedEventTimestamps = trials.length ? trials : null;
        } else {
          value = behaviorCounts[bt.id] ?? 0;
          storedEventTimestamps = isIoaSession && eventTimestamps[bt.id]?.length ? eventTimestamps[bt.id] : null;
        }
        return {
          behaviorTargetId: bt.id,
          value,
          intervalCount: intervalTotal,
          intervalsWith: intervalWith,
          hourBlock: `${now.getHours()}:00`,
          ioaSessionId: ioaSessId,
          observerNumber: isIoaSession ? ioaObserverNumber : null,
          observerName: isIoaSession ? (ioaObserverName || null) : null,
          eventTimestamps: storedEventTimestamps,
          intervalScores: isInterval && scores.length ? scores : (isIoaSession && intervalScoresMap[bt.id]?.length ? intervalScoresMap[bt.id] : null),
        };
      });

    const programData = programTargets
      .filter(pt => programResults[pt.id]?.total > 0)
      .map(pt => ({
        programTargetId: pt.id,
        trialsCorrect: programResults[pt.id].correct,
        trialsTotal: programResults[pt.id].total,
        prompted: programResults[pt.id].prompted,
        promptLevelUsed: programResults[pt.id].promptLevel,
        stepNumber: pt.currentStep ?? null,
      }));

    const payload = {
      sessionDate,
      startTime: startTimeRef.current,
      endTime,
      behaviorData,
      programData,
      sessionType,
    };

    /*
     * Safety-first: enqueue locally BEFORE the network call.
     * If the request succeeds → dequeue.
     * If the tab closes mid-request or the network fails → the queued copy
     * survives and can be retried from PendingSessionsPanel.
     *
     * WARNING: the API is NOT idempotent. A successful request that loses
     * its response (network drop after server commit) will produce a duplicate
     * if retried. We surface this risk to the user before they retry.
     */
    const queueId = enqueue({
      studentId,
      studentName: `${student.firstName} ${student.lastName}`,
      payload,
    });

    try {
      await createDataSession(studentId, payload as any);

      /* Success — remove from queue */
      dequeue(queueId);

      setSaved(true);
      setSaveError(null);
      if (isIoaSession && ioaSessId) {
        toast.success(`IOA session saved. Session ID: ${ioaSessId} — share this with Observer ${ioaObserverNumber === 1 ? "2" : "1"}`);
      }
      onSessionSaved();
    } catch (err: any) {
      /*
       * Network or server error — the data is already in the local queue.
       * Do NOT mark as saved. Leave the UI in the stopped state so staff
       * can see what happened and retry when connectivity returns.
       */
      const message = err?.message ?? "Network error — please check your connection.";
      setSaveError(message);
      setSavedOffline(true);
      toast.error("Session could not be saved to the server. Data is stored locally — use the retry panel to upload when connected.", {
        duration: 8000,
      });
    } finally {
      setSaving(false);
    }
  }


  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  function recordTrial(ptId: number, correct: boolean, prompted: boolean) {
    setProgramResults(prev => ({
      ...prev,
      [ptId]: {
        ...prev[ptId],
        total: (prev[ptId]?.total ?? 0) + 1,
        correct: (prev[ptId]?.correct ?? 0) + (correct ? 1 : 0),
        prompted: (prev[ptId]?.prompted ?? 0) + (prompted ? 1 : 0),
      },
    }));
    setTrialHistory(prev => ({
      ...prev,
      [ptId]: [...(prev[ptId] ?? []), { correct, prompted }],
    }));
  }

  function undoLastTrial(ptId: number) {
    const history = trialHistory[ptId] ?? [];
    if (history.length === 0) return;
    const lastTrial = history[history.length - 1];
    setProgramResults(prev => ({
      ...prev,
      [ptId]: {
        ...prev[ptId],
        total: Math.max(0, prev[ptId].total - 1),
        correct: Math.max(0, prev[ptId].correct - (lastTrial.correct ? 1 : 0)),
        prompted: Math.max(0, prev[ptId].prompted - (lastTrial.prompted ? 1 : 0)),
      },
    }));
    setTrialHistory(prev => ({
      ...prev,
      [ptId]: prev[ptId].slice(0, -1),
    }));
  }

  return (
    <div className="space-y-4">
      {/* Pending sessions from previous failures — shown at the top so staff notice them */}
      <PendingSessionsPanel studentId={studentId} />

      <Card className={`border-2 ${
        running ? "border-emerald-300 bg-emerald-50/30"
        : saved ? "border-emerald-300 bg-emerald-50/30"
        : savedOffline ? "border-amber-300 bg-amber-50/30"
        : saveError ? "border-red-300 bg-red-50/20"
        : "border-gray-200"
      }`}>
        <CardContent className="p-4 md:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-800">{student.firstName} {student.lastName}</h2>
              <p className="text-xs text-gray-400">Live Data Collection</p>
            </div>
            <div className="text-right">
              <p className="text-3xl md:text-4xl font-mono font-bold text-gray-800">{formatTime(elapsed)}</p>
              <p className="text-xs text-gray-400">
                {running ? "Recording..."
                  : saved ? "Session Saved"
                  : savedOffline ? "Saved locally"
                  : "Ready"}
              </p>
            </div>
          </div>

          {/* Offline save banner */}
          {savedOffline && !saved && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-2.5 flex items-start gap-2">
              <CloudOff className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[12px] font-semibold text-amber-800">Session saved locally — not yet uploaded</p>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Your data is safe on this device. Use the sync panel above to upload when you have a connection.
                  Do not refresh or close this browser tab until you have synced.
                </p>
              </div>
            </div>
          )}

          {/* Network error banner (transient, before local save confirmed) */}
          {saveError && !savedOffline && (
            <div className="mb-3 rounded-lg border border-red-300 bg-red-50 p-2.5 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[12px] font-semibold text-red-800">Save failed</p>
                <p className="text-[11px] text-red-700 mt-0.5">{saveError}</p>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {!running && !saved && !savedOffline && (
              <Button className="flex-1 h-12 md:h-10 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold" onClick={startSession}>
                <Play className="w-4 h-4 mr-2" /> Start Session
              </Button>
            )}
            {running && (
              <Button className="flex-1 h-12 md:h-10 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold" onClick={stopSession}>
                <Pause className="w-4 h-4 mr-2" /> Stop
              </Button>
            )}
            {!running && elapsed > 0 && !saved && !savedOffline && (
              <>
                <Button className="flex-1 h-12 md:h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold" onClick={saveSession} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" /> {saving ? "Saving..." : "Save Session"}
                </Button>
                <Button variant="outline" className="h-12 md:h-10" onClick={startSession}>
                  <RotateCcw className="w-4 h-4" />
                </Button>
              </>
            )}
            {/* Offline-saved state — keep data visible, prompt to sync */}
            {savedOffline && !saved && (
              <Button
                className="flex-1 h-12 md:h-10 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold"
                onClick={saveSession}
                disabled={saving}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                {saving ? "Retrying..." : "Retry Upload Now"}
              </Button>
            )}
            {saved && (
              <Button className="flex-1 h-12 md:h-10 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold" onClick={() => {
                setSaved(false); setElapsed(0);
                setSaveError(null); setSavedOffline(false);
                setIsIoaSession(false); setIoaSessionId("");
                setIntervalScoresMap({});
                setDurationBoutsMap({});
                setDurationStartedAtMap({});
                setLatencyTrialsMap({});
                setLatencyPhaseMap({});
                setLatencyStartedAtMap({});
                setEventTimestamps({});
                setIoaObservedTargets({});
                const bc: Record<number, number> = {};
                behaviorTargets.forEach(bt => { bc[bt.id] = 0; });
                setBehaviorCounts(bc);
                const pr: Record<number, any> = {};
                const th: Record<number, any[]> = {};
                programTargets.forEach(pt => { pr[pt.id] = { correct: 0, total: 0, prompted: 0, promptLevel: pt.currentPromptLevel ?? "verbal" }; th[pt.id] = []; });
                setProgramResults(pr);
                setTrialHistory(th);
              }}>
                <Play className="w-4 h-4 mr-2" /> New Session
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3 md:p-4 space-y-3">
          <div>
            <p className="text-[11px] font-medium text-gray-500 mb-1.5">Session Type</p>
            <div className="flex gap-2 flex-wrap">
              {([
                { key: "acquisition", label: "Acquisition", color: "emerald" },
                { key: "maintenance_probe", label: "Maintenance Probe", color: "blue" },
                { key: "generalization_probe", label: "Generalization Probe", color: "purple" },
              ] as const).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setSessionType(opt.key)}
                  disabled={running || saved}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all border ${
                    sessionType === opt.key
                      ? opt.color === "emerald" ? "bg-emerald-700 text-white border-emerald-700"
                        : opt.color === "blue" ? "bg-blue-600 text-white border-blue-600"
                        : "bg-purple-600 text-white border-purple-600"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {sessionType !== "acquisition" && (
              <p className="text-[10px] text-gray-400 mt-1">
                {sessionType === "maintenance_probe"
                  ? "Testing retention of previously mastered skills."
                  : "Testing skill performance in a new setting, with new people, or with novel materials."}
              </p>
            )}
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isIoaSession}
                  onChange={e => setIsIoaSession(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                  disabled={running || saved}
                />
                <span className="text-[12px] font-medium text-gray-700">IOA Session</span>
              </label>
              {isIoaSession && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-semibold">
                  Inter-Observer Agreement
                </span>
              )}
            </div>
          </div>
          {isIoaSession && (
            <div className="mt-2 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-gray-500">Observer:</span>
                <select
                  value={ioaObserverNumber}
                  onChange={e => setIoaObserverNumber(parseInt(e.target.value) as 1 | 2)}
                  className="text-[11px] border border-gray-200 rounded px-2 py-1 bg-white"
                  disabled={running || saved}
                >
                  <option value={1}>Observer 1 (Primary)</option>
                  <option value={2}>Observer 2 (Reliability)</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-gray-500">Your Name:</span>
                <input
                  type="text"
                  value={ioaObserverName}
                  onChange={e => setIoaObserverName(e.target.value)}
                  placeholder="e.g. J. Smith (BCBA)"
                  className="text-[11px] border border-gray-200 rounded px-2 py-1 w-40"
                  disabled={running || saved}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-gray-500">IOA Session ID:</span>
                <input
                  type="text"
                  value={ioaSessionId}
                  onChange={e => setIoaSessionId(e.target.value)}
                  placeholder="Auto-generated if blank"
                  className="text-[11px] border border-gray-200 rounded px-2 py-1 w-36"
                  disabled={running || saved}
                />
              </div>
              <p className="text-[10px] text-gray-400 w-full">
                Both observers must use the same IOA Session ID. Observer 1 records first, then share the ID with Observer 2.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {behaviorTargets.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-red-500" /> Behavior Tracking
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {behaviorTargets.map(bt => {
              const isInterval = bt.measurementType === "interval";
              const isDuration = bt.measurementType === "duration";
              const isLatency = bt.measurementType === "latency";
              const scores = intervalScoresMap[bt.id] || [];
              const intervalPct = scores.length > 0 ? Math.round((scores.filter(Boolean).length / scores.length) * 100) : null;
              const modeLabelMap: Record<string, string> = { partial_interval: "PI", whole_interval: "WI", momentary_time_sampling: "MTS" };
              const modeLabel = isInterval && bt.intervalMode
                ? modeLabelMap[bt.intervalMode] ?? null
                : null;

              /* ── Duration helpers ── */
              const dBouts = durationBoutsMap[bt.id] || [];
              const dStartedAt = durationStartedAtMap[bt.id] ?? null;
              const dRunning = dStartedAt !== null;
              const dCurrentBout = dRunning ? Math.round((Date.now() - dStartedAt!) / 1000) : 0;
              const dTotal = dBouts.reduce((a, b) => a + b, 0);
              const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

              /* ── Latency helpers ── */
              const lTrials = latencyTrialsMap[bt.id] || [];
              const lPhase = latencyPhaseMap[bt.id] ?? "idle";
              const lStartedAt = latencyStartedAtMap[bt.id] ?? null;
              const lLiveSec = lPhase === "running" && lStartedAt
                ? parseFloat(((Date.now() - lStartedAt) / 1000).toFixed(1))
                : 0;
              const lMean = lTrials.length > 0
                ? parseFloat((lTrials.reduce((a, b) => a + b, 0) / lTrials.length).toFixed(1))
                : null;

              return (
                <Card key={bt.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    {isDuration ? (
                      /* ── Duration Stopwatch ── */
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-gray-700">{bt.name}</p>
                            <p className="text-[10px] text-gray-400">Duration · Goal: {bt.goalValue ?? "—"}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-amber-700 tabular-nums">{fmtSec(dTotal)}</p>
                            <p className="text-[10px] text-amber-500">total{dBouts.length > 0 ? ` · ${dBouts.length} bout${dBouts.length !== 1 ? "s" : ""}` : ""}</p>
                          </div>
                        </div>
                        {dRunning && (
                          <p className="text-center text-2xl font-bold text-red-500 tabular-nums animate-pulse">{fmtSec(dCurrentBout)}</p>
                        )}
                        {dBouts.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {dBouts.map((b, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-mono">{fmtSec(b)}</span>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button
                            className={`flex-1 h-10 rounded-lg font-semibold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] ${
                              dRunning ? "bg-red-500 text-white" : "bg-amber-600 text-white"
                            }`}
                            disabled={!running}
                            onClick={() => {
                              if (dRunning && dStartedAt) {
                                const dur = Math.round((Date.now() - dStartedAt) / 1000);
                                setDurationBoutsMap(p => ({ ...p, [bt.id]: [...(p[bt.id] || []), dur] }));
                                setDurationStartedAtMap(p => ({ ...p, [bt.id]: null }));
                              } else {
                                setDurationStartedAtMap(p => ({ ...p, [bt.id]: Date.now() }));
                              }
                            }}
                          >
                            {dRunning ? <><Square className="w-3.5 h-3.5" /> Stop Bout</> : <><Play className="w-3.5 h-3.5" /> {dBouts.length > 0 ? "Next Bout" : "Start"}</>}
                          </button>
                          {!dRunning && dBouts.length > 0 && (
                            <button
                              className="h-10 px-3 rounded-lg bg-gray-100 text-gray-500 text-xs font-medium active:scale-[0.97] hover:bg-gray-200"
                              onClick={() => {
                                const newBouts = dBouts.slice(0, -1);
                                setDurationBoutsMap(p => ({ ...p, [bt.id]: newBouts }));
                              }}
                            >Undo</button>
                          )}
                        </div>
                      </div>
                    ) : isLatency ? (
                      /* ── Latency Trial Capture ── */
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-gray-700">{bt.name}</p>
                            <p className="text-[10px] text-gray-400">Latency · Goal: {bt.goalValue ?? "—"}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-amber-700 tabular-nums">{lMean !== null ? `${lMean}s` : "—"}</p>
                            <p className="text-[10px] text-amber-500">mean{lTrials.length > 0 ? ` · ${lTrials.length} trial${lTrials.length !== 1 ? "s" : ""}` : ""}</p>
                          </div>
                        </div>
                        {lPhase === "running" && (
                          <p className="text-center text-2xl font-bold text-red-500 tabular-nums">{lLiveSec}s elapsed…</p>
                        )}
                        {lTrials.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {lTrials.map((t, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-mono">{t}s</span>
                            ))}
                          </div>
                        )}
                        {lPhase === "idle" ? (
                          <button
                            className="w-full h-10 rounded-lg bg-amber-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 active:scale-[0.97]"
                            disabled={!running}
                            onClick={() => {
                              setLatencyPhaseMap(p => ({ ...p, [bt.id]: "running" }));
                              setLatencyStartedAtMap(p => ({ ...p, [bt.id]: Date.now() }));
                            }}
                          >
                            <Play className="w-3.5 h-3.5" /> SD Presented — Start Timer
                          </button>
                        ) : (
                          <div className="space-y-1">
                            <button
                              className="w-full h-11 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 active:scale-[0.97]"
                              onClick={() => {
                                if (!lStartedAt) return;
                                const lat = parseFloat(((Date.now() - lStartedAt) / 1000).toFixed(1));
                                setLatencyTrialsMap(p => ({ ...p, [bt.id]: [...(p[bt.id] || []), lat] }));
                                setLatencyPhaseMap(p => ({ ...p, [bt.id]: "idle" }));
                                setLatencyStartedAtMap(p => ({ ...p, [bt.id]: null }));
                              }}
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Response — Record Latency
                            </button>
                            <button
                              className="w-full h-7 rounded-md bg-gray-100 text-gray-500 text-[10px] font-medium active:scale-[0.97]"
                              onClick={() => {
                                setLatencyPhaseMap(p => ({ ...p, [bt.id]: "idle" }));
                                setLatencyStartedAtMap(p => ({ ...p, [bt.id]: null }));
                              }}
                            >Cancel trial</button>
                          </div>
                        )}
                        {lPhase === "idle" && lTrials.length > 0 && (
                          <button
                            className="text-[10px] text-gray-400 hover:text-gray-600 underline"
                            onClick={() => {
                              setLatencyTrialsMap(p => ({ ...p, [bt.id]: (p[bt.id] || []).slice(0, -1) }));
                            }}
                          >Undo last trial</button>
                        )}
                      </div>
                    ) : !isInterval ? (
                      /* ── Frequency / Percentage ── */
                      <div className="flex items-center">
                        <div className="flex-1 p-3 md:p-4 min-w-0">
                          <p className="text-sm font-semibold text-gray-700 truncate">{bt.name}</p>
                          <p className="text-[10px] text-gray-400">{measureLabel(bt.measurementType)} · Goal: {bt.goalValue ?? "—"}</p>
                        </div>
                        <div className="flex items-center gap-0 border-l border-gray-100">
                          <button
                            className="w-12 h-16 md:w-10 md:h-14 flex items-center justify-center text-gray-400 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                            onClick={() => {
                              setBehaviorCounts(prev => ({ ...prev, [bt.id]: Math.max(0, (prev[bt.id] ?? 0) - 1) }));
                              if (isIoaSession) {
                                setEventTimestamps(prev => {
                                  const arr = [...(prev[bt.id] || [])];
                                  arr.pop();
                                  return { ...prev, [bt.id]: arr };
                                });
                              }
                            }}
                            disabled={!running}
                          >
                            <Minus className="w-5 h-5" />
                          </button>
                          <div className="w-14 md:w-12 text-center">
                            <p className="text-2xl md:text-xl font-bold text-emerald-700">{behaviorCounts[bt.id] ?? 0}</p>
                          </div>
                          <button
                            className="w-12 h-16 md:w-10 md:h-14 flex items-center justify-center text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100 transition-colors"
                            onClick={() => {
                              setBehaviorCounts(prev => ({ ...prev, [bt.id]: (prev[bt.id] ?? 0) + 1 }));
                              if (isIoaSession) {
                                setIoaObservedTargets(prev => ({ ...prev, [bt.id]: true }));
                                setEventTimestamps(prev => ({
                                  ...prev,
                                  [bt.id]: [...(prev[bt.id] || []), Date.now()]
                                }));
                              }
                            }}
                            disabled={!running}
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── Interval Recording ── */
                      <div className="p-3 md:p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-gray-700 truncate">{bt.name}</p>
                            <p className="text-[10px] text-gray-400">
                              {measureLabel(bt.measurementType, bt.intervalMode)} · Goal: {bt.goalValue ?? "—"}
                              {bt.intervalLengthSeconds ? ` · ${bt.intervalLengthSeconds}s intervals` : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {modeLabel && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{modeLabel}</span>
                            )}
                            {intervalPct !== null && (
                              <span className="text-lg font-bold text-emerald-700">{intervalPct}%</span>
                            )}
                          </div>
                        </div>

                        {bt.intervalMode && (
                          <p className="text-[10px] text-gray-400 italic">
                            {bt.intervalMode === "partial_interval" && "Score + if behavior occurred at any point"}
                            {bt.intervalMode === "whole_interval" && "Score + only if behavior was present the entire interval"}
                            {bt.intervalMode === "momentary_time_sampling" && "Score + only if behavior is occurring at end of interval"}
                          </p>
                        )}

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {scores.map((score, idx) => (
                            <button
                              key={idx}
                              disabled={!running}
                              onClick={() => {
                                setIntervalScoresMap(prev => {
                                  const arr = [...(prev[bt.id] || [])];
                                  arr[idx] = !arr[idx];
                                  return { ...prev, [bt.id]: arr };
                                });
                              }}
                              className={`w-6 h-6 text-[9px] font-bold rounded border transition-colors ${score ? "bg-emerald-100 border-emerald-300 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-400"}`}
                              title={`Interval ${idx + 1}: tap to toggle`}
                            >
                              {score ? "+" : "−"}
                            </button>
                          ))}
                        </div>

                        <div className="flex gap-1.5">
                          <button
                            disabled={!running}
                            onClick={() => {
                              setIntervalScoresMap(prev => ({ ...prev, [bt.id]: [...(prev[bt.id] || []), true] }));
                            }}
                            className="flex-1 h-9 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-semibold text-[11px] active:scale-[0.97] disabled:opacity-40 transition-all"
                          >
                            + Present
                          </button>
                          <button
                            disabled={!running}
                            onClick={() => {
                              setIntervalScoresMap(prev => ({ ...prev, [bt.id]: [...(prev[bt.id] || []), false] }));
                            }}
                            className="flex-1 h-9 rounded-lg bg-gray-50 border border-gray-200 text-gray-600 font-semibold text-[11px] active:scale-[0.97] disabled:opacity-40 transition-all"
                          >
                            − Absent
                          </button>
                          <button
                            disabled={!running || scores.length === 0}
                            onClick={() => {
                              setIntervalScoresMap(prev => {
                                const arr = [...(prev[bt.id] || [])];
                                arr.pop();
                                return { ...prev, [bt.id]: arr };
                              });
                            }}
                            className="h-9 px-2.5 rounded-lg bg-gray-50 border border-gray-200 text-gray-400 font-semibold text-[11px] active:scale-[0.97] disabled:opacity-30"
                          >
                            Undo
                          </button>
                        </div>
                        <p className="text-[9px] text-gray-400">
                          {scores.length} interval{scores.length !== 1 ? "s" : ""} recorded · tap squares to toggle
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {programTargets.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4 text-emerald-600" /> Discrete Trial Data
          </h3>
          <div className="space-y-2">
            {programTargets.map(pt => {
              const result = programResults[pt.id] ?? { correct: 0, total: 0, prompted: 0, promptLevel: "verbal" };
              const pct = result.total > 0 ? Math.round((result.correct / result.total) * 100) : null;
              const promptInfo = PROMPT_LABELS[result.promptLevel ?? "verbal"];

              return (
                <Card key={pt.id}>
                  <CardContent className="p-3.5 md:p-4">
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-700 truncate">{pt.name}</p>
                        <p className="text-[10px] text-gray-400">{pt.domain || "General"} · Step {pt.currentStep ?? 1}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${promptInfo?.color ?? "bg-gray-100 text-gray-600"}`}>
                          {promptInfo?.short ?? "?"}
                        </span>
                        {pct !== null && (
                          <span className={`text-sm font-bold ${pct >= (pt.masteryCriterionPercent ?? 80) ? "text-emerald-600" : "text-gray-600"}`}>
                            {pct}%
                          </span>
                        )}
                      </div>
                    </div>

                    {pt.tutorInstructions && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 mb-3 text-[11px] text-amber-800">
                        <BookOpen className="w-3 h-3 inline mr-1" /> {pt.tutorInstructions}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 mb-3 overflow-x-auto">
                      {(pt.promptHierarchy ?? []).map(level => (
                        <button
                          key={level}
                          onClick={() => setProgramResults(prev => ({ ...prev, [pt.id]: { ...prev[pt.id], promptLevel: level } }))}
                          className={`text-[10px] font-semibold px-2 py-1 rounded transition-all whitespace-nowrap ${
                            result.promptLevel === level
                              ? PROMPT_LABELS[level]?.color ?? "bg-gray-800 text-white"
                              : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                          }`}
                        >
                          {PROMPT_LABELS[level]?.short ?? level.slice(0, 2).toUpperCase()}
                        </button>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <button
                        className="flex-1 h-14 md:h-12 rounded-xl bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 border-2 border-emerald-200 text-emerald-700 font-bold text-sm transition-all flex items-center justify-center gap-2"
                        onClick={() => recordTrial(pt.id, true, false)}
                        disabled={!running}
                      >
                        <Check className="w-5 h-5" /> Correct
                      </button>
                      <button
                        className="flex-1 h-14 md:h-12 rounded-xl bg-amber-50 hover:bg-amber-100 active:bg-amber-200 border-2 border-amber-200 text-amber-700 font-bold text-sm transition-all flex items-center justify-center gap-2"
                        onClick={() => recordTrial(pt.id, true, true)}
                        disabled={!running}
                      >
                        <Hand className="w-5 h-5" /> Prompted
                      </button>
                      <button
                        className="flex-1 h-14 md:h-12 rounded-xl bg-red-50 hover:bg-red-100 active:bg-red-200 border-2 border-red-200 text-red-600 font-bold text-sm transition-all flex items-center justify-center gap-2"
                        onClick={() => recordTrial(pt.id, false, false)}
                        disabled={!running}
                      >
                        <X className="w-5 h-5" /> Incorrect
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
                      <span>{result.correct}/{result.total} correct · {result.prompted} prompted</span>
                      {result.total > 0 && (
                        <button className="text-red-400 hover:text-red-600" onClick={() => undoLastTrial(pt.id)}>
                          <RotateCcw className="w-3 h-3" /> Undo
                        </button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {behaviorTargets.length === 0 && programTargets.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="font-medium">No targets set up for this student</p>
          <p className="text-sm mt-1">Add behavior or program targets first from the other tabs</p>
        </div>
      )}
    </div>
  );
}
