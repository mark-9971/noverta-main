import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, BookOpen, TrendingUp, Users } from "lucide-react";

const API = (import.meta as any).env.VITE_API_URL || "/api";

export default function AdminGradebook() {
  const [classes, setClasses] = useState<any[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [gradebook, setGradebook] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [gbLoading, setGbLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/classes`).then(r => r.json()).then(d => { setClasses(d); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setGbLoading(true);
    fetch(`${API}/classes/${selected}/gradebook`).then(r => r.json()).then(d => {
      setGradebook(d);
      setGbLoading(false);
    });
  }, [selected]);

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200 rounded-xl" />)}</div></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">School Gradebook</h1>
        <p className="text-gray-500 mt-1">View grades across all classes</p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {classes.map(c => (
          <button
            key={c.id}
            onClick={() => setSelected(c.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              selected === c.id ? "bg-emerald-700 text-white" : "bg-white border hover:bg-gray-50 text-gray-600"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {selected && gradebook && !gbLoading && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-600" />
              {classes.find(c => c.id === selected)?.name} — Gradebook
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-xs min-w-[800px]">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-2 px-3 font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[160px]">Student</th>
                  {gradebook.assignments.map((a: any) => (
                    <th key={a.id} className="text-center py-2 px-2 font-medium text-gray-500 min-w-[70px]">
                      <div className="truncate max-w-[70px]" title={a.title}>{a.title}</div>
                      <div className="text-[9px] text-gray-400 font-normal">{a.pointsPossible}pts</div>
                    </th>
                  ))}
                  <th className="text-center py-2 px-3 font-medium text-gray-500 min-w-[80px]">Overall</th>
                </tr>
              </thead>
              <tbody>
                {gradebook.students.map((s: any) => (
                  <tr key={s.studentId} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="py-2 px-3 sticky left-0 bg-white">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-700">{s.lastName}, {s.firstName}</span>
                        {s.hasIep && <span className="w-2 h-2 rounded-full bg-purple-400" title="Has IEP" />}
                      </div>
                    </td>
                    {gradebook.assignments.map((a: any) => {
                      const grade = s.grades[a.id];
                      return (
                        <td key={a.id} className="text-center py-2 px-2">
                          {grade?.pointsEarned != null ? (
                            <span className={`font-mono ${cellColor(parseFloat(grade.pointsEarned), parseFloat(a.pointsPossible))}`}>
                              {grade.pointsEarned}
                            </span>
                          ) : grade?.status === "submitted" ? (
                            <span className="text-blue-400">●</span>
                          ) : grade?.status === "missing" ? (
                            <span className="text-red-400">M</span>
                          ) : (
                            <span className="text-gray-200">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="text-center py-2 px-3">
                      {s.overallPercentage != null ? (
                        <span className={`font-bold ${letterColor(s.overallLetterGrade)}`}>
                          {s.overallLetterGrade} ({s.overallPercentage}%)
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {gbLoading && <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />}
      {!selected && <p className="text-center text-gray-400 py-12">Select a class above to view its gradebook</p>}
    </div>
  );
}

function cellColor(earned: number, possible: number) {
  const pct = possible > 0 ? (earned / possible) * 100 : 0;
  if (pct >= 90) return "text-emerald-600";
  if (pct >= 80) return "text-blue-600";
  if (pct >= 70) return "text-amber-600";
  if (pct >= 60) return "text-orange-600";
  return "text-red-600";
}

function letterColor(g: string) {
  if (!g) return "text-gray-400";
  if (g.startsWith("A")) return "text-emerald-600";
  if (g.startsWith("B")) return "text-blue-600";
  if (g.startsWith("C")) return "text-amber-600";
  return "text-red-600";
}
