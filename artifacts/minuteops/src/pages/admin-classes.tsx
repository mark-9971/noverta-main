import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Users, Clock, MapPin, ChevronRight, Search } from "lucide-react";
import { apiGet } from "@/lib/api";

export default function AdminClasses() {
  const [classes, setClasses] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet(`/api/classes`).then(d => { setClasses(d); setLoading(false); });
  }, []);

  const filtered = classes.filter(c =>
    `${c.name} ${c.subject} ${c.teacherFirstName} ${c.teacherLastName}`.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}</div></div>;

  const subjectColors: Record<string, string> = {
    Math: "bg-gray-100 text-gray-700", ELA: "bg-gray-50 text-gray-600",
    Science: "bg-emerald-50 text-emerald-700", "Social Studies": "bg-amber-50 text-amber-700",
    Art: "bg-gray-100 text-gray-600", PE: "bg-red-100 text-red-700",
    Music: "bg-emerald-100 text-emerald-800", "Computer Science": "bg-gray-100 text-gray-700",
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Classes</h1>
          <p className="text-gray-500 mt-1">{classes.length} classes this semester</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search classes, subjects, teachers..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(c => (
          <Card key={c.id} className="hover:shadow-md transition-all">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-800">{c.name}</h3>
                  <Badge className={`mt-1 text-[10px] hover:opacity-90 ${subjectColors[c.subject] || "bg-gray-100 text-gray-700"}`}>{c.subject}</Badge>
                </div>
                <Badge variant="outline" className="text-[10px]">{c.courseCode}</Badge>
              </div>
              <div className="space-y-1.5 text-xs text-gray-500">
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
