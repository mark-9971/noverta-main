export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
export const WEEKDAY_LABELS: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday",
};
export const WEEKDAY_SHORT: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri",
};
export const HOURS = Array.from({ length: 10 }, (_, i) => `${String(i + 7).padStart(2, "0")}:00`);

export const SCHOOL_COLORS = [
  { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-800", dot: "bg-emerald-500" },
  { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-800", dot: "bg-blue-500" },
  { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-800", dot: "bg-amber-500" },
  { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-800", dot: "bg-purple-500" },
  { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-800", dot: "bg-rose-500" },
  { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-800", dot: "bg-cyan-500" },
  { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-800", dot: "bg-orange-500" },
  { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-800", dot: "bg-indigo-500" },
];

export interface StaffSchedule {
  id: number;
  staff_id: number;
  school_id: number;
  service_type_id: number | null;
  day_of_week: string;
  start_time: string;
  end_time: string;
  label: string | null;
  notes: string | null;
  effective_from: string | null;
  effective_to: string | null;
  staffFirstName: string;
  staffLastName: string;
  staffRole: string;
  schoolName: string;
  serviceTypeName: string | null;
  serviceTypeCategory: string | null;
}

export interface Conflict {
  scheduleAId: number;
  scheduleBId: number;
  staffId: number;
  staffFirstName: string;
  staffLastName: string;
  dayOfWeek: string;
  aStartTime: string;
  aEndTime: string;
  aSchoolId: number;
  aSchoolName: string;
  bStartTime: string;
  bEndTime: string;
  bSchoolId: number;
  bSchoolName: string;
  suggestions: string[];
}

export interface CoverageGap {
  dayOfWeek: string;
  schoolId: number;
  schoolName: string;
  uncoveredSlots: Array<{ start: string; end: string }>;
  totalUncoveredMinutes: number;
}

export interface ProviderSummary {
  staffId: number;
  schedule: Array<{ dayOfWeek: string; startTime: string; endTime: string; label: string | null; schoolId: number; schoolName: string }>;
  distribution: Array<{ schoolId: number; schoolName: string; weeklyHours: number }>;
  totalWeeklyHours: number;
  daysScheduled: number;
  availability: Record<string, Array<{ start: string; end: string }>>;
}

export interface StaffOption { id: number; firstName: string; lastName: string; role: string; }
export interface SchoolOption { id: number; name: string; }
export interface ServiceTypeOption { id: number; name: string; category: string; }

export interface FormDataT {
  staffId: string; schoolId: string; serviceTypeId: string;
  dayOfWeek: string; startTime: string; endTime: string;
  label: string; notes: string; effectiveFrom: string; effectiveTo: string;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  const ampm = hr >= 12 ? "PM" : "AM";
  const h12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return `${h12}:${m} ${ampm}`;
}
