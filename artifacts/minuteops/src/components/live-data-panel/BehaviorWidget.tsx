import { useState, useCallback } from "react";
import { Plus, Minus, Play, Square, Clock, Hash, BarChart } from "lucide-react";
import type { CollectedBehaviorData } from "./types";

interface Props {
  targetName: string;
  measurementType: string;
  data: CollectedBehaviorData;
  onChange: (data: CollectedBehaviorData) => void;
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

  const toggleTimer = useCallback(() => {
    if (running && startedAt) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      onChange({ ...data, value: data.value + elapsed });
      setRunning(false);
      setStartedAt(null);
    } else {
      setRunning(true);
      setStartedAt(Date.now());
    }
  }, [running, startedAt, data, onChange]);

  const formatSec = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-amber-600" />
        <span className="text-xs font-semibold text-amber-700 uppercase">Duration</span>
      </div>
      <div className="flex items-center justify-center gap-4">
        <div className="text-center">
          <p className="text-3xl font-bold text-amber-700 tabular-nums">{formatSec(data.value)}</p>
          <p className="text-[10px] text-amber-500">total recorded</p>
        </div>
      </div>
      <button
        onClick={toggleTimer}
        className={`w-full h-12 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.97] transition-all shadow-md ${
          running ? "bg-red-500 text-white hover:bg-red-600" : "bg-amber-600 text-white hover:bg-amber-700"
        }`}
      >
        {running ? <><Square className="w-4 h-4" /> Stop</> : <><Play className="w-4 h-4" /> Start Duration Timer</>}
      </button>
    </div>
  );
}

function IntervalRecorder({ data, onChange }: { data: CollectedBehaviorData; onChange: (d: CollectedBehaviorData) => void }) {
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
          <BarChart className="w-4 h-4 text-amber-600" />
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

export function BehaviorWidget({ targetName, measurementType, data, onChange }: Props) {
  const notes = data.notes;

  if (measurementType === "duration" || measurementType === "latency") {
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

  if (measurementType === "interval" || measurementType === "percentage") {
    return (
      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 space-y-3">
        <IntervalRecorder data={data} onChange={onChange} />
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
