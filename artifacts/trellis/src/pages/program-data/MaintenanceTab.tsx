import { useState, useEffect } from "react";
import { listStudents } from "@workspace/api-client-react";
import {
  CheckCircle2, Clock, AlertTriangle, CalendarDays,
  RefreshCw, TrendingDown, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface Student { id: number; firstName: string; lastName: string; }

interface Probe {
  id: number;
  programTargetId: number;
  studentId: number;
  dueDate: string;
  completedAt: string | null;
  trialsCorrect: number | null;
  trialsTotal: number | null;
  percentCorrect: string | null;
  passed: boolean | null;
  notes: string | null;
  targetName: string | null;
  targetDomain: string | null;
  masteryCriterionPercent: number | null;
}

interface StudentProbes {
  student: Student;
  probes: Probe[];
}

const API_BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

async function fetchStudentProbes(studentId: number): Promise<Probe[]> {
  const res = await fetch(`${API_BASE}/api/students/${studentId}/maintenance-probes`);
  if (!res.ok) return [];
  return res.json();
}

async function completeProbe(probeId: number, trialsCorrect: number, trialsTotal: number, notes: string): Promise<Probe> {
  const res = await fetch(`${API_BASE}/api/maintenance-probes/${probeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ complete: true, trialsCorrect, trialsTotal, notes }),
  });
  return res.json();
}

async function scheduleProbe(programTargetId: number, dueDate: string, notes: string): Promise<Probe> {
  const res = await fetch(`${API_BASE}/api/program-targets/${programTargetId}/maintenance-probes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dueDate, notes }),
  });
  return res.json();
}

async function deleteProbe(probeId: number): Promise<void> {
  await fetch(`${API_BASE}/api/maintenance-probes/${probeId}`, { method: "DELETE" });
}

function probeStatus(probe: Probe): "overdue" | "upcoming" | "done_pass" | "done_fail" {
  if (probe.completedAt !== null) return probe.passed ? "done_pass" : "done_fail";
  const today = new Date().toISOString().slice(0, 10);
  return probe.dueDate < today ? "overdue" : "upcoming";
}

