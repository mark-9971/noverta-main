import { useState, useEffect } from "react";
import { useListScheduleBlocks, useListStaff, useListSpedStudents, listSchools, listServiceTypes, createScheduleBlock, updateScheduleBlock, deleteScheduleBlock } from "@workspace/api-client-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import { toast } from "sonner";
import { Settings, RotateCcw, Calendar, Plus } from "lucide-react";
import {
  HOURS, BLOCK_COLORS, ScheduleType, SchoolScheduleConfig,
  SCHEDULE_TYPE_LABELS, getRotationColumns, getCurrentRotationDay, fallbackRotationCol,
} from "./constants";
import { ScheduleSettingsDialog } from "./ScheduleSettingsDialog";
import { ScheduleGrid } from "./ScheduleGrid";
import { ScheduleListView } from "./ScheduleListView";
import { BlockFormDialog, BlockForm } from "./BlockFormDialog";
import { DeleteBlockDialog } from "./DeleteBlockDialog";

const DEFAULT_FORM: BlockForm = {
  staffId: "", studentId: "", serviceTypeId: "", dayOfWeek: "monday",
  startTime: "09:00", endTime: "10:00", location: "", blockLabel: "", notes: "",
  blockType: "service", isRecurring: true, rotationDay: "",
  recurrenceType: "weekly", effectiveFrom: "", effectiveTo: "",
};

export default function Schedule() {
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [schoolConfig, setSchoolConfig] = useState<SchoolScheduleConfig | null>(null);

  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<any>(null);
  const [deletingBlock, setDeletingBlock] = useState<any>(null);
  const [blockSaving, setBlockSaving] = useState(false);
  const [serviceTypesList, setServiceTypesList] = useState<any[]>([]);
  const [blockForm, setBlockForm] = useState<BlockForm>(DEFAULT_FORM);

  const { filterParams, selectedSchoolId } = useSchoolContext();
  const { role } = useRole();
  const { data: blocks, isLoading, isError, refetch } = useListScheduleBlocks({ ...filterParams } as any);
  const { data: staff } = useListStaff({ ...filterParams } as any);
  const { data: spedStudentsRaw } = useListSpedStudents(filterParams as any);
  const studentList = (Array.isArray(spedStudentsRaw) ? spedStudentsRaw : []) as any[];

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

  const blockList = (blocks as any[]) ?? [];
  const staffList = (staff as any[]) ?? [];
  const filtered = staffFilter === "all" ? blockList : blockList.filter(b => String(b.staffId) === staffFilter);

  const scheduleType: ScheduleType = schoolConfig?.scheduleType ?? "standard";
  const columns = getRotationColumns(scheduleType);
  const todayRotationDay = schoolConfig ? getCurrentRotationDay(schoolConfig) : null;

  const serviceColorMap: Record<number, string> = {};
  let colorIdx = 0;
  const grid: Record<string, Record<string, any[]>> = {};
  for (const col of columns) {
    grid[col] = {};
    for (const hour of HOURS) grid[col][hour] = [];
  }

  for (const b of filtered) {
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

  function openAddBlock(col?: string, hour?: string) {
    setEditingBlock(null);
    const isStandard = scheduleType === "standard";
    setBlockForm({
      ...DEFAULT_FORM,
      staffId: staffFilter !== "all" ? staffFilter : "",
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

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-6">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
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
            {todayRotationDay && (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                <Calendar className="w-2.5 h-2.5" />
                Today: Day {todayRotationDay}
              </span>
            )}
          </div>
          <p className="text-xs md:text-sm text-gray-400 mt-0.5">{blockList.length} recurring schedule blocks</p>
        </div>

        <div className="flex items-center gap-2 md:gap-3 w-full sm:w-auto">
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
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="flex-1 sm:w-52 h-9 text-[13px] bg-white">
              <SelectValue placeholder="All staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {staffList.map((s: any) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.firstName} {s.lastName} ({s.role?.toUpperCase()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode("grid")} className={`px-3 py-1.5 text-[12px] font-medium transition-all ${viewMode === "grid" ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-50"}`}>Grid</button>
            <button onClick={() => setViewMode("list")} className={`px-3 py-1.5 text-[12px] font-medium transition-all ${viewMode === "list" ? "bg-gray-800 text-white" : "text-gray-500 hover:bg-gray-50"}`}>List</button>
          </div>
        </div>
      </div>

      {scheduleType !== "standard" && schoolConfig?.scheduleNotes && (
        <div className="flex items-start gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200/60 rounded-xl text-[12px] text-emerald-800">
          <Calendar className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{schoolConfig.scheduleNotes}</span>
        </div>
      )}

      {viewMode === "grid" ? (
        <ScheduleGrid
          scheduleType={scheduleType}
          columns={columns}
          grid={grid}
          serviceColorMap={serviceColorMap}
          todayRotationDay={todayRotationDay}
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
          filtered={filtered}
          serviceColorMap={serviceColorMap}
          todayRotationDay={todayRotationDay}
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
        staffList={staffList}
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
