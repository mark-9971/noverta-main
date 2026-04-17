import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";
import { RefreshCw, Clock, UserX, UserCheck, History } from "lucide-react";
import { DAY_LABELS, fmt12, today } from "./utils";

export function HistoryTab({ schoolId }: { schoolId?: number | null }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(today());

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (schoolId) params.set("schoolId", String(schoolId));
      const r = await authFetch(`/api/coverage/history?${params}`);
      const data = await r.json();
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load coverage history");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, schoolId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-[12px] text-gray-500 whitespace-nowrap">From</Label>
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-8 text-[13px] w-36" />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-[12px] text-gray-500 whitespace-nowrap">To</Label>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-8 text-[13px] w-36" />
        </div>
        <Button variant="outline" size="sm" onClick={loadHistory} className="h-8 gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
        <Badge variant="outline" className="ml-auto text-gray-600 border-gray-200 gap-1">
          {entries.length} record{entries.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <History className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-[13px]">No covered sessions in this date range.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(e => (
            <div key={e.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-emerald-100 bg-emerald-50/30 text-[13px]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-800">{e.studentName ?? "No student"}</span>
                  {e.serviceTypeName && <Badge variant="outline" className="text-[11px] py-0 px-1.5">{e.serviceTypeName}</Badge>}
                  <span className="text-gray-400 text-[12px]">{e.absenceDate}</span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-gray-500 text-[12px]">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {DAY_LABELS[e.dayOfWeek] ?? e.dayOfWeek} {fmt12(e.startTime)}–{fmt12(e.endTime)}
                  </span>
                  <span className="flex items-center gap-1">
                    <UserX className="h-3 w-3 text-red-400" />
                    {e.originalStaffName}
                  </span>
                  <span className="flex items-center gap-1">
                    <UserCheck className="h-3 w-3 text-emerald-500" />
                    {e.substituteStaffName}
                  </span>
                  {e.location && <span>· {e.location}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
