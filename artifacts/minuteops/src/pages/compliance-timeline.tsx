import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  ArrowLeft, Calendar, AlertTriangle, CheckCircle2, Clock, RefreshCw,
  ChevronRight, Filter, Users
} from "lucide-react";

const API = "/api";

interface ComplianceEvent {
  id: number;
  studentId: number;
  eventType: string;
  title: string;
  dueDate: string;
  completedDate: string | null;
  status: string;
  notes: string | null;
  daysRemaining: number;
  computedStatus: string;
  student: { id: number; firstName: string; lastName: string; grade: string | null };
}

const EVENT_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  annual_review: { label: "Annual Review", color: "text-emerald-800", bg: "bg-emerald-50" },
  reeval_3yr: { label: "3-Year Reevaluation", color: "text-purple-700", bg: "bg-purple-50" },
  initial_eval: { label: "Initial Evaluation", color: "text-blue-700", bg: "bg-blue-50" },
  transition_age: { label: "Transition (Age 14+)", color: "text-amber-700", bg: "bg-amber-50" },
  progress_report: { label: "Progress Report", color: "text-emerald-700", bg: "bg-emerald-50" },
};

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  overdue: { label: "Overdue", color: "text-red-700", bg: "bg-red-50", icon: AlertTriangle },
  critical: { label: "Due This Week", color: "text-orange-700", bg: "bg-orange-50", icon: AlertTriangle },
  due_soon: { label: "Due Soon", color: "text-amber-700", bg: "bg-amber-50", icon: Clock },
  upcoming: { label: "Upcoming", color: "text-slate-500", bg: "bg-slate-50", icon: Calendar },
  completed: { label: "Completed", color: "text-emerald-700", bg: "bg-emerald-50", icon: CheckCircle2 },
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ComplianceTimelinePage() {
  const [events, setEvents] = useState<ComplianceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [recalculating, setRecalculating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`${API}/compliance-timeline?status=${filter}`);
      const data = await res.json();
      setEvents(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("Failed to load compliance timeline:", e);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { loadData(); }, [loadData]);

  async function recalculate() {
    setRecalculating(true);
    try {
      await fetch(`${API}/compliance-events/recalculate`, { method: "POST" });
      await loadData();
    } catch (e) {
      console.error("Failed to recalculate:", e);
    }
    setRecalculating(false);
  }

  async function markCompleted(eventId: number) {
    const today = new Date().toISOString().split("T")[0];
    await fetch(`${API}/compliance-events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed", completedDate: today }),
    });
    loadData();
  }

  const overdue = events.filter(e => e.computedStatus === "overdue");
  const critical = events.filter(e => e.computedStatus === "critical");
  const dueSoon = events.filter(e => e.computedStatus === "due_soon");
  const upcoming = events.filter(e => e.computedStatus === "upcoming");
  const completed = events.filter(e => e.computedStatus === "completed");

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
      <div className="flex items-center gap-3">
        <Link href="/compliance" className="text-emerald-700 hover:text-emerald-900">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Compliance Timeline</h1>
          <p className="text-xs md:text-sm text-slate-400">IEP annual reviews, reevaluations, and deadline tracking (IDEA-compliant)</p>
        </div>
        <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={recalculate} disabled={recalculating}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1 ${recalculating ? "animate-spin" : ""}`} />
          {recalculating ? "Calculating..." : "Recalculate Deadlines"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className={overdue.length > 0 ? "border-red-200 bg-red-50/30" : ""}>
          <CardContent className="p-3.5 text-center">
            <p className={`text-2xl font-bold ${overdue.length > 0 ? "text-red-600" : "text-slate-300"}`}>{overdue.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Overdue</p>
          </CardContent>
        </Card>
        <Card className={critical.length > 0 ? "border-orange-200 bg-orange-50/30" : ""}>
          <CardContent className="p-3.5 text-center">
            <p className={`text-2xl font-bold ${critical.length > 0 ? "text-orange-600" : "text-slate-300"}`}>{critical.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Due This Week</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5 text-center">
            <p className="text-2xl font-bold text-amber-600">{dueSoon.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Due in 30 Days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5 text-center">
            <p className="text-2xl font-bold text-slate-400">{upcoming.length + completed.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Total Events</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto">
        {[
          { key: "all", label: "All" },
          { key: "overdue", label: `Overdue (${overdue.length})` },
          { key: "due_soon", label: `Due Soon (${dueSoon.length + critical.length})` },
          { key: "completed", label: `Completed (${completed.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setFilter(t.key === "overdue" || t.key === "due_soon" || t.key === "completed" ? t.key : "all")}
            className={`px-4 py-2.5 text-[12px] md:text-[13px] font-medium border-b-2 transition-all whitespace-nowrap ${
              (filter === "all" && t.key === "all") || filter === t.key ? "border-emerald-700 text-emerald-800" : "border-transparent text-slate-400 hover:text-slate-600"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {events.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">No compliance events found</p>
            <p className="text-xs text-slate-400 mt-1">Click "Recalculate Deadlines" to auto-generate from IEP documents</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {events.map(event => {
          const eventStyle = EVENT_TYPES[event.eventType] || EVENT_TYPES.annual_review;
          const statusStyle = STATUS_STYLES[event.computedStatus] || STATUS_STYLES.upcoming;
          const StatusIcon = statusStyle.icon;

          return (
            <Card key={event.id} className={event.computedStatus === "overdue" ? "border-red-200" : event.computedStatus === "critical" ? "border-orange-200" : ""}>
              <CardContent className="p-3.5 md:p-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${statusStyle.bg}`}>
                    <StatusIcon className={`w-5 h-5 ${statusStyle.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/students/${event.student.id}/iep`} className="text-[13px] font-semibold text-slate-700 hover:text-emerald-700">
                        {event.student.firstName} {event.student.lastName}
                      </Link>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${eventStyle.bg} ${eventStyle.color}`}>
                        {eventStyle.label}
                      </span>
                    </div>
                    <p className="text-[12px] text-slate-500 mt-0.5">{event.title}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[12px] text-slate-500">{formatDate(event.dueDate)}</p>
                    <p className={`text-[11px] font-medium ${statusStyle.color}`}>
                      {event.computedStatus === "completed" ? "Completed" :
                       event.daysRemaining < 0 ? `${Math.abs(event.daysRemaining)}d overdue` :
                       event.daysRemaining === 0 ? "Due today" :
                       `${event.daysRemaining}d remaining`}
                    </p>
                  </div>
                  {event.computedStatus !== "completed" && (
                    <Button size="sm" variant="outline" className="text-[11px] h-7 px-2" onClick={() => markCompleted(event.id)}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Done
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
