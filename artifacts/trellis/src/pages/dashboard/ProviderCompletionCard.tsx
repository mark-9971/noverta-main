import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useSchoolContext } from "@/lib/school-context";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, ArrowRight, Loader2 } from "lucide-react";

interface ProviderRate {
  staffId: number;
  staffName: string;
  role: string;
  scheduledCount: number;
  completedCount: number;
  completionRate: number;
  userId: string | null;
}

function rateColor(rate: number): { bar: string; text: string; badge: string } {
  if (rate >= 95) return { bar: "bg-emerald-500", text: "text-emerald-700", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (rate >= 80) return { bar: "bg-amber-400", text: "text-amber-700", badge: "bg-amber-50 text-amber-700 border-amber-200" };
  return { bar: "bg-red-500", text: "text-red-700", badge: "bg-red-50 text-red-700 border-red-200" };
}

export default function ProviderCompletionCard() {
  const { filterParams } = useSchoolContext();

  const { data, isLoading, isError } = useQuery<ProviderRate[]>({
    queryKey: ["provider-completion-rates", filterParams],
    queryFn: () =>
      authFetch(`/api/dashboard/provider-completion-rates?${new URLSearchParams(filterParams).toString()}`)
        .then(r => r.ok ? r.json() : []),
    staleTime: 60_000,
  });

  const providers = data ?? [];

  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-0 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-gray-400" />
          Provider Session Completion — This Week
        </CardTitle>
        <Link href="/staff" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
          All staff <ArrowRight className="w-3 h-3" />
        </Link>
      </CardHeader>

      <CardContent className="pt-4 pb-4 px-5">
        {isLoading && (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-sm">Loading…</span>
          </div>
        )}

        {isError && (
          <p className="text-sm text-red-500 py-4 text-center">Failed to load completion rates.</p>
        )}

        {!isLoading && !isError && providers.length === 0 && (
          <p className="text-sm text-gray-400 py-6 text-center">
            No provider session data for this week yet.
          </p>
        )}

        {!isLoading && !isError && providers.length > 0 && (
          <div className="space-y-2">
            {/* Legend */}
            <div className="flex items-center gap-4 mb-3 text-[11px] text-gray-400 flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> &lt; 80% — needs attention</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> 80–94% — below target</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> 95%+ — on track</span>
            </div>

            {providers.map(p => {
              const colors = rateColor(p.completionRate);
              return (
                <div key={p.staffId} className="flex items-center gap-3 group">
                  {/* Provider name → links to staff profile */}
                  <Link href={`/staff/${p.staffId}`} className="w-36 flex-shrink-0 text-[13px] font-medium text-gray-800 hover:text-emerald-700 hover:underline truncate transition-colors" title={p.staffName}>
                    {p.staffName}
                  </Link>

                  {/* Progress bar */}
                  <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${colors.bar}`}
                      style={{ width: `${Math.min(p.completionRate, 100)}%` }}
                    />
                  </div>

                  {/* Rate badge */}
                  <span className={`w-14 flex-shrink-0 text-right text-[12px] font-semibold tabular-nums ${colors.text}`}>
                    {p.completionRate}%
                  </span>

                  {/* Session counts */}
                  <span className="w-20 flex-shrink-0 text-right text-[11px] text-gray-400 tabular-nums hidden sm:block">
                    {p.completedCount}/{p.scheduledCount}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
