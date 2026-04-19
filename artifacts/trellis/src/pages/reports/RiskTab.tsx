import { useState, useMemo } from "react";
import { useGetComplianceRiskReport } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MiniProgressRing } from "@/components/ui/progress-ring";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Link } from "wouter";
import {
  Download, FileBarChart, Search, X,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import { RISK_CONFIG, RISK_PRIORITY_ORDER } from "@/lib/constants";
import { useRole } from "@/lib/role-context";
import { downloadCsv } from "./utils";

type SortKey = "studentName" | "serviceTypeName" | "riskStatus" | "deliveredMinutes" | "percentComplete" | "remainingMinutes";
type SortDir = "asc" | "desc";

const RISK_FILTER_OPTIONS = [
  { key: "out_of_compliance", label: "Out of Compliance" },
  { key: "at_risk", label: "At Risk" },
  { key: "slightly_behind", label: "Slightly Behind" },
  { key: "no_data", label: "Not Started" },
  { key: "on_track", label: "On Track" },
  { key: "completed", label: "Completed" },
];

function riskPriority(status: string): number {
  const idx = RISK_PRIORITY_ORDER.indexOf(status);
  return idx === -1 ? 99 : idx;
}

function SortIcon({ col, sortKey, dir }: { col: SortKey; sortKey: SortKey; dir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="w-3 h-3 text-gray-300 ml-1 inline" />;
  return dir === "asc"
    ? <ChevronUp className="w-3 h-3 text-emerald-600 ml-1 inline" />
    : <ChevronDown className="w-3 h-3 text-emerald-600 ml-1 inline" />;
}

export function RiskTab() {
  const { user } = useRole();
  const { data: complianceRisk, isLoading: loadingRisk, isError: errRisk, refetch: refetchRisk } = useGetComplianceRiskReport();
  const riskList = Array.isArray(complianceRisk) ? complianceRisk : [];

  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<string[]>([]);
  const [serviceFilter, setServiceFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("riskStatus");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const serviceTypes = useMemo(() => {
    const names = new Set(riskList.map((r: any) => r.serviceTypeName as string));
    return Array.from(names).sort();
  }, [riskList]);

  const filtered = useMemo(() => {
    let rows = [...riskList];
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((r: any) => r.studentName?.toLowerCase().includes(q));
    }
    if (riskFilter.length > 0) {
      rows = rows.filter((r: any) => riskFilter.includes(r.riskStatus));
    }
    if (serviceFilter) {
      rows = rows.filter((r: any) => r.serviceTypeName === serviceFilter);
    }
    rows.sort((a: any, b: any) => {
      let cmp = 0;
      switch (sortKey) {
        case "studentName": cmp = (a.studentName ?? "").localeCompare(b.studentName ?? ""); break;
        case "serviceTypeName": cmp = (a.serviceTypeName ?? "").localeCompare(b.serviceTypeName ?? ""); break;
        case "riskStatus": cmp = riskPriority(a.riskStatus) - riskPriority(b.riskStatus); break;
        case "deliveredMinutes": cmp = (a.deliveredMinutes ?? 0) - (b.deliveredMinutes ?? 0); break;
        case "percentComplete": cmp = (a.percentComplete ?? 0) - (b.percentComplete ?? 0); break;
        case "remainingMinutes": cmp = (a.remainingMinutes ?? 0) - (b.remainingMinutes ?? 0); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [riskList, search, riskFilter, serviceFilter, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggleRiskFilter(key: string) {
    setRiskFilter(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function clearFilters() {
    setSearch("");
    setRiskFilter([]);
    setServiceFilter("");
  }

  const hasFilters = search.trim() || riskFilter.length > 0 || serviceFilter;

  function exportRisk() {
    downloadCsv("at_risk_students.csv",
      ["Student", "Service", "Risk Status", "Delivered", "Required", "% Complete", "Remaining (min)"],
      filtered.map((r: any) => [
        r.studentName, r.serviceTypeName, r.riskStatus,
        String(r.deliveredMinutes), String(r.requiredMinutes),
        String(Math.round(r.percentComplete ?? 0)), String(r.remainingMinutes ?? 0),
      ]),
      { generatedAt: new Date().toISOString(), preparedBy: user.name }
    );
  }

  function ColHeader({ colKey, label }: { colKey: SortKey; label: string }) {
    return (
      <th
        className="text-left px-5 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-600 whitespace-nowrap"
        onClick={() => toggleSort(colKey)}
      >
        {label}<SortIcon col={colKey} sortKey={sortKey} dir={sortDir} />
      </th>
    );
  }

  return (
    <Card>
      {errRisk ? <ErrorBanner message="Failed to load compliance risk data." onRetry={() => refetchRisk()} /> : <>
      <div className="flex items-center justify-between px-5 py-2.5 bg-amber-50 border-b border-amber-100">
        <div className="flex items-center gap-2 text-xs text-amber-800">
          <FileBarChart className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Exportable summary table. For the full narrative risk report see{" "}
            <Link href="/compliance?tab=risk-report" className="font-semibold underline underline-offset-2 hover:text-amber-900">Compliance → Risk Report</Link>.
          </span>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-[12px] flex-shrink-0" onClick={exportRisk} disabled={filtered.length === 0}>
          <Download className="w-3.5 h-3.5" /> Export CSV
        </Button>
      </div>

      <div className="px-5 py-3 border-b border-gray-100 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search student…"
              className="h-8 pl-8 pr-8 text-[13px]"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <select
            value={serviceFilter}
            onChange={e => setServiceFilter(e.target.value)}
            className="h-8 text-[13px] border border-gray-200 rounded-md px-2 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400 max-w-[200px]"
          >
            <option value="">All services</option>
            {serviceTypes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {hasFilters && (
            <button onClick={clearFilters} className="text-[12px] text-gray-500 hover:text-gray-700 flex items-center gap-1 ml-1">
              <X className="w-3 h-3" /> Clear
            </button>
          )}

          <span className="ml-auto text-[12px] text-gray-400">
            {loadingRisk ? "Loading…" : `${filtered.length} of ${riskList.length} rows`}
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {RISK_FILTER_OPTIONS.map(opt => {
            const cfg = RISK_CONFIG[opt.key];
            const active = riskFilter.includes(opt.key);
            return (
              <button
                key={opt.key}
                onClick={() => toggleRiskFilter(opt.key)}
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border transition-all ${
                  active
                    ? `${cfg.bg} ${cfg.color} shadow-sm`
                    : "bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <ColHeader colKey="studentName" label="Student" />
              <ColHeader colKey="serviceTypeName" label="Service" />
              <ColHeader colKey="riskStatus" label="Risk Level" />
              <ColHeader colKey="deliveredMinutes" label="Delivered" />
              <ColHeader colKey="percentComplete" label="Progress" />
              <ColHeader colKey="remainingMinutes" label="Behind" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loadingRisk ? [...Array(10)].map((_, i) => (
              <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
            )) : filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-[13px] text-gray-400">
                  {hasFilters ? "No students match the current filters." : "No at-risk students found."}
                </td>
              </tr>
            ) : filtered.slice(0, 300).map((r: any, i: number) => {
              const cfg = RISK_CONFIG[r.riskStatus] ?? RISK_CONFIG.on_track;
              const pct = Math.min(100, r.percentComplete ?? 0);
              return (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/students/${r.studentId}`} className="text-[13px] font-medium text-gray-800 hover:text-emerald-700">
                      {r.studentName}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-gray-500 max-w-[140px] truncate">{r.serviceTypeName}</td>
                  <td className="px-5 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-gray-600 font-mono">{r.deliveredMinutes} / {r.requiredMinutes}</td>
                  <td className="px-5 py-3 w-28">
                    <div className="flex items-center gap-2">
                      <MiniProgressRing value={pct} size={24} strokeWidth={2.5} color={cfg.ringColor} />
                      <span className="text-[12px] font-bold text-gray-700">{pct}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-[12px] font-medium text-red-600">{r.remainingMinutes} min</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </>}
    </Card>
  );
}
