import { useState, useEffect } from "react";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronUp,
  Plus, Calendar, MapPin, Send, Users, ShieldCheck, X
} from "lucide-react";
import { toast } from "sonner";

const API = (import.meta as any).env.VITE_API_URL || "/api";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const SEVERITY_OPTIONS = [
  { value: "low", label: "Low", color: "bg-gray-100 text-gray-700" },
  { value: "moderate", label: "Moderate", color: "bg-amber-50 text-amber-700" },
  { value: "high", label: "High", color: "bg-amber-100 text-amber-700" },
  { value: "critical", label: "Critical", color: "bg-red-100 text-red-700" },
];

interface Accommodation {
  id: number;
  category: string;
  description: string;
  setting: string | null;
  frequency: string | null;
}

interface ScheduleEntry {
  id: number;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  label: string;
  location: string | null;
  serviceName: string | null;
}

interface BehaviorTarget {
  id: number;
  name: string;
  description: string | null;
  measurementType: string;
  targetDirection: string;
}

interface Observation {
  id: number;
  date: string;
  description: string;
  severity: string;
}

interface ClassroomStudent {
  id: number;
  firstName: string;
  lastName: string;
  grade: string;
  studentType: string;
  accommodations: Accommodation[];
  serviceSchedule: ScheduleEntry[];
  behaviorTargets: BehaviorTarget[];
  recentObservations: Observation[];
}

