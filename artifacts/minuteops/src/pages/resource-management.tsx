import { useState, useEffect, useMemo, useCallback } from "react";
import { useSchoolContext } from "@/lib/school-context";
import { toast } from "sonner";
import {
  Users, DollarSign, Scale, Download, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, ArrowRight, Building2, ChevronDown,
  ChevronUp, Pencil, Check, X,
} from "lucide-react";

const API = "/api";

type Tab = "caseload" | "utilization" | "budget";

interface RoleData {
  role: string;
  fteCount: number;
  studentsServed: number;
  avgCaseload: number;
  totalRequiredWeeklyMinutes: number;
  capacityWeeklyMinutes: number;
  utilizationPercent: number;
  unfilledWeeklyMinutes: number;
  status: string;
}

interface SchoolCaseload {
  schoolId: number;
  schoolName: string;
  totalStudents: number;
  totalProviders: number;
  totalStaff: number;
  byRole: RoleData[];
}

interface ProviderUtil {
  staffId: number;
  name: string;
  role: string;
  schoolName: string;
  hourlyRate: number | null;
  studentsServed: number;
  scheduledWeeklyMinutes: number;
  capacityWeeklyMinutes: number;
  utilizationPercent: number;
  status: string;
  serviceBreakdown: Array<{ serviceType: string; studentCount: number; weeklyMinutes: number }>;
}

interface BudgetData {
  summary: {
    totalDeliveredMinutes: number;
    totalServiceCost: number;
    totalAnnualSalary: number;
    totalStaff: number;
    totalStudentsServed: number;
    avgCostPerStudent: number;
  };
  costByStudent: Array<{
    studentId: number;
    name: string;
    schoolName: string;
    totalCost: number;
    totalMinutes: number;
    services: Array<{ serviceType: string; minutes: number; cost: number }>;
  }>;
  costByServiceType: Array<{
    serviceType: string;
    totalMinutes: number;
    totalCost: number;
    studentCount: number;
    avgCostPerStudent: number;
  }>;
  costBySchool: Array<{
    schoolId: number;
    schoolName: string;
    totalMinutes: number;
    totalCost: number;
    studentCount: number;
    avgCostPerStudent: number;
  }>;
}

interface Suggestion {
  role: string;
  fromSchool: string;
  toSchool: string;
  reason: string;
  providerName: string;
  staffId: number;
}

const ROLE_LABELS: Record<string, string> = {
  bcba: "BCBA",
  slp: "SLP",
  ot: "OT",
  pt: "PT",
  counselor: "Counselor",
  para: "Para/RBT",
  case_manager: "Case Manager",
  teacher: "Teacher",
};

function statusBadge(status: string) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    over_capacity: { bg: "bg-gray-200", text: "text-gray-900", label: "Over Capacity" },
    high_load: { bg: "bg-gray-150 bg-gray-100", text: "text-gray-700", label: "High Load" },
    balanced: { bg: "bg-emerald-600/10", text: "text-emerald-600", label: "Balanced" },
    under_utilized: { bg: "bg-gray-50", text: "text-gray-500", label: "Under-Utilized" },
  };
  const s = map[status] || map.balanced;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  );
}

function fmt$(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtMin(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function downloadCsv(rows: Record<string, string | number | boolean | null | undefined>[], filename: string) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(","),
    ...rows.map(r => headers.map(h => {
      const v = r[h];
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(","))
  ].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ResourceManagement() {
  const [tab, setTab] = useState<Tab>("caseload");
  const { selectedSchoolId } = useSchoolContext();

  const [caseloadData, setCaseloadData] = useState<{ schools: SchoolCaseload[] } | null>(null);
  const [utilData, setUtilData] = useState<ProviderUtil[] | null>(null);
  const [budgetData, setBudgetData] = useState<BudgetData | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const qs = selectedSchoolId ? `?schoolId=${selectedSchoolId}` : "";

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API}/resource-management/caseload${qs}`).then(r => r.json()),
      fetch(`${API}/resource-management/provider-utilization${qs}`).then(r => r.json()),
      fetch(`${API}/resource-management/budget${qs}`).then(r => r.json()),
      fetch(`${API}/resource-management/rebalancing${qs}`).then(r => r.json()),
    ]).then(([cl, ut, bg, sg]) => {
      setCaseloadData(cl);
      setUtilData(ut);
      setBudgetData(bg);
      setSuggestions(sg);
    }).finally(() => setLoading(false));
  }, [selectedSchoolId]);

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "caseload", label: "Caseload Balance", icon: Scale },
    { id: "utilization", label: "Provider Utilization", icon: Users },
    { id: "budget", label: "Budget & Cost", icon: DollarSign },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Resource Management</h1>
          <p className="text-sm text-gray-500 mt-1">Caseload balancing, provider utilization, and cost analysis</p>
        </div>
      </div>

      <div className="border-b border-gray-200">
        <nav className="flex -mb-px space-x-6">
          {tabs.map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-emerald-600 text-emerald-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      ) : (
        <>
          {tab === "caseload" && caseloadData && <CaseloadTab data={caseloadData} suggestions={suggestions} />}
          {tab === "utilization" && utilData && <UtilizationTab data={utilData} onRateUpdate={(staffId, rate, salary) => {
            setUtilData(prev => prev ? prev.map(p => p.staffId === staffId ? { ...p, hourlyRate: rate } : p) : prev);
          }} />}
          {tab === "budget" && budgetData && <BudgetTab data={budgetData} />}
        </>
      )}
    </div>
  );
}

function CaseloadTab({ data, suggestions }: { data: { schools: SchoolCaseload[] }; suggestions: Suggestion[] }) {
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

function UtilizationTab({ data, onRateUpdate }: { data: ProviderUtil[]; onRateUpdate: (staffId: number, hourlyRate: number, annualSalary: number) => void }) {
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
    const rate = parseFloat(editRate);
    if (isNaN(rate) || rate <= 0) {
      toast.error("Enter a valid hourly rate");
      return;
    }
    const salary = editSalary ? parseFloat(editSalary) : Math.round(rate * 2080);
    setSaving(true);
    try {
      const res = await fetch(`${API}/staff/${staffId}/rates`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hourlyRate: rate, annualSalary: salary }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast.success("Rate updated");
      onRateUpdate(staffId, rate, salary);
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
                      <div className="flex items-center gap-1 justify-center" onClick={e => e.stopPropagation()}>
                        <span className="text-gray-400 text-xs">$</span>
                        <input
                          type="number"
                          value={editRate}
                          onChange={e => setEditRate(e.target.value)}
                          className="w-16 text-xs border border-gray-300 rounded px-1.5 py-1 text-center focus:outline-none focus:ring-1 focus:ring-emerald-600"
                          placeholder="Rate"
                          autoFocus
                          onKeyDown={e => { if (e.key === "Enter") saveRate(p.staffId); if (e.key === "Escape") setEditingId(null); }}
                        />
                        <button onClick={() => saveRate(p.staffId)} disabled={saving} className="text-emerald-600 hover:text-emerald-700 p-0.5">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600 p-0.5">
                          <X className="w-3.5 h-3.5" />
                        </button>
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

function BudgetTab({ data }: { data: BudgetData }) {
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

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        {icon}
      </div>
      <p className="text-xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function UtilBar({ pct }: { pct: number }) {
  const color = pct > 100 ? "bg-gray-900" : pct > 80 ? "bg-gray-600" : pct > 40 ? "bg-emerald-600" : "bg-gray-300";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="text-xs text-gray-600 w-8">{pct}%</span>
    </div>
  );
}
