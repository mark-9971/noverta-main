import { useState, useEffect, useMemo } from "react";
import { getIepCalendar } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSchoolContext } from "@/lib/school-context";
import { Link } from "wouter";
import {
  Calendar, ChevronLeft, ChevronRight,
  AlertTriangle, Clock, CheckCircle2, ArrowRight
} from "lucide-react";

interface CalendarEvent {
  id: number | string;
  studentId: number;
  studentName: string;
  grade: string | null;
  eventType: string;
  title: string;
  dueDate: string;
  status: string;
  completedDate: string | null;
  notes: string | null;
  daysRemaining: number;
}

interface CalendarSummary {
  overdue: number;
  critical: number;
  dueSoon: number;
  upcoming: number;
  completed: number;
  total: number;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  annual_review: "Annual Review",
  reeval_3yr: "3-Year Reevaluation",
  initial_eval: "Initial Evaluation",
  transition_plan: "Transition Plan",
  progress_report: "Progress Report",
};

const EVENT_TYPE_COLORS: Record<string, { bg: string; text: string; dot: string; badgeCls: string }> = {
  annual_review: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "#059669", badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  reeval_3yr: { bg: "bg-gray-100", text: "text-gray-700", dot: "#4b5563", badgeCls: "bg-gray-100 text-gray-700 border-gray-300" },
  initial_eval: { bg: "bg-red-50", text: "text-red-700", dot: "#dc2626", badgeCls: "bg-red-50 text-red-700 border-red-200" },
  transition_plan: { bg: "bg-gray-50", text: "text-gray-600", dot: "#9ca3af", badgeCls: "bg-gray-50 text-gray-600 border-gray-200" },
  progress_report: { bg: "bg-gray-50", text: "text-gray-600", dot: "#6b7280", badgeCls: "bg-gray-50 text-gray-600 border-gray-200" },
};

const STATUS_CONFIG: Record<string, { icon: any; className: string; label: string }> = {
  overdue: { icon: AlertTriangle, className: "bg-red-100 text-red-700 border-red-200", label: "Overdue" },
  critical: { icon: Clock, className: "bg-red-50 text-red-600 border-red-100", label: "Due This Week" },
  due_soon: { icon: Clock, className: "bg-gray-100 text-gray-600 border-gray-200", label: "Due Soon" },
  upcoming: { icon: Calendar, className: "bg-emerald-50 text-emerald-600 border-emerald-200", label: "Upcoming" },
  completed: { icon: CheckCircle2, className: "bg-gray-50 text-gray-500 border-gray-200", label: "Completed" },
};

function eventTypeColor(eventType: string) {
  return EVENT_TYPE_COLORS[eventType] ?? EVENT_TYPE_COLORS.progress_report;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export default function IepCalendar() {
  const { filterParams } = useSchoolContext();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [summary, setSummary] = useState<CalendarSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  useEffect(() => {
    const startDate = new Date(viewYear, viewMonth - 1, 1).toISOString().split("T")[0];
    const endDate = new Date(viewYear, viewMonth + 2, 0).toISOString().split("T")[0];

    const params = new URLSearchParams({ startDate, endDate, ...filterParams });
    if (filterType !== "all") params.set("eventType", filterType);

    setLoading(true);
    getIepCalendar(Object.fromEntries(params) as any).catch(() => ({ events: [], summary: {} })).then(d => {
        setEvents(d.events ?? []);
        setSummary(d.summary ?? null);
      })
      .catch(() => { setEvents([]); setSummary(null); })
      .finally(() => setLoading(false));
  }, [filterParams, viewYear, viewMonth, filterType]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      if (!map.has(e.dueDate)) map.set(e.dueDate, []);
      map.get(e.dueDate)!.push(e);
    }
    return map;
  }, [events]);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const todayStr = now.toISOString().split("T")[0];
  const selectedEvents = selectedDate ? (eventsByDate.get(selectedDate) ?? []) : [];

  const filteredListEvents = useMemo(() => {
    return events.filter(e => e.status !== "completed").sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [events]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">IEP Calendar</h1>
          <p className="text-sm text-gray-500 mt-1">Track compliance deadlines for annual reviews, reevaluations, and more</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Event Types</option>
            <option value="annual_review">Annual Reviews</option>
            <option value="reeval_3yr">3-Year Reevaluations</option>
            <option value="initial_eval">Initial Evaluations</option>
            <option value="transition_plan">Transition Plans</option>
            <option value="progress_report">Progress Reports</option>
          </select>
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode("calendar")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === "calendar" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}
            >
              Calendar
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${viewMode === "list" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}
            >
              List
            </button>
          </div>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryBadge label="Overdue" count={summary.overdue} color="text-red-600 bg-red-50" />
          <SummaryBadge label="Due This Week" count={summary.critical} color="text-red-500 bg-red-50" />
          <SummaryBadge label="Due Soon (30d)" count={summary.dueSoon} color="text-gray-600 bg-gray-50" />
          <SummaryBadge label="Upcoming" count={summary.upcoming} color="text-emerald-600 bg-emerald-50" />
          <SummaryBadge label="Completed" count={summary.completed} color="text-gray-500 bg-gray-50" />
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <span className="text-xs text-gray-400 font-medium">Event Types:</span>
        {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: eventTypeColor(key).dot }} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-80 lg:col-span-2" />
          <Skeleton className="h-80" />
        </div>
      ) : viewMode === "calendar" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 border-gray-200/60">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <CardTitle className="text-base font-semibold text-gray-800">
                  {MONTHS[viewMonth]} {viewYear}
                </CardTitle>
                <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                  <div key={d} className="text-center text-[11px] font-semibold text-gray-400 uppercase py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-white min-h-[72px]" />
                ))}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const dayEvents = eventsByDate.get(dateStr) ?? [];
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDate;

                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      className={`bg-white min-h-[72px] p-1.5 text-left hover:bg-gray-50 transition-colors relative ${isSelected ? "ring-2 ring-emerald-500 ring-inset" : ""}`}
                    >
                      <span className={`text-xs font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${isToday ? "bg-emerald-600 text-white" : "text-gray-700"}`}>
                        {day}
                      </span>
                      {dayEvents.length > 0 && (
                        <div className="mt-0.5 space-y-0.5">
                          {dayEvents.slice(0, 2).map((e, idx) => {
                            const tc = eventTypeColor(e.eventType);
                            return (
                              <div
                                key={idx}
                                className={`text-[9px] leading-tight truncate px-1 py-0.5 rounded ${tc.bg} ${tc.text}`}
                              >
                                {e.studentName.split(" ")[1] ?? e.studentName}
                              </div>
                            );
                          })}
                          {dayEvents.length > 2 && (
                            <div className="text-[9px] text-gray-400 px-1">+{dayEvents.length - 2} more</div>
                          )}
                        </div>
                      )}
                      {dayEvents.length > 0 && (
                        <div className="absolute top-1.5 right-1.5 flex gap-0.5">
                          {dayEvents.map((e, idx) => {
                            const tc = eventTypeColor(e.eventType);
                            return <div key={idx} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tc.dot }} />;
                          }).slice(0, 3)}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-gray-200/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-700">
                {selectedDate
                  ? `Events — ${new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                  : "Select a Date"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDate && selectedEvents.length > 0 ? (
                <div className="space-y-3">
                  {selectedEvents.map((e) => (
                    <EventCard key={e.id} event={e} />
                  ))}
                </div>
              ) : selectedDate ? (
                <div className="py-8 text-center text-sm text-gray-400">
                  <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  No events on this date
                </div>
              ) : (
                <div className="py-8 text-center text-sm text-gray-400">
                  <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  Click a date to view events
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="border-gray-200/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-700">
              Active Deadlines ({filteredListEvents.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredListEvents.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {filteredListEvents.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-gray-400">No upcoming deadlines</div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`rounded-xl px-4 py-3 text-center ${color}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-[11px] font-medium mt-0.5">{label}</p>
    </div>
  );
}

