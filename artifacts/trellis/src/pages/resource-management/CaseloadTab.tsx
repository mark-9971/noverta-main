import { Building2, Download, AlertTriangle, ArrowRight } from "lucide-react";
import { ROLE_LABELS } from "./types";
import type { SchoolCaseload, Suggestion } from "./types";
import { statusBadge, fmtMin, downloadCsv, UtilBar } from "./shared";

export function CaseloadTab({ data, suggestions }: { data: { schools: SchoolCaseload[] }; suggestions: Suggestion[] }) {
  return (
    <div className="space-y-6">
      {data.schools.map(school => (
        <div key={school.schoolId} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Building2 className="w-5 h-5 text-gray-400" />
              <div>
                <h3 className="font-semibold text-gray-900">{school.schoolName}</h3>
                <p className="text-xs text-gray-500">
                  {school.totalStudents} students · {school.totalProviders} providers · {school.totalStaff} total staff
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                const rows = school.byRole.filter(r => r.fteCount > 0 || r.studentsServed > 0).map(r => ({
                  Role: ROLE_LABELS[r.role] || r.role,
                  FTEs: r.fteCount,
                  Students: r.studentsServed,
                  "Avg Caseload": r.avgCaseload,
                  "Weekly Min Required": r.totalRequiredWeeklyMinutes,
                  "Weekly Capacity": r.capacityWeeklyMinutes,
                  "Utilization %": r.utilizationPercent,
                  Status: r.status,
                }));
                downloadCsv(rows, `caseload_${school.schoolName.replace(/\s+/g, "_")}.csv`);
              }}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2.5 py-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">FTEs</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">Students</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">Avg Caseload</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">Weekly Min</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">Capacity</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">Utilization</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {school.byRole.filter(r => r.fteCount > 0 || r.studentsServed > 0).map(r => (
                  <tr key={r.role} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">{ROLE_LABELS[r.role] || r.role}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{r.fteCount}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{r.studentsServed}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{r.avgCaseload}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{fmtMin(r.totalRequiredWeeklyMinutes)}</td>
                    <td className="px-4 py-3 text-center text-gray-700">{fmtMin(r.capacityWeeklyMinutes)}</td>
                    <td className="px-4 py-3 text-center">
                      <UtilBar pct={r.utilizationPercent} />
                    </td>
                    <td className="px-4 py-3 text-center">{statusBadge(r.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {suggestions.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Rebalancing Suggestions
            </h3>
            <p className="text-xs text-gray-500 mt-1">Potential provider reassignments to improve balance</p>
          </div>
          <div className="divide-y divide-gray-100">
            {suggestions.map((s, i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                    <span className="text-emerald-600">{ROLE_LABELS[s.role] || s.role}</span>
                    <span className="text-gray-400">·</span>
                    <span>{s.providerName}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                    <span>{s.fromSchool}</span>
                    <ArrowRight className="w-3 h-3" />
                    <span>{s.toSchool}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{s.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
