import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniProgressRing } from "@/components/ui/progress-ring";
import { Badge } from "@/components/ui/badge";
import { ChevronUp, Maximize2, Plus, Pencil, Trash2, UserPlus, UserMinus, CalendarPlus, ChevronDown, ChevronRight, History, X } from "lucide-react";
import { Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { InteractiveChart } from "@/components/ui/interactive-chart";
import { RISK_CONFIG } from "@/lib/constants";
import { authFetch } from "@/lib/auth-fetch";

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

interface ServiceRow {
  id: number;
  studentId: number;
  serviceTypeId: number;
  serviceTypeName: string | null;
  providerName: string | null;
  deliveryType: string | null;
  requiredMinutes: number | null;
  intervalType: string | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  source: "active" | "superseded";
  replacedAt: string | null;
  supersedesId: number | null;
}

interface Group {
  serviceTypeId: number;
  serviceTypeName: string;
  active: ServiceRow[];
  history: ServiceRow[];
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const s = String(d).slice(0, 10);
  return s;
}

function summarizeRow(r: ServiceRow): string {
  const minutes = r.requiredMinutes != null ? `${r.requiredMinutes} min` : "";
  const interval = r.intervalType ? `/${r.intervalType.replace(/ly$/, "")}` : "";
  const provider = r.providerName ? ` · ${r.providerName}` : "";
  return `${minutes}${interval}${provider}`.trim();
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
  const studentId: number | null = s?.id ?? null;

  const [asOfDate, setAsOfDate] = useState<string>("");
  const [allReqs, setAllReqs] = useState<ServiceRow[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setHistoryLoading(true);
    const params = new URLSearchParams();
    params.set("studentId", String(studentId));
    if (asOfDate) params.set("asOfDate", asOfDate);
    authFetch(`/api/service-requirements?${params.toString()}`)
      .then((r: Response) => (r.ok ? r.json() : []))
      .then((data: any) => {
        if (cancelled) return;
        setAllReqs(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setAllReqs([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, asOfDate]);

  const groups: Group[] = useMemo(() => {
    const map = new Map<number, Group>();
    for (const r of allReqs ?? []) {
      const k = r.serviceTypeId;
      if (!map.has(k)) {
        map.set(k, {
          serviceTypeId: k,
          serviceTypeName: r.serviceTypeName ?? `Service #${k}`,
          active: [],
          history: [],
        });
      }
      const g = map.get(k)!;
      if (r.source === "active") g.active.push(r);
      else g.history.push(r);
    }
    for (const g of map.values()) {
      g.history.sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
      g.active.sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
    }
    return Array.from(map.values()).sort((a, b) =>
      a.serviceTypeName.localeCompare(b.serviceTypeName),
    );
  }, [allReqs]);

  const progressByReqId = useMemo(() => {
    const m = new Map<number, any>();
    for (const p of progressList ?? []) {
      if (p?.serviceRequirementId != null) m.set(p.serviceRequirementId, p);
    }
    return m;
  }, [progressList]);

  function toggleGroup(typeId: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(typeId)) next.delete(typeId);
      else next.add(typeId);
      return next;
    });
  }

  const isAsOfMode = !!asOfDate;

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
            <div className="flex items-center gap-2 mt-2">
              <label className="flex items-center gap-1.5 text-[11px] text-gray-500" htmlFor="svc-asof">
                <History className="w-3.5 h-3.5" /> As of
              </label>
              <input
                id="svc-asof"
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="text-[11px] border border-gray-200 rounded px-1.5 py-0.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                data-testid="input-services-as-of"
              />
              {isAsOfMode && (
                <button
                  onClick={() => setAsOfDate("")}
                  className="inline-flex items-center gap-0.5 text-[11px] text-gray-400 hover:text-gray-600"
                  title="Clear as-of date"
                  data-testid="button-clear-as-of"
                >
                  <X className="w-3 h-3" /> Today
                </button>
              )}
              {isAsOfMode && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700">
                  in force on {fmtDate(asOfDate)}
                </span>
              )}
              {historyLoading && allReqs != null && (
                <span className="text-[10px] text-gray-400" data-testid="text-services-refreshing">
                  refreshing…
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {historyLoading && allReqs == null ? (
              <Skeleton className="w-full h-24" />
            ) : groups.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-gray-400">
                  {isAsOfMode
                    ? `No service requirements were in force on ${fmtDate(asOfDate)}`
                    : "No service requirements"}
                </p>
                {isEditable && !isAsOfMode && (
                  <button onClick={openAddSvc} className="mt-2 text-xs font-medium text-emerald-700 hover:text-emerald-800">
                    + Add first service requirement
                  </button>
                )}
              </div>
            ) : (
              groups.map((g) => {
                const primary = g.active[0] ?? g.history[0];
                if (!primary) return null;
                const isPrimaryActive = primary.source === "active";
                const progress = progressByReqId.get(primary.id);
                const pct = progress && progress.requiredMinutes > 0
                  ? Math.round((progress.deliveredMinutes / progress.requiredMinutes) * 100)
                  : 0;
                const rCfg = progress
                  ? (RISK_CONFIG[progress.riskStatus] ?? RISK_CONFIG.on_track)
                  : RISK_CONFIG.on_track;
                const isAtRisk =
                  progress?.riskStatus === "at_risk" || progress?.riskStatus === "out_of_compliance";
                const svcReq = s?.serviceRequirements?.find((r: any) => r.id === primary.id) ?? primary;
                const historyCount = g.history.length + Math.max(0, g.active.length - 1);
                const extras = [...g.active.slice(1), ...g.history];
                const open = expanded.has(g.serviceTypeId);

                return (
                  <div
                    key={g.serviceTypeId}
                    className="rounded-lg bg-gray-50/50 group"
                    data-testid={`service-group-${g.serviceTypeId}`}
                  >
                    <div className="flex items-center gap-3 p-3">
                      {progress ? (
                        <MiniProgressRing value={pct} size={36} strokeWidth={3.5} color={rCfg.ringColor} />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gray-200" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-medium text-gray-700 truncate">{g.serviceTypeName}</p>
                          {!isPrimaryActive && (
                            <Badge variant="outline" className="h-4 px-1 text-[9px] font-medium bg-gray-100 text-gray-500 border-gray-200">
                              superseded
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400">
                          {progress
                            ? `${progress.deliveredMinutes} / ${progress.requiredMinutes} min · ${progress.minutesPerWeek} min/wk`
                            : summarizeRow(primary)}
                        </p>
                        <p className="text-[10px] text-gray-400">
                          {fmtDate(primary.startDate)} – {fmtDate(primary.endDate)}
                        </p>
                        {isAtRisk && (
                          <Link
                            href={`/scheduling?tab=minutes&studentId=${s?.id ?? progress?.studentId}`}
                            className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-medium text-blue-600 hover:text-blue-700"
                            data-testid={`link-schedule-detail-${primary.id}`}
                          >
                            <CalendarPlus className="w-3 h-3" /> Schedule sessions
                          </Link>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        {progress ? (
                          <>
                            <p className="text-sm font-bold text-gray-700">{pct}%</p>
                            <p className={`text-[10px] font-medium ${rCfg.color}`}>{rCfg.label}</p>
                          </>
                        ) : (
                          <Badge variant="outline" className="h-4 px-1 text-[9px] font-medium bg-blue-50 text-blue-700 border-blue-200">
                            {isPrimaryActive ? "active" : "in force"}
                          </Badge>
                        )}
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

                    {!isAsOfMode && extras.length > 0 && (
                      <div className="border-t border-gray-100 px-3 pb-2">
                        <button
                          onClick={() => toggleGroup(g.serviceTypeId)}
                          className="w-full flex items-center gap-1 py-1.5 text-[11px] text-gray-500 hover:text-gray-700"
                          data-testid={`button-toggle-history-${g.serviceTypeId}`}
                        >
                          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          {historyCount} earlier {historyCount === 1 ? "version" : "versions"}
                        </button>
                        {open && (
                          <ul className="space-y-1.5 pb-2">
                            {extras.map((h) => {
                              const isActive = h.source === "active";
                              return (
                              <li
                                key={h.id}
                                className={`flex items-start gap-2 text-[11px] pl-4 py-1.5 border-l-2 ${isActive ? "border-emerald-200" : "border-gray-200"}`}
                                data-testid={`history-row-${h.id}`}
                              >
                                <Badge
                                  variant="outline"
                                  className={`mt-0.5 h-4 px-1 text-[9px] font-medium ${isActive ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}
                                >
                                  {isActive ? "active" : "superseded"}
                                </Badge>
                                <div className="flex-1 min-w-0 text-gray-500">
                                  <p className="truncate">{summarizeRow(h)}</p>
                                  <p className="text-[10px] text-gray-400">
                                    {fmtDate(h.startDate)} – {fmtDate(h.endDate)}
                                    {h.replacedAt ? ` · replaced ${fmtDate(h.replacedAt)}` : ""}
                                  </p>
                                </div>
                              </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
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
