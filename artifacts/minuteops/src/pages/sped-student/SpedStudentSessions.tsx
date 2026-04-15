import { useEffect, useState } from "react";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, XCircle, AlertCircle, Calendar, MapPin, User } from "lucide-react";
import { getStudentSessions, customFetch } from "@workspace/api-client-react";

const SERVICE_COLORS: Record<string, string> = {
  "Speech-Language Therapy": "bg-blue-50 text-blue-700",
  "ABA/Behavior Intervention": "bg-emerald-50 text-emerald-700",
  "Occupational Therapy": "bg-amber-50 text-amber-700",
  "Physical Therapy": "bg-teal-50 text-teal-700",
  "Para Support": "bg-gray-50 text-gray-600",
  "Counseling Services": "bg-rose-50 text-rose-700",
};

function getServiceColor(name: string) {
  for (const [key, val] of Object.entries(SERVICE_COLORS)) {
    if ((name || "").toLowerCase().includes(key.toLowerCase().split(" ")[0].toLowerCase())) return val;
  }
  return "bg-gray-100 text-gray-600";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle className="w-4 h-4 text-emerald-500" />;
  if (status === "missed") return <XCircle className="w-4 h-4 text-red-400" />;
  return <AlertCircle className="w-4 h-4 text-amber-400" />;
}

interface ScheduleBlock {
  id: number;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location: string | null;
  blockLabel: string | null;
  staffFirstName: string | null;
  staffLastName: string | null;
  serviceTypeName: string | null;
}

const DAY_ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const DAY_LABELS: Record<string, string> = { monday: "Mon", tuesday: "Tue", wednesday: "Wed", thursday: "Thu", friday: "Fri" };

function formatTime12(t: string): string {
  if (!t) return t;
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function SpedStudentSessions() {
  const { studentId } = useRole();
  const [sessions, setSessions] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<ScheduleBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"history" | "schedule">("history");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    Promise.all([
      getStudentSessions(studentId, { limit: 60 }),
      customFetch<ScheduleBlock[]>(`/api/student-portal/schedule?studentId=${studentId}`),
    ]).then(([sess, sched]) => {
      setSessions(Array.isArray(sess) ? sess : []);
      setSchedule(Array.isArray(sched) ? sched : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [studentId]);

  if (!studentId) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="p-8 text-center text-gray-400 bg-white rounded-xl border">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No student selected</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 md:p-6 space-y-3 max-w-4xl mx-auto">{[1,2,3,4,5].map(i=><div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse"/>)}</div>;
  }

  const completed = sessions.filter(s => s.status === "completed").length;
  const missed = sessions.filter(s => s.status === "missed").length;
  const totalMinutes = sessions.filter(s => s.status === "completed").reduce((sum: number, s: any) => sum + (s.durationMinutes || 0), 0);

  const paginated = sessions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function groupByDate(list: any[]) {
    const groups: Record<string, any[]> = {};
    for (const s of list) {
      const d = s.sessionDate || "Unknown";
      if (!groups[d]) groups[d] = [];
      groups[d].push(s);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }

  const grouped = groupByDate(paginated);

  const groupedSchedule = DAY_ORDER.map(day => ({
    day,
    label: DAY_LABELS[day],
    blocks: schedule.filter(s => s.dayOfWeek === day),
  })).filter(g => g.blocks.length > 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600" />
          My Sessions
        </h1>
        <p className="text-sm text-gray-500 mt-1">Your service sessions and weekly schedule</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xl sm:text-2xl font-bold text-emerald-600">{completed}</p>
            <p className="text-[10px] sm:text-xs text-gray-400 mt-1">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xl sm:text-2xl font-bold text-red-500">{missed}</p>
            <p className="text-[10px] sm:text-xs text-gray-400 mt-1">Missed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <p className="text-xl sm:text-2xl font-bold text-gray-700">{Math.round(totalMinutes / 60)}h</p>
            <p className="text-[10px] sm:text-xs text-gray-400 mt-1">Total Time</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
        <button
          onClick={() => setTab("history")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${tab === "history" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}
        >
          Session History
        </button>
        <button
          onClick={() => setTab("schedule")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${tab === "schedule" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}
        >
          Weekly Schedule
        </button>
      </div>

      {tab === "schedule" && (
        <>
          {groupedSchedule.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No recurring schedule set up yet</p>
              <p className="text-sm mt-1">Your team will add your weekly schedule here</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupedSchedule.map(({ day, label, blocks }) => (
                <div key={day}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{label}</p>
                  <div className="space-y-2">
                    {blocks.map(block => (
                      <Card key={block.id} className="border-gray-100">
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex items-start gap-3">
                            <div className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex-shrink-0 ${getServiceColor(block.serviceTypeName || "")}`}>
                              {formatTime12(block.startTime)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-gray-800">{block.serviceTypeName || block.blockLabel || "Service"}</p>
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                {block.staffFirstName && (
                                  <span className="text-[11px] text-gray-400 flex items-center gap-1">
                                    <User className="w-3 h-3" />
                                    {block.staffFirstName} {block.staffLastName}
                                  </span>
                                )}
                                <span className="text-[11px] text-gray-400">
                                  {formatTime12(block.startTime)} – {formatTime12(block.endTime)}
                                </span>
                                {block.location && (
                                  <span className="text-[11px] text-gray-400 flex items-center gap-1">
                                    <MapPin className="w-3 h-3" />
                                    {block.location}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "history" && (
        <>
          {grouped.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No sessions found</p>
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(([date, daySessions]) => (
                <div key={date}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    {new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                  <div className="space-y-2">
                    {daySessions.map((sess: any) => (
                      <Card key={sess.id} className="border-gray-100">
                        <CardContent className="p-3 sm:p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 flex-1 min-w-0">
                              <StatusIcon status={sess.status} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[13px] font-semibold text-gray-800">{sess.serviceTypeName}</span>
                                  <Badge className={`text-[10px] ${getServiceColor(sess.serviceTypeName)}`} variant="outline">
                                    {sess.durationMinutes} min
                                  </Badge>
                                </div>
                                <p className="text-[12px] text-gray-500 mt-0.5">
                                  with {sess.staffFirst} {sess.staffLast} · {sess.startTime}–{sess.endTime}
                                  {sess.location ? ` · ${sess.location}` : ""}
                                </p>
                                {sess.notes && sess.status === "completed" && (
                                  <p className="text-[12px] text-gray-400 mt-1.5 leading-relaxed line-clamp-2">{sess.notes}</p>
                                )}
                              </div>
                            </div>
                            <Badge
                              variant="outline"
                              className={`flex-shrink-0 text-[10px] capitalize ${
                                sess.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                                sess.status === "missed" ? "bg-red-50 text-red-600 border-red-200" :
                                "bg-amber-50 text-amber-600 border-amber-200"
                              }`}
                            >
                              {sess.status}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="text-sm text-emerald-600 font-medium disabled:text-gray-300 hover:text-emerald-700"
                >
                  Previous
                </button>
                <span className="text-xs text-gray-400">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sessions.length)} of {sessions.length}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={(page + 1) * PAGE_SIZE >= sessions.length}
                  className="text-sm text-emerald-600 font-medium disabled:text-gray-300 hover:text-emerald-700"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
