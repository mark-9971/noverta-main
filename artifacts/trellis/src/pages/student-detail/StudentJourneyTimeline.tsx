import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { authFetch } from "@/lib/auth-fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle,
  XCircle,
  FileText,
  Target,
  Shield,
  AlertTriangle,
  Mail,
  UserCheck,
  Star,
  TrendingUp,
  ChevronDown,
  Clock,
} from "lucide-react";

type JourneyEventType =
  | "session_delivered"
  | "session_missed"
  | "iep_created"
  | "iep_annual_review"
  | "goal_added"
  | "goal_milestone"
  | "goal_mastered"
  | "compliance_event"
  | "incident"
  | "communication"
  | "enrollment";

interface JourneyEvent {
  id: string;
  type: JourneyEventType;
  date: string;
  time: string | null;
  title: string;
  description: string;
  linkTo: string | null;
  meta?: Record<string, unknown>;
}

interface JourneyResponse {
  events: JourneyEvent[];
  nextCursor: string | null;
  windowStart: string;
  windowEnd: string;
}

const EVENT_CONFIG: Record<
  JourneyEventType,
  { icon: React.ElementType; iconBg: string; iconColor: string; badgeBg: string; badgeColor: string; label: string }
> = {
  session_delivered: {
    icon: CheckCircle,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    badgeBg: "bg-emerald-50",
    badgeColor: "text-emerald-700",
    label: "Session",
  },
  session_missed: {
    icon: XCircle,
    iconBg: "bg-red-100",
    iconColor: "text-red-500",
    badgeBg: "bg-red-50",
    badgeColor: "text-red-700",
    label: "Missed",
  },
  iep_created: {
    icon: FileText,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    badgeBg: "bg-blue-50",
    badgeColor: "text-blue-700",
    label: "IEP",
  },
  iep_annual_review: {
    icon: FileText,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    badgeBg: "bg-blue-50",
    badgeColor: "text-blue-700",
    label: "Annual Review",
  },
  goal_added: {
    icon: Target,
    iconBg: "bg-violet-100",
    iconColor: "text-violet-600",
    badgeBg: "bg-violet-50",
    badgeColor: "text-violet-700",
    label: "Goal",
  },
  goal_milestone: {
    icon: TrendingUp,
    iconBg: "bg-indigo-100",
    iconColor: "text-indigo-500",
    badgeBg: "bg-indigo-50",
    badgeColor: "text-indigo-700",
    label: "Progress",
  },
  goal_mastered: {
    icon: Star,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-500",
    badgeBg: "bg-amber-50",
    badgeColor: "text-amber-700",
    label: "Mastered",
  },
  compliance_event: {
    icon: Shield,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-500",
    badgeBg: "bg-orange-50",
    badgeColor: "text-orange-700",
    label: "Compliance",
  },
  incident: {
    icon: AlertTriangle,
    iconBg: "bg-rose-100",
    iconColor: "text-rose-600",
    badgeBg: "bg-rose-50",
    badgeColor: "text-rose-700",
    label: "Incident",
  },
  communication: {
    icon: Mail,
    iconBg: "bg-teal-100",
    iconColor: "text-teal-600",
    badgeBg: "bg-teal-50",
    badgeColor: "text-teal-700",
    label: "Communication",
  },
  enrollment: {
    icon: UserCheck,
    iconBg: "bg-gray-100",
    iconColor: "text-gray-500",
    badgeBg: "bg-gray-50",
    badgeColor: "text-gray-600",
    label: "Enrollment",
  },
};

function formatMonthYear(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(timeStr: string) {
  const [h, m] = timeStr.split(":");
  const hr = parseInt(h, 10);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

function groupByMonth(events: JourneyEvent[]): Array<{ monthKey: string; monthLabel: string; events: JourneyEvent[] }> {
  const groups: Map<string, JourneyEvent[]> = new Map();
  for (const ev of events) {
    const key = ev.date.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ev);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, evs]) => ({
      monthKey: key,
      monthLabel: formatMonthYear(key + "-01"),
      events: evs,
    }));
}