function EventCard({ event: e }: { event: CalendarEvent }) {
  const cfg = STATUS_CONFIG[e.status] ?? STATUS_CONFIG.upcoming;
  const tc = eventTypeColor(e.eventType);
  const Icon = cfg.icon;
  return (
    <Link href={`/students/${e.studentId}`}>
      <div className="p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-all cursor-pointer group">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tc.dot }} />
            <span className="text-sm font-medium text-gray-800 truncate">{e.studentName}</span>
          </div>
          <Badge variant="outline" className={`text-[10px] font-medium flex-shrink-0 ${tc.badgeCls}`}>
            {EVENT_TYPE_LABELS[e.eventType] ?? e.eventType}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-3 h-3 flex-shrink-0 text-gray-400" />
          <span className={`text-[11px] font-medium ${cfg.className.includes("red") ? "text-red-600" : "text-gray-500"}`}>{cfg.label}</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-gray-400">
            {e.daysRemaining < 0 ? `${Math.abs(e.daysRemaining)}d overdue` : e.daysRemaining === 0 ? "Due today" : `${e.daysRemaining}d remaining`}
          </span>
          {e.grade && <span className="text-[11px] text-gray-400">Grade {e.grade}</span>}
        </div>
      </div>
    </Link>
  );
}

function EventRow({ event: e }: { event: CalendarEvent }) {
  const cfg = STATUS_CONFIG[e.status] ?? STATUS_CONFIG.upcoming;
  const tc = eventTypeColor(e.eventType);
  return (
    <Link href={`/students/${e.studentId}`}>
      <div className="flex items-center gap-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer group px-2 rounded-lg">
        <div className="w-12 text-center flex-shrink-0">
          <p className="text-lg font-bold text-gray-800">{new Date(e.dueDate + "T12:00:00").getDate()}</p>
          <p className="text-[10px] text-gray-400 uppercase">{new Date(e.dueDate + "T12:00:00").toLocaleDateString("en-US", { month: "short" })}</p>
        </div>
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: tc.dot }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800 truncate">{e.studentName}</span>
            {e.grade && <span className="text-[11px] text-gray-400">Gr. {e.grade}</span>}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{EVENT_TYPE_LABELS[e.eventType] ?? e.eventType}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className={`text-xs font-medium ${e.daysRemaining < 0 ? "text-red-500" : e.daysRemaining <= 7 ? "text-red-400" : "text-gray-400"}`}>
            {e.daysRemaining < 0 ? `${Math.abs(e.daysRemaining)}d late` : e.daysRemaining === 0 ? "Today" : `${e.daysRemaining}d`}
          </span>
          <Badge variant="outline" className={`text-[10px] font-medium ${tc.badgeCls}`}>{EVENT_TYPE_LABELS[e.eventType] ?? e.eventType}</Badge>
          <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-emerald-500 transition-colors" />
        </div>
      </div>
    </Link>
  );
}
