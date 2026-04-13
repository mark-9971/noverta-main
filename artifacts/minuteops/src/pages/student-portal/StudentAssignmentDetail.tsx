import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Calendar, Award, Clock, CheckCircle, Upload, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const API = (import.meta as any).env.VITE_API_URL || "/api";

export default function StudentAssignmentDetail() {
  const { id } = useParams<{ id: string }>();
  const { studentId } = useRole();
  const [assignment, setAssignment] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`${API}/assignments/${id}`).then(r => r.json()),
      fetch(`${API}/students/${studentId}/assignments?classId=`).then(r => r.json()),
    ]).then(([a, subs]) => {
      setAssignment(a);
      const mySub = subs.find((s: any) => s.assignmentId === Number(id));
      if (mySub) setSubmissions([mySub]);
      setLoading(false);
    });
  }, [id, studentId]);

  const handleSubmit = async () => {
    if (!content.trim()) { toast.error("Please enter your work"); return; }
    const sub = submissions[0];
    if (!sub) return;
    setSubmitting(true);
    try {
      await fetch(`${API}/submissions/${sub.submissionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, status: "submitted" }),
      });
      toast.success("Assignment submitted!");
      const updated = await fetch(`${API}/students/${studentId}/assignments`).then(r => r.json());
      const mySub = updated.find((s: any) => s.assignmentId === Number(id));
      if (mySub) setSubmissions([mySub]);
    } catch {
      toast.error("Failed to submit");
    }
    setSubmitting(false);
  };

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl" />)}</div></div>;
  if (!assignment) return <div className="p-6 text-center text-gray-400">Assignment not found</div>;

  const sub = submissions[0];
  const isGraded = sub?.status === "graded";
  const isSubmitted = sub?.status === "submitted";

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <Link href="/portal/assignments" className="text-xs text-emerald-600 hover:underline">← Back to Assignments</Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-2">{assignment.title}</h1>
        <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />Due {assignment.dueDate}</span>
          <span>{assignment.pointsPossible} points</span>
          <Badge variant="outline">{assignment.assignmentType}</Badge>
          <span>{assignment.className}</span>
        </div>
      </div>

      {isGraded && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-white flex items-center justify-center shadow-sm">
                <div className={`text-2xl font-bold ${letterColor(sub.letterGrade)}`}>{sub.letterGrade}</div>
              </div>
              <div>
                <p className="text-lg font-bold text-gray-800">{sub.pointsEarned} / {assignment.pointsPossible}</p>
                <p className="text-sm text-gray-500">
                  {Math.round((parseFloat(sub.pointsEarned) / parseFloat(assignment.pointsPossible)) * 100)}%
                </p>
              </div>
              <CheckCircle className="w-6 h-6 text-emerald-500 ml-auto" />
            </div>
            {sub.feedback && (
              <div className="mt-4 p-3 bg-white rounded-lg border">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Teacher Feedback
                </div>
                <p className="text-sm text-gray-600">{sub.feedback}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Instructions</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{assignment.instructions || assignment.description || "No instructions provided."}</p>
        </CardContent>
      </Card>

      {!isGraded && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="w-4 h-4" />
              {isSubmitted ? "Your Submission" : "Submit Your Work"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isSubmitted ? (
              <div className="p-4 bg-emerald-50 rounded-lg">
                <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium">
                  <CheckCircle className="w-4 h-4" />
                  Submitted
                </div>
                <p className="text-xs text-emerald-600 mt-1">Your work has been submitted and is waiting to be graded.</p>
              </div>
            ) : (
              <>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Type or paste your work here..."
                  className="w-full min-h-[150px] px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
                />
                <div className="flex justify-end">
                  <Button onClick={handleSubmit} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
                    {submitting ? "Submitting..." : "Submit Assignment"}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function letterColor(g: string) {
  if (!g) return "text-gray-400";
  if (g.startsWith("A")) return "text-emerald-600";
  if (g.startsWith("B")) return "text-gray-700";
  if (g.startsWith("C")) return "text-amber-600";
  return "text-red-600";
}
