import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings2, Loader2, ArrowLeft, ArrowRight } from "lucide-react";
import type { ServiceTypeRow } from "./constants";

export interface ServiceTypesStepProps {
  serviceTypes: ServiceTypeRow[];
  setServiceTypes: (s: ServiceTypeRow[]) => void;
  saving: boolean;
  onBack: () => void;
  onSave: () => void;
}

export function ServiceTypesStep(p: ServiceTypesStepProps) {
  const update = (i: number, patch: Partial<ServiceTypeRow>) => {
    const next = [...p.serviceTypes];
    next[i] = { ...next[i], ...patch };
    p.setServiceTypes(next);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-emerald-600" />
          Configure Service Types
        </CardTitle>
        <p className="text-sm text-gray-500 mt-1">
          Select the SPED service types your district provides. You can add more later.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {p.serviceTypes.map((st, i) => (
            <label
              key={st.name}
              className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                st.checked ? "border-emerald-500 bg-emerald-50/50" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <input
                type="checkbox"
                checked={st.checked}
                onChange={e => update(i, { checked: e.target.checked })}
                className="w-4 h-4 text-emerald-600 border-gray-300 rounded focus:ring-emerald-500 mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800">{st.name}</p>
                <p className="text-[11px] text-gray-400 capitalize">{st.category.replace("_", " ")}</p>
                {st.checked && (
                  <div className="flex gap-2 mt-2">
                    <div>
                      <label className="text-[10px] text-gray-400 block">CPT Code</label>
                      <input
                        type="text"
                        value={st.cptCode}
                        onChange={e => update(i, { cptCode: e.target.value })}
                        placeholder="e.g. 92507"
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        onClick={e => e.preventDefault()}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 block">Rate ($/hr)</label>
                      <input
                        type="text"
                        value={st.billingRate}
                        onChange={e => update(i, { billingRate: e.target.value })}
                        placeholder="e.g. 85.00"
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        onClick={e => e.preventDefault()}
                      />
                    </div>
                  </div>
                )}
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-center justify-between pt-2">
          <button onClick={p.onBack} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <button
            onClick={p.onSave}
            disabled={p.saving || p.serviceTypes.filter(s => s.checked).length === 0}
            className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {p.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Save & Continue
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
