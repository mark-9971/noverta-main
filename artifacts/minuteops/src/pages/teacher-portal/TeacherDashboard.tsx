import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Inbox, Users, Award, ChevronRight, Clock } from "lucide-react";
import { getTeacherDashboard, listTeachersWithClasses } from "@workspace/api-client-react";

export default function TeacherDashboard() {
  const { teacherId } = useRole();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacherId) return;
    getTeacherDashboard(teacherId).then(d => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [teacherId]);

  if (!teacherId) return <div className="p-6"><SelectTeacherPrompt /></div>;
  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl" />)}</div></div>;

  const classes = data?.classes || [];
  const pending = data?.pendingGradingCount || 0;
  const recent = data?.recentSubmissions || [];
  const totalStudents = classes.reduce((s: number, c: any) => s + (parseInt(c.studentCount) || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Teacher Dashboard</h1>
        <p className="text-gray-500 mt-1">Welcome back</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={BookOpen} label="Classes" value={classes.length} color="emerald" />
        <StatCard icon={Users} label="Students" value={totalStudents} color="gray" />
        <StatCard icon={Inbox} label="To Grade" value={pending} color="amber" />
        <StatCard icon={Clock} label="Recent" value={recent.length} color="muted" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-emerald-500" />
                My Classes
              </CardTitle>
              <Link href="/teacher/classes" className="text-xs text-emerald-600 hover:underline">View All</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {classes.map((c: any) => (
              <Link key={c.id} href={`/teacher/classes/${c.id}`} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600 font-bold text-sm">
                  P{c.period}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 group-hover:text-emerald-700">{c.name}</p>
                  <p className="text-xs text-gray-400">Room {c.room} · {c.studentCount} students</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Inbox className="w-4 h-4 text-amber-500" />
                Needs Grading
                {pending > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[10px] ml-1">{pending}</Badge>
                )}
              </CardTitle>
              <Link href="/teacher/submissions" className="text-xs text-emerald-600 hover:underline">View All</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">All caught up!</p>
            ) : recent.map((s: any) => (
              <div key={s.submissionId} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-bold">
                  {s.studentFirstName[0]}{s.studentLastName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700">{s.studentFirstName} {s.studentLastName}</p>
                  <p className="text-xs text-gray-400 truncate">{s.assignmentTitle} · {s.className}</p>
                </div>
                <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 text-[10px]">Review</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    gray: "bg-gray-100 text-gray-600",
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

function SelectTeacherPrompt() {
  const { setTeacherId } = useRole();
  const [staff, setStaff] = useState<any[]>([]);

  useEffect(() => {
    listTeachersWithClasses().then(setStaff);
  }, []);

  return (
    <Card className="max-w-lg mx-auto mt-8">
      <CardHeader>
        <CardTitle>Select a Teacher</CardTitle>
        <p className="text-sm text-gray-500">Choose which teacher to view the portal as</p>
      </CardHeader>
      <CardContent className="space-y-1">
        {staff.map(s => (
          <button
            key={s.id}
            onClick={() => setTeacherId(s.id, `${s.firstName} ${s.lastName}`)}
            className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-emerald-50 transition-colors flex items-center gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-bold">
              {s.firstName[0]}{s.lastName[0]}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">{s.firstName} {s.lastName}</p>
              <p className="text-xs text-gray-400">{s.title || s.role}</p>
            </div>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
