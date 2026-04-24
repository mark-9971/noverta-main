import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, AlertTriangle, TrendingDown, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Link } from "wouter";
import { authFetch } from "@/lib/auth-fetch";
import { useSchoolContext } from "@/lib/school-context";

interface ProviderRow {
  staffId: number;
  staffName: string;
  role: string;
  assignedStudents: number;
  totalRequiredMinutes: number;
  totalDeliveredMinutes: number;
  studentsAtRisk: number;
  openAlerts: number;
  utilizationPercent: number;
}

type SortKey =
  | "staffName"
  | "assignedStudents"
  | "totalDeliveredMinutes"
  | "utilizationPercent"
  | "studentsAtRisk"
  | "openAlerts";
type SortDir = "asc" | "desc";

function pctColor(pct: number) {
  if (pct >= 90) return { text: "text-emerald-700", ring: "ring-emerald-200 bg-emerald-50" };
  if (pct >= 80) return { text: "text-amber-700", ring: "ring-amber-200 bg-amber-50" };
  return { text: "text-red-700", ring: "ring-red-100 bg-red-50" };
}

function compareRows(a: ProviderRow, b: ProviderRow, key: SortKey, dir: SortDir): number {
  const mul = dir === "asc" ? 1 : -1;
  if (key === "staffName") return a.staffName.localeCompare(b.staffName) * mul;
  return ((a[key] as number) - (b[key] as number)) * mul;
}

function SortHeader({
  label,
  sortKey,
  current,
  dir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = current === sortKey;
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th
      className={`px-3 py-2 text-${align} text-[11px] font-medium uppercase tracking-wide select-none ${
        active ? "text-gray-700" : "text-gray-400"
      }`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-gray-700 transition-colors ${
          align === "right" ? "flex-row-reverse" : ""
        }`}
        data-testid={`sort-${sortKey}`}
        aria-label={`Sort by ${label}`}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        <span>{label}</span>
        <Icon className={`w-3 h-3 ${active ? "text-indigo-600" : "text-gray-300"}`} />
      </button>
    </th>
  );
}

export default function ProviderDelivery() {
  const { filterParams } = useSchoolContext();
  const qs = new URLSearchParams(filterParams).toString();
  const params = qs ? `?${qs}` : "";

  // Default sort matches the original "lowest delivery rate first" view so
  // the widget still surfaces under-delivering providers at the top.
  const [sortKey, setSortKey] = useState<SortKey>("utilizationPercent");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const onSort = (k: SortKey) => {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      // Sensible default direction per column: text asc, numeric desc
      // (except the rate column which keeps "lowest first" as the default).
      setSortDir(k === "staffName" || k === "utilizationPercent" ? "asc" : "desc");
    }
  };

  const { data: rawProviders, isLoading } = useQuery<ProviderRow[]>({
    queryKey: ["dashboard/provider-summary", filterParams],
    queryFn: async () => {
      const r = await authFetch(`/api/dashboard/provider-summary${params}`);
      if (!r.ok) throw new Error("provider-summary failed");
      return r.json();
    },
    staleTime: 60_000,
    // Pre-narrow to the lowest-utilization 8 providers (the widget's
    // intent) so sort never reorders the entire roster — that's the
    // job of the full /staff page linked at the bottom.
    select: (rows) =>
      rows
        .filter(p => p.totalRequiredMinutes > 0)
        .sort((a, b) => a.utilizationPercent - b.utilizationPercent)
        .slice(0, 8),
  });

  const providers = useMemo(() => {
    if (!rawProviders) return rawProviders;
    return [...rawProviders].sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [rawProviders, sortKey, sortDir]);

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <Users className="w-4 h-4 text-indigo-600" />
          <h2 className="text-sm font-semibold text-gray-900">Provider Delivery</h2>
        </div>
        <div className="px-5 pb-5 space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!providers || providers.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <Users className="w-4 h-4 text-indigo-600" />
          <h2 className="text-sm font-semibold text-gray-900">Provider Delivery</h2>
        </div>
        <p className="px-5 pb-5 text-sm text-gray-400">No provider data available yet.</p>
      </div>
    );
  }

  const belowThreshold = providers.filter(p => p.utilizationPercent < 70).length;
  const now = new Date();
  const monthLabel = now.toLocaleString("default", { month: "long", year: "numeric" });

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-600" />
          <h2 className="text-sm font-semibold text-gray-900">Provider Delivery</h2>
        </div>
        <span className="text-xs text-gray-400">{monthLabel}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="px-5 py-2 text-left text-[11px] font-medium uppercase tracking-wide">
                <button
                  type="button"
                  onClick={() => onSort("staffName")}
                  className={`inline-flex items-center gap-1 hover:text-gray-700 transition-colors ${
                    sortKey === "staffName" ? "text-gray-700" : "text-gray-400"
                  }`}
                  data-testid="sort-staffName"
                  aria-label="Sort by Provider"
                  aria-sort={sortKey === "staffName" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <span>Provider</span>
                  {sortKey === "staffName" ? (
                    sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                  ) : (
                    <ChevronsUpDown className="w-3 h-3 text-gray-300" />
                  )}
                </button>
              </th>
              <SortHeader label="Students" sortKey="assignedStudents" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
              <SortHeader label="At Risk" sortKey="studentsAtRisk" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
              <SortHeader label="Open Alerts" sortKey="openAlerts" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
              <SortHeader label="Min Delivered" sortKey="totalDeliveredMinutes" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
              <SortHeader label="Rate" sortKey="utilizationPercent" current={sortKey} dir={sortDir} onSort={onSort} align="right" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {providers.map(p => {
              const c = pctColor(p.utilizationPercent);
              return (
                <tr key={p.staffId} className="hover:bg-gray-50 cursor-pointer">
                  <td className="px-5 py-3">
                    <Link href={`/staff/${p.staffId}`} className="font-medium text-gray-900 text-[13px] hover:text-indigo-700">
                      {p.staffName}
                    </Link>
                    <div className="text-[11px] text-gray-400 truncate max-w-[180px] capitalize">
                      {p.role?.replace(/_/g, " ")}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px] text-gray-600">
                    {p.assignedStudents}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px]">
                    {p.studentsAtRisk > 0 ? (
                      <span className="text-red-600 font-medium">{p.studentsAtRisk}</span>
                    ) : (
                      <span className="text-gray-300">0</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-[13px]">
                    {p.openAlerts > 0 ? (
                      <span className="text-amber-700 font-medium">{p.openAlerts}</span>
                    ) : (
                      <span className="text-gray-300">0</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="tabular-nums text-[13px] text-gray-700">{p.totalDeliveredMinutes.toLocaleString()}</div>
                    <div className="text-[11px] text-gray-400">of {p.totalRequiredMinutes.toLocaleString()}</div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ring-1 ${c.ring} ${c.text}`}>
                      {p.utilizationPercent < 80 && <TrendingDown className="w-3 h-3" />}
                      {p.utilizationPercent}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
        {belowThreshold > 0 ? (
          <div className="flex items-center gap-2 flex-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
            <span className="text-xs text-gray-500">
              {belowThreshold} provider{belowThreshold > 1 ? "s" : ""} below 70% delivery — compensatory risk is accumulating
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-400 flex-1">All providers delivering above 70%</span>
        )}
        <Link href="/staff" className="text-xs text-indigo-700 hover:text-indigo-800 font-medium flex-shrink-0">
          View all →
        </Link>
      </div>
    </div>
  );
}
