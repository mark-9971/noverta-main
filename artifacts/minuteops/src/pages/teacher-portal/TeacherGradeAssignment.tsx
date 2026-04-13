import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, FileText, Save } from "lucide-react";
import { toast } from "sonner";

const API = (import.meta as any).env.VITE_API_URL || "/api";

export default function TeacherGradeAssignment() {
  const { id } = useParams<{ id: string }>();
  const { teacherId } = useRole();
  const [assignment, setAssignment] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [grades, setGrades] = useState<Record<number, { points: string; feedback: string }>>({});

  const reload = () => {
    if (!id) return;
    Promise.all([
      fetch(`${API}/assignments/${id}`).then(r => r.json()),
      fetch(`${API}/assignments/${id}/submissions`).then(r => r.json()),
    ]).then(([a, s]) => {
      setAssignment(a);
      setSubmissions(s);
      const g: Record<number, { points: string; feedback: string }> = {};
      s.forEach((sub: any) => {
        g[sub.id] = { points: sub.pointsEarned || "", feedback: sub.feedback || "" };
      });
      setGrades(g);
      setLoading(false);
    });
  };

  useEffect(reload, [id]);

  const handleGrade = async (subId: number) => {
    const g = grades[subId];
    if (!g?.points) { toast.error("Enter points"); return; }
    try {
      await fetch(`${API}/submissions/${subId}/grade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pointsEarned: parseFloat(g.points),
          letterGrade: pctToLetter((parseFloat(g.points) / parseFloat(assignment.pointsPossible)) * 100),
          feedback: g.feedback,
          gradedBy: teacherId,
        }),
      });
      toast.success("Grade saved!");
      reload();
    } catch { toast.error("Failed to save grade"); }
  };

  const handleGradeAll = async () => {
    const ungraded = submissions.filter(s => s.status === "submitted");
    for (const s of ungraded) {
      const g = grades[s.id];
      if (g?.points) await handleGrade(s.id);
    }
  };

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-slate-200 rounded-xl" />)}</div></div>;
  if (!assignment) return <div className="p-6 text-center text-slate-400">Assignment not found</div>;

  const gradedCount = submissions.filter(s => s.pointsEarned != null).length;
  const submittedCount = submissions.filter(s => s.status === "submitted").length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/teacher/assignments" className="text-xs text-emerald-500 hover:underline">← Back to Assignments</Link>
          <h1 className="text-2xl font-bold text-slate-800 mt-1">{assignment.title}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
            <span>{assignment.className}</span>
            <span>Due {assignment.dueDate}</span>
            <span>{assignment.pointsPossible} pts</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right text-sm">
            <p className="font-bold text-slate-700">{gradedCount}/{submissions.length}</p>
            <p className="text-slate-400 text-xs">graded</p>
          </div>
          {submittedCount > 0 && (
            <Button onClick={handleGradeAll} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              <Save className="w-4 h-4" /> Save All
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left py-3 px-4 font-medium text-slate-500">Student</th>
                <th className="text-center py-3 px-4 font-medium text-slate-500">Status</th>
                <th className="text-center py-3 px-4 font-medium text-slate-500 w-24">Score</th>
                <th className="text-left py-3 px-4 font-medium text-slate-500">Feedback</th>
                <th className="text-center py-3 px-4 font-medium text-slate-500 w-20">Action</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map(s => (
                <tr key={s.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-[10px] font-bold">
                        {s.firstName[0]}{s.lastName[0]}
                      </div>
                      <span className="font-medium text-slate-700">{s.lastName}, {s.firstName}</span>
                    </div>
                  </td>
                  <td className="text-center py-3 px-4">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="text-center py-3 px-4">
                    {s.status === "graded" ? (
                      <span className="font-mono font-bold text-emerald-600">{s.pointsEarned}</span>
                    ) : s.status === "submitted" || s.status === "missing" ? (
                      <input
                        type="number"
                        value={grades[s.id]?.points || ""}
                        onChange={e => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], points: e.target.value } }))}
                        max={parseFloat(assignment.pointsPossible)}
                        className="w-20 px-2 py-1 rounded border text-center text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder={`/${assignment.pointsPossible}`}
                      />
                    ) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="py-3 px-4">
                    {s.status === "graded" ? (
                      <span className="text-sm text-slate-500">{s.feedback || "—"}</span>
                    ) : (s.status === "submitted" || s.status === "missing") ? (
                      <input
                        type="text"
                        value={grades[s.id]?.feedback || ""}
                        onChange={e => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], feedback: e.target.value } }))}
                        className="w-full px-2 py-1 rounded border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="Optional feedback"
                      />
                    ) : null}
                  </td>
                  <td className="text-center py-3 px-4">
                    {(s.status === "submitted" || s.status === "missing") && grades[s.id]?.points ? (
                      <Button size="sm" variant="outline" onClick={() => handleGrade(s.id)} className="text-xs gap-1">
                        <CheckCircle className="w-3 h-3" /> Grade
                      </Button>
                    ) : s.status === "graded" ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500 mx-auto" />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "graded") return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-[10px]">Graded</Badge>;
  if (status === "submitted") return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px]">Submitted</Badge>;
  if (status === "missing") return <Badge variant="destructive" className="text-[10px]">Missing</Badge>;
  return <Badge variant="outline" className="text-[10px]">Not Submitted</Badge>;
}

function pctToLetter(pct: number): string {
  if (pct >= 97) return "A+";
  if (pct >= 93) return "A";
  if (pct >= 90) return "A-";
  if (pct >= 87) return "B+";
  if (pct >= 83) return "B";
  if (pct >= 80) return "B-";
  if (pct >= 77) return "C+";
  if (pct >= 73) return "C";
  if (pct >= 70) return "C-";
  if (pct >= 67) return "D+";
  if (pct >= 63) return "D";
  if (pct >= 60) return "D-";
  return "F";
}
