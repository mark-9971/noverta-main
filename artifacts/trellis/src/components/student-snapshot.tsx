import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { authFetch } from "@/lib/auth-fetch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Target, CalendarDays, Clock, Activity, Shield, AlertTriangle,
  TrendingUp, TrendingDown, Minus, CheckCircle,
  ChevronDown, ChevronUp, FileText, Stethoscope,
  Plus, StickyNote, Calendar, ListChecks
} from "lucide-react";
import { Link } from "wouter";

interface SnapshotGoal {
  id: number;
  goalArea: string;
  goalNumber: number;
  annualGoal: string;
  latestValue: number | null;
  trendDirection: "improving" | "declining" | "stable";
  progressRating: string;
  dataPointCount: number;
}

interface SnapshotDeadline {
  label: string;
  date: string;
  daysUntil: number;
  urgency: "overdue" | "critical" | "soon" | "ok";
}

interface SnapshotSession {
  id: number;
  sessionDate: string;
  durationMinutes: number;
  status: string;
  notes: string | null;
  serviceTypeName: string | null;
  staffName: string | null;
}

interface SnapshotIncident {
  id: number;
  incidentDate: string;
  incidentType: string;
  status: string;
  studentInjury: boolean;
  staffInjury: boolean;
}

interface SnapshotAccommodation {
  id: number;
  category: string;
  description: string;
  setting: string | null;
  frequency: string | null;
}

interface SnapshotAlert {
  id: number;
  type: string;
  severity: string;
  message: string;
  createdAt: string;
}

interface ComplianceStatus {
  servicesOnTrack: number;
  servicesAtRisk: number;
  servicesOutOfCompliance: number;
  totalServices: number;
  iepStatus: string;
  iepExpiring: boolean;
  activeAlertCount: number;
}

interface SnapshotData {
  student: {
    id: number;
    firstName: string;
    lastName: string;
    grade: string;
    status: string;
    schoolName: string | null;
  };
  goals: SnapshotGoal[];
  deadlines: SnapshotDeadline[];
  recentSessions: SnapshotSession[];
  recentIncidents: SnapshotIncident[];
  accommodations: SnapshotAccommodation[];
  complianceStatus: ComplianceStatus;
  activeAlerts: SnapshotAlert[];
}

const RATING_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  mastered: { label: "Mastered", color: "text-emerald-700", bg: "bg-emerald-50" },
  sufficient_progress: { label: "On Track", color: "text-emerald-600", bg: "bg-emerald-50" },
  some_progress: { label: "Some Progress", color: "text-amber-600", bg: "bg-amber-50" },
  insufficient_progress: { label: "Insufficient", color: "text-red-600", bg: "bg-red-50" },
  not_addressed: { label: "No Data", color: "text-gray-400", bg: "bg-gray-50" },
};

