import { useState } from "react";
import { useListScheduleBlocks, useListStaff } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useSchoolContext } from "@/lib/school-context";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri"
};
const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

const BLOCK_COLORS = [
  "bg-emerald-50 text-emerald-900 border-emerald-200/60",
  "bg-blue-50 text-blue-800 border-blue-200/60",
  "bg-emerald-50 text-emerald-800 border-emerald-200/60",
  "bg-amber-50 text-amber-800 border-amber-200/60",
  "bg-pink-50 text-pink-800 border-pink-200/60",
  "bg-purple-50 text-purple-800 border-purple-200/60",
  "bg-teal-50 text-teal-800 border-teal-200/60",
  "bg-orange-50 text-orange-800 border-orange-200/60",
];

export default function Schedule() {
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const { filterParams } = useSchoolContext();
  const { data: blocks, isLoading, isError, refetch } = useListScheduleBlocks({} as any);
  const { data: staff } = useListStaff({ ...filterParams } as any);

  const blockList = (blocks as any[]) ?? [];
  const staffList = (staff as any[]) ?? [];
  const filtered = staffFilter === "all" ? blockList : blockList.filter(b => String(b.staffId) === staffFilter);

  const serviceColorMap: Record<number, string> = {};
  let colorIdx = 0;

  const grid: Record<string, Record<string, any[]>> = {};
  for (const day of DAYS) {
    grid[day] = {};
    for (const hour of HOURS) grid[day][hour] = [];
  }

  for (const b of filtered) {
    if (!b.dayOfWeek || !DAYS.includes(b.dayOfWeek)) continue;
    if (!serviceColorMap[b.serviceTypeId]) {
      serviceColorMap[b.serviceTypeId] = BLOCK_COLORS[colorIdx % BLOCK_COLORS.length];
      colorIdx++;
    }
    const blockHour = b.startTime?.substring(0, 5);
    if (HOURS.includes(blockHour)) {
      grid[b.dayOfWeek][blockHour].push(b);
    }
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-4 md:space-y-6">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">Weekly Schedule</h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">{blockList.length} recurring schedule blocks</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 w-full sm:w-auto">
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="flex-1 sm:w-52 h-9 text-[13px] bg-white">
              <SelectValue placeholder="All staff" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Staff</SelectItem>
              {staffList.map(s => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.firstName} {s.lastName} ({s.role?.toUpperCase()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex bg-white border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode("grid")} className={`px-3 py-1.5 text-[12px] font-medium transition-all ${viewMode === "grid" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Grid</button>
            <button onClick={() => setViewMode("list")} className={`px-3 py-1.5 text-[12px] font-medium transition-all ${viewMode === "list" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50"}`}>List</button>
          </div>
        </div>
      </div>

      {viewMode === "grid" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-16 p-2.5 border-b border-r border-slate-100 bg-slate-50/50 text-[11px] text-slate-400 font-medium">Time</th>
                  {DAYS.map(day => (
                    <th key={day} className="p-2.5 border-b border-slate-100 bg-slate-50/50 text-[12px] font-semibold text-slate-600 text-center min-w-[150px]">
                      {DAY_LABELS[day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isError ? (
                  <tr><td colSpan={6}><ErrorBanner message="Failed to load schedule." onRetry={() => refetch()} /></td></tr>
                ) : isLoading ? (
                  HOURS.slice(0, 5).map(h => (
                    <tr key={h} className="border-b border-slate-50">
                      <td className="px-2.5 py-2 border-r border-slate-100 text-[11px] text-slate-400">{h}</td>
                      {DAYS.map(d => <td key={d} className="p-1.5"><Skeleton className="h-12 w-full rounded" /></td>)}
                    </tr>
                  ))
                ) : HOURS.map(hour => (
                  <tr key={hour} className="border-b border-slate-50 hover:bg-slate-50/30">
                    <td className="px-2.5 py-1.5 border-r border-slate-100 text-[11px] text-slate-400 font-mono align-top whitespace-nowrap">{hour}</td>
                    {DAYS.map(day => (
                      <td key={day} className="p-1 align-top">
                        <div className="space-y-1">
                          {grid[day][hour].map((block: any) => (
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
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Day</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Time</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Student</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Service</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Provider</th>
                  <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.sort((a, b) => {
                  const dayOrder = DAYS.indexOf(a.dayOfWeek) - DAYS.indexOf(b.dayOfWeek);
                  if (dayOrder !== 0) return dayOrder;
                  return (a.startTime ?? "").localeCompare(b.startTime ?? "");
                }).map(block => (
                  <tr key={block.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3 text-[13px] font-medium text-slate-700">{DAY_LABELS[block.dayOfWeek] ?? block.dayOfWeek}</td>
                    <td className="px-5 py-3 text-[13px] text-slate-500 font-mono">{block.startTime}–{block.endTime}</td>
                    <td className="px-5 py-3 text-[13px] font-medium text-slate-800">{block.studentName ?? "—"}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[11px] px-2 py-0.5 rounded-lg border font-medium ${serviceColorMap[block.serviceTypeId] ?? BLOCK_COLORS[0]}`}>
                        {block.serviceTypeName ?? "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-[13px] text-slate-500">{block.staffName ?? "—"}</td>
                    <td className="px-5 py-3 text-[13px] text-slate-400">{block.location ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
