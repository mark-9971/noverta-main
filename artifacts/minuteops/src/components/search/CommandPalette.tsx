import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/role-context";
import {
  Search, X, Users, UserCheck, AlertTriangle, Target,
  LayoutDashboard, Calendar, Clipboard, Timer, Activity,
  ClipboardList, Shield, Gauge, Building2, BarChart3,
  PieChart, CalendarDays, Sparkles, Upload, Star, Clock,
  BookOpen, ArrowRight, Loader2,
} from "lucide-react";

// ─── Navigation shortcuts per role ───────────────────────────────────────────

type NavShortcut = { label: string; href: string; icon: React.ElementType; subtitle: string };

const adminShortcuts: NavShortcut[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, subtitle: "Compliance overview" },
  { label: "Alerts", href: "/alerts", icon: AlertTriangle, subtitle: "Unresolved alerts" },
  { label: "Students", href: "/students", icon: Users, subtitle: "Active caseload" },
  { label: "IEP Calendar", href: "/iep-calendar", icon: CalendarDays, subtitle: "Upcoming deadlines" },
  { label: "Service Minutes", href: "/compliance", icon: Timer, subtitle: "Compliance tracking" },
  { label: "Schedule", href: "/schedule", icon: Calendar, subtitle: "Service delivery schedule" },
  { label: "Session Log", href: "/sessions", icon: Clipboard, subtitle: "Session records" },
  { label: "Programs & Behaviors", href: "/program-data", icon: Activity, subtitle: "ABA & clinical data" },
  { label: "FBA / BIP", href: "/behavior-assessment", icon: ClipboardList, subtitle: "Behavior plans" },
  { label: "Restraint & Seclusion", href: "/protective-measures", icon: Shield, subtitle: "Incident reports" },
  { label: "Executive Dashboard", href: "/executive", icon: Gauge, subtitle: "Leadership view" },
  { label: "District Overview", href: "/district", icon: Building2, subtitle: "School-by-school" },
  { label: "Reports", href: "/reports", icon: BarChart3, subtitle: "Compliance & audit reports" },
  { label: "Analytics", href: "/analytics", icon: PieChart, subtitle: "Trends & charts" },
  { label: "Staff Directory", href: "/staff", icon: UserCheck, subtitle: "Providers & admins" },
  { label: "IEP Suggestions", href: "/iep-suggestions", icon: Sparkles, subtitle: "AI goal suggestions" },
  { label: "IEP Search", href: "/search", icon: Search, subtitle: "Search goals & accommodations" },
  { label: "Data Import", href: "/import", icon: Upload, subtitle: "Bulk data upload" },
];

const teacherShortcuts: NavShortcut[] = [
  { label: "Dashboard", href: "/", icon: LayoutDashboard, subtitle: "Daily overview" },
  { label: "Alerts", href: "/alerts", icon: AlertTriangle, subtitle: "Unresolved alerts" },
  { label: "My Students", href: "/students", icon: Users, subtitle: "My caseload" },
  { label: "Schedule", href: "/schedule", icon: Calendar, subtitle: "Today's sessions" },
  { label: "Service Minutes", href: "/compliance", icon: Timer, subtitle: "Compliance tracking" },
  { label: "Session Log", href: "/sessions", icon: Clipboard, subtitle: "Log & review sessions" },
  { label: "Programs & Behaviors", href: "/program-data", icon: Activity, subtitle: "Clinical data entry" },
  { label: "IEP Calendar", href: "/iep-calendar", icon: CalendarDays, subtitle: "Upcoming IEP dates" },
  { label: "FBA / BIP", href: "/behavior-assessment", icon: ClipboardList, subtitle: "Behavior plans" },
  { label: "IEP Suggestions", href: "/iep-suggestions", icon: Sparkles, subtitle: "AI goal suggestions" },
  { label: "IEP Search", href: "/search", icon: Search, subtitle: "Search goals" },
  { label: "Reports", href: "/reports", icon: BarChart3, subtitle: "Compliance reports" },
  { label: "Analytics", href: "/analytics", icon: PieChart, subtitle: "Trends & charts" },
];

