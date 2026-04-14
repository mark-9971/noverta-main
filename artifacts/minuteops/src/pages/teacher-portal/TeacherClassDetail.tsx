import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, FileText, Award, Bell, Plus, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { getClass, getClassRoster, listClassAssignments, listAnnouncements, createAssignment, getGradebook } from "@workspace/api-client-react";

export default function TeacherClassDetail() {
  const { id } = useParams<{ id: string }>();
  const { teacherId } = useRole();
  const [cls, setCls] = useState<any>(null);
  const [roster, setRoster] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    if (!id) return;
    Promise.all([
      getClass(Number(id)),
      getClassRoster(Number(id)),
      listClassAssignments(Number(id)),
      listAnnouncements(Number(id)),
    ]).then(([c, r, a, ann]) => {
      setCls(c);
      setRoster(r);
      setAssignments(a);
      setAnnouncements(ann);
      setLoading(false);
    });
  };

  useEffect(reload, [id]);

  if (loading) return <div className="p-6"><div className="animate-pulse space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-gray-200 rounded-xl" />)}</div></div>;
  if (!cls) return <div className="p-6 text-center text-gray-400">Class not found</div>;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/teacher/classes" className="text-xs text-emerald-500 hover:underline">← Back to Classes</Link>
          <h1 className="text-2xl font-bold text-gray-800 mt-1">{cls.name}</h1>
          <p className="text-gray-500 text-sm">Period {cls.period} · Room {cls.room} · {roster.length} students</p>
        </div>
      </div>

      <Tabs defaultValue="assignments">
        <TabsList>
          <TabsTrigger value="assignments" className="gap-1.5"><FileText className="w-3.5 h-3.5" />Assignments ({assignments.length})</TabsTrigger>
          <TabsTrigger value="roster" className="gap-1.5"><Users className="w-3.5 h-3.5" />Roster ({roster.length})</TabsTrigger>
          <TabsTrigger value="gradebook" className="gap-1.5"><Award className="w-3.5 h-3.5" />Gradebook</TabsTrigger>
          <TabsTrigger value="announcements" className="gap-1.5"><Bell className="w-3.5 h-3.5" />Announcements</TabsTrigger>
        </TabsList>

        <TabsContent value="assignments" className="mt-4 space-y-3">
          <CreateAssignmentForm classId={Number(id)} teacherId={teacherId} onCreated={reload} />
          {assignments.map(a => (
            <div key={a.id} className="flex items-center gap-3 p-4 bg-white rounded-xl border hover:border-emerald-200 transition-all">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-700">{a.title}</p>
                  <Badge variant="outline" className="text-[10px]">{a.assignmentType}</Badge>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                  <span>Due {a.dueDate}</span>
                  <span>{a.pointsPossible} pts</span>
                  {a.categoryName && <span>{a.categoryName}</span>}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <div className="text-center">
                  <p className="font-bold text-gray-700">{a.submissionCount}</p>
                  <p>submitted</p>
                </div>
                <div className="text-center">
                  <p className="font-bold text-gray-700">{a.gradedCount}</p>
                  <p>graded</p>
                </div>
                {a.avgScore && (
                  <div className="text-center">
                    <p className="font-bold text-emerald-600">{a.avgScore}%</p>
                    <p>avg</p>
                  </div>
                )}
              </div>
              <Link href={`/teacher/assignments/${a.id}/grade`}>
                <Button size="sm" variant="outline" className="text-xs">Grade</Button>
              </Link>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="roster" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-4 font-medium text-gray-500">Student</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-500">Grade</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-500">IEP</th>
                    <th className="text-center py-3 px-4 font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.map(s => (
                    <tr key={s.studentId} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-bold">
                            {s.firstName[0]}{s.lastName[0]}
                          </div>
                          <p className="font-medium text-gray-700">{s.firstName} {s.lastName}</p>
                        </div>
                      </td>
                      <td className="text-center py-3 px-4 text-gray-500">{s.grade}</td>
                      <td className="text-center py-3 px-4">
                        {s.hasIep ? (
                          <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 text-[10px]">IEP</Badge>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="text-center py-3 px-4">
                        <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-200">{s.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gradebook" className="mt-4">
          <GradebookView classId={Number(id)} />
        </TabsContent>

        <TabsContent value="announcements" className="mt-4 space-y-3">
          {announcements.map((a: any) => (
            <Card key={a.id}>
              <CardContent className="p-4">
                <p className="font-semibold text-gray-700">{a.title}</p>
                <p className="text-sm text-gray-500 mt-1">{a.content}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CreateAssignmentForm({ classId, teacherId, onCreated }: { classId: number; teacherId: number; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("homework");
  const [points, setPoints] = useState("100");
  const [dueDate, setDueDate] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) { toast.error("Title required"); return; }
    setCreating(true);
    try {
      await createAssignment(classId, { title, assignmentType: type, pointsPossible: Number(points), dueDate, assignedDate: new Date().toISOString().split("T")[0] });
      toast.success("Assignment created!");
      setTitle(""); setDueDate(""); setOpen(false);
      onCreated();
    } catch { toast.error("Failed to create"); }
    setCreating(false);
  };

  if (!open) return (
    <Button onClick={() => setOpen(true)} variant="outline" className="w-full border-dashed gap-2">
      <Plus className="w-4 h-4" /> New Assignment
    </Button>
  );

  return (
    <Card className="border-emerald-200 bg-emerald-50/30">
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Assignment title" className="col-span-2 px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
          <select value={type} onChange={e => setType(e.target.value)} className="px-3 py-2 rounded-lg border text-sm">
            <option value="homework">Homework</option>
            <option value="quiz">Quiz</option>
            <option value="test">Test</option>
            <option value="project">Project</option>
          </select>
          <input value={points} onChange={e => setPoints(e.target.value)} placeholder="Points" type="number" className="px-3 py-2 rounded-lg border text-sm" />
          <input value={dueDate} onChange={e => setDueDate(e.target.value)} type="date" className="px-3 py-2 rounded-lg border text-sm" />
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={creating} className="bg-emerald-600 hover:bg-emerald-700 flex-1">Create</Button>
            <Button onClick={() => setOpen(false)} variant="outline">Cancel</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GradebookView({ classId }: { classId: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGradebook(classId).then(d => {
      setData(d);
      setLoading(false);
    });
  }, [classId]);

  if (loading) return <div className="animate-pulse h-64 bg-gray-100 rounded-xl" />;
  if (!data) return <p className="text-center text-gray-400">No data</p>;

  const { assignments, students } = data;

  return (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-xs min-w-[800px]">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left py-2 px-3 font-medium text-gray-500 sticky left-0 bg-gray-50 min-w-[160px]">Student</th>
              {assignments.map((a: any) => (
                <th key={a.id} className="text-center py-2 px-2 font-medium text-gray-500 min-w-[70px]" title={a.title}>
                  <div className="truncate max-w-[70px]">{a.title}</div>
                  <div className="text-[9px] text-gray-400 font-normal">{a.pointsPossible}pts</div>
                </th>
              ))}
              <th className="text-center py-2 px-3 font-medium text-gray-500 min-w-[80px]">Overall</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s: any) => (
              <tr key={s.studentId} className="border-b last:border-0 hover:bg-gray-50">
                <td className="py-2 px-3 sticky left-0 bg-white">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700">{s.lastName}, {s.firstName}</span>
                    {s.hasIep && <span className="w-2 h-2 rounded-full bg-emerald-400" title="Has IEP" />}
                  </div>
                </td>
                {assignments.map((a: any) => {
                  const grade = s.grades[a.id];
                  return (
                    <td key={a.id} className="text-center py-2 px-2">
                      {grade?.pointsEarned != null ? (
                        <span className={`font-mono ${cellColor(parseFloat(grade.pointsEarned), parseFloat(a.pointsPossible))}`}>
                          {grade.pointsEarned}
                        </span>
                      ) : grade?.status === "submitted" ? (
                        <span className="text-emerald-400">●</span>
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
  );
}

function cellColor(earned: number, possible: number) {
  const pct = possible > 0 ? (earned / possible) * 100 : 0;
  if (pct >= 90) return "text-emerald-600";
  if (pct >= 80) return "text-gray-700";
  if (pct >= 70) return "text-amber-600";
  if (pct >= 60) return "text-amber-700";
  return "text-red-600";
}

function letterColor(g: string) {
  if (!g) return "text-gray-400";
  if (g.startsWith("A")) return "text-emerald-600";
  if (g.startsWith("B")) return "text-gray-700";
  if (g.startsWith("C")) return "text-amber-600";
  return "text-red-600";
}
