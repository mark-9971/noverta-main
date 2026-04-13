import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Save, Globe, Building2, Crown } from "lucide-react";
import { toast } from "sonner";

const API = "/api";

interface SaveAsTemplateModalProps {
  programId: number;
  programName: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function SaveAsTemplateModal({ programId, programName, onClose, onSaved }: SaveAsTemplateModalProps) {
  const [name, setName] = useState(programName);
  const [description, setDescription] = useState("");
  const [isGlobal, setIsGlobal] = useState(false);
  const [tier, setTier] = useState("free");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) { toast.error("Template name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/program-targets/${programId}/save-as-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description || null, isGlobal, tier }),
      });
      if (res.ok) {
        toast.success("Saved as template");
        onSaved();
      } else toast.error("Failed to save as template");
    } catch { toast.error("Network error"); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 md:p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-slate-800">Save as Template</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-[12px] text-slate-400 mb-4">
          Save this program's configuration, steps, and settings as a reusable template.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-[12px] font-medium text-slate-500">Template Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} autoFocus
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-500">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={2} placeholder="What is this template for?"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-500 mb-2 block">Scope</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={!isGlobal} onChange={() => setIsGlobal(false)} className="w-4 h-4" />
                <span className="text-[12px] text-slate-600"><Building2 className="w-3 h-3 inline mr-1" />My Templates</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={isGlobal} onChange={() => setIsGlobal(true)} className="w-4 h-4" />
                <span className="text-[12px] text-slate-600"><Globe className="w-3 h-3 inline mr-1" />Shared (Global)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="text-[12px] font-medium text-slate-500 mb-2 block">Access Tier</label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={tier === "free"} onChange={() => setTier("free")} className="w-4 h-4" />
                <span className="text-[12px] text-slate-600">Free</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={tier === "premium"} onChange={() => setTier("premium")} className="w-4 h-4" />
                <span className="text-[12px] text-slate-600"><Crown className="w-3 h-3 inline mr-1 text-amber-500" />Premium</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[12px]">Cancel</Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px]" onClick={save} disabled={saving || !name.trim()}>
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Template"}
          </Button>
        </div>
      </div>
    </div>
  );
}
