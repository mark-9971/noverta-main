import { useState, useEffect } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  AlertTriangle, CheckCircle2, Sparkles, CircleDot,
  Calendar, Activity, GraduationCap, TrendingDown, TrendingUp,
  ChevronRight, Users, ChevronDown,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import PromptDependencePanel from "./PromptDependencePanel";

interface StudentSummary {
  id: number;
  firstName: string;
  lastName: string;
  grade: string | null;
  behaviorTargetCount: number;
  programTargetCount: number;
  lastSessionDate: string | null;
  daysSinceSession: number | null;
  sessionsThisMonth: number;
  totalSessions: number;
  programsMastered: number;
  programsInProgress: number;
  programsAtRisk: number;
  nearMastery: { name: string; avg: number; criterion: number }[];
  behaviorsImproving: number;
  behaviorsWorsening: number;
  status: "no_data" | "at_risk" | "on_track" | "mastering";
}

const STATUS_CONFIG = {
  at_risk: { label: "At Risk", color: "bg-red-50 border-red-200", badge: "bg-red-100 text-red-700", icon: AlertTriangle, iconColor: "text-red-500" },
  on_track: { label: "On Track", color: "bg-white border-gray-200", badge: "bg-emerald-50 text-emerald-700", icon: CheckCircle2, iconColor: "text-emerald-500" },
  mastering: { label: "Mastering", color: "bg-indigo-50 border-indigo-200", badge: "bg-indigo-100 text-indigo-700", icon: Sparkles, iconColor: "text-indigo-500" },
  no_data: { label: "No Data", color: "bg-gray-50 border-gray-200", badge: "bg-gray-100 text-gray-500", icon: CircleDot, iconColor: "text-gray-400" },
};

