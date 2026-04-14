import { useEffect, useState } from "react";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, TrendingUp, BookOpen, BarChart3 } from "lucide-react";
import { apiGet } from "@/lib/api";

export default function StudentGrades() {
  const { studentId } = useRole();
  const [grades, setGrades] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    apiGet(`/api/students/${studentId}/grades-summary`).then(d => {
      setGrades(d);
      setLoading(false);
    });
  }, [studentId]);

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl" />)}</div></div>;

  const overall = grades?.overall || {};
  const classes = grades?.classes || [];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">My Grades</h1>
        <p className="text-gray-500 mt-1">Academic performance overview</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Award} label="GPA" value={overall.gpa?.toFixed(2) || "—"} color="emerald" />
        <StatCard icon={TrendingUp} label="Overall %" value={overall.percentage ? `${overall.percentage}%` : "—"} color="gray" />
        <StatCard icon={BarChart3} label="Grade" value={overall.letterGrade || "—"} color="muted" />
        <StatCard icon={BookOpen} label="Graded" value={overall.totalGradedAssignments || 0} color="amber" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Class Grades</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-4 font-medium text-gray-500">Class</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Teacher</th>
                <th className="text-center py-3 px-4 font-medium text-gray-500">Percentage</th>
                <th className="text-center py-3 px-4 font-medium text-gray-500">Grade</th>
                <th className="text-center py-3 px-4 font-medium text-gray-500">Assignments</th>
              </tr>
            </thead>
            <tbody>
              {classes.map((c: any) => (
                <tr key={c.classId} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <p className="font-medium text-gray-700">{c.className}</p>
                    <p className="text-xs text-gray-400">{c.subject}</p>
                  </td>
                  <td className="py-3 px-4 text-gray-500">{c.teacherFirstName} {c.teacherLastName}</td>
                  <td className="text-center py-3 px-4">
                    {c.percentage !== null ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pctBarColor(c.percentage)}`} style={{ width: `${Math.min(c.percentage, 100)}%` }} />
                        </div>
                        <span className="text-sm font-mono">{c.percentage}%</span>
                      </div>
                    ) : "—"}
                  </td>
                  <td className={`text-center py-3 px-4 font-bold text-lg ${letterColor(c.letterGrade)}`}>
                    {c.letterGrade || "—"}
                  </td>
                  <td className="text-center py-3 px-4 text-gray-500">{c.gradedAssignments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">GPA Scale</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2 text-xs">
            {[
              { grade: "A+", range: "97-100", gpa: "4.0" },
              { grade: "A", range: "93-96", gpa: "4.0" },
              { grade: "A-", range: "90-92", gpa: "3.7" },
              { grade: "B+", range: "87-89", gpa: "3.3" },
              { grade: "B", range: "83-86", gpa: "3.0" },
              { grade: "B-", range: "80-82", gpa: "2.7" },
              { grade: "C+", range: "77-79", gpa: "2.3" },
              { grade: "C", range: "73-76", gpa: "2.0" },
              { grade: "C-", range: "70-72", gpa: "1.7" },
              { grade: "D+", range: "67-69", gpa: "1.3" },
              { grade: "D", range: "63-66", gpa: "1.0" },
              { grade: "F", range: "0-59", gpa: "0.0" },
            ].map(g => (
              <div key={g.grade} className="p-2 rounded-lg bg-gray-50 text-center">
                <p className={`font-bold ${letterColor(g.grade)}`}>{g.grade}</p>
                <p className="text-gray-400">{g.range}</p>
                <p className="text-gray-500 font-mono">{g.gpa}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
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

function letterColor(g: string) {
  if (!g) return "text-gray-400";
  if (g.startsWith("A")) return "text-emerald-600";
  if (g.startsWith("B")) return "text-gray-700";
  if (g.startsWith("C")) return "text-amber-600";
  if (g.startsWith("D")) return "text-amber-700";
  return "text-red-600";
}

function pctBarColor(pct: number) {
  if (pct >= 90) return "bg-emerald-500";
  if (pct >= 80) return "bg-gray-400";
  if (pct >= 70) return "bg-amber-500";
  if (pct >= 60) return "bg-amber-600";
  return "bg-red-500";
}