interface Props {
  studentId: number;
}

export default function StudentJourneyTimeline({ studentId }: Props) {
  const [, navigate] = useLocation();
  const [events, setEvents] = useState<JourneyEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJourney = useCallback(
    async (cursor?: string, append = false) => {
      if (!append) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      setError(null);
      try {
        const params = new URLSearchParams({ limit: "80" });
        if (cursor) params.set("cursor", cursor);
        const res = await authFetch(`/api/students/${studentId}/journey?${params}`);
        if (!res.ok) throw new Error("Failed to load journey");
        const data: JourneyResponse = await res.json();

        if (append) {
          setEvents(prev => {
            const existingIds = new Set(prev.map(e => e.id));
            const newEvs = data.events.filter(e => !existingIds.has(e.id));
            return [...prev, ...newEvs];
          });
        } else {
          setEvents(data.events);
        }
        setNextCursor(data.nextCursor);
      } catch {
        setError("Could not load journey events.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [studentId],
  );

  useEffect(() => {
    loadJourney();
  }, [loadJourney]);

  function handleEventClick(ev: JourneyEvent) {
    if (ev.linkTo) {
      navigate(ev.linkTo);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            Student Journey
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-gray-400">
          {error}
          <br />
          <button
            onClick={() => loadJourney()}
            className="mt-2 text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Retry
          </button>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            Student Journey
          </CardTitle>
        </CardHeader>
        <CardContent className="py-8 text-center text-sm text-gray-400">
          No events found in the last 6 months.
        </CardContent>
      </Card>
    );
  }

  const grouped = groupByMonth(events);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          Student Journey
          <span className="ml-auto text-[11px] font-normal text-gray-400">
            {events.length} events · last 6 months
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.monthKey}>
              {/* Month heading */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">
                  {group.monthLabel}
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* Events for this month */}
              <div className="space-y-0.5 relative">
                {/* Vertical connector line */}
                <div className="absolute left-4 top-5 bottom-5 w-px bg-gray-100 z-0" aria-hidden="true" />

                {group.events.map(ev => {
                  const cfg = EVENT_CONFIG[ev.type] ?? EVENT_CONFIG.enrollment;
                  const Icon = cfg.icon;
                  const isClickable = !!ev.linkTo;

                  return (
                    <div
                      key={ev.id}
                      onClick={() => handleEventClick(ev)}
                      role={isClickable ? "button" : undefined}
                      tabIndex={isClickable ? 0 : undefined}
                      onKeyDown={
                        isClickable
                          ? e => {
                              if (e.key === "Enter" || e.key === " ") handleEventClick(ev);
                            }
                          : undefined
                      }
                      className={`relative z-10 flex items-start gap-3 p-2.5 rounded-lg transition-colors ${
                        isClickable
                          ? "cursor-pointer hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-300"
                          : ""
                      }`}
                    >
                      {/* Icon */}
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.iconBg}`}
                        aria-hidden="true"
                      >
                        <Icon className={`w-4 h-4 ${cfg.iconColor}`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${cfg.badgeBg} ${cfg.badgeColor}`}
                          >
                            {cfg.label}
                          </span>
                          <span className="text-[13px] font-medium text-gray-800 truncate">{ev.title}</span>
                        </div>
                        {ev.description && (
                          <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{ev.description}</p>
                        )}
                      </div>

                      {/* Date + time */}
                      <div className="text-right flex-shrink-0 pt-0.5">
                        <span className="text-[10px] text-gray-400 whitespace-nowrap block">
                          {formatDate(ev.date)}
                        </span>
                        {ev.time && (
                          <span className="text-[10px] text-gray-300 whitespace-nowrap block">
                            {formatTime(ev.time)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Load more */}
        {nextCursor && (
          <div className="mt-4 text-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadJourney(nextCursor, true)}
              disabled={loadingMore}
              className="text-xs gap-1.5"
            >
              {loadingMore ? (
                "Loading…"
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Load earlier events
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
