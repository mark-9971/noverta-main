import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  ArrowLeft, Plus, FileText, Target, TrendingUp, TrendingDown, Minus as MinusIcon,
  Save, X, ChevronRight, AlertTriangle, CheckCircle2, Clock, Sparkles,
  Download, Edit2, BookOpen, BarChart3, Loader2, FileCheck
} from "lucide-react";

const API = "/api";

interface Student { id: number; firstName: string; lastName: string; grade: string; }
interface ProgramTarget { id: number; name: string; domain: string; programType: string; currentPromptLevel: string; masteryCriterionPercent: number; }
interface BehaviorTarget { id: number; name: string; measurementType: string; baselineValue: string | null; goalValue: string | null; targetDirection: string; }
interface IepGoal {
  id: number; studentId: number; goalArea: string; goalNumber: number;
  annualGoal: string; baseline: string | null; targetCriterion: string | null;
  measurementMethod: string | null; scheduleOfReporting: string;
  programTargetId: number | null; behaviorTargetId: number | null;
  serviceArea: string | null; status: string; startDate: string | null;
  endDate: string | null; notes: string | null; active: boolean;
  linkedTarget?: { type: string; name: string; currentPromptLevel?: string; masteryCriterionPercent?: number; baselineValue?: string; goalValue?: string; measurementType?: string } | null;
}
interface GoalProgressEntry {
  iepGoalId: number; goalArea: string; goalNumber: number; annualGoal: string;
  baseline: string | null; targetCriterion: string | null;
  currentPerformance: string; progressRating: string; dataPoints: number;
  trendDirection: string; promptLevel?: string | null; percentCorrect?: number | null;
  behaviorValue?: number | null; behaviorGoal?: number | null; narrative: string;
}
interface ProgressReport {
  id: number; studentId: number; reportingPeriod: string; periodStart: string;
  periodEnd: string; status: string; overallSummary: string | null;
  serviceDeliverySummary: string | null; recommendations: string | null;
  parentNotes: string | null; goalProgress: GoalProgressEntry[];
  preparedByName?: string | null; createdAt: string;
}

const PROGRESS_RATINGS: Record<string, { label: string; color: string; icon: any; bg: string }> = {
  mastered: { label: "Mastered", color: "text-emerald-700", icon: CheckCircle2, bg: "bg-emerald-50" },
  sufficient_progress: { label: "Sufficient Progress", color: "text-blue-700", icon: TrendingUp, bg: "bg-blue-50" },
  some_progress: { label: "Some Progress", color: "text-amber-700", icon: Clock, bg: "bg-amber-50" },
  insufficient_progress: { label: "Insufficient Progress", color: "text-red-700", icon: AlertTriangle, bg: "bg-red-50" },
  not_addressed: { label: "Not Addressed", color: "text-slate-500", icon: MinusIcon, bg: "bg-slate-50" },
};

const TREND_ICONS: Record<string, { icon: any; color: string; label: string }> = {
  improving: { icon: TrendingUp, color: "text-emerald-500", label: "Improving" },
  declining: { icon: TrendingDown, color: "text-red-500", label: "Declining" },
  stable: { icon: MinusIcon, color: "text-slate-400", label: "Stable" },
};

