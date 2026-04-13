import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Clock, CheckCircle, CalendarDays, ChevronRight, Star, User, BookOpen } from "lucide-react";

const API = (import.meta as any).env.VITE_API_URL || "/api";

function subjectColor(name: string) {
  const n = name.toLowerCase();
  if (n.includes("speech") || n.includes("language")) return "bg-blue-100 text-blue-700";
  if (n.includes("aba") || n.includes("behavior")) return "bg-purple-100 text-purple-700";
  if (n.includes("occupational") || n.includes("ot")) return "bg-amber-100 text-amber-700";
  if (n.includes("physical") || n.includes("pt")) return "bg-green-100 text-green-700";
  if (n.includes("para") || n.includes("support")) return "bg-pink-100 text-pink-700";
  if (n.includes("counseling")) return "bg-teal-100 text-teal-700";
  return "bg-gray-100 text-gray-600";
}

export default function SpedStudentDashboard() {
  const { studentId } = useRole();
  const [student, setStudent] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    Promise.all([
      fetch(`${API}/students/${studentId}`).then(r => r.json()),
      fetch(`${API}/students/${studentId}/sessions?limit=5`).then(r => r.json()),
    ]).then(([s, sess]) => {
      setStudent(s);
      setSessions(Array.isArray(sess) ? sess : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [studentId]);

  if (!studentId) {
    return (
      <div className="p-6">
        <SelectSpedStudentPrompt />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  const services = student?.serviceRequirements || [];
  const completedToday = sessions.filter(s => s.status === "completed" && s.sessionDate === new Date().toISOString().split("T")[0]).length;
  const recentCompleted = sessions.filter(s => s.status === "completed").slice(0, 3);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Hello, {student?.firstName}!
          </h1>
          <p className="text-gray-500 mt-1">
            {student?.programName || "Special Education"} · Grade {student?.grade}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-400">Case Manager</p>
          <p className="text-sm font-medium text-gray-600">{student?.caseManagerName || "—"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "My Services", value: services.length, icon: Brain, color: "bg-violet-50 text-violet-600" },
          { label: "Sessions Today", value: completedToday, icon: CheckCircle, color: "bg-green-50 text-green-600" },
          { label: "Recent Sessions", value: recentCompleted.length, icon: Clock, color: "bg-blue-50 text-blue-600" },
          { label: "IEP Goals", value: services.length, icon: Star, color: "bg-amber-50 text-amber-600" },
        ].map(m => (
          <Card key={m.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${m.color}`}>
                <m.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-gray-400">{m.label}</p>
                <p className="text-xl font-bold text-gray-800">{m.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-600">My Support Services</CardTitle>
            <Link href="/sped-portal/services" className="text-xs text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {services.slice(0, 4).map((svc: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                <div className={`text-[11px] font-semibold px-2 py-1 rounded-full ${subjectColor(svc.serviceTypeName || "")}`}>
                  {(svc.serviceTypeName || "Service").split(" ")[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-700 truncate">{svc.serviceTypeName || "Support Service"}</p>
                  <p className="text-[11px] text-gray-400">{svc.requiredMinutes || 0} min/week · {svc.deliveryType || "direct"}</p>
                </div>
              </div>
            ))}
            {services.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">No active services found</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-600">Recent Sessions</CardTitle>
            <Link href="/sped-portal/sessions" className="text-xs text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {sessions.slice(0, 4).map((sess: any) => (
              <div key={sess.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sess.status === "completed" ? "bg-green-500" : "bg-amber-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-700 truncate">{sess.serviceTypeName}</p>
                  <p className="text-[11px] text-gray-400">{sess.sessionDate} · {sess.durationMinutes}min · {sess.staffFirst} {sess.staffLast}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] ${sess.status === "completed" ? "text-green-600 border-green-200" : "text-amber-600 border-amber-200"}`}>
                  {sess.status}
                </Badge>
              </div>
            ))}
            {sessions.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">No recent sessions</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-violet-100 bg-violet-50/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-violet-800">Your IEP Support Team is here for you</p>
              <p className="text-xs text-violet-600 mt-0.5">
                You have {services.length} active support {services.length === 1 ? "service" : "services"} working to help you succeed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SelectSpedStudentPrompt() {
  const { setStudentId } = useRole();
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`${API}/sped-students`).then(r => r.json()).then(d => {
      setStudents(Array.isArray(d) ? d : []);
    }).catch(() => {});
  }, []);

  const filtered = students.filter(s =>
    `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card className="max-w-lg mx-auto mt-8">
      <CardHeader>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <Brain className="w-4 h-4 text-violet-600" />
          </div>
          <CardTitle>Select a Student</CardTitle>
        </div>
        <p className="text-sm text-gray-500">Choose a student on an IEP to view their SPED portal</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          type="text"
          placeholder="Search students..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <div className="max-h-72 overflow-y-auto space-y-1">
          {filtered.map(s => (
            <button
              key={s.id}
              onClick={() => setStudentId(s.id, `${s.firstName} ${s.lastName}`)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-violet-50 transition-colors flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 text-xs font-bold">
                {s.firstName[0]}{s.lastName[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">{s.firstName} {s.lastName}</p>
                <p className="text-xs text-gray-400">Grade {s.grade} · {s.programName || "SPED"} · CM: {s.caseManagerFirst} {s.caseManagerLast}</p>
              </div>
            </button>
          ))}
          {filtered.length === 0 && search && (
            <p className="text-sm text-gray-400 text-center py-4">No students found</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