const studentShortcuts: NavShortcut[] = [
  { label: "My Dashboard", href: "/sped-portal", icon: LayoutDashboard, subtitle: "Overview" },
  { label: "My Goals", href: "/sped-portal/goals", icon: Star, subtitle: "IEP goals" },
  { label: "My Services", href: "/sped-portal/services", icon: BookOpen, subtitle: "Service schedule" },
  { label: "My Sessions", href: "/sped-portal/sessions", icon: Clock, subtitle: "Session history" },
];

// ─── Types ────────────────────────────────────────────────────────────────────

type ResultItem = {
  key: string;
  name: string;
  subtitle?: string;
  href: string;
  icon: React.ElementType;
  severity?: string;
  isPage?: boolean;
};

type ApiResults = {
  students: { id: number; name: string; subtitle: string; href: string }[];
  staff: { id: number; name: string; subtitle: string; href: string }[];
  alerts: { id: number; name: string; subtitle: string; severity: string; href: string }[];
  goals: { id: number; name: string; subtitle: string; href: string }[];
};

const SEVERITY_DOT: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-yellow-500",
  low: "bg-gray-400",
};

// ─── Component ────────────────────────────────────────────────────────────────

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { role } = useRole();
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiResults, setApiResults] = useState<ApiResults | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shortcuts = role === "admin" ? adminShortcuts
    : role === "sped_teacher" ? teacherShortcuts
    : studentShortcuts;

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setApiResults(null);
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setApiResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query.trim())}&role=${role}`
        );
        if (res.ok) setApiResults(await res.json());
      } catch {
        // silently ignore
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, role]);

  // Build flattened result list for keyboard nav
  const flatResults = useCallback((): ResultItem[] => {
    const q = query.trim().toLowerCase();
    const results: ResultItem[] = [];

    // Navigation shortcuts (always shown; filtered when query present)
    const matchedShortcuts = q.length > 0
      ? shortcuts.filter(s =>
          s.label.toLowerCase().includes(q) || s.subtitle.toLowerCase().includes(q)
        )
      : shortcuts.slice(0, 6); // show top 6 when no query
    for (const s of matchedShortcuts) {
      results.push({ key: `page-${s.href}`, name: s.label, subtitle: s.subtitle, href: s.href, icon: s.icon, isPage: true });
    }

    if (apiResults) {
      for (const s of apiResults.students) {
        results.push({ key: `student-${s.id}`, name: s.name, subtitle: s.subtitle, href: s.href, icon: Users });
      }
      if (role === "admin") {
        for (const s of apiResults.staff) {
          results.push({ key: `staff-${s.id}`, name: s.name, subtitle: s.subtitle, href: s.href, icon: UserCheck });
        }
      }
      for (const g of apiResults.goals) {
        results.push({ key: `goal-${g.id}`, name: g.name, subtitle: g.subtitle, href: g.href, icon: Target });
      }
      if (role === "admin" || role === "sped_teacher") {
        for (const a of apiResults.alerts) {
          results.push({ key: `alert-${a.id}`, name: a.name, subtitle: a.subtitle, href: a.href, icon: AlertTriangle, severity: a.severity });
        }
      }
    }
    return results;
  }, [query, shortcuts, apiResults, role]);

  const results = flatResults();

  // Keyboard navigation
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    }
    if (e.key === "Enter" && results[activeIdx]) {
      navigate(results[activeIdx].href);
      onClose();
    }
  }, [results, activeIdx, navigate, onClose]);

  if (!open) return null;

  // Group results for display
  const q = query.trim().toLowerCase();
  const navResults = results.filter(r => r.isPage);
  const studentResults = results.filter(r => r.key.startsWith("student-"));
  const staffResults = results.filter(r => r.key.startsWith("staff-"));
  const goalResults = results.filter(r => r.key.startsWith("goal-"));
  const alertResults = results.filter(r => r.key.startsWith("alert-"));

  let globalIdx = -1;
  function itemProps(item: ResultItem) {
    globalIdx++;
    const idx = globalIdx;
    const isActive = activeIdx === idx;
    return {
      isActive,
      onClick: () => { navigate(item.href); onClose(); },
      onMouseEnter: () => setActiveIdx(idx),
    };
  }

  const hasResults = results.length > 0;
  const showEmpty = q.length >= 2 && !loading && !hasResults;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="relative w-full max-w-[580px] mx-4 bg-white rounded-2xl shadow-2xl border border-gray-200/80 overflow-hidden flex flex-col max-h-[72vh]">
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
          {loading
            ? <Loader2 className="w-4 h-4 text-gray-400 flex-shrink-0 animate-spin" />
            : <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          }
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              role === "sped_student"
                ? "Search your goals and sessions…"
                : "Search students, staff, goals, pages…"
            }
            className="flex-1 text-[14px] text-gray-800 placeholder-gray-400 bg-transparent outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="p-0.5 rounded text-gray-400 hover:text-gray-600">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <kbd className="hidden sm:flex items-center gap-1 text-[10px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto">
          {/* Empty hint */}
          {!q && (
            <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
              Quick Access
            </p>
          )}

          {/* Navigation results */}
          {navResults.length > 0 && (
            <ResultGroup label={q ? "Pages" : undefined}>
              {navResults.map(item => {
                const props = itemProps(item);
                return <ResultRow key={item.key} item={item} {...props} />;
              })}
            </ResultGroup>
          )}

          {/* Students */}
          {studentResults.length > 0 && (
            <ResultGroup label="Students">
              {studentResults.map(item => {
                const props = itemProps(item);
                return <ResultRow key={item.key} item={item} {...props} />;
              })}
            </ResultGroup>
          )}

          {/* Staff (admin only) */}
          {staffResults.length > 0 && (
            <ResultGroup label="Staff">
              {staffResults.map(item => {
                const props = itemProps(item);
                return <ResultRow key={item.key} item={item} {...props} />;
              })}
            </ResultGroup>
          )}

          {/* Goals */}
          {goalResults.length > 0 && (
            <ResultGroup label="IEP Goals">
              {goalResults.map(item => {
                const props = itemProps(item);
                return <ResultRow key={item.key} item={item} {...props} />;
              })}
            </ResultGroup>
          )}

          {/* Alerts */}
          {alertResults.length > 0 && (
            <ResultGroup label="Alerts">
              {alertResults.map(item => {
                const props = itemProps(item);
                return <ResultRow key={item.key} item={item} {...props} showSeverity />;
              })}
            </ResultGroup>
          )}

          {/* Empty state */}
          {showEmpty && (
            <div className="px-4 py-10 text-center">
              <Search className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-[13px] text-gray-400">No results for <span className="font-medium text-gray-500">"{query}"</span></p>
            </div>
          )}

          {/* Spacer */}
          <div className="h-2" />
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-gray-400">
            <span className="flex items-center gap-1">
              <kbd className="border border-gray-200 rounded px-1 py-0.5">↑↓</kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="border border-gray-200 rounded px-1 py-0.5">↵</kbd> open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="border border-gray-200 rounded px-1 py-0.5">Esc</kbd> close
            </span>
          </div>
          {q.length >= 2 && !loading && (
            <span className="text-[10px] text-gray-400">{results.length} result{results.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ResultGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div>
      {label && (
        <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
          {label}
        </p>
      )}
      <div className="px-2">{children}</div>
    </div>
  );
}

interface ResultRowProps {
  item: ResultItem;
  isActive: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  showSeverity?: boolean;
}

function ResultRow({ item, isActive, onClick, onMouseEnter, showSeverity }: ResultRowProps) {
  const Icon = item.icon;
  return (
    <button
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors duration-75",
        isActive ? "bg-emerald-50" : "hover:bg-gray-50"
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <div className={cn(
        "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
        isActive ? "bg-emerald-100" : "bg-gray-100"
      )}>
        <Icon className={cn("w-3.5 h-3.5", isActive ? "text-emerald-700" : "text-gray-500")} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("text-[13px] font-medium truncate leading-tight", isActive ? "text-emerald-900" : "text-gray-800")}>
          {item.name}
        </p>
        {item.subtitle && (
          <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">{item.subtitle}</p>
        )}
      </div>
      {showSeverity && item.severity && (
        <span className={cn("w-2 h-2 rounded-full flex-shrink-0", SEVERITY_DOT[item.severity] || "bg-gray-300")} />
      )}
      {isActive && <ArrowRight className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />}
    </button>
  );
}
