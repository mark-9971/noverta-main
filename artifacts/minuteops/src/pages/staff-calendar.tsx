import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useRole } from "@/lib/role-context";
import { authFetch } from "@workspace/api-client-react";
import {
  Calendar, Plus, AlertTriangle, Trash2, Pencil, ChevronLeft, ChevronRight,
  Building2, Clock, User, Filter, X
} from "lucide-react";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const WEEKDAY_LABELS: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday",
};
const WEEKDAY_SHORT: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri",
};
const HOURS = Array.from({ length: 10 }, (_, i) => `${String(i + 7).padStart(2, "0")}:00`);

const SCHOOL_COLORS = [
  { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-800", dot: "bg-emerald-500" },
  { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-800", dot: "bg-blue-500" },
  { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-800", dot: "bg-amber-500" },
  { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-800", dot: "bg-purple-500" },
  { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-800", dot: "bg-rose-500" },
  { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-800", dot: "bg-cyan-500" },
  { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-800", dot: "bg-orange-500" },
  { bg: "bg-indigo-100", border: "border-indigo-300", text: "text-indigo-800", dot: "bg-indigo-500" },
];

interface StaffSchedule {
  id: number;
  staff_id: number;
  school_id: number;
  day_of_week: string;
  start_time: string;
  end_time: string;
  label: string | null;
  notes: string | null;
  effective_from: string | null;
  effective_to: string | null;
  staffFirstName: string;
  staffLastName: string;
  staffRole: string;
  schoolName: string;
}

interface Conflict {
  scheduleAId: number;
  scheduleBId: number;
  staffId: number;
  staffFirstName: string;
  staffLastName: string;
  dayOfWeek: string;
  aStartTime: string;
  aEndTime: string;
  aSchoolId: number;
  aSchoolName: string;
  bStartTime: string;
  bEndTime: string;
  bSchoolId: number;
  bSchoolName: string;
}

interface StaffOption {
  id: number;
  firstName: string;
  lastName: string;
  role: string;
}

interface SchoolOption {
  id: number;
  name: string;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function formatTime(t: string): string {
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  const ampm = hr >= 12 ? "PM" : "AM";
  const h12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return `${h12}:${m} ${ampm}`;
}

export default function StaffCalendar() {
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "coordinator";

  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [schoolList, setSchoolList] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterStaff, setFilterStaff] = useState<string>("all");
  const [filterSchool, setFilterSchool] = useState<string>("all");

  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<StaffSchedule | null>(null);
  const [formData, setFormData] = useState({
    staffId: "", schoolId: "", dayOfWeek: "monday", startTime: "08:00", endTime: "12:00", label: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const [showConflicts, setShowConflicts] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [schedRes, conflictRes, staffRes, schoolRes] = await Promise.all([
        authFetch("/api/staff-schedules").then(r => r.ok ? r.json() : { schedules: [] }),
        authFetch("/api/staff-schedules/conflicts").then(r => r.ok ? r.json() : { conflicts: [] }),
        authFetch("/api/staff?limit=500").then(r => r.ok ? r.json() : { staff: [] }),
        authFetch("/api/schools").then(r => r.ok ? r.json() : []),
      ]);
      setSchedules(schedRes.schedules || []);
      setConflicts(conflictRes.conflicts || []);
      const staffArr = Array.isArray(staffRes) ? staffRes : (staffRes.staff || []);
      setStaffList(staffArr.map((s: Record<string, unknown>) => ({
        id: s.id as number,
        firstName: s.firstName as string,
        lastName: s.lastName as string,
        role: s.role as string,
      })));
      const schoolArr = Array.isArray(schoolRes) ? schoolRes : (schoolRes.schools || []);
      setSchoolList(schoolArr.map((s: Record<string, unknown>) => ({ id: s.id as number, name: s.name as string })));
    } catch {
      toast.error("Failed to load scheduling data");
    }
    setLoading(false);
  }

  const schoolColorMap = useMemo(() => {
    const map = new Map<number, typeof SCHOOL_COLORS[0]>();
    const uniqueSchools = [...new Set(schedules.map(s => s.school_id))];
    uniqueSchools.forEach((id, i) => {
      map.set(id, SCHOOL_COLORS[i % SCHOOL_COLORS.length]);
    });
    return map;
  }, [schedules]);

  const conflictIds = useMemo(() => {
    const set = new Set<number>();
    conflicts.forEach(c => { set.add(c.scheduleAId); set.add(c.scheduleBId); });
    return set;
  }, [conflicts]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter(s => {
      if (filterStaff !== "all" && s.staff_id !== Number(filterStaff)) return false;
      if (filterSchool !== "all" && s.school_id !== Number(filterSchool)) return false;
      return true;
    });
  }, [schedules, filterStaff, filterSchool]);

  const uniqueStaffInView = useMemo(() => {
    const map = new Map<number, { id: number; name: string; role: string }>();
    filteredSchedules.forEach(s => {
      if (!map.has(s.staff_id)) {
        map.set(s.staff_id, { id: s.staff_id, name: `${s.staffFirstName} ${s.staffLastName}`, role: s.staffRole });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredSchedules]);

  function openCreate(day?: string) {
    setEditingSchedule(null);
    setFormData({
      staffId: filterStaff !== "all" ? filterStaff : "",
      schoolId: filterSchool !== "all" ? filterSchool : "",
      dayOfWeek: day || "monday",
      startTime: "08:00",
      endTime: "12:00",
      label: "",
      notes: "",
    });
    setShowForm(true);
  }

  function openEdit(s: StaffSchedule) {
    setEditingSchedule(s);
    setFormData({
      staffId: String(s.staff_id),
      schoolId: String(s.school_id),
      dayOfWeek: s.day_of_week,
      startTime: s.start_time,
      endTime: s.end_time,
      label: s.label || "",
      notes: s.notes || "",
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!formData.staffId || !formData.schoolId) {
      toast.error("Please select a staff member and school"); return;
    }
    setSaving(true);
    try {
      const payload = {
        staffId: Number(formData.staffId),
        schoolId: Number(formData.schoolId),
        dayOfWeek: formData.dayOfWeek,
        startTime: formData.startTime,
        endTime: formData.endTime,
        label: formData.label || null,
        notes: formData.notes || null,
      };
      const url = editingSchedule ? `/api/staff-schedules/${editingSchedule.id}` : "/api/staff-schedules";
      const method = editingSchedule ? "PUT" : "POST";
      const r = await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (r.status === 409) {
        const d = await r.json();
        toast.error(d.error || "Schedule conflict detected");
        setSaving(false); return;
      }
      if (!r.ok) throw new Error();
      toast.success(editingSchedule ? "Schedule updated" : "Schedule created");
      setShowForm(false);
      loadData();
    } catch {
      toast.error("Failed to save schedule");
    }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this schedule entry?")) return;
    try {
      const r = await authFetch(`/api/staff-schedules/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast.success("Schedule deleted");
      loadData();
    } catch {
      toast.error("Failed to delete");
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-600" />
            Staff Scheduling & Availability
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Cross-building provider schedule — {schedules.length} entries, {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {conflicts.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowConflicts(true)} className="text-red-600 border-red-200 hover:bg-red-50">
              <AlertTriangle className="w-3.5 h-3.5 mr-1" /> {conflicts.length} Conflict{conflicts.length !== 1 ? "s" : ""}
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" onClick={() => openCreate()} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Schedule
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-medium text-gray-500">Filters:</span>
        </div>
        <Select value={filterStaff} onValueChange={setFilterStaff}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="All Staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Staff</SelectItem>
            {staffList.map(s => (
              <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSchool} onValueChange={setFilterSchool}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="All Schools" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Schools</SelectItem>
            {schoolList.map(s => (
              <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filterStaff !== "all" || filterSchool !== "all") && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-gray-500" onClick={() => { setFilterStaff("all"); setFilterSchool("all"); }}>
            <X className="w-3 h-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-1">
        {schoolList.map(school => {
          const color = schoolColorMap.get(school.id);
          if (!color) return null;
          return (
            <div key={school.id} className="flex items-center gap-1.5 text-xs text-gray-600">
              <div className={cn("w-2.5 h-2.5 rounded-full", color.dot)} />
              {school.name}
            </div>
          );
        })}
      </div>

      <Card className="overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-[120px_repeat(5,1fr)] border-b border-gray-200 bg-gray-50">
              <div className="p-2 text-xs font-semibold text-gray-500 border-r border-gray-200">Staff</div>
              {WEEKDAYS.map(day => (
                <div key={day} className="p-2 text-xs font-semibold text-gray-700 text-center border-r border-gray-200 last:border-r-0">
                  {WEEKDAY_LABELS[day]}
                  {isAdmin && (
                    <button onClick={() => openCreate(day)} className="ml-1 text-emerald-500 hover:text-emerald-700">
                      <Plus className="w-3 h-3 inline" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {uniqueStaffInView.length === 0 ? (
              <div className="p-12 text-center text-gray-400 text-sm">
                No schedules found. {isAdmin && "Click \"Add Schedule\" to create one."}
              </div>
            ) : (
              uniqueStaffInView.map(staff => (
                <div key={staff.id} className="grid grid-cols-[120px_repeat(5,1fr)] border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50">
                  <div className="p-2 border-r border-gray-200 flex flex-col justify-center">
                    <span className="text-xs font-semibold text-gray-800 truncate">{staff.name}</span>
                    <span className="text-[10px] text-gray-400 capitalize">{staff.role.replace("_", " ")}</span>
                  </div>
                  {WEEKDAYS.map(day => {
                    const daySchedules = filteredSchedules.filter(s => s.staff_id === staff.id && s.day_of_week === day);
                    return (
                      <div key={day} className="p-1 border-r border-gray-100 last:border-r-0 min-h-[60px] space-y-0.5">
                        {daySchedules.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)).map(sched => {
                          const color = schoolColorMap.get(sched.school_id) || SCHOOL_COLORS[0];
                          const hasConflict = conflictIds.has(sched.id);
                          return (
                            <div
                              key={sched.id}
                              className={cn(
                                "rounded px-1.5 py-1 text-[10px] leading-tight border cursor-default group relative",
                                color.bg, color.border, color.text,
                                hasConflict && "ring-2 ring-red-400 ring-offset-1"
                              )}
                            >
                              <div className="font-semibold flex items-center gap-1">
                                {hasConflict && <AlertTriangle className="w-2.5 h-2.5 text-red-500 flex-shrink-0" />}
                                {formatTime(sched.start_time)}–{formatTime(sched.end_time)}
                              </div>
                              <div className="truncate opacity-80">{sched.schoolName}</div>
                              {sched.label && <div className="truncate opacity-60">{sched.label}</div>}
                              {isAdmin && (
                                <div className="absolute top-0.5 right-0.5 hidden group-hover:flex gap-0.5">
                                  <button onClick={() => openEdit(sched)} className="p-0.5 rounded bg-white/80 hover:bg-white shadow-sm">
                                    <Pencil className="w-2.5 h-2.5 text-gray-500" />
                                  </button>
                                  <button onClick={() => handleDelete(sched.id)} className="p-0.5 rounded bg-white/80 hover:bg-white shadow-sm">
                                    <Trash2 className="w-2.5 h-2.5 text-red-500" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </Card>

      {filteredSchedules.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Providers Scheduled</h3>
            <p className="text-2xl font-bold text-gray-900">{uniqueStaffInView.length}</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Total Time Blocks</h3>
            <p className="text-2xl font-bold text-gray-900">{filteredSchedules.length}</p>
          </Card>
          <Card className="p-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Total Weekly Hours</h3>
            <p className="text-2xl font-bold text-gray-900">
              {(filteredSchedules.reduce((sum, s) => sum + (timeToMinutes(s.end_time) - timeToMinutes(s.start_time)), 0) / 60).toFixed(1)}
            </p>
          </Card>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSchedule ? "Edit Schedule" : "Add Schedule Entry"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Staff Member</Label>
              <Select value={formData.staffId} onValueChange={v => setFormData(p => ({ ...p, staffId: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select staff..." /></SelectTrigger>
                <SelectContent>
                  {staffList.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName} ({s.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">School / Building</Label>
              <Select value={formData.schoolId} onValueChange={v => setFormData(p => ({ ...p, schoolId: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select school..." /></SelectTrigger>
                <SelectContent>
                  {schoolList.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Day of Week</Label>
              <Select value={formData.dayOfWeek} onValueChange={v => setFormData(p => ({ ...p, dayOfWeek: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map(d => <SelectItem key={d} value={d}>{WEEKDAY_LABELS[d]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start Time</Label>
                <Input type="time" value={formData.startTime} onChange={e => setFormData(p => ({ ...p, startTime: e.target.value }))} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">End Time</Label>
                <Input type="time" value={formData.endTime} onChange={e => setFormData(p => ({ ...p, endTime: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Label (optional)</Label>
              <Input value={formData.label} onChange={e => setFormData(p => ({ ...p, label: e.target.value }))} placeholder="e.g. Morning Block" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} placeholder="Any additional notes..." className="mt-1" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Saving..." : editingSchedule ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showConflicts} onOpenChange={setShowConflicts}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-4 h-4" /> Scheduling Conflicts ({conflicts.length})
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {conflicts.map((c, i) => (
              <Card key={i} className="p-3 border-red-200 bg-red-50/50">
                <div className="font-semibold text-sm text-gray-900">{c.staffFirstName} {c.staffLastName}</div>
                <div className="text-xs text-gray-500 capitalize mt-0.5">{WEEKDAY_LABELS[c.dayOfWeek]}</div>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <Building2 className="w-3 h-3 text-gray-400" />
                    <span className="font-medium">{c.aSchoolName}</span>
                    <span className="text-gray-400">{formatTime(c.aStartTime)}–{formatTime(c.aEndTime)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <Building2 className="w-3 h-3 text-gray-400" />
                    <span className="font-medium">{c.bSchoolName}</span>
                    <span className="text-gray-400">{formatTime(c.bStartTime)}–{formatTime(c.bEndTime)}</span>
                  </div>
                </div>
                <p className="text-[10px] text-red-600 mt-1.5">
                  These time blocks overlap. Edit one to resolve the conflict.
                </p>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
