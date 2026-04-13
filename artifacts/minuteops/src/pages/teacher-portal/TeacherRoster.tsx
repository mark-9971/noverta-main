import { useEffect, useState } from "react";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Search } from "lucide-react";

const API = (import.meta as any).env.VITE_API_URL || "/api";

export default function TeacherRoster() {
  const { teacherId } = useRole();
  const [classes, setClasses] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teacherId) return;
    fetch(`${API}/classes?teacherId=${teacherId}`).then(r => r.json()).then(async (clsList) => {
      setClasses(clsList);
      const students: any[] = [];
      const seen = new Set<number>();
      for (const c of clsList) {
        const roster = await fetch(`${API}/classes/${c.id}/roster`).then(r => r.json());
        for (const s of roster) {
          if (!seen.has(s.studentId)) {
            seen.add(s.studentId);
            students.push({ ...s, classes: [c.name] });
          } else {
            const existing = students.find(st => st.studentId === s.studentId);
            if (existing) existing.classes.push(c.name);
          }
        }
      }
      students.sort((a, b) => a.lastName.localeCompare(b.lastName));
      setAllStudents(students);
      setLoading(false);
    });
  }, [teacherId]);

  const filtered = allStudents.filter(s =>
    `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}</div></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Student Roster</h1>
        <p className="text-gray-500 mt-1">{allStudents.length} students across {classes.length} classes</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search students..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-3 px-4 font-medium text-gray-500">Student</th>
                <th className="text-center py-3 px-4 font-medium text-gray-500">Grade</th>
                <th className="text-center py-3 px-4 font-medium text-gray-500">IEP</th>
                <th className="text-left py-3 px-4 font-medium text-gray-500">Classes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.studentId} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-bold">
                        {s.firstName[0]}{s.lastName[0]}
                      </div>
                      <span className="font-medium text-gray-700">{s.lastName}, {s.firstName}</span>
                    </div>
                  </td>
                  <td className="text-center py-3 px-4 text-gray-500">{s.grade}</td>
                  <td className="text-center py-3 px-4">
                    {s.hasIep ? <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100 text-[10px]">IEP</Badge> : "—"}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 flex-wrap">
                      {s.classes.map((c: string, i: number) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{c}</Badge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
