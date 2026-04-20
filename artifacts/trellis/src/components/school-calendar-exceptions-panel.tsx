/**
 * School Calendar v0 — Slice 1 panel.
 *
 * Per-school list + add/edit/delete of day-level exceptions (closures
 * and early-release days). Lives inside the existing School Year settings
 * page; uses an in-panel school dropdown rather than a global school
 * context (school context switching is intentionally out of scope).
 *
 * Read-only against minute totals/dashboards: this panel only writes to
 * the new school_calendar_exceptions table. Later slices will fold these
 * rows into expected-slot and Today logic.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";
import { CalendarX2, Plus, Pencil, Trash2, Sun } from "lucide-react";

interface School { id: number; name: string }
interface Exception {
  id: number;
  schoolId: number;
  exceptionDate: string;
  type: "closure" | "early_release";
  dismissalTime: string | null;
  reason: string;
  notes: string | null;
}

const EMPTY_FORM: {
  exceptionDate: string;
  type: "closure" | "early_release";
  dismissalTime: string;
  reason: string;
  notes: string;
} = { exceptionDate: "", type: "closure", dismissalTime: "", reason: "", notes: "" };

function formatDateUS(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

export function SchoolCalendarExceptionsPanel() {
  const [schools, setSchools] = useState<School[]>([]);
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const [rows, setRows] = useState<Exception[]>([]);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Exception | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Load district schools once.
  useEffect(() => {
    (async () => {
      try {
        const r = await authFetch("/api/schools");
        if (!r.ok) throw new Error();
        const data: School[] = await r.json();
        setSchools(data);
        if (data.length > 0 && schoolId == null) setSchoolId(data[0].id);
      } catch {
        toast.error("Failed to load schools");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadExceptions(sId: number) {
    setLoading(true);
    try {
      const r = await authFetch(`/api/schools/${sId}/calendar-exceptions`);
      if (!r.ok) throw new Error();
      setRows(await r.json());
    } catch {
      toast.error("Failed to load exceptions");
    } finally { setLoading(false); }
  }

  useEffect(() => { if (schoolId != null) loadExceptions(schoolId); }, [schoolId]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => a.exceptionDate.localeCompare(b.exceptionDate)),
    [rows],
  );

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }
  function openEdit(ex: Exception) {
    setEditing(ex);
    setForm({
      exceptionDate: ex.exceptionDate,
      type: ex.type,
      dismissalTime: ex.dismissalTime ?? "",
      reason: ex.reason,
      notes: ex.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (schoolId == null) return;
    if (!form.exceptionDate || !form.reason.trim()) {
      toast.error("Date and reason are required");
      return;
    }
    if (form.type === "early_release" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(form.dismissalTime)) {
      toast.error("Dismissal time must be HH:MM (24h)");
      return;
    }

    const payload = {
      exceptionDate: form.exceptionDate,
      type: form.type,
      dismissalTime: form.type === "early_release" ? form.dismissalTime : null,
      reason: form.reason.trim(),
      notes: form.notes.trim() ? form.notes.trim() : null,
    };

    setSaving(true);
    try {
      const url = editing
        ? `/api/schools/${schoolId}/calendar-exceptions/${editing.id}`
        : `/api/schools/${schoolId}/calendar-exceptions`;
      const method = editing ? "PATCH" : "POST";
      const r = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (r.status === 409) {
        toast.error("An exception already exists for that date");
        return;
      }
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        toast.error(body.error || "Save failed");
        return;
      }
      toast.success(editing ? "Exception updated" : "Exception added");
      setDialogOpen(false);
      await loadExceptions(schoolId);
    } catch {
      toast.error("Save failed");
    } finally { setSaving(false); }
  }

  async function handleDelete(ex: Exception) {
    if (schoolId == null) return;
    if (!confirm(`Delete the ${ex.type === "closure" ? "closure" : "early release"} on ${formatDateUS(ex.exceptionDate)}?`)) return;
    try {
      const r = await authFetch(`/api/schools/${schoolId}/calendar-exceptions/${ex.id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 204) throw new Error();
      toast.success("Exception deleted");
      await loadExceptions(schoolId);
    } catch {
      toast.error("Delete failed");
    }
  }

  return (
    <Card className="border-gray-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarX2 className="w-5 h-5 text-amber-600" />
          School Closures & Early Release
        </CardTitle>
        <p className="text-sm text-gray-500 mt-1">
          Per-school days when school is closed or dismisses early. These are recorded
          for reference now; later releases will use them when computing missed-session
          and expected-minute totals.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="space-y-1 min-w-[240px]">
            <Label className="text-xs text-gray-600">School</Label>
            <Select
              value={schoolId != null ? String(schoolId) : ""}
              onValueChange={(v) => setSchoolId(parseInt(v))}
            >
              <SelectTrigger className="text-sm"><SelectValue placeholder="Select a school" /></SelectTrigger>
              <SelectContent>
                {schools.map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={openCreate} disabled={schoolId == null} className="gap-2">
            <Plus className="w-4 h-4" /> Add Exception
          </Button>
        </div>

        {loading ? (
          <div className="text-sm text-gray-500 py-6 text-center">Loading…</div>
        ) : sortedRows.length === 0 ? (
          <div className="text-sm text-gray-500 py-6 text-center border border-dashed rounded-lg">
            No exceptions recorded for this school.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-left px-3 py-2">Reason</th>
                  <th className="text-left px-3 py-2">Notes</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map(ex => (
                  <tr key={ex.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateUS(ex.exceptionDate)}</td>
                    <td className="px-3 py-2">
                      {ex.type === "closure" ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-xs">
                          <CalendarX2 className="w-3 h-3" /> Closure
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-xs">
                          <Sun className="w-3 h-3" /> Early Release{ex.dismissalTime ? ` · ${ex.dismissalTime}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{ex.reason}</td>
                    <td className="px-3 py-2 text-gray-600 text-xs">{ex.notes ?? ""}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(ex)} className="h-7 px-2">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(ex)} className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Exception" : "Add School Exception"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Date</Label>
              <Input
                type="date"
                value={form.exceptionDate}
                onChange={e => setForm({ ...form, exceptionDate: e.target.value })}
                className="text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Type</Label>
              <Select
                value={form.type}
                onValueChange={(v) => setForm({ ...form, type: v as "closure" | "early_release", dismissalTime: v === "closure" ? "" : form.dismissalTime })}
              >
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="closure">Full-Day Closure</SelectItem>
                  <SelectItem value="early_release">Early Release</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.type === "early_release" && (
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Dismissal Time (HH:MM, 24h)</Label>
                <Input
                  type="time"
                  value={form.dismissalTime}
                  onChange={e => setForm({ ...form, dismissalTime: e.target.value })}
                  className="text-sm"
                />
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Reason</Label>
              <Input
                value={form.reason}
                onChange={e => setForm({ ...form, reason: e.target.value })}
                placeholder="e.g. Snow Day, PD Half Day, Thanksgiving"
                className="text-sm"
                maxLength={200}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Notes (optional)</Label>
              <Input
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                className="text-sm"
                maxLength={1000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : (editing ? "Save Changes" : "Add Exception")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
