const FALLBACK_ANCHOR = new Date("2024-01-01"); // known Monday

// Identical to startOfWeekMonday in serviceForecast.ts — kept in sync.
function startOfWeekMonday(d: Date): Date {
  const out = new Date(d);
  const dow = out.getDay();
  out.setDate(out.getDate() - (dow === 0 ? 6 : dow - 1));
  out.setHours(0, 0, 0, 0);
  return out;
}

export interface BlockRecurrenceInfo {
  id: number;
  isRecurring: boolean;
  recurrenceType: string;
  effectiveFrom: string | null;
}

/**
 * Returns true if a recurring block should appear on targetDate.
 * Caller is responsible for dayOfWeek and effectiveFrom/To range checks.
 * Adds the biweekly alternating-week skip on top of those checks.
 */
export function isBlockActiveOnDate(
  block: BlockRecurrenceInfo,
  targetDate: Date,
): boolean {
  if (block.recurrenceType !== "biweekly") return true;

  if (block.effectiveFrom === null) {
    console.warn(
      `[scheduleUtils] Biweekly block id=${block.id} has null effectiveFrom; ` +
        `falling back to anchor ${FALLBACK_ANCHOR.toISOString().substring(0, 10)}.`,
    );
  }

  const anchor = block.effectiveFrom ? new Date(block.effectiveFrom) : FALLBACK_ANCHOR;
  const anchorMs = startOfWeekMonday(anchor).getTime();
  const weekOffset = Math.floor(
    (startOfWeekMonday(targetDate).getTime() - anchorMs) / (7 * 24 * 60 * 60 * 1000),
  );

  return weekOffset % 2 === 0;
}
