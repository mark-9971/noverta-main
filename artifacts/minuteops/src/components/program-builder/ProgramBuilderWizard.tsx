import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  X, Save, ChevronRight, ChevronLeft, Plus, Trash2, GripVertical, Check,
  BookOpen, Target, Settings2, Eye, Sparkles, Hand, Mic, ArrowUp, ArrowDown,
  Layers, Zap, AlertTriangle
} from "lucide-react";
import { toast } from "sonner";

const API = "/api";

interface StepDef {
  id: string;
  name: string;
  sdInstruction: string;
  targetResponse: string;
  materials: string;
  promptStrategy: string;
  errorCorrection: string;
}

const PROGRAM_TYPES = [
  { value: "discrete_trial", label: "Discrete Trial Training (DTT)", desc: "Structured, repeated trials with clear SD, response, and consequence. Best for teaching new skills in isolation.", icon: Target },
  { value: "task_analysis", label: "Task Analysis (TA)", desc: "Break complex skills into sequential steps. Track independence on each step. Best for chaining and self-help skills.", icon: Layers },
  { value: "natural_environment", label: "Natural Environment Teaching (NET)", desc: "Incidental teaching during natural routines. Follow student motivation. Best for generalization.", icon: Sparkles },
  { value: "fluency", label: "Fluency Building", desc: "Timed trials to build speed and accuracy on mastered skills. Track rate per minute.", icon: Zap },
];

const DOMAINS = [
  "Language", "Social Skills", "Academic", "Daily Living", "Motor Skills",
  "Play Skills", "Self-Help", "Communication", "Behavior", "Cognitive", "Vocational",
];

const PROMPT_LABELS: Record<string, { label: string; short: string; icon: any; color: string }> = {
  full_physical: { label: "Full Physical", short: "FP", icon: Hand, color: "bg-red-100 text-red-700" },
  partial_physical: { label: "Partial Physical", short: "PP", icon: Hand, color: "bg-orange-100 text-orange-700" },
  model: { label: "Model", short: "M", icon: Eye, color: "bg-amber-100 text-amber-700" },
  gestural: { label: "Gestural", short: "G", icon: Hand, color: "bg-yellow-100 text-yellow-700" },
  verbal: { label: "Verbal", short: "V", icon: Mic, color: "bg-blue-100 text-blue-700" },
  independent: { label: "Independent", short: "I", icon: Sparkles, color: "bg-emerald-100 text-emerald-700" },
};

const ALL_PROMPTS = ["full_physical","partial_physical","model","gestural","verbal","independent"];

const REINFORCEMENT_SCHEDULES = [
  { value: "continuous", label: "Continuous (CRF)" },
  { value: "fixed_ratio", label: "Fixed Ratio (FR)" },
  { value: "variable_ratio", label: "Variable Ratio (VR)" },
  { value: "fixed_interval", label: "Fixed Interval (FI)" },
  { value: "variable_interval", label: "Variable Interval (VI)" },
];

const ERROR_CORRECTIONS = [
  { value: "4_step", label: "4-Step Error Correction" },
  { value: "model_prompt_transfer", label: "Model-Prompt-Transfer" },
  { value: "backstep", label: "Backstep" },
  { value: "re_present", label: "Re-present Trial" },
  { value: "show_correct", label: "Show Correct Response" },
  { value: "none", label: "No Error Correction" },
];

interface ProgramBuilderWizardProps {
  studentId: number;
  studentName: string;
  onClose: () => void;
  onSaved: () => void;
  editingProgram?: any;
  existingSteps?: any[];
}

