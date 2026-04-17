import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardList, Plus, Save, ChevronRight, Brain } from "lucide-react";
import { toast } from "sonner";
import { createFba, updateFba } from "@workspace/api-client-react";
import { FUNCTION_OPTIONS } from "./constants";
import { StatusBadge, FunctionBadge, EmptyState } from "./shared";
import type { FbaRecord, Student } from "./types";

export function FbaListPanel({ fbas, selectedFba, student, onSelect, showNew, onShowNew, onCreated }: {
  fbas: FbaRecord[]; selectedFba: FbaRecord | null; student: Student;
  onSelect: (f: FbaRecord) => void; showNew: boolean; onShowNew: (v: boolean) => void; onCreated: () => void;
}) {
  const [form, setForm] = useState({
    targetBehavior: "", operationalDefinition: "", referralReason: "", settingDescription: ""
  });
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!form.targetBehavior || !form.operationalDefinition) {
      toast.error("Target behavior and operational definition are required");
      return;
    }
    setSaving(true);
    try {
      await createFba(student.id, { ...form, status: "draft" });
      toast.success("FBA created");
      setForm({ targetBehavior: "", operationalDefinition: "", referralReason: "", settingDescription: "" });
      onCreated();
    } catch { toast.error("Failed to create FBA"); }
    setSaving(false);
  };

  const updateFbaField = async (fbaId: number, field: string, value: string) => {
    try {
      await updateFba(fbaId, { [field]: value } as any);
    } catch { toast.error("Failed to update"); }
  };

  const updateFbaStatus = async (fbaId: number, status: string) => {
    try {
      await updateFba(fbaId, { status } as any);
      toast.success(`Status updated to ${status}`); onCreated();
    } catch { toast.error("Failed to update status"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Functional Behavior Assessments</h2>
        <Button size="sm" onClick={() => onShowNew(!showNew)} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="w-4 h-4 mr-1" /> New FBA
        </Button>
      </div>

      {showNew && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardContent className="pt-5 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700">Target Behavior *</label>
              <input value={form.targetBehavior} onChange={e => setForm(p => ({ ...p, targetBehavior: e.target.value }))}
                placeholder="e.g., Physical aggression toward peers"
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700">Operational Definition *</label>
              <textarea value={form.operationalDefinition} onChange={e => setForm(p => ({ ...p, operationalDefinition: e.target.value }))}
                rows={3} placeholder="Observable, measurable description of the behavior..."
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Referral Reason</label>
                <input value={form.referralReason} onChange={e => setForm(p => ({ ...p, referralReason: e.target.value }))}
                  placeholder="Why was this FBA requested?"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Setting Description</label>
                <input value={form.settingDescription} onChange={e => setForm(p => ({ ...p, settingDescription: e.target.value }))}
                  placeholder="e.g., General education classroom, resource room"
                  className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => onShowNew(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
                <Save className="w-4 h-4 mr-1" /> Create FBA
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {fbas.length === 0 && !showNew ? (
        <EmptyState icon={ClipboardList} message="No FBAs yet. Create one to begin assessment." />
      ) : (
        <div className="space-y-2">
          {fbas.map(fba => (
            <Card key={fba.id}
              className={`cursor-pointer transition hover:border-emerald-300 ${selectedFba?.id === fba.id ? "border-emerald-400 ring-1 ring-emerald-200" : ""}`}
              onClick={() => onSelect(fba)}
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">{fba.targetBehavior}</h3>
                      <StatusBadge status={fba.status} />
                    </div>
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{fba.operationalDefinition}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      {fba.hypothesizedFunction && (
                        <span className="flex items-center gap-1">
                          <Brain className="w-3 h-3" /> Function: <FunctionBadge func={fba.hypothesizedFunction} />
                        </span>
                      )}
                      {fba.conductedByName && <span>By: {fba.conductedByName}</span>}
                      <span>{new Date(fba.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    {fba.status === "draft" && (
                      <Button variant="ghost" size="sm" className="text-xs"
                        onClick={(e) => { e.stopPropagation(); updateFbaStatus(fba.id, "in-progress"); }}>
                        Start
                      </Button>
                    )}
                    {fba.status === "in-progress" && (
                      <Button variant="ghost" size="sm" className="text-xs text-emerald-600"
                        onClick={(e) => { e.stopPropagation(); updateFbaStatus(fba.id, "completed"); }}>
                        Complete
                      </Button>
                    )}
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {selectedFba?.id === fba.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100 space-y-3" onClick={e => e.stopPropagation()}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600">Indirect Assessment Methods</label>
                        <textarea defaultValue={fba.indirectMethods || ""}
                          onBlur={e => updateFbaField(fba.id, "indirectMethods", e.target.value)}
                          rows={2} placeholder="Interviews, rating scales, record review..."
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Indirect Findings</label>
                        <textarea defaultValue={fba.indirectFindings || ""}
                          onBlur={e => updateFbaField(fba.id, "indirectFindings", e.target.value)}
                          rows={2} placeholder="Summary of interview/rating scale results..."
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Direct Observation Methods</label>
                        <textarea defaultValue={fba.directMethods || ""}
                          onBlur={e => updateFbaField(fba.id, "directMethods", e.target.value)}
                          rows={2} placeholder="ABC recording, scatter plot, frequency count..."
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Direct Findings</label>
                        <textarea defaultValue={fba.directFindings || ""}
                          onBlur={e => updateFbaField(fba.id, "directFindings", e.target.value)}
                          rows={2} placeholder="Patterns observed in ABC data..."
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Hypothesis Narrative</label>
                      <textarea defaultValue={fba.hypothesisNarrative || ""}
                        onBlur={e => updateFbaField(fba.id, "hypothesisNarrative", e.target.value)}
                        rows={3} placeholder="When [antecedent], [student] engages in [behavior] in order to [function]..."
                        className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-gray-600">Hypothesized Function</label>
                        <select defaultValue={fba.hypothesizedFunction || ""}
                          onChange={e => updateFbaField(fba.id, "hypothesizedFunction", e.target.value)}
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500">
                          <option value="">Select...</option>
                          {FUNCTION_OPTIONS.map(f => <option key={f} value={f} className="capitalize">{f}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">Recommendations</label>
                        <textarea defaultValue={fba.recommendations || ""}
                          onBlur={e => updateFbaField(fba.id, "recommendations", e.target.value)}
                          rows={2} placeholder="Develop BIP, conduct FA, environmental modifications..."
                          className="w-full mt-1 px-2 py-1.5 border border-gray-200 rounded text-sm resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500" />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
