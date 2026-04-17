import { useState } from "react";
import { ArrowLeft, Check, X } from "lucide-react";
import type { ProgramTarget, TrialResult } from "./types";
import { PROMPT_LEVELS } from "./constants";

export function ProgramTrialPanel({
  program,
  trials,
  onBack,
  onAddTrial,
}: {
  program: ProgramTarget;
  trials: TrialResult[];
  onBack: () => void;
  onAddTrial: (programTargetId: number, correct: boolean, promptLevel: string) => void;
}) {
  const [selectedPrompt, setSelectedPrompt] = useState("independent");

  const progTrials = trials.filter(t => t.programTargetId === program.id);
  const correct = progTrials.filter(t => t.correct).length;
  const total = progTrials.length;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-gray-100 text-gray-600"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-bold text-gray-800 truncate">{program.name}</p>
          <p className="text-[12px] text-gray-400">{program.domain || program.programType}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[20px] font-bold text-emerald-600">
            {total > 0 ? Math.round((correct / total) * 100) : 0}%
          </p>
          <p className="text-[11px] text-gray-400">{correct}/{total} correct</p>
        </div>
      </div>

      {program.tutorInstructions && (
        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
          <p className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Instructions</p>
          <p className="text-[13px] text-gray-600">{program.tutorInstructions}</p>
        </div>
      )}

      {program.steps.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
          <p className="text-[11px] font-semibold text-gray-500 uppercase mb-2">Current Step</p>
          {program.steps.filter(s => !s.mastered).slice(0, 1).map(step => (
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
          onClick={() => onAddTrial(program.id, true, selectedPrompt)}
          className="min-h-[72px] rounded-2xl bg-emerald-50 border-2 border-emerald-200 text-emerald-600 flex flex-col items-center justify-center gap-1 active:bg-emerald-100 transition-colors"
        >
          <Check className="w-8 h-8" />
          <span className="text-[14px] font-bold">Correct</span>
        </button>
        <button
          onClick={() => onAddTrial(program.id, false, selectedPrompt)}
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