function ProbeCard({
  probe,
  onComplete,
  onDelete,
}: {
  probe: Probe;
  onComplete: (probe: Probe) => void;
  onDelete: (id: number) => void;
}) {
  const status = probeStatus(probe);
  const dueLabel = new Date(probe.dueDate + "T12:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  const statusBadge = {
    overdue: { label: "Overdue", cls: "bg-red-100 text-red-700", icon: AlertTriangle },
    upcoming: { label: "Upcoming", cls: "bg-blue-50 text-blue-600", icon: CalendarDays },
    done_pass: { label: "Passed", cls: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
    done_fail: { label: "Failed", cls: "bg-amber-100 text-amber-700", icon: TrendingDown },
  }[status];

  const StatusIcon = statusBadge.icon;

  return (
    <div className={`border rounded-xl p-3 flex items-start gap-3 transition-all ${
      status === "overdue"
        ? "border-red-200 bg-red-50/30"
        : status === "upcoming"
        ? "border-blue-100 bg-white"
        : status === "done_pass"
        ? "border-emerald-200 bg-emerald-50/30"
        : "border-amber-200 bg-amber-50/30"
    }`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${statusBadge.cls}`}>
        <StatusIcon className="w-3.5 h-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-gray-800 truncate">
            {probe.targetName ?? `Target #${probe.programTargetId}`}
          </span>
          {probe.targetDomain && (
            <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{probe.targetDomain}</span>
          )}
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-auto flex-shrink-0 ${statusBadge.cls}`}>
            <StatusIcon className="w-2.5 h-2.5 inline mr-0.5" />{statusBadge.label}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 flex-wrap">
          <span className="text-[11px] text-gray-500">
            {probe.completedAt ? "Completed" : "Due"}: {dueLabel}
          </span>
          {probe.completedAt && probe.trialsTotal !== null && (
            <span className="text-[11px] text-gray-600 font-medium">
              {probe.trialsCorrect}/{probe.trialsTotal} correct ({probe.percentCorrect}%)
              {probe.masteryCriterionPercent && (
                <span className="text-gray-400 ml-1">· criterion {probe.masteryCriterionPercent}%</span>
              )}
            </span>
          )}
        </div>
        {probe.notes && (
          <p className="text-[11px] text-gray-500 italic mt-1">"{probe.notes}"</p>
        )}
      </div>
      {status !== "done_pass" && status !== "done_fail" && (
        <div className="flex gap-1 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] px-2 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
            onClick={() => onComplete(probe)}
          >
            <CheckCircle2 className="w-3 h-3 mr-1" /> Record
          </Button>
          <button
            onClick={() => onDelete(probe.id)}
            className="text-gray-300 hover:text-red-400 transition-colors p-1"
            title="Delete probe"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

function RecordProbeModal({
  probe,
  onClose,
  onSaved,
}: {
  probe: Probe;
  onClose: () => void;
  onSaved: (updated: Probe) => void;
}) {
  const [correct, setCorrect] = useState("");
  const [total, setTotal] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const criterion = probe.masteryCriterionPercent ?? 80;
  const pct = total && correct ? Math.round((parseFloat(correct) / parseFloat(total)) * 100) : null;
  const wouldPass = pct !== null ? pct >= criterion : null;

  async function save() {
    if (!total) return;
    setSaving(true);
    const updated = await completeProbe(probe.id, parseInt(correct || "0"), parseInt(total), notes);
    onSaved(updated);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100">
          <h3 className="text-[15px] font-bold text-gray-800">Record Probe Result</h3>
          <p className="text-[12px] text-gray-400 mt-1">{probe.targetName}</p>
        </div>
        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500">Trials Correct</label>
              <input
                type="number" min="0" value={correct}
                onChange={e => setCorrect(e.target.value)}
                placeholder="0"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">Total Trials</label>
              <input
                type="number" min="1" value={total}
                onChange={e => setTotal(e.target.value)}
                placeholder="10"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>
          </div>
          {pct !== null && (
            <div className={`flex items-center gap-2 p-2.5 rounded-lg text-[12px] font-medium ${
              wouldPass ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"
            }`}>
              {wouldPass ? <CheckCircle2 className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {pct}% correct — {wouldPass ? `PASS (criterion: ${criterion}%)` : `FAIL (criterion: ${criterion}%)`}
            </div>
          )}
          <div>
            <label className="text-[12px] font-medium text-gray-500">Notes <span className="font-normal text-gray-400">(optional)</span></label>
            <input
              type="text" value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Observations, context…"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="bg-emerald-700 hover:bg-emerald-800 text-white"
            onClick={save}
            disabled={!total || saving}
          >
            {saving ? "Saving…" : "Save Result"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function MaintenanceTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [data, setData] = useState<StudentProbes[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordingProbe, setRecordingProbe] = useState<Probe | null>(null);
  const [expandedStudents, setExpandedStudents] = useState<Set<number>>(new Set());
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const allStudents: Student[] = await (listStudents as any)({ limit: 500 })
      .then((d: any) => (Array.isArray(d) ? d : d?.students ?? []).filter((s: any) => s.status === "active"))
      .catch(() => []);
    setStudents(allStudents);
    const results = await Promise.all(
      allStudents.map(async (s) => ({
        student: s,
        probes: await fetchStudentProbes(s.id),
      }))
    );
    setData(results.filter(r => r.probes.length > 0));
    const firstWithActive = results.find(r => r.probes.some(p => !p.completedAt));
    if (firstWithActive) setExpandedStudents(new Set([firstWithActive.student.id]));
    setLoading(false);
  }

  function toggleStudent(id: number) {
    setExpandedStudents(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleRecordSaved(updated: Probe) {
    setData(prev => prev.map(entry => ({
      ...entry,
      probes: entry.probes.map(p => p.id === updated.id ? updated : p),
    })));
    setRecordingProbe(null);
  }

  async function handleDelete(id: number) {
    await deleteProbe(id);
    setData(prev => prev.map(entry => ({
      ...entry,
      probes: entry.probes.filter(p => p.id !== id),
    })).filter(entry => entry.probes.length > 0));
  }

  const allProbes = data.flatMap(d => d.probes);
  const overdue = allProbes.filter(p => probeStatus(p) === "overdue");
  const upcoming = allProbes.filter(p => probeStatus(p) === "upcoming");
  const completed = allProbes.filter(p => p.completedAt !== null);
  const passed = completed.filter(p => p.passed);

  if (loading) {
    return (
      <div className="space-y-3 mt-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="mt-8 text-center space-y-3 py-12">
        <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mx-auto">
          <RefreshCw className="w-6 h-6 text-indigo-300" />
        </div>
        <p className="text-[14px] font-semibold text-gray-500">No maintenance probes scheduled</p>
        <p className="text-[12px] text-gray-400 max-w-sm mx-auto">
          Probes are created automatically when a target reaches the Mastered phase, or can be scheduled manually from any target's detail panel.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-5">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Overdue", value: overdue.length, cls: "bg-red-50 border-red-100 text-red-700", icon: AlertTriangle },
          { label: "Upcoming", value: upcoming.length, cls: "bg-blue-50 border-blue-100 text-blue-700", icon: CalendarDays },
          { label: "Completed", value: completed.length, cls: "bg-gray-50 border-gray-200 text-gray-600", icon: CheckCircle2 },
          { label: "Pass Rate", value: completed.length ? `${Math.round((passed.length / completed.length) * 100)}%` : "—", cls: "bg-emerald-50 border-emerald-100 text-emerald-700", icon: CheckCircle2 },
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className={`border rounded-xl p-3 flex items-center gap-3 ${card.cls}`}>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">{card.label}</p>
                <p className="text-[18px] font-bold leading-tight">{card.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Per-student probe list */}
      <div className="space-y-3">
        {data.map(({ student, probes }) => {
          const visibleProbes = showCompleted ? probes : probes.filter(p => !p.completedAt);
          if (visibleProbes.length === 0) return null;
          const isExpanded = expandedStudents.has(student.id);
          const overdueCount = visibleProbes.filter(p => probeStatus(p) === "overdue").length;

          return (
            <div key={student.id} className="border border-gray-100 rounded-xl overflow-hidden">
              <button
                onClick={() => toggleStudent(student.id)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50/80 hover:bg-gray-50 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-[11px] font-bold text-indigo-700">
                    {student.firstName[0]}{student.lastName[0]}
                  </span>
                </div>
                <div className="flex-1 text-left">
                  <span className="text-[13px] font-semibold text-gray-800">{student.firstName} {student.lastName}</span>
                  <span className="ml-2 text-[11px] text-gray-400">{visibleProbes.length} probe{visibleProbes.length !== 1 ? "s" : ""}</span>
                </div>
                {overdueCount > 0 && (
                  <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                    {overdueCount} overdue
                  </span>
                )}
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </button>
              {isExpanded && (
                <div className="p-3 space-y-2">
                  {visibleProbes
                    .sort((a, b) => {
                      const sa = probeStatus(a);
                      const sb = probeStatus(b);
                      const order = { overdue: 0, upcoming: 1, done_fail: 2, done_pass: 3 };
                      return (order[sa] - order[sb]) || a.dueDate.localeCompare(b.dueDate);
                    })
                    .map(probe => (
                      <ProbeCard
                        key={probe.id}
                        probe={probe}
                        onComplete={setRecordingProbe}
                        onDelete={handleDelete}
                      />
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pb-4">
        <button
          onClick={() => setShowCompleted(v => !v)}
          className="text-[12px] text-gray-400 hover:text-gray-600 flex items-center gap-1.5"
        >
          <Clock className="w-3.5 h-3.5" />
          {showCompleted ? "Hide completed probes" : "Show completed probes"}
        </button>
        <button
          onClick={loadData}
          className="text-[12px] text-gray-400 hover:text-gray-600 flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {recordingProbe && (
        <RecordProbeModal
          probe={recordingProbe}
          onClose={() => setRecordingProbe(null)}
          onSaved={handleRecordSaved}
        />
      )}
    </div>
  );
}
