import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  MapPin, ChevronRight, Plus, Minus, X, BookOpen, Save,
  Activity, GraduationCap, Shield,
} from "lucide-react";
import type {
  ActiveSession, BehaviorTally, StudentTargets, TrialResult,
} from "./types";
import { formatDuration } from "./constants";
import { ProgramTrialPanel } from "./ProgramTrialPanel";

export function SessionView({
  session, elapsed, notes, onNotesChange, targets, trials, tallies,
  onAddTrial, onUpdateTally, onStop, onCancel, onViewGoals, onViewBip, saving,
  activeProgram, onSetActiveProgram,
}: {
  session: ActiveSession;
  elapsed: number;
  notes: string;
  onNotesChange: (v: string) => void;
  targets: StudentTargets | null;
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
  const [tab, setTab] = useState<"programs" | "behaviors">("programs");

  if (activeProgram && targets) {
    const prog = targets.programs.find(p => p.id === activeProgram);
    if (prog) {
      return (
        <ProgramTrialPanel
          program={prog}
          trials={trials}
          onBack={() => onSetActiveProgram(null)}
          onAddTrial={onAddTrial}
        />
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
