import { useState, useEffect, useCallback } from "react";
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
import { UserX, UserCheck, Plus } from "lucide-react";
import { ABSENCE_TYPE_LABELS, fmt12, today } from "./utils";

export function AbsencesTab({ schoolId }: { schoolId?: number | null }) {
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
