import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useSchoolContext } from "@/lib/school-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, ArrowRight, CheckCircle } from "lucide-react";
import { Link } from "wouter";

interface MakeupObligation {
  obligationId: number;
  studentId: number;
  studentName: string;
  serviceType: string | null;
  minutesOwed: number;
  minutesDelivered: number;
  minutesRemaining: number;
  daysOpen: number;
  createdAt: string;
}

function agingBadge(days: number): { label: string; className: string } {
  if (days >= 60) return { label: `${days}d`, className: "bg-red-100 text-red-700 font-semibold" };
  if (days >= 30) return { label: `${days}d`, className: "bg-amber-100 text-amber-700 font-semibold" };
  return { label: `${days}d`, className: "bg-gray-100 text-gray-600" };
}

export default function MakeupSessionsCard() {
  const { filterParams } = useSchoolContext();

  const { data, isLoading } = useQuery<MakeupObligation[]>({
    queryKey: ["dashboard-makeup-obligations", filterParams],
    queryFn: () =>
      authFetch(
        `/api/dashboard/makeup-obligations?${new URLSearchParams(filterParams).toString()}`
      ).then((r) => (r.ok ? r.json() : [])),
    staleTime: 60_000,
  });

  const obligations = data ?? [];

  return (
    <Card className="border-gray-200/60">
      <CardHeader className="pb-0 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-amber-500" />
          Overdue Makeup Sessions
        </CardTitle>
        {obligations.length > 0 && (
          <Link
            href="/compensatory"
            className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </CardHeader>

      <CardContent className="pt-3 pb-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : obligations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2 text-center">
            <CheckCircle className="w-8 h-8 text-emerald-400" />
            <p className="text-sm font-medium text-gray-600">No outstanding makeups</p>
            <p className="text-[11px] text-gray-400">
              All compensatory obligations have been fulfilled or waived.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-[12px] min-w-[460px]">
              <thead>
                <tr className="text-[11px] text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="pb-2 px-2 text-left font-medium">Student</th>
                  <th className="pb-2 px-2 text-left font-medium">Service</th>
                  <th className="pb-2 px-2 text-right font-medium">Minutes owed</th>
                  <th className="pb-2 px-2 text-right font-medium">Open for</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {obligations.map((ob) => {
                  const badge = agingBadge(ob.daysOpen);
                  return (
                    <tr key={ob.obligationId} className="hover:bg-gray-50/60 transition-colors">
                      <td className="py-2 px-2">
                        <Link
                          href={`/students/${ob.studentId}`}
                          className="font-medium text-gray-800 hover:text-emerald-700 hover:underline truncate block max-w-[160px]"
                        >
                          {ob.studentName}
                        </Link>
                      </td>
                      <td className="py-2 px-2 text-gray-500 truncate max-w-[140px]">
                        {ob.serviceType ?? <span className="italic text-gray-300">Unspecified</span>}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span className="font-semibold text-gray-800">{ob.minutesRemaining}</span>
                        <span className="text-gray-400 ml-0.5">min</span>
                      </td>
                      <td className="py-2 px-2 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
