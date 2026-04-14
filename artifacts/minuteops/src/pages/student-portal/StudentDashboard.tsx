import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Clock, Award, AlertCircle, ChevronRight, Calendar, TrendingUp } from "lucide-react";
import { apiGet } from "@/lib/api";

export default function StudentDashboard() {
  const { studentId } = useRole();
  const [data, setData] = useState<any>(null);
  const [grades, setGrades] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    Promise.all([
      apiGet(`/api/student/${studentId}/dashboard`),
      apiGet(`/api/students/${studentId}/grades-summary`),
    ]).then(([d, g]) => {
      setData(d);
      setGrades(g);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [studentId]);

  if (!studentId) {
    return (
      <div className="p-6">
        <SelectStudentPrompt />
      </div>
    );
  }

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl" />)}</div></div>;

  const upcoming = data?.upcomingAssignments || [];
  const recentGrades = data?.recentGrades || [];
  const classes = data?.enrolledClasses || [];
  const overall = grades?.overall || {};

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Welcome back!</h1>
        <p className="text-gray-500 mt-1">Here's your academic overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={BookOpen} label="Classes" value={classes.length} color="gray" />
        <StatCard icon={Award} label="GPA" value={overall.gpa?.toFixed(1) || "—"} color="emerald" />
        <StatCard icon={TrendingUp} label="Overall" value={overall.percentage ? `${overall.percentage}%` : "—"} color="muted" />
        <StatCard icon={Clock} label="Due Soon" value={upcoming.filter((a: any) => a.status !== "graded").length} color="amber" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              Upcoming Assignments
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No upcoming assignments</p>
            ) : upcoming.slice(0, 5).map((a: any) => (
              <Link key={a.assignmentId} href={`/portal/assignments/${a.assignmentId}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{a.title}</p>
                  <p className="text-xs text-gray-400">{a.className} · Due {a.dueDate}</p>
                </div>
                <StatusBadge status={a.status} />
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-500" />
              Recent Grades
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentGrades.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No grades yet</p>
            ) : recentGrades.slice(0, 5).map((g: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 truncate">{g.assignmentTitle}</p>
                  <p className="text-xs text-gray-400">{g.className}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-700">{g.pointsEarned}/{g.pointsPossible}</p>
                  <p className={`text-xs font-semibold ${gradeColor(g.letterGrade)}`}>{g.letterGrade}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-gray-500" />
            My Classes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {classes.map((c: any) => {
              const classGrade = grades?.classes?.find((g: any) => g.classId === c.classId);
              return (
                <Link key={c.classId} href={`/portal/classes/${c.classId}`} className="p-4 border rounded-xl hover:border-emerald-200 hover:bg-emerald-50/30 transition-all group">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-gray-700 group-hover:text-emerald-700">{c.className}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{c.teacherFirstName} {c.teacherLastName}</p>
                      <p className="text-xs text-gray-400">Period {c.period}</p>
                    </div>
                    {classGrade?.letterGrade && (
                      <div className={`text-lg font-bold ${gradeColor(classGrade.letterGrade)}`}>
                        {classGrade.letterGrade}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    gray: "bg-gray-100 text-gray-600",
    emerald: "bg-emerald-50 text-emerald-600",
    muted: "bg-gray-50 text-gray-500",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
            <p className="text-xs text-gray-400">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "graded") return <Badge variant="default" className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">Graded</Badge>;
  if (status === "submitted") return <Badge variant="default" className="bg-gray-100 text-gray-700 hover:bg-gray-100 text-[10px]">Submitted</Badge>;
  if (status === "missing") return <Badge variant="destructive" className="text-[10px]">Missing</Badge>;
  return <Badge variant="outline" className="text-[10px]">To Do</Badge>;
}

function gradeColor(grade: string): string {
  if (!grade) return "text-gray-400";
  if (grade.startsWith("A")) return "text-emerald-600";
  if (grade.startsWith("B")) return "text-gray-700";
  if (grade.startsWith("C")) return "text-amber-600";
  if (grade.startsWith("D")) return "text-amber-700";
  return "text-red-600";
}

function SelectStudentPrompt() {
  const { setStudentId, setRole } = useRole();
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    apiGet(`/api/students-with-enrollments`).then(setStudents);
  }, []);

  const filtered = students.filter(s =>
    `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Card className="max-w-lg mx-auto mt-8">
      <CardHeader>
        <CardTitle>Select a Student</CardTitle>
        <p className="text-sm text-gray-500">Choose which student to view the portal as</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          type="text"
          placeholder="Search students..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <div className="max-h-64 overflow-y-auto space-y-1">
          {filtered.map(s => (
            <button
              key={s.id}
              onClick={() => setStudentId(s.id, `${s.firstName} ${s.lastName}`)}
              className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-3"
            >
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-bold">
                {s.firstName[0]}{s.lastName[0]}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700">{s.firstName} {s.lastName}</p>
                <p className="text-xs text-gray-400">Grade {s.grade}</p>
              </div>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
