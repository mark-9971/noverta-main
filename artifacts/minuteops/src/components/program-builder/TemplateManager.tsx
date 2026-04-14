import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  X, Save, Plus, Search, Copy, Crown, Lock, Globe, Building2, User,
  Trash2, Edit3, Eye, Layers, ChevronDown, ChevronRight, Star, Sparkles,
  BookOpen, Target, Settings2, ArrowUp, ArrowDown, Hand, Mic, Zap, Check,
  AlertTriangle, GripVertical
} from "lucide-react";
import { toast } from "sonner";
import {
  listProgramTemplates, cloneTemplateToStudent, duplicateProgramTemplate,
  deleteProgramTemplate, createProgramTemplate, updateProgramTemplate,
} from "@workspace/api-client-react";

interface ProgramTemplate {
  id: number; name: string; description: string; category: string;
  programType: string; domain: string; isGlobal: boolean; schoolId: number | null;
  tier: string; tags: string[]; usageCount: number; createdBy: number | null;
  promptHierarchy: string[]; defaultMasteryPercent: number;
  defaultMasterySessions: number; defaultRegressionThreshold: number;
  defaultReinforcementSchedule: string; defaultReinforcementType: string;
  tutorInstructions: string;
  steps: Array<{ name: string; sdInstruction?: string; targetResponse?: string; materials?: string; promptStrategy?: string; errorCorrection?: string }>;
  createdAt: string; updatedAt: string;
}

const PROMPT_LABELS: Record<string, { label: string; color: string }> = {
  full_physical: { label: "Full Physical", color: "bg-red-100 text-red-700" },
  partial_physical: { label: "Partial Physical", color: "bg-amber-100 text-amber-700" },
  model: { label: "Model", color: "bg-amber-100 text-amber-700" },
  gestural: { label: "Gestural", color: "bg-gray-50 text-gray-600" },
  verbal: { label: "Verbal", color: "bg-gray-100 text-gray-700" },
  independent: { label: "Independent", color: "bg-emerald-100 text-emerald-700" },
};

const PROGRAM_TYPE_LABELS: Record<string, string> = {
  discrete_trial: "DTT",
  task_analysis: "Task Analysis",
  natural_environment: "NET",
  fluency: "Fluency",
};

const DOMAINS = [
  "Language", "Social Skills", "Academic", "Daily Living", "Motor Skills",
  "Play Skills", "Self-Help", "Communication", "Behavior", "Cognitive", "Vocational",
];

const REINFORCEMENT_SCHEDULES = [
  { value: "continuous", label: "CRF" },
  { value: "fixed_ratio", label: "FR" },
  { value: "variable_ratio", label: "VR" },
  { value: "fixed_interval", label: "FI" },
  { value: "variable_interval", label: "VI" },
];

const ERROR_CORRECTIONS = [
  { value: "4_step", label: "4-Step" },
  { value: "model_prompt_transfer", label: "Model-Prompt-Transfer" },
  { value: "backstep", label: "Backstep" },
  { value: "re_present", label: "Re-present" },
  { value: "show_correct", label: "Show Correct" },
  { value: "none", label: "None" },
];

interface TemplateManagerProps {
  studentId: number;
  onCloned: () => void;
  onTemplateUpdated: () => void;
}

