import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useRole } from "@/lib/role-context";
import { authFetch } from "@/lib/auth-fetch";
import { Calendar, Plus, AlertTriangle } from "lucide-react";
import {
  StaffSchedule, Conflict, CoverageGap, ProviderSummary,
  StaffOption, SchoolOption, ServiceTypeOption, FormDataT,
  SCHOOL_COLORS, timeToMinutes,
} from "./types";
import { FilterBar } from "./FilterBar";
import { ScheduleGrid } from "./ScheduleGrid";
import { ProviderSummaryPanel } from "./ProviderSummaryPanel";
import { CoverageGapsPanel } from "./CoverageGapsPanel";
import { ScheduleFormDialog } from "./ScheduleFormDialog";
import { ConflictsDialog } from "./ConflictsDialog";

export default function StaffCalendar() {
  const { role } = useRole();
  const isAdmin = role === "admin" || role === "coordinator";

  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [coverageGaps, setCoverageGaps] = useState<CoverageGap[]>([]);
  const [providerSummary, setProviderSummary] = useState<ProviderSummary | null>(null);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [schoolList, setSchoolList] = useState<SchoolOption[]>([]);
  const [serviceTypeList, setServiceTypeList] = useState<ServiceTypeOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterStaff, setFilterStaff] = useState<string>("all");
  const [filterSchool, setFilterSchool] = useState<string>("all");
  const [filterServiceType, setFilterServiceType] = useState<string>("all");

  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<StaffSchedule | null>(null);
  const [formData, setFormData] = useState<FormDataT>({
    staffId: "", schoolId: "", serviceTypeId: "", dayOfWeek: "monday", startTime: "08:00", endTime: "12:00", label: "", notes: "", effectiveFrom: "", effectiveTo: "",
  });
  const [saving, setSaving] = useState(false);
  const [showConflicts, setShowConflicts] = useState(false);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (filterStaff !== "all") {
      authFetch(`/api/staff-schedules/provider-summary/${filterStaff}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => setProviderSummary(d))
        .catch(() => setProviderSummary(null));
    } else {
      setProviderSummary(null);
    }
  }, [filterStaff]);

  async function loadData() {
    setLoading(true);
    try {
      const [schedRes, conflictRes, gapsRes, staffRes, schoolRes, stRes] = await Promise.all([
        authFetch("/api/staff-schedules").then(r => r.ok ? r.json() : { schedules: [] }),
        authFetch("/api/staff-schedules/conflicts").then(r => r.ok ? r.json() : { conflicts: [] }),
        authFetch("/api/staff-schedules/coverage-gaps").then(r => r.ok ? r.json() : { gaps: [] }),
        authFetch("/api/staff?limit=500").then(r => r.ok ? r.json() : { staff: [] }),
        authFetch("/api/schools").then(r => r.ok ? r.json() : []),
        authFetch("/api/service-types").then(r => r.ok ? r.json() : []),
      ]);
      setSchedules(schedRes.schedules || []);
      setConflicts(conflictRes.conflicts || []);
      setCoverageGaps(gapsRes.gaps || []);
      const stArr = Array.isArray(stRes) ? stRes : (stRes.serviceTypes || []);
      setServiceTypeList(stArr.map((s: Record<string, unknown>) => ({
        id: s.id as number, name: s.name as string, category: s.category as string,
      })));
      const staffArr = Array.isArray(staffRes) ? staffRes : (staffRes.staff || []);
      setStaffList(staffArr.map((s: Record<string, unknown>) => ({
        id: s.id as number, firstName: s.firstName as string, lastName: s.lastName as string, role: s.role as string,
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
    uniqueSchools.forEach((id, i) => map.set(id, SCHOOL_COLORS[i % SCHOOL_COLORS.length]));
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
      if (filterServiceType !== "all" && s.service_type_id !== Number(filterServiceType)) return false;
      return true;
    });
  }, [schedules, filterStaff, filterSchool, filterServiceType]);

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
      serviceTypeId: filterServiceType !== "all" ? filterServiceType : "",
      dayOfWeek: day || "monday",
      startTime: "08:00", endTime: "12:00", label: "", notes: "", effectiveFrom: "", effectiveTo: "",
    });
    setShowForm(true);
  }

  function openEdit(s: StaffSchedule) {
    setEditingSchedule(s);
    setFormData({
      staffId: String(s.staff_id),
      schoolId: String(s.school_id),
      serviceTypeId: s.service_type_id ? String(s.service_type_id) : "",
      dayOfWeek: s.day_of_week,
      startTime: s.start_time,
      endTime: s.end_time,
      label: s.label || "",
      notes: s.notes || "",
      effectiveFrom: s.effective_from || "",
      effectiveTo: s.effective_to || "",
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
        serviceTypeId: formData.serviceTypeId ? Number(formData.serviceTypeId) : null,
        dayOfWeek: formData.dayOfWeek,
        startTime: formData.startTime,
        endTime: formData.endTime,
        label: formData.label || null,
        notes: formData.notes || null,
        effectiveFrom: formData.effectiveFrom || null,
        effectiveTo: formData.effectiveTo || null,
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

      <FilterBar
        staffList={staffList} schoolList={schoolList} serviceTypeList={serviceTypeList}
        filterStaff={filterStaff} setFilterStaff={setFilterStaff}
        filterSchool={filterSchool} setFilterSchool={setFilterSchool}
        filterServiceType={filterServiceType} setFilterServiceType={setFilterServiceType}
      />

      <ScheduleGrid
        uniqueStaffInView={uniqueStaffInView}
        filteredSchedules={filteredSchedules}
        schoolList={schoolList}
        schoolColorMap={schoolColorMap}
        conflictIds={conflictIds}
        isAdmin={isAdmin}
        onCreate={openCreate}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

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

      {providerSummary && (
        <ProviderSummaryPanel
          providerSummary={providerSummary}
          staffList={staffList}
          filterStaff={filterStaff}
          schoolColorMap={schoolColorMap}
        />
      )}

      {coverageGaps.length > 0 && <CoverageGapsPanel coverageGaps={coverageGaps} />}

      <ScheduleFormDialog
        open={showForm} setOpen={setShowForm}
        editing={!!editingSchedule}
        formData={formData} setFormData={setFormData}
        staffList={staffList} schoolList={schoolList} serviceTypeList={serviceTypeList}
        saving={saving} onSave={handleSave}
      />

      <ConflictsDialog open={showConflicts} setOpen={setShowConflicts} conflicts={conflicts} />
    </div>
  );
}
