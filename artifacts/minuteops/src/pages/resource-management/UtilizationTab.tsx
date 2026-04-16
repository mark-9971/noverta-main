import { useState, useMemo } from "react";
import { Download, ChevronDown, ChevronUp, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { updateStaffRates } from "@workspace/api-client-react";
import { ROLE_LABELS } from "./types";
import type { ProviderUtil } from "./types";
import { statusBadge, fmtMin, downloadCsv, UtilBar } from "./shared";

export function UtilizationTab({ data, onRateUpdate }: { data: ProviderUtil[]; onRateUpdate: (staffId: number, hourlyRate: number, annualSalary: number) => void }) {
  const [sortField, setSortField] = useState<"util" | "students" | "name">("util");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRate, setEditRate] = useState("");
  const [editSalary, setEditSalary] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(p: ProviderUtil) {
    setEditingId(p.staffId);
    setEditRate(p.hourlyRate ? String(p.hourlyRate) : "");
    setEditSalary("");
  }

  async function saveRate(staffId: number) {
    const rate = editRate ? parseFloat(editRate) : NaN;
    const salary = editSalary ? parseFloat(editSalary) : NaN;
    const hasRate = !isNaN(rate) && rate > 0;
    const hasSalary = !isNaN(salary) && salary > 0;

    if (!hasRate && !hasSalary) {
      toast.error("Enter an hourly rate or annual salary");
      return;
    }

    const finalRate = hasRate ? rate : (hasSalary ? Math.round((salary / 2080) * 100) / 100 : 0);
    const finalSalary = hasSalary ? salary : (hasRate ? Math.round(rate * 2080) : 0);

    setSaving(true);
    try {
      await updateStaffRates(staffId, { hourlyRate: finalRate, annualSalary: finalSalary } as any);
      toast.success("Rate updated");
      onRateUpdate(staffId, finalRate, finalSalary);
      setEditingId(null);
    } catch {
      toast.error("Failed to update rate");
    } finally {
      setSaving(false);
    }
  }

  const sorted = useMemo(() => {
    const copy = [...data];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortField === "util") cmp = a.utilizationPercent - b.utilizationPercent;
      else if (sortField === "students") cmp = a.studentsServed - b.studentsServed;
      else cmp = a.name.localeCompare(b.name);
      return sortDir === "desc" ? -cmp : cmp;
    });
    return copy;
  }, [data, sortField, sortDir]);

  function toggleSort(field: typeof sortField) {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  }

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return sortDir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Provider Utilization Detail</h3>
          <p className="text-xs text-gray-500 mt-1">{data.length} active providers</p>
        </div>
        <button
          onClick={() => {
            const rows = data.map(p => ({
              Name: p.name,
              Role: ROLE_LABELS[p.role] || p.role,
              School: p.schoolName,
              "Hourly Rate": p.hourlyRate ?? "",
              Students: p.studentsServed,
              "Scheduled Weekly Min": p.scheduledWeeklyMinutes,
              "Capacity Weekly Min": p.capacityWeeklyMinutes,
              "Utilization %": p.utilizationPercent,
              Status: p.status,
            }));
            downloadCsv(rows, "provider_utilization.csv");
          }}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-2.5 py-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer" onClick={() => toggleSort("name")}>
                <span className="flex items-center gap-1">Provider <SortIcon field="name" /></span>
              </th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">School</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">Rate</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center cursor-pointer" onClick={() => toggleSort("students")}>
                <span className="flex items-center justify-center gap-1">Students <SortIcon field="students" /></span>
              </th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center cursor-pointer" onClick={() => toggleSort("util")}>
                <span className="flex items-center justify-center gap-1">Utilization <SortIcon field="util" /></span>
              </th>
              <th className="px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider text-center">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.flatMap(p => {
              const rows = [
                <tr key={p.staffId} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === p.staffId ? null : p.staffId)}>
                  <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-600">{ROLE_LABELS[p.role] || p.role}</td>
                  <td className="px-4 py-3 text-gray-600">{p.schoolName}</td>
                  <td className="px-4 py-3 text-center text-gray-700">
                    {editingId === p.staffId ? (
                      <div className="flex flex-col items-center gap-1" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-xs">$/hr</span>
                          <input
                            type="number"
                            value={editRate}
                            onChange={e => setEditRate(e.target.value)}
                            className="w-16 text-xs border border-gray-300 rounded px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-emerald-600"
                            placeholder="Rate"
                            autoFocus
                            onKeyDown={e => { if (e.key === "Enter") saveRate(p.staffId); if (e.key === "Escape") setEditingId(null); }}
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-400 text-xs">$/yr</span>
                          <input
                            type="number"
                            value={editSalary}
                            onChange={e => setEditSalary(e.target.value)}
                            className="w-20 text-xs border border-gray-300 rounded px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-emerald-600"
                            placeholder="Salary"
                            onKeyDown={e => { if (e.key === "Enter") saveRate(p.staffId); if (e.key === "Escape") setEditingId(null); }}
                          />
                        </div>
                        <div className="flex gap-1">
                          <button onClick={() => saveRate(p.staffId)} disabled={saving} className="text-emerald-600 hover:text-emerald-700 p-0.5">
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 p-0.5">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span className="group inline-flex items-center gap-1">
                        {p.hourlyRate ? `$${p.hourlyRate}/hr` : "—"}
                        <button onClick={(e) => { e.stopPropagation(); startEdit(p); }} className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 p-0.5">
                          <Pencil className="w-3 h-3" />
                        </button>
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">{p.studentsServed}</td>
                  <td className="px-4 py-3 text-center">
                    <UtilBar pct={p.utilizationPercent} />
                  </td>
                  <td className="px-4 py-3 text-center">{statusBadge(p.status)}</td>
                  <td className="px-4 py-3 text-center">
                    {expandedId === p.staffId ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </td>
                </tr>
              ];
              if (expandedId === p.staffId && p.serviceBreakdown.length > 0) {
                rows.push(
                  <tr key={`${p.staffId}-detail`}>
                    <td colSpan={8} className="bg-gray-50 px-10 py-3">
                      <div className="grid grid-cols-3 gap-3">
                        {p.serviceBreakdown.map((sb, i) => (
                          <div key={i} className="bg-white rounded border border-gray-200 p-3">
                            <p className="text-xs font-medium text-gray-500">{sb.serviceType}</p>
                            <p className="text-sm font-semibold text-gray-900 mt-1">{sb.studentCount} students</p>
                            <p className="text-xs text-gray-500">{fmtMin(sb.weeklyMinutes)}/week</p>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              }
              return rows;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
