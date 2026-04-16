import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";
import { AlertTriangle, BarChart2, RefreshCw } from "lucide-react";

export function WorkloadTab({ schoolId }: { schoolId?: number | null }) {
  const [summary, setSummary] = useState<{ thresholdHours: number; staff: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState("25");

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ thresholdHours: threshold });
      if (schoolId) params.set("schoolId", String(schoolId));
      const r = await authFetch(`/api/staff/workload-summary?${params}`);
      const data = await r.json();
      setSummary(data);
    } catch {
      toast.error("Failed to load workload summary");
    } finally {
      setLoading(false);
    }
  }, [schoolId, threshold]);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  const staffList = summary?.staff ?? [];
  const maxMinutes = Math.max(...staffList.map((s: any) => s.scheduledMinutesPerWeek), 1);
  const overloadedCount = staffList.filter((s: any) => s.isOverloaded).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-[12px] text-gray-500 whitespace-nowrap">Overload threshold</Label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={threshold}
              onChange={e => setThreshold(e.target.value)}
              className="h-8 w-16 text-[13px] text-center"
              min="1"
              max="40"
            />
            <span className="text-[12px] text-gray-400">hrs/wk</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadSummary} className="h-8 gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
        {overloadedCount > 0 && (
          <Badge variant="outline" className="ml-auto text-amber-700 border-amber-200 bg-amber-50 gap-1">
            <AlertTriangle className="h-3 w-3" />
            {overloadedCount} over threshold
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
        </div>
      ) : staffList.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-[13px]">No recurring schedule blocks found for the active year.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {staffList.map((s: any) => {
            const barPct = Math.round((s.scheduledMinutesPerWeek / maxMinutes) * 100);
            return (
              <div
                key={s.staffId}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border text-[13px] ${
                  s.isOverloaded ? "bg-amber-50/50 border-amber-100" : "bg-white border-gray-100"
                }`}
              >
                <div className="w-36 min-w-[9rem] truncate">
                  <span className={`font-medium ${s.isOverloaded ? "text-amber-800" : "text-gray-800"}`}>
                    {s.staffName}
                  </span>
                  {s.role && (
                    <span className="ml-1.5 text-[11px] text-gray-400 capitalize">{s.role.replace(/_/g, " ")}</span>
                  )}
                </div>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all ${s.isOverloaded ? "bg-amber-400" : "bg-emerald-500"}`}
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
                <div className="text-right min-w-[4.5rem]">
                  <span className={`font-medium tabular-nums ${s.isOverloaded ? "text-amber-700" : "text-gray-700"}`}>
                    {s.scheduledHoursPerWeek}h
                  </span>
                  <span className="text-gray-400 text-[11px]"> / wk</span>
                </div>
                <div className="text-right min-w-[3rem] text-[11px] text-gray-400 tabular-nums">
                  {s.blockCount} block{s.blockCount !== 1 ? "s" : ""}
                </div>
                {s.isOverloaded && (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
