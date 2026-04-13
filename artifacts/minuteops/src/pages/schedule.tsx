import { useState } from "react";
import { useListScheduleBlocks, useListStaff } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar, Clock, AlertTriangle } from "lucide-react";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri"
};

const HOURS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];

const SERVICE_COLORS = [
  "bg-indigo-100 text-indigo-800 border-indigo-200",
  "bg-blue-100 text-blue-800 border-blue-200",
  "bg-green-100 text-green-800 border-green-200",
  "bg-amber-100 text-amber-800 border-amber-200",
  "bg-pink-100 text-pink-800 border-pink-200",
  "bg-purple-100 text-purple-800 border-purple-200",
  "bg-teal-100 text-teal-800 border-teal-200",
  "bg-orange-100 text-orange-800 border-orange-200",
];

function timeToMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export default function Schedule() {
  const [staffFilter, setStaffFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const { data: blocks, isLoading } = useListScheduleBlocks({} as any);
  const { data: staff } = useListStaff({} as any);

  const blockList = (blocks as any[]) ?? [];
  const staffList = (staff as any[]) ?? [];

  const filtered = staffFilter === "all" ? blockList : blockList.filter(b => String(b.staffId) === staffFilter);

  // Build color map by service type
  const serviceColorMap: Record<number, string> = {};
  let colorIdx = 0;

  // Group blocks by day and hour for grid view
  const grid: Record<string, Record<string, any[]>> = {};
  for (const day of DAYS) {
    grid[day] = {};
    for (const hour of HOURS) grid[day][hour] = [];
  }

  for (const b of filtered) {
    if (!b.dayOfWeek || !DAYS.includes(b.dayOfWeek)) continue;
    if (!serviceColorMap[b.serviceTypeId]) {
      serviceColorMap[b.serviceTypeId] = SERVICE_COLORS[colorIdx % SERVICE_COLORS.length];
      colorIdx++;
    }

    const blockHour = b.startTime?.substring(0, 5);
    if (HOURS.includes(blockHour)) {
      grid[b.dayOfWeek][blockHour].push(b);
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Weekly Schedule</h1>
          <p className="text-sm text-slate-500 mt-0.5">{blockList.length} recurring schedule blocks</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="w-52 h-9 text-sm">
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
          <div className="flex border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-1.5 text-xs font-medium ${viewMode === "grid" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >Grid</button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 text-xs font-medium ${viewMode === "list" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >List</button>
          </div>
        </div>
      </div>

      {viewMode === "grid" ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="w-16 p-2 border-b border-r bg-slate-50 text-xs text-slate-400">Time</th>
                  {DAYS.map(day => (
                    <th key={day} className="p-2 border-b bg-slate-50 text-xs font-semibold text-slate-700 text-center min-w-[140px]">
                      {DAY_LABELS[day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.map(hour => (
                  <tr key={hour} className="border-b hover:bg-slate-50/50">
                    <td className="px-2 py-1 border-r text-xs text-slate-400 font-mono whitespace-nowrap align-top">{hour}</td>
                    {DAYS.map(day => (
                      <td key={day} className="p-1 align-top min-h-[52px]">
                        <div className="space-y-1">
                          {grid[day][hour].map((block: any) => (
                            <div
                              key={block.id}
                              className={`text-[10px] p-1.5 rounded border ${serviceColorMap[block.serviceTypeId] ?? SERVICE_COLORS[0]} leading-tight`}
                            >
                              <div className="font-semibold truncate">{block.studentName ?? "Student"}</div>
                              <div className="opacity-70 truncate">{block.serviceTypeName}</div>
                              <div className="opacity-60">{block.startTime}–{block.endTime}</div>
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
                <tr className="border-b bg-slate-50">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Day</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Time</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Service</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Provider</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? [...Array(10)].map((_, i) => (
                  <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                )) : filtered.sort((a, b) => {
                  const dayOrder = DAYS.indexOf(a.dayOfWeek) - DAYS.indexOf(b.dayOfWeek);
                  if (dayOrder !== 0) return dayOrder;
                  return (a.startTime ?? "").localeCompare(b.startTime ?? "");
                }).map(block => (
                  <tr key={block.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-medium text-slate-700">{DAY_LABELS[block.dayOfWeek] ?? block.dayOfWeek}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600 font-mono">{block.startTime}–{block.endTime}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{block.studentName ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded border ${serviceColorMap[block.serviceTypeId] ?? SERVICE_COLORS[0]}`}>
                        {block.serviceTypeName ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{block.staffName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-400 text-xs">{block.location ?? "—"}</td>
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
