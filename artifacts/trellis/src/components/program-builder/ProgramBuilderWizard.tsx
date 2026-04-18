import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  X, Save, ChevronRight, ChevronLeft, Plus, Trash2, GripVertical, Check,
  BookOpen, Target, Eye, Sparkles, Hand, Mic, ArrowUp, ArrowDown,
  Layers, Zap, AlertTriangle, FlaskConical, Info, ChevronsDown, ChevronsUp,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  updateProgramTarget, listProgramSteps, deleteProgramStep,
  createProgramStep, createProgramTarget,
} from "@workspace/api-client-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StepDef {
  id: string;
  name: string;
  sdInstruction: string;
  targetResponse: string;
  materials: string;
  promptStrategy: string;
  errorCorrection: string;
  reinforcementNotes: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

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
  full_physical:    { label: "Full Physical",    short: "FP", icon: Hand,     color: "bg-red-100 text-red-700"     },
  partial_physical: { label: "Partial Physical", short: "PP", icon: Hand,     color: "bg-amber-100 text-amber-700" },
  model:            { label: "Model",            short: "M",  icon: Eye,      color: "bg-amber-100 text-amber-700" },
  gestural:         { label: "Gestural",         short: "G",  icon: Hand,     color: "bg-gray-50 text-gray-600"    },
  verbal:           { label: "Verbal",           short: "V",  icon: Mic,      color: "bg-gray-100 text-gray-700"   },
  independent:      { label: "Independent",      short: "I",  icon: Sparkles, color: "bg-emerald-100 text-emerald-700" },
};

const ALL_PROMPTS = ["full_physical", "partial_physical", "model", "gestural", "verbal", "independent"];
const MTL_ORDER   = ["full_physical", "partial_physical", "model", "gestural", "verbal", "independent"];
const LTM_ORDER   = ["independent", "verbal", "gestural", "model", "partial_physical", "full_physical"];

const REINFORCEMENT_SCHEDULES = [
  { value: "continuous",       label: "Continuous (CRF)"          },
  { value: "fixed_ratio",      label: "Fixed Ratio (FR)"          },
  { value: "variable_ratio",   label: "Variable Ratio (VR)"       },
  { value: "fixed_interval",   label: "Fixed Interval (FI)"       },
  { value: "variable_interval",label: "Variable Interval (VI)"    },
];

const ERROR_CORRECTIONS = [
  { value: "",                    label: "None / Not specified"    },
  { value: "4_step",             label: "4-Step Error Correction"  },
  { value: "model_prompt_transfer", label: "Model-Prompt-Transfer" },
  { value: "backstep",           label: "Backstep"                 },
  { value: "re_present",         label: "Re-present Trial"         },
  { value: "show_correct",       label: "Show Correct Response"    },
];

const STARTING_PHASES = [
  {
    value: "baseline",
    label: "Baseline",
    icon: FlaskConical,
    color: "bg-gray-100 text-gray-700 border-gray-200",
    activeColor: "border-gray-400 bg-gray-50",
    desc: "Collecting baseline data before instruction begins. No prompts or corrections.",
  },
  {
    value: "training",
    label: "Training",
    icon: BookOpen,
    color: "bg-blue-50 text-blue-700 border-blue-100",
    activeColor: "border-blue-400 bg-blue-50",
    desc: "Active skill acquisition. Instruction, prompting, and error correction in progress.",
  },
];

