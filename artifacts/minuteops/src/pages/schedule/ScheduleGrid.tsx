import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Trash2 } from "lucide-react";
import { HOURS, BLOCK_COLORS, ScheduleType, getColumnLabel } from "./constants";

interface Props {
  scheduleType: ScheduleType;
  columns: string[];
  grid: Record<string, Record<string, any[]>>;
  serviceColorMap: Record<number, string>;
  todayRotationDay: string | null;
  isAdmin: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  onAddBlock: (col?: string, hour?: string) => void;
  onEditBlock: (block: any) => void;
  onDeleteBlock: (block: any) => void;
}

export function ScheduleGrid({
  scheduleType, columns, grid, serviceColorMap, todayRotationDay,
  isAdmin, isLoading, isError, refetch, onAddBlock, onEditBlock, onDeleteBlock,
}: Props) {
  return (
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
                    className={`p-1 align-top ${todayRotationDay === col ? "bg-emerald-50/20" : ""} ${isAdmin ? "cursor-pointer hover:bg-gray-50/60" : ""}`}
                    onClick={() => { if (isAdmin && (grid[col]?.[hour] ?? []).length === 0) onAddBlock(col, hour); }}
                  >
                    <div className="space-y-1">
                      {(grid[col]?.[hour] ?? []).map((block: any) => (
                        <div key={block.id} className={`text-[10px] p-2 rounded-lg border ${serviceColorMap[block.serviceTypeId] ?? BLOCK_COLORS[0]} leading-tight ${isAdmin ? "cursor-pointer hover:ring-1 hover:ring-emerald-300" : ""} group/block relative`} onClick={(e) => { e.stopPropagation(); if (isAdmin) onEditBlock(block); }}>
                          <div className="font-semibold truncate">{block.studentName ?? "Student"}</div>
                          <div className="opacity-70 truncate">{block.serviceTypeName}</div>
                          <div className="opacity-50 mt-0.5">{block.startTime}–{block.endTime}</div>
                          {isAdmin && (
                            <button
                              onClick={(e) => { e.stopPropagation(); onDeleteBlock(block); }}
                              className="absolute top-1 right-1 p-0.5 rounded opacity-0 group-hover/block:opacity-100 hover:bg-red-100 transition-opacity"
                              title="Delete block"
                            >
                              <Trash2 className="w-2.5 h-2.5 text-red-400" />
                            </button>
                          )}
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
  );
}
