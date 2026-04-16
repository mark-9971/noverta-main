import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";
import { useListStaff } from "@workspace/api-client-react";
import { UserCheck, AlertTriangle, RefreshCw, Clock, User } from "lucide-react";
import { DAY_LABELS, fmt12, today } from "./utils";

export function UncoveredTab({ schoolId }: { schoolId?: number | null }) {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState("");
  const [assignDialog, setAssignDialog] = useState<any | null>(null);
  const [substituteId, setSubstituteId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const { data: staffData } = useListStaff({ status: "active", ...(schoolId ? { schoolId: String(schoolId) } : {}) });
  const staffList = (staffData as any[]) ?? [];

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ startDate });
      if (endDate) params.set("endDate", endDate);
      if (schoolId) params.set("schoolId", String(schoolId));
      const r = await authFetch(`/api/schedule-blocks/uncovered?${params}`);
      const data = await r.json();
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load uncovered sessions");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, schoolId]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  async function handleAssignSub() {
    if (!assignDialog || !substituteId) return;
    setAssigning(true);
    try {
      const r = await authFetch(`/api/schedule-blocks/${assignDialog.id}/assign-substitute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          substituteStaffId: Number(substituteId),
          absenceDate: assignDialog.absenceDate ?? today(),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to assign substitute");
      toast.success(data.message ?? "Substitute assigned");
      setAssignDialog(null);
      setSubstituteId("");
      loadSessions();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setAssigning(false);
    }
  }

  const coveredCount = sessions.filter(s => s.substituteStaffId).length;
  const needsCoverageCount = sessions.filter(s => !s.substituteStaffId).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-[12px] text-gray-500 whitespace-nowrap">From</Label>
          <Input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="h-8 text-[13px] w-36"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-[12px] text-gray-500 whitespace-nowrap">To</Label>
          <Input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="h-8 text-[13px] w-36"
            placeholder="no end"
          />
        </div>
        <Button variant="outline" size="sm" onClick={loadSessions} className="h-8 gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
        <div className="ml-auto flex items-center gap-2">
          {needsCoverageCount > 0 && (
            <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 gap-1">
              <AlertTriangle className="h-3 w-3" />
              {needsCoverageCount} need coverage
            </Badge>
          )}
          {coveredCount > 0 && (
            <Badge variant="outline" className="text-emerald-700 border-emerald-200 bg-emerald-50 gap-1">
              <UserCheck className="h-3 w-3" />
              {coveredCount} covered
            </Badge>
          )}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <UserCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-[13px]">No uncovered sessions from this date.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-[13px] ${
                s.substituteStaffId
                  ? "bg-emerald-50/40 border-emerald-100"
                  : "bg-amber-50/40 border-amber-100"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-800">
                    {s.studentName ?? "No student assigned"}
                  </span>
                  {s.serviceTypeName && (
                    <Badge variant="outline" className="text-[11px] py-0 px-1.5">{s.serviceTypeName}</Badge>
                  )}
                  {s.absenceDate && (
                    <span className="text-gray-400 text-[12px]">{s.absenceDate}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-gray-500 text-[12px]">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {DAY_LABELS[s.dayOfWeek] ?? s.dayOfWeek} {fmt12(s.startTime)}–{fmt12(s.endTime)}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {s.originalStaffName ?? `Staff #${s.originalStaffId}`}
                    {s.location && ` · ${s.location}`}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {s.substituteStaffId ? (
                  <span className="text-emerald-700 text-[12px] font-medium flex items-center gap-1">
                    <UserCheck className="h-3.5 w-3.5" />
                    {s.substituteStaffName ?? "Sub assigned"}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    className="h-7 text-[12px] bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => { setAssignDialog(s); setSubstituteId(""); }}
                  >
                    Assign Sub
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!assignDialog} onOpenChange={v => { if (!v) { setAssignDialog(null); setSubstituteId(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800">Assign Substitute</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {assignDialog && (
              <div className="text-[13px] text-gray-600 bg-gray-50 rounded-lg px-3 py-2.5 space-y-0.5">
                <div className="font-medium text-gray-800">{assignDialog.studentName ?? "No student"}</div>
                <div className="text-gray-500">{DAY_LABELS[assignDialog.dayOfWeek]} {fmt12(assignDialog.startTime)}–{fmt12(assignDialog.endTime)} · {assignDialog.serviceTypeName}</div>
                <div className="text-gray-400 text-[12px]">Original: {assignDialog.originalStaffName}</div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Substitute Provider</Label>
              <Select value={substituteId} onValueChange={setSubstituteId}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Select substitute..." /></SelectTrigger>
                <SelectContent>
                  {staffList
                    .filter((s: any) => !assignDialog || s.id !== assignDialog.originalStaffId)
                    .map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)} className="text-[13px]">
                        {s.firstName} {s.lastName}
                        {s.role && <span className="text-gray-400 ml-1">· {s.role}</span>}
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAssignDialog(null)} disabled={assigning}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleAssignSub}
              disabled={assigning || !substituteId}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {assigning ? "Assigning…" : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
