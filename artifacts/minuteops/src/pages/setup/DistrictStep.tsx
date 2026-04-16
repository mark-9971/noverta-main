import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, CheckCircle, Loader2, ArrowLeft, ArrowRight } from "lucide-react";

export interface DistrictStepProps {
  districtName: string;
  setDistrictName: (v: string) => void;
  schoolYear: string;
  setSchoolYear: (v: string) => void;
  editingSchools: { id?: number; name: string }[];
  setEditingSchools: (s: { id?: number; name: string }[]) => void;
  saving: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

export function DistrictStep(p: DistrictStepProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="w-5 h-5 text-emerald-600" />
          Confirm District & Schools
        </CardTitle>
        <p className="text-sm text-gray-500 mt-1">
          Review the information pulled from your SIS. Make any corrections needed.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">District Name</label>
          <input
            type="text"
            value={p.districtName}
            onChange={e => p.setDistrictName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">School Year</label>
          <input
            type="text"
            value={p.schoolYear}
            onChange={e => p.setSchoolYear(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 block mb-2">Schools</label>
          <div className="space-y-2">
            {p.editingSchools.map((school, i) => (
              <div key={school.id || i} className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <input
                  type="text"
                  value={school.name}
                  onChange={e => {
                    const updated = [...p.editingSchools];
                    updated[i] = { ...school, name: e.target.value };
                    p.setEditingSchools(updated);
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <button onClick={p.onBack} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
          <button
            onClick={p.onConfirm}
            disabled={p.saving}
            className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {p.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Confirm & Continue
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
