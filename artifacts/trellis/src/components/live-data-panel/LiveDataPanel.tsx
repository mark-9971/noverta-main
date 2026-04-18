import { useState, useEffect, useCallback, useMemo } from "react";
import { X, ChevronDown, ChevronUp, Target, Layers, CheckSquare, Square, Activity, BarChart3, FileText, Clock } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { BehaviorWidget } from "./BehaviorWidget";
import { ProgramWidget } from "./ProgramWidget";
import { GoalNotesWidget } from "./GoalNotesWidget";
import type { IepGoal, CollectedGoalEntry } from "./types";
import { createCollectedEntry, createDefaultBehaviorData, createDefaultProgramData } from "./types";

interface Props {
  studentId: number;
  studentName: string;
  timerStartedAt: number;
  onClose: () => void;
  collectedEntries: Map<number, CollectedGoalEntry>;
  onEntriesChange: (entries: Map<number, CollectedGoalEntry>) => void;
}

function TimerDisplay({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const elapsed = now - startedAt;
  const h = Math.floor(elapsed / 3600000);
  const m = Math.floor((elapsed % 3600000) / 60000);
  const s = Math.floor((elapsed % 60000) / 1000);
  const fmt = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
      <span className="font-mono text-lg font-bold tabular-nums text-emerald-700">{fmt}</span>
    </div>
  );
}

type GoalCategory = "all" | "Academic" | "Behavior" | "Social" | "Communication" | "Motor" | "Other";

