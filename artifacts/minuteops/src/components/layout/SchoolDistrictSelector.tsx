import { useListSchools, useListDistricts } from "@workspace/api-client-react";
import { useSchoolContext } from "@/lib/school-context";
import { Building2, School, X } from "lucide-react";

export function SchoolDistrictSelector() {
  const { selectedSchoolId, selectedDistrictId, setSelectedSchoolId, setSelectedDistrictId } = useSchoolContext();
  const { data: schools } = useListSchools();
  const { data: districts } = useListDistricts();

  const activeLabel = selectedSchoolId
    ? (schools as any[])?.find((s: any) => s.id === selectedSchoolId)?.name ?? "School"
    : selectedDistrictId
    ? (districts as any[])?.find((d: any) => d.id === selectedDistrictId)?.name ?? "District"
    : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <select
          className="flex-1 text-[11px] border border-slate-200 rounded-md px-2 py-1 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-emerald-400 truncate"
          value={
            selectedSchoolId ? `school:${selectedSchoolId}` :
            selectedDistrictId ? `district:${selectedDistrictId}` : ""
          }
          onChange={(e) => {
            const val = e.target.value;
            if (!val) {
              setSelectedDistrictId(null);
              setSelectedSchoolId(null);
            } else if (val.startsWith("district:")) {
              setSelectedDistrictId(Number(val.split(":")[1]));
            } else if (val.startsWith("school:")) {
              setSelectedDistrictId(null);
              setSelectedSchoolId(Number(val.split(":")[1]));
            }
          }}
        >
          <option value="">All Schools</option>
          {(districts as any[])?.map((d: any) => (
            <optgroup key={d.id} label={d.name}>
              <option value={`district:${d.id}`}>All in {d.name}</option>
              {(schools as any[])?.filter((s: any) => s.districtId === d.id).map((s: any) => (
                <option key={s.id} value={`school:${s.id}`}>{s.name}</option>
              ))}
            </optgroup>
          ))}
          {(schools as any[])?.filter((s: any) => !s.districtId).map((s: any) => (
            <option key={s.id} value={`school:${s.id}`}>{s.name}</option>
          ))}
        </select>
        {(selectedSchoolId || selectedDistrictId) && (
          <button
            className="p-0.5 rounded hover:bg-slate-100 text-slate-400"
            onClick={() => { setSelectedDistrictId(null); setSelectedSchoolId(null); }}
            title="Clear filter"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {activeLabel && (
        <p className="text-[10px] text-emerald-600 font-medium truncate px-0.5">
          Filtering: {activeLabel}
        </p>
      )}
    </div>
  );
}
