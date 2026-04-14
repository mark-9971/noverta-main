import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, TrendingUp, BookOpen, BarChart3 } from "lucide-react";
import { getGetStudentGradesSummaryQueryOptions } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";

export default function StudentGrades() {
  const { studentId } = useRole();

  const { data: grades, isLoading: loading } = useQuery({
    ...getGetStudentGradesSummaryQueryOptions(studentId),
    enabled: !!studentId,
  });

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl" />)}</div></div>;

  const overall = (grades as any)?.overall || {};
  const classes = (grades as any)?.classes || [];

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
          <CardTitle className="text-[15px]">Class Performance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-gray-100">
            {classes.length === 0 ? (
              <p className="p-4 text-center text-gray-400 text-[13px]">No grade data available yet</p>
            ) : classes.map((cls: any, i: number) => (
              <ClassGradeRow key={i} cls={cls} />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-600 bg-emerald-50",
    gray: "text-gray-600 bg-gray-100",
    muted: "text-gray-500 bg-gray-50",
    amber: "text-amber-600 bg-amber-50",
  };
  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color] || "text-gray-600 bg-gray-100"}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</p>
          <p className="text-lg font-bold text-gray-800">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ClassGradeRow({ cls }: { cls: any }) {
  const pct = cls.percentage || 0;
  const barColor = pct >= 80 ? "bg-emerald-500" : pct >= 70 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="px-4 py-3 flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-gray-800 truncate">{cls.className}</p>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <span className="text-[11px] text-gray-500 shrink-0">{pct ? `${pct}%` : "N/A"}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <span className="text-[14px] font-bold text-gray-800">{cls.letterGrade || "—"}</span>
        <p className="text-[10px] text-gray-400">{cls.gradedAssignments} graded</p>
      </div>
    </div>
  );
}
