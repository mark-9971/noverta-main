import { useParams } from "wouter";
import { useGetStudent, useGetStudentMinuteProgress, useGetStudentSessions, useListServiceRequirements } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRing, MiniProgressRing } from "@/components/ui/progress-ring";
import { Link } from "wouter";
import { ArrowLeft, CheckCircle, XCircle, Clock, TrendingUp } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

const RISK_CONFIG: Record<string, { label: string; color: string; ringColor: string; bg: string }> = {
  on_track: { label: "On Track", color: "text-emerald-700", ringColor: "#10b981", bg: "bg-emerald-50" },
  slightly_behind: { label: "Slightly Behind", color: "text-amber-700", ringColor: "#f59e0b", bg: "bg-amber-50" },
  at_risk: { label: "At Risk", color: "text-orange-700", ringColor: "#f97316", bg: "bg-orange-50" },
  out_of_compliance: { label: "Out of Compliance", color: "text-red-700", ringColor: "#ef4444", bg: "bg-red-50" },
  completed: { label: "Completed", color: "text-indigo-700", ringColor: "#6366f1", bg: "bg-indigo-50" },
};

export default function StudentDetail() {
  const params = useParams<{ id: string }>();
  const studentId = Number(params.id);

  const { data: student, isLoading: loadingStudent } = useGetStudent(studentId);
  const { data: progress } = useGetStudentMinuteProgress(studentId);
  const { data: sessions } = useGetStudentSessions(studentId, { limit: 20 } as any);
  const { data: serviceReqs } = useListServiceRequirements({ studentId } as any);

  const s = student as any;
  const progressList = (progress as any[]) ?? [];
  const sessionList = (sessions as any[]) ?? [];

  const totalDelivered = progressList.reduce((sum: number, p: any) => sum + (p.deliveredMinutes ?? 0), 0);
  const totalRequired = progressList.reduce((sum: number, p: any) => sum + (p.requiredMinutes ?? 0), 0);
  const overallPct = totalRequired > 0 ? Math.round((totalDelivered / totalRequired) * 100) : 0;

  const priorityOrder = ["out_of_compliance", "at_risk", "slightly_behind", "on_track", "completed"];
  let worstRisk = "on_track";
  for (const p of progressList) {
    if (priorityOrder.indexOf(p.riskStatus) < priorityOrder.indexOf(worstRisk)) {
      worstRisk = p.riskStatus;
    }
  }
  const riskCfg = RISK_CONFIG[worstRisk] ?? RISK_CONFIG.on_track;

  const chartData = progressList.map((p: any) => ({
    name: p.serviceTypeName?.split(" ").slice(0, 2).join(" ") ?? "Service",
    delivered: p.deliveredMinutes ?? 0,
    required: p.requiredMinutes ?? 0,
    pct: p.requiredMinutes > 0 ? Math.round((p.deliveredMinutes / p.requiredMinutes) * 100) : 0,
    riskStatus: p.riskStatus,
  }));

  const recentSessions = sessionList.slice(0, 12);
  const completedSessions = sessionList.filter((se: any) => se.status === "completed").length;
  const missedSessions = sessionList.filter((se: any) => se.status === "missed").length;

  if (!loadingStudent && !s) {
    return (
      <div className="p-8">
        <Link href="/students" className="text-indigo-600 text-sm flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to Students
        </Link>
        <p className="text-slate-500">Student not found.</p>
      </div>
    );
  }

  function formatDate(d: string) {
    if (!d) return "—";
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-8">
      <div>
        <Link href="/students" className="text-indigo-600 text-sm flex items-center gap-1.5 mb-4 hover:text-indigo-700">
          <ArrowLeft className="w-4 h-4" /> All Students
        </Link>

        {s ? (
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 text-lg font-bold" aria-hidden="true">
              {s.firstName?.[0]}{s.lastName?.[0]}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{s.firstName} {s.lastName}</h1>
              <p className="text-sm text-slate-400 mt-0.5">
                Grade {s.grade} · {s.disabilityCategory?.replace(/_/g, " ")} · Case Mgr #{s.caseManagerId}
              </p>
            </div>
            <div className="ml-auto">
              <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold ${riskCfg.bg} ${riskCfg.color}`}>
                {riskCfg.label}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-5">
            <Skeleton className="w-14 h-14 rounded-2xl" />
            <div>
              <Skeleton className="w-48 h-7" />
              <Skeleton className="w-32 h-4 mt-2" />
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <ProgressRing value={overallPct} size={56} strokeWidth={6} color={riskCfg.ringColor} />
            <div>
              <p className="text-2xl font-bold text-slate-800">{overallPct}%</p>
              <p className="text-[11px] text-slate-400">Overall Progress</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-indigo-50 rounded-xl flex items-center justify-center" aria-hidden="true">
              <TrendingUp className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{totalDelivered}<span className="text-sm text-slate-400 font-normal"> / {totalRequired}</span></p>
              <p className="text-[11px] text-slate-400">Minutes Delivered</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center" aria-hidden="true">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{completedSessions}</p>
              <p className="text-[11px] text-slate-400">Completed Sessions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center" aria-hidden="true">
              <XCircle className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-800">{missedSessions}</p>
              <p className="text-[11px] text-slate-400">Missed Sessions</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card className="lg:col-span-7">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-slate-600">Minutes by Service</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 48)}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}
                    formatter={(val: any, name: string) => [val + " min", name === "delivered" ? "Delivered" : "Required"]}
                  />
                  <Bar dataKey="required" fill="#e2e8f0" radius={[0, 4, 4, 0]} barSize={18} name="Required" />
                  <Bar dataKey="delivered" radius={[0, 4, 4, 0]} barSize={18} name="Delivered">
                    {chartData.map((entry: any, idx: number) => (
                      <Cell key={idx} fill={RISK_CONFIG[entry.riskStatus]?.ringColor ?? "#6366f1"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Skeleton className="w-full h-48" />
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader className="pb-0">
            <CardTitle className="text-sm font-semibold text-slate-600">Service Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {progressList.length > 0 ? progressList.map((p: any, idx: number) => {
              const pct = p.requiredMinutes > 0 ? Math.round((p.deliveredMinutes / p.requiredMinutes) * 100) : 0;
              const rCfg = RISK_CONFIG[p.riskStatus] ?? RISK_CONFIG.on_track;
              return (
                <div key={p.serviceRequirementId ?? idx} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50/50">
                  <MiniProgressRing value={pct} size={36} strokeWidth={3.5} color={rCfg.ringColor} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-slate-700 truncate">{p.serviceTypeName}</p>
                    <p className="text-[11px] text-slate-400">
                      {p.deliveredMinutes} / {p.requiredMinutes} min · {p.minutesPerWeek} min/wk
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-slate-700">{pct}%</p>
                    <p className={`text-[10px] font-medium ${rCfg.color}`}>{rCfg.label}</p>
                  </div>
                </div>
              );
            }) : (
              <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="w-full h-14" />)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-slate-600">Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {recentSessions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                    <th className="text-left py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Service</th>
                    <th className="text-left py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Provider</th>
                    <th className="text-left py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Duration</th>
                    <th className="text-left py-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentSessions.map((se: any) => (
                    <tr key={se.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 text-[13px] text-slate-600">{formatDate(se.sessionDate)}</td>
                      <td className="py-2.5 text-[13px] text-slate-600">{se.serviceTypeName ?? "—"}</td>
                      <td className="py-2.5 text-[13px] text-slate-500">{se.staffName ?? "—"}</td>
                      <td className="py-2.5 text-[13px] text-slate-600">{se.durationMinutes ?? "—"} min</td>
                      <td className="py-2.5">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                          se.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                          se.status === "missed" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"
                        }`}>
                          {se.status === "completed" ? <CheckCircle className="w-3 h-3" /> : se.status === "missed" ? <XCircle className="w-3 h-3" /> : null}
                          {se.isMakeup ? "Makeup" : se.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-slate-400">No sessions recorded yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
