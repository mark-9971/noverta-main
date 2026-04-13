import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  ArrowLeft, Plus, FileText, Target, TrendingUp, TrendingDown, Minus as MinusIcon,
  Save, X, ChevronRight, AlertTriangle, CheckCircle2, Clock, Sparkles,
  Download, Edit2, BookOpen, BarChart3, Loader2, FileCheck, Search,
  CalendarDays, Users, Copy, History, Phone, Mail, MessageSquare
} from "lucide-react";
import { toast } from "sonner";

const API = "/api";

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res;
}

interface Student { id: number; firstName: string; lastName: string; grade: string; dateOfBirth?: string | null; }
interface ProgramTarget { id: number; name: string; domain: string; programType: string; currentPromptLevel: string; masteryCriterionPercent: number; }
interface BehaviorTarget { id: number; name: string; measurementType: string; baselineValue: string | null; goalValue: string | null; targetDirection: string; }
interface IepGoal {
  id: number; studentId: number; goalArea: string; goalNumber: number;
  annualGoal: string; baseline: string | null; targetCriterion: string | null;
  measurementMethod: string | null; scheduleOfReporting: string;
  programTargetId: number | null; behaviorTargetId: number | null;
  serviceArea: string | null; status: string; startDate: string | null;
  endDate: string | null; notes: string | null; active: boolean; benchmarks: string | null;
  linkedTarget?: { type: string; name: string; currentPromptLevel?: string; masteryCriterionPercent?: number; baselineValue?: string; goalValue?: string; measurementType?: string } | null;
}
interface GoalProgressEntry {
  iepGoalId: number; goalArea: string; goalNumber: number; annualGoal: string;
  baseline: string | null; targetCriterion: string | null;
  currentPerformance: string; progressRating: string; progressCode: string; dataPoints: number;
  trendDirection: string; promptLevel?: string | null; percentCorrect?: number | null;
  behaviorValue?: number | null; behaviorGoal?: number | null; narrative: string;
  benchmarks?: string | null;
}
interface ProgressReport {
  id: number; studentId: number; reportingPeriod: string; periodStart: string;
  periodEnd: string; status: string; overallSummary: string | null;
  serviceDeliverySummary: string | null; recommendations: string | null;
  parentNotes: string | null; goalProgress: GoalProgressEntry[];
  preparedByName?: string | null; createdAt: string;
}
interface IepDocument {
  id: number; studentId: number; iepStartDate: string; iepEndDate: string;
  meetingDate: string | null; status: string;
  studentConcerns: string | null; parentConcerns: string | null; teamVision: string | null;
  plaafpAcademic: string | null; plaafpBehavioral: string | null;
  plaafpCommunication: string | null; plaafpAdditional: string | null;
  transitionAssessment: string | null; transitionPostsecGoals: string | null;
  transitionServices: string | null; transitionAgencies: string | null;
  esyEligible: boolean | null; esyServices: string | null; esyJustification: string | null;
  assessmentParticipation: string | null; assessmentAccommodations: string | null;
  alternateAssessmentJustification: string | null;
  scheduleModifications: string | null; transportationServices: string | null;
  active: boolean;
}
interface Accommodation {
  id: number; studentId: number; category: string; description: string;
  setting: string | null; frequency: string | null; provider: string | null; active: boolean;
}
interface TeamMeeting {
  id: number; studentId: number; meetingType: string; scheduledDate: string;
  scheduledTime: string | null; location: string | null; status: string;
  notes: string | null; attendees: { name: string; role: string; present?: boolean }[] | null;
  consentStatus: string | null; noticeSentDate: string | null; outcome: string | null;
}
interface GoalBankEntry {
  id: number; domain: string; goalArea: string; goalText: string;
  benchmarkText: string | null; gradeRange: string | null; tags: string | null;
}
interface CompletenessData {
  percentage: number; completedCount: number; totalCount: number;
  isComplete: boolean; missingSections: { section: string; label: string }[];
}

const PROGRESS_RATINGS: Record<string, { label: string; color: string; icon: any; bg: string }> = {
  mastered: { label: "Mastered", color: "text-emerald-700", icon: CheckCircle2, bg: "bg-emerald-50" },
  sufficient_progress: { label: "Sufficient Progress", color: "text-blue-700", icon: TrendingUp, bg: "bg-blue-50" },
  some_progress: { label: "Some Progress", color: "text-amber-700", icon: Clock, bg: "bg-amber-50" },
  insufficient_progress: { label: "Insufficient Progress", color: "text-red-700", icon: AlertTriangle, bg: "bg-red-50" },
  not_addressed: { label: "Not Addressed", color: "text-gray-500", icon: MinusIcon, bg: "bg-gray-50" },
};

const MA_PROGRESS_CODES: Record<string, { label: string; fullLabel: string; color: string; bg: string }> = {
  M: { label: "M", fullLabel: "Mastered", color: "text-emerald-700", bg: "bg-emerald-50" },
  SP: { label: "SP", fullLabel: "Sufficient Progress", color: "text-blue-700", bg: "bg-blue-50" },
  IP: { label: "IP", fullLabel: "Insufficient Progress", color: "text-amber-700", bg: "bg-amber-50" },
  NP: { label: "NP", fullLabel: "No Progress", color: "text-red-700", bg: "bg-red-50" },
  NA: { label: "NA", fullLabel: "Not Addressed", color: "text-gray-500", bg: "bg-gray-50" },
  R: { label: "R", fullLabel: "Regression", color: "text-red-800", bg: "bg-red-100" },
};

const TREND_ICONS: Record<string, { icon: any; color: string; label: string }> = {
  improving: { icon: TrendingUp, color: "text-emerald-500", label: "Improving" },
  declining: { icon: TrendingDown, color: "text-red-500", label: "Declining" },
  stable: { icon: MinusIcon, color: "text-gray-400", label: "Stable" },
};

