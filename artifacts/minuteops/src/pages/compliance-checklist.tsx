import { useState, useCallback } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { useSchoolContext } from "@/lib/school-context";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, XCircle, ChevronDown, ChevronRight,
  RefreshCw, Play, FileText, Users, BookOpen, Bell, ClipboardCheck,
  Filter,
} from "lucide-react";

interface ChecklistItem {
  key: string;
  label: string;
  status: "ok" | "warning" | "critical" | "info";
  detail: string;
  actionUrl?: string;
  actionLabel?: string;
  dueDate?: string;
  daysUntilDue?: number;
}

interface StudentChecklist {
  studentId: number;
  studentName: string;
  grade: string | null;
  schoolId: number | null;
  overallStatus: "ok" | "warning" | "critical";
  items: ChecklistItem[];
  criticalCount: number;
  warningCount: number;
}

const STATUS_CONFIG = {
  critical: {
    bg: "bg-red-50",
    border: "border-red-200",
    badge: "bg-red-100 text-red-700 border-red-200",
    icon: XCircle,
    iconClass: "text-red-500",
    label: "Critical",
    dot: "bg-red-500",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    badge: "bg-amber-100 text-amber-700 border-amber-200",
    icon: AlertTriangle,
    iconClass: "text-amber-500",
    label: "Warning",
    dot: "bg-amber-400",
  },
  ok: {
    bg: "bg-white",
    border: "border-gray-100",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    icon: CheckCircle2,
    iconClass: "text-emerald-500",
    label: "Compliant",
    dot: "bg-emerald-500",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    badge: "bg-blue-50 text-blue-600 border-blue-200",
    icon: Bell,
    iconClass: "text-blue-400",
    label: "Info",
    dot: "bg-blue-400",
  },
};

const ITEM_ICON: Record<string, any> = {
  iep: FileText,
  goal: BookOpen,
  accommodation: ClipboardCheck,
  progress: FileText,
  meeting: Users,
  annual: Users,
  pr_parent: Bell,
};

function itemIcon(key: string) {
  for (const prefix of ["iep", "goal", "accommodation", "progress", "meeting", "annual", "pr_parent"]) {
    if (key.startsWith(prefix)) return ITEM_ICON[prefix] ?? FileText;
  }
  return FileText;
}

