import { useState } from "react";
import { Link } from "wouter";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { BarChart2, ChevronUp, ChevronDown, Flame } from "lucide-react";
import {
  useGetAnalyticsPmOverview, useGetAnalyticsPmByStudent, useGetAnalyticsPmAntecedents,
} from "@workspace/api-client-react";

const ANT_LABELS: Record<string, string> = {
  academic_demand: "Academic", transition: "Transition", unstructured_time: "Unstructured",
  sensory_overload: "Sensory", social_conflict: "Social", peer_interaction: "Peer",
  staff_redirection: "Staff Redirect", denied_access: "Denied Access",
};

export function TrendsPanel() {
  const { data: _ov } = useGetAnalyticsPmOverview();
  const { data: _byStudent } = useGetAnalyticsPmByStudent();
  const { data: _ants } = useGetAnalyticsPmAntecedents();
  const ov = _ov as any;
  const byStudent = (_byStudent as any[]) ?? [];
  const ants = (_ants as any[]) ?? [];

  const [open, setOpen] = useState(true);

  if (!ov) return null;

  const monthlyData = (ov.monthlyTrend ?? []).map((m: any) => ({
    month: m.month ? new Date(m.month + "-01").toLocaleDateString("en-US", { month: "short" }) : m.month,
    total: m.total ?? 0,
  }));

  const highFreq = byStudent.filter((s: any) => s.total >= 10).slice(0, 5);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <BarChart2 className="w-4 h-4 text-emerald-500" />
          Incident Trends &amp; Insights
          <span className="ml-2 text-[11px] font-normal text-gray-400">
            {ov.totalIncidents} incidents · {ov.studentsAffected} students · {ov.injuryRate}% injury rate
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-2">Monthly Volume</p>
            <div className="h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} barSize={14}>
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis hide allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white rounded shadow border border-gray-100 px-2.5 py-1.5 text-xs">
                          <span className="font-semibold text-gray-700">{label}: {payload[0].value} incidents</span>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {monthlyData.map((_: any, i: number) => (
                      <Cell key={i} fill={i >= monthlyData.length - 2 ? "#059669" : "#e5e7eb"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-2">Top Antecedents</p>
            <div className="space-y-1.5">
              {ants.slice(0, 5).map((a: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="text-[11px] text-gray-600 w-28 flex-shrink-0">{ANT_LABELS[a.category] ?? a.category}</div>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${a.percentage}%` }} />
                  </div>
                  <span className="text-[11px] text-gray-500 w-8 text-right">{a.percentage}%</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-2 flex items-center gap-1">
              <Flame className="w-3 h-3 text-red-400" /> High-Frequency Students (10+ incidents)
            </p>
            {highFreq.length === 0 ? (
              <p className="text-xs text-gray-400">No students with 10+ incidents</p>
            ) : (
              <div className="space-y-2">
                {highFreq.map((s: any) => (
                  <Link key={s.studentId} href={`/students/${s.studentId}`}>
                    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors cursor-pointer">
                      <span className="text-xs font-medium text-red-800">{s.firstName} {s.lastName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-red-700">{s.total}</span>
                        {s.injuries > 0 && <span className="text-[10px] bg-red-200 text-red-800 rounded px-1">{s.injuries} inj.</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-gray-800">{ov.bipRate}%</div>
                <div className="text-[10px] text-gray-400">BIP in Place</div>
              </div>
              <div>
                <div className="text-lg font-bold text-gray-800">{ov.debriefRate}%</div>
                <div className="text-[10px] text-gray-400">Debrief Rate</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