export default function TemplateManager({ studentId, onCloned, onTemplateUpdated }: TemplateManagerProps) {
  const [templates, setTemplates] = useState<ProgramTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [scopeFilter, setScopeFilter] = useState<"all" | "global" | "school" | "custom">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [tierFilter, setTierFilter] = useState<"all" | "free" | "premium">("all");
  const [selectedTemplate, setSelectedTemplate] = useState<ProgramTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ProgramTemplate | null>(null);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [cloning, setCloning] = useState<number | null>(null);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await listProgramTemplates({
        search: search || undefined,
        scope: scopeFilter !== "all" ? scopeFilter : undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        tier: tierFilter !== "all" ? tierFilter : undefined,
      } as any);
      setTemplates(data);
    } catch {
      toast.error("Failed to load templates");
    }
    setLoading(false);
  }, [search, scopeFilter, categoryFilter, tierFilter]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  async function cloneToStudent(template: ProgramTemplate) {
    if (template.tier === "premium") {
      setShowUpgradeModal(true);
      return;
    }
    setCloning(template.id);
    try {
      await cloneTemplateToStudent(template.id, { studentId });
      toast.success(`"${template.name}" applied to student`);
      onCloned();
    } catch { toast.error("Network error"); }
    setCloning(null);
  }

  async function duplicateTemplate(id: number) {
    try {
      await duplicateProgramTemplate(id);
      toast.success("Template duplicated");
      loadTemplates();
      onTemplateUpdated();
    } catch { toast.error("Failed to duplicate template"); }
  }

  async function deleteTemplate(id: number) {
    if (!confirm("Delete this template? This cannot be undone.")) return;
    try {
      await deleteProgramTemplate(id);
      toast.success("Template deleted");
      setSelectedTemplate(null);
      loadTemplates();
      onTemplateUpdated();
    } catch { toast.error("Failed to delete template"); }
  }

  const filtered = templates;

  const scopeButtons = [
    { key: "all" as const, label: "All", icon: Layers },
    { key: "global" as const, label: "Global", icon: Globe },
    { key: "school" as const, label: "School", icon: Building2 },
    { key: "custom" as const, label: "Custom", icon: User },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-600">Template Library</h3>
        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8"
          onClick={() => setShowCreateTemplate(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Create Template
        </Button>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search templates..."
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {scopeButtons.map(s => (
            <button key={s.key} onClick={() => setScopeFilter(s.key)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                scopeFilter === s.key ? "bg-white text-gray-700 shadow-sm" : "text-gray-500 hover:text-gray-600"
              }`}>
              <s.icon className="w-3 h-3" /> {s.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {["all", "academic", "behavior"].map(c => (
            <button key={c} onClick={() => setCategoryFilter(c)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all capitalize ${
                categoryFilter === c ? "bg-white text-gray-700 shadow-sm" : "text-gray-500 hover:text-gray-600"
              }`}>{c}</button>
          ))}
        </div>

        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {([["all", "All"], ["free", "Free"], ["premium", "Premium"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setTierFilter(k)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                tierFilter === k ? "bg-white text-gray-700 shadow-sm" : "text-gray-500 hover:text-gray-600"
              }`}>
              {k === "premium" && <Crown className="w-3 h-3 text-amber-500" />}
              {l}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading templates...</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          <Layers className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="text-sm font-medium">No templates found</p>
          <p className="text-xs mt-1">Try adjusting your filters or create a new template</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(t => (
            <Card key={t.id} className="hover:shadow-md transition-all cursor-pointer group relative"
              onClick={() => setSelectedTemplate(t)}>
              <CardContent className="p-3.5 md:p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-[13px] font-semibold text-gray-700 truncate">{t.name}</p>
                      {t.tier === "premium" && <Crown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {t.domain || t.category} · {PROGRAM_TYPE_LABELS[t.programType] ?? t.programType}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {t.isGlobal ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">Global</span>
                    ) : t.schoolId ? (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">School</span>
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">Custom</span>
                    )}
                  </div>
                </div>

                {t.description && <p className="text-[11px] text-gray-500 mb-2 line-clamp-2">{t.description}</p>}

                <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-3 flex-wrap">
                  {(t.steps as any[])?.length > 0 && <span>{(t.steps as any[]).length} steps</span>}
                  <span>Mastery: {t.defaultMasteryPercent}%</span>
                  {t.usageCount > 0 && <span>{t.usageCount} uses</span>}
                </div>

                {(t.tags as string[])?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {(t.tags as string[]).slice(0, 3).map(tag => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{tag}</span>
                    ))}
                  </div>
                )}

                <div className="flex gap-1.5">
                  <Button size="sm" className={`flex-1 h-8 text-[11px] ${
                    t.tier === "premium" ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700" : "bg-emerald-700 hover:bg-emerald-800"
                  } text-white`}
                    onClick={e => { e.stopPropagation(); cloneToStudent(t); }} disabled={cloning === t.id}>
                    {t.tier === "premium" ? <Lock className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                    {cloning === t.id ? "Applying..." : (t.tier === "premium" ? "Upgrade to Use" : "Apply to Student")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedTemplate && (
        <TemplatePreviewModal
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onClone={() => { cloneToStudent(selectedTemplate); setSelectedTemplate(null); }}
          onEdit={() => { setEditingTemplate(selectedTemplate); setSelectedTemplate(null); }}
          onDuplicate={() => { duplicateTemplate(selectedTemplate.id); setSelectedTemplate(null); }}
          onDelete={() => { deleteTemplate(selectedTemplate.id); }}
          cloning={cloning === selectedTemplate.id}
        />
      )}

      {editingTemplate && (
        <TemplateEditorModal
          template={editingTemplate}
          onClose={() => setEditingTemplate(null)}
          onSaved={() => { setEditingTemplate(null); loadTemplates(); onTemplateUpdated(); }}
        />
      )}

      {showCreateTemplate && (
        <TemplateEditorModal
          template={null}
          onClose={() => setShowCreateTemplate(false)}
          onSaved={() => { setShowCreateTemplate(false); loadTemplates(); onTemplateUpdated(); }}
        />
      )}

      {showUpgradeModal && (
        <UpgradeModal onClose={() => setShowUpgradeModal(false)} />
      )}
    </div>
  );
}

function TemplatePreviewModal({ template, onClose, onClone, onEdit, onDuplicate, onDelete, cloning }: {
  template: ProgramTemplate; onClose: () => void; onClone: () => void;
  onEdit: () => void; onDuplicate: () => void; onDelete: () => void; cloning: boolean;
}) {
  const [showSteps, setShowSteps] = useState(true);
  const isPremium = template.tier === "premium";
  const stepsArr = (template.steps as any[]) ?? [];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl my-auto max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 p-4 md:p-5 flex items-center justify-between z-10">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-gray-800">{template.name}</h2>
              {isPremium && <Crown className="w-4 h-4 text-amber-500" />}
            </div>
            <p className="text-xs text-gray-400">
              {template.domain || template.category} · {PROGRAM_TYPE_LABELS[template.programType] ?? template.programType}
              {template.isGlobal ? " · Global" : template.schoolId ? " · School" : " · Custom"}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 md:p-5 space-y-4">
          {isPremium && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-lg p-3.5 flex items-start gap-3">
              <Crown className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[13px] font-semibold text-amber-800">Premium Template</p>
                <p className="text-[11px] text-amber-600 mt-0.5">Upgrade your plan to access this professionally designed template with evidence-based protocols.</p>
              </div>
            </div>
          )}

          {template.description && (
            <p className="text-[13px] text-gray-600">{template.description}</p>
          )}

          {template.tutorInstructions && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[12px] text-amber-800">
              <BookOpen className="w-4 h-4 inline mr-1.5" /> <strong>Tutor Instructions:</strong> {template.tutorInstructions}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-gray-400">Mastery</p>
              <p className="text-sm font-bold text-gray-600">{template.defaultMasteryPercent}% x{template.defaultMasterySessions}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-gray-400">Regression</p>
              <p className="text-sm font-bold text-gray-600">&lt;{template.defaultRegressionThreshold}%</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-gray-400">Reinforcement</p>
              <p className="text-sm font-bold text-gray-600 capitalize">{(template.defaultReinforcementSchedule || "CRF").replace(/_/g, " ")}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-2.5 text-center">
              <p className="text-[10px] text-gray-400">Uses</p>
              <p className="text-sm font-bold text-emerald-700">{template.usageCount}</p>
            </div>
          </div>

          {(template.tags as string[])?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {(template.tags as string[]).map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">{tag}</span>
              ))}
            </div>
          )}

          {template.promptHierarchy && (
            <div>
              <p className="text-[12px] font-semibold text-gray-500 mb-2">Prompt Hierarchy</p>
              <div className="flex flex-wrap gap-1">
                {(template.promptHierarchy as string[]).map((level, i) => (
                  <span key={level} className={`text-[10px] font-medium px-2 py-0.5 rounded ${PROMPT_LABELS[level]?.color ?? "bg-gray-100"}`}>
                    {i + 1}. {PROMPT_LABELS[level]?.label ?? level}
                  </span>
                ))}
              </div>
            </div>
          )}

          {stepsArr.length > 0 && (
            <div>
              <button onClick={() => setShowSteps(!showSteps)} className="flex items-center gap-1 text-[12px] font-semibold text-gray-600 mb-2">
                {showSteps ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {stepsArr.length} Steps {isPremium && "(Preview)"}
              </button>
              {showSteps && (
                <div className={`space-y-1 ${isPremium ? "opacity-60 select-none" : ""}`}>
                  {stepsArr.slice(0, isPremium ? 3 : undefined).map((s: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-gray-50 rounded text-[12px]">
                      <span className="text-gray-400 font-bold w-5 text-center flex-shrink-0">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-gray-700 font-medium">{s.name}</p>
                        {s.sdInstruction && <p className="text-[10px] text-gray-400 mt-0.5">SD: "{s.sdInstruction}"</p>}
                        {s.targetResponse && <p className="text-[10px] text-gray-400">R: {s.targetResponse}</p>}
                        {s.materials && <p className="text-[10px] text-gray-400">Materials: {s.materials}</p>}
                      </div>
                    </div>
                  ))}
                  {isPremium && stepsArr.length > 3 && (
                    <div className="text-center py-2 text-[11px] text-amber-600 font-medium">
                      <Lock className="w-3 h-3 inline mr-1" />
                      +{stepsArr.length - 3} more steps (upgrade to view)
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex items-center justify-between">
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={onEdit}>
              <Edit3 className="w-3 h-3 mr-1" /> Edit
            </Button>
            <Button variant="outline" size="sm" className="text-[11px] h-8" onClick={onDuplicate}>
              <Copy className="w-3 h-3 mr-1" /> Duplicate
            </Button>
            <Button variant="outline" size="sm" className="text-[11px] h-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={onDelete}>
              <Trash2 className="w-3 h-3 mr-1" /> Delete
            </Button>
          </div>
          <Button size="sm" className={`text-[12px] h-8 ${
            isPremium ? "bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700" : "bg-emerald-700 hover:bg-emerald-800"
          } text-white`} onClick={onClone} disabled={cloning}>
            {isPremium ? <><Lock className="w-3 h-3 mr-1" /> Upgrade to Use</> : <><Copy className="w-3 h-3 mr-1" /> Apply to Student</>}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TemplateEditorModal({ template, onClose, onSaved }: {
  template: ProgramTemplate | null; onClose: () => void; onSaved: () => void;
}) {
  const isNew = !template;
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: template?.name ?? "",
    description: template?.description ?? "",
    category: template?.category ?? "academic",
    programType: template?.programType ?? "discrete_trial",
    domain: template?.domain ?? "",
    isGlobal: template?.isGlobal ?? false,
    schoolId: template?.schoolId ?? null,
    tier: template?.tier ?? "free",
    tags: (template?.tags as string[]) ?? [],
    tutorInstructions: template?.tutorInstructions ?? "",
    promptHierarchy: (template?.promptHierarchy as string[]) ?? ["full_physical","partial_physical","model","gestural","verbal","independent"],
    defaultMasteryPercent: template?.defaultMasteryPercent ?? 80,
    defaultMasterySessions: template?.defaultMasterySessions ?? 3,
    defaultRegressionThreshold: template?.defaultRegressionThreshold ?? 50,
    defaultReinforcementSchedule: template?.defaultReinforcementSchedule ?? "continuous",
    defaultReinforcementType: template?.defaultReinforcementType ?? "",
    steps: (template?.steps as any[]) ?? [],
  });
  const [newTag, setNewTag] = useState("");
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [tab, setTab] = useState<"config" | "steps">("config");

  function addTag() {
    if (!newTag.trim() || form.tags.includes(newTag.trim())) return;
    setForm(f => ({ ...f, tags: [...f.tags, newTag.trim()] }));
    setNewTag("");
  }

  function addStep() {
    setForm(f => ({
      ...f,
      steps: [...f.steps, { name: "", sdInstruction: "", targetResponse: "", materials: "", promptStrategy: "", errorCorrection: "" }],
    }));
    setExpandedStep(form.steps.length);
  }

  function moveStepFn(idx: number, dir: "up" | "down") {
    setForm(f => {
      const arr = [...f.steps];
      const newIdx = dir === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= arr.length) return f;
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return { ...f, steps: arr };
    });
  }

  async function save() {
    if (!form.name.trim()) { toast.error("Template name is required"); return; }
    setSaving(true);
    try {
      if (isNew) {
        await createProgramTemplate(form as any);
      } else {
        await updateProgramTemplate(template!.id, form as any);
      }
      toast.success(isNew ? "Template created" : "Template updated");
      onSaved();
    } catch { toast.error("Network error"); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl my-auto max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-gray-100 p-4 md:p-5 flex items-center justify-between z-10 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-800">{isNew ? "Create Template" : "Edit Template"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-1 px-4 pt-3 bg-white flex-shrink-0">
          <button onClick={() => setTab("config")} className={`px-3 py-1.5 rounded-full text-[12px] font-medium ${tab === "config" ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200"}`}>
            Configuration
          </button>
          <button onClick={() => setTab("steps")} className={`px-3 py-1.5 rounded-full text-[12px] font-medium ${tab === "steps" ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200"}`}>
            Steps ({form.steps.length})
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-5 space-y-4">
          {tab === "config" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="text-[12px] font-medium text-gray-500">Template Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Receptive Identification: Colors" autoFocus
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[12px] font-medium text-gray-500">Description</label>
                  <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    rows={2} placeholder="Describe the template purpose..."
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                    <option value="academic">Academic</option>
                    <option value="behavior">Behavior</option>
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-medium text-gray-500">Program Type</label>
                  <select value={form.programType} onChange={e => setForm(f => ({ ...f, programType: e.target.value }))}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                    <option value="discrete_trial">Discrete Trial (DTT)</option>
                    <option value="task_analysis">Task Analysis</option>
                    <option value="natural_environment">Natural Environment Teaching</option>
                    <option value="fluency">Fluency Building</option>
                  </select>
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
                  <label className="text-[12px] font-medium text-gray-500">Tier</label>
                  <select value={form.tier} onChange={e => setForm(f => ({ ...f, tier: e.target.value }))}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                    <option value="free">Free</option>
                    <option value="premium">Premium</option>
                  </select>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <p className="text-[12px] font-semibold text-gray-600 mb-2">Scope</p>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={form.isGlobal} onChange={() => setForm(f => ({ ...f, isGlobal: true, schoolId: null }))}
                      className="w-4 h-4" />
                    <span className="text-[12px] text-gray-600"><Globe className="w-3 h-3 inline mr-1" />Global (all schools)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={!form.isGlobal} onChange={() => setForm(f => ({ ...f, isGlobal: false }))}
                      className="w-4 h-4" />
                    <span className="text-[12px] text-gray-600"><Building2 className="w-3 h-3 inline mr-1" />School / Custom</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="text-[12px] font-medium text-gray-500">Tutor Instructions</label>
                <textarea value={form.tutorInstructions} onChange={e => setForm(f => ({ ...f, tutorInstructions: e.target.value }))}
                  rows={3} placeholder="Detailed instructions for the tutor..."
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-gray-400">Mastery %</label>
                  <input type="number" value={form.defaultMasteryPercent} onChange={e => setForm(f => ({ ...f, defaultMasteryPercent: parseInt(e.target.value) || 80 }))}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-400">Mastery Sessions</label>
                  <input type="number" value={form.defaultMasterySessions} onChange={e => setForm(f => ({ ...f, defaultMasterySessions: parseInt(e.target.value) || 3 }))}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-400">Regression Threshold %</label>
                  <input type="number" value={form.defaultRegressionThreshold} onChange={e => setForm(f => ({ ...f, defaultRegressionThreshold: parseInt(e.target.value) || 50 }))}
                    className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                </div>
              </div>

              <div>
                <label className="text-[12px] font-medium text-gray-500 mb-1.5 block">Tags</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {form.tags.map(tag => (
                    <span key={tag} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                      {tag}
                      <button onClick={() => setForm(f => ({ ...f, tags: f.tags.filter(t => t !== tag) }))} className="hover:text-red-500">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="Add tag..."
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200" />
                  <Button variant="outline" size="sm" className="text-[11px] h-7" onClick={addTag} disabled={!newTag.trim()}>Add</Button>
                </div>
              </div>
            </>
          )}

          {tab === "steps" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-gray-500">{form.steps.length} steps defined</p>
                <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] h-7" onClick={addStep}>
                  <Plus className="w-3 h-3 mr-1" /> Add Step
                </Button>
              </div>

              {form.steps.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-[12px]">No steps defined yet</p>
                </div>
              )}

              <div className="space-y-1.5">
                {form.steps.map((s: any, idx: number) => (
                  <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                    <div className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedStep(expandedStep === idx ? null : idx)}>
                      <span className="text-[12px] font-bold text-gray-400 w-5">{idx + 1}</span>
                      <input value={s.name} onClick={e => e.stopPropagation()}
                        onChange={e => {
                          const arr = [...form.steps];
                          arr[idx] = { ...arr[idx], name: e.target.value };
                          setForm(f => ({ ...f, steps: arr }));
                        }}
                        placeholder={`Step ${idx + 1}`}
                        className="flex-1 text-[13px] font-medium text-gray-700 bg-transparent border-none focus:outline-none" />
                      <div className="flex items-center gap-1">
                        <button onClick={e => { e.stopPropagation(); moveStepFn(idx, "up"); }} disabled={idx === 0}
                          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                        <button onClick={e => { e.stopPropagation(); moveStepFn(idx, "down"); }} disabled={idx === form.steps.length - 1}
                          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
                        <button onClick={e => { e.stopPropagation(); setForm(f => ({ ...f, steps: f.steps.filter((_: any, i: number) => i !== idx) })); }}
                          className="p-0.5 text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </div>
                    {expandedStep === idx && (
                      <div className="border-t border-gray-100 p-3 space-y-2 bg-gray-50/50">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] font-medium text-gray-400">SD Instruction</label>
                            <input value={s.sdInstruction ?? ""} onChange={e => {
                              const arr = [...form.steps];
                              arr[idx] = { ...arr[idx], sdInstruction: e.target.value };
                              setForm(f => ({ ...f, steps: arr }));
                            }} placeholder="e.g. Touch red"
                              className="w-full mt-0.5 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200" />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-gray-400">Target Response</label>
                            <input value={s.targetResponse ?? ""} onChange={e => {
                              const arr = [...form.steps];
                              arr[idx] = { ...arr[idx], targetResponse: e.target.value };
                              setForm(f => ({ ...f, steps: arr }));
                            }} placeholder="Expected response"
                              className="w-full mt-0.5 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200" />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-gray-400">Materials</label>
                            <input value={s.materials ?? ""} onChange={e => {
                              const arr = [...form.steps];
                              arr[idx] = { ...arr[idx], materials: e.target.value };
                              setForm(f => ({ ...f, steps: arr }));
                            }} placeholder="Required materials"
                              className="w-full mt-0.5 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200" />
                          </div>
                          <div>
                            <label className="text-[10px] font-medium text-gray-400">Error Correction</label>
                            <select value={s.errorCorrection ?? ""} onChange={e => {
                              const arr = [...form.steps];
                              arr[idx] = { ...arr[idx], errorCorrection: e.target.value };
                              setForm(f => ({ ...f, steps: arr }));
                            }} className="w-full mt-0.5 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-200">
                              <option value="">Select...</option>
                              {ERROR_CORRECTIONS.map(ec => <option key={ec.value} value={ec.value}>{ec.label}</option>)}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex justify-end gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" className="text-[12px]" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" onClick={save} disabled={saving || !form.name.trim()}>
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : (isNew ? "Create Template" : "Save Changes")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function UpgradeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 p-6 text-white text-center">
          <Crown className="w-12 h-12 mx-auto mb-3 drop-shadow-lg" />
          <h2 className="text-xl font-bold">Upgrade to Pro</h2>
          <p className="text-sm mt-1 text-white/80">Access 100+ premium evidence-based program templates</p>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-3">
            {[
              "Evidence-based DTT & TA program templates",
              "Expert-designed prompt hierarchies",
              "Built-in error correction protocols",
              "Comprehensive tutor instructions",
              "School-wide template management",
              "Priority support & training",
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-2.5 text-[13px] text-gray-600">
                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>

          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <p className="text-[11px] text-gray-400 mb-1">Starting at</p>
            <p className="text-3xl font-bold text-gray-800">$29<span className="text-sm font-normal text-gray-400">/mo</span></p>
            <p className="text-[11px] text-gray-400 mt-1">per school · billed annually</p>
          </div>

          <Button className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white h-10 text-[13px] font-semibold"
            onClick={() => { toast.info("Upgrade flow coming soon!"); onClose(); }}>
            <Sparkles className="w-4 h-4 mr-2" /> Start Free Trial
          </Button>

          <button onClick={onClose} className="w-full text-center text-[12px] text-gray-400 hover:text-gray-600">
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
