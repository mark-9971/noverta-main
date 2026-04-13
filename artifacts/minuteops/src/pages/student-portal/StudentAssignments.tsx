import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Calendar, ChevronRight, Clock, CheckCircle, AlertCircle, XCircle } from "lucide-react";

const API = (import.meta as any).env.VITE_API_URL || "/api";

export default function StudentAssignments() {
  const { studentId } = useRole();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    fetch(`${API}/students/${studentId}/assignments`).then(r => r.json()).then(d => {
      setAssignments(d);
      setLoading(false);
    });
  }, [studentId]);

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-slate-200 rounded-xl" />)}</div></div>;

  const today = new Date().toISOString().split("T")[0];
  const upcoming = assignments.filter(a => a.dueDate >= today && a.status !== "graded");
  const past = assignments.filter(a => a.dueDate < today || a.status === "graded");
  const missing = assignments.filter(a => a.status === "missing");

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Assignments</h1>
        <p className="text-slate-500 mt-1">{assignments.length} total assignments</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <MiniStat icon={Clock} label="Upcoming" value={upcoming.length} color="text-blue-600 bg-blue-50" />
        <MiniStat icon={CheckCircle} label="Completed" value={past.filter(a => a.status === "graded").length} color="text-emerald-600 bg-emerald-50" />
        <MiniStat icon={XCircle} label="Missing" value={missing.length} color="text-red-600 bg-red-50" />
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
          <TabsTrigger value="missing">Missing ({missing.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-4">
          <AssignmentList assignments={upcoming} />
        </TabsContent>
        <TabsContent value="past" className="mt-4">
          <AssignmentList assignments={past} />
        </TabsContent>
        <TabsContent value="missing" className="mt-4">
          <AssignmentList assignments={missing} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AssignmentList({ assignments }: { assignments: any[] }) {
  if (assignments.length === 0) return <p className="text-center text-slate-400 py-8">No assignments</p>;
  return (
    <div className="space-y-2">
      {assignments.map(a => (
        <Link key={a.submissionId} href={`/portal/assignments/${a.assignmentId}`} className="block">
          <div className="flex items-center gap-3 p-4 bg-white rounded-xl border hover:border-blue-200 transition-all group">
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
              <FileText className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-700 group-hover:text-blue-700">{a.title}</p>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                <span>{a.className}</span>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{a.dueDate}</span>
                <span>{a.pointsPossible} pts</span>
              </div>
            </div>
            {a.status === "graded" ? (
              <div className="text-right">
                <p className="text-sm font-bold text-slate-700">{a.pointsEarned}/{a.pointsPossible}</p>
                <p className={`text-xs font-semibold ${letterColor(a.letterGrade)}`}>{a.letterGrade}</p>
              </div>
            ) : (
              <StatusBadge status={a.status} />
            )}
            <ChevronRight className="w-4 h-4 text-slate-300" />
          </div>
        </Link>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "submitted") return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px]">Submitted</Badge>;
  if (status === "missing") return <Badge variant="destructive" className="text-[10px]">Missing</Badge>;
  return <Badge variant="outline" className="text-[10px]">To Do</Badge>;
}

function MiniStat({ icon: Icon, label, value, color }: { icon: any; label: string; value: number; color: string }) {
  const [bg, text] = color.split(" ");
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xl font-bold text-slate-800">{value}</p>
          <p className="text-[10px] text-slate-400">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function letterColor(g: string) {
  if (!g) return "text-slate-400";
  if (g.startsWith("A")) return "text-emerald-600";
  if (g.startsWith("B")) return "text-blue-600";
  if (g.startsWith("C")) return "text-amber-600";
  return "text-red-600";
}