function StatusBadge({ status }: { status: StudentSummary["status"] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${cfg.badge}`}>
      <Icon className={`w-2.5 h-2.5 ${cfg.iconColor}`} />
      {cfg.label}
    </span>
  );
}

function SessionBar({ count, max }: { count: number; max: number }) {
  const pct = max > 0 ? (count / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-medium text-gray-600 w-4 text-right">{count}</span>
    </div>
  );
}

export default function CaseloadAnalytics({ onViewStudent }: { onViewStudent?: (id: number) => void }) {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | StudentSummary["status"]>("all");
  const [sort, setSort] = useState<"name" | "sessions" | "days">("days");

  useEffect(() => {
    authFetch("/api/aba/caseload-analytics")
      .then(r => r.json())
      .then(d => { setStudents(d.students ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;

  const counts = {
    at_risk: students.filter(s => s.status === "at_risk").length,
    on_track: students.filter(s => s.status === "on_track").length,
    mastering: students.filter(s => s.status === "mastering").length,
    no_data: students.filter(s => s.status === "no_data").length,
  };

  const filtered = students
    .filter(s => filter === "all" || s.status === filter)
    .sort((a, b) => {
      if (sort === "name") return a.lastName.localeCompare(b.lastName);
      if (sort === "sessions") return (b.sessionsThisMonth ?? 0) - (a.sessionsThisMonth ?? 0);
      if (sort === "days") {
        if (a.daysSinceSession === null) return 1;
        if (b.daysSinceSession === null) return -1;
        return b.daysSinceSession - a.daysSinceSession;
      }
      return 0;
    });

  const maxSessions = Math.max(...students.map(s => s.sessionsThisMonth), 1);

  const nearMasteryAll = students.flatMap(s =>
    s.nearMastery.map(p => ({ ...p, studentName: `${s.firstName} ${s.lastName}` }))
  ).sort((a, b) => b.avg - a.avg).slice(0, 6);

  const activityChartData = students
    .filter(s => s.sessionsThisMonth > 0)
    .sort((a, b) => b.sessionsThisMonth - a.sessionsThisMonth)
    .slice(0, 12)
    .map(s => ({
      name: `${s.firstName[0]}. ${s.lastName}`,
      sessions: s.sessionsThisMonth,
      status: s.status,
    }));

  const BAR_COLORS: Record<string, string> = {
    at_risk: "#f87171",
    on_track: "#34d399",
    mastering: "#818cf8",
    no_data: "#d1d5db",
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(["at_risk", "on_track", "mastering", "no_data"] as const).map(s => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.icon;
          const active = filter === s;
          return (
            <button
              key={s}
              onClick={() => setFilter(active ? "all" : s)}
              className={`text-left p-3 rounded-xl border transition-all ${cfg.color} ${active ? "ring-2 ring-offset-1 ring-gray-400" : "hover:shadow-sm"}`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{cfg.label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">{counts[s]}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                {s === "at_risk" && "No session 14+ days or program below 50%"}
                {s === "on_track" && "Active sessions, programs progressing"}
                {s === "mastering" && "All programs at or above mastery"}
                {s === "no_data" && "No ABA data recorded yet"}
              </p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Session activity chart */}
        {activityChartData.length > 0 && (
          <Card className="lg:col-span-2">
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-500" />
                Sessions This Month (top students)
              </p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={activityChartData} layout="vertical" margin={{ left: 60, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} width={55} />
                  <Tooltip formatter={(v) => [`${v} sessions`, "Sessions"]} />
                  <Bar dataKey="sessions" radius={[0, 4, 4, 0]}>
                    {activityChartData.map((entry, i) => (
                      <Cell key={i} fill={BAR_COLORS[entry.status]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Near mastery programs */}
        {nearMasteryAll.length > 0 && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-500" />
                Near Mastery
              </p>
              <div className="space-y-2.5">
                {nearMasteryAll.map((p, i) => (
                  <div key={i} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] font-medium text-gray-700 truncate">{p.name}</p>
                      <span className="text-[11px] font-bold text-indigo-600 ml-2 flex-shrink-0">{p.avg}%</span>
                    </div>
                    <p className="text-[10px] text-gray-400">{p.studentName}</p>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (p.avg / p.criterion) * 100)}%`,
                          background: p.avg >= p.criterion * 0.9 ? "#818cf8" : "#34d399",
                        }}
                      />
                    </div>
                    <p className="text-[9px] text-gray-400">Mastery: {p.criterion}%</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filter + sort controls */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Users className="w-4 h-4" />
          {filter === "all" ? `All ${students.length} Students` : `${filtered.length} / ${students.length} Students`}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-400">Sort:</span>
          {(["days", "sessions", "name"] as const).map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg transition-colors ${
                sort === s ? "bg-gray-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {s === "days" ? "Last Session" : s === "sessions" ? "Activity" : "Name"}
            </button>
          ))}
        </div>
      </div>

      {/* Student cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {filtered.map(s => {
          const cfg = STATUS_CONFIG[s.status];
          return (
            <Card key={s.id} className={`border ${cfg.color} hover:shadow-sm transition-shadow`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-800 text-[14px]">{s.firstName} {s.lastName}</p>
                    <p className="text-[11px] text-gray-400">{s.grade ? `Grade ${s.grade}` : "—"}</p>
                  </div>
                  <StatusBadge status={s.status} />
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  <div className="text-center bg-white/70 rounded-lg p-2 border border-gray-100">
                    <Activity className="w-3 h-3 text-red-400 mx-auto mb-0.5" />
                    <p className="text-[15px] font-bold text-gray-700">{s.behaviorTargetCount}</p>
                    <p className="text-[9px] text-gray-400">Behaviors</p>
                  </div>
                  <div className="text-center bg-white/70 rounded-lg p-2 border border-gray-100">
                    <GraduationCap className="w-3 h-3 text-emerald-500 mx-auto mb-0.5" />
                    <p className="text-[15px] font-bold text-gray-700">{s.programTargetCount}</p>
                    <p className="text-[9px] text-gray-400">Programs</p>
                  </div>
                  <div className="text-center bg-white/70 rounded-lg p-2 border border-gray-100">
                    <Calendar className="w-3 h-3 text-blue-400 mx-auto mb-0.5" />
                    <p className="text-[15px] font-bold text-gray-700">{s.sessionsThisMonth}</p>
                    <p className="text-[9px] text-gray-400">This Month</p>
                  </div>
                </div>

                {/* Session bar */}
                <div className="mb-3">
                  <p className="text-[10px] text-gray-400 mb-1">Monthly session activity</p>
                  <SessionBar count={s.sessionsThisMonth} max={maxSessions} />
                </div>

                {/* Program mastery breakdown */}
                {s.programTargetCount > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] text-gray-400 mb-1.5">Program progress</p>
                    <div className="flex gap-1 h-2 rounded-full overflow-hidden">
                      {s.programsMastered > 0 && (
                        <div
                          className="bg-indigo-400"
                          style={{ width: `${(s.programsMastered / s.programTargetCount) * 100}%` }}
                          title={`${s.programsMastered} mastered`}
                        />
                      )}
                      {s.programsInProgress > 0 && (
                        <div
                          className="bg-emerald-400"
                          style={{ width: `${(s.programsInProgress / s.programTargetCount) * 100}%` }}
                          title={`${s.programsInProgress} in progress`}
                        />
                      )}
                      {s.programsAtRisk > 0 && (
                        <div
                          className="bg-red-300"
                          style={{ width: `${(s.programsAtRisk / s.programTargetCount) * 100}%` }}
                          title={`${s.programsAtRisk} at risk`}
                        />
                      )}
                    </div>
                    <div className="flex gap-3 mt-1">
                      {s.programsMastered > 0 && <span className="text-[9px] text-indigo-600 font-medium">✓ {s.programsMastered} mastered</span>}
                      {s.programsInProgress > 0 && <span className="text-[9px] text-emerald-600 font-medium">→ {s.programsInProgress} in progress</span>}
                      {s.programsAtRisk > 0 && <span className="text-[9px] text-red-500 font-medium">⚠ {s.programsAtRisk} at risk</span>}
                    </div>
                  </div>
                )}

                {/* Behavior trends */}
                {(s.behaviorsImproving > 0 || s.behaviorsWorsening > 0) && (
                  <div className="flex items-center gap-3 mb-3">
                    {s.behaviorsImproving > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                        <TrendingDown className="w-3 h-3" /> {s.behaviorsImproving} improving
                      </span>
                    )}
                    {s.behaviorsWorsening > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
                        <TrendingUp className="w-3 h-3" /> {s.behaviorsWorsening} worsening
                      </span>
                    )}
                  </div>
                )}

                {/* Last session + actions */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100/80">
                  <p className="text-[10px] text-gray-400">
                    Last session: {s.lastSessionDate
                      ? (s.daysSinceSession === 0 ? "Today"
                        : s.daysSinceSession === 1 ? "Yesterday"
                        : `${s.daysSinceSession}d ago`)
                      : "Never"}
                  </p>
                  <div className="flex items-center gap-2">
                    {onViewStudent ? (
                      <button
                        onClick={() => onViewStudent(s.id)}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-0.5 px-2 py-0.5 rounded-md hover:bg-indigo-50 transition-colors"
                      >
                        View Programs <ChevronRight className="w-3 h-3" />
                      </button>
                    ) : (
                      <Link href={`/students/${s.id}`}>
                        <button className="text-[10px] text-emerald-700 hover:text-emerald-900 font-medium flex items-center gap-0.5">
                          View <ChevronRight className="w-3 h-3" />
                        </button>
                      </Link>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filtered.length === 0 && (
          <div className="col-span-full text-center py-12 text-sm text-gray-400">
            No students match this filter.
          </div>
        )}
      </div>

      {/* Prompt Dependence section */}
      <PromptDependenceSection onViewStudent={onViewStudent} />
    </div>
  );
}

function PromptDependenceSection({ onViewStudent }: { onViewStudent?: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2.5">
          <TrendingDown className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-gray-700 text-sm">Prompt Dependence Analytics</span>
          <span className="text-[11px] text-gray-400 font-normal">
            — which targets are fading, stalled, or regressing?
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="p-5 bg-white">
          <PromptDependencePanel onViewStudent={onViewStudent} />
        </div>
      )}
    </div>
  );
}
