import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, User, Clock, MapPin, ChevronRight } from "lucide-react";

const API = (import.meta as any).env.VITE_API_URL || "/api";

export default function StudentClasses() {
  const { studentId } = useRole();
  const [classes, setClasses] = useState<any[]>([]);
  const [grades, setGrades] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    Promise.all([
      fetch(`${API}/students/${studentId}/classes`).then(r => r.json()),
      fetch(`${API}/students/${studentId}/grades-summary`).then(r => r.json()),
    ]).then(([c, g]) => {
      setClasses(c);
      setGrades(g);
      setLoading(false);
    });
  }, [studentId]);

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-slate-200 rounded-xl" />)}</div></div>;

  const subjectColors: Record<string, string> = {
    Math: "bg-blue-500", ELA: "bg-purple-500", Science: "bg-green-500",
    "Social Studies": "bg-amber-500", Art: "bg-pink-500", PE: "bg-red-500",
    Music: "bg-indigo-500", "Computer Science": "bg-cyan-500",
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">My Classes</h1>
        <p className="text-slate-500 mt-1">{classes.length} classes this semester</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map(c => {
          const classGrade = grades?.classes?.find((g: any) => g.classId === c.classId);
          const color = subjectColors[c.subject] || "bg-slate-500";
          return (
            <Link key={c.classId} href={`/portal/classes/${c.classId}`}>
              <Card className="hover:shadow-md transition-all cursor-pointer group h-full">
                <div className={`h-2 rounded-t-xl ${color}`} />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-800 group-hover:text-blue-700 transition-colors">{c.className}</h3>
                      <Badge variant="outline" className="mt-1 text-[10px]">{c.courseCode}</Badge>
                    </div>
                    {classGrade?.letterGrade && (
                      <div className="text-right">
                        <p className={`text-2xl font-bold ${gradeColor(classGrade.letterGrade)}`}>{classGrade.letterGrade}</p>
                        <p className="text-[10px] text-slate-400">{classGrade.percentage}%</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-500">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5" />
                      {c.teacherFirstName} {c.teacherLastName}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5" />
                      Period {c.period}
                    </div>
                    {c.room && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5" />
                        Room {c.room}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return "text-emerald-600";
  if (grade.startsWith("B")) return "text-blue-600";
  if (grade.startsWith("C")) return "text-amber-600";
  if (grade.startsWith("D")) return "text-orange-600";
  return "text-red-600";
}
