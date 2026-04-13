import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Award, ChevronRight } from "lucide-react";

const API = (import.meta as any).env.VITE_API_URL || "/api";

export default function TeacherGradebook() {
  const { teacherId } = useRole();
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacherId) return;
    fetch(`${API}/classes?teacherId=${teacherId}`).then(r => r.json()).then(d => {
      setClasses(d);
      setLoading(false);
    });
  }, [teacherId]);

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}</div></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Gradebook</h1>
        <p className="text-gray-500 mt-1">Select a class to view grades</p>
      </div>

      <div className="space-y-3">
        {classes.map(c => (
          <Link key={c.id} href={`/teacher/classes/${c.id}`} className="block">
            <Card className="hover:shadow-md transition-all cursor-pointer group">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Award className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-gray-700 group-hover:text-emerald-700">{c.name}</p>
                  <p className="text-sm text-gray-400">Period {c.period} · {c.studentCount} students · {c.subject}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
