import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListAlerts, useListStudents, useGetComplianceDeadlines } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { useSchoolContext } from "@/lib/school-context";
import { RISK_CONFIG } from "@/lib/constants";
import {
  Search, AlertTriangle, Calendar, Users, FileSearch,
  CalendarDays, Clock, Shield, ArrowRight, Zap,
  CheckCircle2, Target, RefreshCw, ChevronRight,
  ShieldAlert, FileWarning, UserCheck, Inbox, ClipboardEdit,
} from "lucide-react";
import { QuickLogSheet } from "@/components/quick-log-sheet";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "urgent" | "thisweek" | "comingup";

interface WorkItem {
  id: string;
  priority: Priority;
  category: "compliance" | "iep" | "session" | "evaluation" | "meeting" | "transition" | "staffing";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  studentId?: number;
  studentName?: string;
  href: string;
  actionLabel: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function alertTypeLabel(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function alertToWorkItem(a: any, index: number): WorkItem {
  const priority: Priority =
    a.severity === "critical" || a.severity === "high" ? "urgent"
    : a.severity === "medium" ? "thisweek"
    : "comingup";

  const href = (() => {
    if (a.studentId && (a.type === "iep_expiring" || a.type === "iep_expired" || a.type === "missing_iep" || a.type === "evaluation_overdue")) return `/students/${a.studentId}`;
    if (a.type === "service_minutes_behind" || a.type === "service_gap" || a.type === "missed_sessions" || a.type === "behind_on_minutes" || a.type === "projected_shortfall") return a.studentId ? `/compliance?tab=minutes` : "/compliance";
    if (a.type === "restraint_review" || a.type === "incident_follow_up") return "/protective-measures";
    if (a.type === "overdue_session_log") return "/sessions";
    if (a.studentId) return `/students/${a.studentId}`;
    return "/alerts";
  })();

  const icon = (() => {
    if (a.type?.includes("iep")) return FileWarning;
    if (a.type?.includes("session") || a.type?.includes("minutes") || a.type?.includes("shortfall") || a.type?.includes("gap")) return Clock;
    if (a.type?.includes("evaluation")) return FileSearch;
    if (a.type?.includes("restraint") || a.type?.includes("incident")) return ShieldAlert;
    return AlertTriangle;
  })();

  return {
    id: `alert-${a.id ?? index}`,
    priority,
    category: a.type?.includes("iep") || a.type?.includes("evaluation") ? "iep"
      : a.type?.includes("session") || a.type?.includes("minute") ? "compliance"
      : "compliance",
    icon,
    title: a.studentName ? `${a.studentName} — ${alertTypeLabel(a.type ?? "Alert")}` : alertTypeLabel(a.type ?? "Alert"),
    detail: a.message ?? a.description ?? `Severity: ${a.severity}`,
    studentId: a.studentId,
    studentName: a.studentName,
    href,
    actionLabel: "View →",
  };
}

function riskToWorkItem(r: any): WorkItem {
  const pct = Math.round(r.percentComplete ?? 0);
  const priority: Priority =
    r.riskStatus === "out_of_compliance" ? "urgent"
    : r.riskStatus === "at_risk" ? "urgent"
    : "thisweek";
  return {
    id: `risk-${r.studentId}`,
    priority,
    category: "compliance",
    icon: Shield,
    title: `${r.studentName} — Service minutes behind`,
    detail: `${pct}% delivered (${r.shortfallMinutes ?? 0} min short) · ${r.service ?? ""}`,
    studentId: r.studentId,
    studentName: r.studentName,
    href: `/compliance?tab=minutes`,
    actionLabel: "Review minutes →",
  };
}

function deadlineToWorkItem(d: any, index: number): WorkItem | null {
  const days: number = d.daysUntilDue ?? d.daysRemaining ?? 999;
  const priority: Priority =
    days < 0 ? "urgent"
    : days <= 14 ? "thisweek"
    : days <= 60 ? "comingup"
    : null as any;
  if (!priority) return null;

  const overdue = days < 0;
  const name = d.studentName ?? "Student";
  const typeLabel = (d.eventType ?? "").replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

  return {
    id: `deadline-${index}`,
    priority,
    category: "iep",
    icon: CalendarDays,
    title: `${name} — ${typeLabel}`,
    detail: overdue
      ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`
      : `Due in ${days} day${days === 1 ? "" : "s"}`,
    studentId: d.studentId,
    studentName: name,
    href: `/compliance?tab=timeline`,
    actionLabel: "IEP Timeline →",
  };
}

// ─── Student Search ───────────────────────────────────────────────────────────

function StudentSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { filterParams } = useSchoolContext();

  const { data: studentsRaw, isLoading } = useListStudents({
    ...filterParams,
    limit: 500,
    status: "active",
  } as any);
  const students: any[] = Array.isArray(studentsRaw) ? studentsRaw : [];

  const matches = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return students
      .filter(s => {
        const full = `${s.firstName ?? ""} ${s.lastName ?? ""}`.toLowerCase();
        const id = String(s.externalId ?? "");
        return full.includes(q) || id.includes(q);
      })
      .slice(0, 8);
  }, [query, students]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleChange(v: string) {
    setQuery(v);
    setOpen(v.length >= 2);
  }

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <Input
          placeholder="Search students by name or ID…"
          value={query}
          onChange={e => handleChange(e.target.value)}
          onFocus={() => query.length >= 2 && setOpen(true)}
          className="pl-9 h-10 text-sm bg-white border-gray-200 shadow-sm focus:ring-emerald-500 focus:border-emerald-500"
        />
        {isLoading && <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-300 animate-spin" />}
      </div>

      {open && matches.length > 0 && (
        <div className="absolute z-50 mt-1.5 w-full bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden">
          {matches.map(s => {
            const name = `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() || `Student ${s.id}`;
            const risk = s.riskStatus ?? s.complianceStatus ?? null;
            const cfg = risk ? (RISK_CONFIG[risk] ?? null) : null;
            return (
              <Link
                key={s.id}
                href={`/students/${s.id}`}
                onClick={() => { setOpen(false); setQuery(""); }}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0"
              >
                <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[11px] font-bold text-emerald-700">
                    {(s.firstName?.[0] ?? "") + (s.lastName?.[0] ?? "")}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-gray-800 truncate">{name}</div>
                  <div className="text-[11px] text-gray-400 truncate">
                    {[s.grade ? `Grade ${s.grade}` : null, s.schoolName ?? s.school ?? null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                {cfg && (
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} flex-shrink-0`}>
                    {cfg.label}
                  </span>
                )}
                <ChevronRight className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
              </Link>
            );
          })}
          <Link
            href={`/students?search=${encodeURIComponent(query)}`}
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1.5 px-4 py-2 text-[12px] text-emerald-700 font-medium hover:bg-emerald-50 transition-colors"
          >
            <Search className="w-3 h-3" /> See all results in Students
          </Link>
        </div>
      )}

      {open && query.length >= 2 && matches.length === 0 && !isLoading && (
        <div className="absolute z-50 mt-1.5 w-full bg-white rounded-lg border border-gray-200 shadow-lg p-4 text-center text-[13px] text-gray-400">
          No students found for "{query}"
        </div>
      )}
    </div>
  );
}

// ─── Work Item Row ─────────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<Priority, { border: string; iconBg: string; iconColor: string }> = {
  urgent:    { border: "border-l-red-400",    iconBg: "bg-red-50",    iconColor: "text-red-500" },
  thisweek:  { border: "border-l-amber-400",  iconBg: "bg-amber-50",  iconColor: "text-amber-500" },
  comingup:  { border: "border-l-gray-200",   iconBg: "bg-gray-50",   iconColor: "text-gray-400" },
};

function WorkItemRow({ item, onLogSession }: { item: WorkItem; onLogSession?: (studentId: number, studentName: string) => void }) {
  const style = PRIORITY_STYLES[item.priority];
  const Icon = item.icon;
  const showLogBtn = !!onLogSession && !!item.studentId && (item.category === "compliance" || item.category === "session");

  return (
    <div className={`flex items-start gap-3 p-3.5 rounded-lg border border-l-4 border-gray-100 bg-white ${style.border} hover:bg-gray-50/50 transition-colors`}>
      <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${style.iconBg}`}>
        <Icon className={`w-3.5 h-3.5 ${style.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-gray-800 leading-tight">
          {item.studentId ? (
            <>
              <Link href={`/students/${item.studentId}`} className="hover:text-emerald-700 underline underline-offset-2 decoration-gray-300 hover:decoration-emerald-500">
                {item.studentName ?? "Student"}
              </Link>
              {item.title.includes("—") && (
                <span className="text-gray-500 font-normal"> — {item.title.split("—").slice(1).join("—").trim()}</span>
              )}
            </>
          ) : (
            item.title
          )}
        </div>
        <div className="text-[11px] text-gray-400 mt-0.5 leading-snug">{item.detail}</div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
        {showLogBtn && (
          <button
            onClick={() => onLogSession!(item.studentId!, item.studentName ?? "")}
            className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
            title="Log a session for this student"
          >
            <ClipboardEdit className="w-3 h-3" /> Log
          </button>
        )}
        <Link
          href={item.href}
          className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap flex items-center gap-0.5"
        >
          {item.actionLabel}
        </Link>
      </div>
    </div>
  );
}

// ─── Aggregate card for count-level items (meetings, evals) ──────────────────

function AggregateRow({
  icon: Icon, title, detail, href, actionLabel, priority,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail?: string;
  href: string;
  actionLabel: string;
  priority: Priority;
}) {
  const style = PRIORITY_STYLES[priority];
  return (
    <div className={`flex items-center gap-3 p-3.5 rounded-lg border border-l-4 border-gray-100 bg-white ${style.border} hover:bg-gray-50/50 transition-colors`}>
      <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${style.iconBg}`}>
        <Icon className={`w-3.5 h-3.5 ${style.iconColor}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-gray-800">{title}</div>
        {detail && <div className="text-[11px] text-gray-400 mt-0.5">{detail}</div>}
      </div>
      <Link href={href} className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap flex items-center gap-0.5 flex-shrink-0">
        {actionLabel}
      </Link>
    </div>
  );
}

// ─── Empty tab state ──────────────────────────────────────────────────────────

function EmptyTab({ tab }: { tab: Priority }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <CheckCircle2 className={`w-8 h-8 ${tab === "urgent" ? "text-emerald-400" : "text-gray-300"}`} />
      <p className="text-[14px] font-medium text-gray-600">
        {tab === "urgent" ? "Nothing urgent right now" : tab === "thisweek" ? "Clear for the week" : "Nothing planned yet"}
      </p>
      <p className="text-[12px] text-gray-400 max-w-xs">
        {tab === "urgent"
          ? "No critical alerts or out-of-compliance students detected."
          : tab === "thisweek"
          ? "No medium-priority items or upcoming deadlines within 14 days."
          : "IEP deadlines and low-priority items 15–60 days out will appear here."}
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TABS: { key: Priority; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "urgent",   label: "Urgent",    icon: Zap },
  { key: "thisweek", label: "This Week", icon: Target },
  { key: "comingup", label: "Coming Up", icon: Calendar },
];

export default function ActionCenter() {
  const [activeTab, setActiveTab] = useState<Priority>("urgent");
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogStudent, setQuickLogStudent] = useState<{ id: number; name: string } | null>(null);
  const { user } = useRole();

  function openQuickLog(studentId: number, studentName: string) {
    setQuickLogStudent({ id: studentId, name: studentName });
    setQuickLogOpen(true);
  }
  const { filterParams } = useSchoolContext();
  const params = useMemo(() => {
    const qs = new URLSearchParams(filterParams as any).toString();
    return qs ? `?${qs}` : "";
  }, [filterParams]);

  // ── Data fetches ──────────────────────────────────────────────────────────

  const { data: alertsRaw, isLoading: alertsLoading, refetch: refetchAlerts } = useListAlerts({
    ...filterParams,
    resolved: "false",
    snoozed: "false",
  } as any);
  const alertList: any[] = Array.isArray(alertsRaw) ? alertsRaw : [];

  const { data: deadlinesRaw, isLoading: deadlinesLoading } = useGetComplianceDeadlines(filterParams as any);
  const deadlineItems: any[] = useMemo(() => {
    const raw: unknown[] = Array.isArray(deadlinesRaw) ? deadlinesRaw : ((deadlinesRaw as any)?.events ?? []);
    return raw as any[];
  }, [deadlinesRaw]);

  const { data: riskReport, isLoading: riskLoading } = useQuery({
    queryKey: ["action-center/risk", filterParams],
    queryFn: async () => {
      const r = await authFetch(`/api/reports/compliance-risk-report${params}`);
      if (!r.ok) return null;
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: evalDash, isLoading: evalLoading } = useQuery({
    queryKey: ["action-center/evals"],
    queryFn: () => authFetch("/api/evaluations/dashboard").then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });

  const { data: meetingDash, isLoading: meetingsLoading } = useQuery({
    queryKey: ["action-center/meetings"],
    queryFn: () => authFetch("/api/iep-meetings/dashboard").then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });

  const { data: transitionDash } = useQuery({
    queryKey: ["action-center/transitions"],
    queryFn: () => authFetch("/api/transitions/dashboard").then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });

  const isLoading = alertsLoading || deadlinesLoading || riskLoading || evalLoading || meetingsLoading;

  // ── Build work items ──────────────────────────────────────────────────────

  const allItems = useMemo(() => {
    const items: WorkItem[] = [];

    // 1. Alerts → individual work items
    for (let i = 0; i < alertList.length; i++) {
      items.push(alertToWorkItem(alertList[i], i));
    }

    // 2. Risk report: needsAttention students not already covered by an alert
    const alertStudentIds = new Set(alertList.filter(a => a.studentId).map(a => a.studentId));
    const needsAttention: any[] = riskReport?.needsAttention ?? [];
    // Dedupe by studentId, keep worst row per student
    const byStudent = new Map<number, any>();
    for (const r of needsAttention) {
      const cur = byStudent.get(r.studentId);
      if (!cur || (r.percentComplete ?? 100) < (cur.percentComplete ?? 100)) byStudent.set(r.studentId, r);
    }
    for (const r of byStudent.values()) {
      if (!alertStudentIds.has(r.studentId) && r.riskStatus !== "on_track") {
        const item = riskToWorkItem(r);
        if (item) items.push(item);
      }
    }

    // 3. Compliance deadlines → individual items
    deadlineItems.forEach((d, i) => {
      const item = deadlineToWorkItem(d, i);
      if (item) items.push(item);
    });

    return items;
  }, [alertList, riskReport, deadlineItems]);

  // ── Aggregate items (count-level, not student-level) ──────────────────────

  type AggItem = Parameters<typeof AggregateRow>[0];

  const aggregateItems = useMemo(() => {
    const agg: (AggItem & { priority: Priority })[] = [];

    if (meetingDash?.overdueCount > 0) {
      agg.push({ icon: CalendarDays, priority: "urgent", title: `${meetingDash.overdueCount} overdue IEP meeting${meetingDash.overdueCount !== 1 ? "s" : ""}`, detail: "Meetings that have passed without a completion record", href: "/iep-meetings", actionLabel: "IEP Meetings →" });
    }
    if (evalDash?.overdueEvaluations > 0) {
      agg.push({ icon: FileSearch, priority: "urgent", title: `${evalDash.overdueEvaluations} overdue evaluation${evalDash.overdueEvaluations !== 1 ? "s" : ""}`, detail: "60-day evaluation timeline exceeded", href: "/evaluations", actionLabel: "Evaluations →" });
    }
    if (evalDash?.overdueReEvaluations > 0) {
      agg.push({ icon: FileSearch, priority: "urgent", title: `${evalDash.overdueReEvaluations} overdue re-evaluation${evalDash.overdueReEvaluations !== 1 ? "s" : ""}`, detail: "3-year re-evaluation window exceeded", href: "/evaluations", actionLabel: "Evaluations →" });
    }
    if (transitionDash?.missingPlan > 0) {
      agg.push({ icon: ArrowRight, priority: "urgent", title: `${transitionDash.missingPlan} student${transitionDash.missingPlan !== 1 ? "s" : ""} missing transition plan`, detail: "Required for students 14+ under IDEA", href: "/transitions", actionLabel: "Transitions →" });
    }
    if (transitionDash?.overdueFollowups > 0) {
      agg.push({ icon: ArrowRight, priority: "urgent", title: `${transitionDash.overdueFollowups} overdue transition follow-up${transitionDash.overdueFollowups !== 1 ? "s" : ""}`, href: "/transitions", actionLabel: "Transitions →", priority: "urgent" } as any);
    }
    if (meetingDash?.thisWeekCount > 0) {
      agg.push({ icon: CalendarDays, priority: "thisweek", title: `${meetingDash.thisWeekCount} IEP meeting${meetingDash.thisWeekCount !== 1 ? "s" : ""} this week`, detail: "Coming up — ensure rooms, consent, and staff are set", href: "/iep-meetings", actionLabel: "IEP Meetings →" });
    }
    if (meetingDash?.pendingConsentCount > 0) {
      agg.push({ icon: UserCheck, priority: "thisweek", title: `${meetingDash.pendingConsentCount} meeting${meetingDash.pendingConsentCount !== 1 ? "s" : ""} pending parent consent`, href: "/iep-meetings", actionLabel: "IEP Meetings →" });
    }
    if (evalDash?.openReferrals > 0) {
      agg.push({ icon: FileSearch, priority: "thisweek", title: `${evalDash.openReferrals} open evaluation referral${evalDash.openReferrals !== 1 ? "s" : ""}`, detail: "Clock is ticking — 60-day window has started", href: "/evaluations", actionLabel: "Evaluations →" });
    }
    if (evalDash?.upcomingReEvaluations > 0) {
      agg.push({ icon: FileSearch, priority: "comingup", title: `${evalDash.upcomingReEvaluations} re-evaluation${evalDash.upcomingReEvaluations !== 1 ? "s" : ""} due within 90 days`, href: "/evaluations", actionLabel: "Evaluations →" });
    }
    if (transitionDash?.approachingTransitionAge > 0) {
      agg.push({ icon: ArrowRight, priority: "comingup", title: `${transitionDash.approachingTransitionAge} student${transitionDash.approachingTransitionAge !== 1 ? "s" : ""} approaching transition age`, href: "/transitions", actionLabel: "Transitions →" });
    }

    return agg;
  }, [meetingDash, evalDash, transitionDash]);

  // ── Tab counts ────────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const c = { urgent: 0, thisweek: 0, comingup: 0 };
    for (const item of allItems) c[item.priority]++;
    for (const agg of aggregateItems) c[agg.priority]++;
    return c;
  }, [allItems, aggregateItems]);

  // ── Visible items for active tab ──────────────────────────────────────────

  const visibleItems = useMemo(() => allItems.filter(i => i.priority === activeTab), [allItems, activeTab]);
  const visibleAgg = useMemo(() => aggregateItems.filter(i => i.priority === activeTab), [aggregateItems, activeTab]);

  // ── Greeting ──────────────────────────────────────────────────────────────

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  }, []);

  const firstName = user?.name?.split(" ")[0] ?? "";

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[900px] mx-auto space-y-5 md:space-y-6">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">
            {greeting}{firstName ? `, ${firstName}` : ""}
          </h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            Here's what needs your attention today.
          </p>
        </div>
        <button
          onClick={() => refetchAlerts()}
          className="flex items-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors mt-1"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* ── Student Search ── */}
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Student lookup</p>
        <StudentSearch />
      </div>

      {/* ── Priority stat pills ── */}
      <div className="grid grid-cols-3 gap-3">
        {TABS.map(t => {
          const count = counts[t.key];
          const active = activeTab === t.key;
          const color =
            t.key === "urgent" ? (active ? "bg-red-600 text-white ring-red-200" : "bg-red-50 text-red-700 ring-red-100 hover:bg-red-100")
            : t.key === "thisweek" ? (active ? "bg-amber-500 text-white ring-amber-200" : "bg-amber-50 text-amber-700 ring-amber-100 hover:bg-amber-100")
            : active ? "bg-gray-700 text-white ring-gray-200" : "bg-gray-50 text-gray-600 ring-gray-100 hover:bg-gray-100";
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl ring-1 transition-all ${color}`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-xl md:text-2xl font-bold leading-tight">{isLoading ? "—" : count}</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Work Queue ── */}
      <div className="space-y-2">
        {/* Tab bar */}
        <div className="flex gap-0 border-b border-gray-200">
          {TABS.map(t => {
            const count = counts[t.key];
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
                  activeTab === t.key
                    ? "border-emerald-600 text-emerald-700"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                {t.label}
                {count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    activeTab === t.key
                      ? t.key === "urgent" ? "bg-red-100 text-red-700"
                        : t.key === "thisweek" ? "bg-amber-100 text-amber-700"
                        : "bg-gray-200 text-gray-600"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Items */}
        {isLoading ? (
          <div className="space-y-2 pt-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 p-3.5 rounded-lg border border-gray-100 bg-white">
                <Skeleton className="w-7 h-7 rounded-md flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : visibleItems.length === 0 && visibleAgg.length === 0 ? (
          <EmptyTab tab={activeTab} />
        ) : (
          <div className="space-y-2 pt-1">
            {/* Aggregate count-level items first */}
            {visibleAgg.map((agg, i) => (
              <AggregateRow key={`agg-${i}`} {...agg} />
            ))}
            {/* Per-student/per-alert items */}
            {visibleItems.map(item => (
              <WorkItemRow key={item.id} item={item} onLogSession={openQuickLog} />
            ))}
          </div>
        )}
      </div>

      <QuickLogSheet
        isOpen={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        onSuccess={() => { setQuickLogOpen(false); refetchAlerts(); }}
        staffId={null}
        prefillStudentId={quickLogStudent?.id}
        prefillStudentName={quickLogStudent?.name}
      />

      {/* ── Quick links footer ── */}
      <div className="pt-2 border-t border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Jump to</p>
        <div className="flex flex-wrap gap-2">
          {[
            { href: "/compliance", label: "Compliance" },
            { href: "/alerts", label: "All Alerts" },
            { href: "/reports?tab=risk", label: "At-Risk Export" },
            { href: "/iep-meetings", label: "IEP Meetings" },
            { href: "/evaluations", label: "Evaluations" },
            { href: "/sessions", label: "Sessions" },
            { href: "/compensatory-services", label: "Compensatory" },
            { href: "/transitions", label: "Transitions" },
            { href: "/parent-communication", label: "Parent Comms" },
          ].map(l => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[11px] font-medium px-3 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