export default function ProgramBuilderWizard({ studentId, studentName, onClose, onSaved, editingProgram, existingSteps }: ProgramBuilderWizardProps) {
  const isEditing = !!editingProgram;
  const [step, setStep] = useState(isEditing ? 1 : 0);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: editingProgram?.name ?? "",
    description: editingProgram?.description ?? "",
    programType: editingProgram?.programType ?? "discrete_trial",
    domain: editingProgram?.domain ?? "",
    tutorInstructions: editingProgram?.tutorInstructions ?? "",
    promptHierarchy: editingProgram?.promptHierarchy ?? [...ALL_PROMPTS],
    currentPromptLevel: editingProgram?.currentPromptLevel ?? "verbal",
    autoProgressEnabled: editingProgram?.autoProgressEnabled ?? true,
    masteryCriterionPercent: editingProgram?.masteryCriterionPercent ?? 80,
    masteryCriterionSessions: editingProgram?.masteryCriterionSessions ?? 3,
    regressionThreshold: editingProgram?.regressionThreshold ?? 50,
    regressionSessions: editingProgram?.regressionSessions ?? 2,
    reinforcementSchedule: editingProgram?.reinforcementSchedule ?? "continuous",
    reinforcementType: editingProgram?.reinforcementType ?? "",
  });

  const [steps, setSteps] = useState<StepDef[]>(() => {
    if (existingSteps && existingSteps.length > 0) {
      return existingSteps.map((s: any) => ({
        id: `existing-${s.id}`,
        name: s.name,
        sdInstruction: s.sdInstruction ?? "",
        targetResponse: s.targetResponse ?? "",
        materials: s.materials ?? "",
        promptStrategy: s.promptStrategy ?? "",
        errorCorrection: s.errorCorrection ?? "",
      }));
    }
    return [];
  });

  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [bulkInput, setBulkInput] = useState("");
  const [showBulkImport, setShowBulkImport] = useState(false);

  const addStep = useCallback(() => {
    const id = `step-${Date.now()}`;
    setSteps(prev => [...prev, { id, name: "", sdInstruction: "", targetResponse: "", materials: "", promptStrategy: "", errorCorrection: "" }]);
    setExpandedStep(id);
  }, []);

  const removeStep = useCallback((id: string) => {
    setSteps(prev => prev.filter(s => s.id !== id));
  }, []);

  const moveStep = useCallback((idx: number, dir: "up" | "down") => {
    setSteps(prev => {
      const arr = [...prev];
      const newIdx = dir === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  }, []);

  const updateStep = useCallback((id: string, field: keyof StepDef, value: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }, []);

  const handleBulkImport = useCallback(() => {
    const lines = bulkInput.split("\n").map(l => l.trim()).filter(Boolean);
    const newSteps: StepDef[] = lines.map((line, i) => ({
      id: `bulk-${Date.now()}-${i}`,
      name: line,
      sdInstruction: "", targetResponse: "", materials: "", promptStrategy: "", errorCorrection: "",
    }));
    setSteps(prev => [...prev, ...newSteps]);
    setBulkInput("");
    setShowBulkImport(false);
    toast.success(`Added ${newSteps.length} steps`);
  }, [bulkInput]);

  const wizardSteps = ["Program Type", "Configuration", "Steps", "Review"];

  async function save() {
    if (!form.name.trim()) { toast.error("Program name is required"); return; }
    setSaving(true);
    try {
      if (isEditing) {
        const res = await fetch(`${API}/program-targets/${editingProgram.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            targetCriterion: `${form.masteryCriterionPercent}% across ${form.masteryCriterionSessions} sessions`,
          }),
        });
        if (!res.ok) throw new Error("Failed to save");

        const existingRes = await fetch(`${API}/program-targets/${editingProgram.id}/steps`);
        const existingStepsData = await existingRes.json();
        for (const es of existingStepsData) {
          await fetch(`${API}/program-steps/${es.id}`, { method: "DELETE" });
        }
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          await fetch(`${API}/program-targets/${editingProgram.id}/steps`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: s.name || `Step ${i + 1}`,
              sdInstruction: s.sdInstruction || null,
              targetResponse: s.targetResponse || null,
              materials: s.materials || null,
              promptStrategy: s.promptStrategy || null,
              errorCorrection: s.errorCorrection || null,
            }),
          });
        }
        toast.success("Program updated");
      } else {
        const res = await fetch(`${API}/students/${studentId}/program-targets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            targetCriterion: `${form.masteryCriterionPercent}% across ${form.masteryCriterionSessions} sessions`,
            steps: steps.map(s => ({
              name: s.name || "Untitled Step",
              sdInstruction: s.sdInstruction || null,
              targetResponse: s.targetResponse || null,
              materials: s.materials || null,
              promptStrategy: s.promptStrategy || null,
              errorCorrection: s.errorCorrection || null,
            })),
          }),
        });
        if (!res.ok) throw new Error("Failed to save");
        toast.success("Program created");
      }
      onSaved();
    } catch {
      toast.error("Failed to save program");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl shadow-xl my-auto max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 p-4 md:p-5 flex items-center justify-between z-10 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{isEditing ? "Edit Program" : "Program Builder"}</h2>
            <p className="text-xs text-gray-400">{studentName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-0 px-4 pt-3 flex-shrink-0">
          {wizardSteps.map((ws, i) => (
            <div key={ws} className="flex items-center">
              <button onClick={() => { if (i <= step || isEditing) setStep(i); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                  i === step ? "bg-emerald-100 text-emerald-800" :
                  i < step ? "bg-emerald-100 text-emerald-700 cursor-pointer" : "bg-gray-100 text-gray-400"
                }`}>
                {i < step ? <Check className="w-3 h-3" /> : <span className="w-3 text-center">{i + 1}</span>}
                <span className="hidden sm:inline">{ws}</span>
              </button>
              {i < wizardSteps.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-gray-300 mx-1" />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-5">
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-600 mb-3">Select Program Type</p>
              {PROGRAM_TYPES.map(pt => (
                <button key={pt.value} onClick={() => { setForm(f => ({ ...f, programType: pt.value })); setStep(1); }}
                  className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                    form.programType === pt.value ? "border-emerald-400 bg-emerald-50/50" : "border-gray-100 hover:border-emerald-200 hover:bg-gray-50"
                  }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      form.programType === pt.value ? "bg-emerald-100" : "bg-gray-100"
                    }`}>
                      <pt.icon className={`w-5 h-5 ${form.programType === pt.value ? "text-emerald-700" : "text-gray-500"}`} />
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-gray-700">{pt.label}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">{pt.desc}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-[12px] font-medium text-gray-500">Program Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Receptive ID: Colors" autoFocus
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[12px] font-medium text-gray-500">Description</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={2} placeholder="What the student will demonstrate..."
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Domain</label>
                  <select value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                    <option value="">Select domain...</option>
                    {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Program Type</label>
                  <select value={form.programType} onChange={e => setForm(f => ({ ...f, programType: e.target.value }))}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                    {PROGRAM_TYPES.map(pt => <option key={pt.value} value={pt.value}>{pt.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[12px] font-medium text-gray-500">Tutor Instructions</label>
                <textarea value={form.tutorInstructions} onChange={e => setForm(f => ({ ...f, tutorInstructions: e.target.value }))}
                  rows={3} placeholder="Step-by-step instructions for the tutor..."
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-[12px] font-semibold text-gray-600 mb-3">Mastery & Regression Criteria</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-400">Mastery %</label>
                    <input type="number" value={form.masteryCriterionPercent} onChange={e => setForm(f => ({ ...f, masteryCriterionPercent: parseInt(e.target.value) || 80 }))}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-400">Mastery Sessions</label>
                    <input type="number" value={form.masteryCriterionSessions} onChange={e => setForm(f => ({ ...f, masteryCriterionSessions: parseInt(e.target.value) || 3 }))}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-400">Regression %</label>
                    <input type="number" value={form.regressionThreshold} onChange={e => setForm(f => ({ ...f, regressionThreshold: parseInt(e.target.value) || 50 }))}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-400">Regression Sessions</label>
                    <input type="number" value={form.regressionSessions} onChange={e => setForm(f => ({ ...f, regressionSessions: parseInt(e.target.value) || 2 }))}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-[12px] font-semibold text-gray-600 mb-3">Prompt Hierarchy</p>
                <div className="space-y-1">
                  {form.promptHierarchy.map((level: string, idx: number) => {
                    const info = PROMPT_LABELS[level];
                    return (
                      <div key={level} className={`flex items-center gap-2 p-2 rounded-lg border ${form.currentPromptLevel === level ? "border-emerald-300 bg-emerald-50" : "border-gray-100"}`}>
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => moveStep(idx, "up")} disabled={idx === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button onClick={() => moveStep(idx, "down")} disabled={idx === form.promptHierarchy.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="text-[11px] text-gray-400 w-4">{idx + 1}</span>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${info?.color ?? "bg-gray-100"}`}>{info?.label ?? level}</span>
                        {form.currentPromptLevel === level && <span className="text-[10px] text-emerald-700 font-medium ml-auto">Starting Level</span>}
                        <button className="text-[10px] text-emerald-700 ml-auto hover:text-emerald-900"
                          onClick={() => setForm(f => ({ ...f, currentPromptLevel: level }))}>Set Start</button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Reinforcement Schedule</label>
                  <select value={form.reinforcementSchedule} onChange={e => setForm(f => ({ ...f, reinforcementSchedule: e.target.value }))}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                    {REINFORCEMENT_SCHEDULES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Reinforcement Type</label>
                  <input value={form.reinforcementType} onChange={e => setForm(f => ({ ...f, reinforcementType: e.target.value }))}
                    placeholder="e.g. Token board, praise" className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.autoProgressEnabled}
                  onChange={e => setForm(f => ({ ...f, autoProgressEnabled: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300" />
                <span className="text-[12px] text-gray-600">Auto-progress through prompt hierarchy on mastery</span>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-600">Program Steps ({steps.length})</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-[11px] h-7" onClick={() => setShowBulkImport(!showBulkImport)}>
                    {showBulkImport ? "Cancel" : "Bulk Import"}
                  </Button>
                  <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] h-7" onClick={addStep}>
                    <Plus className="w-3 h-3 mr-1" /> Add Step
                  </Button>
                </div>
              </div>

              {showBulkImport && (
                <Card className="border-emerald-200 bg-emerald-50/30">
                  <CardContent className="p-3 space-y-2">
                    <p className="text-[11px] text-gray-500">Enter one step per line:</p>
                    <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)}
                      rows={5} placeholder={"Touch red\nTouch blue\nTouch green\nTouch yellow"}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none bg-white" />
                    <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] h-7" onClick={handleBulkImport}
                      disabled={!bulkInput.trim()}>
                      Import {bulkInput.split("\n").filter(l => l.trim()).length} Steps
                    </Button>
                  </CardContent>
                </Card>
              )}

              {steps.length === 0 && !showBulkImport && (
                <div className="text-center py-10 text-gray-400">
                  <Layers className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium">No steps yet</p>
                  <p className="text-xs mt-1">Add individual steps or use bulk import</p>
                </div>
              )}

              <div className="space-y-2">
                {steps.map((s, idx) => (
                  <div key={s.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                    <div className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-gray-50" onClick={() => setExpandedStep(expandedStep === s.id ? null : s.id)}>
                      <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      <span className="text-[12px] font-bold text-gray-400 w-6">{idx + 1}</span>
                      <input value={s.name} onChange={e => { e.stopPropagation(); updateStep(s.id, "name", e.target.value); }}
                        onClick={e => e.stopPropagation()} placeholder={`Step ${idx + 1} name`}
                        className="flex-1 text-[13px] font-medium text-gray-700 bg-transparent border-none focus:outline-none focus:ring-0" />
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={e => { e.stopPropagation(); moveStep(idx, "up"); }} disabled={idx === 0}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                        <button onClick={e => { e.stopPropagation(); moveStep(idx, "down"); }} disabled={idx === steps.length - 1}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                        <button onClick={e => { e.stopPropagation(); removeStep(s.id); }}
                          className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    {expandedStep === s.id && (
                      <div className="border-t border-gray-100 p-3 space-y-2.5 bg-gray-50/50">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-[11px] font-medium text-gray-400">SD Instruction</label>
                            <input value={s.sdInstruction} onChange={e => updateStep(s.id, "sdInstruction", e.target.value)}
                              placeholder="e.g. Touch [color]" className="w-full mt-0.5 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200" />
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-gray-400">Target Response</label>
                            <input value={s.targetResponse} onChange={e => updateStep(s.id, "targetResponse", e.target.value)}
                              placeholder="e.g. Touches correct color" className="w-full mt-0.5 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200" />
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-gray-400">Materials</label>
                            <input value={s.materials} onChange={e => updateStep(s.id, "materials", e.target.value)}
                              placeholder="e.g. Color cards, array of 3" className="w-full mt-0.5 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200" />
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-gray-400">Prompt Strategy</label>
                            <input value={s.promptStrategy} onChange={e => updateStep(s.id, "promptStrategy", e.target.value)}
                              placeholder="e.g. Most-to-least" className="w-full mt-0.5 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200" />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] font-medium text-gray-400">Error Correction</label>
                          <select value={s.errorCorrection} onChange={e => updateStep(s.id, "errorCorrection", e.target.value)}
                            className="w-full mt-0.5 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200">
                            <option value="">Select error correction...</option>
                            {ERROR_CORRECTIONS.map(ec => <option key={ec.value} value={ec.value}>{ec.label}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-600">Review Program</p>
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[15px] font-bold text-gray-800">{form.name || "Untitled Program"}</h3>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                      {PROGRAM_TYPES.find(pt => pt.value === form.programType)?.label ?? form.programType}
                    </span>
                  </div>
                  {form.description && <p className="text-[12px] text-gray-500">{form.description}</p>}
                  {form.domain && <p className="text-[11px] text-gray-400">Domain: {form.domain}</p>}
                  {form.tutorInstructions && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-800">
                      <BookOpen className="w-3.5 h-3.5 inline mr-1" /> {form.tutorInstructions}
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-2">
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-gray-400">Start Prompt</p>
                      <p className="text-[12px] font-bold text-gray-600">{PROMPT_LABELS[form.currentPromptLevel]?.label ?? form.currentPromptLevel}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-gray-400">Mastery</p>
                      <p className="text-[12px] font-bold text-gray-600">{form.masteryCriterionPercent}% x {form.masteryCriterionSessions}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-gray-400">Reinforcement</p>
                      <p className="text-[12px] font-bold text-gray-600 capitalize">{form.reinforcementSchedule.replace(/_/g, " ")}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="text-[10px] text-gray-400">Auto-Progress</p>
                      <p className={`text-[12px] font-bold ${form.autoProgressEnabled ? "text-emerald-600" : "text-gray-400"}`}>
                        {form.autoProgressEnabled ? "On" : "Off"}
                      </p>
                    </div>
                  </div>

                  {steps.length > 0 && (
                    <div className="pt-2">
                      <p className="text-[11px] font-semibold text-gray-500 mb-1.5">{steps.length} Steps</p>
                      <div className="space-y-1">
                        {steps.map((s, i) => (
                          <div key={s.id} className="flex items-center gap-2 p-1.5 bg-gray-50 rounded text-[12px]">
                            <span className="text-gray-400 font-bold w-5 text-center">{i + 1}</span>
                            <span className="text-gray-700">{s.name || `Step ${i + 1}`}</span>
                            {s.sdInstruction && <span className="text-gray-400 text-[10px]">SD: "{s.sdInstruction}"</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {!form.name.trim() && (
                <div className="flex items-center gap-2 text-amber-600 text-[12px] bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  Program name is required before saving.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex items-center justify-between flex-shrink-0">
          <Button variant="outline" size="sm" className="text-[12px]" onClick={() => step > 0 ? setStep(step - 1) : onClose()}>
            <ChevronLeft className="w-3.5 h-3.5 mr-1" /> {step > 0 ? "Back" : "Cancel"}
          </Button>
          {step < 3 ? (
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" onClick={() => setStep(step + 1)}>
              Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          ) : (
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" onClick={save} disabled={saving || !form.name.trim()}>
              <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : (isEditing ? "Update Program" : "Create Program")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
