import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, FileText, Bell, Award, ChevronRight, Calendar } from "lucide-react";

const API = (import.meta as any).env.VITE_API_URL || "/api";

export default function StudentClassDetail() {
  const { id } = useParams<{ id: string }>();
  const { studentId } = useRole();
  const [cls, setCls] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`${API}/classes/${id}`).then(r => r.json()),
      fetch(`${API}/students/${studentId}/assignments?classId=${id}`).then(r => r.json()),
      fetch(`${API}/classes/${id}/announcements`).then(r => r.json()),
    ]).then(([c, a, ann]) => {
      setCls(c);
      setAssignments(a);
      setAnnouncements(ann);
      setLoading(false);
    });
  }, [id, studentId]);

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl" />)}</div></div>;
  if (!cls) return <div className="p-6 text-center text-gray-400">Class not found</div>;

  const graded = assignments.filter(a => a.status === "graded");
  const totalEarned = graded.reduce((s, a) => s + parseFloat(a.pointsEarned || "0"), 0);
  const totalPossible = graded.reduce((s, a) => s + parseFloat(a.pointsPossible || "100"), 0);
  const pct = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 1000) / 10 : null;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/portal/classes" className="text-xs text-emerald-600 hover:underline">← Back to Classes</Link>
          <h1 className="text-2xl font-bold text-gray-800 mt-1">{cls.name}</h1>
          <p className="text-gray-500 text-sm">{cls.teacherFirstName} {cls.teacherLastName} · Period {cls.period} · Room {cls.room}</p>
        </div>
        {pct !== null && (
          <div className="text-right">
            <p className={`text-3xl font-bold ${pctColor(pct)}`}>{pct}%</p>
            <p className="text-xs text-gray-400">{graded.length} graded</p>
          </div>
        )}
      </div>

      <Tabs defaultValue="assignments">
        <TabsList>
          <TabsTrigger value="assignments" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Assignments</TabsTrigger>
          <TabsTrigger value="grades" className="gap-1.5"><Award className="w-3.5 h-3.5" />Grades</TabsTrigger>
          <TabsTrigger value="announcements" className="gap-1.5"><Bell className="w-3.5 h-3.5" />Announcements</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="mt-4 space-y-2">
          {assignments.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No assignments yet</p>
          ) : assignments.map(a => (
            <Link key={a.submissionId} href={`/portal/assignments/${a.assignmentId}`} className="block">
              <div className="flex items-center gap-3 p-4 bg-white rounded-xl border hover:border-emerald-200 hover:bg-emerald-50/20 transition-all group">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-700 group-hover:text-emerald-700">{a.title}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Due {a.dueDate}</span>
                    <span>{a.pointsPossible} pts</span>
                    <Badge variant="outline" className="text-[10px]">{a.assignmentType}</Badge>
                  </div>
                </div>
                {a.status === "graded" ? (
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-700">{a.pointsEarned}/{a.pointsPossible}</p>
                    <p className={`text-xs font-semibold ${letterColor(a.letterGrade)}`}>{a.letterGrade}</p>
                  </div>
                ) : (
                  <StatusBadge status={a.status} />
                )}
                <ChevronRight className="w-4 h-4 text-gray-300" />
              </div>
            </Link>
          ))}
        </TabsContent>

        <TabsContent value="grades" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Assignment</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-500">Type</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-500">Score</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-500">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {graded.map(a => (
                    <tr key={a.submissionId} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium text-gray-700">{a.title}</td>
                      <td className="text-center py-3 px-4"><Badge variant="outline" className="text-[10px]">{a.assignmentType}</Badge></td>
                      <td className="text-center py-3 px-4 font-mono">{a.pointsEarned}/{a.pointsPossible}</td>
                      <td className={`text-center py-3 px-4 font-bold ${letterColor(a.letterGrade)}`}>{a.letterGrade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="announcements" className="mt-4 space-y-3">
          {announcements.length === 0 ? (
            <p className="text-center text-gray-400 py-8">No announcements</p>
          ) : announcements.map((a: any) => (
            <Card key={a.id}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Bell className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-700">{a.title}</p>
                    <p className="text-sm text-gray-500 mt-1">{a.content}</p>
                    <p className="text-xs text-gray-400 mt-2">{a.authorFirstName} {a.authorLastName}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "submitted") return <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 text-[10px]">Submitted</Badge>;
  if (status === "missing") return <Badge variant="destructive" className="text-[10px]">Missing</Badge>;
  return <Badge variant="outline" className="text-[10px]">To Do</Badge>;
}

function letterColor(g: string) {
  if (!g) return "text-gray-400";
  if (g.startsWith("A")) return "text-emerald-600";
  if (g.startsWith("B")) return "text-gray-700";
  if (g.startsWith("C")) return "text-amber-600";
  if (g.startsWith("D")) return "text-amber-700";
  return "text-red-600";
}

function pctColor(pct: number) {
  if (pct >= 90) return "text-emerald-600";
  if (pct >= 80) return "text-gray-700";
  if (pct >= 70) return "text-amber-600";
  if (pct >= 60) return "text-amber-700";
  return "text-red-600";
}
