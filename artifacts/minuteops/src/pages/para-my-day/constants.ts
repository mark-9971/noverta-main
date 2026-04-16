import { Sparkles, Mic, Hand, Eye } from "lucide-react";
import type { ScheduleBlock } from "./types";

type LucideIcon = React.ComponentType<{ className?: string }>;

export const PROMPT_LEVELS: { key: string; label: string; short: string; icon: LucideIcon; color: string }[] = [
  { key: "independent", label: "Independent", short: "I", icon: Sparkles, color: "bg-emerald-100 text-emerald-600 border-emerald-300" },
  { key: "verbal", label: "Verbal", short: "V", icon: Mic, color: "bg-gray-100 text-gray-700 border-gray-300" },
  { key: "gestural", label: "Gestural", short: "G", icon: Hand, color: "bg-gray-200 text-gray-700 border-gray-400" },
  { key: "model", label: "Model", short: "M", icon: Eye, color: "bg-amber-50 text-amber-700 border-amber-300" },
  { key: "partial_physical", label: "Partial Physical", short: "PP", icon: Hand, color: "bg-amber-100 text-amber-700 border-amber-400" },
  { key: "full_physical", label: "Full Physical", short: "FP", icon: Hand, color: "bg-red-100 text-red-700 border-red-300" },
];

export function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function formatDuration(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export function isCurrentBlock(block: ScheduleBlock): boolean {
  const now = new Date();
  const [sh, sm] = block.startTime.split(":").map(Number);
  const [eh, em] = block.endTime.split(":").map(Number);
  const nowMins = now.getHours() * 60 + now.getMinutes();
  return nowMins >= sh * 60 + sm && nowMins < eh * 60 + em;
}

export function isUpcoming(block: ScheduleBlock): boolean {
  const now = new Date();
  const [sh, sm] = block.startTime.split(":").map(Number);
  return now.getHours() * 60 + now.getMinutes() < sh * 60 + sm;
}