export default function TeacherClassroom() {
  const { teacherId } = useRole();
  const [students, setStudents] = useState<ClassroomStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedStudent, setExpandedStudent] = useState<number | null>(null);
  const [observationModal, setObservationModal] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "sped" | "gen_ed">("all");

  useEffect(() => {
    if (!teacherId) return;
    setLoading(true);
    fetch(`${API}/staff/${teacherId}/classroom`)
      .then(r => r.json())
      .then(d => {
        setStudents(d.students || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [teacherId]);

  if (!teacherId) {
    return (
      <div className="p-6">
        <Card className="max-w-lg mx-auto mt-8">
          <CardHeader>
            <CardTitle>Select a Teacher First</CardTitle>
            <p className="text-sm text-gray-500">Go to the Dashboard to select which teacher you are viewing as.</p>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const filtered = filter === "all" ? students : students.filter(s => s.studentType === filter);
  const spedCount = students.filter(s => s.studentType === "sped").length;
  const withAccommodations = students.filter(s => s.accommodations.length > 0).length;

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">My Classroom</h1>
        <p className="text-sm text-gray-500 mt-1">IEP accommodations, service schedules, and behavior observations for your students</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Students" value={students.length} icon={Users} />
        <StatCard label="With IEPs" value={spedCount} icon={ShieldCheck} />
        <StatCard label="With Accommodations" value={withAccommodations} icon={CheckCircle2} />
        <StatCard label="Service Pull-outs Today" value={countTodayPullouts(students)} icon={Clock} />
      </div>

      <div className="flex items-center gap-2">
        {(["all", "sped", "gen_ed"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f
                ? "bg-emerald-700 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f === "all" ? `All (${students.length})` : f === "sped" ? `SPED (${spedCount})` : `Gen Ed (${students.length - spedCount})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading classroom data...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p>No students found. Staff assignments link you to students.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(student => (
            <StudentCard
              key={student.id}
              student={student}
              expanded={expandedStudent === student.id}
              onToggle={() => setExpandedStudent(expandedStudent === student.id ? null : student.id)}
              onLogObservation={() => setObservationModal(student.id)}
            />
          ))}
        </div>
      )}

      {observationModal !== null && (
        <ObservationModal
          student={students.find(s => s.id === observationModal)!}
          staffId={teacherId}
          onClose={() => setObservationModal(null)}
          onSaved={(obs) => {
            setStudents(prev => prev.map(s =>
              s.id === obs.studentId
                ? { ...s, recentObservations: [{ id: obs.id, date: obs.observationDate, description: obs.description, severity: obs.severity }, ...s.recentObservations].slice(0, 5) }
                : s
            ));
            setObservationModal(null);
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
          <Icon className="w-4.5 h-4.5 text-emerald-600" />
        </div>
        <div>
          <p className="text-lg font-bold text-gray-800">{value}</p>
          <p className="text-[11px] text-gray-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function StudentCard({ student, expanded, onToggle, onLogObservation }: {
  student: ClassroomStudent;
  expanded: boolean;
  onToggle: () => void;
  onLogObservation: () => void;
}) {
  const isSped = student.studentType === "sped";
  const todaySchedule = getTodaySchedule(student.serviceSchedule);

  return (
    <Card className="overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
            isSped ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
          }`}>
            {student.firstName[0]}{student.lastName[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">{student.firstName} {student.lastName}</span>
              {isSped && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">IEP</span>
              )}
              <span className="text-[10px] text-gray-400">Grade {student.grade}</span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {student.accommodations.length > 0 && (
                <span className="text-[10px] text-emerald-600 flex items-center gap-0.5">
                  <CheckCircle2 className="w-3 h-3" /> {student.accommodations.length} accommodation{student.accommodations.length !== 1 ? "s" : ""}
                </span>
              )}
              {todaySchedule.length > 0 && (
                <span className="text-[10px] text-amber-600 flex items-center gap-0.5">
                  <Clock className="w-3 h-3" /> {todaySchedule.length} pull-out{todaySchedule.length !== 1 ? "s" : ""} today
                </span>
              )}
              {student.recentObservations.length > 0 && (
                <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
                  <AlertTriangle className="w-3 h-3" /> {student.recentObservations.length} recent note{student.recentObservations.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); onLogObservation(); }}
            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3 h-3" /> Log Observation
          </button>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t px-4 py-4 bg-gray-50/30 space-y-4">
          {student.accommodations.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Accommodations</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {student.accommodations.map(a => (
                  <div key={a.id} className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-gray-700">{a.description}</p>
                      <div className="flex gap-2 mt-0.5">
                        {a.category && <span className="text-[10px] text-gray-400">{a.category}</span>}
                        {a.frequency && <span className="text-[10px] text-gray-400">{a.frequency}</span>}
                        {a.setting && <span className="text-[10px] text-gray-400">{a.setting}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {student.serviceSchedule.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Service Pull-out Schedule</h4>
              <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                <div className="grid grid-cols-5 text-[10px] text-gray-400 font-medium border-b px-3 py-1.5">
                  {DAYS.map(d => <span key={d}>{d.slice(0, 3)}</span>)}
                </div>
                <div className="grid grid-cols-5 gap-1 p-2">
                  {DAYS.map(day => {
                    const entries = student.serviceSchedule.filter(s => s.dayOfWeek.toLowerCase() === day.toLowerCase());
                    return (
                      <div key={day} className="space-y-1">
                        {entries.length > 0 ? entries.map(e => (
                          <div key={e.id} className="text-[10px] bg-amber-50 rounded px-1.5 py-1 border border-amber-100">
                            <p className="font-medium text-amber-800">{e.label}</p>
                            <p className="text-amber-600">{e.startTime}–{e.endTime}</p>
                            {e.location && <p className="text-amber-500 flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{e.location}</p>}
                          </div>
                        )) : (
                          <div className="text-[10px] text-gray-300 py-1">—</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {student.behaviorTargets.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Behavior Targets (View Only)</h4>
              <div className="flex flex-wrap gap-1.5">
                {student.behaviorTargets.map(bt => (
                  <div key={bt.id} className="text-[10px] bg-emerald-50 rounded-lg px-2.5 py-1.5 border border-emerald-100">
                    <span className="font-medium text-emerald-700">{bt.name}</span>
                    <span className="text-emerald-500 ml-1">({bt.measurementType}, {bt.targetDirection})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {student.recentObservations.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Recent Observations</h4>
              <div className="space-y-1.5">
                {student.recentObservations.map(obs => {
                  const sev = SEVERITY_OPTIONS.find(s => s.value === obs.severity);
                  return (
                    <div key={obs.id} className="flex items-start gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400">{obs.date}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${sev?.color || "bg-gray-100 text-gray-600"}`}>
                            {sev?.label || obs.severity}
                          </span>
                        </div>
                        <p className="text-xs text-gray-700 mt-0.5">{obs.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {student.accommodations.length === 0 && student.serviceSchedule.length === 0 && student.behaviorTargets.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-3">No IEP accommodations, services, or behavior targets on file for this student.</p>
          )}
        </div>
      )}
    </Card>
  );
}

function ObservationModal({ student, staffId, onClose, onSaved }: {
  student: ClassroomStudent;
  staffId: number;
  onClose: () => void;
  onSaved: (obs: any) => void;
}) {
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("low");
  const [behaviorTargetId, setBehaviorTargetId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  const handleSubmit = async () => {
    if (!description.trim()) { toast.error("Please enter an observation"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/teacher-observations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          staffId,
          observationDate: today,
          description: description.trim(),
          severity,
          behaviorTargetId,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const obs = await res.json();
      toast.success("Observation logged");
      onSaved(obs);
    } catch {
      toast.error("Failed to save observation");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Log Behavior Observation</h3>
            <p className="text-xs text-gray-400 mt-0.5">{student.firstName} {student.lastName} &middot; {today}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1 block">What did you observe?</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief description of the behavior..."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
              rows={3}
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">Severity</label>
            <div className="flex gap-1.5">
              {SEVERITY_OPTIONS.map(s => (
                <button
                  key={s.value}
                  onClick={() => setSeverity(s.value)}
                  className={`text-[11px] px-3 py-1.5 rounded-full font-medium transition-all ${
                    severity === s.value ? s.color + " ring-1 ring-offset-1 ring-slate-300" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {student.behaviorTargets.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1.5 block">Link to Behavior Target (optional)</label>
              <select
                value={behaviorTargetId ?? ""}
                onChange={e => setBehaviorTargetId(e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400"
              >
                <option value="">None</option>
                {student.behaviorTargets.map(bt => (
                  <option key={bt.id} value={bt.id}>{bt.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="text-xs px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 font-medium">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !description.trim()}
            className="text-xs px-4 py-2 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            <Send className="w-3 h-3" /> {saving ? "Saving..." : "Log Observation"}
          </button>
        </div>
      </div>
    </div>
  );
}

function getTodaySchedule(schedule: ScheduleEntry[]): ScheduleEntry[] {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const today = dayNames[new Date().getDay()];
  return schedule.filter(s => s.dayOfWeek.toLowerCase() === today.toLowerCase());
}

function countTodayPullouts(students: ClassroomStudent[]): number {
  return students.reduce((sum, s) => sum + getTodaySchedule(s.serviceSchedule).length, 0);
}
