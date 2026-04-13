import { useState } from "react";
import { useListStudents, useListMinuteProgress } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Search, ChevronRight, Users, AlertTriangle } from "lucide-react";
import { Link } from "wouter";

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  on_track: { label: "On Track", color: "text-green-700", bg: "bg-green-50 border-green-200" },
  slightly_behind: { label: "Slightly Behind", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  at_risk: { label: "At Risk", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" },
  out_of_compliance: { label: "Out of Compliance", color: "text-red-700", bg: "bg-red-50 border-red-200" },
  completed: { label: "Completed", color: "text-indigo-700", bg: "bg-indigo-50 border-indigo-200" },
};

function RiskBadge({ status }: { status: string }) {
  const cfg = RISK_CONFIG[status] ?? { label: status, color: "text-slate-600", bg: "bg-slate-50 border-slate-200" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

export default function Students() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const { data: students, isLoading } = useListStudents({} as any);
  const { data: progress } = useListMinuteProgress({} as any);

  const studentList = (students as any[]) ?? [];
  const progressList = (progress as any[]) ?? [];

  // Build per-student worst risk status
  const studentRisk: Record<number, string> = {};
  const priorityOrder = ["out_of_compliance", "at_risk", "slightly_behind", "on_track", "completed"];
  for (const p of progressList) {
    const current = studentRisk[p.studentId];
    if (!current || priorityOrder.indexOf(p.riskStatus) < priorityOrder.indexOf(current)) {
      studentRisk[p.studentId] = p.riskStatus;
    }
  }

  // Compute delivered/required per student (across all services)
  const studentMinutes: Record<number, { delivered: number; required: number }> = {};
  for (const p of progressList) {
    if (!studentMinutes[p.studentId]) studentMinutes[p.studentId] = { delivered: 0, required: 0 };
    studentMinutes[p.studentId].delivered += p.deliveredMinutes;
    studentMinutes[p.studentId].required += p.requiredMinutes;
  }

  const filtered = studentList.filter(s => {
    const matchSearch = search.trim() === "" ||
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      (s.grade ?? "").toLowerCase().includes(search.toLowerCase());
    const riskStatus = studentRisk[s.id] ?? "on_track";
    const matchRisk = riskFilter === "all" || riskStatus === riskFilter;
    return matchSearch && matchRisk;
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Students</h1>
          <p className="text-sm text-slate-500 mt-0.5">{studentList.length} students on active IEPs</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-9 h-9 text-sm" placeholder="Search students..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          {["all", "out_of_compliance", "at_risk", "slightly_behind", "on_track"].map(r => (
            <button
              key={r}
              onClick={() => setRiskFilter(r)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                riskFilter === r ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {r === "all" ? "All" : RISK_CONFIG[r]?.label}
            </button>
          ))}
        </div>
      </div>

      {/* Student Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Grade</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Risk Status</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Minute Progress</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Case Manager</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.map(student => {
                const riskStatus = studentRisk[student.id] ?? "on_track";
                const mins = studentMinutes[student.id];
                const pct = mins?.required > 0 ? Math.round((mins.delivered / mins.required) * 100) : 0;
                return (
                  <tr key={student.id} className="hover:bg-slate-50 cursor-pointer group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 text-xs font-bold flex-shrink-0">
                          {student.firstName?.[0]}{student.lastName?.[0]}
                        </div>
                        <div>
                          <p className="font-medium text-slate-800">{student.firstName} {student.lastName}</p>
                          <p className="text-xs text-slate-400">{student.primaryDisability}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{student.grade ?? "—"}</td>
                    <td className="px-4 py-3"><RiskBadge status={riskStatus} /></td>
                    <td className="px-4 py-3 min-w-[160px]">
                      {mins ? (
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-slate-500">
                            <span>{mins.delivered} / {mins.required} min</span>
                            <span>{pct}%</span>
                          </div>
                          <Progress
                            value={Math.min(100, pct)}
                            className="h-1.5"
                          />
                        </div>
                      ) : <span className="text-slate-400 text-xs">No requirements</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{student.caseManagerId ? `CM #${student.caseManagerId}` : "—"}</td>
                    <td className="px-4 py-3">
                      <Link href={`/students/${student.id}`}>
                        <a className="flex items-center text-indigo-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity hover:underline">
                          View <ChevronRight className="w-3 h-3 ml-0.5" />
                        </a>
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">
                    No students found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
