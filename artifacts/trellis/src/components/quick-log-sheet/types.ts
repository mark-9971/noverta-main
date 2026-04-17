export interface RecentCombo {
  studentId: number;
  studentName: string;
  serviceTypeId: number | null;
  serviceTypeName: string;
  durationMinutes: number;
}

export interface QuickLogDefaults {
  recentStudentIds: number[];
  recentServiceTypeIds: number[];
  lastDurationMinutes: number;
  recentCombos: RecentCombo[];
  serviceDurations: Record<string, number>;
}

export interface Student { id: number; firstName: string; lastName: string; }
export interface ServiceType { id: number; name: string; }
export interface MissedReason { id: number; label: string; category: string; }

export type Step = "student" | "service" | "duration" | "outcome" | "reason" | "note" | "review" | "success";

export const DURATION_PRESETS = [15, 20, 30, 45, 60];

export const MISSED_QUICK_REASONS = [
  { label: "Student Absent", category: "absent" },
  { label: "Student Refused", category: "refused" },
  { label: "Schedule Conflict", category: "schedule" },
  { label: "Staff Absent", category: "staff" },
  { label: "Other", category: "other" },
];

export function storageKey(staffId: number | null) {
  return `trellis_quicklog_v2_${staffId ?? "anon"}`;
}

export function loadDefaults(staffId: number | null): QuickLogDefaults {
  try {
    const raw = localStorage.getItem(storageKey(staffId));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<QuickLogDefaults>;
      return {
        recentStudentIds: parsed.recentStudentIds ?? [],
        recentServiceTypeIds: parsed.recentServiceTypeIds ?? [],
        lastDurationMinutes: parsed.lastDurationMinutes ?? 30,
        recentCombos: parsed.recentCombos ?? [],
        serviceDurations: parsed.serviceDurations ?? {},
      };
    }
  } catch {}
  try {
    const oldKey = `trellis_quicklog_v1_${staffId ?? "anon"}`;
    const oldRaw = localStorage.getItem(oldKey);
    if (oldRaw) {
      const old = JSON.parse(oldRaw) as Partial<QuickLogDefaults>;
      return {
        recentStudentIds: old.recentStudentIds ?? [],
        recentServiceTypeIds: old.recentServiceTypeIds ?? [],
        lastDurationMinutes: old.lastDurationMinutes ?? 30,
        recentCombos: [],
        serviceDurations: {},
      };
    }
  } catch {}
  return { recentStudentIds: [], recentServiceTypeIds: [], lastDurationMinutes: 30, recentCombos: [], serviceDurations: {} };
}

export function saveDefaults(staffId: number | null, defaults: QuickLogDefaults) {
  try {
    localStorage.setItem(storageKey(staffId), JSON.stringify(defaults));
  } catch {}
}

export function pushRecent(arr: number[], id: number, max = 5): number[] {
  return [id, ...arr.filter((x) => x !== id)].slice(0, max);
}

export function pushCombo(combos: RecentCombo[], combo: RecentCombo, max = 5): RecentCombo[] {
  const isDupe = (a: RecentCombo, b: RecentCombo) =>
    a.studentId === b.studentId && a.serviceTypeId === b.serviceTypeId;
  const filtered = combos.filter((c) => !isDupe(c, combo));
  return [combo, ...filtered].slice(0, max);
}

export function getServiceDuration(defaults: QuickLogDefaults, serviceTypeId: number | null): number {
  if (serviceTypeId != null && defaults.serviceDurations[String(serviceTypeId)]) {
    return defaults.serviceDurations[String(serviceTypeId)];
  }
  return defaults.lastDurationMinutes || 30;
}