const PROMPT_STEP_STRATEGIES = [
  ...ALL_PROMPTS.map(p => ({ value: p, label: PROMPT_LABELS[p]?.label ?? p })),
  { value: "most_to_least", label: "Most-to-Least (program default)" },
  { value: "least_to_most", label: "Least-to-Most (program default)" },
  { value: "time_delay",    label: "Constant Time Delay"             },
  { value: "other",         label: "Other (see materials)"           },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isMtlOrder(hierarchy: string[]): boolean {
  const standard = hierarchy.filter(h => MTL_ORDER.includes(h));
  for (let i = 1; i < standard.length; i++) {
    if (MTL_ORDER.indexOf(standard[i]) < MTL_ORDER.indexOf(standard[i - 1])) return false;
  }
  return true;
}

// ─── Main component ──────────────────────────────────────────────────────────

interface ProgramBuilderWizardProps {
  studentId: number;
  studentName: string;
  onClose: () => void;
  onSaved: () => void;
  editingProgram?: any;
  existingSteps?: any[];
}

export default function ProgramBuilderWizard({
  studentId, studentName, onClose, onSaved, editingProgram, existingSteps,
}: ProgramBuilderWizardProps) {
  const isEditing = !!editingProgram;
  const [step, setStep] = useState(isEditing ? 1 : 0);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name:                    editingProgram?.name                    ?? "",
    description:             editingProgram?.description             ?? "",
    programType:             editingProgram?.programType             ?? "discrete_trial",
    domain:                  editingProgram?.domain                  ?? "",
    tutorInstructions:       editingProgram?.tutorInstructions       ?? "",
    promptHierarchy:         editingProgram?.promptHierarchy         ?? [...MTL_ORDER],
    currentPromptLevel:      editingProgram?.currentPromptLevel      ?? "full_physical",
    autoProgressEnabled:     editingProgram?.autoProgressEnabled     ?? true,
    masteryCriterionPercent: editingProgram?.masteryCriterionPercent ?? 80,
    masteryCriterionSessions:editingProgram?.masteryCriterionSessions?? 3,
    regressionThreshold:     editingProgram?.regressionThreshold     ?? 50,
    regressionSessions:      editingProgram?.regressionSessions      ?? 2,
    reinforcementSchedule:   editingProgram?.reinforcementSchedule   ?? "continuous",
    reinforcementType:       editingProgram?.reinforcementType       ?? "",
    phase:                   (isEditing ? (editingProgram?.phase ?? "training") : "training") as "baseline" | "training",
    defaultErrorCorrection:  "",
  });

  const [steps, setSteps] = useState<StepDef[]>(() => {
    if (existingSteps && existingSteps.length > 0) {
      return existingSteps.map((s: any) => ({
        id: `existing-${s.id}`,
        name:              s.name              ?? "",
        sdInstruction:     s.sdInstruction     ?? "",
        targetResponse:    s.targetResponse    ?? "",
        materials:         s.materials         ?? "",
        promptStrategy:    s.promptStrategy    ?? "",
        errorCorrection:   s.errorCorrection   ?? "",
        reinforcementNotes:s.reinforcementNotes ?? "",
      }));
    }
    return [];
  });

  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [bulkInput, setBulkInput] = useState("");
  const [showBulkImport, setShowBulkImport] = useState(false);

  // ── Step reorder (task steps) ──────────────────────────────────────────────
  const moveStep = useCallback((idx: number, dir: "up" | "down") => {
    setSteps(prev => {
      const arr = [...prev];
      const newIdx = dir === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= arr.length) return arr;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  }, []);

  // ── Prompt hierarchy reorder (FIXED — operates on promptHierarchy, not steps) ──
  const movePromptLevel = useCallback((idx: number, dir: "up" | "down") => {
    setForm(f => {
      const arr = [...f.promptHierarchy];
      const newIdx = dir === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= arr.length) return f;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return { ...f, promptHierarchy: arr };
    });
  }, []);

  // ── Quick-set fading order ─────────────────────────────────────────────────
  const setFadingOrder = useCallback((order: "mtl" | "ltm") => {
    const target = order === "mtl" ? MTL_ORDER : LTM_ORDER;
    setForm(f => {
      const current = [...f.promptHierarchy];
      // Sort current hierarchy to match target order, preserving only what's already in it
      const filtered = target.filter(p => current.includes(p));
      // Also keep any custom prompts not in the standard set
      const extras = current.filter(p => !target.includes(p));
      const newHierarchy = [...filtered, ...extras];
      const newStart = order === "mtl" ? (newHierarchy[0] ?? "full_physical") : (newHierarchy[0] ?? "independent");
      return { ...f, promptHierarchy: newHierarchy, currentPromptLevel: newStart };
    });
  }, []);

  // ── Steps management ───────────────────────────────────────────────────────
  const addStep = useCallback(() => {
    const id = `step-${Date.now()}`;
    setSteps(prev => [...prev, {
      id,
      name: "",
      sdInstruction: "",
      targetResponse: "",
      materials: "",
      promptStrategy: "",
      errorCorrection: form.defaultErrorCorrection,
      reinforcementNotes: "",
    }]);
    setExpandedStep(id);
  }, [form.defaultErrorCorrection]);

  const removeStep = useCallback((id: string) => {
    setSteps(prev => prev.filter(s => s.id !== id));
  }, []);

  const updateStep = useCallback((id: string, field: keyof StepDef, value: string) => {
    setSteps(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }, []);

  const handleBulkImport = useCallback(() => {
    const lines = bulkInput.split("\n").map(l => l.trim()).filter(Boolean);
    const newSteps: StepDef[] = lines.map((line, i) => ({
      id: `bulk-${Date.now()}-${i}`,
      name: line,
      sdInstruction: "", targetResponse: "", materials: "",
      promptStrategy: "", errorCorrection: form.defaultErrorCorrection,
      reinforcementNotes: "",
    }));
    setSteps(prev => [...prev, ...newSteps]);
    setBulkInput("");
    setShowBulkImport(false);
    toast.success(`Added ${newSteps.length} steps`);
  }, [bulkInput, form.defaultErrorCorrection]);

  const wizardSteps = ["Program Type", "Configuration", "Steps", "Review"];

  // ── Save ───────────────────────────────────────────────────────────────────
  async function save() {
    if (!form.name.trim()) { toast.error("Program name is required"); return; }
    setSaving(true);
    try {
      const targetCriterion = `${form.masteryCriterionPercent}% across ${form.masteryCriterionSessions} sessions`;
      const stepPayload = steps.map((s, i) => ({
        name:               s.name || `Step ${i + 1}`,
        sdInstruction:      s.sdInstruction      || null,
        targetResponse:     s.targetResponse     || null,
        materials:          s.materials          || null,
        promptStrategy:     s.promptStrategy     || null,
        errorCorrection:    s.errorCorrection    || null,
        reinforcementNotes: s.reinforcementNotes || null,
      }));

      if (isEditing) {
        await updateProgramTarget(editingProgram.id, {
          ...form,
          targetCriterion,
        } as any);

        const existingStepsData = (await listProgramSteps(editingProgram.id as number)) as any[];
        for (const es of existingStepsData) {
          await deleteProgramStep(es.id);
        }
        for (const s of stepPayload) {
          await createProgramStep(editingProgram.id as number, s as any);
        }
        toast.success("Program updated");
      } else {
        await createProgramTarget(studentId, {
          ...form,
          targetCriterion,
          steps: stepPayload,
        } as any);
        toast.success("Program created");
      }
      onSaved();
    } catch {
      toast.error("Failed to save program");
    }
    setSaving(false);
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const isMtl = isMtlOrder(form.promptHierarchy);
  const fadingLabel = isMtl ? "Most-to-Least (MTL)" : "Least-to-Most (LTM)";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl shadow-xl my-auto max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 p-4 md:p-5 flex items-center justify-between z-10 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{isEditing ? "Edit Program" : "Program Builder"}</h2>
            <p className="text-xs text-gray-400">{studentName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {/* Wizard step tabs */}
        <div className="flex items-center gap-0 px-4 pt-3 flex-shrink-0">
          {wizardSteps.map((ws, i) => (
            <div key={ws} className="flex items-center">
              <button
                onClick={() => { if (i <= step || isEditing) setStep(i); }}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-all ${
                  i === step        ? "bg-emerald-100 text-emerald-800" :
                  i < step          ? "bg-emerald-100 text-emerald-700 cursor-pointer" :
                                      "bg-gray-100 text-gray-400"
                }`}
              >
                {i < step ? <Check className="w-3 h-3" /> : <span className="w-3 text-center">{i + 1}</span>}
                <span className="hidden sm:inline">{ws}</span>
              </button>
              {i < wizardSteps.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-gray-300 mx-1" />}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5">

          {/* ─── Step 0: Program Type ─────────────────────────────────────── */}
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

          {/* ─── Step 1: Configuration ───────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-6">

              {/* Section A: Program Identity */}
              <section>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">Program Identity</p>
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
                      rows={2} placeholder="What the student will demonstrate as evidence of this skill..."
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
              </section>

              {/* Section B: Starting State */}
              <section className="border-t border-gray-100 pt-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Starting Phase</p>
                <p className="text-[11px] text-gray-400 mb-3">
                  {isEditing
                    ? "Current program phase — change with caution. Use the phase history panel to track transitions."
                    : "How to classify this program when it is first created."}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {STARTING_PHASES.map(ph => {
                    const Icon = ph.icon;
                    const selected = form.phase === ph.value;
                    return (
                      <button key={ph.value}
                        onClick={() => setForm(f => ({ ...f, phase: ph.value as "baseline" | "training" }))}
                        className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                          selected ? ph.activeColor : "border-gray-100 hover:border-gray-200 bg-white"
                        }`}
                      >
                        <div className={`mt-0.5 rounded-lg p-1.5 ${selected ? "bg-white/60" : "bg-gray-50"}`}>
                          <Icon className="w-4 h-4 text-gray-600" />
                        </div>
                        <div>
                          <p className="text-[12px] font-semibold text-gray-700">{ph.label}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{ph.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Section C: Prompt Hierarchy */}
              <section className="border-t border-gray-100 pt-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Prompt Hierarchy</p>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-gray-500 mr-1">Quick set:</span>
                    <button onClick={() => setFadingOrder("mtl")}
                      className={`flex items-center gap-0.5 text-[9px] px-2 py-1 rounded font-medium border ${
                        isMtl ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                      }`}>
                      <ChevronsDown className="w-2.5 h-2.5" /> MTL
                    </button>
                    <button onClick={() => setFadingOrder("ltm")}
                      className={`flex items-center gap-0.5 text-[9px] px-2 py-1 rounded font-medium border ${
                        !isMtl ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                      }`}>
                      <ChevronsUp className="w-2.5 h-2.5" /> LTM
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 mb-3 p-2 bg-blue-50/60 rounded-lg">
                  <Info className="w-3 h-3 text-blue-400 flex-shrink-0" />
                  <p className="text-[10px] text-blue-700">
                    Current order: <strong>{fadingLabel}</strong>. Drag to reorder. Select "Set Start" to set the opening prompt level.
                    {isMtl
                      ? " MTL = begin with maximum support and fade toward independence."
                      : " LTM = begin at independence and add prompts only as needed."}
                  </p>
                </div>

                <div className="space-y-1">
                  {form.promptHierarchy.map((level: string, idx: number) => {
                    const info = PROMPT_LABELS[level];
                    const Icon = info?.icon;
                    const isStart = form.currentPromptLevel === level;
                    return (
                      <div key={level} className={`flex items-center gap-2 p-2 rounded-lg border ${
                        isStart ? "border-emerald-300 bg-emerald-50" : "border-gray-100 bg-white"
                      }`}>
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => movePromptLevel(idx, "up")} disabled={idx === 0}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button onClick={() => movePromptLevel(idx, "down")} disabled={idx === form.promptHierarchy.length - 1}
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="text-[10px] text-gray-400 w-4 text-center">{idx + 1}</span>
                        {Icon && <Icon className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${info?.color ?? "bg-gray-100"}`}>
                          {info?.label ?? level}
                        </span>
                        {isStart && (
                          <span className="text-[9px] text-emerald-700 font-semibold ml-1 px-1.5 py-0.5 bg-emerald-100 rounded-full">
                            Starting level
                          </span>
                        )}
                        <button
                          className="text-[10px] text-blue-600 ml-auto hover:text-blue-800 font-medium"
                          onClick={() => setForm(f => ({ ...f, currentPromptLevel: level }))}
                        >
                          {isStart ? "✓ Start" : "Set Start"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Section D: Mastery & Auto-Progress */}
              <section className="border-t border-gray-100 pt-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">Mastery & Auto-Progress</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Mastery %</label>
                    <input type="number" min={1} max={100} value={form.masteryCriterionPercent}
                      onChange={e => setForm(f => ({ ...f, masteryCriterionPercent: parseInt(e.target.value) || 80 }))}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Mastery Sessions</label>
                    <input type="number" min={1} value={form.masteryCriterionSessions}
                      onChange={e => setForm(f => ({ ...f, masteryCriterionSessions: parseInt(e.target.value) || 3 }))}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Regression %</label>
                    <input type="number" min={0} max={100} value={form.regressionThreshold}
                      onChange={e => setForm(f => ({ ...f, regressionThreshold: parseInt(e.target.value) || 50 }))}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Regression Sessions</label>
                    <input type="number" min={1} value={form.regressionSessions}
                      onChange={e => setForm(f => ({ ...f, regressionSessions: parseInt(e.target.value) || 2 }))}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                  <input type="checkbox" checked={form.autoProgressEnabled}
                    onChange={e => setForm(f => ({ ...f, autoProgressEnabled: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-[12px] font-medium text-gray-700">Auto-progress through prompt hierarchy on mastery</span>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      When mastery is met ({form.masteryCriterionPercent}% × {form.masteryCriterionSessions} sessions), automatically
                      advance the prompt level. If performance drops below {form.regressionThreshold}% for {form.regressionSessions} sessions,
                      the system will revert the prompt level or reopen the phase.
                    </p>
                  </div>
                </label>
              </section>

              {/* Section E: Reinforcement & Error Correction */}
              <section className="border-t border-gray-100 pt-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-3">Reinforcement & Error Correction</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[12px] font-medium text-gray-500">Reinforcement Schedule</label>
                    <select value={form.reinforcementSchedule} onChange={e => setForm(f => ({ ...f, reinforcementSchedule: e.target.value }))}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                      {REINFORCEMENT_SCHEDULES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[12px] font-medium text-gray-500">Reinforcer Type</label>
                    <input value={form.reinforcementType} onChange={e => setForm(f => ({ ...f, reinforcementType: e.target.value }))}
                      placeholder="e.g. Token board, edible, social praise"
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-[12px] font-medium text-gray-500">
                      Default Error Correction Procedure
                      <span className="ml-1 text-[10px] text-gray-400 font-normal">(pre-fills new steps; each step can override)</span>
                    </label>
                    <select value={form.defaultErrorCorrection}
                      onChange={e => setForm(f => ({ ...f, defaultErrorCorrection: e.target.value }))}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                      {ERROR_CORRECTIONS.map(ec => <option key={ec.value} value={ec.value}>{ec.label}</option>)}
                    </select>
                  </div>
                </div>
              </section>

              {/* Section F: Tutor Instructions */}
              <section className="border-t border-gray-100 pt-5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Tutor Instructions</p>
                <p className="text-[10px] text-gray-400 mb-2">Step-by-step guidance for the paraprofessional or therapist. Visible during live data collection.</p>
                <textarea value={form.tutorInstructions} onChange={e => setForm(f => ({ ...f, tutorInstructions: e.target.value }))}
                  rows={4} placeholder={"1. Seat student at table.\n2. Present 3-item array.\n3. Say 'Touch [color]'.\n4. Wait 3 seconds for response.\n5. Apply prompt if no response."}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none font-mono" />
              </section>

            </div>
          )}

          {/* ─── Step 2: Steps ───────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Program Steps ({steps.length})</p>
                  {form.programType === "task_analysis" && (
                    <p className="text-[10px] text-gray-400 mt-0.5">Task Analysis — each step is chained sequentially. Track independence per step.</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-[11px] h-7" onClick={() => setShowBulkImport(!showBulkImport)}>
                    {showBulkImport ? "Cancel" : "Bulk Import"}
                  </Button>
                  <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] h-7" onClick={addStep}>
                    <Plus className="w-3 h-3 mr-1" /> Add Step
                  </Button>
                </div>
              </div>

              {form.defaultErrorCorrection && (
                <div className="flex items-center gap-2 text-[10px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                  Default error correction: <strong>{ERROR_CORRECTIONS.find(e => e.value === form.defaultErrorCorrection)?.label ?? form.defaultErrorCorrection}</strong>
                  &nbsp;— applied to new steps. Each step can override.
                </div>
              )}

              {showBulkImport && (
                <Card className="border-emerald-200 bg-emerald-50/30">
                  <CardContent className="p-3 space-y-2">
                    <p className="text-[11px] text-gray-500">Enter one step per line:</p>
                    <textarea value={bulkInput} onChange={e => setBulkInput(e.target.value)}
                      rows={5} placeholder={"Touch red\nTouch blue\nTouch green\nTouch yellow"}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none bg-white" />
                    <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] h-7"
                      onClick={handleBulkImport} disabled={!bulkInput.trim()}>
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
                    <div className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedStep(expandedStep === s.id ? null : s.id)}>
                      <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      <span className="text-[12px] font-bold text-gray-400 w-6">{idx + 1}</span>
                      <input value={s.name} onChange={e => { e.stopPropagation(); updateStep(s.id, "name", e.target.value); }}
                        onClick={e => e.stopPropagation()} placeholder={`Step ${idx + 1} name`}
                        className="flex-1 text-[13px] font-medium text-gray-700 bg-transparent border-none focus:outline-none focus:ring-0" />
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {s.errorCorrection && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 hidden md:block">
                            {ERROR_CORRECTIONS.find(e => e.value === s.errorCorrection)?.label?.split(" ")[0] ?? "EC"}
                          </span>
                        )}
                        <button onClick={e => { e.stopPropagation(); moveStep(idx, "up"); }} disabled={idx === 0}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                        <button onClick={e => { e.stopPropagation(); moveStep(idx, "down"); }} disabled={idx === steps.length - 1}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                        <button onClick={e => { e.stopPropagation(); removeStep(s.id); }}
                          className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    {expandedStep === s.id && (
                      <div className="border-t border-gray-100 p-3 space-y-3 bg-gray-50/50">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-[11px] font-medium text-gray-500">SD / Instruction</label>
                            <input value={s.sdInstruction} onChange={e => updateStep(s.id, "sdInstruction", e.target.value)}
                              placeholder='e.g. "Touch [color]"'
                              className="w-full mt-0.5 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200" />
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-gray-500">Target Response</label>
                            <input value={s.targetResponse} onChange={e => updateStep(s.id, "targetResponse", e.target.value)}
                              placeholder="e.g. Touches correct color card"
                              className="w-full mt-0.5 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200" />
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-gray-500">Materials / Stimuli</label>
                            <input value={s.materials} onChange={e => updateStep(s.id, "materials", e.target.value)}
                              placeholder="e.g. Color cards, 3-item array"
                              className="w-full mt-0.5 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200" />
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-gray-500">Prompt Strategy (this step)</label>
                            <select value={s.promptStrategy} onChange={e => updateStep(s.id, "promptStrategy", e.target.value)}
                              className="w-full mt-0.5 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200">
                              <option value="">Same as program default</option>
                              {PROMPT_STEP_STRATEGIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                            </select>
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-[11px] font-medium text-gray-500">Error Correction (this step)</label>
                            <select value={s.errorCorrection} onChange={e => updateStep(s.id, "errorCorrection", e.target.value)}
                              className="w-full mt-0.5 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200">
                              {ERROR_CORRECTIONS.map(ec => <option key={ec.value} value={ec.value}>{ec.label || "Program default"}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-gray-500">Reinforcement Notes (this step)</label>
                            <input value={s.reinforcementNotes} onChange={e => updateStep(s.id, "reinforcementNotes", e.target.value)}
                              placeholder="e.g. Token + verbal praise for correct"
                              className="w-full mt-0.5 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── Step 3: Review ──────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-600">Review Program</p>
              <Card>
                <CardContent className="p-4 space-y-4">
                  {/* Name / type / phase */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h3 className="text-[15px] font-bold text-gray-800">{form.name || "Untitled Program"}</h3>
                      {form.description && <p className="text-[11px] text-gray-400 mt-0.5">{form.description}</p>}
                      {form.domain && <p className="text-[10px] text-gray-400 mt-0.5">Domain: {form.domain}</p>}
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-medium">
                        {PROGRAM_TYPES.find(pt => pt.value === form.programType)?.label ?? form.programType}
                      </span>
                      {(() => {
                        const phCfg = STARTING_PHASES.find(p => p.value === form.phase);
                        return phCfg ? (
                          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${phCfg.color}`}>
                            Starting: {phCfg.label}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>

                  {/* Clinical summary grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="text-[9px] text-gray-400 uppercase tracking-wide">Start Prompt</p>
                      <p className="text-[12px] font-bold text-gray-600 mt-0.5">
                        {PROMPT_LABELS[form.currentPromptLevel]?.short ?? form.currentPromptLevel}
                      </p>
                      <p className="text-[9px] text-gray-400">{isMtl ? "MTL fading" : "LTM fading"}</p>
                    </div>
                    <div className="bg-emerald-50 rounded-lg p-2 text-center">
                      <p className="text-[9px] text-gray-400 uppercase tracking-wide">Mastery</p>
                      <p className="text-[12px] font-bold text-emerald-700 mt-0.5">{form.masteryCriterionPercent}%</p>
                      <p className="text-[9px] text-gray-400">×{form.masteryCriterionSessions} sessions</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-2 text-center">
                      <p className="text-[9px] text-gray-400 uppercase tracking-wide">Regression</p>
                      <p className="text-[12px] font-bold text-amber-700 mt-0.5">&lt;{form.regressionThreshold}%</p>
                      <p className="text-[9px] text-gray-400">×{form.regressionSessions} sessions</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2 text-center">
                      <p className="text-[9px] text-gray-400 uppercase tracking-wide">Auto-Progress</p>
                      <p className={`text-[12px] font-bold mt-0.5 ${form.autoProgressEnabled ? "text-emerald-600" : "text-gray-400"}`}>
                        {form.autoProgressEnabled ? "Enabled" : "Off"}
                      </p>
                    </div>
                  </div>

                  {/* Reinforcement & error correction */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-[10px] font-semibold text-gray-500 mb-0.5">Reinforcement</p>
                      <p className="text-[11px] text-gray-700 capitalize">{form.reinforcementSchedule.replace(/_/g, " ")}</p>
                      {form.reinforcementType && <p className="text-[10px] text-gray-400">{form.reinforcementType}</p>}
                    </div>
                    {form.defaultErrorCorrection && (
                      <div className="bg-gray-50 rounded-lg p-2.5">
                        <p className="text-[10px] font-semibold text-gray-500 mb-0.5">Default Error Correction</p>
                        <p className="text-[11px] text-gray-700">
                          {ERROR_CORRECTIONS.find(e => e.value === form.defaultErrorCorrection)?.label ?? form.defaultErrorCorrection}
                        </p>
                      </div>
                    )}
                    <div className="bg-gray-50 rounded-lg p-2.5">
                      <p className="text-[10px] font-semibold text-gray-500 mb-0.5">Prompt Hierarchy</p>
                      <p className="text-[11px] text-gray-700">{fadingLabel}</p>
                      <p className="text-[9px] text-gray-400">{form.promptHierarchy.length} levels · starts at {PROMPT_LABELS[form.currentPromptLevel]?.label ?? form.currentPromptLevel}</p>
                    </div>
                  </div>

                  {/* Tutor instructions */}
                  {form.tutorInstructions && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                      <p className="text-[10px] font-semibold text-amber-700 mb-0.5"><BookOpen className="w-3 h-3 inline mr-0.5" />Tutor Instructions</p>
                      <p className="text-[11px] text-amber-800 whitespace-pre-wrap">{form.tutorInstructions}</p>
                    </div>
                  )}

                  {/* Steps */}
                  {steps.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-500 mb-1.5">{steps.length} Steps</p>
                      <div className="space-y-1">
                        {steps.map((s, i) => (
                          <div key={s.id} className="flex items-start gap-2 p-2 bg-gray-50 rounded text-[11px]">
                            <span className="text-gray-400 font-bold w-5 text-center flex-shrink-0">{i + 1}</span>
                            <div className="min-w-0">
                              <span className="text-gray-700 font-medium">{s.name || `Step ${i + 1}`}</span>
                              {s.sdInstruction && <span className="text-gray-400 text-[10px] ml-1.5">SD: "{s.sdInstruction}"</span>}
                              {s.errorCorrection && (
                                <span className="ml-1.5 text-[9px] px-1 py-0.5 bg-gray-100 text-gray-500 rounded">
                                  {ERROR_CORRECTIONS.find(e => e.value === s.errorCorrection)?.label?.split(" ")[0]}
                                </span>
                              )}
                              {s.reinforcementNotes && <p className="text-[9px] text-gray-400 mt-0.5">{s.reinforcementNotes}</p>}
                            </div>
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

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex items-center justify-between flex-shrink-0">
          <Button variant="outline" size="sm" className="text-[12px]" onClick={() => step > 0 ? setStep(step - 1) : onClose()}>
            <ChevronLeft className="w-3.5 h-3.5 mr-1" /> {step > 0 ? "Back" : "Cancel"}
          </Button>
          {step < 3 ? (
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" onClick={() => setStep(step + 1)}>
              Next <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          ) : (
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]"
              onClick={save} disabled={saving || !form.name.trim()}>
              <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : (isEditing ? "Update Program" : "Create Program")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
