import { useState } from "react";
import { useListStudents, useListMinuteProgress } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniProgressRing } from "@/components/ui/progress-ring";
import { Search, ChevronRight } from "lucide-react";
import { Link } from "wouter";

const RISK_CONFIG: Record<string, { label: string; color: string; ringColor: string; bg: string }> = {
  on_track: { label: "On Track", color: "text-emerald-700", ringColor: "#10b981", bg: "bg-emerald-50 border-emerald-200" },
  slightly_behind: { label: "Slightly Behind", color: "text-amber-700", ringColor: "#f59e0b", bg: "bg-amber-50 border-amber-200" },
  at_risk: { label: "At Risk", color: "text-orange-700", ringColor: "#f97316", bg: "bg-orange-50 border-orange-200" },
  out_of_compliance: { label: "Out of Compliance", color: "text-red-700", ringColor: "#ef4444", bg: "bg-red-50 border-red-200" },
  completed: { label: "Completed", color: "text-indigo-700", ringColor: "#6366f1", bg: "bg-indigo-50 border-indigo-200" },
};

export default function Students() {
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const { data: students, isLoading } = useListStudents({} as any);
  const { data: progress } = useListMinuteProgress({} as any);

  const studentList = (students as any[]) ?? [];
  const progressList = (progress as any[]) ?? [];

  const priorityOrder = ["out_of_compliance", "at_risk", "slightly_behind", "on_track", "completed"];
  const studentRisk: Record<number, string> = {};
  for (const p of progressList) {
    const current = studentRisk[p.studentId];
    if (!current || priorityOrder.indexOf(p.riskStatus) < priorityOrder.indexOf(current)) {
      studentRisk[p.studentId] = p.riskStatus;
    }
  }

  const studentMinutes: Record<number, { delivered: number; required: number }> = {};
  for (const p of progressList) {
    if (!studentMinutes[p.studentId]) studentMinutes[p.studentId] = { delivered: 0, required: 0 };
    studentMinutes[p.studentId].delivered += p.deliveredMinutes;
    studentMinutes[p.studentId].required += p.requiredMinutes;
  }

  const riskCounts = Object.values(studentRisk).reduce((acc: Record<string, number>, r) => {
    acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {});

  const filtered = studentList.filter(s => {
    const matchSearch = search.trim() === "" ||
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase());
    const riskStatus = studentRisk[s.id] ?? "on_track";
    const matchRisk = riskFilter === "all" || riskStatus === riskFilter;
    return matchSearch && matchRisk;
  });

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Students</h1>
        <p className="text-sm text-slate-400 mt-1">{studentList.length} students on active IEPs</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          aria-pressed={riskFilter === "all"}
          onClick={() => setRiskFilter("all")}
          className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all ${
            riskFilter === "all" ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
          }`}
        >All ({studentList.length})</button>
        {["out_of_compliance", "at_risk", "slightly_behind", "on_track"].map(r => {
          const cfg = RISK_CONFIG[r];
          return (
            <button
              key={r}
              aria-pressed={riskFilter === r}
              onClick={() => setRiskFilter(riskFilter === r ? "all" : r)}
              className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                riskFilter === r ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
              }`}
            >{cfg.label} ({riskCounts[r] ?? 0})</button>
          );
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input className="pl-10 h-10 text-[13px] bg-white" placeholder="Search by student name..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="space-y-2">
        {isLoading ? (
          [...Array(8)].map((_, i) => <Skeleton key={i} className="w-full h-[72px] rounded-xl" />)
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400"><p className="font-medium">No students found</p></div>
        ) : filtered.map(s => {
          const risk = studentRisk[s.id] ?? "on_track";
          const cfg = RISK_CONFIG[risk] ?? RISK_CONFIG.on_track;
          const mins = studentMinutes[s.id] ?? { delivered: 0, required: 0 };
          const pct = mins.required > 0 ? Math.round((mins.delivered / mins.required) * 100) : 0;

          return (
            <Link key={s.id} href={`/students/${s.id}`}>
              <Card className="hover:shadow-sm transition-all cursor-pointer group">
                <div className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 text-[13px] font-bold flex-shrink-0">
                    {s.firstName?.[0]}{s.lastName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-slate-800">{s.firstName} {s.lastName}</p>
                    <p className="text-[12px] text-slate-400">Grade {s.grade} · CM #{s.caseManagerId}</p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color} flex-shrink-0 hidden sm:inline-flex`}>
                    {cfg.label}
                  </span>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <MiniProgressRing value={pct} size={36} strokeWidth={3.5} color={cfg.ringColor} />
                    <div className="text-right w-20">
                      <p className="text-[13px] font-bold text-slate-700">{pct}%</p>
                      <p className="text-[10px] text-slate-400">{mins.delivered}/{mins.required}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
