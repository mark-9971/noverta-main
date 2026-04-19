import { useState, useEffect, useMemo } from "react";
import { useSearch, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useListScheduleBlocks, useListStaff, useListSpedStudents, listSchools, listServiceTypes, createScheduleBlock, updateScheduleBlock, deleteScheduleBlock } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import { authFetch } from "@/lib/auth-fetch";
import { RISK_CONFIG } from "@/lib/constants";
import { toast } from "sonner";
import { Settings, RotateCcw, Calendar, Plus, ChevronLeft, ChevronRight, Filter, X, AlertTriangle, Sparkles } from "lucide-react";
import {
  HOURS, BLOCK_COLORS, ScheduleType, SchoolScheduleConfig,
  SCHEDULE_TYPE_LABELS, getRotationColumns, getCurrentRotationDay, fallbackRotationCol,
  WEEKDAYS,
} from "./constants";
import { ScheduleSettingsDialog } from "./ScheduleSettingsDialog";
import { ScheduleGrid } from "./ScheduleGrid";
import { ScheduleListView } from "./ScheduleListView";
import { BlockFormDialog, BlockForm } from "./BlockFormDialog";
import { DeleteBlockDialog } from "./DeleteBlockDialog";
import { AutoSchedulerPanel } from "./AutoSchedulerPanel";

const DEFAULT_FORM: BlockForm = {
  staffId: "", studentId: "", serviceTypeId: "", dayOfWeek: "monday",
  startTime: "09:00", endTime: "10:00", location: "", blockLabel: "", notes: "",
  blockType: "service", isRecurring: true, rotationDay: "",
  recurrenceType: "weekly", effectiveFrom: "", effectiveTo: "",
};

// ─── Week nav helpers ─────────────────────────────────────────────────────────

