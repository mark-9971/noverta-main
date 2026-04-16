export interface QuickLogDefaults {
  recentStudentIds: number[];
  recentServiceTypeIds: number[];
  lastDurationMinutes: number;
}

export interface Student { id: number; firstName: string; lastName: string; }
export interface ServiceType { id: number; name: string; }
export interface MissedReason { id: number; label: string; category: string; }

export type Step = "student" | "service" | "duration" | "outcome" | "reason" | "note" | "review";

export const DURATION_PRESETS = [15, 20, 30, 45, 60];

export const MISSED_QUICK_REASONS = [
  { label: "Student Absent", category: "absent" },
  { label: "Student Refused", category: "refused" },
  { label: "Schedule Conflict", category: "schedule" },
  { label: "Staff Absent", category: "staff" },
  { label: "Other", category: "other" },
];

export function storageKey(staffId: number | null) {
  return `trellis_quicklog_v1_${staffId ?? "anon"}`;
}

export function loadDefaults(staffId: number | null): QuickLogDefaults {
  try {
    const raw = localStorage.getItem(storageKey(staffId));
    if (raw) return JSON.parse(raw) as QuickLogDefaults;
  } catch {}
  return { recentStudentIds: [], recentServiceTypeIds: [], lastDurationMinutes: 30 };
}

export function saveDefaults(staffId: number | null, defaults: QuickLogDefaults) {
  try {
    localStorage.setItem(storageKey(staffId), JSON.stringify(defaults));
  } catch {}
}

export function pushRecent(arr: number[], id: number, max = 5): number[] {
  return [id, ...arr.filter((x) => x !== id)].slice(0, max);
}