const URGENCY_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  overdue: { color: "text-red-700", bg: "bg-red-50", border: "border-red-200" },
  critical: { color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
  soon: { color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  ok: { color: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" },
};

function TrendIcon({ direction }: { direction: string }) {
  if (direction === "improving") return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
  if (direction === "declining") return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-gray-400" />;
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return dateStr;
  }
}

export default function StudentSnapshot({ studentId }: { studentId: number }) {
  const [data, setData] = useState<SnapshotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    authFetch(`/api/students/${studentId}/snapshot`)
      .then(r => {
        if (!r.ok) throw new Error("Failed to load snapshot");
        return r.json();
      })
      .then((d: SnapshotData) => setData(d))
      .catch(() => setError("Unable to load snapshot data"))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}><CardContent className="p-5"><Skeleton className="h-24 w-full" /></CardContent></Card>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-red-200 bg-red-50/30">
        <CardContent className="p-5 text-center">
          <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-600">{error || "Failed to load snapshot"}</p>
        </CardContent>
      </Card>
    );
  }

  const { goals, deadlines, recentSessions, recentIncidents, accommodations, complianceStatus, activeAlerts } = data;

  const goalsByRating = goals.reduce<Record<string, number>>((acc, g) => {
    acc[g.progressRating] = (acc[g.progressRating] || 0) + 1;
    return acc;
  }, {});

  const complianceScore = complianceStatus.totalServices > 0
    ? Math.round((complianceStatus.servicesOnTrack / complianceStatus.totalServices) * 100)
    : 100;

  const hasUrgentDeadlines = deadlines.some(d => d.urgency === "overdue" || d.urgency === "critical");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link href={`/sessions?studentId=${studentId}`}>
          <Button variant="outline" size="sm" className="h-8 text-[11px] gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50" data-testid="button-snapshot-view-sessions">
            <ListChecks className="w-3.5 h-3.5" />
            View Sessions
          </Button>
        </Link>
        <Link href={`/students/${studentId}#sessions`}>
          <Button variant="outline" size="sm" className="h-8 text-[11px] gap-1.5 border-gray-200 text-gray-600 hover:bg-gray-50">
            <StickyNote className="w-3.5 h-3.5" />
            Add Note
          </Button>
        </Link>
        <Link href={`/team-meetings?studentId=${studentId}`}>
          <Button variant="outline" size="sm" className="h-8 text-[11px] gap-1.5 border-gray-200 text-gray-600 hover:bg-gray-50">
            <Calendar className="w-3.5 h-3.5" />
            Schedule Meeting
          </Button>
        </Link>
      </div>

      {hasUrgentDeadlines && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-red-700">Action Required</p>
            <p className="text-[11px] text-red-600 mt-0.5">
              {deadlines.filter(d => d.urgency === "overdue").length > 0
                ? `${deadlines.filter(d => d.urgency === "overdue").length} overdue deadline(s). `
                : ""}
              {deadlines.filter(d => d.urgency === "critical").length > 0
                ? `${deadlines.filter(d => d.urgency === "critical").length} deadline(s) due within 30 days.`
                : ""}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                <Target className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-[11px] text-gray-400 font-medium">Active Goals</p>
            </div>
            <p className="text-2xl font-bold text-gray-800">{goals.length}</p>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {goalsByRating.mastered ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{goalsByRating.mastered} mastered</span> : null}
              {goalsByRating.sufficient_progress ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">{goalsByRating.sufficient_progress} on track</span> : null}
              {goalsByRating.insufficient_progress ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">{goalsByRating.insufficient_progress} behind</span> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${complianceScore >= 80 ? "bg-emerald-50" : complianceScore >= 50 ? "bg-amber-50" : "bg-red-50"}`}>
                <Shield className={`w-4 h-4 ${complianceScore >= 80 ? "text-emerald-600" : complianceScore >= 50 ? "text-amber-600" : "text-red-600"}`} />
              </div>
              <p className="text-[11px] text-gray-400 font-medium">Compliance</p>
            </div>
            <p className="text-2xl font-bold text-gray-800">{complianceScore}%</p>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              <span className="text-[10px] text-gray-400">
                {complianceStatus.servicesOnTrack}/{complianceStatus.totalServices} on track
              </span>
              {complianceStatus.iepExpiring && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">IEP expiring</span>
              )}
              {complianceStatus.iepStatus === "active" && !complianceStatus.iepExpiring && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">IEP current</span>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
                <Activity className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-[11px] text-gray-400 font-medium">Recent Sessions</p>
            </div>
            <p className="text-2xl font-bold text-gray-800">{recentSessions.length}</p>
            <p className="text-[10px] text-gray-400 mt-1">
              {recentSessions.reduce((sum, s) => sum + (s.durationMinutes || 0), 0)} min total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeAlerts.length > 0 ? "bg-red-50" : "bg-gray-50"}`}>
                <AlertTriangle className={`w-4 h-4 ${activeAlerts.length > 0 ? "text-red-500" : "text-gray-400"}`} />
              </div>
              <p className="text-[11px] text-gray-400 font-medium">Active Alerts</p>
            </div>
            <p className="text-2xl font-bold text-gray-800">{activeAlerts.length}</p>
            <p className="text-[10px] text-gray-400 mt-1">
              {recentIncidents.length} recent incident{recentIncidents.length !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-[13px] font-semibold text-gray-700 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-amber-600" />
            Upcoming Deadlines
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-4">
          {deadlines.length === 0 ? (
            <p className="text-[12px] text-gray-400 py-3">No upcoming deadlines</p>
          ) : (
            <div className="space-y-2">
              {deadlines.map((dl, i) => {
                const cfg = URGENCY_CONFIG[dl.urgency];
                return (
                  <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg border ${cfg.border} ${cfg.bg}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[12px] font-semibold ${cfg.color}`}>{dl.label}</p>
                      <p className="text-[11px] text-gray-500">{formatDate(dl.date)}</p>
                    </div>
                    <span className={`text-[11px] font-bold ${cfg.color} whitespace-nowrap`}>
                      {dl.daysUntil < 0 ? `${Math.abs(dl.daysUntil)}d overdue` : dl.daysUntil === 0 ? "Today" : `${dl.daysUntil}d`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-[13px] font-semibold text-gray-700 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-600" />
              Recent Sessions
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {recentSessions.length === 0 ? (
              <p className="text-[12px] text-gray-400 py-3">No recent sessions</p>
            ) : (
              <div className="space-y-1.5">
                {recentSessions.map(session => {
                  const isExpanded = expandedSessionId === session.id;
                  return (
                    <div key={session.id} className={`rounded-lg border transition-colors ${isExpanded ? "border-blue-100 bg-blue-50/30" : "border-gray-50 hover:bg-gray-50/50"}`}>
                      <button
                        onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                        className="flex items-center gap-3 py-2 px-2.5 w-full text-left"
                      >
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${session.status === "completed" ? "bg-emerald-400" : session.status === "cancelled" ? "bg-red-400" : "bg-amber-400"}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-gray-700 truncate">
                            {session.serviceTypeName || "Session"}
                            {session.staffName ? ` · ${session.staffName}` : ""}
                          </p>
                          <p className="text-[10px] text-gray-400">{formatDate(session.sessionDate)}</p>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span className="text-[11px] text-gray-500">{session.durationMinutes}m</span>
                          {session.notes ? (
                            isExpanded ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />
                          ) : null}
                        </div>
                      </button>
                      {isExpanded && session.notes && (
                        <div className="px-3 pb-2.5 pt-0">
                          <div className="flex items-start gap-1.5 p-2 bg-white rounded border border-gray-100">
                            <FileText className="w-3 h-3 text-gray-400 mt-0.5 flex-shrink-0" />
                            <p className="text-[11px] text-gray-600 whitespace-pre-wrap">{session.notes}</p>
                          </div>
                        </div>
                      )}
                      {isExpanded && !session.notes && (
                        <div className="px-3 pb-2.5 pt-0">
                          <p className="text-[10px] text-gray-400 italic">No notes recorded for this session</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-[13px] font-semibold text-gray-700 flex items-center gap-2">
              <Shield className="w-4 h-4 text-red-500" />
              Safety & Incidents
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            {recentIncidents.length === 0 ? (
              <div className="flex items-center gap-2 py-3">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <p className="text-[12px] text-gray-500">No recent incidents</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentIncidents.map(incident => (
                  <div key={incident.id} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                    <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 ${incident.studentInjury || incident.staffInjury ? "text-red-500" : "text-amber-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-gray-700 capitalize">
                        {incident.incidentType.replace(/_/g, " ")}
                      </p>
                      <p className="text-[10px] text-gray-400">{formatDate(incident.incidentDate)}</p>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      incident.status === "finalized" ? "bg-emerald-50 text-emerald-600" :
                      incident.status === "draft" ? "bg-gray-100 text-gray-500" :
                      "bg-amber-50 text-amber-600"
                    }`}>
                      {incident.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {accommodations.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-[13px] font-semibold text-gray-700 flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-violet-600" />
              Active Accommodations
              <span className="text-[10px] bg-violet-50 text-violet-600 px-1.5 py-0.5 rounded-full font-medium">{accommodations.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {accommodations.map(acc => (
                <div key={acc.id} className="p-2.5 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium capitalize">{acc.category}</span>
                    {acc.setting && <span className="text-[10px] text-gray-400">{acc.setting}</span>}
                  </div>
                  <p className="text-[11px] text-gray-600 line-clamp-2">{acc.description}</p>
                  {acc.frequency && <p className="text-[10px] text-gray-400 mt-1">{acc.frequency}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {activeAlerts.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-[13px] font-semibold text-amber-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Active Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-4">
            <div className="space-y-1.5">
              {activeAlerts.map(alert => (
                <div key={alert.id} className={`flex items-start gap-2.5 p-2.5 rounded-lg ${
                  alert.severity === "critical" ? "bg-red-50" : alert.severity === "high" ? "bg-amber-50" : "bg-gray-50"
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${
                    alert.severity === "critical" ? "bg-red-500" : alert.severity === "high" ? "bg-amber-500" : "bg-gray-400"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-gray-700">{alert.message}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{alert.type.replace(/_/g, " ")} · {formatDate(alert.createdAt.slice(0, 10))}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
