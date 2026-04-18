import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { X, Save, Settings2, BookOpen, Plus, Clock } from "lucide-react";
import { listProgramSteps, updateProgramTarget, createProgramStep, listProgramTargetPhaseHistory, type ProgramTargetPhaseHistoryItem } from "@workspace/api-client-react";
import { ProgramTarget, ProgramStep, ProgramPhase, PROGRAM_PHASES, PHASE_CONFIG, PROMPT_LABELS, REINFORCEMENT_SCHEDULES } from "./constants";

interface Props {
  program: ProgramTarget;
  onClose: () => void;
  onSaved: () => void;
}

export default function ProgramDetailModal({ program, onClose, onSaved }: Props) {
  const [steps, setSteps] = useState<ProgramStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [phaseHistory, setPhaseHistory] = useState<ProgramTargetPhaseHistoryItem[]>([]);
  const [phaseHistoryLoading, setPhaseHistoryLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ ...program, phaseReason: "" });
  const [saving, setSaving] = useState(false);
  const [newStepName, setNewStepName] = useState("");
  const [newStepSd, setNewStepSd] = useState("");
  const [newStepResponse, setNewStepResponse] = useState("");

  useEffect(() => {
    listProgramSteps(program.id).then(s => { setSteps(s as any[]); setLoading(false); }).catch(() => setLoading(false));
    listProgramTargetPhaseHistory(program.id)
      .then(h => { setPhaseHistory(h); setPhaseHistoryLoading(false); })
      .catch(() => setPhaseHistoryLoading(false));
  }, [program.id]);

  async function saveSettings() {
    setSaving(true);
    await updateProgramTarget(program.id, {
        name: form.name,
        description: form.description,
        tutorInstructions: form.tutorInstructions,
        promptHierarchy: form.promptHierarchy,
        currentPromptLevel: form.currentPromptLevel,
        autoProgressEnabled: form.autoProgressEnabled,
        masteryCriterionPercent: form.masteryCriterionPercent,
        masteryCriterionSessions: form.masteryCriterionSessions,
        regressionThreshold: form.regressionThreshold,
        regressionSessions: form.regressionSessions,
        reinforcementSchedule: form.reinforcementSchedule,
        reinforcementType: form.reinforcementType,
        phase: form.phase,
        phaseReason: form.phaseReason || undefined,
      } as any);
    onSaved();
    setSaving(false);
  }

  async function addStep() {
    if (!newStepName.trim()) return;
    const step = await createProgramStep(program.id, { name: newStepName.trim(), sdInstruction: newStepSd || null, targetResponse: newStepResponse || null });
    setSteps(prev => [...prev, step as any]);
    setNewStepName(""); setNewStepSd(""); setNewStepResponse("");
  }

  const allPrompts = ["full_physical","partial_physical","model","gestural","verbal","independent"];
  const hierarchy = form.promptHierarchy ?? allPrompts;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl my-auto max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 p-4 md:p-5 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{program.name}</h2>
            <p className="text-xs text-gray-400">{program.domain || "General"} · {program.programType === "discrete_trial" ? "Discrete Trial" : "Task Analysis"}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-[12px] h-8" onClick={() => setEditMode(!editMode)}>
              <Settings2 className="w-3.5 h-3.5 mr-1" /> {editMode ? "View" : "Edit"}
            </Button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-4 md:p-5 space-y-5">
          {editMode ? (
            <>
              <div className="space-y-3">
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Program Name</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Tutor Instructions</label>
                  <textarea value={form.tutorInstructions ?? ""} onChange={e => setForm({ ...form, tutorInstructions: e.target.value })}
                    rows={3} placeholder="Detailed instructions for the tutor..."
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
                </div>
              </div>

              <div>
                <label className="text-[12px] font-medium text-gray-500 mb-2 block">Prompt Hierarchy (drag to reorder)</label>
                <div className="space-y-1">
                  {hierarchy.map((level, idx) => {
                    const info = PROMPT_LABELS[level];
                    return (
                      <div key={level} className={`flex items-center gap-2 p-2 rounded-lg border ${form.currentPromptLevel === level ? "border-emerald-300 bg-emerald-50" : "border-gray-100"}`}>
                        <span className="text-[11px] text-gray-400 w-5">{idx + 1}</span>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${info?.color ?? "bg-gray-100"}`}>{info?.label ?? level}</span>
                        {form.currentPromptLevel === level && <span className="text-[10px] text-emerald-700 font-medium ml-auto">Current Level</span>}
                        <button className="text-[10px] text-emerald-700 ml-auto hover:text-emerald-900"
                          onClick={() => setForm({ ...form, currentPromptLevel: level })}>Set Current</button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Mastery %</label>
                  <input type="number" value={form.masteryCriterionPercent ?? 80} onChange={e => setForm({ ...form, masteryCriterionPercent: parseInt(e.target.value) || 80 })}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Mastery Sessions</label>
                  <input type="number" value={form.masteryCriterionSessions ?? 3} onChange={e => setForm({ ...form, masteryCriterionSessions: parseInt(e.target.value) || 3 })}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Regression %</label>
                  <input type="number" value={form.regressionThreshold ?? 50} onChange={e => setForm({ ...form, regressionThreshold: parseInt(e.target.value) || 50 })}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Regression Sessions</label>
                  <input type="number" value={form.regressionSessions ?? 2} onChange={e => setForm({ ...form, regressionSessions: parseInt(e.target.value) || 2 })}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.autoProgressEnabled ?? true}
                    onChange={e => setForm({ ...form, autoProgressEnabled: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300" />
                  <span className="text-[12px] text-gray-600">Auto-progress through prompt hierarchy</span>
                </label>
              </div>

              <div>
                <label className="text-[12px] font-medium text-gray-500">Program Phase</label>
                <div className="mt-1 grid grid-cols-1 gap-1.5">
                  {PROGRAM_PHASES.map(p => {
                    const cfg = PHASE_CONFIG[p];
                    const Icon = cfg.icon;
                    const selected = (form.phase ?? "training") === p;
                    return (
                      <button key={p} type="button"
                        onClick={() => setForm({ ...form, phase: p as ProgramPhase })}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-left transition-colors ${selected ? `${cfg.color} border-current` : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"}`}>
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[12px] font-semibold">{cfg.label}</span>
                          <span className="text-[10px] text-gray-400 ml-2">{cfg.description}</span>
                        </div>
                        {selected && <span className="ml-auto text-[10px] font-semibold">✓</span>}
                      </button>
                    );
                  })}
                </div>
                {(form.phase ?? "training") !== (program.phase ?? "training") && (
                  <div className="mt-2">
                    <label className="text-[12px] font-medium text-gray-500">Reason for phase change <span className="text-gray-400 font-normal">(optional)</span></label>
                    <input
                      value={form.phaseReason}
                      onChange={e => setForm({ ...form, phaseReason: e.target.value })}
                      placeholder="e.g. Met mastery criterion 3 consecutive sessions"
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="text-[12px] font-medium text-gray-500">Reinforcement Schedule</label>
                <select value={form.reinforcementSchedule ?? "continuous"} onChange={e => setForm({ ...form, reinforcementSchedule: e.target.value })}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                  {REINFORCEMENT_SCHEDULES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditMode(false)} className="text-[12px]">Cancel</Button>
                <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" onClick={saveSettings} disabled={saving}>
                  <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Settings"}
                </Button>
              </div>
            </>
          ) : (
            <>
              {program.tutorInstructions && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[12px] text-amber-800">
                  <BookOpen className="w-4 h-4 inline mr-1.5" /> <strong>Tutor Instructions:</strong> {program.tutorInstructions}
                </div>
              )}

              {(() => {
                const ph = (program.phase ?? "training") as ProgramPhase;
                const cfg = PHASE_CONFIG[ph];
                const PhIcon = cfg.icon;
                return (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${cfg.color}`}>
                    <PhIcon className="w-4 h-4 flex-shrink-0" />
                    <div>
                      <span className="text-[12px] font-bold">{cfg.label}</span>
                      <span className="text-[11px] ml-2 opacity-75">{cfg.description}</span>
                    </div>
                    {program.phaseChangedAt && (
                      <span className="ml-auto text-[10px] opacity-60">
                        since {new Date(program.phaseChangedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-400">Prompt Level</p>
                  <p className={`text-sm font-bold mt-1 ${PROMPT_LABELS[program.currentPromptLevel ?? "verbal"]?.color?.split(" ")[1] ?? "text-gray-600"}`}>
                    {PROMPT_LABELS[program.currentPromptLevel ?? "verbal"]?.label ?? program.currentPromptLevel}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-400">Mastery</p>
                  <p className="text-sm font-bold text-gray-600 mt-1">{program.masteryCriterionPercent ?? 80}% x{program.masteryCriterionSessions ?? 3}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-400">Reinforcement</p>
                  <p className="text-sm font-bold text-gray-600 mt-1 capitalize">{(program.reinforcementSchedule ?? "continuous").replace(/_/g, " ")}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-gray-400">Auto-Progress</p>
                  <p className={`text-sm font-bold mt-1 ${program.autoProgressEnabled ? "text-emerald-600" : "text-gray-400"}`}>
                    {program.autoProgressEnabled ? "On" : "Off"}
                  </p>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-600">Phase History</h3>
                </div>
                {phaseHistoryLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : phaseHistory.length === 0 ? (
                  <p className="text-[12px] text-gray-400 py-3 text-center">No phase transitions recorded yet.</p>
                ) : (
                  <div className="relative pl-4">
                    <div className="absolute left-1.5 top-0 bottom-0 w-px bg-gray-100" />
                    <div className="space-y-2">
                      {phaseHistory.map((h, idx) => {
                        const cfg = PHASE_CONFIG[h.phase as ProgramPhase] ?? PHASE_CONFIG["training"];
                        const Icon = cfg.icon;
                        const isCurrent = idx === 0;
                        return (
                          <div key={h.id} className="relative flex gap-2.5 items-start">
                            <div className={`absolute -left-[11px] w-4 h-4 rounded-full flex items-center justify-center border-2 border-white ${isCurrent ? cfg.color : "bg-gray-100"}`}>
                              <Icon className="w-2.5 h-2.5" />
                            </div>
                            <div className="ml-2 flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${cfg.color}`}>{cfg.label}</span>
                                {h.previousPhase && (
                                  <span className="text-[10px] text-gray-400">
                                    from {PHASE_CONFIG[h.previousPhase as ProgramPhase]?.label ?? h.previousPhase}
                                  </span>
                                )}
                                {isCurrent && <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Current</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <span className="text-[10px] text-gray-400">
                                  {new Date(h.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                  {h.endedAt && ` – ${new Date(h.endedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                                </span>
                                {h.reason && <span className="text-[10px] text-gray-500 italic">"{h.reason}"</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-600">Program Steps ({steps.length})</h3>
                </div>
                {loading ? (
                  <Skeleton className="h-32 w-full" />
                ) : steps.length === 0 ? (
                  <p className="text-[12px] text-gray-400 py-4 text-center">No steps defined. Add steps below.</p>
                ) : (
                  <div className="space-y-1.5">
                    {steps.map(s => (
                      <div key={s.id} className={`flex items-center gap-3 p-2.5 md:p-3 rounded-lg border ${s.mastered ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-100"}`}>
                        <span className="text-sm font-bold text-gray-400 w-6 text-center">{s.stepNumber}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-gray-700 truncate">{s.name}</p>
                          {s.sdInstruction && <p className="text-[11px] text-gray-400 truncate">SD: "{s.sdInstruction}"</p>}
                          {s.targetResponse && <p className="text-[11px] text-gray-400 truncate">R: {s.targetResponse}</p>}
                        </div>
                        {s.mastered && <span className="text-[10px] font-semibold text-emerald-600 px-1.5 py-0.5 bg-emerald-100 rounded">Mastered</span>}
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 border border-dashed border-gray-200 rounded-lg p-3 space-y-2">
                  <p className="text-[11px] font-medium text-gray-500">Add Step</p>
                  <input value={newStepName} onChange={e => setNewStepName(e.target.value)} placeholder="Step name (e.g., Touch red)"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={newStepSd} onChange={e => setNewStepSd(e.target.value)} placeholder="SD instruction"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                    <input value={newStepResponse} onChange={e => setNewStepResponse(e.target.value)} placeholder="Target response"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" onClick={addStep} disabled={!newStepName.trim()}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Step
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
