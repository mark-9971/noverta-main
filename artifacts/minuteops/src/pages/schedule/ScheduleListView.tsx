import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { CalendarDays, Trash2 } from "lucide-react";
import {
  WEEKDAYS, WEEKDAY_LABELS, BLOCK_COLORS, ScheduleType,
} from "./constants";

interface Props {
  scheduleType: ScheduleType;
  columns: string[];
  filtered: any[];
  serviceColorMap: Record<number, string>;
  todayRotationDay: string | null;
  isAdmin: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  onAddBlock: () => void;
  onEditBlock: (block: any) => void;
  onDeleteBlock: (block: any) => void;
}

export function ScheduleListView({
  scheduleType, columns, filtered, serviceColorMap, todayRotationDay,
  isAdmin, isLoading, isError, refetch, onAddBlock, onEditBlock, onDeleteBlock,
}: Props) {
  return (
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
            {isError ? (
              <tr><td colSpan={6} className="py-0"><ErrorBanner message="Failed to load schedule." onRetry={() => refetch()} /></td></tr>
            ) : isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-20 rounded" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-0">
                  <EmptyState
                    icon={CalendarDays}
                    title="No schedule blocks"
                    description={isAdmin ? "Add recurring blocks to build this school's weekly service schedule." : "No blocks match the current filter."}
                    compact
                    action={isAdmin ? { label: "Add Block", onClick: onAddBlock } : undefined}
                  />
                </td>
              </tr>
            ) : filtered.slice().sort((a: any, b: any) => {
              const colA = scheduleType === "standard" ? WEEKDAYS.indexOf(a.dayOfWeek) : columns.indexOf(a.rotationDay ?? "");
              const colB = scheduleType === "standard" ? WEEKDAYS.indexOf(b.dayOfWeek) : columns.indexOf(b.rotationDay ?? "");
              if (colA !== colB) return colA - colB;
              return (a.startTime ?? "").localeCompare(b.startTime ?? "");
            }).map((block: any) => {
              const colLabel = scheduleType === "standard"
                ? (WEEKDAY_LABELS[block.dayOfWeek] ?? block.dayOfWeek)
                : (block.rotationDay ? `Day ${block.rotationDay}` : WEEKDAY_LABELS[block.dayOfWeek] ?? block.dayOfWeek);
              const isToday = todayRotationDay && block.rotationDay === todayRotationDay;

              return (
                <tr key={block.id} className={`hover:bg-gray-50/50 transition-colors ${isToday ? "bg-emerald-50/30" : ""} ${isAdmin ? "cursor-pointer" : ""} group`} onClick={() => { if (isAdmin) onEditBlock(block); }}>
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
                  <td className="px-5 py-3 text-[13px] text-gray-400 flex items-center gap-2">
                    {block.location ?? "—"}
                    {isAdmin && (
                      <button onClick={(e) => { e.stopPropagation(); onDeleteBlock(block); }} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-opacity ml-auto" title="Delete">
                        <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