export function LiveDataPanel({ studentId, studentName, timerStartedAt, onClose, collectedEntries, onEntriesChange }: Props) {
  const [goals, setGoals] = useState<IepGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<GoalCategory>("all");
  const [showGoalPicker, setShowGoalPicker] = useState(true);
  const [expandedGoals, setExpandedGoals] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    authFetch(`/api/students/${studentId}/iep-goals?active=true`)
      .then(r => r.json())
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? data as IepGoal[] : [];
        setGoals(arr);
        if (collectedEntries.size > 0) {
          setShowGoalPicker(false);
          setExpandedGoals(new Set(collectedEntries.keys()));
        }
      })
      .catch(() => toast.error("Failed to load goals"))
      .finally(() => setLoading(false));
  }, [studentId]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    goals.forEach(g => cats.add(g.goalArea));
    return Array.from(cats).sort();
  }, [goals]);

  const filteredGoals = useMemo(() => {
    if (filter === "all") return goals;
    return goals.filter(g => g.goalArea === filter);
  }, [goals, filter]);

  const selectedCount = collectedEntries.size;

  const toggleGoal = useCallback((goal: IepGoal) => {
    const next = new Map(collectedEntries);
    if (next.has(goal.id)) {
      next.delete(goal.id);
      setExpandedGoals(prev => { const s = new Set(prev); s.delete(goal.id); return s; });
    } else {
      next.set(goal.id, createCollectedEntry(goal));
      setExpandedGoals(prev => new Set(prev).add(goal.id));
    }
    onEntriesChange(next);
  }, [collectedEntries, onEntriesChange]);

  const selectAll = useCallback(() => {
    const next = new Map(collectedEntries);
    const targets = filter === "all" ? goals : filteredGoals;
    targets.forEach(g => {
      if (!next.has(g.id)) next.set(g.id, createCollectedEntry(g));
    });
    setExpandedGoals(new Set(next.keys()));
    onEntriesChange(next);
  }, [goals, filteredGoals, filter, collectedEntries, onEntriesChange]);

  const deselectAll = useCallback(() => {
    const targets = filter === "all" ? goals : filteredGoals;
    const targetIds = new Set(targets.map(g => g.id));
    const next = new Map(collectedEntries);
    targetIds.forEach(id => next.delete(id));
    onEntriesChange(next);
  }, [goals, filteredGoals, filter, collectedEntries, onEntriesChange]);

  const updateEntry = useCallback((goalId: number, updates: Partial<CollectedGoalEntry>) => {
    const next = new Map(collectedEntries);
    const existing = next.get(goalId);
    if (existing) {
      next.set(goalId, { ...existing, ...updates });
      onEntriesChange(next);
    }
  }, [collectedEntries, onEntriesChange]);

  const toggleExpand = (goalId: number) => {
    setExpandedGoals(prev => {
      const s = new Set(prev);
      if (s.has(goalId)) s.delete(goalId); else s.add(goalId);
      return s;
    });
  };

  const getGoalIcon = (goal: IepGoal) => {
    if (goal.linkedTarget?.type === "behavior") return <Activity className="w-3.5 h-3.5 text-amber-600" />;
    if (goal.linkedTarget?.type === "program") return <BarChart3 className="w-3.5 h-3.5 text-blue-600" />;
    return <FileText className="w-3.5 h-3.5 text-gray-500" />;
  };

  const getDataSummary = (entry: CollectedGoalEntry): string | null => {
    if (entry.behaviorData) {
      const mt = entry.linkedTarget?.measurementType || "frequency";
      if (mt === "duration" || mt === "latency") return `${entry.behaviorData.value}s`;
      if (mt === "interval" || mt === "percentage") return `${entry.behaviorData.intervalsWith || 0}/${entry.behaviorData.intervalCount || 10}`;
      return `${entry.behaviorData.value} count`;
    }
    if (entry.programData) {
      if (entry.programData.trialsTotal === 0) return null;
      const pct = Math.round((entry.programData.trialsCorrect / entry.programData.trialsTotal) * 100);
      return `${entry.programData.trialsCorrect}/${entry.programData.trialsTotal} (${pct}%)`;
    }
    if (entry.notes) return "Has notes";
    return null;
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-white">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <h2 className="text-base font-bold text-gray-900 truncate">Data Collection</h2>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <p className="text-xs text-gray-500 truncate">{studentName}</p>
              <TimerDisplay startedAt={timerStartedAt} />
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 flex-shrink-0">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
      </div>

      <div className="flex-shrink-0 px-4 py-2 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setShowGoalPicker(!showGoalPicker)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900"
          >
            <Layers className="w-3.5 h-3.5" />
            {showGoalPicker ? "Hide" : "Show"} Goal Picker
            {showGoalPicker ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <span className="text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
            {selectedCount} goal{selectedCount !== 1 ? "s" : ""} tracking
          </span>
        </div>

        {showGoalPicker && (
          <>
            <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
              <button
                onClick={() => setFilter("all")}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all ${
                  filter === "all" ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                All ({goals.length})
              </button>
              {categories.map(cat => {
                const count = goals.filter(g => g.goalArea === cat).length;
                return (
                  <button
                    key={cat}
                    onClick={() => setFilter(cat as GoalCategory)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all ${
                      filter === cat ? "bg-emerald-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 mt-1">
              <button onClick={selectAll} className="text-[10px] text-emerald-600 hover:text-emerald-800 font-semibold">Select All</button>
              <span className="text-gray-300">|</span>
              <button onClick={deselectAll} className="text-[10px] text-gray-400 hover:text-gray-600 font-semibold">Deselect All</button>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Clock className="w-5 h-5 text-gray-300 animate-spin" />
            <span className="ml-2 text-sm text-gray-400">Loading goals...</span>
          </div>
        ) : goals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400">
            <Target className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm">No active IEP goals found</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {showGoalPicker && filteredGoals.map(goal => {
              const isSelected = collectedEntries.has(goal.id);
              return (
                <button
                  key={goal.id}
                  onClick={() => toggleGoal(goal)}
                  className={`w-full flex items-start gap-2.5 p-2.5 rounded-lg text-left transition-all ${
                    isSelected
                      ? "bg-emerald-50 border border-emerald-200"
                      : "bg-white border border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Square className="w-4 h-4 text-gray-300 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {getGoalIcon(goal)}
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600">{goal.goalArea}</span>
                      {goal.linkedTarget && (
                        <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                          goal.linkedTarget.type === "behavior" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {goal.linkedTarget.type === "behavior" ? "Behavior" : "Program"}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-700 leading-snug mt-1 line-clamp-2">{goal.annualGoal}</p>
                  </div>
                </button>
              );
            })}

            {selectedCount > 0 && (
              <div className="space-y-3 pt-2">
                {!showGoalPicker && (
                  <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider px-1">Active Data Collection</p>
                )}
                {Array.from(collectedEntries.entries()).map(([goalId, entry]) => {
                  const isExpanded = expandedGoals.has(goalId);
                  const summary = getDataSummary(entry);
                  return (
                    <div key={goalId} className="rounded-xl border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => toggleExpand(goalId)}
                        className="w-full flex items-center gap-2 p-3 bg-white hover:bg-gray-50 text-left"
                      >
                        {getGoalIcon({ linkedTarget: entry.linkedTarget } as IepGoal)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold text-indigo-600">{entry.goalArea}</span>
                            {summary && (
                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{summary}</span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-600 truncate mt-0.5">{entry.annualGoal}</p>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </button>
                      {isExpanded && (
                        <div className="p-3 border-t border-gray-100 bg-gray-50/50">
                          {entry.behaviorData && entry.linkedTarget?.type === "behavior" && (
                            <BehaviorWidget
                              targetName={entry.linkedTarget.name || ""}
                              measurementType={entry.linkedTarget.measurementType || "frequency"}
                              intervalMode={(entry.linkedTarget.intervalMode as any) ?? null}
                              intervalLengthSeconds={entry.linkedTarget.intervalLengthSeconds ?? null}
                              data={entry.behaviorData}
                              onChange={bd => updateEntry(goalId, { behaviorData: bd })}
                              sessionRunning
                            />
                          )}
                          {entry.programData && entry.linkedTarget?.type === "program" && (
                            <ProgramWidget
                              targetName={entry.linkedTarget.name || ""}
                              data={entry.programData}
                              onChange={pd => updateEntry(goalId, { programData: pd })}
                            />
                          )}
                          {!entry.behaviorData && !entry.programData && (
                            <GoalNotesWidget
                              goalArea={entry.goalArea}
                              notes={entry.notes}
                              onChange={notes => updateEntry(goalId, { notes })}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {selectedCount === 0 && !showGoalPicker && (
              <div className="flex flex-col items-center justify-center h-24 text-gray-400">
                <p className="text-sm">No goals selected yet</p>
                <button onClick={() => setShowGoalPicker(true)} className="text-xs text-emerald-600 font-semibold mt-1 hover:underline">
                  Open goal picker
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
