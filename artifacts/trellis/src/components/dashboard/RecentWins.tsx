import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Trophy, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

interface RecentMastery {
  goalId: number;
  goalArea: string;
  goalNumber: number;
  annualGoal: string;
  masteredAt: string;
  studentId: number;
  studentName: string;
}

function formatRelativeDate(isoDate: string): string {
  const d = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function RecentWins({ days = 30 }: { days?: number }) {
  const { data, isLoading } = useQuery<RecentMastery[]>({
    queryKey: ["recent-masteries", days],
    queryFn: () =>
      authFetch(`/api/goals/recent-masteries?limit=5&days=${days}`)
        .then(r => r.ok ? r.json() : []),
    staleTime: 60_000,
  });

  const wins = data ?? [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            Recent Wins
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
          <Skeleton className="h-12 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (wins.length === 0) return null;

  return (
    <Card className="border-amber-100 bg-gradient-to-br from-amber-50/60 to-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          Recent Wins
          <span className="ml-auto text-xs font-normal text-gray-400">last {days} days</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {wins.map(win => (
          <Link key={win.goalId} href={`/students/${win.studentId}`}>
            <div className="group flex items-center gap-3 rounded-lg border border-amber-100 bg-white px-3 py-2.5 hover:border-amber-200 hover:bg-amber-50/40 transition-colors cursor-pointer">
              <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-3.5 h-3.5 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{win.studentName}</p>
                <p className="text-[11px] text-gray-500 truncate">
                  <span className="text-emerald-600 font-medium">{win.goalArea}</span>
                  {" "}goal mastered
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className="text-[10px] text-gray-400">{formatRelativeDate(win.masteredAt)}</span>
                <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-gray-400 transition-colors" />
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
