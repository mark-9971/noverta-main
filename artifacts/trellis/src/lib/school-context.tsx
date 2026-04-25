import { createContext, useContext, useState, useMemo, type ReactNode } from "react";
import { migrateLocalGet } from "./storage-migration";

const SCHOOL_KEY = "noverta_selected_school_id";
const DISTRICT_KEY = "noverta_selected_district_id";
const YEAR_KEY = "noverta_selected_year_id";
const LEGACY_SCHOOL_KEY = "trellis_selected_school_id";
const LEGACY_DISTRICT_KEY = "trellis_selected_district_id";
const LEGACY_YEAR_KEY = "trellis_selected_year_id";

interface SchoolDistrictFilter {
  schoolId?: number;
  districtId?: number;
  schoolYearId?: number;
}

interface SchoolContextType {
  selectedSchoolId: number | null;
  selectedDistrictId: number | null;
  selectedYearId: number | null;
  setSelectedSchoolId: (id: number | null) => void;
  setSelectedDistrictId: (id: number | null) => void;
  setSelectedYearId: (id: number | null) => void;
  filterParams: Record<string, string>;
  typedFilter: SchoolDistrictFilter;
}

const SchoolContext = createContext<SchoolContextType | null>(null);

export function SchoolProvider({ children }: { children: ReactNode }) {
  const [selectedSchoolId, setSelectedSchoolIdState] = useState<number | null>(() => {
    const saved = migrateLocalGet(SCHOOL_KEY, LEGACY_SCHOOL_KEY);
    return saved ? Number(saved) : null;
  });
  const [selectedDistrictId, setSelectedDistrictIdState] = useState<number | null>(() => {
    const saved = migrateLocalGet(DISTRICT_KEY, LEGACY_DISTRICT_KEY);
    return saved ? Number(saved) : null;
  });
  const [selectedYearId, setSelectedYearIdState] = useState<number | null>(() => {
    const saved = migrateLocalGet(YEAR_KEY, LEGACY_YEAR_KEY);
    return saved ? Number(saved) : null;
  });

  const setSelectedSchoolId = (id: number | null) => {
    setSelectedSchoolIdState(id);
    if (id) {
      localStorage.setItem(SCHOOL_KEY, String(id));
    } else {
      localStorage.removeItem(SCHOOL_KEY);
      localStorage.removeItem(LEGACY_SCHOOL_KEY);
    }
  };

  const setSelectedDistrictId = (id: number | null) => {
    setSelectedDistrictIdState(id);
    if (id) {
      localStorage.setItem(DISTRICT_KEY, String(id));
    } else {
      localStorage.removeItem(DISTRICT_KEY);
      localStorage.removeItem(LEGACY_DISTRICT_KEY);
    }
    setSelectedSchoolId(null);
  };

  const setSelectedYearId = (id: number | null) => {
    setSelectedYearIdState(id);
    if (id) {
      localStorage.setItem(YEAR_KEY, String(id));
    } else {
      localStorage.removeItem(YEAR_KEY);
      localStorage.removeItem(LEGACY_YEAR_KEY);
    }
  };

  const filterParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (selectedSchoolId) params.schoolId = String(selectedSchoolId);
    else if (selectedDistrictId) params.districtId = String(selectedDistrictId);
    if (selectedYearId) params.schoolYearId = String(selectedYearId);
    return params;
  }, [selectedSchoolId, selectedDistrictId, selectedYearId]);

  const typedFilter = useMemo((): SchoolDistrictFilter => {
    const f: SchoolDistrictFilter = {};
    if (selectedSchoolId) f.schoolId = selectedSchoolId;
    else if (selectedDistrictId) f.districtId = selectedDistrictId;
    if (selectedYearId) f.schoolYearId = selectedYearId;
    return f;
  }, [selectedSchoolId, selectedDistrictId, selectedYearId]);

  return (
    <SchoolContext.Provider value={{
      selectedSchoolId, selectedDistrictId, selectedYearId,
      setSelectedSchoolId, setSelectedDistrictId, setSelectedYearId,
      filterParams, typedFilter,
    }}>
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchoolContext() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error("useSchoolContext must be used within SchoolProvider");
  return ctx;
}
