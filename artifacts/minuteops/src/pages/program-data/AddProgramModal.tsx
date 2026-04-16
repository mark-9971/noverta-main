import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Save } from "lucide-react";
import { toast } from "sonner";
import { createProgramTarget, cloneTemplateToStudent } from "@workspace/api-client-react";
import { ProgramTemplate } from "./constants";

interface Props {
  studentId: number;
  templates: ProgramTemplate[];
  onClose: () => void;
  onSaved: () => void;
}

export default function AddProgramModal({ studentId, templates, onClose, onSaved }: Props) {
  const [mode, setMode] = useState<"manual" | "template">("manual");
  const [name, setName] = useState("");
  const [programType, setProgramType] = useState("discrete_trial");
  const [domain, setDomain] = useState("");
  const [description, setDescription] = useState("");
  const [tutorInstructions, setTutorInstructions] = useState("");
  const [masteryPct, setMasteryPct] = useState("80");
  const [masterySessions, setMasterySessions] = useState("3");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Please enter a program name"); return; }
    setSaving(true);
    try {
      await createProgramTarget(studentId, {
          name: name.trim(), description: description || null, programType,
          domain: domain || null, tutorInstructions: tutorInstructions || null,
          masteryCriterionPercent: parseInt(masteryPct) || 80,
          masteryCriterionSessions: parseInt(masterySessions) || 3,
          targetCriterion: `${masteryPct}% across ${masterySessions} sessions`,
        });
      toast.success("Program target added"); onSaved();
    } catch { toast.error("Failed to save program target"); }
    setSaving(false);
  }

  async function cloneTemplate(templateId: number) {
    setSaving(true);
    await cloneTemplateToStudent(templateId, { studentId });
    onSaved();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 md:p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-gray-800">Add Skill Program</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex gap-2 mb-4">
          <button onClick={() => setMode("manual")} className={`px-3 py-1.5 rounded-full text-[12px] font-medium ${mode === "manual" ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200"}`}>
            Create Manually
          </button>
          <button onClick={() => setMode("template")} className={`px-3 py-1.5 rounded-full text-[12px] font-medium ${mode === "template" ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200"}`}>
            From Template
          </button>
        </div>

        {mode === "template" ? (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {templates.filter(t => t.category === "academic").map(t => (
              <button key={t.id} onClick={() => cloneTemplate(t.id)} disabled={saving}
                className="w-full text-left p-3 rounded-lg border border-gray-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all">
                <p className="text-[13px] font-semibold text-gray-700">{t.name}</p>
                <p className="text-[11px] text-gray-400">{t.domain} · {(t.steps as any[])?.length ?? 0} steps · Mastery {t.defaultMasteryPercent}%</p>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500">Program Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Receptive ID: Colors"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">Description</label>
              <input value={description} onChange={e => setDescription(e.target.value)} placeholder="What the student will demonstrate"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-medium text-gray-500">Type</label>
                <select value={programType} onChange={e => setProgramType(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                  <option value="discrete_trial">Discrete Trial (DTT)</option>
                  <option value="task_analysis">Task Analysis</option>
                </select>
              </div>
              <div>
                <label className="text-[12px] font-medium text-gray-500">Domain</label>
                <input value={domain} onChange={e => setDomain(e.target.value)} placeholder="e.g. Language"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">Tutor Instructions</label>
              <textarea value={tutorInstructions} onChange={e => setTutorInstructions(e.target.value)}
                rows={2} placeholder="Instructions for the tutor..."
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[12px] font-medium text-gray-500">Mastery %</label>
                <input type="number" value={masteryPct} onChange={e => setMasteryPct(e.target.value)} placeholder="80"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
              <div>
                <label className="text-[12px] font-medium text-gray-500">Sessions Required</label>
                <input type="number" value={masterySessions} onChange={e => setMasterySessions(e.target.value)} placeholder="3"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
            </div>
          </div>
        )}

        {mode === "manual" && (
          <div className="flex justify-end gap-2 mt-5">
            <Button variant="outline" size="sm" onClick={onClose} className="text-[12px] h-9 md:h-8">Cancel</Button>
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-9 md:h-8" disabled={!name.trim() || saving} onClick={save}>
              <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Program"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