export default function StudentIepPage() {
  const params = useParams<{ id: string }>();
  const studentId = Number(params.id);
  const [student, setStudent] = useState<Student | null>(null);
  const [goals, setGoals] = useState<IepGoal[]>([]);
  const [reports, setReports] = useState<ProgressReport[]>([]);
  const [programTargets, setProgramTargets] = useState<ProgramTarget[]>([]);
  const [behaviorTargets, setBehaviorTargets] = useState<BehaviorTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"goals" | "reports">("goals");
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showGenerateReport, setShowGenerateReport] = useState(false);
  const [viewingReport, setViewingReport] = useState<ProgressReport | null>(null);
  const [autoCreating, setAutoCreating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [s, g, r, pt, bt] = await Promise.all([
        fetch(`${API}/students/${studentId}`).then(r => r.json()),
        fetch(`${API}/students/${studentId}/iep-goals`).then(r => r.json()),
        fetch(`${API}/students/${studentId}/progress-reports`).then(r => r.json()),
        fetch(`${API}/students/${studentId}/program-targets`).then(r => r.json()),
        fetch(`${API}/students/${studentId}/behavior-targets`).then(r => r.json()),
      ]);
      setStudent(s);
      setGoals(g);
      setReports(r);
      setProgramTargets(pt);
      setBehaviorTargets(bt);
    } catch (e) {
      console.error("Failed to load IEP data:", e);
    }
    setLoading(false);
  }, [studentId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function autoCreateGoals() {
    setAutoCreating(true);
    const res = await fetch(`${API}/students/${studentId}/iep-goals/auto-create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: new Date().toISOString().split("T")[0] }),
    });
    if (res.ok) await loadData();
    setAutoCreating(false);
  }

  const goalsByArea = goals.reduce<Record<string, IepGoal[]>>((acc, g) => {
    if (!acc[g.goalArea]) acc[g.goalArea] = [];
    acc[g.goalArea].push(g);
    return acc;
  }, {});

  if (loading) return <div className="p-4 md:p-8"><Skeleton className="w-full h-96" /></div>;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4 md:space-y-6">
      <div>
        <Link href={`/students/${studentId}`} className="text-indigo-600 text-sm flex items-center gap-1.5 mb-4 hover:text-indigo-700">
          <ArrowLeft className="w-4 h-4" /> Back to Student
        </Link>
        {student && (
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 md:w-12 md:h-12 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 text-sm md:text-base font-bold flex-shrink-0">
                {student.firstName[0]}{student.lastName[0]}
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-slate-800">{student.firstName} {student.lastName}</h1>
                <p className="text-xs md:text-sm text-slate-400">IEP Goals & Progress Reports · Grade {student.grade}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3.5 md:p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-indigo-600">{goals.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">IEP Goals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5 md:p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-emerald-600">{programTargets.length + behaviorTargets.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Data Targets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5 md:p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-amber-600">{reports.length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Reports</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5 md:p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-slate-600">{Object.keys(goalsByArea).length}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Goal Areas</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-200 -mx-4 px-4 md:mx-0 md:px-0">
        {([
          { key: "goals" as const, label: "IEP Goals", icon: Target },
          { key: "reports" as const, label: "Progress Reports", icon: FileText },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-all ${
              tab === t.key ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-400 hover:text-slate-600"
            }`}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "goals" && (
        <div className="space-y-4 md:space-y-6">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-600">Annual IEP Goals</h3>
            <div className="flex gap-2">
              {(programTargets.length > 0 || behaviorTargets.length > 0) && goals.length === 0 && (
                <Button size="sm" variant="outline" className="text-[12px] h-8"
                  onClick={autoCreateGoals} disabled={autoCreating}>
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                  {autoCreating ? "Creating..." : "Auto-Create from Data Targets"}
                </Button>
              )}
              {(programTargets.length > 0 || behaviorTargets.length > 0) && goals.length > 0 && (
                <Button size="sm" variant="outline" className="text-[12px] h-8"
                  onClick={autoCreateGoals} disabled={autoCreating}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {autoCreating ? "Adding..." : "Add Missing Goals"}
                </Button>
              )}
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] h-8"
                onClick={() => setShowAddGoal(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Goal
              </Button>
            </div>
          </div>

          {goals.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Target className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600">No IEP Goals Yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  {programTargets.length > 0 || behaviorTargets.length > 0
                    ? `You have ${programTargets.length} program targets and ${behaviorTargets.length} behavior targets. Click "Auto-Create from Data Targets" to generate IEP goals from your existing data tracking.`
                    : "Add program and behavior targets in the Data page first, then create IEP goals from them."}
                </p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(goalsByArea).map(([area, areaGoals]) => (
              <div key={area}>
                <h4 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{area}</h4>
                <div className="space-y-2">
                  {areaGoals.map(goal => (
                    <GoalCard key={goal.id} goal={goal} onUpdated={loadData} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "reports" && (
        <div className="space-y-4 md:space-y-6">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-600">Progress Reports</h3>
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] h-8"
              onClick={() => setShowGenerateReport(true)} disabled={goals.length === 0}>
              <FileCheck className="w-3.5 h-3.5 mr-1" /> Generate Report
            </Button>
          </div>

          {goals.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-slate-400">Create IEP goals first before generating progress reports.</p>
              </CardContent>
            </Card>
          )}

          {reports.length === 0 && goals.length > 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600">No Progress Reports Yet</p>
                <p className="text-xs text-slate-400 mt-1">Click "Generate Report" to auto-populate a progress report from your data collection sessions.</p>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {reports.map(report => (
              <Card key={report.id} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => setViewingReport(report)}>
                <CardContent className="p-3.5 md:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-slate-700">{report.reportingPeriod}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}
                        {report.preparedByName && ` · By ${report.preparedByName}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        report.status === "final" ? "bg-emerald-50 text-emerald-700" :
                        report.status === "draft" ? "bg-amber-50 text-amber-700" :
                        "bg-slate-100 text-slate-600"
                      }`}>{report.status}</span>
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </div>
                  </div>
                  {report.goalProgress && report.goalProgress.length > 0 && (
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {Object.entries(
                        (report.goalProgress as GoalProgressEntry[]).reduce<Record<string, number>>((acc, g) => {
                          acc[g.progressRating] = (acc[g.progressRating] ?? 0) + 1;
                          return acc;
                        }, {})
                      ).map(([rating, count]) => {
                        const cfg = PROGRESS_RATINGS[rating];
                        return cfg ? (
                          <span key={rating} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color}`}>
                            {count} {cfg.label}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {showAddGoal && (
        <AddGoalModal
          studentId={studentId}
          programTargets={programTargets}
          behaviorTargets={behaviorTargets}
          existingGoals={goals}
          onClose={() => setShowAddGoal(false)}
          onSaved={() => { setShowAddGoal(false); loadData(); }}
        />
      )}
      {showGenerateReport && (
        <GenerateReportModal
          studentId={studentId}
          onClose={() => setShowGenerateReport(false)}
          onGenerated={(report) => { setShowGenerateReport(false); setReports(prev => [report, ...prev]); setViewingReport(report); }}
        />
      )}
      {viewingReport && (
        <ReportDetailModal
          report={viewingReport}
          studentName={student ? `${student.firstName} ${student.lastName}` : ""}
          onClose={() => setViewingReport(null)}
          onUpdated={(updated) => {
            const rid = viewingReport.id;
            setReports(prev => prev.map(r => r.id === rid ? { ...r, ...updated } : r));
            setViewingReport(prev => prev ? { ...prev, ...updated } : prev);
          }}
        />
      )}
    </div>
  );
}

function GoalCard({ goal, onUpdated }: { goal: IepGoal; onUpdated: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={`transition-shadow ${expanded ? "shadow-sm" : ""}`}>
      <CardContent className="p-3.5 md:p-4">
        <div className="flex items-start gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 text-xs font-bold flex-shrink-0">
            {goal.goalNumber}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-slate-700">{goal.annualGoal}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{goal.goalArea}</span>
              {goal.serviceArea && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">{goal.serviceArea}</span>}
              {goal.linkedTarget && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  goal.linkedTarget.type === "program" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                }`}>
                  Linked: {goal.linkedTarget.name}
                </span>
              )}
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-slate-300 transition-transform flex-shrink-0 ${expanded ? "rotate-90" : ""}`} />
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
            {goal.baseline && (
              <div><p className="text-[10px] text-slate-400 uppercase tracking-wider">Baseline</p><p className="text-[12px] text-slate-600">{goal.baseline}</p></div>
            )}
            {goal.targetCriterion && (
              <div><p className="text-[10px] text-slate-400 uppercase tracking-wider">Target Criterion</p><p className="text-[12px] text-slate-600">{goal.targetCriterion}</p></div>
            )}
            {goal.measurementMethod && (
              <div><p className="text-[10px] text-slate-400 uppercase tracking-wider">Measurement Method</p><p className="text-[12px] text-slate-600">{goal.measurementMethod}</p></div>
            )}
            <div className="flex items-center gap-3 text-[11px] text-slate-400">
              <span>Reporting: {goal.scheduleOfReporting}</span>
              {goal.startDate && <span>Start: {formatDate(goal.startDate)}</span>}
              {goal.endDate && <span>End: {formatDate(goal.endDate)}</span>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AddGoalModal({ studentId, programTargets, behaviorTargets, existingGoals, onClose, onSaved }: {
  studentId: number; programTargets: ProgramTarget[]; behaviorTargets: BehaviorTarget[];
  existingGoals: IepGoal[]; onClose: () => void; onSaved: () => void;
}) {
  const [goalArea, setGoalArea] = useState("Skill Acquisition");
  const [annualGoal, setAnnualGoal] = useState("");
  const [baseline, setBaseline] = useState("");
  const [targetCriterion, setTargetCriterion] = useState("");
  const [measurementMethod, setMeasurementMethod] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [linkedType, setLinkedType] = useState<"none" | "program" | "behavior">("none");
  const [linkedId, setLinkedId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const existingProgIds = new Set(existingGoals.map(g => g.programTargetId).filter(Boolean));
  const existingBehIds = new Set(existingGoals.map(g => g.behaviorTargetId).filter(Boolean));
  const availablePrograms = programTargets.filter(pt => !existingProgIds.has(pt.id));
  const availableBehaviors = behaviorTargets.filter(bt => !existingBehIds.has(bt.id));

  function selectLinkedTarget(type: "program" | "behavior", id: number) {
    setLinkedType(type);
    setLinkedId(id);
    if (type === "program") {
      const pt = programTargets.find(p => p.id === id);
      if (pt) {
        setGoalArea(pt.domain || "Skill Acquisition");
        setServiceArea(pt.domain || "ABA");
        setAnnualGoal(`${pt.name}: Student will demonstrate mastery at ${pt.masteryCriterionPercent ?? 80}% accuracy across 3 consecutive sessions.`);
        setBaseline(`Current prompt level: ${pt.currentPromptLevel ?? "verbal"}`);
        setTargetCriterion(`${pt.masteryCriterionPercent ?? 80}% across 3 sessions at independent level`);
        setMeasurementMethod(`${pt.programType === "discrete_trial" ? "Discrete trial" : "Task analysis"} data collection`);
      }
    } else {
      const bt = behaviorTargets.find(b => b.id === id);
      if (bt) {
        setGoalArea("Behavior");
        setServiceArea("Behavior");
        const dir = bt.targetDirection === "decrease" ? "reduce" : "increase";
        setAnnualGoal(`${bt.name}: Student will ${dir} ${bt.name.toLowerCase()} from ${bt.baselineValue ?? "baseline"} to ${bt.goalValue ?? "target"}.`);
        setBaseline(`${bt.baselineValue ?? "Not established"} (${bt.measurementType})`);
        setTargetCriterion(`${bt.goalValue ?? "Target"} or ${bt.targetDirection === "decrease" ? "fewer" : "greater"} per session`);
        setMeasurementMethod(`${bt.measurementType} data collection`);
      }
    }
  }

  async function save() {
    if (!annualGoal.trim()) return;
    setSaving(true);
    const goalNumber = existingGoals.filter(g => g.goalArea === goalArea).length + 1;
    const res = await fetch(`${API}/students/${studentId}/iep-goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        goalArea, goalNumber, annualGoal: annualGoal.trim(),
        baseline: baseline || null, targetCriterion: targetCriterion || null,
        measurementMethod: measurementMethod || null, serviceArea: serviceArea || null,
        programTargetId: linkedType === "program" ? linkedId : null,
        behaviorTargetId: linkedType === "behavior" ? linkedId : null,
      }),
    });
    if (res.ok) onSaved();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 md:p-6 w-full max-w-lg shadow-xl my-auto max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-slate-800">Add IEP Goal</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        {(availablePrograms.length > 0 || availableBehaviors.length > 0) && (
          <div className="mb-4">
            <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">Link to Data Target (auto-fills goal details)</label>
            <div className="space-y-1 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2">
              {availablePrograms.map(pt => (
                <button key={`p-${pt.id}`} onClick={() => selectLinkedTarget("program", pt.id)}
                  className={`w-full text-left px-2.5 py-2 rounded text-[12px] transition-all ${
                    linkedType === "program" && linkedId === pt.id ? "bg-indigo-50 border border-indigo-200" : "hover:bg-slate-50"
                  }`}>
                  <span className="font-medium text-slate-700">{pt.name}</span>
                  <span className="text-slate-400 ml-1">· Program · {pt.domain || "General"}</span>
                </button>
              ))}
              {availableBehaviors.map(bt => (
                <button key={`b-${bt.id}`} onClick={() => selectLinkedTarget("behavior", bt.id)}
                  className={`w-full text-left px-2.5 py-2 rounded text-[12px] transition-all ${
                    linkedType === "behavior" && linkedId === bt.id ? "bg-indigo-50 border border-indigo-200" : "hover:bg-slate-50"
                  }`}>
                  <span className="font-medium text-slate-700">{bt.name}</span>
                  <span className="text-slate-400 ml-1">· Behavior · {bt.measurementType}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-slate-500">Goal Area *</label>
              <input value={goalArea} onChange={e => setGoalArea(e.target.value)} placeholder="e.g. Skill Acquisition"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-500">Service Area</label>
              <input value={serviceArea} onChange={e => setServiceArea(e.target.value)} placeholder="e.g. ABA, Speech"
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-500">Annual Goal *</label>
            <textarea value={annualGoal} onChange={e => setAnnualGoal(e.target.value)} rows={3}
              placeholder="The student will..."
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-500">Baseline</label>
            <input value={baseline} onChange={e => setBaseline(e.target.value)} placeholder="Current performance level"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-500">Target Criterion</label>
            <input value={targetCriterion} onChange={e => setTargetCriterion(e.target.value)} placeholder="80% across 3 sessions"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-slate-500">Measurement Method</label>
            <input value={measurementMethod} onChange={e => setMeasurementMethod(e.target.value)} placeholder="Discrete trial data collection"
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[12px] h-9 md:h-8">Cancel</Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] h-9 md:h-8" disabled={!annualGoal.trim() || saving} onClick={save}>
            <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Goal"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function GenerateReportModal({ studentId, onClose, onGenerated }: {
  studentId: number; onClose: () => void; onGenerated: (report: ProgressReport) => void;
}) {
  const now = new Date();
  const currentMonth = now.getMonth();
  let qStart: string, qEnd: string, qLabel: string;

  if (currentMonth < 3) {
    qStart = `${now.getFullYear()}-01-01`;
    qEnd = `${now.getFullYear()}-03-31`;
    qLabel = `Q3 - Winter ${now.getFullYear()}`;
  } else if (currentMonth < 6) {
    qStart = `${now.getFullYear()}-04-01`;
    qEnd = `${now.getFullYear()}-06-30`;
    qLabel = `Q4 - Spring ${now.getFullYear()}`;
  } else if (currentMonth < 9) {
    qStart = `${now.getFullYear()}-07-01`;
    qEnd = `${now.getFullYear()}-09-30`;
    qLabel = `Q1 - Summer ${now.getFullYear()}`;
  } else {
    qStart = `${now.getFullYear()}-10-01`;
    qEnd = `${now.getFullYear()}-12-31`;
    qLabel = `Q2 - Fall ${now.getFullYear()}`;
  }

  const [periodStart, setPeriodStart] = useState(qStart);
  const [periodEnd, setPeriodEnd] = useState(qEnd);
  const [reportingPeriod, setReportingPeriod] = useState(qLabel);
  const [generating, setGenerating] = useState(false);

  async function generate() {
    setGenerating(true);
    const res = await fetch(`${API}/students/${studentId}/progress-reports/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodStart, periodEnd, reportingPeriod }),
    });
    if (res.ok) {
      const report = await res.json();
      onGenerated(report);
    }
    setGenerating(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 md:p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-slate-800">Generate Progress Report</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-indigo-50 rounded-lg p-3 mb-4 text-[12px] text-indigo-700">
          <Sparkles className="w-4 h-4 inline mr-1.5" />
          The report will automatically pull data from all program and behavior data sessions within the selected date range and generate progress narratives for each IEP goal.
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[12px] font-medium text-slate-500">Reporting Period Name</label>
            <input value={reportingPeriod} onChange={e => setReportingPeriod(e.target.value)}
              className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-slate-500">Start Date</label>
              <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-slate-500">End Date</label>
              <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
                className="w-full mt-1 border border-slate-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[12px] h-9 md:h-8">Cancel</Button>
          <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px] h-9 md:h-8" disabled={generating} onClick={generate}>
            {generating ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FileCheck className="w-3.5 h-3.5 mr-1" />}
            {generating ? "Generating..." : "Generate Report"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReportDetailModal({ report, studentName, onClose, onUpdated }: {
  report: ProgressReport; studentName: string; onClose: () => void;
  onUpdated: (updated: Partial<ProgressReport>) => void;
}) {
  const [editingNarrative, setEditingNarrative] = useState<number | null>(null);
  const [narrativeText, setNarrativeText] = useState("");
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryText, setSummaryText] = useState(report.overallSummary ?? "");
  const [recommendationsText, setRecommendationsText] = useState(report.recommendations ?? "");
  const [parentNotesText, setParentNotesText] = useState(report.parentNotes ?? "");
  const [saving, setSaving] = useState(false);

  const goalProgress = (report.goalProgress ?? []) as GoalProgressEntry[];

  async function saveChanges() {
    setSaving(true);
    const updatedGoals = [...goalProgress];
    if (editingNarrative !== null) {
      const idx = updatedGoals.findIndex(g => g.iepGoalId === editingNarrative);
      if (idx >= 0) updatedGoals[idx] = { ...updatedGoals[idx], narrative: narrativeText };
    }

    const res = await fetch(`${API}/progress-reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        overallSummary: summaryText,
        recommendations: recommendationsText,
        parentNotes: parentNotesText || null,
        goalProgress: updatedGoals,
      }),
    });
    if (res.ok) {
      onUpdated({
        overallSummary: summaryText,
        recommendations: recommendationsText,
        parentNotes: parentNotesText || null,
        goalProgress: updatedGoals,
      });
      setEditingNarrative(null);
      setEditingSummary(false);
    }
    setSaving(false);
  }

  async function finalizeReport() {
    setSaving(true);
    const res = await fetch(`${API}/progress-reports/${report.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "final" }),
    });
    if (res.ok) onUpdated({ status: "final" });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-3xl shadow-xl my-auto max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 p-4 md:p-5 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{report.reportingPeriod}</h2>
            <p className="text-xs text-slate-400">{studentName} · {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}</p>
          </div>
          <div className="flex items-center gap-2">
            {report.status === "draft" && (
              <Button size="sm" variant="outline" className="text-[12px] h-8 text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={finalizeReport} disabled={saving}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Finalize
              </Button>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-4 md:p-5 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Overall Summary</h3>
              {report.status === "draft" && (
                <button className="text-[11px] text-indigo-600 hover:text-indigo-800" onClick={() => setEditingSummary(!editingSummary)}>
                  <Edit2 className="w-3 h-3 inline mr-0.5" /> Edit
                </button>
              )}
            </div>
            {editingSummary ? (
              <div className="space-y-2">
                <textarea value={summaryText} onChange={e => setSummaryText(e.target.value)} rows={4}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
                <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px]" onClick={saveChanges} disabled={saving}>
                  <Save className="w-3.5 h-3.5 mr-1" /> Save
                </Button>
              </div>
            ) : (
              <p className="text-[13px] text-slate-600 whitespace-pre-line">{report.overallSummary}</p>
            )}
          </div>

          <div>
            <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Goal-by-Goal Progress</h3>
            <div className="space-y-3">
              {goalProgress.map((gp, idx) => {
                const rating = PROGRESS_RATINGS[gp.progressRating] ?? PROGRESS_RATINGS.not_addressed;
                const trend = TREND_ICONS[gp.trendDirection] ?? TREND_ICONS.stable;
                const RatingIcon = rating.icon;
                const TrendIcon = trend.icon;

                return (
                  <Card key={gp.iepGoalId}>
                    <CardContent className="p-3.5 md:p-4">
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 text-[11px] font-bold flex-shrink-0">
                          {gp.goalNumber}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">{gp.goalArea}</p>
                          <p className="text-[13px] font-medium text-slate-700 mt-0.5">{gp.annualGoal}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                        <div className={`${rating.bg} rounded-lg p-2 text-center`}>
                          <RatingIcon className={`w-4 h-4 mx-auto ${rating.color}`} />
                          <p className={`text-[10px] font-semibold mt-0.5 ${rating.color}`}>{rating.label}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 text-center">
                          <TrendIcon className={`w-4 h-4 mx-auto ${trend.color}`} />
                          <p className="text-[10px] font-medium text-slate-500 mt-0.5">{trend.label}</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 text-center">
                          <BarChart3 className="w-4 h-4 mx-auto text-slate-400" />
                          <p className="text-[10px] font-medium text-slate-500 mt-0.5">{gp.dataPoints} pts</p>
                        </div>
                        <div className="bg-slate-50 rounded-lg p-2 text-center">
                          <p className="text-sm font-bold text-indigo-600">
                            {gp.percentCorrect != null ? `${gp.percentCorrect}%` : gp.behaviorValue != null ? gp.behaviorValue : "—"}
                          </p>
                          <p className="text-[10px] font-medium text-slate-500 mt-0.5">Current</p>
                        </div>
                      </div>

                      <div className="bg-slate-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider">Narrative</p>
                          {report.status === "draft" && (
                            <button className="text-[10px] text-indigo-600 hover:text-indigo-800"
                              onClick={() => { setEditingNarrative(gp.iepGoalId); setNarrativeText(gp.narrative); }}>
                              <Edit2 className="w-3 h-3 inline mr-0.5" /> Edit
                            </button>
                          )}
                        </div>
                        {editingNarrative === gp.iepGoalId ? (
                          <div className="space-y-2">
                            <textarea value={narrativeText} onChange={e => setNarrativeText(e.target.value)} rows={3}
                              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
                            <div className="flex gap-2">
                              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] h-7" onClick={saveChanges} disabled={saving}>Save</Button>
                              <Button size="sm" variant="outline" className="text-[11px] h-7" onClick={() => setEditingNarrative(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[12px] text-slate-600">{gp.narrative}</p>
                        )}
                      </div>

                      {(gp.baseline || gp.targetCriterion || gp.promptLevel) && (
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400 flex-wrap">
                          {gp.baseline && <span>Baseline: {gp.baseline}</span>}
                          {gp.targetCriterion && <span>Target: {gp.targetCriterion}</span>}
                          {gp.promptLevel && <span>Prompt: {gp.promptLevel}</span>}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Recommendations</h3>
              {report.status === "draft" && !editingSummary && (
                <button className="text-[11px] text-indigo-600 hover:text-indigo-800" onClick={() => setEditingSummary(true)}>
                  <Edit2 className="w-3 h-3 inline mr-0.5" /> Edit
                </button>
              )}
            </div>
            {editingSummary ? (
              <textarea value={recommendationsText} onChange={e => setRecommendationsText(e.target.value)} rows={3}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
            ) : (
              <p className="text-[13px] text-slate-600">{report.recommendations || "None"}</p>
            )}
          </div>

          <div>
            <h3 className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Parent / Guardian Notes</h3>
            {report.status === "draft" ? (
              <textarea value={parentNotesText} onChange={e => setParentNotesText(e.target.value)} rows={2}
                placeholder="Optional notes for parent/guardian..."
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none" />
            ) : (
              <p className="text-[13px] text-slate-600">{report.parentNotes || "None"}</p>
            )}
          </div>

          {report.status === "draft" && editingSummary && (
            <div className="flex justify-end">
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px]" onClick={saveChanges} disabled={saving}>
                <Save className="w-3.5 h-3.5 mr-1" /> Save All Changes
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
