import { useState } from "react";
import { DollarSign, Users, TrendingUp, Download } from "lucide-react";
import type { BudgetData } from "./types";
import { fmt$, downloadCsv, SummaryCard } from "./shared";

export function BudgetTab({ data }: { data: BudgetData }) {
  const [view, setView] = useState<"student" | "service" | "school">("school");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard label="Total Service Cost (YTD)" value={fmt$(data.summary.totalServiceCost)} icon={<DollarSign className="w-5 h-5 text-emerald-600" />} />
        <SummaryCard label="Total Annual Salaries" value={fmt$(data.summary.totalAnnualSalary)} icon={<Users className="w-5 h-5 text-gray-500" />} />
        <SummaryCard label="Students Served" value={String(data.summary.totalStudentsServed)} icon={<Users className="w-5 h-5 text-gray-500" />} />
        <SummaryCard label="Avg Cost / Student" value={fmt$(data.summary.avgCostPerStudent)} icon={<TrendingUp className="w-5 h-5 text-gray-500" />} />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {([["school", "By School"], ["service", "By Service"], ["student", "By Student"]] as const).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  view === v ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              let rows: Record<string, string | number | boolean | null | undefined>[] = [];
              if (view === "student") {
                rows = data.costByStudent.map(s => ({
                  Name: s.name, School: s.schoolName, "Total Cost": s.totalCost, "Total Minutes": s.totalMinutes,
                }));
              } else if (view === "service") {
                rows = data.costByServiceType.map(s => ({
                  "Service Type": s.serviceType, "Total Cost": s.totalCost, "Total Minutes": s.totalMinutes,
                  Students: s.studentCount, "Avg Cost/Student": s.avgCostPerStudent,
                }));
              } else {
                rows = data.costBySchool.map(s => ({
                  School: s.schoolName, "Total Cost": s.totalCost, "Total Minutes": s.totalMinutes,
                  Students: s.studentCount, "Avg Cost/Student": s.avgCostPerStudent,
                }));
              }
              downloadCsv(rows, `budget_by_${view}.csv`);
            }}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2.5 py-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          {view === "school" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">School</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Total Cost</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Total Minutes</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">Students</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Avg / Student</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.costBySchool.map(s => (
                  <tr key={s.schoolId} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{s.schoolName}</td>
                    <td className="px-4 py-3 text-right text-gray-700 font-mono">{fmt$(s.totalCost)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{s.totalMinutes.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{s.studentCount}</td>
                    <td className="px-4 py-3 text-right text-gray-700 font-mono">{fmt$(s.avgCostPerStudent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {view === "service" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Service Type</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Total Cost</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Total Minutes</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">Students</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Avg / Student</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.costByServiceType.map(s => (
                  <tr key={s.serviceType} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{s.serviceType}</td>
                    <td className="px-4 py-3 text-right text-gray-700 font-mono">{fmt$(s.totalCost)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{s.totalMinutes.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{s.studentCount}</td>
                    <td className="px-4 py-3 text-right text-gray-700 font-mono">{fmt$(s.avgCostPerStudent)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {view === "student" && (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Student</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">School</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Total Cost</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-right">Total Minutes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.costByStudent.map(s => (
                  <tr key={s.studentId} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 text-gray-600">{s.schoolName}</td>
                    <td className="px-4 py-3 text-right text-gray-700 font-mono">{fmt$(s.totalCost)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{s.totalMinutes.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
