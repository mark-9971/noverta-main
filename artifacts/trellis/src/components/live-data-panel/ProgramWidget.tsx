import { useCallback } from "react";
import { Check, X, BarChart3 } from "lucide-react";
import type { CollectedProgramData } from "./types";

const PROMPT_LEVELS = [
  { value: "independent", label: "Independent", short: "IND", color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "verbal", label: "Verbal", short: "V", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { value: "gestural", label: "Gestural", short: "G", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { value: "model", label: "Model", short: "M", color: "bg-purple-100 text-purple-700 border-purple-200" },
  { value: "partial_physical", label: "Partial Physical", short: "PP", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "full_physical", label: "Full Physical", short: "FP", color: "bg-red-100 text-red-700 border-red-200" },
];

interface Props {
  targetName: string;
  data: CollectedProgramData;
  onChange: (data: CollectedProgramData) => void;
}

export function ProgramWidget({ targetName, data, onChange }: Props) {
  const pct = data.trialsTotal > 0 ? Math.round((data.trialsCorrect / data.trialsTotal) * 100) : 0;

  const markCorrect = useCallback(() => {
    onChange({ ...data, trialsCorrect: data.trialsCorrect + 1, trialsTotal: data.trialsTotal + 1, trialHistory: [...(data.trialHistory || []), "correct"] });
  }, [data, onChange]);

  const markIncorrect = useCallback(() => {
    onChange({ ...data, trialsTotal: data.trialsTotal + 1, trialHistory: [...(data.trialHistory || []), "incorrect"] });
  }, [data, onChange]);

  const undoLast = useCallback(() => {
    const history = data.trialHistory || [];
    if (history.length === 0) return;
    const last = history[history.length - 1];
    onChange({
      ...data,
      trialsCorrect: last === "correct" ? data.trialsCorrect - 1 : data.trialsCorrect,
      trialsTotal: data.trialsTotal - 1,
      trialHistory: history.slice(0, -1),
    });
  }, [data, onChange]);

  const pctColor = pct >= 80 ? "text-emerald-600" : pct >= 50 ? "text-amber-600" : "text-red-500";

  return (
    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-semibold text-blue-700 uppercase">Trial Data</span>
        </div>
        <span className="text-[10px] text-gray-400 truncate max-w-[40%]">{targetName}</span>
      </div>

      <div className="flex items-center justify-center gap-6">
        <div className="text-center">
          <p className={`text-4xl font-bold tabular-nums ${pctColor}`}>{pct}%</p>
          <p className="text-[10px] text-gray-500">{data.trialsCorrect} / {data.trialsTotal} trials</p>
        </div>
      </div>

      <div className="w-full h-2 bg-blue-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={markCorrect}
          className="flex-1 h-14 rounded-xl bg-emerald-500 text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.95] transition-all hover:bg-emerald-600 shadow-md"
        >
          <Check className="w-5 h-5" strokeWidth={3} />
          Correct
        </button>
        <button
          onClick={markIncorrect}
          className="flex-1 h-14 rounded-xl bg-red-400 text-white font-bold text-base flex items-center justify-center gap-2 active:scale-[0.95] transition-all hover:bg-red-500 shadow-md"
        >
          <X className="w-5 h-5" strokeWidth={3} />
          Incorrect
        </button>
      </div>

      {(data.trialHistory || []).length > 0 && (
        <button
          onClick={undoLast}
          className="w-full h-8 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Undo last trial
        </button>
      )}

      <div>
        <p className="text-[10px] text-blue-600 font-semibold uppercase mb-1.5">Prompt Level</p>
        <div className="flex flex-wrap gap-1.5">
          {PROMPT_LEVELS.map(pl => (
            <button
              key={pl.value}
              onClick={() => onChange({ ...data, promptLevelUsed: pl.value })}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                data.promptLevelUsed === pl.value
                  ? `${pl.color} ring-2 ring-offset-1 ring-blue-300`
                  : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              }`}
            >
              {pl.short}
            </button>
          ))}
        </div>
      </div>

      <input
        className="w-full h-8 px-3 text-xs border border-blue-200 rounded-lg bg-white placeholder-gray-400"
        placeholder="Notes..."
        value={data.notes}
        onChange={e => onChange({ ...data, notes: e.target.value })}
      />
    </div>
  );
}
