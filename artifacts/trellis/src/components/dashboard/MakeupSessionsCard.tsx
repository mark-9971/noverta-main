import { useState } from "react";
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

type AgeBucket = "60+" | "30-60" | "<30" | null;

function agingBadge(days: number): { label: string; className: string } {
  if (days >= 60) return { label: `${days}d`, className: "bg-red-100 text-red-700 font-semibold" };
  if (days >= 30) return { label: `${days}d`, className: "bg-amber-100 text-amber-700 font-semibold" };
  return { label: `${days}d`, className: "bg-gray-100 text-gray-600" };
}

function getBucket(days: number): AgeBucket {
  if (days >= 60) return "60+";
  if (days >= 30) return "30-60";
  return "<30";
}

interface AgingSummaryProps {
  obligations: MakeupObligation[];
  activeBucket: AgeBucket;
  onToggle: (bucket: AgeBucket) => void;
}

function AgingSummary({ obligations, activeBucket, onToggle }: AgingSummaryProps) {
  const count60 = obligations.filter((o) => o.daysOpen >= 60).length;
  const count30 = obligations.filter((o) => o.daysOpen >= 30 && o.daysOpen < 60).length;
  const countUnder30 = obligations.filter((o) => o.daysOpen < 30).length;

  const buckets: { bucket: AgeBucket; count: number; icon: string; label: string; activeClass: string; inactiveClass: string; dotClass: string }[] = [
    {
      bucket: "60+",
      count: count60,
      icon: "🔴",
      label: "60+ days",
      activeClass: "bg-red-100 border-red-300 text-red-700",
      inactiveClass: "bg-white border-gray-200 text-red-600 hover:bg-red-50",
      dotClass: "bg-red-500",
    },
    {
      bucket: "30-60",
      count: count30,
      icon: "🟡",
      label: "30–60 days",
      activeClass: "bg-amber-100 border-amber-300 text-amber-700",
      inactiveClass: "bg-white border-gray-200 text-amber-600 hover:bg-amber-50",
      dotClass: "bg-amber-400",
    },
    {
      bucket: "<30",
      count: countUnder30,
      icon: "⚪",
      label: "under 30 days",
      activeClass: "bg-gray-100 border-gray-300 text-gray-700",
      inactiveClass: "bg-white border-gray-200 text-gray-500 hover:bg-gray-50",
      dotClass: "bg-gray-400",
    },
  ];

  return (
    <div className="flex flex-wrap gap-2 px-2 pt-2 pb-1">
      {buckets.map(({ bucket, count, label, activeClass, inactiveClass }) => {
        const isActive = activeBucket === bucket;
        return (
          <button
            key={bucket}
            onClick={() => onToggle(isActive ? null : bucket)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors cursor-pointer select-none ${
              isActive ? activeClass : inactiveClass
            }`}
            title={isActive ? `Clear filter` : `Show only ${label}`}
          >
            <span
              className={`w-2 h-2 rounded-full inline-block ${
                bucket === "60+" ? "bg-red-500" : bucket === "30-60" ? "bg-amber-400" : "bg-gray-400"
              }`}
            />
            <span className="font-bold">{count}</span>
            <span className="opacity-75">{label}</span>
          </button>
        );
      })}
      {activeBucket && (
        <button
          onClick={() => onToggle(null)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-dashed border-gray-300 text-[11px] text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}

export default function MakeupSessionsCard() {
  const { filterParams } = useSchoolContext();
  const [activeBucket, setActiveBucket] = useState<AgeBucket>(null);

  const { data, isLoading } = useQuery<MakeupObligation[]>({
    queryKey: ["dashboard-makeup-obligations", filterParams],
    queryFn: () =>
      authFetch(
        `/api/dashboard/makeup-obligations?${new URLSearchParams(filterParams).toString()}`
      ).then((r) => (r.ok ? r.json() : [])),
    staleTime: 60_000,
  });

  const obligations = data ?? [];

  const visibleObligations = activeBucket
    ? obligations.filter((o) => getBucket(o.daysOpen) === activeBucket)
    : obligations;

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

      <CardContent className="pt-2 pb-4">
        {isLoading ? (
          <div className="space-y-2 pt-1">
            <div className="flex gap-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-6 w-24 rounded-full" />
              ))}
            </div>
            <div className="space-y-2 pt-1">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
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
          <>
            <AgingSummary
              obligations={obligations}
              activeBucket={activeBucket}
              onToggle={setActiveBucket}
            />
            <div className="overflow-x-auto -mx-1 mt-2">
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
                  {visibleObligations.map((ob) => {
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
                  {visibleObligations.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-[12px] text-gray-400 italic">
                        No obligations in this age range.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
