import { useState, useCallback, useEffect, useRef } from "react";
import { Plus, Minus, Play, Square, Clock, Hash, Timer, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import type { CollectedBehaviorData } from "./types";
import type { IntervalMode } from "../../pages/program-data/constants";
import { INTERVAL_MODE_CONFIG } from "../../pages/program-data/constants";

interface Props {
  targetName: string;
  measurementType: string;
  intervalMode?: IntervalMode | null;
  intervalLengthSeconds?: number | null;
  data: CollectedBehaviorData;
  onChange: (data: CollectedBehaviorData) => void;
  sessionRunning?: boolean;
}

function FrequencyCounter({ data, onChange, targetName }: { data: CollectedBehaviorData; onChange: (d: CollectedBehaviorData) => void; targetName: string }) {
  const increment = useCallback(() => {
    onChange({ ...data, value: data.value + 1, eventTimestamps: [...data.eventTimestamps, Date.now()] });
  }, [data, onChange]);

  const decrement = useCallback(() => {
    if (data.value <= 0) return;
    onChange({ ...data, value: data.value - 1, eventTimestamps: data.eventTimestamps.slice(0, -1) });
  }, [data, onChange]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hash className="w-4 h-4 text-amber-600" />
          <span className="text-xs font-semibold text-amber-700 uppercase">Frequency Count</span>
        </div>
        <span className="text-[10px] text-gray-400">{targetName}</span>
      </div>
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={decrement}
          disabled={data.value <= 0}
          className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-600 flex items-center justify-center active:scale-95 transition-all disabled:opacity-30 hover:bg-gray-200"
        >
          <Minus className="w-6 h-6" />
        </button>
        <div className="w-24 h-24 rounded-3xl bg-amber-50 border-2 border-amber-200 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-amber-700 tabular-nums">{data.value}</span>
          <span className="text-[9px] text-amber-500 uppercase font-medium">count</span>
        </div>
        <button
          onClick={increment}
          className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center active:scale-90 transition-all hover:bg-amber-200 shadow-sm"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
      <button
        onClick={increment}
        className="w-full h-12 rounded-xl bg-amber-600 text-white font-semibold text-sm active:scale-[0.97] transition-all hover:bg-amber-700 shadow-md"
      >
        Tap to Count
      </button>
    </div>
  );
}

function DurationTracker({ data, onChange }: { data: CollectedBehaviorData; onChange: (d: CollectedBehaviorData) => void }) {
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const tickRef = useRef<any>(null);

  const bouts: number[] = data.eventTimestamps;

  useEffect(() => {
    if (running) {
      tickRef.current = setInterval(() => {
        setLiveElapsed(startedAt ? Math.round((Date.now() - startedAt) / 1000) : 0);
      }, 250);
    } else {
      clearInterval(tickRef.current);
      setLiveElapsed(0);
    }
    return () => clearInterval(tickRef.current);
  }, [running, startedAt]);

  const toggleTimer = useCallback(() => {
    if (running && startedAt) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      const newBouts = [...bouts, elapsed];
      const newTotal = newBouts.reduce((a, b) => a + b, 0);
      onChange({ ...data, value: newTotal, eventTimestamps: newBouts });
      setRunning(false);
      setStartedAt(null);
    } else {
      setRunning(true);
      setStartedAt(Date.now());
    }
  }, [running, startedAt, data, onChange, bouts]);

  const undoLastBout = useCallback(() => {
    if (bouts.length === 0) return;
    const newBouts = bouts.slice(0, -1);
    const newTotal = newBouts.reduce((a, b) => a + b, 0);
    onChange({ ...data, value: newTotal, eventTimestamps: newBouts });
  }, [bouts, data, onChange]);

  const formatSec = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  const totalSec = data.value;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-600" />
          <span className="text-xs font-semibold text-amber-700 uppercase">Duration</span>
        </div>
        {bouts.length > 0 && (
          <span className="text-[10px] text-gray-400">{bouts.length} bout{bouts.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      <div className="flex items-center justify-center gap-6">
        <div className="text-center">
          <p className="text-3xl font-bold text-amber-700 tabular-nums">{formatSec(totalSec)}</p>
          <p className="text-[10px] text-amber-500">total</p>
        </div>
        {running && (
          <div className="text-center">
            <p className="text-2xl font-bold text-red-500 tabular-nums animate-pulse">{formatSec(liveElapsed)}</p>
            <p className="text-[10px] text-red-400">this bout</p>
          </div>
        )}
      </div>

      {bouts.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {bouts.map((b, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-mono">
              {formatSec(b)}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={toggleTimer}
          className={`flex-1 h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all shadow-md ${
            running ? "bg-red-500 text-white hover:bg-red-600" : "bg-amber-600 text-white hover:bg-amber-700"
          }`}
        >
          {running ? <><Square className="w-4 h-4" /> Stop Bout</> : <><Play className="w-4 h-4" /> {bouts.length > 0 ? "Next Bout" : "Start Timer"}</>}
        </button>
        {!running && bouts.length > 0 && (
          <button
            onClick={undoLastBout}
            className="h-12 px-3 rounded-xl bg-gray-100 text-gray-500 font-semibold text-xs active:scale-[0.97] hover:bg-gray-200"
          >
            Undo
          </button>
        )}
      </div>
    </div>
  );
}

function LatencyTracker({ data, onChange }: { data: CollectedBehaviorData; onChange: (d: CollectedBehaviorData) => void }) {
  const [phase, setPhase] = useState<"idle" | "waiting">("idle");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const tickRef = useRef<any>(null);

  const trials: number[] = data.eventTimestamps;
  const mean = trials.length > 0 ? parseFloat((trials.reduce((a, b) => a + b, 0) / trials.length).toFixed(1)) : null;

  useEffect(() => {
    if (phase === "waiting") {
      tickRef.current = setInterval(() => {
        setLiveElapsed(startedAt ? parseFloat(((Date.now() - startedAt) / 1000).toFixed(1)) : 0);
      }, 100);
    } else {
      clearInterval(tickRef.current);
      setLiveElapsed(0);
    }
    return () => clearInterval(tickRef.current);
  }, [phase, startedAt]);

  function sdPresented() {
    setPhase("waiting");
    setStartedAt(Date.now());
  }

  function responseGiven() {
    if (!startedAt) return;
    const latency = parseFloat(((Date.now() - startedAt) / 1000).toFixed(1));
    const newTrials = [...trials, latency];
    const newMean = parseFloat((newTrials.reduce((a, b) => a + b, 0) / newTrials.length).toFixed(1));
    onChange({ ...data, value: newMean, eventTimestamps: newTrials });
    setPhase("idle");
    setStartedAt(null);
  }

  function cancelTrial() {
    setPhase("idle");
    setStartedAt(null);
  }

  function undoLast() {
    if (trials.length === 0) return;
    const newTrials = trials.slice(0, -1);
    const newMean = newTrials.length > 0
      ? parseFloat((newTrials.reduce((a, b) => a + b, 0) / newTrials.length).toFixed(1))
      : 0;
    onChange({ ...data, value: newMean, eventTimestamps: newTrials });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-600" />
          <span className="text-xs font-semibold text-amber-700 uppercase">Latency</span>
        </div>
        {trials.length > 0 && (
          <span className="text-[10px] text-gray-400">{trials.length} trial{trials.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      <div className="flex items-center justify-center gap-6">
        <div className="text-center">
          <p className="text-3xl font-bold text-amber-700 tabular-nums">
            {mean !== null ? `${mean}s` : "—"}
          </p>
          <p className="text-[10px] text-amber-500">mean latency</p>
        </div>
        {phase === "waiting" && (
          <div className="text-center">
            <p className="text-2xl font-bold text-red-500 tabular-nums">{liveElapsed}s</p>
            <p className="text-[10px] text-red-400">running…</p>
          </div>
        )}
      </div>

      {trials.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {trials.map((t, i) => (
            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-mono">
              {t}s
            </span>
          ))}
        </div>
      )}

      {phase === "idle" ? (
        <button
          onClick={sdPresented}
          className="w-full h-12 rounded-xl bg-amber-600 text-white font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] hover:bg-amber-700 shadow-md"
        >
          <Play className="w-4 h-4" /> SD Presented — Start Timer
        </button>
      ) : (
        <div className="space-y-2">
          <button
            onClick={responseGiven}
            className="w-full h-14 rounded-xl bg-emerald-600 text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.97] shadow-md"
          >
            <CheckCircle className="w-5 h-5" /> Response Given — Record Latency
          </button>
          <button
            onClick={cancelTrial}
            className="w-full h-8 rounded-lg bg-gray-100 text-gray-500 text-xs font-medium active:scale-[0.97]"
          >
            Cancel trial (no response / SD withdrawn)
          </button>
        </div>
      )}

      {!phase && trials.length > 0 && (
        <button onClick={undoLast} className="text-[11px] text-gray-400 hover:text-gray-600 underline">
          Undo last trial
        </button>
      )}
      {phase === "idle" && trials.length > 0 && (
        <button onClick={undoLast} className="text-[11px] text-gray-400 hover:text-gray-600 underline">
          Undo last trial
        </button>
      )}
    </div>
  );
}

interface IntervalRecorderProps {
  data: CollectedBehaviorData;
  onChange: (d: CollectedBehaviorData) => void;
  intervalMode: IntervalMode;
  intervalLengthSeconds: number;
  sessionRunning: boolean;
}

function IntervalRecorder({ data, onChange, intervalMode, intervalLengthSeconds, sessionRunning }: IntervalRecorderProps) {
  const modeCfg = INTERVAL_MODE_CONFIG[intervalMode];
  const [timerActive, setTimerActive] = useState(false);
  const [countdown, setCountdown] = useState(intervalLengthSeconds);
  const [waitingForScore, setWaitingForScore] = useState(false);
  const timerRef = useRef<any>(null);

  const scores: boolean[] = data.intervalScores ?? [];
  const total = scores.length;
  const withBehavior = scores.filter(Boolean).length;
  const pct = total > 0 ? Math.round((withBehavior / total) * 100) : 0;

  useEffect(() => {
    if (!sessionRunning && timerActive) {
      clearInterval(timerRef.current);
      setTimerActive(false);
      setWaitingForScore(false);
      setCountdown(intervalLengthSeconds);
    }
  }, [sessionRunning, timerActive, intervalLengthSeconds]);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  function startInterval() {
    if (!sessionRunning) return;
    setTimerActive(true);
    setCountdown(intervalLengthSeconds);
    setWaitingForScore(false);
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setTimerActive(false);
          setWaitingForScore(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function scoreInterval(present: boolean) {
    const newScores = [...scores, present];
    const newWith = newScores.filter(Boolean).length;
    const newPct = Math.round((newWith / newScores.length) * 100);
    onChange({ ...data, intervalScores: newScores, intervalsWith: newWith, intervalCount: newScores.length, value: newPct });
    setWaitingForScore(false);
    setCountdown(intervalLengthSeconds);
  }

  function manualScore(present: boolean) {
    scoreInterval(present);
  }

  function removeLastInterval() {
    if (scores.length === 0) return;
    const newScores = scores.slice(0, -1);
    const newWith = newScores.filter(Boolean).length;
    const newPct = newScores.length > 0 ? Math.round((newWith / newScores.length) * 100) : 0;
    onChange({ ...data, intervalScores: newScores, intervalsWith: newWith, intervalCount: newScores.length, value: newPct });
  }

  const progressPct = timerActive ? ((intervalLengthSeconds - countdown) / intervalLengthSeconds) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-amber-600" />
          <span className="text-xs font-semibold text-amber-700 uppercase">Interval Recording</span>
        </div>
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${modeCfg.color}`}>
          {modeCfg.abbrev}
        </span>
      </div>

      <p className="text-[11px] text-gray-500">{modeCfg.description}</p>

      <div className="text-center">
        <p className="text-3xl font-bold text-amber-700 tabular-nums">{withBehavior}/{total}</p>
        <p className="text-sm text-amber-500">{pct}% of intervals</p>
      </div>

      {timerActive && (
        <div className="space-y-2">
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className="h-3 rounded-full bg-amber-400 transition-all duration-1000 ease-linear"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-700 tabular-nums">{countdown}s</p>
            <p className="text-[10px] text-gray-400">remaining in interval {total + 1}</p>
          </div>
        </div>
      )}

      {waitingForScore && (
        <div className={`rounded-xl border-2 p-3 space-y-2 ${modeCfg.color}`}>
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p className="text-[12px] font-semibold">{modeCfg.prompt}</p>
          </div>
          <p className="text-[10px] opacity-75">Interval {total + 1}</p>
          <div className="flex gap-2">
            <button
              onClick={() => scoreInterval(true)}
              className="flex-1 h-12 rounded-xl bg-emerald-600 text-white font-bold text-sm flex items-center justify-center gap-1.5 active:scale-[0.97] shadow-md"
            >
              <CheckCircle className="w-4 h-4" /> Yes (+)
            </button>
            <button
              onClick={() => scoreInterval(false)}
              className="flex-1 h-12 rounded-xl bg-gray-200 text-gray-700 font-bold text-sm flex items-center justify-center gap-1.5 active:scale-[0.97]"
            >
              <XCircle className="w-4 h-4" /> No (−)
            </button>
          </div>
        </div>
      )}

      {!timerActive && !waitingForScore && (
        <div className="space-y-2">
          <button
            onClick={startInterval}
            disabled={!sessionRunning}
            className="w-full h-11 rounded-xl bg-amber-600 text-white font-semibold text-sm active:scale-[0.97] transition-all hover:bg-amber-700 shadow-md disabled:opacity-40"
          >
            ▶ Start {intervalLengthSeconds}s Interval {total > 0 ? `(#${total + 1})` : ""}
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => manualScore(true)}
              disabled={!sessionRunning}
              className="flex-1 h-9 rounded-lg bg-emerald-50 text-emerald-700 font-semibold text-[12px] border border-emerald-200 active:scale-[0.97] disabled:opacity-40"
              title="Manually record interval as + (behavior present)"
            >
              Manual +
            </button>
            <button
              onClick={() => manualScore(false)}
              disabled={!sessionRunning}
              className="flex-1 h-9 rounded-lg bg-gray-50 text-gray-600 font-semibold text-[12px] border border-gray-200 active:scale-[0.97] disabled:opacity-40"
              title="Manually record interval as − (behavior absent)"
            >
              Manual −
            </button>
            <button
              onClick={removeLastInterval}
              disabled={scores.length === 0}
              className="h-9 px-3 rounded-lg bg-gray-50 text-gray-400 font-semibold text-[12px] border border-gray-200 active:scale-[0.97] disabled:opacity-30"
              title="Undo last interval"
            >
              Undo
            </button>
          </div>
        </div>
      )}

      {scores.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {scores.map((score, idx) => (
            <div
              key={idx}
              className={`w-6 h-6 rounded text-[9px] font-bold flex items-center justify-center border ${
                score ? "bg-emerald-100 border-emerald-300 text-emerald-700" : "bg-gray-100 border-gray-200 text-gray-400"
              }`}
              title={`Interval ${idx + 1}: ${score ? "+" : "−"}`}
            >
              {score ? "+" : "−"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LegacyIntervalRecorder({ data, onChange }: { data: CollectedBehaviorData; onChange: (d: CollectedBehaviorData) => void }) {
  const intervals = data.intervalCount || 10;
  const scored = data.intervalsWith || 0;

  const setIntervalCount = (n: number) => {
    onChange({ ...data, intervalCount: Math.max(1, n), intervalsWith: Math.min(scored, Math.max(1, n)) });
  };

  const toggleInterval = () => {
    const newScored = Math.min(scored + 1, intervals);
    onChange({ ...data, intervalsWith: newScored, value: Math.round((newScored / intervals) * 100) });
  };

  const undoInterval = () => {
    const newScored = Math.max(0, scored - 1);
    onChange({ ...data, intervalsWith: newScored, value: Math.round((newScored / intervals) * 100) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-amber-600" />
          <span className="text-xs font-semibold text-amber-700 uppercase">Interval Recording</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-gray-500">Intervals:</span>
          <input
            type="number"
            min={1}
            max={60}
            value={intervals}
            onChange={e => setIntervalCount(Number(e.target.value))}
            className="w-12 h-6 text-xs text-center border border-gray-200 rounded"
          />
        </div>
      </div>
      <div className="text-center">
        <p className="text-3xl font-bold text-amber-700 tabular-nums">{scored}/{intervals}</p>
        <p className="text-sm text-amber-500">{data.value}% of intervals</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={undoInterval}
          disabled={scored <= 0}
          className="flex-1 h-11 rounded-xl bg-gray-100 text-gray-600 font-semibold text-sm active:scale-[0.97] transition-all disabled:opacity-30"
        >
          Undo
        </button>
        <button
          onClick={toggleInterval}
          disabled={scored >= intervals}
          className="flex-[2] h-11 rounded-xl bg-amber-600 text-white font-semibold text-sm active:scale-[0.97] transition-all hover:bg-amber-700 shadow-md disabled:opacity-30"
        >
          Mark Interval (+)
        </button>
      </div>
    </div>
  );
}

export function BehaviorWidget({ targetName, measurementType, intervalMode, intervalLengthSeconds, data, onChange, sessionRunning = true }: Props) {
  const notes = data.notes;

  if (measurementType === "duration") {
    return (
      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 space-y-3">
        <DurationTracker data={data} onChange={onChange} />
        <input
          className="w-full h-8 px-3 text-xs border border-amber-200 rounded-lg bg-white placeholder-gray-400"
          placeholder="Notes..."
          value={notes}
          onChange={e => onChange({ ...data, notes: e.target.value })}
        />
      </div>
    );
  }

  if (measurementType === "latency") {
    return (
      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 space-y-3">
        <LatencyTracker data={data} onChange={onChange} />
        <input
          className="w-full h-8 px-3 text-xs border border-amber-200 rounded-lg bg-white placeholder-gray-400"
          placeholder="Notes..."
          value={notes}
          onChange={e => onChange({ ...data, notes: e.target.value })}
        />
      </div>
    );
  }

  if (measurementType === "interval") {
    const effectiveMode: IntervalMode = (intervalMode && INTERVAL_MODE_CONFIG[intervalMode]) ? intervalMode : "partial_interval";
    const effectiveLength = intervalLengthSeconds && intervalLengthSeconds > 0 ? intervalLengthSeconds : null;

    return (
      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 space-y-3">
        {effectiveLength ? (
          <IntervalRecorder
            data={data}
            onChange={onChange}
            intervalMode={effectiveMode}
            intervalLengthSeconds={effectiveLength}
            sessionRunning={sessionRunning}
          />
        ) : (
          <LegacyIntervalRecorder data={data} onChange={onChange} />
        )}
        <input
          className="w-full h-8 px-3 text-xs border border-amber-200 rounded-lg bg-white placeholder-gray-400"
          placeholder="Notes..."
          value={notes}
          onChange={e => onChange({ ...data, notes: e.target.value })}
        />
      </div>
    );
  }

  if (measurementType === "percentage") {
    return (
      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 space-y-3">
        <LegacyIntervalRecorder data={data} onChange={onChange} />
        <input
          className="w-full h-8 px-3 text-xs border border-amber-200 rounded-lg bg-white placeholder-gray-400"
          placeholder="Notes..."
          value={notes}
          onChange={e => onChange({ ...data, notes: e.target.value })}
        />
      </div>
    );
  }

  return (
    <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 space-y-3">
      <FrequencyCounter data={data} onChange={onChange} targetName={targetName} />
      <input
        className="w-full h-8 px-3 text-xs border border-amber-200 rounded-lg bg-white placeholder-gray-400"
        placeholder="Notes..."
        value={notes}
        onChange={e => onChange({ ...data, notes: e.target.value })}
      />
    </div>
  );
}
