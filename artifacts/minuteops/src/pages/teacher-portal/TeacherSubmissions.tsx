import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Inbox, ChevronRight } from "lucide-react";

const API = (import.meta as any).env.VITE_API_URL || "/api";

export default function TeacherSubmissions() {
  const { teacherId } = useRole();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacherId) return;
    fetch(`${API}/teacher/${teacherId}/dashboard`).then(r => r.json()).then(d => {
      setData(d);
      setLoading(false);
    });
  }, [teacherId]);

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-slate-200 rounded-xl" />)}</div></div>;

  const subs = data?.recentSubmissions || [];

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Pending Submissions</h1>
        <p className="text-slate-500 mt-1">{data?.pendingGradingCount || 0} submissions waiting for review</p>
      </div>

      {subs.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Inbox className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-lg font-medium text-slate-600">All caught up!</p>
            <p className="text-sm text-slate-400">No submissions waiting for grading</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {subs.map((s: any) => (
            <div key={s.submissionId} className="flex items-center gap-3 p-4 bg-white rounded-xl border hover:border-emerald-200 transition-all">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-xs font-bold">
                {s.studentFirstName[0]}{s.studentLastName[0]}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700">{s.studentFirstName} {s.studentLastName}</p>
                <p className="text-xs text-slate-400 truncate">{s.assignmentTitle} · {s.className}</p>
              </div>
              <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 text-[10px]">Needs Review</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
