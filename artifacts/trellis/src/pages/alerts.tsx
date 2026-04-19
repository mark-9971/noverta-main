import { useState, useMemo, useEffect } from "react";
import { useListAlerts, useResolveAlert, useBulkResolveAlerts, useSnoozeAlert } from "@workspace/api-client-react";
import type { ListAlerts200 } from "@workspace/api-client-react";

type AlertRow = ListAlerts200["data"][number] & {
  studentName?: string | null;
  staffName?: string | null;
};
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, RefreshCw, Clock, ExternalLink, CheckSquare, Square, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { useSchoolContext } from "@/lib/school-context";
import { useSearch, useLocation } from "wouter";

type Tab = "open" | "resolved" | "snoozed";
const TAB_KEYS: Tab[] = ["open", "snoozed", "resolved"];

function resolveTab(search: string): Tab {
  const p = new URLSearchParams(search).get("tab");
  return (p && TAB_KEYS.includes(p as Tab) ? p : "open") as Tab;
}

const SEVERITY_CONFIG: Record<string, { dot: string; bg: string; color: string }> = {
  critical: { dot: "bg-red-500", bg: "bg-red-50/60 border-red-100", color: "text-red-700" },
  high: { dot: "bg-amber-400", bg: "bg-amber-50/60 border-amber-100", color: "text-amber-700" },
  medium: { dot: "bg-amber-300", bg: "bg-amber-50/40 border-amber-100", color: "text-amber-700" },
  low: { dot: "bg-gray-300", bg: "bg-gray-50/60 border-gray-100", color: "text-gray-600" },
};

function computeSourceUrl(alert: any): string | null {
  const { type, studentId } = alert;
  if (type === "overdue_session_log") {
    return `/sessions`;
  }
  if (studentId) {
    if (type === "iep_expiring" || type === "iep_expired" || type === "missing_iep" || type === "evaluation_overdue") {
      return `/students/${studentId}`;
    }
    if (type === "service_minutes_behind" || type === "service_gap" || type === "missed_sessions" || type === "behind_on_minutes" || type === "projected_shortfall") {
      return `/compliance`;
    }
    if (type === "restraint_review" || type === "incident_follow_up") {
      return `/protective-measures`;
    }
    return `/students/${studentId}`;
  }
  if (type === "service_minutes_behind" || type === "service_gap" || type === "missed_sessions" || type === "behind_on_minutes" || type === "projected_shortfall") {
    return `/compliance`;
  }
  return null;
}

