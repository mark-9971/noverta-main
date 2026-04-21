import { ChevronDown } from "lucide-react";
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
