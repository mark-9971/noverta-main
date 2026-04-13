import { createContext, useContext, useState, type ReactNode } from "react";

interface SchoolContextType {
  selectedSchoolId: number | null;
  selectedDistrictId: number | null;
  setSelectedSchoolId: (id: number | null) => void;
  setSelectedDistrictId: (id: number | null) => void;
  filterParams: Record<string, string>;
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

  const filterParams: Record<string, string> = {};
  if (selectedSchoolId) filterParams.schoolId = String(selectedSchoolId);
  else if (selectedDistrictId) filterParams.districtId = String(selectedDistrictId);

  return (
    <SchoolContext.Provider value={{ selectedSchoolId, selectedDistrictId, setSelectedSchoolId, setSelectedDistrictId, filterParams }}>
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchoolContext() {
  const ctx = useContext(SchoolContext);
  if (!ctx) throw new Error("useSchoolContext must be used within SchoolProvider");
  return ctx;
}
