import { Card } from "@/components/ui/card";
import { AlertTriangle, Building2 } from "lucide-react";
import { CoverageGap, WEEKDAY_LABELS, formatTime } from "./types";

export function CoverageGapsPanel({ coverageGaps }: { coverageGaps: CoverageGap[] }) {
  return (
    <Card className="p-4 border-amber-200 bg-amber-50/30">
      <h3 className="text-sm font-semibold text-amber-800 flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 text-amber-500" />
        Coverage Gaps — {coverageGaps.length} uncovered time slot{coverageGaps.length !== 1 ? "s" : ""} across schools
      </h3>
      <div className="space-y-2">
        {coverageGaps.slice(0, 10).map((g, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 rounded bg-amber-100/60 border border-amber-200">
            <div className="flex items-center gap-1 min-w-[160px]">
              <Building2 className="w-3 h-3 text-amber-600 flex-shrink-0" />
              <span className="text-xs font-semibold text-amber-900">{g.schoolName}</span>
              <span className="text-xs text-amber-700">— {WEEKDAY_LABELS[g.dayOfWeek] || g.dayOfWeek}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {g.uncoveredSlots.map((slot, si) => (
                <span key={si} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-medium">
                  {formatTime(slot.start)}–{formatTime(slot.end)}
                </span>
              ))}
            </div>
            <span className="text-[10px] text-amber-600 ml-auto">
              {Math.round(g.totalUncoveredMinutes / 60 * 10) / 10}h uncovered
            </span>
          </div>
        ))}
        {coverageGaps.length > 10 && (
          <p className="text-xs text-amber-600">+{coverageGaps.length - 10} more gaps</p>
        )}
      </div>
    </Card>
  );
}
