import { ChevronDown, CalendarClock, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  HANDLING_BADGE,
  HANDLING_LABELS,
  type HandlingState,
} from "@/lib/action-recommendations";

export type HandlingStatePillSize = "xs" | "sm" | "md";

interface HandlingStatePillProps {
  state: HandlingState;
  size?: HandlingStatePillSize;
  title?: string;
  testId?: string;
  onClick?: () => void;
  withChevron?: boolean;
  className?: string;
}

export function HandlingStatePill({
  state,
  size = "sm",
  title,
  testId,
  onClick,
  withChevron = false,
  className = "",
}: HandlingStatePillProps) {
  const badge = HANDLING_BADGE[state];
  const sizeClass =
    size === "md"
      ? "px-2.5 py-1 text-[11px] gap-1"
      : size === "xs"
        ? "px-1.5 py-0.5 text-[9px]"
        : "px-1.5 py-0.5 text-[10px]";
  const base = `inline-flex items-center ${sizeClass} rounded-full ring-1 ${badge.bg} ${badge.fg} ${badge.ring} font-semibold`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${base} transition-colors hover:opacity-90 ${className}`.trim()}
        data-testid={testId}
        title={title}
      >
        {HANDLING_LABELS[state]}
        {withChevron && <ChevronDown className="w-3 h-3" />}
      </button>
    );
  }

  return (
    <span
      className={`${base} ${className}`.trim()}
      data-testid={testId}
      title={title}
    >
      {HANDLING_LABELS[state]}
    </span>
  );
}

// ─── MakeupMinutesPill — T05 canonical wedge primitive ──────────────────────
//
// Single, presentational primitive for surfacing the T03 backend bucket
// model (delivered / scheduled-pending / still-at-risk) at the per-row
// level on wedge surfaces. Takes server-computed numbers ONLY — never
// recompute pending/at-risk math in the client.
//
// Display precedence (highest wins):
//   1. requiredMinutes <= 0           → renders nothing (no requirement to talk about)
//   2. stillAtRiskMinutes > 0         → red "Still at risk · N min"
//   3. scheduledPendingMinutes > 0    → blue "Scheduled pending · N min"
//   4. deliveredMinutes >= required   → emerald "Delivered"
//   5. otherwise                      → renders nothing (slightly behind / on-track
//                                       are expressed by the existing risk pill)
//
// This precedence is the same across every surface so a row never reads
// inconsistently between Action Center, Risk Report, Today, and Student
// Detail. Use this primitive — do not roll a per-page badge.

export interface MakeupMinutesPillProps {
  requiredMinutes: number;
  deliveredMinutes: number;
  /** T03 — server-computed pending bucket. Defaults to 0 if a surface
   *  has not yet been wired through to receive the new field. */
  scheduledPendingMinutes?: number | null;
  /** T03 — server-computed honest at-risk delta. Defaults to
   *  `max(0, required - delivered - scheduledPending)` only if the
   *  caller has not provided it explicitly (legacy surfaces). */
  stillAtRiskMinutes?: number | null;
  size?: HandlingStatePillSize;
  testId?: string;
  className?: string;
}

export function MakeupMinutesPill({
  requiredMinutes,
  deliveredMinutes,
  scheduledPendingMinutes,
  stillAtRiskMinutes,
  size = "sm",
  testId,
  className = "",
}: MakeupMinutesPillProps) {
  if (!requiredMinutes || requiredMinutes <= 0) return null;
  const pending = Math.max(0, scheduledPendingMinutes ?? 0);
  const remaining = Math.max(0, requiredMinutes - deliveredMinutes);
  const stillAtRisk =
    stillAtRiskMinutes != null
      ? Math.max(0, stillAtRiskMinutes)
      : Math.max(0, remaining - pending);

  const sizeClass =
    size === "md"
      ? "px-2.5 py-1 text-[11px] gap-1"
      : size === "xs"
        ? "px-1.5 py-0.5 text-[9px] gap-0.5"
        : "px-1.5 py-0.5 text-[10px] gap-1";

  let bg: string, fg: string, ring: string, Icon: typeof CalendarClock, label: string;
  if (stillAtRisk > 0) {
    bg = "bg-red-50"; fg = "text-red-700"; ring = "ring-red-200";
    Icon = AlertTriangle;
    label = `Still at risk · ${stillAtRisk} min`;
  } else if (pending > 0) {
    bg = "bg-blue-50"; fg = "text-blue-700"; ring = "ring-blue-200";
    Icon = CalendarClock;
    label = `Scheduled pending · ${pending} min`;
  } else if (deliveredMinutes >= requiredMinutes) {
    bg = "bg-emerald-50"; fg = "text-emerald-700"; ring = "ring-emerald-200";
    Icon = CheckCircle2;
    label = "Delivered";
  } else {
    return null;
  }

  return (
    <span
      className={`inline-flex items-center ${sizeClass} rounded-full ring-1 ${bg} ${fg} ${ring} font-semibold ${className}`.trim()}
      data-testid={testId}
      title={`Required ${requiredMinutes} min · delivered ${deliveredMinutes} · scheduled pending ${pending} · still at risk ${stillAtRisk}`}
    >
      <Icon className={size === "xs" ? "w-2.5 h-2.5" : "w-3 h-3"} />
      {label}
    </span>
  );
}
