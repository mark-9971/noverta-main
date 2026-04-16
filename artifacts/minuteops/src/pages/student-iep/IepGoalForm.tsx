import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { createIepGoal } from "@workspace/api-client-react";

export interface IepGoal {
  id: number; studentId: number; goalArea: string; goalNumber: number;
  annualGoal: string; baseline: string | null; targetCriterion: string | null;
  measurementMethod: string | null; scheduleOfReporting: string;
  programTargetId: number | null; behaviorTargetId: number | null;
  serviceArea: string | null; status: string; startDate: string | null;
  endDate: string | null; notes: string | null; active: boolean; benchmarks: string | null;
  linkedTarget?: { type: string; name: string; currentPromptLevel?: string; masteryCriterionPercent?: number; baselineValue?: string; goalValue?: string; measurementType?: string } | null;
}
export interface ProgramTarget { id: number; name: string; domain: string; programType: string; currentPromptLevel: string; masteryCriterionPercent: number; }
export interface BehaviorTarget { id: number; name: string; measurementType: string; baselineValue: string | null; goalValue: string | null; targetDirection: string; }

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function GoalCard({ goal, onUpdated }: { goal: IepGoal; onUpdated: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`transition-shadow ${expanded ? "shadow-sm" : ""}`}>
      <CardContent className="p-3.5 md:p-4">
        <div className="flex items-start gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-700 text-xs font-bold flex-shrink-0">
            {goal.goalNumber}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-gray-700">{goal.annualGoal}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{goal.goalArea}</span>
              {goal.serviceArea && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{goal.serviceArea}</span>}
              {goal.linkedTarget && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  goal.linkedTarget.type === "program" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                }`}>
                  Linked: {goal.linkedTarget.name}
                </span>
              )}
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform flex-shrink-0 ${expanded ? "rotate-90" : ""}`} />
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            {goal.baseline && (
              <div><p className="text-[10px] text-gray-400 uppercase tracking-wider">Baseline</p><p className="text-[12px] text-gray-600">{goal.baseline}</p></div>
            )}
            {goal.targetCriterion && (
              <div><p className="text-[10px] text-gray-400 uppercase tracking-wider">Target Criterion</p><p className="text-[12px] text-gray-600">{goal.targetCriterion}</p></div>
            )}
            {goal.measurementMethod && (
              <div><p className="text-[10px] text-gray-400 uppercase tracking-wider">Measurement Method</p><p className="text-[12px] text-gray-600">{goal.measurementMethod}</p></div>
            )}
            {goal.benchmarks && (
              <div><p className="text-[10px] text-gray-400 uppercase tracking-wider">Benchmarks / Short-Term Objectives</p><p className="text-[12px] text-gray-600 whitespace-pre-line">{goal.benchmarks}</p></div>
            )}
            <div className="flex items-center gap-3 text-[11px] text-gray-400">
              <span>Reporting: {goal.scheduleOfReporting}</span>
              {goal.startDate && <span>Start: {formatDate(goal.startDate)}</span>}
              {goal.endDate && <span>End: {formatDate(goal.endDate)}</span>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AddGoalModal({ studentId, programTargets, behaviorTargets, existingGoals, onClose, onSaved }: {
  studentId: number; programTargets: ProgramTarget[]; behaviorTargets: BehaviorTarget[];
  existingGoals: IepGoal[]; onClose: () => void; onSaved: () => void;
}) {
  const [goalArea, setGoalArea] = useState("Skill Acquisition");
  const [annualGoal, setAnnualGoal] = useState("");
  const [baseline, setBaseline] = useState("");
  const [targetCriterion, setTargetCriterion] = useState("");
  const [measurementMethod, setMeasurementMethod] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [benchmarks, setBenchmarks] = useState("");
  const [linkedType, setLinkedType] = useState<"none" | "program" | "behavior">("none");
  const [linkedId, setLinkedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const existingProgIds = new Set(existingGoals.map(g => g.programTargetId).filter(Boolean));
  const existingBehIds = new Set(existingGoals.map(g => g.behaviorTargetId).filter(Boolean));
  const availablePrograms = programTargets.filter(pt => !existingProgIds.has(pt.id));
  const availableBehaviors = behaviorTargets.filter(bt => !existingBehIds.has(bt.id));

  function selectLinkedTarget(type: "program" | "behavior", id: number) {
    setLinkedType(type);
    setLinkedId(id);
    if (type === "program") {
      const pt = programTargets.find(p => p.id === id);
      if (pt) {
        setGoalArea(pt.domain || "Skill Acquisition");
        setServiceArea(pt.domain || "ABA");
        setAnnualGoal(`${pt.name}: Student will demonstrate mastery at ${pt.masteryCriterionPercent ?? 80}% accuracy across 3 consecutive sessions.`);
        setBaseline(`Current prompt level: ${pt.currentPromptLevel ?? "verbal"}`);
        setTargetCriterion(`${pt.masteryCriterionPercent ?? 80}% across 3 sessions at independent level`);
        setMeasurementMethod(`${pt.programType === "discrete_trial" ? "Discrete trial" : "Task analysis"} data collection`);
      }
    } else {
      const bt = behaviorTargets.find(b => b.id === id);
      if (bt) {
        setGoalArea("Behavior");
        setServiceArea("Behavior");
        const dir = bt.targetDirection === "decrease" ? "reduce" : "increase";
        setAnnualGoal(`${bt.name}: Student will ${dir} ${bt.name.toLowerCase()} from ${bt.baselineValue ?? "baseline"} to ${bt.goalValue ?? "target"}.`);
        setBaseline(`${bt.baselineValue ?? "Not established"} (${bt.measurementType})`);
        setTargetCriterion(`${bt.goalValue ?? "Target"} or ${bt.targetDirection === "decrease" ? "fewer" : "greater"} per session`);
        setMeasurementMethod(`${bt.measurementType} data collection`);
      }
    }
  }

  async function save() {
    if (!annualGoal.trim()) { toast.error("Please enter the annual goal text"); return; }
    setSaving(true);
    try {
      const goalNumber = existingGoals.filter(g => g.goalArea === goalArea).length + 1;
      await createIepGoal(studentId, {
          goalArea, goalNumber, annualGoal: annualGoal.trim(),
          baseline: baseline || null, targetCriterion: targetCriterion || null,
          measurementMethod: measurementMethod || null, serviceArea: serviceArea || null,
          benchmarks: benchmarks || null,
          programTargetId: linkedType === "program" ? linkedId : null,
          behaviorTargetId: linkedType === "behavior" ? linkedId : null,
        });
      toast.success("IEP goal added"); onSaved();
    } catch { toast.error("Failed to save goal"); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 md:p-6 w-full max-w-lg shadow-xl my-auto max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-gray-800">Add IEP Goal</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {(availablePrograms.length > 0 || availableBehaviors.length > 0) && (
          <div className="mb-4">
            <label className="text-[12px] font-medium text-gray-500 mb-1.5 block">Link to Data Target (auto-fills goal details)</label>
            <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {availablePrograms.map(pt => (
                <button key={`p-${pt.id}`} onClick={() => selectLinkedTarget("program", pt.id)}
                  className={`w-full text-left px-2.5 py-2 rounded text-[12px] transition-all ${
                    linkedType === "program" && linkedId === pt.id ? "bg-emerald-50 border border-emerald-200" : "hover:bg-gray-50"
                  }`}>
                  <span className="font-medium text-gray-700">{pt.name}</span>
                  <span className="text-gray-400 ml-1">· Program · {pt.domain || "General"}</span>
                </button>
              ))}
              {availableBehaviors.map(bt => (
                <button key={`b-${bt.id}`} onClick={() => selectLinkedTarget("behavior", bt.id)}
                  className={`w-full text-left px-2.5 py-2 rounded text-[12px] transition-all ${
                    linkedType === "behavior" && linkedId === bt.id ? "bg-emerald-50 border border-emerald-200" : "hover:bg-gray-50"
                  }`}>
                  <span className="font-medium text-gray-700">{bt.name}</span>
                  <span className="text-gray-400 ml-1">· Behavior · {bt.measurementType}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500">Goal Area *</label>
              <input value={goalArea} onChange={e => setGoalArea(e.target.value)} placeholder="e.g. Skill Acquisition"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">Service Area</label>
              <input value={serviceArea} onChange={e => setServiceArea(e.target.value)} placeholder="e.g. ABA, Speech"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-gray-500">Annual Goal *</label>
            <textarea value={annualGoal} onChange={e => setAnnualGoal(e.target.value)} rows={3}
              placeholder="The student will..."
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-gray-500">Baseline</label>
            <input value={baseline} onChange={e => setBaseline(e.target.value)} placeholder="Current performance level"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-gray-500">Target Criterion</label>
            <input value={targetCriterion} onChange={e => setTargetCriterion(e.target.value)} placeholder="80% across 3 sessions"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-gray-500">Measurement Method</label>
            <input value={measurementMethod} onChange={e => setMeasurementMethod(e.target.value)} placeholder="Discrete trial data collection"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-gray-500">Benchmarks / Short-Term Objectives</label>
            <textarea value={benchmarks} onChange={e => setBenchmarks(e.target.value)} rows={3}
              placeholder="1. By [date], student will...&#10;2. By [date], student will..."
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[12px] h-9 md:h-8">Cancel</Button>
          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-9 md:h-8" disabled={!annualGoal.trim() || saving} onClick={save}>
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Goal"}
          </Button>
        </div>
      </div>
    </div>
  );
}
