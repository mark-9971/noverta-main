import { useEffect, useState } from "react";
import { authFetch } from "./auth-fetch";

export interface SchoolYear {
  id: number;
  districtId: number;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
}

let cache: SchoolYear[] | null = null;
let cachePromise: Promise<SchoolYear[]> | null = null;

async function fetchYears(): Promise<SchoolYear[]> {
  if (cache) return cache;
  if (!cachePromise) {
    cachePromise = authFetch("/api/school-years")
      .then(r => r.ok ? r.json() : [])
      .then((data: SchoolYear[]) => { cache = data; return data; })
      .catch(() => []);
  }
  return cachePromise;
}

export function invalidateSchoolYearsCache() {
  cache = null;
  cachePromise = null;
}

export function useSchoolYears() {
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchYears().then(data => {
      setYears(data);
      setLoading(false);
    });
  }, []);

  const activeYear = years.find(y => y.isActive) ?? null;
  return { years, activeYear, loading };
}