export default function StudentIepPage() {
  const params = useParams<{ id: string }>();
  const studentId = Number(params.id);
  const [student, setStudent] = useState<Student | null>(null);
  const [goals, setGoals] = useState<IepGoal[]>([]);
  const [reports, setReports] = useState<ProgressReport[]>([]);
  const [programTargets, setProgramTargets] = useState<ProgramTarget[]>([]);
  const [behaviorTargets, setBehaviorTargets] = useState<BehaviorTarget[]>([]);
  const [iepDocs, setIepDocs] = useState<IepDocument[]>([]);
  const [accommodations, setAccommodations] = useState<Accommodation[]>([]);
  const [teamMeetings, setTeamMeetings] = useState<TeamMeeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"document" | "goals" | "accommodations" | "reports" | "meetings" | "contacts">("document");
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showGoalBank, setShowGoalBank] = useState(false);
  const [showGenerateReport, setShowGenerateReport] = useState(false);
  const [viewingReport, setViewingReport] = useState<ProgressReport | null>(null);
  const [autoCreating, setAutoCreating] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [s, g, r, pt, bt, docs, accs, mtgs] = await Promise.all([
        fetch(`${API}/students/${studentId}`).then(r => r.ok ? r.json() : null),
        fetch(`${API}/students/${studentId}/iep-goals`).then(r => r.json()),
        fetch(`${API}/students/${studentId}/progress-reports`).then(r => r.json()),
        fetch(`${API}/students/${studentId}/program-targets`).then(r => r.json()),
        fetch(`${API}/students/${studentId}/behavior-targets`).then(r => r.json()),
        fetch(`${API}/students/${studentId}/iep-documents`).then(r => r.json()),
        fetch(`${API}/students/${studentId}/accommodations`).then(r => r.json()),
        fetch(`${API}/students/${studentId}/team-meetings`).then(r => r.json()),
      ]);
      setStudent(s);
      setGoals(Array.isArray(g) ? g : []);
      setReports(Array.isArray(r) ? r : []);
      setProgramTargets(Array.isArray(pt) ? pt : []);
      setBehaviorTargets(Array.isArray(bt) ? bt : []);
      setIepDocs(Array.isArray(docs) ? docs : []);
      setAccommodations(Array.isArray(accs) ? accs : []);
      setTeamMeetings(Array.isArray(mtgs) ? mtgs : []);
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

  if (!student) return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto">
      <Link href="/students" className="text-emerald-700 text-sm flex items-center gap-1.5 mb-4 hover:text-emerald-800">
        <ArrowLeft className="w-4 h-4" /> Back to Students
      </Link>
      <div className="text-center py-16">
        <p className="text-lg font-semibold text-gray-700">Student not found</p>
        <p className="text-sm text-gray-400 mt-1">The student you're looking for doesn't exist or has been removed.</p>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4 md:space-y-6">
      <div>
        <Link href={`/students/${studentId}`} className="text-emerald-700 text-sm flex items-center gap-1.5 mb-4 hover:text-emerald-800">
          <ArrowLeft className="w-4 h-4" /> Back to Student
        </Link>
        {student && (
          <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 md:w-12 md:h-12 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-700 text-sm md:text-base font-bold flex-shrink-0">
                {student.firstName[0]}{student.lastName[0]}
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-800">{student.firstName} {student.lastName}</h1>
                <p className="text-xs md:text-sm text-gray-400">IEP — 603 CMR 28.00 · Grade {student.grade}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3.5 md:p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-emerald-700">{goals.length}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">IEP Goals</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5 md:p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-emerald-600">{programTargets.length + behaviorTargets.length}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Data Targets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5 md:p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-amber-600">{reports.length}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Reports</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3.5 md:p-4 text-center">
            <p className="text-2xl md:text-3xl font-bold text-gray-600">{Object.keys(goalsByArea).length}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Goal Areas</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200 -mx-4 px-4 md:mx-0 md:px-0 overflow-x-auto">
        {([
          { key: "document" as const, label: "IEP Document", icon: FileCheck },
          { key: "goals" as const, label: "Goals", icon: Target },
          { key: "accommodations" as const, label: "Accommodations", icon: BookOpen },
          { key: "meetings" as const, label: "Meetings", icon: Users },
          { key: "reports" as const, label: "Progress Reports", icon: FileText },
          { key: "contacts" as const, label: "Parent Log", icon: Phone },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-3 md:px-4 py-2.5 text-[12px] md:text-[13px] font-medium border-b-2 transition-all whitespace-nowrap ${
              tab === t.key ? "border-emerald-700 text-emerald-800" : "border-transparent text-gray-400 hover:text-gray-600"
            }`}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {tab === "document" && (
        <div className="space-y-4">
          {iepDocs.length > 0 && iepDocs[0] && (
            <IepCompletenessIndicator studentId={studentId} docId={iepDocs.find(d => d.active)?.id || iepDocs[0].id} />
          )}
          <IepDocumentSection studentId={studentId} student={student} iepDocs={iepDocs} onSaved={loadData} />
        </div>
      )}

      {tab === "accommodations" && (
        <AccommodationsSection studentId={studentId} accommodations={accommodations} onSaved={loadData} />
      )}

      {tab === "meetings" && (
        <TeamMeetingsSection studentId={studentId} meetings={teamMeetings} onSaved={loadData} />
      )}

      {tab === "contacts" && (
        <ParentContactsSection studentId={studentId} />
      )}

      {tab === "goals" && (
        <div className="space-y-4 md:space-y-6">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-600">Annual IEP Goals</h3>
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
              <Button size="sm" variant="outline" className="text-[12px] h-8"
                onClick={() => setShowGoalBank(true)}>
                <BookOpen className="w-3.5 h-3.5 mr-1" /> Goal Bank
              </Button>
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8"
                onClick={() => setShowAddGoal(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Goal
              </Button>
            </div>
          </div>

          {goals.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Target className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600">No IEP Goals Yet</p>
                <p className="text-xs text-gray-400 mt-1 max-w-md mx-auto">
                  {programTargets.length > 0 || behaviorTargets.length > 0
                    ? `You have ${programTargets.length} program targets and ${behaviorTargets.length} behavior targets. Click "Auto-Create from Data Targets" to generate IEP goals from your existing data tracking.`
                    : "Add program and behavior targets in the Data page first, then create IEP goals from them."}
                </p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(goalsByArea).map(([area, areaGoals]) => (
              <div key={area}>
                <h4 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-2">{area}</h4>
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
            <h3 className="text-sm font-semibold text-gray-600">Progress Reports</h3>
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8"
              onClick={() => setShowGenerateReport(true)} disabled={goals.length === 0}>
              <FileCheck className="w-3.5 h-3.5 mr-1" /> Generate Report
            </Button>
          </div>

          {goals.length === 0 && (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-sm text-gray-400">Create IEP goals first before generating progress reports.</p>
              </CardContent>
            </Card>
          )}

          {reports.length === 0 && goals.length > 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600">No Progress Reports Yet</p>
                <p className="text-xs text-gray-400 mt-1">Click "Generate Report" to auto-populate a progress report from your data collection sessions.</p>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {reports.map(report => (
              <Card key={report.id} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => setViewingReport(report)}>
                <CardContent className="p-3.5 md:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-gray-700">{report.reportingPeriod}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}
                        {report.preparedByName && ` · By ${report.preparedByName}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        report.status === "final" ? "bg-emerald-50 text-emerald-700" :
                        report.status === "draft" ? "bg-amber-50 text-amber-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>{report.status}</span>
                      <ChevronRight className="w-4 h-4 text-gray-300" />
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
      {showGoalBank && (
        <GoalBankModal
          studentId={studentId}
          existingGoals={goals}
          onClose={() => setShowGoalBank(false)}
          onGoalAdded={() => { loadData(); }}
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
          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-700 text-xs font-bold flex-shrink-0">
            {goal.goalNumber}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-gray-700">{goal.annualGoal}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{goal.goalArea}</span>
              {goal.serviceArea && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">{goal.serviceArea}</span>}
              {goal.linkedTarget && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  goal.linkedTarget.type === "program" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                }`}>
                  Linked: {goal.linkedTarget.name}
                </span>
              )}
            </div>
          </div>
          <ChevronRight className={`w-4 h-4 text-gray-300 transition-transform flex-shrink-0 ${expanded ? "rotate-90" : ""}`} />
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
            {goal.baseline && (
              <div><p className="text-[10px] text-gray-400 uppercase tracking-wider">Baseline</p><p className="text-[12px] text-gray-600">{goal.baseline}</p></div>
            )}
            {goal.targetCriterion && (
              <div><p className="text-[10px] text-gray-400 uppercase tracking-wider">Target Criterion</p><p className="text-[12px] text-gray-600">{goal.targetCriterion}</p></div>
            )}
            {goal.measurementMethod && (
              <div><p className="text-[10px] text-gray-400 uppercase tracking-wider">Measurement Method</p><p className="text-[12px] text-gray-600">{goal.measurementMethod}</p></div>
            )}
            {goal.benchmarks && (
              <div><p className="text-[10px] text-gray-400 uppercase tracking-wider">Benchmarks / Short-Term Objectives</p><p className="text-[12px] text-gray-600 whitespace-pre-line">{goal.benchmarks}</p></div>
            )}
            <div className="flex items-center gap-3 text-[11px] text-gray-400">
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
  const [benchmarks, setBenchmarks] = useState("");
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
    if (!annualGoal.trim()) { toast.error("Please enter the annual goal text"); return; }
    setSaving(true);
    try {
      const goalNumber = existingGoals.filter(g => g.goalArea === goalArea).length + 1;
      const res = await fetch(`${API}/students/${studentId}/iep-goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalArea, goalNumber, annualGoal: annualGoal.trim(),
          baseline: baseline || null, targetCriterion: targetCriterion || null,
          measurementMethod: measurementMethod || null, serviceArea: serviceArea || null,
          benchmarks: benchmarks || null,
          programTargetId: linkedType === "program" ? linkedId : null,
          behaviorTargetId: linkedType === "behavior" ? linkedId : null,
        }),
      });
      if (res.ok) { toast.success("IEP goal added"); onSaved(); }
      else toast.error("Failed to save goal");
    } catch { toast.error("Network error. Please try again."); }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-5 md:p-6 w-full max-w-lg shadow-xl my-auto max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[16px] font-bold text-gray-800">Add IEP Goal</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {(availablePrograms.length > 0 || availableBehaviors.length > 0) && (
          <div className="mb-4">
            <label className="text-[12px] font-medium text-gray-500 mb-1.5 block">Link to Data Target (auto-fills goal details)</label>
            <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {availablePrograms.map(pt => (
                <button key={`p-${pt.id}`} onClick={() => selectLinkedTarget("program", pt.id)}
                  className={`w-full text-left px-2.5 py-2 rounded text-[12px] transition-all ${
                    linkedType === "program" && linkedId === pt.id ? "bg-emerald-50 border border-emerald-200" : "hover:bg-gray-50"
                  }`}>
                  <span className="font-medium text-gray-700">{pt.name}</span>
                  <span className="text-gray-400 ml-1">· Program · {pt.domain || "General"}</span>
                </button>
              ))}
              {availableBehaviors.map(bt => (
                <button key={`b-${bt.id}`} onClick={() => selectLinkedTarget("behavior", bt.id)}
                  className={`w-full text-left px-2.5 py-2 rounded text-[12px] transition-all ${
                    linkedType === "behavior" && linkedId === bt.id ? "bg-emerald-50 border border-emerald-200" : "hover:bg-gray-50"
                  }`}>
                  <span className="font-medium text-gray-700">{bt.name}</span>
                  <span className="text-gray-400 ml-1">· Behavior · {bt.measurementType}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500">Goal Area *</label>
              <input value={goalArea} onChange={e => setGoalArea(e.target.value)} placeholder="e.g. Skill Acquisition"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">Service Area</label>
              <input value={serviceArea} onChange={e => setServiceArea(e.target.value)} placeholder="e.g. ABA, Speech"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>
          <div>
            <label className="text-[12px] font-medium text-gray-500">Annual Goal *</label>
            <textarea value={annualGoal} onChange={e => setAnnualGoal(e.target.value)} rows={3}
              placeholder="The student will..."
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-gray-500">Baseline</label>
            <input value={baseline} onChange={e => setBaseline(e.target.value)} placeholder="Current performance level"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-gray-500">Target Criterion</label>
            <input value={targetCriterion} onChange={e => setTargetCriterion(e.target.value)} placeholder="80% across 3 sessions"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-gray-500">Measurement Method</label>
            <input value={measurementMethod} onChange={e => setMeasurementMethod(e.target.value)} placeholder="Discrete trial data collection"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-gray-500">Benchmarks / Short-Term Objectives</label>
            <textarea value={benchmarks} onChange={e => setBenchmarks(e.target.value)} rows={3}
              placeholder="1. By [date], student will...&#10;2. By [date], student will..."
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[12px] h-9 md:h-8">Cancel</Button>
          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-9 md:h-8" disabled={!annualGoal.trim() || saving} onClick={save}>
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
          <h2 className="text-[16px] font-bold text-gray-800">Generate Progress Report</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-emerald-50 rounded-lg p-3 mb-4 text-[12px] text-emerald-800">
          <Sparkles className="w-4 h-4 inline mr-1.5" />
          The report will automatically pull data from all program and behavior data sessions within the selected date range and generate progress narratives for each IEP goal.
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[12px] font-medium text-gray-500">Reporting Period Name</label>
            <input value={reportingPeriod} onChange={e => setReportingPeriod(e.target.value)}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] font-medium text-gray-500">Start Date</label>
              <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[12px] font-medium text-gray-500">End Date</label>
              <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 md:py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" size="sm" onClick={onClose} className="text-[12px] h-9 md:h-8">Cancel</Button>
          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-9 md:h-8" disabled={generating} onClick={generate}>
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
        <div className="sticky top-0 bg-white border-b border-gray-100 p-4 md:p-5 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-800">{report.reportingPeriod}</h2>
            <p className="text-xs text-gray-400">{studentName} · {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}</p>
          </div>
          <div className="flex items-center gap-2">
            {report.status === "draft" && (
              <Button size="sm" variant="outline" className="text-[12px] h-8 text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={finalizeReport} disabled={saving}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Finalize
              </Button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-4 md:p-5 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider">Overall Summary</h3>
              {report.status === "draft" && (
                <button className="text-[11px] text-emerald-700 hover:text-emerald-900" onClick={() => setEditingSummary(!editingSummary)}>
                  <Edit2 className="w-3 h-3 inline mr-0.5" /> Edit
                </button>
              )}
            </div>
            {editingSummary ? (
              <div className="space-y-2">
                <textarea value={summaryText} onChange={e => setSummaryText(e.target.value)} rows={4}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
                <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" onClick={saveChanges} disabled={saving}>
                  <Save className="w-3.5 h-3.5 mr-1" /> Save
                </Button>
              </div>
            ) : (
              <p className="text-[13px] text-gray-600 whitespace-pre-line">{report.overallSummary}</p>
            )}
          </div>

          <div>
            <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Goal-by-Goal Progress</h3>
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
                        <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-700 text-[11px] font-bold flex-shrink-0">
                          {gp.goalNumber}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider">{gp.goalArea}</p>
                          <p className="text-[13px] font-medium text-gray-700 mt-0.5">{gp.annualGoal}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                        {gp.progressCode && MA_PROGRESS_CODES[gp.progressCode] ? (
                          <div className={`${MA_PROGRESS_CODES[gp.progressCode].bg} rounded-lg p-2 text-center`}>
                            <p className={`text-lg font-bold ${MA_PROGRESS_CODES[gp.progressCode].color}`}>{gp.progressCode}</p>
                            <p className={`text-[9px] font-medium mt-0.5 ${MA_PROGRESS_CODES[gp.progressCode].color}`}>{MA_PROGRESS_CODES[gp.progressCode].fullLabel}</p>
                          </div>
                        ) : (
                          <div className={`${rating.bg} rounded-lg p-2 text-center`}>
                            <RatingIcon className={`w-4 h-4 mx-auto ${rating.color}`} />
                            <p className={`text-[10px] font-semibold mt-0.5 ${rating.color}`}>{rating.label}</p>
                          </div>
                        )}
                        <div className={`${rating.bg} rounded-lg p-2 text-center`}>
                          <RatingIcon className={`w-4 h-4 mx-auto ${rating.color}`} />
                          <p className={`text-[10px] font-semibold mt-0.5 ${rating.color}`}>{rating.label}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <TrendIcon className={`w-4 h-4 mx-auto ${trend.color}`} />
                          <p className="text-[10px] font-medium text-gray-500 mt-0.5">{trend.label}</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <BarChart3 className="w-4 h-4 mx-auto text-gray-400" />
                          <p className="text-[10px] font-medium text-gray-500 mt-0.5">{gp.dataPoints} pts</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-2 text-center">
                          <p className="text-sm font-bold text-emerald-700">
                            {gp.percentCorrect != null ? `${gp.percentCorrect}%` : gp.behaviorValue != null ? gp.behaviorValue : "—"}
                          </p>
                          <p className="text-[10px] font-medium text-gray-500 mt-0.5">Current</p>
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-[10px] text-gray-400 uppercase tracking-wider">Narrative</p>
                          {report.status === "draft" && (
                            <button className="text-[10px] text-emerald-700 hover:text-emerald-900"
                              onClick={() => { setEditingNarrative(gp.iepGoalId); setNarrativeText(gp.narrative); }}>
                              <Edit2 className="w-3 h-3 inline mr-0.5" /> Edit
                            </button>
                          )}
                        </div>
                        {editingNarrative === gp.iepGoalId ? (
                          <div className="space-y-2">
                            <textarea value={narrativeText} onChange={e => setNarrativeText(e.target.value)} rows={3}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
                            <div className="flex gap-2">
                              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] h-7" onClick={saveChanges} disabled={saving}>Save</Button>
                              <Button size="sm" variant="outline" className="text-[11px] h-7" onClick={() => setEditingNarrative(null)}>Cancel</Button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-[12px] text-gray-600">{gp.narrative}</p>
                        )}
                      </div>

                      {(gp.baseline || gp.targetCriterion || gp.promptLevel) && (
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400 flex-wrap">
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
              <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider">Recommendations</h3>
              {report.status === "draft" && !editingSummary && (
                <button className="text-[11px] text-emerald-700 hover:text-emerald-900" onClick={() => setEditingSummary(true)}>
                  <Edit2 className="w-3 h-3 inline mr-0.5" /> Edit
                </button>
              )}
            </div>
            {editingSummary ? (
              <textarea value={recommendationsText} onChange={e => setRecommendationsText(e.target.value)} rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
            ) : (
              <p className="text-[13px] text-gray-600">{report.recommendations || "None"}</p>
            )}
          </div>

          <div>
            <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Parent / Guardian Notes</h3>
            {report.status === "draft" ? (
              <textarea value={parentNotesText} onChange={e => setParentNotesText(e.target.value)} rows={2}
                placeholder="Optional notes for parent/guardian..."
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
            ) : (
              <p className="text-[13px] text-gray-600">{report.parentNotes || "None"}</p>
            )}
          </div>

          {report.status === "draft" && editingSummary && (
            <div className="flex justify-end">
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" onClick={saveChanges} disabled={saving}>
                <Save className="w-3.5 h-3.5 mr-1" /> Save All Changes
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const PLAAFP_SECTIONS = [
  { key: "plaafpAcademic", label: "A. Academic Performance" },
  { key: "plaafpBehavioral", label: "B. Behavioral / Social-Emotional" },
  { key: "plaafpCommunication", label: "C. Communication" },
  { key: "plaafpAdditional", label: "D. Additional (Health, Physical, Daily Living)" },
] as const;

const ACCOMMODATION_CATEGORIES = [
  { value: "instruction", label: "Instructional" },
  { value: "assessment", label: "Assessment" },
  { value: "testing", label: "State Testing" },
  { value: "environmental", label: "Environmental" },
  { value: "behavioral", label: "Behavioral" },
  { value: "other", label: "Other" },
];

function AmendButton({ studentId, docId, onAmended }: { studentId: number; docId: number; onAmended: () => void }) {
  const [showDialog, setShowDialog] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function createAmendment() {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch(`${API}/students/${studentId}/iep-documents/${docId}/amend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amendmentReason: reason.trim() }),
      });
      setShowDialog(false);
      setReason("");
      onAmended();
    } catch (e) {
      console.error("Failed to create amendment:", e);
    }
    setSubmitting(false);
  }

  if (!showDialog) {
    return (
      <Button size="sm" variant="outline" className="text-[12px] h-8 text-amber-600 border-amber-200 hover:bg-amber-50"
        onClick={() => setShowDialog(true)}>
        <Copy className="w-3.5 h-3.5 mr-1" /> Amend
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Create IEP Amendment</h3>
        <p className="text-[12px] text-gray-500 mb-3">This will copy the current IEP as a draft amendment. The original remains active until the amendment is finalized.</p>
        <label className="text-[11px] font-medium text-gray-500">Reason for Amendment</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Describe why this IEP needs to be amended..."
          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
        <div className="flex justify-end gap-2 mt-4">
          <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => { setShowDialog(false); setReason(""); }}>Cancel</Button>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-[12px] h-8" onClick={createAmendment} disabled={submitting || !reason.trim()}>
            <Copy className="w-3.5 h-3.5 mr-1" /> {submitting ? "Creating..." : "Create Amendment Draft"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function IepDocumentSection({ studentId, student, iepDocs, onSaved }: {
  studentId: number; student: Student | null; iepDocs: IepDocument[]; onSaved: () => void;
}) {
  const activeDoc = iepDocs.find(d => d.active) || iepDocs[0] || null;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<IepDocument>>({});

  const studentAge = student?.dateOfBirth
    ? Math.floor((Date.now() - new Date(student.dateOfBirth).getTime()) / (365.25 * 86400000))
    : null;
  const showTransition = studentAge !== null && studentAge >= 14;

  function startEdit() {
    if (activeDoc) {
      setForm({ ...activeDoc });
    } else {
      const now = new Date();
      const nextYear = new Date(now);
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      setForm({
        iepStartDate: now.toISOString().split("T")[0],
        iepEndDate: nextYear.toISOString().split("T")[0],
        meetingDate: now.toISOString().split("T")[0],
        status: "draft",
      });
    }
    setEditing(true);
  }

  function updateField(key: string, val: any) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  async function save() {
    setSaving(true);
    try {
      if (activeDoc) {
        await apiFetch(`${API}/iep-documents/${activeDoc.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      } else {
        await apiFetch(`${API}/students/${studentId}/iep-documents`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, studentId }),
        });
      }
      setEditing(false);
      onSaved();
    } catch (e) {
      console.error("Failed to save IEP document:", e);
    }
    setSaving(false);
  }

  function TextSection({ label, fieldKey, rows = 3 }: { label: string; fieldKey: string; rows?: number }) {
    const val = (form as any)[fieldKey] ?? "";
    const displayVal = activeDoc ? (activeDoc as any)[fieldKey] ?? "" : "";
    if (editing) {
      return (
        <div>
          <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{label}</label>
          <textarea value={val} onChange={e => updateField(fieldKey, e.target.value)} rows={rows}
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
        </div>
      );
    }
    if (!displayVal) return null;
    return (
      <div>
        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-[13px] text-gray-600 whitespace-pre-line">{displayVal}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-600">IEP Document (MA DESE Form)</h3>
          {activeDoc?.iepType && (
            <span className="text-[10px] text-gray-400 mt-0.5">
              Type: {activeDoc.iepType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
              {activeDoc.version ? ` (v${activeDoc.version})` : ""}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {!editing && activeDoc && (
            <AmendButton studentId={studentId} docId={activeDoc.id} onAmended={onSaved} />
          )}
          {!editing && (
            <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={startEdit}>
              <Edit2 className="w-3.5 h-3.5 mr-1" /> {activeDoc ? "Edit" : "Create IEP Document"}
            </Button>
          )}
          {editing && (
            <>
              <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8" onClick={save} disabled={saving}>
                <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      {iepDocs.length > 1 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <History className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">IEP History & Amendments</span>
            </div>
            <div className="space-y-1">
              {iepDocs.map(doc => (
                <div key={doc.id} className={`flex items-center justify-between px-2 py-1.5 rounded text-[12px] ${doc.active ? "bg-emerald-50 border border-emerald-200" : "hover:bg-gray-50"}`}>
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-700">
                      {doc.iepType ? doc.iepType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "IEP"}
                      {doc.version ? ` v${doc.version}` : ""}
                    </span>
                    {doc.active && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-medium">Active</span>}
                    {doc.status === "draft" && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-medium">Draft</span>}
                  </div>
                  <span className="text-gray-400 text-[11px]">
                    {doc.iepStartDate ? formatDate(doc.iepStartDate) : ""} - {doc.iepEndDate ? formatDate(doc.iepEndDate) : ""}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!activeDoc && !editing && (
        <Card>
          <CardContent className="p-8 text-center">
            <FileCheck className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No IEP document yet</p>
            <p className="text-xs text-gray-400 mt-1">Create one to track all MA-required IEP sections</p>
          </CardContent>
        </Card>
      )}

      {(activeDoc || editing) && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <h4 className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider">IEP Dates & Status</h4>
              {editing ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">IEP Start Date</label>
                    <input type="date" value={form.iepStartDate || ""} onChange={e => updateField("iepStartDate", e.target.value)}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">IEP End Date</label>
                    <input type="date" value={form.iepEndDate || ""} onChange={e => updateField("iepEndDate", e.target.value)}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Meeting Date</label>
                    <input type="date" value={form.meetingDate || ""} onChange={e => updateField("meetingDate", e.target.value)}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 text-[13px] text-gray-600">
                  <span>Start: {formatDate(activeDoc!.iepStartDate)}</span>
                  <span>End: {formatDate(activeDoc!.iepEndDate)}</span>
                  {activeDoc!.meetingDate && <span>Meeting: {formatDate(activeDoc!.meetingDate)}</span>}
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${activeDoc!.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {activeDoc!.status}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <h4 className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider">Student & Parent Concerns / Team Vision</h4>
              <TextSection label="Student Concerns" fieldKey="studentConcerns" />
              <TextSection label="Parent Concerns" fieldKey="parentConcerns" />
              <TextSection label="Team Vision Statement" fieldKey="teamVision" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <h4 className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider">Present Levels of Academic Achievement & Functional Performance (PLAAFP)</h4>
              {PLAAFP_SECTIONS.map(s => (
                <TextSection key={s.key} label={s.label} fieldKey={s.key} rows={4} />
              ))}
            </CardContent>
          </Card>

          {(showTransition || editing) && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <h4 className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider">
                  Transition Planning (Age 14+)
                  {studentAge !== null && <span className="text-gray-400 font-normal ml-2">Student age: {studentAge}</span>}
                </h4>
                <TextSection label="Transition Assessment" fieldKey="transitionAssessment" />
                <TextSection label="Postsecondary Goals" fieldKey="transitionPostsecGoals" />
                <TextSection label="Transition Services" fieldKey="transitionServices" />
                <TextSection label="Agency Linkages" fieldKey="transitionAgencies" />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4 space-y-4">
              <h4 className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider">Extended School Year (ESY)</h4>
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">ESY Eligible?</label>
                    <select value={form.esyEligible == null ? "" : form.esyEligible ? "yes" : "no"}
                      onChange={e => updateField("esyEligible", e.target.value === "" ? null : e.target.value === "yes")}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                      <option value="">Not determined</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <TextSection label="ESY Services" fieldKey="esyServices" />
                  <TextSection label="ESY Justification" fieldKey="esyJustification" />
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[13px] text-gray-600">
                    Eligible: {activeDoc!.esyEligible == null ? "Not determined" : activeDoc!.esyEligible ? "Yes" : "No"}
                  </p>
                  <TextSection label="ESY Services" fieldKey="esyServices" />
                  <TextSection label="ESY Justification" fieldKey="esyJustification" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <h4 className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider">Assessment Participation</h4>
              <TextSection label="Assessment Participation" fieldKey="assessmentParticipation" />
              <TextSection label="Assessment Accommodations" fieldKey="assessmentAccommodations" />
              <TextSection label="Alternate Assessment Justification" fieldKey="alternateAssessmentJustification" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <h4 className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider">Additional Services</h4>
              <TextSection label="Schedule Modifications" fieldKey="scheduleModifications" />
              <TextSection label="Transportation Services" fieldKey="transportationServices" />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function AccommodationsSection({ studentId, accommodations, onSaved }: {
  studentId: number; accommodations: Accommodation[]; onSaved: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState("instruction");
  const [description, setDescription] = useState("");
  const [setting, setSetting] = useState("");
  const [frequency, setFrequency] = useState("");
  const [provider, setProvider] = useState("");

  async function addAccommodation() {
    if (!description.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`${API}/students/${studentId}/accommodations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category, description: description.trim(),
          setting: setting || null, frequency: frequency || null, provider: provider || null,
        }),
      });
      setDescription(""); setSetting(""); setFrequency(""); setProvider("");
      setShowAdd(false);
      onSaved();
    } catch (e) {
      console.error("Failed to add accommodation:", e);
    }
    setSaving(false);
  }

  async function removeAccommodation(id: number) {
    await apiFetch(`${API}/accommodations/${id}`, { method: "DELETE" });
    onSaved();
  }

  const grouped = accommodations.reduce<Record<string, Accommodation[]>>((acc, a) => {
    (acc[a.category] = acc[a.category] || []).push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-600">Accommodations & Modifications</h3>
        <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500">Category *</label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                  {ACCOMMODATION_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500">Setting</label>
                <input value={setting} onChange={e => setSetting(e.target.value)} placeholder="Gen ed, special ed, all settings"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500">Description *</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
                placeholder="Extended time on tests, preferential seating..."
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500">Frequency</label>
                <input value={frequency} onChange={e => setFrequency(e.target.value)} placeholder="Daily, as needed, during testing"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500">Provider</label>
                <input value={provider} onChange={e => setProvider(e.target.value)} placeholder="Special ed teacher, aide"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="text-[12px] h-8" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8"
                disabled={!description.trim() || saving} onClick={addAccommodation}>
                <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {accommodations.length === 0 && !showAdd && (
        <Card>
          <CardContent className="p-8 text-center">
            <BookOpen className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No accommodations added yet</p>
          </CardContent>
        </Card>
      )}

      {Object.entries(grouped).map(([cat, items]) => {
        const catLabel = ACCOMMODATION_CATEGORIES.find(c => c.value === cat)?.label ?? cat;
        return (
          <Card key={cat}>
            <CardContent className="p-4">
              <h4 className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider mb-3">{catLabel}</h4>
              <div className="space-y-2">
                {items.map(a => (
                  <div key={a.id} className="flex items-start gap-2 group">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-gray-700">{a.description}</p>
                      <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5 flex-wrap">
                        {a.setting && <span>Setting: {a.setting}</span>}
                        {a.frequency && <span>Frequency: {a.frequency}</span>}
                        {a.provider && <span>Provider: {a.provider}</span>}
                      </div>
                    </div>
                    <button onClick={() => removeAccommodation(a.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity p-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

const MEETING_TYPES = [
  { value: "annual", label: "Annual Review" },
  { value: "initial", label: "Initial IEP" },
  { value: "amendment", label: "Amendment" },
  { value: "reeval", label: "Reevaluation" },
  { value: "transition", label: "Transition Planning" },
  { value: "manifestation", label: "Manifestation Determination" },
  { value: "other", label: "Other" },
];

function TeamMeetingsSection({ studentId, meetings, onSaved }: {
  studentId: number; meetings: TeamMeeting[]; onSaved: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [meetingType, setMeetingType] = useState("annual");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  async function addMeeting() {
    if (!scheduledDate) return;
    setSaving(true);
    try {
      await apiFetch(`${API}/students/${studentId}/team-meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meetingType, scheduledDate,
          scheduledTime: scheduledTime || null,
          location: location || null,
          notes: notes || null,
        }),
      });
      setScheduledDate(""); setScheduledTime(""); setLocation(""); setNotes("");
      setShowAdd(false);
      onSaved();
    } catch (e) {
      console.error("Failed to add meeting:", e);
    }
    setSaving(false);
  }

  async function updateStatus(id: number, status: string) {
    await apiFetch(`${API}/team-meetings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onSaved();
  }

  async function deleteMeeting(id: number) {
    await apiFetch(`${API}/team-meetings/${id}`, { method: "DELETE" });
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-600">Team Meetings</h3>
        <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Schedule Meeting
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500">Meeting Type *</label>
                <select value={meetingType} onChange={e => setMeetingType(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                  {MEETING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500">Date *</label>
                <input type="date" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500">Time</label>
                <input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500">Location</label>
              <input value={location} onChange={e => setLocation(e.target.value)} placeholder="Conference room, Zoom link, etc."
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Meeting agenda, items to discuss..."
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="text-[12px] h-8" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8"
                disabled={!scheduledDate || saving} onClick={addMeeting}>
                <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Schedule"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {meetings.length === 0 && !showAdd && (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No team meetings scheduled</p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {meetings.map(m => {
          const typeLabel = MEETING_TYPES.find(t => t.value === m.meetingType)?.label ?? m.meetingType;
          const statusColors: Record<string, string> = {
            scheduled: "bg-blue-50 text-blue-700",
            completed: "bg-emerald-50 text-emerald-700",
            cancelled: "bg-red-50 text-red-700",
            rescheduled: "bg-amber-50 text-amber-700",
          };
          return (
            <Card key={m.id}>
              <CardContent className="p-3.5 md:p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <CalendarDays className="w-5 h-5 text-emerald-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-semibold text-gray-700">{typeLabel}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusColors[m.status] || "bg-gray-50 text-gray-500"}`}>
                        {m.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[12px] text-gray-500 mt-0.5 flex-wrap">
                      <span>{formatDate(m.scheduledDate)}</span>
                      {m.scheduledTime && <span>{m.scheduledTime}</span>}
                      {m.location && <span>{m.location}</span>}
                    </div>
                    {m.notes && <p className="text-[12px] text-gray-400 mt-1">{m.notes}</p>}
                    {m.attendees && m.attendees.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 flex-wrap">
                        <Users className="w-3 h-3 text-gray-400" />
                        <span className="text-[11px] text-gray-400">
                          {m.attendees.map(a => a.name).join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    {m.status === "scheduled" && (
                      <Button size="sm" variant="outline" className="text-[11px] h-7 px-2" onClick={() => updateStatus(m.id, "completed")}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Done
                      </Button>
                    )}
                    <button onClick={() => deleteMeeting(m.id)}
                      className="text-red-400 hover:text-red-600 p-1">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function GoalBankModal({ studentId, existingGoals, onClose, onGoalAdded }: {
  studentId: number;
  existingGoals: IepGoal[];
  onClose: () => void;
  onGoalAdded: () => void;
}) {
  const [goals, setGoals] = useState<GoalBankEntry[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [adding, setAdding] = useState<number | null>(null);

  const loadGoals = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (domainFilter) params.set("domain", domainFilter);
    const res = await fetch(`${API}/goal-bank?${params}`);
    const data = await res.json();
    setGoals(data.goals || []);
    setDomains(data.domains || []);
    setLoading(false);
  }, [search, domainFilter]);

  useEffect(() => { loadGoals(); }, [loadGoals]);

  async function addGoalToStudent(entry: GoalBankEntry) {
    setAdding(entry.id);
    try {
      const goalNumber = existingGoals.filter(g => g.goalArea === entry.goalArea).length + 1;
      await apiFetch(`${API}/students/${studentId}/iep-goals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goalArea: entry.goalArea,
          goalNumber,
          annualGoal: entry.goalText,
          benchmarks: entry.benchmarkText || null,
          serviceArea: entry.domain,
        }),
      });
      onGoalAdded();
    } catch (e) {
      console.error("Failed to add goal:", e);
    }
    setAdding(null);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-10 md:pt-20 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h3 className="text-base font-bold text-gray-800">Goal Bank</h3>
            <p className="text-[11px] text-gray-400">Pre-written IEP goals — click to add to student</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-3 border-b border-gray-100 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search goals..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
          </div>
          <select value={domainFilter} onChange={e => setDomainFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
            <option value="">All Domains</option>
            {domains.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && <div className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-700 mx-auto" /></div>}
          {!loading && goals.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">No matching goals found</p>
          )}
          {goals.map(g => (
            <div key={g.id} className="border border-gray-200 rounded-lg p-3 hover:border-emerald-200 transition-colors">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">{g.domain}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{g.goalArea}</span>
                    {g.gradeRange && <span className="text-[10px] text-gray-400">Grades {g.gradeRange}</span>}
                  </div>
                  <p className="text-[12px] text-gray-700 leading-relaxed">{g.goalText}</p>
                  {g.benchmarkText && (
                    <details className="mt-1">
                      <summary className="text-[11px] text-emerald-700 cursor-pointer hover:text-emerald-900">View benchmarks</summary>
                      <p className="text-[11px] text-gray-500 mt-1 whitespace-pre-line pl-2 border-l-2 border-emerald-100">{g.benchmarkText}</p>
                    </details>
                  )}
                </div>
                <Button size="sm" variant="outline" className="text-[11px] h-7 px-2 flex-shrink-0"
                  disabled={adding === g.id} onClick={() => addGoalToStudent(g)}>
                  {adding === g.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3 mr-0.5" />}
                  Add
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IepCompletenessIndicator({ studentId, docId }: { studentId: number; docId: number }) {
  const [data, setData] = useState<CompletenessData | null>(null);

  useEffect(() => {
    fetch(`${API}/students/${studentId}/iep-documents/${docId}/completeness`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {});
  }, [studentId, docId]);

  if (!data) return null;

  const barColor = data.percentage === 100 ? "bg-emerald-500" : data.percentage >= 70 ? "bg-amber-500" : "bg-red-500";
  const textColor = data.percentage === 100 ? "text-emerald-700" : data.percentage >= 70 ? "text-amber-700" : "text-red-700";

  return (
    <Card className={data.isComplete ? "border-emerald-200" : "border-amber-200"}>
      <CardContent className="p-3.5">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${data.isComplete ? "bg-emerald-50" : "bg-amber-50"}`}>
            {data.isComplete ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-amber-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-gray-700">
                {data.isComplete ? "IEP Document Complete" : "IEP Document Incomplete"}
              </p>
              <p className={`text-[13px] font-bold ${textColor}`}>{data.percentage}%</p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5">
              <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${data.percentage}%` }} />
            </div>
            {data.missingSections.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-1.5">
                Missing: {data.missingSections.map(m => m.label).join(", ")}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ParentContactsSection({ studentId }: { studentId: number }) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    contactType: "progress_update", contactDate: new Date().toISOString().split("T")[0],
    contactMethod: "phone", subject: "", notes: "", outcome: "",
    followUpNeeded: "", followUpDate: "", parentName: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API}/students/${studentId}/parent-contacts`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setContacts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [studentId]);

  async function addContact() {
    if (!form.subject.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch(`${API}/students/${studentId}/parent-contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setContacts(prev => [res, ...prev]);
      setShowAdd(false);
      setForm({ contactType: "progress_update", contactDate: new Date().toISOString().split("T")[0],
        contactMethod: "phone", subject: "", notes: "", outcome: "",
        followUpNeeded: "", followUpDate: "", parentName: "" });
    } catch (e) { console.error("Failed to add contact:", e); }
    setSaving(false);
  }

  const CONTACT_TYPES: Record<string, string> = {
    progress_update: "Progress Update", concern: "Concern", meeting_notice: "Meeting Notice",
    consent_request: "Consent Request", iep_review: "IEP Review", general: "General",
    behavioral_update: "Behavioral Update", schedule_change: "Schedule Change",
  };
  const METHOD_ICONS: Record<string, any> = {
    phone: Phone, email: Mail, in_person: Users, letter: MessageSquare, portal: FileText,
  };

  if (loading) return <Skeleton className="w-full h-40" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-600">Parent Communication Log</h3>
        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8"
          onClick={() => setShowAdd(!showAdd)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Log Contact
        </Button>
      </div>

      {showAdd && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500">Contact Type</label>
                <select value={form.contactType} onChange={e => setForm(p => ({ ...p, contactType: e.target.value }))}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                  {Object.entries(CONTACT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500">Method</label>
                <select value={form.contactMethod} onChange={e => setForm(p => ({ ...p, contactMethod: e.target.value }))}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                  <option value="phone">Phone Call</option>
                  <option value="email">Email</option>
                  <option value="in_person">In Person</option>
                  <option value="letter">Letter</option>
                  <option value="portal">Parent Portal</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500">Date</label>
                <input type="date" value={form.contactDate} onChange={e => setForm(p => ({ ...p, contactDate: e.target.value }))}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500">Parent/Guardian Name</label>
                <input type="text" value={form.parentName} onChange={e => setForm(p => ({ ...p, parentName: e.target.value }))}
                  placeholder="e.g. Maria Alvarez"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500">Subject *</label>
                <input type="text" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))}
                  placeholder="Brief description of the contact"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-gray-500">Notes</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={3}
                placeholder="Details of the conversation or communication..."
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-gray-500">Outcome</label>
                <input type="text" value={form.outcome} onChange={e => setForm(p => ({ ...p, outcome: e.target.value }))}
                  placeholder="Result of the contact"
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-gray-500">Follow-up Date</label>
                <input type="date" value={form.followUpDate} onChange={e => setForm(p => ({ ...p, followUpDate: e.target.value }))}
                  className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8" onClick={addContact} disabled={saving || !form.subject.trim()}>
                <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save Contact"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {contacts.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Phone className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No parent contacts logged yet</p>
            <p className="text-xs text-gray-400 mt-1">Document phone calls, emails, meetings, and notices</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {contacts.map(c => {
            const MethodIcon = METHOD_ICONS[c.contactMethod] || Phone;
            return (
              <Card key={c.id}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      c.contactType === "concern" ? "bg-red-50" :
                      c.contactType === "consent_request" ? "bg-amber-50" : "bg-emerald-50"
                    }`}>
                      <MethodIcon className={`w-4 h-4 ${
                        c.contactType === "concern" ? "text-red-500" :
                        c.contactType === "consent_request" ? "text-amber-500" : "text-emerald-600"
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-medium text-gray-700">{c.subject}</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-100 text-gray-600">
                          {CONTACT_TYPES[c.contactType] || c.contactType}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                        <span>{formatDate(c.contactDate)}</span>
                        {c.parentName && <span>with {c.parentName}</span>}
                        <span className="capitalize">{(c.contactMethod || "").replace(/_/g, " ")}</span>
                      </div>
                      {c.notes && <p className="text-[12px] text-gray-500 mt-1.5 line-clamp-2">{c.notes}</p>}
                      {c.outcome && (
                        <p className="text-[11px] text-emerald-600 mt-1">Outcome: {c.outcome}</p>
                      )}
                      {c.followUpDate && (
                        <p className="text-[11px] text-amber-600 mt-0.5">Follow-up: {formatDate(c.followUpDate)}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
