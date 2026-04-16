import { useState, useEffect, useCallback } from "react";
import { Redirect } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";
import { useListStaff } from "@workspace/api-client-react";
import { UserX, UserCheck, AlertTriangle, BarChart2, RefreshCw, Plus, Clock, User, History, FileText, ChevronDown, ChevronUp, Shield } from "lucide-react";
import { useSchoolContext } from "@/lib/school-context";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

type Tab = "uncovered" | "absences" | "history" | "report" | "workload";

const ABSENCE_TYPE_LABELS: Record<string, string> = {
  sick: "Sick",
  personal: "Personal",
  professional_development: "Professional Development",
  emergency: "Emergency",
  other: "Other",
};

const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri",
};

function fmt12(time: string) {
  const [h, m] = time.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function getNextWeekday(dayOfWeek: string): string {
  const today = new Date();
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const targetDay = days.indexOf(dayOfWeek.toLowerCase());
  const currentDay = today.getDay();
  let daysUntil = targetDay - currentDay;
  if (daysUntil <= 0) daysUntil += 7;
  const next = new Date(today);
  next.setDate(today.getDate() + daysUntil);
  return next.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Uncovered Sessions Tab ────────────────────────────────────────────────
function UncoveredTab({ schoolId }: { schoolId?: number | null }) {
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

// ─── Staff Absences Tab ────────────────────────────────────────────────────
function AbsencesTab({ schoolId }: { schoolId?: number | null }) {
  const [staffId, setStaffId] = useState("");
  const [absences, setAbsences] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [form, setForm] = useState({ absenceDate: today(), absenceType: "sick", notes: "" });
  const [saving, setSaving] = useState(false);

  const { data: staffData } = useListStaff({ status: "active", ...(schoolId ? { schoolId: String(schoolId) } : {}) });
  const staffList = (staffData as any[]) ?? [];

  const loadAbsences = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      const r = await authFetch(`/api/staff/${staffId}/absences`);
      const data = await r.json();
      setAbsences(Array.isArray(data) ? data : []);
    } catch {
      toast.error("Failed to load absences");
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => { loadAbsences(); }, [loadAbsences]);

  async function handleLogAbsence() {
    if (!staffId) { toast.error("Select a staff member first"); return; }
    setSaving(true);
    try {
      const r = await authFetch(`/api/staff/${staffId}/absences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          absenceDate: form.absenceDate,
          absenceType: form.absenceType,
          notes: form.notes || null,
          ...(schoolId ? { schoolId } : {}),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to log absence");
      const uncoveredCount = data.uncoveredBlockCount ?? 0;
      toast.success(
        uncoveredCount > 0
          ? `Absence logged. ${uncoveredCount} session${uncoveredCount > 1 ? "s" : ""} flagged as uncovered.`
          : "Absence logged."
      );
      setLogDialogOpen(false);
      setForm({ absenceDate: today(), absenceType: "sick", notes: "" });
      loadAbsences();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAbsence(id: number) {
    try {
      const r = await authFetch(`/api/absences/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete");
      toast.success("Absence removed");
      loadAbsences();
    } catch {
      toast.error("Failed to delete absence");
    }
  }

  const selectedStaff = staffList.find((s: any) => String(s.id) === staffId);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-[12px] text-gray-500 whitespace-nowrap">Staff member</Label>
          <Select value={staffId} onValueChange={setStaffId}>
            <SelectTrigger className="h-8 text-[13px] w-52">
              <SelectValue placeholder="Select staff…" />
            </SelectTrigger>
            <SelectContent>
              {staffList.map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)} className="text-[13px]">
                  {s.firstName} {s.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          size="sm"
          className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          onClick={() => setLogDialogOpen(true)}
          disabled={!staffId}
        >
          <Plus className="h-3.5 w-3.5" />
          Log Absence
        </Button>
      </div>

      {!staffId ? (
        <div className="text-center py-12 text-gray-400">
          <UserX className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-[13px]">Select a staff member to view absences.</p>
        </div>
      ) : loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : absences.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <UserCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-[13px]">No absences logged for {selectedStaff ? `${selectedStaff.firstName} ${selectedStaff.lastName}` : "this staff member"}.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {absences.map(a => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-gray-100 bg-white text-[13px]">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-800">{a.absenceDate}</span>
                  <Badge variant="outline" className="text-[11px] py-0 px-1.5 capitalize">
                    {ABSENCE_TYPE_LABELS[a.absenceType] ?? a.absenceType}
                  </Badge>
                  {a.startTime && a.endTime && (
                    <span className="text-gray-400 text-[12px]">{fmt12(a.startTime)}–{fmt12(a.endTime)}</span>
                  )}
                </div>
                {a.notes && <div className="text-gray-400 text-[12px] mt-0.5 truncate">{a.notes}</div>}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-[12px] text-red-500 hover:text-red-600 hover:bg-red-50"
                onClick={() => handleDeleteAbsence(a.id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={logDialogOpen} onOpenChange={v => { if (!v) setLogDialogOpen(false); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800">Log Absence</DialogTitle>
          </DialogHeader>
          {selectedStaff && (
            <p className="text-[13px] text-gray-500">
              {selectedStaff.firstName} {selectedStaff.lastName} · {selectedStaff.role}
            </p>
          )}
          <div className="space-y-3 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Date</Label>
                <Input
                  type="date"
                  value={form.absenceDate}
                  onChange={e => setForm(f => ({ ...f, absenceDate: e.target.value }))}
                  className="h-9 text-[13px]"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] font-medium text-gray-600">Reason</Label>
                <Select value={form.absenceType} onValueChange={v => setForm(f => ({ ...f, absenceType: v }))}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ABSENCE_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k} className="text-[13px]">{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Notes (optional)</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="text-[13px] min-h-[60px] resize-none"
                placeholder="Additional notes…"
              />
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5 text-[12px] text-amber-700">
              Any recurring sessions scheduled for this staff on that day will be automatically flagged as uncovered.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLogDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleLogAbsence}
              disabled={saving || !form.absenceDate}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {saving ? "Saving…" : "Log Absence"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Workload Summary Tab ──────────────────────────────────────────────────
function WorkloadTab({ schoolId }: { schoolId?: number | null }) {
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

// ─── Coverage History Tab ──────────────────────────────────────────────────
function HistoryTab({ schoolId }: { schoolId?: number | null }) {
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
  }, [startDate, endDate]);

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

// ─── Substitute Usage Report Tab ──────────────────────────────────────────
function ReportTab({ schoolId }: { schoolId?: number | null }) {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState("3");
  const [view, setView] = useState<"substitutes" | "absences">("substitutes");

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ months });
      if (schoolId) params.set("schoolId", String(schoolId));
      const r = await authFetch(`/api/coverage/substitute-report?${params}`);
      const data = await r.json();
      setReport(data);
    } catch {
      toast.error("Failed to load substitute report");
    } finally {
      setLoading(false);
    }
  }, [months]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const substitutes = report?.substitutes ?? [];
  const absences = report?.absences ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Label className="text-[12px] text-gray-500 whitespace-nowrap">Period</Label>
          <Select value={months} onValueChange={setMonths}>
            <SelectTrigger className="h-8 text-[13px] w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last month</SelectItem>
              <SelectItem value="3">Last 3 months</SelectItem>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last year</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={loadReport} className="h-8 gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
        <div className="ml-auto flex gap-1">
          <Button
            variant={view === "substitutes" ? "default" : "outline"}
            size="sm"
            className={`h-7 text-[12px] ${view === "substitutes" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
            onClick={() => setView("substitutes")}
          >
            Substitutes
          </Button>
          <Button
            variant={view === "absences" ? "default" : "outline"}
            size="sm"
            className={`h-7 text-[12px] ${view === "absences" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
            onClick={() => setView("absences")}
          >
            Absences
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
      ) : view === "substitutes" ? (
        <>
          {substitutes.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-[13px]">No substitute coverage data for this period.</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={Math.max(150, substitutes.length * 32 + 40)}>
                <BarChart data={substitutes} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border rounded-lg shadow-lg p-2 text-xs">
                        <p className="font-medium">{d.name}</p>
                        <p>Sessions covered: {d.sessionsCovered}</p>
                        <p>Unique dates: {d.uniqueDates}</p>
                        <p>Providers covered for: {d.providersCoveredFor}</p>
                      </div>
                    );
                  }} />
                  <Bar dataKey="sessionsCovered" name="Sessions Covered" radius={[0, 4, 4, 0]}>
                    {substitutes.map((_: any, i: number) => (
                      <Cell key={i} fill={i === 0 ? "#10b981" : i < 3 ? "#34d399" : "#6ee7b7"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="space-y-1">
                {substitutes.map((s: any) => (
                  <div key={s.staffId} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-gray-100 bg-white text-[13px]">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-800">{s.name}</span>
                      <span className="ml-1.5 text-[11px] text-gray-400 capitalize">{(s.role ?? "").replace(/_/g, " ")}</span>
                    </div>
                    <div className="flex items-center gap-4 text-[12px] text-gray-500">
                      <span><strong className="text-gray-700">{s.sessionsCovered}</strong> sessions</span>
                      <span><strong className="text-gray-700">{s.uniqueDates}</strong> days</span>
                      <span><strong className="text-gray-700">{s.providersCoveredFor}</strong> providers</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {absences.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-[13px]">No absence data for this period.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {absences.map((a: any) => (
                <div key={a.staffId} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-gray-100 bg-white text-[13px]">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-gray-800">{a.name}</span>
                    <span className="ml-1.5 text-[11px] text-gray-400 capitalize">{(a.role ?? "").replace(/_/g, " ")}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[12px] text-gray-500">
                    <span><strong className="text-gray-700">{a.absenceDates}</strong> absence days</span>
                    <span><strong className="text-gray-700">{a.sessionsAffected}</strong> sessions affected</span>
                    <span>
                      <strong className={`${a.coverageRate >= 80 ? "text-emerald-600" : a.coverageRate >= 50 ? "text-amber-600" : "text-red-600"}`}>
                        {a.coverageRate}%
                      </strong> covered
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Daily Summary Card ───────────────────────────────────────────────────
function DailySummary({ schoolId }: { schoolId?: number | null }) {
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
  }, []);

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

// ─── Main Page ─────────────────────────────────────────────────────────────
const COVERAGE_ROLES = ["admin", "coordinator", "case_manager"];

export default function CoveragePage() {
  const { role } = useRole();
  const [tab, setTab] = useState<Tab>("uncovered");
  const { typedFilter } = useSchoolContext();
  const schoolId = (typedFilter as any)?.schoolId ? Number((typedFilter as any).schoolId) : null;

  if (!COVERAGE_ROLES.includes(role)) return <Redirect to="/" />;

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "uncovered", label: "Uncovered Sessions", icon: AlertTriangle },
    { key: "absences", label: "Staff Absences", icon: UserX },
    { key: "history", label: "Coverage Log", icon: History },
    { key: "report", label: "Usage Report", icon: FileText },
    { key: "workload", label: "Workload", icon: BarChart2 },
  ];

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-[18px] font-semibold text-gray-900">Coverage & Substitutes</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Track absences, assign substitutes, and monitor coverage patterns.
        </p>
      </div>

      <DailySummary schoolId={schoolId} />

      <Card>
        <CardHeader className="pb-0 pt-4 px-4">
          <div className="flex gap-1 border-b border-gray-100 pb-0 -mb-px overflow-x-auto">
            {tabs.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                    tab === t.key
                      ? "border-emerald-600 text-emerald-700"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {tab === "uncovered" && <UncoveredTab schoolId={schoolId} />}
          {tab === "absences" && <AbsencesTab schoolId={schoolId} />}
          {tab === "history" && <HistoryTab schoolId={schoolId} />}
          {tab === "report" && <ReportTab schoolId={schoolId} />}
          {tab === "workload" && <WorkloadTab schoolId={schoolId} />}
        </CardContent>
      </Card>
    </div>
  );
}
