import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Plus, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { createAccommodation, deleteAccommodation } from "@workspace/api-client-react";

export interface Accommodation {
  id: number; studentId: number; category: string; description: string;
  setting: string | null; frequency: string | null; provider: string | null; active: boolean;
}

const ACCOMMODATION_CATEGORIES = [
  { value: "instruction", label: "Instruction" },
  { value: "assessment", label: "Assessment" },
  { value: "environment", label: "Environment" },
  { value: "materials", label: "Materials" },
  { value: "behavioral", label: "Behavioral" },
  { value: "communication", label: "Communication" },
  { value: "other", label: "Other" },
];

const ACCOMMODATION_TEMPLATES: Array<{ category: string; description: string; setting?: string; frequency?: string }> = [
  { category: "instruction", description: "Extended time (1.5×) for assignments and tests", setting: "All settings", frequency: "As needed" },
  { category: "instruction", description: "Directions repeated or re-read as needed", setting: "All settings", frequency: "As needed" },
  { category: "instruction", description: "Preferential seating near the teacher or board", setting: "Classroom", frequency: "Daily" },
  { category: "instruction", description: "Chunked assignments into smaller steps", setting: "All settings", frequency: "Daily" },
  { category: "instruction", description: "Check-ins for comprehension during instruction", setting: "Classroom", frequency: "Daily" },
  { category: "instruction", description: "Use of visual supports and graphic organizers", setting: "Classroom", frequency: "Daily" },
  { category: "instruction", description: "Verbal rather than written responses allowed", setting: "All settings", frequency: "As needed" },
  { category: "instruction", description: "Reduced assignment length (same learning objectives)", setting: "Classroom", frequency: "Daily" },
  { category: "assessment", description: "Extended time (1.5×) on all assessments", setting: "Testing", frequency: "All assessments" },
  { category: "assessment", description: "Extended time (2×) on all assessments", setting: "Testing", frequency: "All assessments" },
  { category: "assessment", description: "Separate, distraction-reduced testing environment", setting: "Testing", frequency: "All assessments" },
  { category: "assessment", description: "Test questions read aloud by adult or text-to-speech", setting: "Testing", frequency: "All assessments" },
  { category: "assessment", description: "Scribe — adult records student's oral responses", setting: "Testing", frequency: "All assessments" },
  { category: "assessment", description: "Calculator permitted for computation sections", setting: "Testing", frequency: "As specified" },
  { category: "assessment", description: "Breaks during assessments as needed", setting: "Testing", frequency: "All assessments" },
  { category: "assessment", description: "MCAS: approved accessibility and accommodation features per DESE guidelines", setting: "MCAS only", frequency: "MCAS testing" },
  { category: "environment", description: "Access to quiet work area to reduce distractions", setting: "School building", frequency: "As needed" },
  { category: "environment", description: "Flexible seating (wobble chair, standing desk)", setting: "Classroom", frequency: "Daily" },
  { category: "environment", description: "Movement breaks scheduled throughout the day", setting: "All settings", frequency: "Daily" },
  { category: "environment", description: "Noise-canceling headphones available for use", setting: "All settings", frequency: "As needed" },
  { category: "materials", description: "Printed copy of notes or teacher slides provided in advance", setting: "Classroom", frequency: "Daily" },
  { category: "materials", description: "Text-to-speech software (e.g., Read&Write, Kurzweil)", setting: "All settings", frequency: "As needed" },
  { category: "materials", description: "Word processing with spell-check for written work", setting: "All settings", frequency: "As needed" },
  { category: "materials", description: "Graphic organizers and visual aids provided", setting: "Classroom", frequency: "Daily" },
  { category: "materials", description: "Highlighted or color-coded reading materials", setting: "Classroom", frequency: "As needed" },
  { category: "behavioral", description: "Behavior intervention plan (BIP) in effect — see attached", setting: "All settings", frequency: "Daily" },
  { category: "behavioral", description: "Positive reinforcement system aligned with BIP goals", setting: "All settings", frequency: "Daily" },
  { category: "behavioral", description: "Check-in/check-out (CICO) daily self-monitoring", setting: "All settings", frequency: "Daily" },
  { category: "behavioral", description: "Designated quiet space for emotional regulation breaks", setting: "School building", frequency: "As needed" },
  { category: "behavioral", description: "Advance notice of transitions and schedule changes", setting: "All settings", frequency: "As needed" },
  { category: "communication", description: "Augmentative and Alternative Communication (AAC) device access", setting: "All settings", frequency: "Daily" },
  { category: "communication", description: "Speech-language supports embedded into instruction", setting: "Classroom", frequency: "Daily" },
  { category: "communication", description: "Visual schedule provided and reviewed at start of day", setting: "All settings", frequency: "Daily" },
  { category: "communication", description: "Use of picture symbols or communication boards", setting: "All settings", frequency: "As needed" },
];

