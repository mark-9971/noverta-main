import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Trash2 } from "lucide-react";
import { HOURS, BLOCK_COLORS, ScheduleType, getColumnLabel } from "./constants";
import { RISK_CONFIG } from "@/lib/constants";

interface ComplianceRow {
  studentId: number;
  riskStatus: string;
  percentComplete: number;
}

interface Props {
  scheduleType: ScheduleType;
  columns: string[];
  grid: Record<string, Record<string, any[]>>;
  serviceColorMap: Record<number, string>;
  todayColumn: string | null;
  weekDateMap: Record<string, string>;
  complianceMap: Map<number, ComplianceRow>;
  atRiskStudentIds: Set<number>;
  gapColumns: Set<string>;
  isAdmin: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  onAddBlock: (col?: string, hour?: string) => void;
  onEditBlock: (block: any) => void;
  onDeleteBlock: (block: any) => void;
}

function fmtColDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

function ComplianceDot({ studentId, complianceMap }: { studentId: number; complianceMap: Map<number, ComplianceRow> }) {
  const row = complianceMap.get(studentId);
  if (!row || row.riskStatus === "on_track" || row.riskStatus === "completed") return null;
  const cfg = RISK_CONFIG[row.riskStatus];
  if (!cfg) return null;
  const dotColor =
    row.riskStatus === "out_of_compliance" ? "bg-red-500" :
    row.riskStatus === "at_risk" ? "bg-amber-500" :
    row.riskStatus === "slightly_behind" ? "bg-yellow-400" :
    "bg-gray-400";
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${dotColor} flex-shrink-0 mt-0.5`}
      title={`${cfg.label} — ${Math.round(row.percentComplete)}% delivered`}
    />
  );
}

export function ScheduleGrid({
  scheduleType, columns, grid, serviceColorMap, todayColumn, weekDateMap,
  complianceMap, atRiskStudentIds, gapColumns,
  isAdmin, isLoading, isError, refetch, onAddBlock, onEditBlock, onDeleteBlock,
}: Props) {
  const showDates = scheduleType === "standard" && Object.keys(weekDateMap).length > 0;

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-16 p-2.5 border-b border-r border-gray-100 bg-gray-50/50 text-[11px] text-gray-400 font-medium">Time</th>
              {columns.map(col => {
                const isToday = todayColumn === col;
                const isGap = gapColumns.has(col);
                const dateStr = showDates && weekDateMap[col] ? fmtColDate(weekDateMap[col]) : null;
                return (
                  <th
                    key={col}
                    className={`p-2.5 border-b border-gray-100 text-[12px] font-semibold text-center min-w-[150px] ${
                      isToday ? "text-emerald-700 bg-emerald-50/60" :
                      isGap ? "text-amber-700 bg-amber-50/40" :
                      "text-gray-600 bg-gray-50/50"
                    }`}
                  >
                    <div>{getColumnLabel(scheduleType, col)}</div>
                    {dateStr && (
                      <div className={`text-[10px] font-normal mt-0.5 ${isToday ? "text-emerald-500" : "text-gray-400"}`}>
                        {dateStr}
                      </div>
                    )}
                    {isToday && <div className="text-[9px] font-medium text-emerald-500 uppercase tracking-wide mt-0.5">today</div>}
                    {isGap && !isToday && <div className="text-[9px] font-medium text-amber-500 uppercase tracking-wide mt-0.5">no session</div>}
                  </th>
                );
              })}
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
                {columns.map(col => {
                  const cellBlocks = grid[col]?.[hour] ?? [];
                  const isToday = todayColumn === col;
                  const isGap = gapColumns.has(col);
                  return (
                    <td
                      key={col}
                      className={`p-1 align-top ${
                        isToday ? "bg-emerald-50/20" :
                        isGap && cellBlocks.length === 0 ? "bg-amber-50/30" :
                        ""
                      } ${isAdmin ? "cursor-pointer hover:bg-gray-50/60" : ""}`}
                      onClick={() => { if (isAdmin && cellBlocks.length === 0) onAddBlock(col, hour); }}
                    >
                      <div className="space-y-1">
                        {cellBlocks.map((block: any) => {
                          const isAtRisk = atRiskStudentIds.has(block.studentId);
                          const isMakeup = block.blockType === "makeup" ||
                            (typeof block.blockLabel === "string" && /makeup/i.test(block.blockLabel)) ||
                            (typeof block.notes === "string" && /makeup/i.test(block.notes));
                          return (
                            <div
                              key={block.id}
                              data-testid={isMakeup ? "schedule-block-makeup" : "schedule-block"}
                              className={`text-[10px] p-2 rounded-lg border ${serviceColorMap[block.serviceTypeId] ?? BLOCK_COLORS[0]} leading-tight ${isAdmin ? "cursor-pointer hover:ring-1 hover:ring-emerald-300" : ""} group/block relative ${isAtRisk ? "ring-1 ring-amber-300/60" : ""} ${isMakeup ? "ring-1 ring-blue-400/70 border-dashed" : ""}`}
                              onClick={(e) => { e.stopPropagation(); if (isAdmin) onEditBlock(block); }}
                            >
                              <div className="flex items-start gap-1">
                                <ComplianceDot studentId={block.studentId} complianceMap={complianceMap} />
                                <div className="min-w-0">
                                  <div className="font-semibold truncate flex items-center gap-1">
                                    {block.studentName ?? "Student"}
                                    {isMakeup && (
                                      <span className="text-[8px] uppercase tracking-wide font-bold px-1 py-px rounded bg-blue-100 text-blue-700 border border-blue-200">
                                        Makeup
                                      </span>
                                    )}
                                  </div>
                                  <div className="opacity-70 truncate">{block.serviceTypeName}</div>
                                  <div className="opacity-50 mt-0.5">{block.startTime}–{block.endTime}</div>
                                  {block.staffName && <div className="opacity-40 truncate">{block.staffName}</div>}
                                </div>
                              </div>
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
                          );
                        })}
                        {isGap && cellBlocks.length === 0 && (
                          <div className="h-8 rounded border border-dashed border-amber-300/60 bg-amber-50/40 flex items-center justify-center">
                            {isAdmin && (
                              <span className="text-[9px] text-amber-500 font-medium">+ add session</span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Compliance legend */}
      {complianceMap.size > 0 && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/50 flex items-center gap-4 flex-wrap">
          <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Compliance:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
            <span className="text-[10px] text-gray-500">Out of compliance</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
            <span className="text-[10px] text-gray-500">At risk</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
            <span className="text-[10px] text-gray-500">Slightly behind</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-3 rounded border border-dashed border-amber-300 bg-amber-50/40" />
            <span className="text-[10px] text-gray-500">No session scheduled</span>
          </div>
        </div>
      )}
    </Card>
  );
}
