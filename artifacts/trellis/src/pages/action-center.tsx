import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useListAlerts, useListStudents, useGetComplianceDeadlines } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useSearch, useLocation } from "wouter";
import AlertsView from "@/pages/alerts";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { useSchoolContext } from "@/lib/school-context";
import { RISK_CONFIG } from "@/lib/constants";
import {
  Search, AlertTriangle, Calendar, Users, FileSearch,
  CalendarDays, Clock, Shield, ArrowRight, Zap,
  CheckCircle2, Target, RefreshCw, ChevronRight,
  ShieldAlert, FileWarning, UserCheck, Inbox, ClipboardEdit,
  CalendarX2, X, BellOff, EyeOff, Undo2, ChevronDown, ChevronUp,
  Bell,
} from "lucide-react";
import { QuickLogSheet } from "@/components/quick-log-sheet";

// ─── Types ────────────────────────────────────────────────────────────────────

type Priority = "urgent" | "thisweek" | "comingup";

interface WorkItem {
  id: string;
  priority: Priority;
  category: "compliance" | "iep" | "session" | "evaluation" | "meeting" | "transition" | "staffing" | "schedule";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
  studentId?: number;
  studentName?: string;
  href: string;
  actionLabel: string;
  logSession?: boolean;
}

// ─── Schedule-gap helpers ─────────────────────────────────────────────────────

/** Approximate weeks remaining in the school year (Sep → Jun 15). */
function weeksRemainingInSchoolYear(): number {
  const today = new Date();
  const yearEnd = new Date(today.getFullYear(), 5, 15); // June 15
  if (yearEnd < today) {
    // Past June 15 — next school year end
    yearEnd.setFullYear(today.getFullYear() + 1);
  }
  const ms = yearEnd.getTime() - today.getTime();
  return Math.max(1, Math.round(ms / (7 * 24 * 60 * 60 * 1000)));
}

