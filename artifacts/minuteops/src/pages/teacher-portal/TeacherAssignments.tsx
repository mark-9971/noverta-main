import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ChevronRight } from "lucide-react";
import { listClasses, listClassAssignments } from "@workspace/api-client-react";

export default function TeacherAssignments() {
  const { teacherId } = useRole();
  const [classes, setClasses] = useState<any[]>([]);
  const [allAssignments, setAllAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacherId) return;
    listClasses({ teacherId: teacherId as number }).then(async (clsList) => {
      setClasses(clsList);
      const all: any[] = [];
      for (const c of clsList) {
        const asgns = await listClassAssignments((c as any).id);
        all.push(...asgns.map((a: any) => ({ ...a, className: c.name, classSubject: c.subject })));
      }
      all.sort((a, b) => (b.dueDate || "").localeCompare(a.dueDate || ""));
      setAllAssignments(all);
      setLoading(false);
    });
  }, [teacherId]);

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}</div></div>;

  const needsGrading = allAssignments.filter(a => Number(a.submissionCount) > Number(a.gradedCount));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">All Assignments</h1>
        <p className="text-gray-500 mt-1">{allAssignments.length} total · {needsGrading.length} need grading</p>
      </div>

      <div className="space-y-2">
        {allAssignments.map(a => (
          <Link key={a.id} href={`/teacher/assignments/${a.id}/grade`} className="block">
            <div className="flex items-center gap-3 p-4 bg-white rounded-xl border hover:border-emerald-200 transition-all group">
              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 group-hover:text-emerald-700">{a.title}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span>{a.className}</span>
                  <span>Due {a.dueDate}</span>
                  <Badge variant="outline" className="text-[10px]">{a.assignmentType}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="text-center">
                  <p className="font-bold text-gray-700">{a.submissionCount}/{a.gradedCount}</p>
                  <p className="text-gray-400">sub/graded</p>
                </div>
                {a.avgScore && (
                  <div className="text-center">
                    <p className="font-bold text-emerald-600">{a.avgScore}%</p>
                    <p className="text-gray-400">avg</p>
                  </div>
                )}
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
