import { useEffect, useState } from "react";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";

const API = (import.meta as any).env.VITE_API_URL || "/api";

const SERVICE_COLORS: Record<string, string> = {
  "Speech-Language Therapy": "bg-blue-100 text-blue-700",
  "ABA/Behavior Intervention": "bg-purple-100 text-purple-700",
  "Occupational Therapy": "bg-amber-100 text-amber-700",
  "Physical Therapy": "bg-green-100 text-green-700",
  "Para Support": "bg-pink-100 text-pink-700",
  "Counseling Services": "bg-teal-100 text-teal-700",
};

function getServiceColor(name: string) {
  for (const [key, val] of Object.entries(SERVICE_COLORS)) {
    if ((name || "").toLowerCase().includes(key.toLowerCase().split(" ")[0].toLowerCase())) return val;
  }
  return "bg-violet-100 text-violet-700";
}

function StatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle className="w-4 h-4 text-green-500" />;
  if (status === "missed") return <XCircle className="w-4 h-4 text-red-400" />;
  return <AlertCircle className="w-4 h-4 text-amber-400" />;
}

export default function SpedStudentSessions() {
  const { studentId } = useRole();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 15;

  useEffect(() => {
    if (!studentId) return;
    fetch(`${API}/students/${studentId}/sessions?limit=60`)
      .then(r => r.json())
      .then(d => { setSessions(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [studentId]);

  if (!studentId) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="p-8 text-center text-slate-400 bg-white rounded-xl border">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No student selected</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 space-y-3">{[1,2,3,4,5].map(i=><div key={i} className="h-20 bg-slate-200 rounded-xl animate-pulse"/>)}</div>;
  }

  const completed = sessions.filter(s => s.status === "completed").length;
  const missed = sessions.filter(s => s.status === "missed").length;
  const totalMinutes = sessions.filter(s => s.status === "completed").reduce((sum, s) => sum + (s.durationMinutes || 0), 0);

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

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Clock className="w-6 h-6 text-violet-500" />
          My Sessions
        </h1>
        <p className="text-slate-500 mt-1">Recent service delivery sessions with your support team</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{completed}</p>
            <p className="text-xs text-slate-400 mt-1">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{missed}</p>
            <p className="text-xs text-slate-400 mt-1">Missed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-violet-600">{Math.round(totalMinutes / 60)}h</p>
            <p className="text-xs text-slate-400 mt-1">Total Time</p>
          </CardContent>
        </Card>
      </div>

      {grouped.length === 0 ? (
        <div className="text-center text-slate-400 py-12">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No sessions found</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([date, daySessions]) => (
            <div key={date}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                {new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <div className="space-y-2">
                {daySessions.map((sess: any) => (
                  <Card key={sess.id} className="border-slate-100">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <StatusIcon status={sess.status} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-semibold text-slate-800">{sess.serviceTypeName}</span>
                              <Badge className={`text-[10px] ${getServiceColor(sess.serviceTypeName)}`} variant="outline">
                                {sess.durationMinutes} min
                              </Badge>
                            </div>
                            <p className="text-[12px] text-slate-500 mt-0.5">
                              with {sess.staffFirst} {sess.staffLast} · {sess.startTime}–{sess.endTime} · {sess.location}
                            </p>
                            {sess.notes && sess.status === "completed" && (
                              <p className="text-[12px] text-slate-400 mt-1.5 leading-relaxed line-clamp-2">{sess.notes}</p>
                            )}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`flex-shrink-0 text-[10px] capitalize ${
                            sess.status === "completed" ? "bg-green-50 text-green-700 border-green-200" :
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
              className="text-sm text-violet-600 font-medium disabled:text-slate-300 hover:text-violet-700"
            >
              ← Previous
            </button>
            <span className="text-xs text-slate-400">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sessions.length)} of {sessions.length}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= sessions.length}
              className="text-sm text-violet-600 font-medium disabled:text-slate-300 hover:text-violet-700"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
