export const ABSENCE_TYPE_LABELS: Record<string, string> = {
  sick: "Sick",
  personal: "Personal",
  professional_development: "Professional Development",
  emergency: "Emergency",
  other: "Other",
};

export const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri",
};

export function fmt12(time: string) {
  const [h, m] = time.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function getNextWeekday(dayOfWeek: string): string {
  const today = new Date();
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const targetDay = days.indexOf(dayOfWeek.toLowerCase());
  const currentDay = today.getDay();
  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7;
  const next = new Date(today);
  next.setDate(today.getDate() + daysUntil);
  return next.toISOString().slice(0, 10);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export type CoverageTab = "uncovered" | "absences" | "history" | "report" | "workload";
