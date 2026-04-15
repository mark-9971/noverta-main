import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, Clock, CheckCircle, ChevronRight, Star, BookOpen, Heart, Trophy, Flame, Calendar } from "lucide-react";
import { getStudent, getStudentSessions, listSpedStudents, customFetch } from "@workspace/api-client-react";

function subjectColor(name: string) {
  const n = name.toLowerCase();
  if (n.includes("speech") || n.includes("language")) return "bg-blue-50 text-blue-700";
  if (n.includes("aba") || n.includes("behavior")) return "bg-emerald-50 text-emerald-700";
  if (n.includes("occupational") || n.includes("ot")) return "bg-amber-50 text-amber-700";
  if (n.includes("physical") || n.includes("pt")) return "bg-teal-50 text-teal-700";
  if (n.includes("para") || n.includes("support")) return "bg-gray-50 text-gray-600";
  if (n.includes("counseling")) return "bg-rose-50 text-rose-700";
  return "bg-gray-100 text-gray-600";
}

interface Goal {
  id: number;
  goalArea: string;
  annualGoal: string;
  recentSessionCount: number;
}

interface Win {
  id: number;
  type: string;
  title: string;
  createdAt: string;
}

interface Streak {
  currentStreak: number;
  totalCheckIns: number;
}

function MiniProgressRing({ percent, size = 36 }: { percent: number; size?: number }) {
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90 flex-shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#10b981"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-gray-600 font-bold"
        fontSize={9}
        transform={`rotate(90, ${size / 2}, ${size / 2})`}
      >
        {percent}%
      </text>
    </svg>
  );
}

export default function SpedStudentDashboard() {
  const { studentId } = useRole();
  const [student, setStudent] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [wins, setWins] = useState<Win[]>([]);
  const [streak, setStreak] = useState<Streak>({ currentStreak: 0, totalCheckIns: 0 });
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    const today = new Date().toISOString().split("T")[0];
    Promise.all([
      getStudent(studentId),
      getStudentSessions(studentId, { limit: 5 }),
      customFetch<Goal[]>(`/api/student-portal/goals?studentId=${studentId}`),
      customFetch<Win[]>(`/api/student-portal/wins?studentId=${studentId}&limit=3`),
      customFetch<Streak>(`/api/student-portal/streak?studentId=${studentId}`),
      customFetch<any[]>(`/api/student-portal/check-ins?studentId=${studentId}&limit=1`),
    ]).then(([s, sess, g, w, st, ci]) => {
      setStudent(s);
      setSessions(Array.isArray(sess) ? sess : []);
      setGoals(Array.isArray(g) ? g : []);
      setWins(Array.isArray(w) ? w : []);
      setStreak(st || { currentStreak: 0, totalCheckIns: 0 });
      const latestCheckIn = Array.isArray(ci) ? ci[0] : null;
      if (latestCheckIn?.checkInDate === today) setCheckedInToday(true);
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
      <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">
        {[1, 2, 3].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl animate-pulse" />)}
      </div>
    );
  }

  const services = student?.serviceRequirements || [];
  const completedToday = sessions.filter((s: any) => s.status === "completed" && s.sessionDate === new Date().toISOString().split("T")[0]).length;
  const recentCompleted = sessions.filter((s: any) => s.status === "completed").slice(0, 3);

  function estimateProgress(goal: Goal): number {
    if (goal.recentSessionCount === 0) return 5;
    return Math.min(95, goal.recentSessionCount * 8 + 10);
  }

  const avgProgress = goals.length > 0 ? Math.round(goals.reduce((sum, g) => sum + estimateProgress(g), 0) / goals.length) : 0;

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-800">
            Hello, {student?.firstName}!
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {student?.programName || "Special Education"} · Grade {student?.grade}
          </p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-xs text-gray-400">Case Manager</p>
          <p className="text-sm font-medium text-gray-600">{student?.caseManagerName || "—"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "My Goals", value: goals.length, icon: Star, color: "bg-amber-50 text-amber-600" },
          { label: "Sessions Today", value: completedToday, icon: CheckCircle, color: "bg-emerald-100 text-emerald-700" },
          { label: "Streak", value: `${streak.currentStreak}d`, icon: Flame, color: "bg-orange-50 text-orange-600" },
          { label: "Wins", value: wins.length, icon: Trophy, color: "bg-rose-50 text-rose-600" },
        ].map(m => (
          <Card key={m.label}>
            <CardContent className="p-3 sm:p-4 flex items-center gap-3">
              <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center ${m.color}`}>
                <m.icon className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <p className="text-[10px] sm:text-xs text-gray-400">{m.label}</p>
                <p className="text-lg sm:text-xl font-bold text-gray-800">{m.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!checkedInToday && (
        <Link href="/sped-portal/check-in">
          <Card className="border-emerald-200 bg-emerald-50/50 cursor-pointer hover:bg-emerald-50 transition-colors">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                <Heart className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-emerald-800">Daily Check-In</p>
                <p className="text-xs text-emerald-600 mt-0.5">Take a moment to reflect on how you're doing today</p>
              </div>
              <ChevronRight className="w-5 h-5 text-emerald-400" />
            </CardContent>
          </Card>
        </Link>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-600">Goal Progress</CardTitle>
            <Link href="/sped-portal/goals" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {goals.slice(0, 3).map(goal => {
              const pct = estimateProgress(goal);
              return (
                <div key={goal.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                  <MiniProgressRing percent={pct} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-700 line-clamp-1">{goal.annualGoal}</p>
                    <p className="text-[11px] text-gray-400">{goal.goalArea} · {goal.recentSessionCount} sessions</p>
                  </div>
                </div>
              );
            })}
            {goals.length === 0 && (
              <p className="text-sm text-gray-400 py-4 text-center">No active goals yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-600">Recent Sessions</CardTitle>
            <Link href="/sped-portal/sessions" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {sessions.slice(0, 4).map((sess: any) => (
              <div key={sess.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${sess.status === "completed" ? "bg-emerald-500" : "bg-amber-400"}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-gray-700 truncate">{sess.serviceTypeName}</p>
                  <p className="text-[11px] text-gray-400">{sess.sessionDate} · {sess.durationMinutes}min · {sess.staffFirst} {sess.staffLast}</p>
                </div>
                <Badge variant="outline" className={`text-[10px] ${sess.status === "completed" ? "text-emerald-600 border-emerald-200" : "text-amber-600 border-amber-200"}`}>
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

      {wins.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-500" /> Recent Wins
            </CardTitle>
            <Link href="/sped-portal/wins" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
              View all <ChevronRight className="w-3 h-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {wins.map(win => (
              <div key={win.id} className="flex items-center gap-3 p-2 rounded-lg bg-amber-50/50">
                <Star className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <p className="text-[13px] text-gray-700 flex-1 truncate">{win.title}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="border-emerald-100 bg-emerald-50/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">Your IEP Support Team is here for you</p>
              <p className="text-xs text-emerald-600 mt-0.5">
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
    listSpedStudents().then(d => {
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
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Brain className="w-4 h-4 text-emerald-600" />
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
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <div className="max-h-72 overflow-y-auto space-y-1">
          {filtered.map(s => (
            <button
              key={s.id}
              onClick={() => setStudentId(s.id, `${s.firstName} ${s.lastName}`)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 text-xs font-bold">
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
