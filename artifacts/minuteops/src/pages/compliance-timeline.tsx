import { useState, useEffect, useCallback } from "react";
import { getComplianceTimeline, recalculateComplianceEvents } from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  ArrowLeft, Calendar, AlertTriangle, CheckCircle2, Clock, RefreshCw, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";


interface ComplianceEvent {
  id: number;
  studentId: number;
  eventType: string;
  title: string;
  dueDate: string;
  completedDate: string | null;
  status: string;
  notes: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  daysRemaining: number;
  computedStatus: string;
  student: { id: number; firstName: string; lastName: string; grade: string | null };
}

const EVENT_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  annual_review: { label: "Annual Review", color: "text-emerald-800", bg: "bg-emerald-50" },
  reeval_3yr: { label: "3-Year Reevaluation", color: "text-gray-700", bg: "bg-gray-50" },
  initial_eval: { label: "Initial Evaluation", color: "text-emerald-700", bg: "bg-emerald-50" },
  transition_age: { label: "Transition (Age 14+)", color: "text-amber-700", bg: "bg-amber-50" },
  progress_report: { label: "Progress Report", color: "text-emerald-700", bg: "bg-emerald-50" },
};

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  overdue: { label: "Overdue", color: "text-red-700", bg: "bg-red-50", icon: AlertTriangle },
  critical: { label: "Due This Week", color: "text-amber-700", bg: "bg-amber-50", icon: AlertTriangle },
  due_soon: { label: "Due Soon", color: "text-amber-700", bg: "bg-amber-50", icon: Clock },
  upcoming: { label: "Upcoming", color: "text-gray-500", bg: "bg-gray-50", icon: Calendar },
  completed: { label: "Completed", color: "text-emerald-700", bg: "bg-emerald-50", icon: CheckCircle2 },
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ResolveDialog({
  event,
  onClose,
  onResolved,
}: {
  event: ComplianceEvent;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!note.trim()) {
      toast.error("Please enter a resolution note");
      return;
    }
    setSaving(true);
    try {
      const r = await authFetch(`/api/compliance-events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolve: true, resolutionNote: note.trim() }),
      });
      if (!r.ok) {
        const err: { error?: string } = await r.json().catch(() => ({}));
        throw new Error(err.error ?? "Failed to resolve event");
      }
      toast.success("Event marked as resolved");
      onResolved();
    } catch {
      toast.error("Failed to resolve event");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-800">Resolve Compliance Event</h3>
          <p className="text-sm text-gray-500 mt-1">{event.title}</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Resolution Note <span className="text-red-500">*</span></label>
          <textarea
            className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 resize-none"
            rows={3}
            placeholder="Describe how this was resolved (e.g., IEP meeting held on 4/10, documents signed)"
            value={note}
            onChange={e => setNote(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white" onClick={handleSubmit} disabled={saving}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            {saving ? "Saving..." : "Mark Resolved"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ComplianceTimelinePage() {
  const [events, setEvents] = useState<ComplianceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [recalculating, setRecalculating] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<ComplianceEvent | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const raw = await authFetch(`/api/compliance-timeline${filter && filter !== "all" ? `?status=${filter}` : ""}`)
        .then(r => r.json()) as unknown;
      setEvents(Array.isArray(raw) ? (raw as ComplianceEvent[]) : []);
    } catch (e) {
      console.error("Failed to load compliance timeline:", e);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadData(); }, [loadData]);

  async function recalculate() {
    setRecalculating(true);
    try {
      await recalculateComplianceEvents();
      await loadData();
    } catch (e) {
      console.error("Failed to recalculate:", e);
    }
    setRecalculating(false);
  }

  const unresolved = events.filter(e => e.computedStatus !== "completed");
  const resolved = events.filter(e => e.computedStatus === "completed");
  const overdue = unresolved.filter(e => e.computedStatus === "overdue");
  const critical = unresolved.filter(e => e.computedStatus === "critical");
  const dueSoon = unresolved.filter(e => e.computedStatus === "due_soon");

  const displayEvents = filter === "all" ? unresolved : filter === "completed" ? resolved : events.filter(e => {
    if (filter === "overdue") return e.computedStatus === "overdue" || e.computedStatus === "critical";
    if (filter === "due_soon") return e.computedStatus === "due_soon";
    return true;
  });

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}</div>
        {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {resolveTarget && (
        <ResolveDialog
          event={resolveTarget}
          onClose={() => setResolveTarget(null)}
          onResolved={() => { setResolveTarget(null); loadData(); }}
        />
      )}

      <div className="flex items-center gap-3">
        <Link href="/compliance" className="text-emerald-700 hover:text-emerald-900">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800">Compliance Timeline</h1>
          <p className="text-xs md:text-sm text-gray-400">IEP annual reviews, reevaluations, and deadline tracking (IDEA-compliant)</p>
        </div>
        <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={recalculate} disabled={recalculating}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${recalculating ? "animate-spin" : ""}`} />
          {recalculating ? "Calculating..." : "Recalculate Deadlines"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className={overdue.length > 0 ? "border-red-200 bg-red-50/30" : ""}>
          <CardContent className="p-3.5 text-center">
            <p className={`text-2xl font-bold ${overdue.length > 0 ? "text-red-600" : "text-gray-300"}`}>{overdue.length}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Overdue</p>
          </CardContent>
        </Card>
        <Card className={critical.length > 0 ? "border-amber-200 bg-amber-50/30" : ""}>
          <CardContent className="p-3.5 text-center">
            <p className={`text-2xl font-bold ${critical.length > 0 ? "text-amber-600" : "text-gray-300"}`}>{critical.length}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Due This Week</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5 text-center">
            <p className="text-2xl font-bold text-amber-600">{dueSoon.length}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Due in 30 Days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5 text-center">
            <p className="text-2xl font-bold text-emerald-600">{resolved.length}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Resolved</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto">
        {[
          { key: "all", label: `Open (${unresolved.length})` },
          { key: "overdue", label: `Overdue (${overdue.length + critical.length})` },
          { key: "due_soon", label: `Due Soon (${dueSoon.length})` },
          { key: "completed", label: `Resolved (${resolved.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className={`px-4 py-2.5 text-[12px] md:text-[13px] font-medium border-b-2 transition-all whitespace-nowrap ${
              filter === t.key ? "border-emerald-700 text-emerald-800" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {displayEvents.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              {filter === "completed" ? "No resolved events" : "No compliance events found"}
            </p>
            {filter === "all" && (
              <p className="text-xs text-gray-400 mt-1">Click "Recalculate Deadlines" to auto-generate from IEP documents</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {displayEvents.map(event => {
          const eventStyle = EVENT_TYPES[event.eventType] || EVENT_TYPES.annual_review;
          const statusStyle = STATUS_STYLES[event.computedStatus] || STATUS_STYLES.upcoming;
          const StatusIcon = statusStyle.icon;
          const isCompleted = event.computedStatus === "completed";

          return (
            <Card key={event.id} className={event.computedStatus === "overdue" ? "border-red-200" : event.computedStatus === "critical" ? "border-amber-200" : ""}>
              <CardContent className="p-3.5 md:p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${statusStyle.bg}`}>
                    <StatusIcon className={`w-5 h-5 ${statusStyle.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/students/${event.student.id}/iep`} className="text-[13px] font-semibold text-gray-700 hover:text-emerald-700">
                        {event.student.firstName} {event.student.lastName}
                      </Link>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${eventStyle.bg} ${eventStyle.color}`}>
                        {eventStyle.label}
                      </span>
                    </div>
                    <p className="text-[12px] text-gray-500 mt-0.5">{event.title}</p>
                    {isCompleted && event.resolutionNote && (
                      <p className="text-[11px] text-emerald-700 mt-0.5 italic">"{event.resolutionNote}"</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[12px] text-gray-500">{formatDate(event.dueDate)}</p>
                    <p className={`text-[11px] font-medium ${statusStyle.color}`}>
                      {isCompleted ? `Resolved ${event.resolvedAt ? formatDate(event.resolvedAt.split("T")[0]) : ""}` :
                       event.daysRemaining < 0 ? `${Math.abs(event.daysRemaining)}d overdue` :
                       event.daysRemaining === 0 ? "Due today" :
                       `${event.daysRemaining}d remaining`}
                    </p>
                  </div>
                  {!isCompleted && (
                    <Button size="sm" variant="outline" className="text-[11px] h-7 px-2 flex-shrink-0" onClick={() => setResolveTarget(event)}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Resolve
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
