import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { authFetch } from "@/lib/auth-fetch";
import { Clock, UserCheck, AlertTriangle, Shield } from "lucide-react";
import { today } from "./utils";

export function DailySummary({ schoolId }: { schoolId?: number | null }) {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams({ date: today() });
        if (schoolId) params.set("schoolId", String(schoolId));
        const r = await authFetch(`/api/coverage/summary?${params}`);
        const data = await r.json();
        setSummary(data);
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, [schoolId]);

  if (loading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>;
  if (!summary || summary.totalSessions === 0) return null;

  const items = [
    { label: "Total Sessions", value: summary.totalSessions, icon: Clock, color: "text-gray-700" },
    { label: "Covered", value: summary.covered, icon: UserCheck, color: "text-emerald-600" },
    { label: "Uncovered", value: summary.uncovered, icon: AlertTriangle, color: summary.uncovered > 0 ? "text-amber-600" : "text-gray-400" },
    { label: "Coverage Rate", value: `${summary.coverageRate}%`, icon: Shield, color: summary.coverageRate >= 80 ? "text-emerald-600" : "text-amber-600" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map(item => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="shadow-none">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-gray-500 font-medium">{item.label}</p>
                <Icon className={`h-4 w-4 ${item.color} opacity-60`} />
              </div>
              <p className={`text-xl font-semibold mt-1 ${item.color}`}>{item.value}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
