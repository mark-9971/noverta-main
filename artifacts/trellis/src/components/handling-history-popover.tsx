/**
 * Pilot Wedge — handling-state history popover.
 *
 * Lazy-fetches the recent transition list for a single action item
 * (`GET /action-item-handling/:itemId/history`) when opened, and
 * renders a compact list:
 *   - state → state
 *   - actor name (or "Unknown" when the server didn't capture one)
 *   - relative time
 *   - optional note
 *
 * Reused by Action Center rows and the Recommended Next Step card.
 *
 * Honesty:
 *   - The transitions are real persisted events from
 *     `action_item_handling_events`. The labels and relative-time
 *     strings are derived/displayed only.
 *   - When the endpoint returns an empty list we say "No history yet"
 *     rather than fabricating any entries.
 */

import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { History as HistoryIcon, Loader2 } from "lucide-react";
import {
  useHandlingHistory,
  formatRelativeTime,
  formatTransitionLabel,
} from "@/lib/use-handling-state";

interface Props {
  itemId: string;
  /** Element rendered as the trigger. Defaults to a small "History" link. */
  children?: ReactNode;
  /** Side / alignment forwarded to Popover. */
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  /** Test id applied to the trigger. */
  triggerTestId?: string;
}

export default function HandlingHistoryPopover({
  itemId, children, align = "start", side = "bottom", triggerTestId,
}: Props) {
  const [open, setOpen] = useState(false);
  // Only fetch once the popover is opened — avoids a request per row on render.
  const { data, isLoading, isError } = useHandlingHistory(itemId, { enabled: open });

  const trigger = children ?? (
    <button
      type="button"
      className="inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-400 hover:text-gray-700 transition-colors"
      title="See recent handling history"
      aria-label="Handling history"
      data-testid={triggerTestId ?? `button-handling-history-${itemId}`}
    >
      <HistoryIcon className="w-3 h-3" />
      History
    </button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        className="w-80 p-0 max-h-80 overflow-hidden"
        data-testid={`popover-handling-history-${itemId}`}
      >
        <div className="px-3 py-2 border-b bg-gray-50/50">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-600">
            Handling history
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">Recent transitions on this item.</p>
        </div>
        <div className="max-h-64 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center gap-2 px-3 py-4 text-[11px] text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading history…
            </div>
          )}
          {isError && (
            <div className="px-3 py-4 text-[11px] text-red-600" data-testid="text-handling-history-error">
              Couldn't load history. Try again in a moment.
            </div>
          )}
          {!isLoading && !isError && (data?.length ?? 0) === 0 && (
            <div className="px-3 py-4 text-[11px] text-gray-500" data-testid="text-handling-history-empty">
              No history yet — this item hasn't moved through any handling states.
            </div>
          )}
          {!isLoading && !isError && (data?.length ?? 0) > 0 && (
            <ol className="divide-y">
              {data!.map(ev => {
                const rel = formatRelativeTime(ev.changedAt);
                return (
                  <li
                    key={ev.id}
                    className="px-3 py-2"
                    data-testid={`handling-history-event-${ev.id}`}
                  >
                    <div className="text-[12px] font-medium text-gray-800 leading-tight">
                      {formatTransitionLabel(ev.fromState, ev.toState)}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {ev.changedByName ?? "Unknown"}
                      {rel && (
                        <>
                          <span className="text-gray-300 mx-1">·</span>
                          <span title={ev.changedAt}>{rel}</span>
                        </>
                      )}
                    </div>
                    {ev.note && (
                      <div className="text-[11px] text-gray-600 mt-1 italic leading-snug">
                        “{ev.note}”
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
