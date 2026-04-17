import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniProgressRing } from "@/components/ui/progress-ring";
import { ChevronUp, Maximize2, Plus, Pencil, Trash2, UserPlus, UserMinus } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { InteractiveChart } from "@/components/ui/interactive-chart";
import { RISK_CONFIG } from "@/lib/constants";

interface StudentServiceSectionProps {
  chartData: any[];
  minutesExpanded: boolean;
  setMinutesExpanded: (v: boolean) => void;
  minutesTrend: any[];
  minutesPhaseLines: { id: string; date: string; label: string; color?: string }[];
  setMinutesPhaseLines: (lines: { id: string; date: string; label: string; color?: string }[]) => void;
  progressList: any[];
  isEditable: boolean;
  student: any;
  openAddSvc: () => void;
  openEditSvc: (req: any) => void;
  setDeletingSvc: (req: any) => void;
  openAssignDialog: () => void;
  handleRemoveAssignment: (id: number) => void;
}

export default function StudentServiceSection({
  chartData,
  minutesExpanded,
  setMinutesExpanded,
  minutesTrend,
  minutesPhaseLines,
  setMinutesPhaseLines,
  progressList,
  isEditable,
  student,
  openAddSvc,
  openEditSvc,
  setDeletingSvc,
  openAssignDialog,
  handleRemoveAssignment,
}: StudentServiceSectionProps) {
  const s = student;
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7">
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600">Minutes by Service</CardTitle>
              <button
                onClick={() => setMinutesExpanded(!minutesExpanded)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
                title={minutesExpanded ? "Collapse" : "Expand chart"}
              >
                {minutesExpanded ? <ChevronUp className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={minutesExpanded ? Math.max(300, chartData.length * 64) : Math.max(200, chartData.length * 48)}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
                    formatter={(val: any, name: string) => [val + " min", name === "delivered" ? "Delivered" : "Required"]}
                  />
                  <Bar dataKey="required" fill="#e5e7eb" radius={[0, 4, 4, 0]} barSize={minutesExpanded ? 24 : 18} name="Required" />
                  <Bar dataKey="delivered" radius={[0, 4, 4, 0]} barSize={minutesExpanded ? 24 : 18} name="Delivered">
                    {chartData.map((entry: any, idx: number) => (
                      <Cell key={idx} fill={RISK_CONFIG[entry.riskStatus]?.ringColor ?? "#059669"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="w-full h-48" />
            )}
            {minutesExpanded && chartData.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-gray-100 pt-3">
                {chartData.map((entry: any, idx: number) => {
                  const rCfg = RISK_CONFIG[entry.riskStatus] ?? RISK_CONFIG.on_track;
                  return (
                    <div key={idx} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded-lg">
                      <span className="font-medium text-gray-700">{entry.name}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-500">{entry.delivered} / {entry.required} min</span>
                        <span className="font-bold text-gray-700">{entry.pct}%</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${rCfg.bg} ${rCfg.color}`}>{rCfg.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {minutesExpanded && minutesTrend.length > 0 && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">Minutes Delivered Over Time</p>
                <InteractiveChart
                  data={minutesTrend}
                  color="#059669"
                  gradientId="grad-minutes-trend"
                  title="Session Minutes"
                  yLabel="Minutes"
                  valueFormatter={(v) => `${v} min`}
                  phaseLines={minutesPhaseLines}
                  onPhaseLinesChange={setMinutesPhaseLines}
                  initialExpanded
                  hideCollapse
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600">Service Requirements</CardTitle>
              {isEditable && (
                <button onClick={openAddSvc} className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {progressList.length > 0 ? progressList.map((p: any, idx: number) => {
              const pct = p.requiredMinutes > 0 ? Math.round((p.deliveredMinutes / p.requiredMinutes) * 100) : 0;
              const rCfg = RISK_CONFIG[p.riskStatus] ?? RISK_CONFIG.on_track;
              const svcReq = s?.serviceRequirements?.find((r: any) => r.id === p.serviceRequirementId);
              return (
                <div key={p.serviceRequirementId ?? idx} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50/50 group">
                  <MiniProgressRing value={pct} size={36} strokeWidth={3.5} color={rCfg.ringColor} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-700 truncate">{p.serviceTypeName}</p>
                    <p className="text-[11px] text-gray-400">
                      {p.deliveredMinutes} / {p.requiredMinutes} min · {p.minutesPerWeek} min/wk
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-gray-700">{pct}%</p>
                    <p className={`text-[10px] font-medium ${rCfg.color}`}>{rCfg.label}</p>
                  </div>
                  {isEditable && svcReq && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => openEditSvc(svcReq)} className="p-1 hover:bg-gray-200 rounded" title="Edit">
                        <Pencil className="w-3 h-3 text-gray-400" />
                      </button>
                      <button onClick={() => setDeletingSvc(svcReq)} className="p-1 hover:bg-red-100 rounded" title="Delete">
                        <Trash2 className="w-3 h-3 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  )}
                </div>
              );
            }) : (
              <div className="text-center py-6">
                <p className="text-sm text-gray-400">No service requirements</p>
                {isEditable && (
                  <button onClick={openAddSvc} className="mt-2 text-xs font-medium text-emerald-700 hover:text-emerald-800">
                    + Add first service requirement
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {s?.assignedStaff && (
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-600">Assigned Staff</CardTitle>
              {isEditable && (
                <button onClick={openAssignDialog} className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors">
                  <UserPlus className="w-3.5 h-3.5" /> Assign
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {(s.assignedStaff as any[]).length > 0 ? (
              <div className="space-y-2">
                {(s.assignedStaff as any[]).map((a: any) => (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50/50 group">
                    <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center text-[11px] font-bold text-gray-600 flex-shrink-0">
                      {a.staffName?.split(" ").map((n: string) => n[0]).join("") || "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-700">{a.staffName || `Staff #${a.staffId}`}</p>
                      <p className="text-[11px] text-gray-400">
                        {a.assignmentType?.replace(/_/g, " ")}
                        {a.staffRole ? ` · ${a.staffRole}` : ""}
                        {a.startDate ? ` · from ${a.startDate}` : ""}
                      </p>
                    </div>
                    {isEditable && (
                      <button onClick={() => handleRemoveAssignment(a.id)} className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-all" title="Remove assignment">
                        <UserMinus className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-400">No staff assigned</p>
                {isEditable && (
                  <button onClick={openAssignDialog} className="mt-2 text-xs font-medium text-emerald-700 hover:text-emerald-800">
                    + Assign first provider
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
