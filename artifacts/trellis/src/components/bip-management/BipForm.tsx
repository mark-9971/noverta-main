import { X } from "lucide-react";
import { BipFormState, FUNCTION_OPTIONS } from "./types";

function FormField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
      />
    </div>
  );
}

function FormTextarea({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600 resize-y"
      />
    </div>
  );
}

export function BipForm({
  form,
  setForm,
  editing,
  saving,
  onSave,
  onCancel,
  fbas,
  behaviorTargets,
}: {
  form: BipFormState;
  setForm: (f: BipFormState) => void;
  editing: boolean;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
  fbas: any[];
  behaviorTargets: any[];
}) {
  const update = (key: keyof BipFormState, value: string) => setForm({ ...form, [key]: value });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-xl">
          <h2 className="text-base font-semibold text-gray-800">{editing ? "Edit BIP" : "New Behavior Intervention Plan"}</h2>
          <button onClick={onCancel} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Target Behavior *" value={form.targetBehavior} onChange={v => update("targetBehavior", v)} />
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Hypothesized Function *</label>
              <select
                value={form.hypothesizedFunction}
                onChange={e => update("hypothesizedFunction", e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              >
                {FUNCTION_OPTIONS.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
              </select>
            </div>
          </div>

          <FormTextarea label="Operational Definition *" value={form.operationalDefinition} onChange={v => update("operationalDefinition", v)} rows={3} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {behaviorTargets.length > 0 && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Linked Behavior Target</label>
                <select
                  value={form.behaviorTargetId}
                  onChange={e => update("behaviorTargetId", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                >
                  <option value="">None</option>
                  {behaviorTargets.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            {fbas.length > 0 && (
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Linked FBA</label>
                <select
                  value={form.fbaId}
                  onChange={e => update("fbaId", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                >
                  <option value="">None</option>
                  {fbas.map((f: any) => <option key={f.id} value={f.id}>{f.targetBehavior} ({f.status})</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Intervention Strategies</h3>
            <div className="space-y-3">
              <FormTextarea label="Replacement Behaviors" value={form.replacementBehaviors} onChange={v => update("replacementBehaviors", v)} rows={2} />
              <FormTextarea label="Prevention / Antecedent Strategies" value={form.preventionStrategies} onChange={v => update("preventionStrategies", v)} rows={2} />
              <FormTextarea label="Teaching Strategies" value={form.teachingStrategies} onChange={v => update("teachingStrategies", v)} rows={2} />
              <FormTextarea label="Consequence Strategies" value={form.consequenceStrategies} onChange={v => update("consequenceStrategies", v)} rows={2} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Reinforcement & Crisis</h3>
            <div className="space-y-3">
              <FormTextarea label="Reinforcement Schedule" value={form.reinforcementSchedule} onChange={v => update("reinforcementSchedule", v)} rows={2} />
              <FormTextarea label="Crisis Plan" value={form.crisisPlan} onChange={v => update("crisisPlan", v)} rows={2} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Data & Progress</h3>
            <div className="space-y-3">
              <FormTextarea label="Data Collection Method" value={form.dataCollectionMethod} onChange={v => update("dataCollectionMethod", v)} rows={2} />
              <FormTextarea label="Progress Criteria" value={form.progressCriteria} onChange={v => update("progressCriteria", v)} rows={2} />
              <FormTextarea label="Implementation Notes" value={form.implementationNotes} onChange={v => update("implementationNotes", v)} rows={2} />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={e => update("status", e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="under_review">Under Review</option>
                </select>
              </div>
              <FormField label="Effective Date" value={form.effectiveDate} onChange={v => update("effectiveDate", v)} type="date" />
              <FormField label="Review Date" value={form.reviewDate} onChange={v => update("reviewDate", v)} type="date" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-xl">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-600/90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : editing ? "Update BIP" : "Create BIP"}
          </button>
        </div>
      </div>
    </div>
  );
}