/** Parse "HH:MM" or "HH:MM:SS" → minutes since midnight. */
function timeToMins(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

interface SchedGapInput {
  studentId: number;
  studentName: string;
  serviceTypeId: number;
  serviceTypeName: string;
  riskStatus: string;
  remainingMinutes: number;
}

function scheduleGapToWorkItem(
  mp: SchedGapInput,
  weeklyScheduledMinutes: number,
  weeksLeft: number,
): WorkItem {
  const isNone = weeklyScheduledMinutes === 0;
  const projectedShortfallPerWeek = isNone
    ? Math.ceil(mp.remainingMinutes / weeksLeft)
    : Math.ceil(mp.remainingMinutes / weeksLeft - weeklyScheduledMinutes);

  const priority: Priority =
    mp.riskStatus === "out_of_compliance" || mp.riskStatus === "at_risk" ? "urgent" : "thisweek";

  const detail = isNone
    ? `No sessions scheduled · ${mp.remainingMinutes} min still needed · ${mp.serviceTypeName}`
    : `${weeklyScheduledMinutes} min/wk scheduled · needs +${projectedShortfallPerWeek} min/wk more · ${mp.serviceTypeName}`;

  return {
    id: `schedule-gap-${mp.studentId}-${mp.serviceTypeId}`,
    priority,
    category: "schedule",
    icon: CalendarX2,
    title: `${mp.studentName} — Schedule falls short of IEP minutes`,
    detail,
    studentId: mp.studentId,
    studentName: mp.studentName,
    href: "/scheduling?tab=schedule",
    actionLabel: "Fix Schedule →",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function alertTypeLabel(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function alertCategory(type: string): WorkItem["category"] {
  if (!type) return "compliance";
  if (type === "evaluation_overdue" || type.includes("re_eval") || type.includes("reevaluation")) return "evaluation";
  if (type.includes("iep") && !type.includes("minutes")) return "iep";
  if (type === "overdue_session_log" || type === "missed_sessions") return "session";
  if (type === "behind_on_minutes" || type === "projected_shortfall" || type === "service_minutes_behind" || type === "service_gap") return "compliance";
  if (type.includes("restraint") || type.includes("incident")) return "compliance";
  return "compliance";
}

function alertToWorkItem(a: any, index: number): WorkItem {
  const priority: Priority =
    a.severity === "critical" || a.severity === "high" ? "urgent"
    : a.severity === "medium" ? "thisweek"
    : "comingup";

  const href = (() => {
    if (a.type === "evaluation_overdue" || a.type?.includes("re_eval")) return a.studentId ? `/students/${a.studentId}` : "/evaluations";
    if (a.studentId && (a.type === "iep_expiring" || a.type === "iep_expired" || a.type === "missing_iep")) return `/students/${a.studentId}`;
    if (a.type === "service_minutes_behind" || a.type === "service_gap" || a.type === "behind_on_minutes" || a.type === "projected_shortfall") return `/compliance?tab=minutes`;
    if (a.type === "missed_sessions") return a.studentId ? `/sessions?studentId=${a.studentId}` : "/sessions";
    if (a.type === "restraint_review" || a.type === "incident_follow_up") return "/protective-measures";
    if (a.type === "overdue_session_log") return a.studentId ? `/sessions?studentId=${a.studentId}` : "/sessions";
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

  const isShortfallType =
    a.type === "behind_on_minutes" ||
    a.type === "projected_shortfall" ||
    a.type === "service_minutes_behind" ||
    a.type === "missed_sessions";

  return {
    id: `alert-${a.id ?? index}`,
    priority,
    category: alertCategory(a.type ?? ""),
    icon,
    title: a.studentName ? `${a.studentName} — ${alertTypeLabel(a.type ?? "Alert")}` : alertTypeLabel(a.type ?? "Alert"),
    detail: a.message ?? a.description ?? `Severity: ${a.severity}`,
    studentId: a.studentId,
    studentName: a.studentName,
    href,
    actionLabel: "View →",
    logSession: isShortfallType && !!a.studentId,
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
    logSession: !!r.studentId,
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

// ─── Dismiss / snooze persistence ─────────────────────────────────────────────

// Default TTL for a "Dismiss" (×) — auto-restores after this many days so a
// permanently-handled item doesn't permanently disappear if the underlying
// alert recurs. Snooze choices override this with their own duration.
const DISMISS_DEFAULT_TTL_DAYS = 7;

interface HiddenEntry {
  expiresAt: number;       // unix ms; Number.POSITIVE_INFINITY ⇒ never
  reason: "dismissed" | "snoozed";
  durationLabel: string;   // e.g. "1 day", "3 days", "dismissed"
  hiddenAt: number;        // unix ms
  snapshot: { title: string; detail: string };
}

type HiddenMap = Record<string, HiddenEntry>;

function lsKeyForUser(userKey: string): string {
  return `trellis:action-center:hidden:${userKey}`;
}

function readHidden(userKey: string): HiddenMap {
  try {
    const raw = localStorage.getItem(lsKeyForUser(userKey));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    // Re-hydrate Infinity (JSON.stringify turns it into null)
    for (const k of Object.keys(parsed)) {
      const e = parsed[k];
      if (e && (e.expiresAt === null || e.expiresAt === undefined)) {
        e.expiresAt = Number.POSITIVE_INFINITY;
      }
    }
    return parsed as HiddenMap;
  } catch {
    return {};
  }
}

function writeHidden(userKey: string, map: HiddenMap) {
  try {
    // Replace Infinity with null for JSON; readHidden re-hydrates.
    const replacer = (_k: string, v: unknown) =>
      typeof v === "number" && !isFinite(v) ? null : v;
    localStorage.setItem(lsKeyForUser(userKey), JSON.stringify(map, replacer));
  } catch {}
}

function useHiddenItems(userKey: string) {
  const [hidden, setHidden] = useState<HiddenMap>(() => readHidden(userKey));

  // Re-load when the user changes
  useEffect(() => { setHidden(readHidden(userKey)); }, [userKey]);

  // Drop expired entries on mount and on a periodic tick so items reappear
  // automatically when their snooze/TTL elapses.
  useEffect(() => {
    function prune() {
      const now = Date.now();
      setHidden(prev => {
        let changed = false;
        const next: HiddenMap = {};
        for (const [k, v] of Object.entries(prev)) {
          if (v.expiresAt > now) next[k] = v;
          else changed = true;
        }
        if (changed) writeHidden(userKey, next);
        return changed ? next : prev;
      });
    }
    prune();
    const t = setInterval(prune, 60_000);
    return () => clearInterval(t);
  }, [userKey]);

  const hide = useCallback((id: string, durationMs: number, reason: "dismissed" | "snoozed", durationLabel: string, snapshot: { title: string; detail: string }) => {
    setHidden(prev => {
      const next: HiddenMap = {
        ...prev,
        [id]: {
          expiresAt: isFinite(durationMs) ? Date.now() + durationMs : Number.POSITIVE_INFINITY,
          reason,
          durationLabel,
          hiddenAt: Date.now(),
          snapshot,
        },
      };
      writeHidden(userKey, next);
      return next;
    });
  }, [userKey]);

  const restore = useCallback((id: string) => {
    setHidden(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      writeHidden(userKey, next);
      return next;
    });
  }, [userKey]);

  const restoreAll = useCallback(() => {
    setHidden({});
    writeHidden(userKey, {});
  }, [userKey]);

  return { hidden, hide, restore, restoreAll };
}

// ─── Work Item Row ─────────────────────────────────────────────────────────────

const PRIORITY_STYLES: Record<Priority, { border: string; iconBg: string; iconColor: string }> = {
  urgent:    { border: "border-l-red-400",    iconBg: "bg-red-50",    iconColor: "text-red-500" },
  thisweek:  { border: "border-l-amber-400",  iconBg: "bg-amber-50",  iconColor: "text-amber-500" },
  comingup:  { border: "border-l-gray-200",   iconBg: "bg-gray-50",   iconColor: "text-gray-400" },
};

const SNOOZE_OPTIONS: { label: string; ms: number }[] = [
  { label: "1 day",  ms: 1 * 24 * 60 * 60 * 1000 },
  { label: "3 days", ms: 3 * 24 * 60 * 60 * 1000 },
  { label: "7 days", ms: 7 * 24 * 60 * 60 * 1000 },
];

function WorkItemRow({
  item, onLogSession, onDismiss, onSnooze,
}: {
  item: WorkItem;
  onLogSession?: (studentId: number, studentName: string) => void;
  onDismiss?: (item: WorkItem) => void;
  onSnooze?: (item: WorkItem, durationMs: number, label: string) => void;
}) {
  const style = PRIORITY_STYLES[item.priority];
  const Icon = item.icon;
  const showLogSessionLink = !!item.logSession && !!item.studentId;
  const showLogBtn = !showLogSessionLink && !!onLogSession && !!item.studentId && (item.category === "compliance" || item.category === "session");
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const snoozeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!snoozeOpen) return;
    function onClick(e: MouseEvent) {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) setSnoozeOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [snoozeOpen]);

  return (
    <div
      className={`flex items-start gap-3 p-3.5 rounded-lg border border-l-4 border-gray-100 bg-white ${style.border} hover:bg-gray-50/50 transition-colors`}
      data-testid={`work-item-${item.id}`}
    >
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
        {showLogSessionLink && (
          <Link
            href={`/sessions?studentId=${item.studentId}&quicklog=true`}
            className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
            title="Open quick-log for this student"
          >
            <ClipboardEdit className="w-3 h-3" /> Log Session
          </Link>
        )}
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
        {onSnooze && (
          <div ref={snoozeRef} className="relative">
            <button
              onClick={() => setSnoozeOpen(o => !o)}
              className="flex items-center text-gray-300 hover:text-amber-600 transition-colors p-0.5"
              title="Snooze this item"
              aria-label="Snooze this item"
              data-testid={`button-snooze-${item.id}`}
            >
              <BellOff className="w-3.5 h-3.5" />
            </button>
            {snoozeOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-32 rounded-md border border-gray-200 bg-white shadow-lg py-1">
                <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Snooze for
                </div>
                {SNOOZE_OPTIONS.map(opt => (
                  <button
                    key={opt.label}
                    onClick={() => { onSnooze(item, opt.ms, opt.label); setSnoozeOpen(false); }}
                    className="w-full text-left px-2.5 py-1.5 text-[12px] text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                    data-testid={`button-snooze-${item.id}-${opt.label.replace(/\s+/g, "")}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {onDismiss && (
          <button
            onClick={() => onDismiss(item)}
            className="flex items-center text-gray-300 hover:text-gray-700 transition-colors p-0.5"
            title={`Dismiss (auto-restores in ${DISMISS_DEFAULT_TTL_DAYS} days)`}
            aria-label="Dismiss this item"
            data-testid={`button-dismiss-${item.id}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Hidden items footer ──────────────────────────────────────────────────────

function HiddenItemsFooter({
  hidden, onRestore, onRestoreAll,
}: {
  hidden: HiddenMap;
  onRestore: (id: string) => void;
  onRestoreAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const entries = useMemo(() =>
    Object.entries(hidden).sort(([, a], [, b]) => b.hiddenAt - a.hiddenAt),
    [hidden],
  );
  if (entries.length === 0) return null;

  function describeRemaining(ms: number): string {
    if (!isFinite(ms)) return "no auto-restore";
    if (ms <= 0) return "restoring…";
    const mins = Math.round(ms / 60_000);
    if (mins < 60) return `${mins}m left`;
    const hrs = Math.round(mins / 60);
    if (hrs < 48) return `${hrs}h left`;
    const days = Math.round(hrs / 24);
    return `${days}d left`;
  }

  const now = Date.now();

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60" data-testid="hidden-items-footer">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2 text-[12px] font-medium text-gray-600 hover:text-gray-800"
        data-testid="button-toggle-hidden-items"
      >
        <span className="flex items-center gap-1.5">
          <EyeOff className="w-3.5 h-3.5" />
          {entries.length} hidden item{entries.length === 1 ? "" : "s"}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-100">
          {entries.map(([id, e]) => (
            <div key={id} className="flex items-center gap-3 px-3.5 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-gray-700 truncate">{e.snapshot.title}</div>
                <div className="text-[10px] text-gray-400 truncate">
                  {e.reason === "snoozed" ? `Snoozed ${e.durationLabel}` : `Dismissed (${e.durationLabel})`}
                  {" · "}
                  {describeRemaining(e.expiresAt - now)}
                </div>
              </div>
              <button
                onClick={() => onRestore(id)}
                className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800"
                data-testid={`button-restore-${id}`}
              >
                <Undo2 className="w-3 h-3" /> Restore
              </button>
            </div>
          ))}
          <div className="px-3.5 py-2 flex justify-end">
            <button
              onClick={onRestoreAll}
              className="text-[11px] font-medium text-gray-500 hover:text-gray-700"
              data-testid="button-restore-all"
            >
              Restore all
            </button>
          </div>
        </div>
      )}
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

// Phase 2A: "alerts" is a tab inside Action Center that hosts the full
// Alerts management surface (formerly /alerts). The first three tabs are
// the existing priority-based work queue; the fourth swaps the body to
// the Alerts list view.
type TabKey = Priority | "alerts";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "urgent",   label: "Urgent",    icon: Zap },
  { key: "thisweek", label: "This Week", icon: Target },
  { key: "comingup", label: "Coming Up", icon: Calendar },
  { key: "alerts",   label: "Alerts",    icon: Bell },
];

const PRIORITY_TABS = TABS.filter(t => t.key !== "alerts");

function isTabKey(v: string | null): v is TabKey {
  return v === "urgent" || v === "thisweek" || v === "comingup" || v === "alerts";
}

type CategoryFilter = "all" | "compliance" | "iep" | "session" | "evaluation";

const CATEGORY_FILTERS: { key: CategoryFilter; label: string }[] = [
  { key: "all",        label: "All" },
  { key: "compliance", label: "Compliance" },
  { key: "iep",        label: "IEP" },
  { key: "session",    label: "Session" },
  { key: "evaluation", label: "Evaluation" },
];

export default function ActionCenter() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const initialTab: TabKey = (() => {
    const t = new URLSearchParams(search).get("tab");
    return isTabKey(t) ? t : "urgent";
  })();
  const [activeTab, setActiveTabState] = useState<TabKey>(initialTab);
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("all");
  // Sync with the URL so back/forward buttons restore the previously viewed tab.
  useEffect(() => {
    const t = new URLSearchParams(search).get("tab");
    if (isTabKey(t) && t !== activeTab) setActiveTabState(t);
  }, [search]);
  function setActiveTab(t: TabKey) {
    setActiveTabState(t);
    const next = new URLSearchParams(search);
    if (t === "urgent") next.delete("tab"); else next.set("tab", t);
    const qs = next.toString();
    navigate(`/action-center${qs ? `?${qs}` : ""}`, { replace: true });
  }
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogStudent, setQuickLogStudent] = useState<{ id: number; name: string } | null>(null);
  const { user, role } = useRole();

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

  // Schedule-gap analysis: fetch recurring blocks + minute progress
  const { data: scheduleBlocksRaw } = useQuery({
    queryKey: ["action-center/schedule-blocks", filterParams],
    queryFn: async () => {
      const qs = new URLSearchParams(filterParams as any).toString();
      const r = await authFetch(`/api/schedule-blocks${qs ? `?${qs}` : ""}`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 120_000,
  });

  const { data: minuteProgressRaw } = useQuery({
    queryKey: ["action-center/minute-progress", filterParams],
    queryFn: async () => {
      const qs = new URLSearchParams(filterParams as any).toString();
      const r = await authFetch(`/api/minute-progress${qs ? `?${qs}` : ""}`);
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 120_000,
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

    // 4. Schedule-gap analysis: identify students whose recurring schedule can't
    //    deliver enough minutes to close their IEP minute gap by year-end.
    const scheduleBlocks: any[] = Array.isArray(scheduleBlocksRaw) ? scheduleBlocksRaw : [];
    const minuteProgress: any[] = Array.isArray(minuteProgressRaw) ? minuteProgressRaw : [];

    if (scheduleBlocks.length > 0 || minuteProgress.length > 0) {
      // Build scheduled-minutes map: "studentId:serviceTypeId" → weekly minutes
      // (each dayOfWeek slot counts once — recurring weekly cadence)
      const scheduledMap = new Map<string, number>();
      for (const b of scheduleBlocks) {
        if (!b.studentId || !b.serviceTypeId || !b.startTime || !b.endTime) continue;
        const mins = timeToMins(b.endTime) - timeToMins(b.startTime);
        if (mins <= 0) continue;
        const key = `${b.studentId}:${b.serviceTypeId}`;
        scheduledMap.set(key, (scheduledMap.get(key) ?? 0) + mins);
      }

      const weeksLeft = weeksRemainingInSchoolYear();

      // Existing schedule-gap item IDs to avoid duplicates within this source
      const gapItemIds = new Set<string>();

      for (const mp of minuteProgress) {
        if (!mp.studentId || !mp.serviceTypeId) continue;
        // Only surface gaps for at-risk or out-of-compliance students
        if (mp.riskStatus === "on_track" || mp.riskStatus === "completed" || mp.riskStatus === "no_data") continue;
        const remainingMinutes = mp.remainingMinutes ?? 0;
        if (remainingMinutes <= 0) continue;

        const key = `${mp.studentId}:${mp.serviceTypeId}`;
        const itemId = `schedule-gap-${mp.studentId}-${mp.serviceTypeId}`;
        if (gapItemIds.has(itemId)) continue;

        const weeklyScheduled = scheduledMap.get(key) ?? 0;
        const projectedByYearEnd = weeklyScheduled * weeksLeft;

        // Only generate a gap item when there's a structural shortfall:
        // either nothing is scheduled, or the current pace can't close the gap
        if (weeklyScheduled === 0 || projectedByYearEnd < remainingMinutes) {
          gapItemIds.add(itemId);
          items.push(scheduleGapToWorkItem(
            {
              studentId: mp.studentId,
              studentName: mp.studentName ?? "Student",
              serviceTypeId: mp.serviceTypeId,
              serviceTypeName: mp.serviceTypeName ?? "Service",
              riskStatus: mp.riskStatus,
              remainingMinutes,
            },
            weeklyScheduled,
            weeksLeft,
          ));
        }
      }
    }

    return items;
  }, [alertList, riskReport, deadlineItems, scheduleBlocksRaw, minuteProgressRaw]);

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

  // ── Per-user dismiss / snooze state ───────────────────────────────────────
  // Scoped per user (not per district) via RoleContext — survives reload via
  // localStorage. Aggregate (count-level) items are intentionally not
  // dismissible per the product spec. RoleContext does not currently expose a
  // stable user id, so we combine role + display name to reduce the chance of
  // collisions when two demo personas share a browser. When the auth layer
  // exposes a stable user id, swap that in here.
  const userKey = `${role ?? "unknown"}::${user?.name?.trim() || "anonymous"}`;
  const { hidden, hide, restore, restoreAll } = useHiddenItems(userKey);

  const handleDismiss = useCallback((item: WorkItem) => {
    hide(
      item.id,
      DISMISS_DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000,
      "dismissed",
      `auto-restore in ${DISMISS_DEFAULT_TTL_DAYS}d`,
      { title: item.title, detail: item.detail },
    );
  }, [hide]);

  const handleSnooze = useCallback((item: WorkItem, durationMs: number, label: string) => {
    hide(item.id, durationMs, "snoozed", label, { title: item.title, detail: item.detail });
  }, [hide]);

  // Items that are still hidden right now (filter out anything already expired
  // on this render even before the next prune tick).
  const liveHidden = useMemo(() => {
    const now = Date.now();
    const out: HiddenMap = {};
    for (const [k, v] of Object.entries(hidden)) {
      if (v.expiresAt > now) out[k] = v;
    }
    return out;
  }, [hidden]);

  const filteredAllItems = useMemo(
    () => allItems.filter(i => !(i.id in liveHidden)),
    [allItems, liveHidden],
  );

  // ── Tab counts ────────────────────────────────────────────────────────────

  const counts = useMemo(() => {
    const c = { urgent: 0, thisweek: 0, comingup: 0 };
    for (const item of filteredAllItems) c[item.priority]++;
    for (const agg of aggregateItems) c[agg.priority]++;
    return c;
  }, [filteredAllItems, aggregateItems]);

  // ── Visible items for active tab ──────────────────────────────────────────

  const visibleItems = useMemo(() => {
    const byTab = filteredAllItems.filter(i => i.priority === activeTab);
    if (activeCategory === "all") return byTab;
    return byTab.filter(i => {
      if (activeCategory === "compliance") return i.category === "compliance" || i.category === "schedule";
      return i.category === activeCategory;
    });
  }, [filteredAllItems, activeTab, activeCategory]);

  const visibleAgg = useMemo(() => {
    if (activeCategory !== "all" && activeCategory !== "compliance") return [];
    return aggregateItems.filter(i => i.priority === activeTab);
  }, [aggregateItems, activeTab, activeCategory]);

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

      {/* ── Priority stat pills (only shown for the work-queue tabs) ── */}
      {activeTab !== "alerts" && (
      <div className="grid grid-cols-3 gap-3">
        {PRIORITY_TABS.map(t => {
          const count = counts[t.key as Priority];
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
      )}

      {/* ── Work Queue / Alerts ── */}
      <div className="space-y-2">
        {/* Tab bar — includes Alerts as a fourth tab (Phase 2A) */}
        <div className="flex gap-0 border-b border-gray-200">
          {TABS.map(t => {
            const count = t.key === "alerts" ? alertList.length : counts[t.key as Priority];
            return (
              <button
                key={t.key}
                onClick={() => { setActiveTab(t.key); setActiveCategory("all"); }}
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
                        : t.key === "alerts" ? "bg-emerald-100 text-emerald-700"
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

        {activeTab === "alerts" ? (
          /* Alerts tab — render the full Alerts management surface inline.
             AlertsView is the existing /alerts page component; it owns its own
             header, filters and list/snooze/resolve UI. */
          <div className="pt-2"><AlertsView embedded /></div>
        ) : (
          <>
            {/* Category filter chips */}
            {!isLoading && (
              <div className="flex gap-1.5 flex-wrap pt-1" data-testid="category-filter-bar">
                {CATEGORY_FILTERS.map(f => (
                  <button
                    key={f.key}
                    onClick={() => setActiveCategory(f.key)}
                    data-testid={`category-filter-${f.key}`}
                    aria-pressed={activeCategory === f.key}
                    className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-colors ${
                      activeCategory === f.key
                        ? "bg-gray-800 text-white border-gray-800"
                        : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}

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
              activeCategory !== "all" ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <CheckCircle2 className="w-7 h-7 text-gray-300" />
                  <p className="text-[13px] font-medium text-gray-500">No {activeCategory} items in this priority</p>
                  <button onClick={() => setActiveCategory("all")} className="text-[12px] text-emerald-700 underline">Show all</button>
                </div>
              ) : (
                <EmptyTab tab={activeTab as Priority} />
              )
            ) : (
              <div className="space-y-2 pt-1">
                {/* Aggregate count-level items first */}
                {visibleAgg.map((agg, i) => (
                  <AggregateRow key={`agg-${i}`} {...agg} />
                ))}
                {/* Per-student/per-alert items */}
                {visibleItems.map(item => (
                  <WorkItemRow
                    key={item.id}
                    item={item}
                    onLogSession={openQuickLog}
                    onDismiss={handleDismiss}
                    onSnooze={handleSnooze}
                  />
                ))}
              </div>
            )}

            {/* Hidden items footer — restore dismissed/snoozed items */}
            <HiddenItemsFooter hidden={liveHidden} onRestore={restore} onRestoreAll={restoreAll} />
          </>
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
            { href: "/action-center?tab=alerts", label: "All Alerts" },
            { href: "/reports?tab=risk", label: "At-Risk Export" },
            { href: "/iep-meetings", label: "IEP Meetings" },
            { href: "/evaluations", label: "Evaluations" },
            { href: "/sessions", label: "Sessions" },
            { href: "/compensatory", label: "Compensatory" },
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
