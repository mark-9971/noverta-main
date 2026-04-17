import { createContext, useContext, useState, useMemo, type ReactNode } from "react";

interface SchoolDistrictFilter {
  schoolId?: number;
  districtId?: number;
}

interface SchoolContextType {
  selectedSchoolId: number | null;
  selectedDistrictId: number | null;
  setSelectedSchoolId: (id: number | null) => void;
  setSelectedDistrictId: (id: number | null) => void;
  filterParams: Record<string, string>;
  typedFilter: SchoolDistrictFilter;
}

const SchoolContext = createContext<SchoolContextType | null>(null);

export function SchoolProvider({ children }: { children: ReactNode }) {
  const [selectedSchoolId, setSelectedSchoolIdState] = useState<number | null>(() => {
    const saved = localStorage.getItem("trellis_selected_school_id");
    return saved ? Number(saved) : null;
  });
  const [selectedDistrictId, setSelectedDistrictIdState] = useState<number | null>(() => {
    const saved = localStorage.getItem("trellis_selected_district_id");
    return saved ? Number(saved) : null;
  });

  const setSelectedSchoolId = (id: number | null) => {
    setSelectedSchoolIdState(id);
    if (id) {
      localStorage.setItem("trellis_selected_school_id", String(id));
    } else {
      localStorage.removeItem("trellis_selected_school_id");
    }
  };

  const setSelectedDistrictId = (id: number | null) => {
    setSelectedDistrictIdState(id);
    if (id) {
      localStorage.setItem("trellis_selected_district_id", String(id));
    } else {
      localStorage.removeItem("trellis_selected_district_id");
    }
    setSelectedSchoolId(null);
  };

  const filterParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (selectedSchoolId) params.schoolId = String(selectedSchoolId);
    else if (selectedDistrictId) params.districtId = String(selectedDistrictId);
    return params;
  }, [selectedSchoolId, selectedDistrictId]);

  const typedFilter = useMemo((): SchoolDistrictFilter => {
    if (selectedSchoolId) return { schoolId: selectedSchoolId };
    if (selectedDistrictId) return { districtId: selectedDistrictId };
    return {};
  }, [selectedSchoolId, selectedDistrictId]);

  return (
    <SchoolContext.Provider value={{ selectedSchoolId, selectedDistrictId, setSelectedSchoolId, setSelectedDistrictId, filterParams, typedFilter }}>
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchoolContext() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error("useSchoolContext must be used within SchoolProvider");
  return ctx;
}
