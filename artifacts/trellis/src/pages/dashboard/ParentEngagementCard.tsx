import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

interface ParentEngagementData {
  invitedCount: number;
  acceptedCount: number;
  activeCount: number;
}

export default function ParentEngagementCard() {
  const { data, isLoading } = useQuery<ParentEngagementData>({
    queryKey: ["parent-engagement"],
    queryFn: () =>
      authFetch("/api/dashboard/parent-engagement").then((r) =>
        r.ok ? r.json() : { invitedCount: 0, acceptedCount: 0, activeCount: 0 },
      ),
    staleTime: 120_000,
  });

  const invited = data?.invitedCount ?? 0;
  const accepted = data?.acceptedCount ?? 0;
  const active = data?.activeCount ?? 0;

  const engagementPct =
    accepted > 0 ? Math.round((active / accepted) * 100) : 0;

  const isLow = accepted > 0 && engagementPct < 50;
  const isEmpty = invited === 0;

  return (
    <Link href="/parent-portal">
      <Card
        className={`border cursor-pointer hover:shadow-sm transition-shadow ${
          isLow
            ? "border-amber-200 bg-amber-50/60"
            : "border-gray-200/60"
        }`}
      >
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <Users
              className={`w-4 h-4 ${isLow ? "text-amber-500" : "text-gray-400"}`}
            />
            Parent Portal Engagement
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 pb-4">
          {isLoading ? (
            <div className="h-12 animate-pulse bg-gray-100 rounded-md" />
          ) : isEmpty ? (
            <div className="text-sm text-gray-400 italic">
              No families have been invited to the portal yet.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Primary metric */}
              <div>
                <div
                  className={`text-3xl font-bold leading-none ${
                    isLow ? "text-amber-700" : "text-gray-800"
                  }`}
                >
                  {engagementPct}%
                </div>
                <div className="text-[12px] text-gray-500 mt-1">
                  of families active in the last 30 days
                </div>
                {isLow && (
                  <div className="text-[11px] text-amber-600 mt-1 font-medium">
                    Below 50% — consider sending a re-engagement reminder
                  </div>
                )}
              </div>

              {/* Secondary line */}
              <div className="border-t border-gray-100 pt-3 flex items-center justify-between text-[12px] text-gray-500">
                <span>
                  <span className="font-semibold text-gray-700">{accepted}</span>
                  {" "}accepted of{" "}
                  <span className="font-semibold text-gray-700">{invited}</span>
                  {" "}invited
                </span>
                <span className="text-[11px] text-gray-400 underline underline-offset-2">
                  Manage →
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
