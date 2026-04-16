import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  X, Save, Plus, Globe, Building2, Trash2, Layers, ArrowUp, ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { createProgramTemplate, updateProgramTemplate } from "@workspace/api-client-react";
import { ProgramTemplate, DOMAINS, ERROR_CORRECTIONS } from "./template-types";

interface TemplateEditorProps {
  template: ProgramTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}

export function TemplateEditor({ template, onClose, onSaved }: TemplateEditorProps) {
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
