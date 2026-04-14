import { useState, useEffect } from "react";
import { useListScheduleBlocks, useListStaff } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import { toast } from "sonner";
import { Settings, RotateCcw, Calendar } from "lucide-react";
import { apiGet, apiPatch } from "@/lib/api";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const WEEKDAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri",
};
const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

const BLOCK_COLORS = [
  "bg-emerald-50 text-emerald-900 border-emerald-200/60",
  "bg-gray-50 text-gray-800 border-gray-200/60",
  "bg-emerald-50/60 text-emerald-800 border-emerald-200/40",
  "bg-gray-100 text-gray-700 border-gray-200/60",
  "bg-emerald-50/40 text-emerald-700 border-emerald-200/40",
  "bg-gray-50 text-gray-700 border-gray-200/50",
  "bg-emerald-100/50 text-emerald-800 border-emerald-200/50",
  "bg-gray-100/60 text-gray-700 border-gray-200/40",
];

type ScheduleType = "standard" | "ab_day" | "rotating_4" | "rotating_6";

interface SchoolScheduleConfig {
  id: number;
  name: string;
  scheduleType: ScheduleType;
  rotationDays: number | null;
  rotationStartDate: string | null;
  scheduleNotes: string | null;
}

const SCHEDULE_TYPE_LABELS: Record<ScheduleType, string> = {
  standard: "Standard (Mon–Fri)",
  ab_day: "A/B Day",
  rotating_4: "4-Day Rotating",
  rotating_6: "6-Day Rotating",
};

const SCHEDULE_TYPE_DESCRIPTIONS: Record<ScheduleType, string> = {
  standard: "Fixed Monday through Friday schedule. Sessions repeat on the same days each week.",
  ab_day: "Sessions alternate between Day A and Day B. Weeks alternate A-week and B-week.",
  rotating_4: "4-day rotating cycle (Day 1–4). Sessions repeat every 4 school days regardless of calendar day.",
  rotating_6: "6-day rotating cycle (Day 1–6). Common in middle and high schools.",
};

function getRotationColumns(scheduleType: ScheduleType): string[] {
  if (scheduleType === "ab_day") return ["A", "B"];
  if (scheduleType === "rotating_4") return ["1", "2", "3", "4"];
  if (scheduleType === "rotating_6") return ["1", "2", "3", "4", "5", "6"];
  return WEEKDAYS;
}

function getColumnLabel(scheduleType: ScheduleType, col: string): string {
  if (scheduleType === "standard") return WEEKDAY_LABELS[col] ?? col;
  if (scheduleType === "ab_day") return `Day ${col}`;
  return `Day ${col}`;
}