function getMondayOfWeek(offset: number): Date {
  const today = new Date();
  const day = today.getDay(); // 0=Sun 1=Mon … 6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
  const mon = new Date(today);
  mon.setDate(today.getDate() + diff + offset * 7);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(d.getDate() + n);
  return r;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayIso(): string {
  return isoDate(new Date());
}

function parseWeekOffset(search: string): number {
  const p = new URLSearchParams(search).get("week");
  if (!p || !/^\d{4}-\d{2}-\d{2}$/.test(p)) return 0;
  const currentMonday = getMondayOfWeek(0);
  const paramDate = new Date(p + "T00:00:00");
  const diff = Math.round((paramDate.getTime() - currentMonday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return diff;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface ComplianceRow {
  studentId: number;
  studentName: string;
  serviceTypeName: string;
  riskStatus: string;
  deliveredMinutes: number;
  requiredMinutes: number;
  remainingMinutes: number;
  percentComplete: number;
}

export default function Schedule({ embedded = false }: { embedded?: boolean } = {}) {
  const search = useSearch();
  const [, navigate] = useLocation();

  // ── filter state ──────────────────────────────────────────────────────────
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [studentFilter, setStudentFilter] = useState<string>("all");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  // ── week nav ──────────────────────────────────────────────────────────────
  const [weekOffset, setWeekOffset] = useState(() => parseWeekOffset(search));
  const monday = useMemo(() => getMondayOfWeek(weekOffset), [weekOffset]);
  const weekDates = useMemo(() => WEEKDAYS.map((_, i) => addDays(monday, i)), [monday]);
  const todayIsoStr = useMemo(() => todayIso(), []);
  const weekDateMap = useMemo(() => {
    const m: Record<string, string> = {};
    WEEKDAYS.forEach((day, i) => { m[day] = isoDate(weekDates[i]); });
    return m;
  }, [weekDates]);

  // Sync weekOffset → URL ?week= param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const currentWeekParam = params.get("week");
    const weekStart = isoDate(getMondayOfWeek(weekOffset));
    const expected = weekOffset === 0 ? null : weekStart;
    if (currentWeekParam === expected) return;
    if (weekOffset === 0) {
      params.delete("week");
    } else {
      params.set("week", weekStart);
    }
    const qs = params.toString();
    navigate(qs ? `?${qs}` : "?", { replace: true });
  }, [weekOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── view / dialog state ───────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [schoolConfig, setSchoolConfig] = useState<SchoolScheduleConfig | null>(null);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any>(null);
  const [deletingBlock, setDeletingBlock] = useState<any>(null);
  const [blockSaving, setBlockSaving] = useState(false);
  const [serviceTypesList, setServiceTypesList] = useState<any[]>([]);
  const [blockForm, setBlockForm] = useState<BlockForm>(DEFAULT_FORM);
  const [autoSchedulerOpen, setAutoSchedulerOpen] = useState(false);

  const { filterParams, selectedSchoolId } = useSchoolContext();
  const { role } = useRole();

  // ── data fetches ──────────────────────────────────────────────────────────
  const { data: blocks, isLoading, isError, refetch } = useListScheduleBlocks({ ...filterParams } as any);
  const { data: staff } = useListStaff({ ...filterParams } as any);
  const { data: spedStudentsRaw } = useListSpedStudents(filterParams as any);
  const studentList = (Array.isArray(spedStudentsRaw) ? spedStudentsRaw : []) as any[];

  // Compliance data — always fetch so we can badge all blocks
  const complianceQuery = useQuery<ComplianceRow[]>({
    queryKey: ["schedule/compliance", filterParams],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (filterParams.schoolId) qs.set("schoolId", String(filterParams.schoolId));
      if (filterParams.districtId) qs.set("districtId", String(filterParams.districtId));
      const r = await authFetch(`/api/minute-progress?${qs}`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 120_000,
  });
  const complianceRows: ComplianceRow[] = complianceQuery.data ?? [];

  // Map studentId → worst risk status (a student may appear multiple times for different services)
  const complianceMap = useMemo(() => {
    const PRIORITY = ["out_of_compliance", "at_risk", "slightly_behind", "no_data", "on_track", "completed"];
    const m = new Map<number, ComplianceRow>();
    for (const row of complianceRows) {
      const cur = m.get(row.studentId);
      if (!cur) { m.set(row.studentId, row); continue; }
      if (PRIORITY.indexOf(row.riskStatus) < PRIORITY.indexOf(cur.riskStatus)) {
        m.set(row.studentId, row);
      }
    }
    return m;
  }, [complianceRows]);

  const atRiskStudentIds = useMemo(() => {
    return new Set(
      Array.from(complianceMap.values())
        .filter(r => ["out_of_compliance", "at_risk", "slightly_behind"].includes(r.riskStatus))
        .map(r => r.studentId)
    );
  }, [complianceMap]);

  useEffect(() => {
    listServiceTypes().then((r: any) => setServiceTypesList(Array.isArray(r) ? r : [])).catch(() => {});
  }, []);

  useEffect(() => {
    listSchools().then((schools: any) => {
      if (!schools?.length) return;
      const target = selectedSchoolId
        ? schools.find((s: any) => s.id === selectedSchoolId)
        : schools[0];
      if (target) setSchoolConfig(target);
    }).catch(() => {});
  }, [selectedSchoolId]);

  // ── filter derivations ────────────────────────────────────────────────────
  const blockList = (blocks as any[]) ?? [];
  const staffList = (staff as any[]) ?? [];

  // Unique staff roles for the role filter
  const staffRoles = useMemo(() => {
    const seen = new Set<string>();
    staffList.forEach(s => { if (s.role) seen.add(s.role); });
    return Array.from(seen).sort();
  }, [staffList]);

  // Staff filtered by role
  const staffByRole = useMemo(() => {
    if (roleFilter === "all") return staffList;
    return staffList.filter(s => s.role === roleFilter);
  }, [staffList, roleFilter]);

  const filteredBlocks = useMemo(() => {
    return blockList.filter(b => {
      if (staffFilter !== "all" && String(b.staffId) !== staffFilter) return false;
      if (studentFilter !== "all" && String(b.studentId) !== studentFilter) return false;
      if (serviceTypeFilter !== "all" && String(b.serviceTypeId) !== serviceTypeFilter) return false;
      // role filter: filter by staff role — check the staff list
      if (roleFilter !== "all") {
        const staffMember = staffList.find(s => s.id === b.staffId);
        if (!staffMember || staffMember.role !== roleFilter) return false;
      }
      return true;
    });
  }, [blockList, staffFilter, studentFilter, serviceTypeFilter, roleFilter, staffList]);

  const hasActiveFilters = staffFilter !== "all" || studentFilter !== "all" || serviceTypeFilter !== "all" || roleFilter !== "all";

  // Compliance ribbon data — for the selected student
  const selectedStudentCompliance = useMemo(() => {
    if (studentFilter === "all") return null;
    return complianceRows.filter(r => String(r.studentId) === studentFilter);
  }, [studentFilter, complianceRows]);

  // ── grid construction ─────────────────────────────────────────────────────
  const scheduleType: ScheduleType = schoolConfig?.scheduleType ?? "standard";
  const columns = getRotationColumns(scheduleType);
  const todayRotationDay = schoolConfig ? getCurrentRotationDay(schoolConfig) : null;

  // For standard schedule: map weekday → actual date from week nav
  const todayColumn = useMemo(() => {
    if (scheduleType !== "standard") return todayRotationDay;
    return WEEKDAYS.find(d => weekDateMap[d] === todayIsoStr) ?? todayRotationDay;
  }, [scheduleType, weekDateMap, todayIsoStr, todayRotationDay]);

  const serviceColorMap: Record<number, string> = {};
  let colorIdx = 0;
  const grid: Record<string, Record<string, any[]>> = {};
  for (const col of columns) {
    grid[col] = {};
    for (const hour of HOURS) grid[col][hour] = [];
  }

  for (const b of filteredBlocks) {
    if (!serviceColorMap[b.serviceTypeId]) {
      serviceColorMap[b.serviceTypeId] = BLOCK_COLORS[colorIdx % BLOCK_COLORS.length];
      colorIdx++;
    }
    let col: string;
    if (scheduleType === "standard") {
      col = b.dayOfWeek;
    } else {
      col = b.rotationDay ?? fallbackRotationCol(b.dayOfWeek, scheduleType);
    }
    if (!columns.includes(col)) continue;
    const blockHour = b.startTime?.substring(0, 5);
    if (HOURS.includes(blockHour)) {
      grid[col][blockHour].push(b);
    }
  }

  // Compute which days the selected student has NO scheduled session (gap detection)
  const studentGapDays = useMemo(() => {
    if (studentFilter === "all") return new Set<string>();
    const scheduled = new Set<string>();
    filteredBlocks.forEach(b => {
      const col = scheduleType === "standard" ? b.dayOfWeek : (b.rotationDay ?? fallbackRotationCol(b.dayOfWeek, scheduleType));
      scheduled.add(col);
    });
    return new Set(columns.filter(c => !scheduled.has(c)));
  }, [studentFilter, filteredBlocks, columns, scheduleType]);

  // ── dialog helpers ────────────────────────────────────────────────────────
  function openAddBlock(col?: string, hour?: string) {
    setEditingBlock(null);
    const isStandard = scheduleType === "standard";
    setBlockForm({
      ...DEFAULT_FORM,
      staffId: staffFilter !== "all" ? staffFilter : "",
      studentId: studentFilter !== "all" ? studentFilter : "",
      serviceTypeId: serviceTypeFilter !== "all" ? serviceTypeFilter : "",
      dayOfWeek: isStandard && col ? col : "monday",
      startTime: hour || "09:00",
      endTime: hour ? `${String(Number(hour.split(":")[0]) + 1).padStart(2, "0")}:00` : "10:00",
      rotationDay: !isStandard && col ? col : "",
    });
    setBlockDialogOpen(true);
  }

  function openEditBlock(block: any) {
    setEditingBlock(block);
    setBlockForm({
      staffId: String(block.staffId),
      studentId: block.studentId ? String(block.studentId) : "",
      serviceTypeId: block.serviceTypeId ? String(block.serviceTypeId) : "",
      dayOfWeek: block.dayOfWeek,
      startTime: block.startTime?.substring(0, 5) || "09:00",
      endTime: block.endTime?.substring(0, 5) || "10:00",
      location: block.location || "",
      blockLabel: block.blockLabel || "",
      notes: block.notes || "",
      blockType: block.blockType || "service",
      isRecurring: block.isRecurring ?? true,
      rotationDay: block.rotationDay || "",
      recurrenceType: block.recurrenceType || "weekly",
      effectiveFrom: block.effectiveFrom || "",
      effectiveTo: block.effectiveTo || "",
    });
    setBlockDialogOpen(true);
  }

  async function handleSaveBlock() {
    if (!blockForm.staffId) { toast.error("Staff is required"); return; }
    setBlockSaving(true);
    try {
      if (editingBlock) {
        await updateScheduleBlock(editingBlock.id, {
          studentId: blockForm.studentId && blockForm.studentId !== "__none" ? Number(blockForm.studentId) : null,
          dayOfWeek: blockForm.dayOfWeek,
          startTime: blockForm.startTime,
          endTime: blockForm.endTime,
          location: blockForm.location || null,
          blockLabel: blockForm.blockLabel || null,
          notes: blockForm.notes || null,
          recurrenceType: (blockForm.recurrenceType as "weekly" | "biweekly") || "weekly",
          effectiveFrom: blockForm.effectiveFrom || null,
          effectiveTo: blockForm.effectiveTo || null,
        });
        toast.success("Schedule block updated");
      } else {
        await createScheduleBlock({
          staffId: Number(blockForm.staffId),
          studentId: blockForm.studentId && blockForm.studentId !== "__none" ? Number(blockForm.studentId) : null,
          serviceTypeId: blockForm.serviceTypeId && blockForm.serviceTypeId !== "__none" ? Number(blockForm.serviceTypeId) : null,
          dayOfWeek: blockForm.dayOfWeek,
          startTime: blockForm.startTime,
          endTime: blockForm.endTime,
          location: blockForm.location || null,
          blockType: blockForm.blockType,
          notes: blockForm.notes || null,
          isRecurring: blockForm.isRecurring,
          rotationDay: blockForm.rotationDay || null,
        });
        toast.success("Schedule block created");
      }
      setBlockDialogOpen(false);
      refetch();
    } catch { toast.error("Failed to save schedule block"); }
    setBlockSaving(false);
  }

  async function handleDeleteBlock() {
    if (!deletingBlock) return;
    setBlockSaving(true);
    try {
      await deleteScheduleBlock(deletingBlock.id);
      toast.success("Schedule block deleted");
      setDeletingBlock(null);
      refetch();
    } catch { toast.error("Failed to delete block"); }
    setBlockSaving(false);
  }

  const isAdmin = role === "admin";

  // ─── render ───────────────────────────────────────────────────────────────

  return (
    <div className={embedded ? "space-y-4" : "p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-6"}>

      {/* ── Top bar (standalone only) ── */}
      {!embedded && (
        <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Weekly Schedule</h1>
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              scheduleType === "standard"
                ? "bg-gray-100 text-gray-500 border-gray-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}>
              {scheduleType !== "standard" && <RotateCcw className="w-2.5 h-2.5" />}
              {SCHEDULE_TYPE_LABELS[scheduleType]}
            </span>
          </div>
        </div>
      )}

      {/* ── Planning bar: week nav + filters + actions ── */}
      <div className="flex flex-col gap-3">

        {/* Week navigation row */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setWeekOffset(w => w - 1)}
              className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 transition-colors"
              title="Previous week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white min-w-[220px] justify-center">
              <Calendar className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
              <span className="text-[13px] font-semibold text-gray-700 whitespace-nowrap">
                {fmtDate(monday)} – {fmtDate(addDays(monday, 4))}
              </span>
              {weekOffset === 0 && (
                <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">This week</span>
              )}
            </div>
            <button
              onClick={() => setWeekOffset(w => w + 1)}
              className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-500 transition-colors"
              title="Next week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            {weekOffset !== 0 && (
              <button
                onClick={() => setWeekOffset(0)}
                className="text-[11px] font-medium text-gray-500 hover:text-emerald-700 px-2 py-1 rounded border border-gray-200 bg-white transition-colors"
              >
                Today
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                onClick={() => setAutoSchedulerOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-lg border transition-colors ${
                  autoSchedulerOpen
                    ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                    : "text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" /> Suggest schedule
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => openAddBlock()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add Block
              </button>
            )}
            {isAdmin && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-gray-500 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
              >
                <Settings className="w-3.5 h-3.5" /> Settings
              </button>
            )}
            <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden">
              <button onClick={() => setViewMode("grid")} className={`px-3 py-1.5 text-[12px] font-medium transition-all ${viewMode === "grid" ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-50"}`}>Grid</button>
              <button onClick={() => setViewMode("list")} className={`px-3 py-1.5 text-[12px] font-medium transition-all ${viewMode === "list" ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-50"}`}>List</button>
            </div>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-xs font-medium text-gray-500">Filter:</span>
          </div>

          {/* Role filter */}
          <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setStaffFilter("all"); }}>
            <SelectTrigger className="w-[140px] h-8 text-xs bg-white">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {staffRoles.map(r => (
                <SelectItem key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Staff filter */}
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs bg-white">
              <SelectValue placeholder="All Staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {staffByRole.map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.firstName} {s.lastName}
                  {s.role && <span className="text-gray-400 ml-1">({s.role.toUpperCase()})</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Student filter */}
          <Select value={studentFilter} onValueChange={setStudentFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs bg-white">
              <SelectValue placeholder="All Students" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Students</SelectItem>
              {studentList.map((s: any) => {
                const name = `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || `Student ${s.id}`;
                const status = complianceMap.get(s.id);
                return (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {name}
                    {status && status.riskStatus !== "on_track" && status.riskStatus !== "completed" && (
                      <span className="ml-1 text-red-500">●</span>
                    )}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          {/* Service type filter */}
          <Select value={serviceTypeFilter} onValueChange={setServiceTypeFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs bg-white">
              <SelectValue placeholder="All Service Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              {serviceTypesList.map((st: any) => (
                <SelectItem key={st.id} value={String(st.id)}>{st.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasActiveFilters && (
            <button
              onClick={() => { setStaffFilter("all"); setStudentFilter("all"); setServiceTypeFilter("all"); setRoleFilter("all"); }}
              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-600 px-2 py-1 rounded border border-gray-200 bg-white transition-colors"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}

          <span className="text-xs text-gray-400 ml-1">
            {filteredBlocks.length} block{filteredBlocks.length !== 1 ? "s" : ""}
            {hasActiveFilters ? " (filtered)" : ""}
          </span>
        </div>

        {/* Schedule notes */}
        {scheduleType !== "standard" && schoolConfig?.scheduleNotes && (
          <div className="flex items-start gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200/60 rounded-xl text-[12px] text-emerald-800">
            <Calendar className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{schoolConfig.scheduleNotes}</span>
          </div>
        )}
      </div>

      {/* ── Auto-scheduler panel ── */}
      {autoSchedulerOpen && isAdmin && (
        <AutoSchedulerPanel
          weekOf={isoDate(monday)}
          onClose={() => setAutoSchedulerOpen(false)}
          onBlocksCreated={refetch}
        />
      )}

      {/* ── Compliance ribbon (shown when a student is selected) ── */}
      {studentFilter !== "all" && selectedStudentCompliance && selectedStudentCompliance.length > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-gray-400" />
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Compliance — {selectedStudentCompliance[0]?.studentName}</span>
            {studentGapDays.size > 0 && (
              <span className="ml-auto text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium">
                No sessions scheduled: {Array.from(studentGapDays).map(d => d.slice(0,3).toUpperCase()).join(", ")}
              </span>
            )}
          </div>
          <div className="flex divide-x divide-gray-100">
            {selectedStudentCompliance.map((row, i) => {
              const cfg = RISK_CONFIG[row.riskStatus] ?? RISK_CONFIG.on_track;
              const pct = Math.min(100, Math.round(row.percentComplete));
              return (
                <div key={i} className="flex-1 px-4 py-3 min-w-0">
                  <div className="text-[11px] text-gray-400 truncate">{row.serviceTypeName}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct >= 90 ? "bg-emerald-500" : pct >= 75 ? "bg-amber-400" : pct >= 50 ? "bg-orange-400" : "bg-red-500"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className={`text-[11px] font-semibold shrink-0 ${cfg.color}`}>{pct}%</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                    {row.remainingMinutes > 0 && (
                      <span className="text-[10px] text-gray-400">{row.remainingMinutes} min shortfall</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Grid / List ── */}
      {viewMode === "grid" ? (
        <ScheduleGrid
          scheduleType={scheduleType}
          columns={columns}
          grid={grid}
          serviceColorMap={serviceColorMap}
          todayColumn={todayColumn}
          weekDateMap={scheduleType === "standard" ? weekDateMap : {}}
          complianceMap={complianceMap}
          atRiskStudentIds={atRiskStudentIds}
          gapColumns={studentGapDays}
          isAdmin={isAdmin}
          isLoading={isLoading}
          isError={isError}
          refetch={refetch}
          onAddBlock={openAddBlock}
          onEditBlock={openEditBlock}
          onDeleteBlock={setDeletingBlock}
        />
      ) : (
        <ScheduleListView
          scheduleType={scheduleType}
          columns={columns}
          filtered={filteredBlocks}
          serviceColorMap={serviceColorMap}
          todayColumn={todayColumn}
          complianceMap={complianceMap}
          atRiskStudentIds={atRiskStudentIds}
          isAdmin={isAdmin}
          isLoading={isLoading}
          isError={isError}
          refetch={refetch}
          onAddBlock={() => setBlockDialogOpen(true)}
          onEditBlock={openEditBlock}
          onDeleteBlock={setDeletingBlock}
        />
      )}

      {isAdmin && schoolConfig && (
        <ScheduleSettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          school={schoolConfig}
          onSaved={updated => setSchoolConfig(updated)}
        />
      )}

      <BlockFormDialog
        open={blockDialogOpen}
        onClose={() => setBlockDialogOpen(false)}
        editingBlock={editingBlock}
        blockForm={blockForm}
        setBlockForm={setBlockForm}
        staffList={staffByRole}
        studentList={studentList}
        serviceTypesList={serviceTypesList}
        saving={blockSaving}
        onSave={handleSaveBlock}
      />

      <DeleteBlockDialog
        block={deletingBlock}
        saving={blockSaving}
        onClose={() => setDeletingBlock(null)}
        onConfirm={handleDeleteBlock}
      />
    </div>
  );
}
