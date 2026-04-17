import { useMemo } from "react";
import { useListDistricts, useListSchools } from "@workspace/api-client-react";
import { useSchoolContext } from "@/lib/school-context";
import { FlaskConical } from "lucide-react";

interface DistrictLite {
  id: number;
  name: string;
  isDemo?: boolean;
}

interface SchoolLite {
  id: number;
  districtId?: number | null;
}

export function useActiveDemoDistrict() {
  const { selectedDistrictId, selectedSchoolId } = useSchoolContext();
  const { data: districtData } = useListDistricts();
  const { data: schoolData } = useListSchools();
  const districts = (districtData as DistrictLite[] | undefined) ?? [];
  const schools = (schoolData as SchoolLite[] | undefined) ?? [];

  return useMemo(() => {
    if (!districts.length) return null;
    const demoDistrictsById = new Map(districts.filter(d => d.isDemo).map(d => [d.id, d]));
    if (demoDistrictsById.size === 0) return null;

    // Explicit district selection wins.
    if (selectedDistrictId) {
      return demoDistrictsById.get(selectedDistrictId) ?? null;
    }
    // School selection: resolve to its district.
    if (selectedSchoolId) {
      const school = schools.find(s => s.id === selectedSchoolId);
      if (school?.districtId != null) return demoDistrictsById.get(school.districtId) ?? null;
      return null;
    }
    // No selection: only safe to assume demo when the user's scope is a single demo district.
    if (districts.length === 1 && districts[0].isDemo) {
      return districts[0];
    }
    return null;
  }, [districts, schools, selectedDistrictId, selectedSchoolId]);
}

export function DemoBanner() {
  const demoDistrict = useActiveDemoDistrict();
  if (!demoDistrict) return null;

  return (
    <div
      role="status"
      aria-label="Demo data notice"
      className="flex items-center gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-[12px] text-amber-900"
    >
      <FlaskConical className="w-3.5 h-3.5 flex-shrink-0 text-amber-700" />
      <span className="font-semibold">Demo data</span>
      <span className="text-amber-800">
        You're viewing <span className="font-medium">{demoDistrict.name}</span> &mdash;
        a sample district for demos and product tours. No real student records.
      </span>
      <span className="ml-auto hidden sm:inline text-amber-700/80">
        Switch districts in the sidebar to leave demo mode.
      </span>
    </div>
  );
}
