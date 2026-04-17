export function formatDate(d: string) {
  if (!d) return "—";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

export function formatPromptLevel(level: string) {
  return level.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
