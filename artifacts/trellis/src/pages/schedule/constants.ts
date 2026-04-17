export const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

export const WEEKDAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri",
};

export const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

export const BLOCK_COLORS = [
  "bg-emerald-50 text-emerald-900 border-emerald-200/60",
  "bg-gray-50 text-gray-800 border-gray-200/60",
  "bg-emerald-50/60 text-emerald-800 border-emerald-200/40",
  "bg-gray-100 text-gray-700 border-gray-200/60",
  "bg-emerald-50/40 text-emerald-700 border-emerald-200/40",
  "bg-gray-50 text-gray-700 border-gray-200/50",
  "bg-emerald-100/50 text-emerald-800 border-emerald-200/50",
  "bg-gray-100/60 text-gray-700 border-gray-200/40",
];

export type ScheduleType = "standard" | "ab_day" | "rotating_4" | "rotating_6";

export interface SchoolScheduleConfig {
  id: number;
  name: string;
  scheduleType: ScheduleType;
  rotationDays: number | null;
  rotationStartDate: string | null;
  scheduleNotes: string | null;
}

export const SCHEDULE_TYPE_LABELS: Record<ScheduleType, string> = {
  standard: "Standard (Mon–Fri)",
  ab_day: "A/B Day",
  rotating_4: "4-Day Rotating",
  rotating_6: "6-Day Rotating",
};

export const SCHEDULE_TYPE_DESCRIPTIONS: Record<ScheduleType, string> = {
  standard: "Fixed Monday through Friday schedule. Sessions repeat on the same days each week.",
  ab_day: "Sessions alternate between Day A and Day B. Weeks alternate A-week and B-week.",
  rotating_4: "4-day rotating cycle (Day 1–4). Sessions repeat every 4 school days regardless of calendar day.",
  rotating_6: "6-day rotating cycle (Day 1–6). Common in middle and high schools.",
};

export function getRotationColumns(scheduleType: ScheduleType): string[] {
  if (scheduleType === "ab_day") return ["A", "B"];
  if (scheduleType === "rotating_4") return ["1", "2", "3", "4"];
  if (scheduleType === "rotating_6") return ["1", "2", "3", "4", "5", "6"];
  return WEEKDAYS;
}

export function getColumnLabel(scheduleType: ScheduleType, col: string): string {
  if (scheduleType === "standard") return WEEKDAY_LABELS[col] ?? col;
  if (scheduleType === "ab_day") return `Day ${col}`;
  return `Day ${col}`;
}

function countSchoolDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  if (start > end) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export function getCurrentRotationDay(config: SchoolScheduleConfig): string | null {
  if (config.scheduleType === "standard" || !config.rotationStartDate || !config.rotationDays) return null;
  const today = new Date().toISOString().split("T")[0];
  const dow = new Date(today + "T00:00:00").getDay();
  if (dow === 0 || dow === 6) return null;

  const daysSinceStart = countSchoolDaysBetween(config.rotationStartDate, today) - 1;
  if (daysSinceStart < 0) return null;

  const slotIndex = daysSinceStart % config.rotationDays;
  if (config.scheduleType === "ab_day") {
    return slotIndex === 0 ? "A" : "B";
  }
  return String(slotIndex + 1);
}

export function fallbackRotationCol(dayOfWeek: string, type: ScheduleType): string {
  const idx = WEEKDAYS.indexOf(dayOfWeek);
  if (type === "ab_day") return idx % 2 === 0 ? "A" : "B";
  if (type === "rotating_4") return String((idx % 4) + 1);
  if (type === "rotating_6") return String((idx % 6) + 1);
  return dayOfWeek;
}
