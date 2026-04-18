import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useSchoolContext } from "@/lib/school-context";
import { RISK_CONFIG, RISK_PRIORITY_ORDER } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  AlertTriangle, Clock, TrendingDown, Users, Search,
  ArrowRight, CheckCircle2, CalendarPlus,
} from "lucide-react";

interface MinuteRow {
  serviceRequirementId: number;
  studentId: number;
  studentName: string;
  serviceTypeId: number;
  serviceTypeName: string;
  providerName: string | null;
  intervalType: string;
  requiredMinutes: number;
  deliveredMinutes: number;
  remainingMinutes: number;
  percentComplete: number;
  riskStatus: string;
  missedSessionsCount: number;
}

const PRIORITY_STATUSES = ["out_of_compliance", "at_risk", "slightly_behind"];

const STATUS_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  out_of_compliance: AlertTriangle,
  at_risk: TrendingDown,
  slightly_behind: Clock,
  on_track: CheckCircle2,
};

function minuteBar(delivered: number, required: number) {
  const pct = required > 0 ? Math.min(100, (delivered / required) * 100) : 0;
  const color =
    pct >= 90 ? "bg-emerald-500" :
    pct >= 75 ? "bg-amber-400" :
    pct >= 50 ? "bg-orange-400" :
    "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 tabular-nums w-8 text-right">{Math.round(pct)}%</span>
    </div>
  );
}

function SummaryBubble({
  status, count, label,
}: { status: string; count: number; label: string }) {
  const cfg = RISK_CONFIG[status] ?? RISK_CONFIG.on_track;
  const Icon = STATUS_ICON[status] ?? AlertTriangle;
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-4 h-4 shrink-0" />
      <span className="text-lg font-bold">{count}</span>
      <span className="text-xs font-normal opacity-80">{label}</span>
    </div>
  );
}

export default function MinutesOversightTab() {
  const { filterParams } = useSchoolContext();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const queryParams = new URLSearchParams();
  if (filterParams.schoolId) queryParams.set("schoolId", filterParams.schoolId);
  if (filterParams.districtId) queryParams.set("districtId", filterParams.districtId);

  const { data: rows, isLoading, isError } = useQuery<MinuteRow[]>({
    queryKey: ["minute-progress-scheduling", filterParams],
    queryFn: async () => {
      const r = await authFetch(`/api/minute-progress?${queryParams}`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60_000,
  });

  const allRows: MinuteRow[] = rows ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of allRows) c[r.riskStatus] = (c[r.riskStatus] ?? 0) + 1;
    return c;
  }, [allRows]);

  const needsAttention = useMemo(
    () => allRows.filter(r => PRIORITY_STATUSES.includes(r.riskStatus)),
    [allRows],
  );

  const filtered = useMemo(() => {
    const src = statusFilter === "all"
      ? needsAttention
      : needsAttention.filter(r => r.riskStatus === statusFilter);
    const q = search.trim().toLowerCase();
    return q
      ? src.filter(r =>
          r.studentName.toLowerCase().includes(q) ||
          r.serviceTypeName.toLowerCase().includes(q) ||
          (r.providerName ?? "").toLowerCase().includes(q),
        )
      : src;
  }, [needsAttention, statusFilter, search]);

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => {
      const oa = RISK_PRIORITY_ORDER.indexOf(a.riskStatus);
      const ob = RISK_PRIORITY_ORDER.indexOf(b.riskStatus);
      if (oa !== ob) return oa - ob;
      return b.remainingMinutes - a.remainingMinutes;
    }),
    [filtered],
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12 text-gray-400 text-sm">
        Could not load minute progress data. Check your connection and try again.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Service Minutes at Risk</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Students who need additional sessions scheduled this period to stay compliant.
          </p>
        </div>
        <Link href="/compliance" className="text-xs text-emerald-600 hover:text-emerald-700 flex items-center gap-1 font-medium shrink-0">
          View full compliance report <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <SummaryBubble status="out_of_compliance" count={counts.out_of_compliance ?? 0} label="out of compliance" />
        <SummaryBubble status="at_risk" count={counts.at_risk ?? 0} label="at risk" />
        <SummaryBubble status="slightly_behind" count={counts.slightly_behind ?? 0} label="slightly behind" />
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium bg-emerald-50 border-emerald-200 text-emerald-700">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="text-lg font-bold">{counts.on_track ?? 0}</span>
          <span className="text-xs font-normal opacity-80">on track</span>
        </div>
      </div>

      {needsAttention.length === 0 && (
        <div className="text-center py-16">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">All students are on track</p>
          <p className="text-xs text-gray-400 mt-1">No students need priority scheduling right now.</p>
        </div>
      )}

      {needsAttention.length > 0 && (
        <>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Search student, service, or provider…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {[
                { key: "all", label: "All" },
                { key: "out_of_compliance", label: "Out of Compliance" },
                { key: "at_risk", label: "At Risk" },
                { key: "slightly_behind", label: "Behind" },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setStatusFilter(opt.key)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    statusFilter === opt.key
                      ? "bg-gray-800 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-gray-400">
            Showing {sorted.length} of {needsAttention.length} students needing attention
          </div>

          <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
            {sorted.map(row => {
              const cfg = RISK_CONFIG[row.riskStatus] ?? RISK_CONFIG.on_track;
              return (
                <div key={row.serviceRequirementId} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 bg-white hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/students/${row.studentId}`}
                        className="text-sm font-semibold text-gray-800 hover:text-emerald-700 truncate"
                      >
                        {row.studentName}
                      </Link>
                      <Badge className={`text-xs shrink-0 border ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </Badge>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {row.serviceTypeName}
                      {row.providerName && <span className="ml-2 text-gray-400">· {row.providerName}</span>}
                      <span className="ml-2 text-gray-400">· {row.intervalType}</span>
                    </div>
                    <div className="mt-2">
                      {minuteBar(row.deliveredMinutes, row.requiredMinutes)}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:shrink-0">
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Shortfall</div>
                      <div className="text-sm font-bold text-red-600 tabular-nums">
                        {row.remainingMinutes > 0 ? `−${row.remainingMinutes} min` : "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Delivered</div>
                      <div className="text-sm font-medium text-gray-700 tabular-nums">
                        {row.deliveredMinutes}/{row.requiredMinutes}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Link
                        href={`/students/${row.studentId}`}
                        className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-800 whitespace-nowrap"
                      >
                        <Users className="w-3.5 h-3.5" /> View
                      </Link>
                      <Link
                        href={`/scheduling?tab=schedule`}
                        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                      >
                        <CalendarPlus className="w-3.5 h-3.5" /> Schedule
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {sorted.length === 0 && search && (
            <div className="text-center py-8 text-gray-400 text-sm">
              No students match "{search}"
            </div>
          )}
        </>
      )}
    </div>
  );
}