/** Count school days between two ISO dates (inclusive), skipping weekends. */
function countSchoolDaysBetween(startDate: string, endDate: string): number {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  if (start > end) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

/** Given a schedule config, return the current rotation day label (e.g. "A", "B", "1"–"4"). */
function getCurrentRotationDay(config: SchoolScheduleConfig): string | null {
  if (config.scheduleType === "standard" || !config.rotationStartDate || !config.rotationDays) return null;
  const today = new Date().toISOString().split("T")[0];
  // If today is a weekend, show nothing
  const dow = new Date(today + "T00:00:00").getDay();
  if (dow === 0 || dow === 6) return null;

  const daysSinceStart = countSchoolDaysBetween(config.rotationStartDate, today) - 1;
  if (daysSinceStart < 0) return null;

  const slotIndex = daysSinceStart % config.rotationDays;
  if (config.scheduleType === "ab_day") {
    return slotIndex === 0 ? "A" : "B";
  }
  return String(slotIndex + 1);
}

function ScheduleSettingsDialog({
  open,
  onClose,
  school,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  school: SchoolScheduleConfig;
  onSaved: (updated: SchoolScheduleConfig) => void;
}) {
  const [scheduleType, setScheduleType] = useState<ScheduleType>(school.scheduleType);
  const [rotationStartDate, setRotationStartDate] = useState(school.rotationStartDate ?? "");
  const [scheduleNotes, setScheduleNotes] = useState(school.scheduleNotes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setScheduleType(school.scheduleType);
    setRotationStartDate(school.rotationStartDate ?? "");
    setScheduleNotes(school.scheduleNotes ?? "");
  }, [school, open]);

  async function handleSave() {
    setSaving(true);
    try {
      const updated = await apiPatch(`/api/schools/${school.id}/schedule-settings`, {
          scheduleType,
          rotationStartDate: rotationStartDate || null,
          scheduleNotes: scheduleNotes || null,
        });
      onSaved(updated);
      toast.success("Schedule settings saved");
      onClose();
    } catch {
      toast.error("Failed to save schedule settings");
    } finally {
      setSaving(false);
    }
  }

  const needsStartDate = scheduleType !== "standard";

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[15px] font-semibold text-gray-800">
            Schedule Settings — {school.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="space-y-2">
            <Label className="text-[12px] font-medium text-gray-600">Schedule Type</Label>
            <Select value={scheduleType} onValueChange={v => setScheduleType(v as ScheduleType)}>
              <SelectTrigger className="h-9 text-[13px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["standard", "ab_day", "rotating_4", "rotating_6"] as ScheduleType[]).map(t => (
                  <SelectItem key={t} value={t} className="text-[13px]">
                    {SCHEDULE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              {SCHEDULE_TYPE_DESCRIPTIONS[scheduleType]}
            </p>
          </div>

          {needsStartDate && (
            <div className="space-y-2">
              <Label className="text-[12px] font-medium text-gray-600">
                Rotation Start Date
                <span className="text-gray-400 font-normal ml-1">— the date of Day A / Day 1</span>
              </Label>
              <input
                type="date"
                value={rotationStartDate}
                onChange={e => setRotationStartDate(e.target.value)}
                className="w-full h-9 px-3 text-[13px] border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <p className="text-[11px] text-gray-400">
                The system uses this date to calculate which rotation day "today" falls on.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-[12px] font-medium text-gray-600">
              Notes
              <span className="text-gray-400 font-normal ml-1">(optional)</span>
            </Label>
            <Textarea
              value={scheduleNotes}
              onChange={e => setScheduleNotes(e.target.value)}
              placeholder="e.g. Cycle resets after school vacation weeks. Contact main office for overrides."
              className="text-[13px] min-h-[72px] resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? "Saving…" : "Save Settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Schedule() {
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [schoolConfig, setSchoolConfig] = useState<SchoolScheduleConfig | null>(null);

  const { filterParams, selectedSchoolId } = useSchoolContext();
  const { role } = useRole();
  const { data: blocks, isLoading, isError, refetch } = useListScheduleBlocks({ ...filterParams } as any);
  const { data: staff } = useListStaff({ ...filterParams } as any);

  // Load school schedule configuration
  useEffect(() => {
    apiGet(`/api/schools`).then((schools: SchoolScheduleConfig[]) => {
        if (!schools?.length) return;
        // Use the selected school if one is chosen; otherwise pick the first
        const target = selectedSchoolId
          ? schools.find(s => s.id === selectedSchoolId)
          : schools[0];
        if (target) setSchoolConfig(target);
      })
      .catch(() => {});
  }, [selectedSchoolId]);

  const blockList = (blocks as any[]) ?? [];
  const staffList = (staff as any[]) ?? [];
  const filtered = staffFilter === "all" ? blockList : blockList.filter(b => String(b.staffId) === staffFilter);

  const scheduleType: ScheduleType = schoolConfig?.scheduleType ?? "standard";
  const columns = getRotationColumns(scheduleType);
  const todayRotationDay = schoolConfig ? getCurrentRotationDay(schoolConfig) : null;

  // Build color map keyed by service type
  const serviceColorMap: Record<number, string> = {};
  let colorIdx = 0;

  // Build grid: column (day/rotation) → hour → blocks
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

    // Determine which column this block belongs to
    let col: string;
    if (scheduleType === "standard") {
      col = b.dayOfWeek;
    } else {
      // Use rotationDay if set; fall back to mapping dayOfWeek for legacy blocks
      col = b.rotationDay ?? fallbackRotationCol(b.dayOfWeek, scheduleType);
    }

    if (!columns.includes(col)) continue;
    const blockHour = b.startTime?.substring(0, 5);
    if (HOURS.includes(blockHour)) {
      grid[col][blockHour].push(b);
    }
  }

  function fallbackRotationCol(dayOfWeek: string, type: ScheduleType): string {
    const idx = WEEKDAYS.indexOf(dayOfWeek);
    if (type === "ab_day") return idx % 2 === 0 ? "A" : "B";
    if (type === "rotating_4") return String((idx % 4) + 1);
    if (type === "rotating_6") return String((idx % 6) + 1);
    return dayOfWeek;
  }

  const isAdmin = role === "admin";

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Weekly Schedule</h1>
            {/* Schedule type badge */}
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
              scheduleType === "standard"
                ? "bg-gray-100 text-gray-500 border-gray-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}>
              {scheduleType !== "standard" && <RotateCcw className="w-2.5 h-2.5" />}
              {SCHEDULE_TYPE_LABELS[scheduleType]}
            </span>
            {/* Today's rotation day */}
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
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-gray-500 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Schedule Settings
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

      {/* Schedule notes banner for non-standard schedules */}
      {scheduleType !== "standard" && schoolConfig?.scheduleNotes && (
        <div className="flex items-start gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200/60 rounded-xl text-[12px] text-emerald-800">
          <Calendar className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>{schoolConfig.scheduleNotes}</span>
        </div>
      )}

      {viewMode === "grid" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-16 p-2.5 border-b border-r border-gray-100 bg-gray-50/50 text-[11px] text-gray-400 font-medium">Time</th>
                  {columns.map(col => (
                    <th
                      key={col}
                      className={`p-2.5 border-b border-gray-100 bg-gray-50/50 text-[12px] font-semibold text-center min-w-[150px] ${
                        todayRotationDay === col
                          ? "text-emerald-700 bg-emerald-50/40"
                          : "text-gray-600"
                      }`}
                    >
                      {getColumnLabel(scheduleType, col)}
                      {todayRotationDay === col && (
                        <span className="ml-1.5 text-[9px] font-normal text-emerald-500 uppercase tracking-wide">today</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isError ? (
                  <tr><td colSpan={columns.length + 1}><ErrorBanner message="Failed to load schedule." onRetry={() => refetch()} /></td></tr>
                ) : isLoading ? (
                  HOURS.slice(0, 5).map(h => (
                    <tr key={h} className="border-b border-gray-50">
                      <td className="px-2.5 py-2 border-r border-gray-100 text-[11px] text-gray-400">{h}</td>
                      {columns.map(col => <td key={col} className="p-1.5"><Skeleton className="h-12 w-full rounded" /></td>)}
                    </tr>
                  ))
                ) : HOURS.map(hour => (
                  <tr key={hour} className="border-b border-gray-50 hover:bg-gray-50/30">
                    <td className="px-2.5 py-1.5 border-r border-gray-100 text-[11px] text-gray-400 font-mono align-top whitespace-nowrap">{hour}</td>
                    {columns.map(col => (
                      <td
                        key={col}
                        className={`p-1 align-top ${todayRotationDay === col ? "bg-emerald-50/20" : ""}`}
                      >
                        <div className="space-y-1">
                          {(grid[col]?.[hour] ?? []).map((block: any) => (
                            <div key={block.id} className={`text-[10px] p-2 rounded-lg border ${serviceColorMap[block.serviceTypeId] ?? BLOCK_COLORS[0]} leading-tight`}>
                              <div className="font-semibold truncate">{block.studentName ?? "Student"}</div>
                              <div className="opacity-70 truncate">{block.serviceTypeName}</div>
                              <div className="opacity-50 mt-0.5">{block.startTime}–{block.endTime}</div>
                            </div>
                          ))}
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    {scheduleType === "standard" ? "Day" : "Rotation Day"}
                  </th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Time</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Student</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Provider</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.sort((a: any, b: any) => {
                  const colA = scheduleType === "standard" ? WEEKDAYS.indexOf(a.dayOfWeek) : columns.indexOf(a.rotationDay ?? "");
                  const colB = scheduleType === "standard" ? WEEKDAYS.indexOf(b.dayOfWeek) : columns.indexOf(b.rotationDay ?? "");
                  if (colA !== colB) return colA - colB;
                  return (a.startTime ?? "").localeCompare(b.startTime ?? "");
                }).map((block: any) => {
                  const colKey = scheduleType === "standard" ? block.dayOfWeek : (block.rotationDay ?? block.dayOfWeek);
                  const colLabel = scheduleType === "standard"
                    ? (WEEKDAY_LABELS[block.dayOfWeek] ?? block.dayOfWeek)
                    : (block.rotationDay ? `Day ${block.rotationDay}` : WEEKDAY_LABELS[block.dayOfWeek] ?? block.dayOfWeek);
                  const isToday = todayRotationDay && block.rotationDay === todayRotationDay;

                  return (
                    <tr key={block.id} className={`hover:bg-gray-50/50 transition-colors ${isToday ? "bg-emerald-50/30" : ""}`}>
                      <td className="px-5 py-3">
                        <span className={`text-[13px] font-medium ${isToday ? "text-emerald-700" : "text-gray-700"}`}>
                          {colLabel}
                        </span>
                        {isToday && <span className="ml-1.5 text-[10px] text-emerald-500">today</span>}
                      </td>
                      <td className="px-5 py-3 text-[13px] text-gray-500 font-mono">{block.startTime}–{block.endTime}</td>
                      <td className="px-5 py-3 text-[13px] font-medium text-gray-800">{block.studentName ?? "—"}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[11px] px-2 py-0.5 rounded-lg border font-medium ${serviceColorMap[block.serviceTypeId] ?? BLOCK_COLORS[0]}`}>
                          {block.serviceTypeName ?? "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-[13px] text-gray-500">{block.staffName ?? "—"}</td>
                      <td className="px-5 py-3 text-[13px] text-gray-400">{block.location ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Settings dialog — admin only */}
      {isAdmin && schoolConfig && (
        <ScheduleSettingsDialog
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          school={schoolConfig}
          onSaved={updated => setSchoolConfig(updated)}
        />
      )}
    </div>
  );
}
