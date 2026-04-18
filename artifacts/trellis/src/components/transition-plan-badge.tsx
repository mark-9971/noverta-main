import { useState, useRef, useEffect } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TransitionPlan } from "@/pages/transitions/types";
import { PLAN_CRITERIA, computePlanProgress } from "@/pages/transitions/constants";

interface TransitionPlanBadgeProps {
  plan: TransitionPlan;
}

export function TransitionPlanBadge({ plan }: TransitionPlanBadgeProps) {
  const results = PLAN_CRITERIA.map((c) => ({ label: c.label, complete: c.check(plan) }));
  const { percent, filled, total } = computePlanProgress(plan);

  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const progressColor =
    percent === 100 ? "text-emerald-600" : percent >= 60 ? "text-amber-600" : "text-red-500";
  const progressBg =
    percent === 100 ? "bg-emerald-500" : percent >= 60 ? "bg-amber-500" : "bg-red-400";

  function scheduleClose() {
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }

  function cancelClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Transition plan progress: ${percent}% (${filled} of ${total} criteria complete). Click or hover for details.`}
          className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded"
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={() => { cancelClose(); setOpen(true); }}
          onMouseLeave={scheduleClose}
        >
          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${progressBg}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className={`text-[11px] font-semibold ${progressColor}`}>{percent}%</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-auto min-w-[190px] p-3"
        onClick={(e) => e.stopPropagation()}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Progress ({filled}/{total})
        </p>
        <ul className="space-y-1.5">
          {results.map((r) => (
            <li key={r.label} className="flex items-center gap-2">
              {r.complete ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              ) : (
                <Circle className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
              )}
              <span className={`text-[12px] ${r.complete ? "text-gray-700" : "text-gray-400"}`}>
                {r.label}
              </span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