export function AccommodationsSection({ studentId, accommodations, onSaved }: {
  studentId: number; accommodations: Accommodation[]; onSaved: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateFilter, setTemplateFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState("instruction");
  const [description, setDescription] = useState("");
  const [setting, setSetting] = useState("");
  const [frequency, setFrequency] = useState("");
  const [provider, setProvider] = useState("");

  function applyTemplate(t: typeof ACCOMMODATION_TEMPLATES[0]) {
    setCategory(t.category);
    setDescription(t.description);
    setSetting(t.setting ?? "");
    setFrequency(t.frequency ?? "");
    setProvider("");
    setShowTemplates(false);
    setShowAdd(true);
  }

  const filteredTemplates = templateFilter === "all"
    ? ACCOMMODATION_TEMPLATES
    : ACCOMMODATION_TEMPLATES.filter(t => t.category === templateFilter);

  async function addAccommodation() {
    if (!description.trim()) return;
    setSaving(true);
    try {
      await createAccommodation(studentId, {
          category, description: description.trim(),
          setting: setting || null, frequency: frequency || null, provider: provider || null,
        });
      setDescription(""); setSetting(""); setFrequency(""); setProvider("");
      setShowAdd(false);
      onSaved();
    } catch (e) {
      console.error("Failed to add accommodation:", e);
    }
    setSaving(false);
  }

  async function removeAccommodation(id: number) {
    try {
      await deleteAccommodation(id);
      onSaved();
    } catch { toast.error("Failed to remove accommodation"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-700">Accommodations & Modifications</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="text-[12px] h-7 gap-1" onClick={() => { setShowTemplates(!showTemplates); setShowAdd(false); }}>
            <Sparkles className="w-3 h-3" /> From Template
          </Button>
          <Button size="sm" variant="outline" className="text-[12px] h-7" onClick={() => { setShowAdd(!showAdd); setShowTemplates(false); }}>
            <Plus className="w-3 h-3 mr-1" /> Add Custom
          </Button>
        </div>
      </div>

      {showTemplates && (
        <div className="border border-emerald-200 rounded-xl bg-emerald-50/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">603 CMR 28 Accommodation Templates</p>
            <button onClick={() => setShowTemplates(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[{ value: "all", label: "All" }, ...ACCOMMODATION_CATEGORIES].map(c => (
              <button key={c.value} onClick={() => setTemplateFilter(c.value)}
                className={`px-2.5 py-1 text-[11px] rounded-full font-medium border transition-colors ${templateFilter === c.value ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"}`}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {filteredTemplates.map((t, i) => {
              const alreadyAdded = accommodations.some(a => a.description === t.description && a.active);
              return (
                <div key={i} className={`flex items-start justify-between gap-3 p-2.5 rounded-lg bg-white border ${alreadyAdded ? "border-gray-100 opacity-50" : "border-gray-200 hover:border-emerald-200 cursor-pointer"}`}
                  onClick={() => !alreadyAdded && applyTemplate(t)}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-gray-800">{t.description}</p>
                    <div className="flex gap-3 mt-0.5 text-[10px] text-gray-400">
                      {t.setting && <span>{t.setting}</span>}
                      {t.frequency && <span>{t.frequency}</span>}
                    </div>
                  </div>
                  {alreadyAdded
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    : <Plus className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {accommodations.length === 0 && !showAdd && !showTemplates && (
        <div className="text-center py-10 border border-dashed border-gray-200 rounded-lg">
          <p className="text-sm text-gray-400">No accommodations recorded.</p>
          <div className="flex gap-2 justify-center mt-3">
            <Button size="sm" variant="outline" className="text-[12px] gap-1" onClick={() => setShowTemplates(true)}>
              <Sparkles className="w-3 h-3" /> From Template
            </Button>
            <Button size="sm" variant="outline" className="text-[12px]" onClick={() => setShowAdd(true)}>
              <Plus className="w-3 h-3 mr-1" /> Add Custom
            </Button>
          </div>
        </div>
      )}

      {ACCOMMODATION_CATEGORIES.map(cat => {
        const items = accommodations.filter(a => a.category === cat.value && a.active);
        if (items.length === 0) return null;
        return (
          <div key={cat.value} className="space-y-2">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{cat.label}</p>
            {items.map(acc => (
              <div key={acc.id} className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-3 group">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-gray-800">{acc.description}</p>
                  <div className="flex flex-wrap gap-3 mt-1 text-[11px] text-gray-400">
                    {acc.setting && <span>Setting: {acc.setting}</span>}
                    {acc.frequency && <span>Frequency: {acc.frequency}</span>}
                    {acc.provider && <span>Provider: {acc.provider}</span>}
                  </div>
                </div>
                <button onClick={() => removeAccommodation(acc.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 flex-shrink-0 mt-0.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        );
      })}

      {showAdd && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
          <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">New Accommodation</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                {ACCOMMODATION_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Setting (optional)</label>
              <input value={setting} onChange={e => setSetting(e.target.value)}
                placeholder="e.g. All settings, Testing only"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 font-medium">Description *</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="Describe the accommodation or modification…"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Frequency (optional)</label>
              <input value={frequency} onChange={e => setFrequency(e.target.value)}
                placeholder="e.g. Daily, As needed"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Provider (optional)</label>
              <input value={provider} onChange={e => setProvider(e.target.value)}
                placeholder="e.g. Special Ed Teacher"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8"
              onClick={addAccommodation} disabled={saving || !description.trim()}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
