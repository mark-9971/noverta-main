import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Users, Clock, MapPin, ChevronRight, Search } from "lucide-react";

const API = (import.meta as any).env.VITE_API_URL || "/api";

export default function AdminClasses() {
  const [classes, setClasses] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/classes`).then(r => r.json()).then(d => { setClasses(d); setLoading(false); });
  }, []);

  const filtered = classes.filter(c =>
    `${c.name} ${c.subject} ${c.teacherFirstName} ${c.teacherLastName}`.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-slate-200 rounded-xl" />)}</div></div>;

  const subjectColors: Record<string, string> = {
    Math: "bg-blue-100 text-blue-700", ELA: "bg-purple-100 text-purple-700",
    Science: "bg-green-100 text-green-700", "Social Studies": "bg-amber-100 text-amber-700",
    Art: "bg-pink-100 text-pink-700", PE: "bg-red-100 text-red-700",
    Music: "bg-indigo-100 text-indigo-700", "Computer Science": "bg-cyan-100 text-cyan-700",
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Classes</h1>
          <p className="text-slate-500 mt-1">{classes.length} classes this semester</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search classes, subjects, teachers..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(c => (
          <Card key={c.id} className="hover:shadow-md transition-all">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-slate-800">{c.name}</h3>
                  <Badge className={`mt-1 text-[10px] hover:opacity-90 ${subjectColors[c.subject] || "bg-slate-100 text-slate-700"}`}>{c.subject}</Badge>
                </div>
                <Badge variant="outline" className="text-[10px]">{c.courseCode}</Badge>
              </div>
              <div className="space-y-1.5 text-xs text-slate-500">
                <div className="flex items-center gap-2"><Users className="w-3.5 h-3.5" />{c.teacherFirstName} {c.teacherLastName}</div>
                <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" />Period {c.period} · {c.studentCount} students</div>
                {c.room && <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" />Room {c.room}</div>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