export default function Alerts({ embedded = false }: { embedded?: boolean } = {}) {
  const search = useSearch();
  const [, navigate] = useLocation();
  // When embedded inside the Action Center, the surrounding ?tab=alerts query
  // is owned by the parent. Track the inner tab in local state only and do
  // NOT navigate — calling navigate("/alerts?tab=…") would trigger
  // AlertsRedirect, unmount this component, and lose every other piece of
  // local state (filters, selection, page).
  const [tab, setTabState] = useState<Tab>(() => (embedded ? "open" : resolveTab(search)));
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [studentSearch, setStudentSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [resolveConfirm, setResolveConfirm] = useState<any>(null);
  const [bulkResolveOpen, setBulkResolveOpen] = useState(false);
  const [resolveNote, setResolveNote] = useState("");
  const [resolving, setResolving] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [alertPage, setAlertPage] = useState(1);
  const ALERT_PAGE_SIZE = 100;

  useEffect(() => {
    if (embedded) return;
    setTabState(resolveTab(search));
  }, [search, embedded]);

  function setTab(t: Tab) {
    setTabState(t);
    setSeverityFilter("all");
    setSelected(new Set());
    setAlertPage(1);
    if (!embedded) navigate(`/alerts?tab=${t}`, { replace: true });
  }

  const { typedFilter } = useSchoolContext();

  // Reset to page 1 when server-side parameters change.
  useEffect(() => { setAlertPage(1); }, [typeFilter, JSON.stringify(typedFilter)]);

  const queryParams = useMemo(() => {
    const base: Record<string, string> = { ...typedFilter };
    if (tab === "open") {
      base.resolved = "false";
      base.snoozed = "false";
    } else if (tab === "resolved") {
      base.resolved = "true";
    } else if (tab === "snoozed") {
      base.resolved = "false";
      base.snoozed = "true";
    }
    if (typeFilter !== "all") base.type = typeFilter;
    base.limit = String(ALERT_PAGE_SIZE);
    base.offset = String((alertPage - 1) * ALERT_PAGE_SIZE);
    return base;
  }, [tab, typedFilter, typeFilter, alertPage]);

  const { data: alerts, isLoading, isError, refetch } = useListAlerts(queryParams);
  const { mutateAsync: resolveAlert } = useResolveAlert();
  const { mutateAsync: bulkResolve } = useBulkResolveAlerts();
  const { mutateAsync: snoozeAlert } = useSnoozeAlert();

  const alertTotal: number = alerts?.total ?? 0;
  const alertHasMore: boolean = alerts?.hasMore ?? false;
  const alertTotalPages = alertTotal > 0 ? Math.ceil(alertTotal / ALERT_PAGE_SIZE) : 1;
  const alertList: AlertRow[] = (alerts?.data ?? []) as AlertRow[];
  const filtered = alertList.filter(a => {
    const matchSeverity = severityFilter === "all" || a.severity === severityFilter;
    const matchStudent = !studentSearch ||
      (a.studentName ?? "").toLowerCase().includes(studentSearch.toLowerCase());
    const created = a.createdAt ? (() => {
      const d = new Date(a.createdAt);
      const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    })() : "";
    const matchFrom = !dateFrom || created >= dateFrom;
    const matchTo = !dateTo || created <= dateTo;
    return matchSeverity && matchStudent && matchFrom && matchTo;
  });

  const counts = alertList.reduce((acc: any, a: any) => {
    acc[a.severity] = (acc[a.severity] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const typeOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const a of alertList) if (a.type) seen.add(a.type);
    return Array.from(seen).sort();
  }, [alertList]);

  const hasExtraFilters = typeFilter !== "all" || !!studentSearch || !!dateFrom || !!dateTo;

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((a: any) => a.id)));
    }
  }

  async function handleResolveConfirmed() {
    if (!resolveConfirm) return;
    setResolving(true);
    try {
      await resolveAlert({ id: resolveConfirm.id, data: { resolvedNote: resolveNote || "Resolved from dashboard" } });
      toast.success("Alert resolved");
      setResolveConfirm(null);
      setResolveNote("");
      refetch();
    } catch {
      toast.error("Failed to resolve alert");
    } finally {
      setResolving(false);
    }
  }

  async function handleBulkResolve() {
    if (selected.size === 0) return;
    setResolving(true);
    try {
      const result = await bulkResolve({ data: { ids: Array.from(selected), resolvedNote: resolveNote || "Bulk resolved from dashboard" } });
      const count = (result as any)?.resolved ?? selected.size;
      toast.success(`${count} alert${count !== 1 ? "s" : ""} resolved`);
      setBulkResolveOpen(false);
      setResolveNote("");
      setSelected(new Set());
      refetch();
    } catch {
      toast.error("Failed to bulk resolve alerts");
    } finally {
      setResolving(false);
    }
  }

  async function handleSnooze(id: number) {
    try {
      await snoozeAlert({ id });
      toast.success("Alert snoozed for 7 days");
      refetch();
    } catch {
      toast.error("Failed to snooze alert");
    }
  }

  return (
    <div className={embedded ? "space-y-4" : "p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4 md:space-y-6"}>
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          {!embedded && (
            <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Alerts</h1>
          )}
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            {tab === "open" && `${alertTotal.toLocaleString()} open alert${alertTotal !== 1 ? "s" : ""}`}
            {tab === "resolved" && `${alertTotal.toLocaleString()} resolved alert${alertTotal !== 1 ? "s" : ""}`}
            {tab === "snoozed" && `${alertTotal.toLocaleString()} snoozed alert${alertTotal !== 1 ? "s" : ""}`}
            {alertTotalPages > 1 && ` — page ${alertPage} of ${alertTotalPages}`}
          </p>
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && tab === "open" && (
            <Button size="sm" className="text-[12px] h-8 bg-emerald-700 hover:bg-emerald-800 text-white" onClick={() => { setResolveNote(""); setBulkResolveOpen(true); }}>
              <CheckCircle className="w-3.5 h-3.5 mr-1" />
              Resolve Selected ({selected.size})
            </Button>
          )}
          <Button variant="outline" size="sm" className="text-[12px] h-8" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: "open" as Tab, label: "Open" },
          { key: "snoozed" as Tab, label: "Snoozed" },
          { key: "resolved" as Tab, label: "Resolved" },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSeverityFilter("all"); setSelected(new Set()); }}
            className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          placeholder="Filter by student name…"
          className="h-9 text-[12px] bg-white w-[200px]"
          value={studentSearch}
          onChange={e => setStudentSearch(e.target.value)}
        />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-9 text-[12px] bg-white w-[200px]"><SelectValue placeholder="All alert types" /></SelectTrigger>
          <SelectContent className="max-h-[320px]">
            <SelectItem value="all">All alert types</SelectItem>
            {typeOptions.map(t => (
              <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Input type="date" className="h-9 text-[12px] bg-white w-[140px]" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-[11px] text-gray-400">to</span>
          <Input type="date" className="h-9 text-[12px] bg-white w-[140px]" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        {hasExtraFilters && (
          <button onClick={() => { setTypeFilter("all"); setStudentSearch(""); setDateFrom(""); setDateTo(""); }}
            className="text-[11px] text-gray-500 hover:text-gray-800 px-2 py-1 rounded-md border border-gray-200 bg-white hover:border-gray-300">
            Clear
          </button>
        )}
      </div>

      {tab === "open" && (
        <div className="flex gap-2 flex-wrap items-center">
          {filtered.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium text-gray-500 hover:bg-gray-50 transition-colors border border-gray-200"
            >
              {selected.size === filtered.length && filtered.length > 0
                ? <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
                : <Square className="w-3.5 h-3.5" />}
              {selected.size === filtered.length && filtered.length > 0 ? "Deselect All" : "Select All"}
            </button>
          )}
          <button
            aria-pressed={severityFilter === "all"}
            onClick={() => setSeverityFilter("all")}
            className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              severityFilter === "all" ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200"
            }`}
          >All ({alertTotal})</button>
          {["critical", "high", "medium", "low"].map(sev => {
            const cfg = SEVERITY_CONFIG[sev];
            return (
              <button
                key={sev}
                aria-pressed={severityFilter === sev}
                onClick={() => setSeverityFilter(severityFilter === sev ? "all" : sev)}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all flex items-center gap-1.5 ${
                  severityFilter === sev ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${severityFilter === sev ? "bg-white" : cfg.dot}`} />
                {sev.charAt(0).toUpperCase() + sev.slice(1)} ({counts[sev] ?? 0})
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-2">
        {isError ? (
          <ErrorBanner message="Failed to load alerts." onRetry={() => refetch()} />
        ) : isLoading ? (
          [...Array(6)].map((_, i) => <Skeleton key={i} className="w-full h-20 rounded-xl" />)
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={tab === "snoozed" ? Clock : CheckCircle}
            title={tab === "snoozed" ? "No snoozed alerts" : tab === "resolved" ? "No resolved alerts" : "No active alerts"}
            description={
              tab === "snoozed"
                ? "You haven't snoozed any alerts. Snooze an alert to hide it for 7 days."
                : tab === "resolved"
                  ? "No alerts have been resolved yet."
                  : "All compliance checks are passing. You'll see alerts here if any students fall behind on services."
            }
            compact
          />
        ) : filtered.map((a: any) => {
          const cfg = SEVERITY_CONFIG[a.severity] ?? SEVERITY_CONFIG.low;
          const sourceUrl = computeSourceUrl(a);
          const isSelected = selected.has(a.id);
          return (
            <Card key={a.id} className={`border ${cfg.bg} transition-all ${isSelected ? "ring-2 ring-emerald-400" : ""}`}>
              <div className="flex items-start gap-3 p-4">
                {tab === "open" && (
                  <button onClick={() => toggleSelect(a.id)} className="mt-1 flex-shrink-0">
                    {isSelected
                      ? <CheckSquare className="w-4 h-4 text-emerald-600" />
                      : <Square className="w-4 h-4 text-gray-300 hover:text-gray-400" />}
                  </button>
                )}
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${cfg.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${cfg.color}`}>{a.severity}</span>
                    <span className="text-[11px] text-gray-400 bg-white/60 px-1.5 py-0.5 rounded">{a.type?.replace(/_/g, " ")}</span>
                    {a.studentName && <span className="text-[12px] font-medium text-gray-700">{a.studentName}</span>}
                  </div>
                  <p className="text-[13px] text-gray-700 mt-1">{a.message}</p>
                  {a.suggestedAction && <p className="text-[12px] text-gray-400 mt-0.5 italic">{a.suggestedAction}</p>}
                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    <p className="text-[11px] text-gray-400">
                      {new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                    {tab === "snoozed" && a.snoozedUntil && (
                      <span className="text-[11px] text-amber-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Until {new Date(a.snoozedUntil).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                    {sourceUrl && (
                      <button
                        onClick={() => navigate(sourceUrl)}
                        className="text-[11px] text-emerald-600 hover:text-emerald-800 flex items-center gap-1 font-medium"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View Details
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!a.resolved && tab === "open" && (
                    <>
                      <Button size="sm" variant="outline" className="text-[11px] h-7 bg-white/80 hover:bg-white" onClick={() => handleSnooze(a.id)}>
                        <Clock className="w-3 h-3 mr-1" />
                        Snooze
                      </Button>
                      <Button size="sm" variant="outline" className="text-[11px] h-7 bg-white/80 hover:bg-white" onClick={() => { setResolveConfirm(a); setResolveNote(""); }}>
                        Resolve
                      </Button>
                    </>
                  )}
                  {a.resolved && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">Resolved</span>
                  )}
                  {tab === "snoozed" && (
                    <Button size="sm" variant="outline" className="text-[11px] h-7 bg-white/80 hover:bg-white" onClick={() => { setResolveConfirm(a); setResolveNote(""); }}>
                      Resolve
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Alert pagination controls */}
      {alertTotalPages > 1 && (
        <div className="flex items-center justify-between pt-1 pb-2">
          <p className="text-[12px] text-gray-500">
            Showing {(alertPage - 1) * ALERT_PAGE_SIZE + 1}–{Math.min(alertPage * ALERT_PAGE_SIZE, alertTotal)} of {alertTotal.toLocaleString()}
          </p>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-[12px] px-2"
              disabled={alertPage <= 1 || isLoading}
              onClick={() => { setAlertPage(p => Math.max(1, p - 1)); setSelected(new Set()); }}>
              <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> Prev
            </Button>
            <span className="text-[12px] text-gray-500 px-1">Page {alertPage} of {alertTotalPages}</span>
            <Button variant="outline" size="sm" className="h-7 text-[12px] px-2"
              disabled={!alertHasMore || isLoading}
              onClick={() => { setAlertPage(p => p + 1); setSelected(new Set()); }}>
              Next <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={resolveConfirm !== null} onOpenChange={(open) => { if (!open) setResolveConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resolve Alert</AlertDialogTitle>
            <AlertDialogDescription>
              {resolveConfirm && <>
                <span className="font-medium text-gray-700">{resolveConfirm.severity?.toUpperCase()}</span>
                {" — "}
                {resolveConfirm.message}
              </>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-gray-500">Resolution note (optional)</Label>
            <Textarea className="text-[13px] resize-none" rows={2} value={resolveNote} onChange={e => setResolveNote(e.target.value)} placeholder="What was done to resolve this..." />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resolving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleResolveConfirmed} disabled={resolving}>
              {resolving ? "Resolving..." : "Confirm Resolve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkResolveOpen} onOpenChange={(open) => { if (!open) setBulkResolveOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resolve {selected.size} Alert{selected.size !== 1 ? "s" : ""}</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark all {selected.size} selected alert{selected.size !== 1 ? "s" : ""} as resolved with the same note.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-gray-500">Resolution note (optional)</Label>
            <Textarea className="text-[13px] resize-none" rows={2} value={resolveNote} onChange={e => setResolveNote(e.target.value)} placeholder="What was done to resolve these..." />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resolving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkResolve} disabled={resolving}>
              {resolving ? "Resolving..." : `Resolve ${selected.size} Alert${selected.size !== 1 ? "s" : ""}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