function ChecklistRow({ checklist, defaultExpanded }: { checklist: StudentChecklist; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? checklist.overallStatus === "critical");
  const cfg = STATUS_CONFIG[checklist.overallStatus];
  const Icon = cfg.icon;

  const criticals = checklist.items.filter(i => i.status === "critical");
  const warnings = checklist.items.filter(i => i.status === "warning");
  const oks = checklist.items.filter(i => i.status === "ok" || i.status === "info");

  return (
    <div className={`rounded-xl border ${cfg.border} overflow-hidden transition-all`}>
      {/* Header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${cfg.bg} hover:brightness-[0.98] transition-all`}
      >
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
        <Link
          href={`/students/${checklist.studentId}`}
          onClick={e => e.stopPropagation()}
          className="text-[13px] font-semibold text-gray-800 hover:text-emerald-700 flex-1 text-left"
        >
          {checklist.studentName}
          {checklist.grade && (
            <span className="ml-2 text-[11px] font-normal text-gray-400">Grade {checklist.grade}</span>
          )}
        </Link>

        <div className="flex items-center gap-2 flex-shrink-0">
          {checklist.criticalCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-red-100 text-red-700 border-red-200">
              <XCircle className="w-3 h-3" /> {checklist.criticalCount}
            </span>
          )}
          {checklist.warningCount > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-amber-100 text-amber-700 border-amber-200">
              <AlertTriangle className="w-3 h-3" /> {checklist.warningCount}
            </span>
          )}
          {checklist.criticalCount === 0 && checklist.warningCount === 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="w-3 h-3" /> All clear
            </span>
          )}
          <span className="text-gray-300">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
        </div>
      </button>

      {/* Expandable items */}
      {expanded && (
        <div className="divide-y divide-gray-50 bg-white">
          {[...criticals, ...warnings, ...oks].map(item => {
            const s = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.ok;
            const ItemIcon = itemIcon(item.key);
            return (
              <div key={item.key} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50/60 transition-colors">
                <div className="mt-0.5 flex-shrink-0">
                  {item.status === "ok" || item.status === "info"
                    ? <CheckCircle2 className={`w-4 h-4 ${s.iconClass}`} />
                    : <s.icon className={`w-4 h-4 ${s.iconClass}`} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[12px] font-semibold text-gray-700">{item.label}</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${s.badge}`}>
                      {s.label}
                    </span>
                    {item.daysUntilDue !== undefined && item.daysUntilDue > 0 && (
                      <span className="text-[10px] text-gray-400">{item.daysUntilDue}d remaining</span>
                    )}
                    {item.daysUntilDue !== undefined && item.daysUntilDue <= 0 && (
                      <span className="text-[10px] text-red-500 font-medium">{Math.abs(item.daysUntilDue)}d overdue</span>
                    )}
                  </div>
                  <p className="text-[12px] text-gray-500 mt-0.5 leading-snug">{item.detail}</p>
                </div>
                {item.actionUrl && item.actionLabel && (
                  <Link
                    href={item.actionUrl}
                    className="flex-shrink-0 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {item.actionLabel}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ComplianceChecklist() {
  const { typedFilter } = useSchoolContext();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"all" | "critical" | "warning" | "ok">("all");
  const [runningAlerts, setRunningAlerts] = useState(false);
  const [alertResult, setAlertResult] = useState<{ created: number } | null>(null);

  const queryKey = ["compliance-checklist", typedFilter];

  const { data, isLoading, isError, refetch } = useQuery<StudentChecklist[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (typedFilter.schoolId) params.set("schoolId", String(typedFilter.schoolId));
      const res = await authFetch(`/api/compliance/checklist?${params}`);
      if (!res.ok) throw new Error("Failed to load checklist");
      return res.json();
    },
    staleTime: 60_000,
  });

  const checklists = data ?? [];

  const counts = checklists.reduce(
    (acc, c) => { acc[c.overallStatus] = (acc[c.overallStatus] ?? 0) + 1; return acc; },
    {} as Record<string, number>
  );

  const filtered = checklists.filter(c =>
    statusFilter === "all" || c.overallStatus === statusFilter
  );

  const runAlerts = useCallback(async () => {
    setRunningAlerts(true);
    setAlertResult(null);
    try {
      const res = await authFetch("/api/compliance/checklist/run-alerts", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setAlertResult(data);
        queryClient.invalidateQueries({ queryKey: ["alerts"] });
      }
    } finally {
      setRunningAlerts(false);
    }
  }, [queryClient]);

  const totalCritical = checklists.reduce((s, c) => s + c.criticalCount, 0);
  const totalWarning = checklists.reduce((s, c) => s + c.warningCount, 0);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1100px] mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Compliance Checklist</h1>
          <p className="text-xs text-gray-400 mt-1">
            IEP updates · progress reports · parent meetings · accommodations · goals
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
            className="text-[12px] gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={runAlerts}
            disabled={runningAlerts}
            className="text-[12px] gap-1.5 bg-emerald-600 hover:bg-emerald-700"
          >
            <Play className={`w-3.5 h-3.5 ${runningAlerts ? "animate-pulse" : ""}`} />
            {runningAlerts ? "Running…" : "Generate Alerts"}
          </Button>
        </div>
      </div>

      {alertResult && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-[13px] text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          {alertResult.created > 0
            ? `${alertResult.created} new alert${alertResult.created === 1 ? "" : "s"} generated and added to your Alerts center.`
            : "All alerts are up to date — no new alerts generated."}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {(["critical", "warning", "ok"] as const).map(s => {
          const cfg = STATUS_CONFIG[s];
          const Icon = cfg.icon;
          const count = counts[s] ?? 0;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
              className={`rounded-xl border p-4 text-left transition-all hover:shadow-sm ${
                statusFilter === s
                  ? `${cfg.border} ${cfg.bg} ring-2 ring-offset-1 ${s === "critical" ? "ring-red-300" : s === "warning" ? "ring-amber-300" : "ring-emerald-300"}`
                  : "border-gray-100 bg-white hover:border-gray-200"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${cfg.iconClass}`} />
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{cfg.label}</span>
              </div>
              <p className="text-2xl font-bold text-gray-800">{isLoading ? "—" : count}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">student{count === 1 ? "" : "s"}</p>
            </button>
          );
        })}
      </div>

      {/* Overall totals strip */}
      {!isLoading && (totalCritical > 0 || totalWarning > 0) && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-[12px] text-gray-600">
          <Filter className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span>
            {totalCritical > 0 && (
              <span className="text-red-600 font-semibold">{totalCritical} critical item{totalCritical === 1 ? "" : "s"}</span>
            )}
            {totalCritical > 0 && totalWarning > 0 && <span className="text-gray-300 mx-1.5">·</span>}
            {totalWarning > 0 && (
              <span className="text-amber-600 font-semibold">{totalWarning} warning{totalWarning === 1 ? "" : "s"}</span>
            )}
            {" "}across {checklists.length} student{checklists.length === 1 ? "" : "s"}.
            {" "}Use <span className="font-semibold">Generate Alerts</span> to push issues to the Alerts center.
          </span>
        </div>
      )}

      {/* Checklist list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : isError ? (
        <div className="py-16 text-center text-red-500 text-sm">Failed to load compliance checklist.</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
          <p className="text-gray-500 text-sm font-medium">
            {statusFilter === "all" ? "No students found." : `No students with "${STATUS_CONFIG[statusFilter].label}" status.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => (
            <ChecklistRow key={c.studentId} checklist={c} />
          ))}
        </div>
      )}
    </div>
  );
}
