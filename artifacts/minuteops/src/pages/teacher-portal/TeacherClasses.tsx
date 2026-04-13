import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Users, Clock, MapPin, ChevronRight, Plus } from "lucide-react";

const API = (import.meta as any).env.VITE_API_URL || "/api";

export default function TeacherClasses() {
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

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-slate-200 rounded-xl" />)}</div></div>;

  const subjectColors: Record<string, string> = {
    Math: "from-blue-500 to-blue-600", ELA: "from-purple-500 to-purple-600",
    Science: "from-green-500 to-green-600", "Social Studies": "from-amber-500 to-amber-600",
    Art: "from-pink-500 to-pink-600", PE: "from-red-500 to-red-600",
    Music: "from-indigo-500 to-indigo-600", "Computer Science": "from-cyan-500 to-cyan-600",
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">My Classes</h1>
          <p className="text-slate-500 mt-1">{classes.length} classes this semester</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {classes.map(c => {
          const gradient = subjectColors[c.subject] || "from-slate-500 to-slate-600";
          return (
            <Link key={c.id} href={`/teacher/classes/${c.id}`}>
              <Card className="hover:shadow-lg transition-all cursor-pointer group overflow-hidden h-full">
                <div className={`bg-gradient-to-r ${gradient} p-4 text-white`}>
                  <h3 className="font-bold text-lg">{c.name}</h3>
                  <p className="text-white/80 text-sm">{c.courseCode}</p>
                </div>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Users className="w-4 h-4" />
                      {c.studentCount} students
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Clock className="w-4 h-4" />
                      Period {c.period}
                    </div>
                  </div>
                  {c.room && (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <MapPin className="w-4 h-4" />
                      Room {c.room}
                    </div>
                  )}
                  <Badge variant="outline" className="text-[10px]">Grade {c.gradeLevel}</Badge>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
