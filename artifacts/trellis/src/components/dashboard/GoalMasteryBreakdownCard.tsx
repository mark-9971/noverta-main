import { Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface ServiceAreaMastery {
  serviceArea: string;
  totalGoals: number;
  ratedGoals: number;
  onTrackGoals: number;
  masteryRate: number | null;
}

interface GoalMasteryBreakdownCardProps {
  breakdown: ServiceAreaMastery[];
}

function rateColor(rate: number | null): { bar: string; text: string } {
  if (rate === null) return { bar: "bg-gray-200", text: "text-gray-400" };
  if (rate >= 75) return { bar: "bg-emerald-500", text: "text-emerald-700" };
  if (rate >= 55) return { bar: "bg-amber-400", text: "text-amber-700" };
  return { bar: "bg-red-500", text: "text-red-700" };
}

export function GoalMasteryBreakdownCard({ breakdown }: GoalMasteryBreakdownCardProps) {
  if (!breakdown || breakdown.length === 0) return null;

  const sorted = [...breakdown].sort((a, b) => {
    if (a.masteryRate === null && b.masteryRate === null) return 0;
    if (a.masteryRate === null) return 1;
    if (b.masteryRate === null) return -1;
    return a.masteryRate - b.masteryRate;
  });

  return (
    <Card className="border-gray-200/60" data-testid="goal-mastery-breakdown-card">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
          <Target className="w-4 h-4 text-gray-400" />
          Goal Mastery by Service Area
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        <div className="hidden sm:grid grid-cols-[1fr_auto_auto_6rem] gap-x-4 gap-y-0 text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-2 px-0.5">
          <span>Service Area</span>
          <span className="text-right">On Track</span>
          <span className="text-right">Goals</span>
          <span className="text-right">Mastery Rate</span>
        </div>
        <ul className="space-y-2.5">
          {sorted.map((row) => {
            const { bar, text } = rateColor(row.masteryRate);
            const pct = row.masteryRate ?? 0;
            return (
              <li
                key={row.serviceArea}
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_6rem] items-center gap-x-4 gap-y-1"
                data-testid={`mastery-row-${row.serviceArea.replace(/\s+/g, "-").toLowerCase()}`}
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-gray-800 truncate">{row.serviceArea}</div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${bar}`}
                      style={{ width: `${pct}%` }}
                      aria-label={`${pct}%`}
                    />
                  </div>
                </div>

                <div className="text-right sm:hidden">
                  <span className={`text-sm font-bold tabular-nums ${text}`}>
                    {row.masteryRate !== null ? `${row.masteryRate}%` : "—"}
                  </span>
                  <div className="text-[10px] text-gray-400">{row.onTrackGoals}/{row.totalGoals}</div>
                </div>

                <div className="hidden sm:block text-right">
                  <span className="text-[13px] font-medium text-gray-700 tabular-nums">
                    {row.onTrackGoals}
                  </span>
                </div>
                <div className="hidden sm:block text-right">
                  <span className="text-[13px] font-medium text-gray-500 tabular-nums">
                    {row.totalGoals}
                  </span>
                </div>
                <div className="hidden sm:flex items-center justify-end gap-1.5">
                  <span className={`text-sm font-bold tabular-nums ${text}`}>
                    {row.masteryRate !== null ? `${row.masteryRate}%` : "—"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {sorted.some(r => r.masteryRate === null) && (
          <p className="mt-3 text-[11px] text-gray-400">
            — indicates no active goals have been rated yet for that service area.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
