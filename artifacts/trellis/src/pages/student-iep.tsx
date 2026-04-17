import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Plus, FileText, Target, TrendingUp, Clock, AlertTriangle, CheckCircle2,
  Minus as MinusIcon, ChevronRight, Sparkles, Download, BookOpen, FileCheck, Loader2,
  CalendarDays, Users, Phone, Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";
import {
  getStudent, listIepGoals, listProgressReports, listProgramTargets,
  listBehaviorTargets, listIepDocuments, listAccommodations, listTeamMeetings,
  autoCreateIepGoals,
} from "@workspace/api-client-react";

import { IepDocumentSection, type Student, type IepDocument } from "./student-iep/IepDocumentSection";
import { IepCompletenessIndicator } from "./student-iep/IepCompletenessIndicator";
import { GoalCard, AddGoalModal, type IepGoal, type ProgramTarget, type BehaviorTarget } from "./student-iep/IepGoalForm";
import { GoalBankModal } from "./student-iep/IepGoalBank";
import { GenerateReportModal, ReportDetailModal, type ProgressReport, type GoalProgressEntry } from "./student-iep/IepReportModals";
import { AccommodationsSection, type Accommodation } from "./student-iep/IepAccommodations";
import { TeamMeetingsSection, type TeamMeeting } from "./student-iep/IepMeetings";
import { ParentContactsSection } from "./student-iep/IepParentContacts";
import { GeneratedDocsPanel } from "./student-iep/IepGeneratedDocs";

const PROGRESS_RATINGS: Record<string, { label: string; color: string; icon: any; bg: string }> = {
  mastered: { label: "Mastered", color: "text-emerald-700", icon: CheckCircle2, bg: "bg-emerald-50" },
  sufficient_progress: { label: "Sufficient Progress", color: "text-emerald-700", icon: TrendingUp, bg: "bg-emerald-50" },
  some_progress: { label: "Some Progress", color: "text-amber-700", icon: Clock, bg: "bg-amber-50" },
  insufficient_progress: { label: "Insufficient Progress", color: "text-red-700", icon: AlertTriangle, bg: "bg-red-50" },
  not_addressed: { label: "Not Addressed", color: "text-gray-500", icon: MinusIcon, bg: "bg-gray-50" },
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

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
  const [tab, setTab] = useState<"document" | "goals" | "accommodations" | "reports" | "meetings" | "contacts" | "gendocs">("document");
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [showGoalBank, setShowGoalBank] = useState(false);
  const [showGenerateReport, setShowGenerateReport] = useState(false);
  const [viewingReport, setViewingReport] = useState<ProgressReport | null>(null);
  const [autoCreating, setAutoCreating] = useState(false);
  const [exportingRecord, setExportingRecord] = useState(false);

  async function exportFullRecord() {
    setExportingRecord(true);
    try {
      const res = await authFetch(`/api/reports/exports/student/${studentId}/full-record.pdf`);
      if (!res.ok) { toast.error(`Export failed: ${res.statusText}`); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const name = student ? `${student.firstName}_${student.lastName}_Full_Record.pdf` : `Student_${studentId}_Full_Record.pdf`;
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      toast.success("Full record PDF downloaded");
    } catch (e: any) {
      toast.error(`Export failed: ${e.message}`);
    } finally {
      setExportingRecord(false);
    }
  }

  const loadData = useCallback(async () => {
    try {
      const [s, g, r, pt, bt, docs, accs, mtgs] = await Promise.all([
        getStudent(studentId).catch(() => null),
        listIepGoals(studentId),
        listProgressReports(studentId),
        listProgramTargets(studentId),
        listBehaviorTargets(studentId),
        listIepDocuments(studentId),
        listAccommodations(studentId),
        listTeamMeetings(studentId),
      ]);
      setStudent(s as Student | null);
      setGoals(Array.isArray(g) ? g as any : []);
      setReports(Array.isArray(r) ? r as any : []);
      setProgramTargets(Array.isArray(pt) ? pt as any : []);
      setBehaviorTargets(Array.isArray(bt) ? bt as any : []);
      setIepDocs(Array.isArray(docs) ? docs as any : []);
      setAccommodations(Array.isArray(accs) ? accs as any : []);
      setTeamMeetings(Array.isArray(mtgs) ? mtgs as any : []);
    } catch (e) {
      console.error("Failed to load IEP data:", e);
    }
    setLoading(false);
  }, [studentId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function autoCreateGoals() {
    setAutoCreating(true);
    await autoCreateIepGoals(studentId, { startDate: new Date().toISOString().split("T")[0] });
    await loadData();
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
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-[12px]"
                onClick={exportFullRecord}
                disabled={exportingRecord}
              >
                {exportingRecord ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                {exportingRecord ? "Exporting…" : "Export Full Record"}
              </Button>
              <Link href={`/students/${studentId}/iep-builder`}>
                <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white flex items-center gap-1.5">
                  <Wand2 className="w-4 h-4" /> Annual Review Draft Builder
                </Button>
              </Link>
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
          { key: "gendocs" as const, label: "Generated Docs", icon: Download },
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
        <TeamMeetingsSection
          studentId={studentId} meetings={teamMeetings} onSaved={loadData}
          student={student} goals={goals} accommodations={accommodations} iepDocs={iepDocs}
        />
      )}

      {tab === "contacts" && (
        <ParentContactsSection studentId={studentId} />
      )}

      {tab === "gendocs" && (
        <GeneratedDocsPanel studentId={studentId} />
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
                <p className="text-sm font-medium text-gray-600">No IEP Goals Defined</p>
                {programTargets.length > 0 || behaviorTargets.length > 0 ? (
                  <div className="text-xs text-gray-500 mt-2 max-w-lg mx-auto space-y-2 text-left">
                    <p>This student has <strong>{programTargets.length} program target{programTargets.length !== 1 ? "s" : ""}</strong> and <strong>{behaviorTargets.length} behavior target{behaviorTargets.length !== 1 ? "s" : ""}</strong> from data tracking.</p>
                    <p className="font-medium text-gray-600">You can:</p>
                    <p>1. Click <strong>"Auto-Create from Data Targets"</strong> to generate measurable IEP goals from existing targets — Trellis maps each target to a goal with baselines, benchmarks, and measurement criteria.</p>
                    <p>2. Click <strong>"Add Goal"</strong> to write a custom goal manually.</p>
                    <p>3. Use the <strong>Goal Bank</strong> for Massachusetts-aligned goal templates by service area.</p>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 mt-2 max-w-lg mx-auto space-y-2 text-left">
                    <p>IEP goals define what this student should achieve — measurable objectives tied to their disability-related needs. Massachusetts requires annual IEP goals with clear baselines, benchmarks, and progress measurement criteria.</p>
                    <p className="font-medium text-gray-600">To add goals:</p>
                    <p>1. Click <strong>"Add Goal"</strong> to create a goal manually with area, description, baseline, and target.</p>
                    <p>2. Use the <strong>Goal Bank</strong> for research-based goal templates organized by service area (Speech, OT, Behavior, Academic, etc.).</p>
                    <p>3. Or go to the <strong>Data</strong> tab first to set up program and behavior targets — then auto-create goals from those targets.</p>
                  </div>
                )}
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
                <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-600">Progress Reports Require IEP Goals</p>
                <div className="text-xs text-gray-500 mt-2 max-w-md mx-auto space-y-1.5 text-left">
                  <p>Massachusetts requires progress reports on each IEP goal at intervals specified in the IEP (typically quarterly, aligned with report card periods).</p>
                  <p>Switch to the <strong>Goals</strong> tab to create IEP goals first — then you can generate progress reports that pull data directly from your session logs and data tracking.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {reports.length === 0 && goals.length > 0 && (
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-600">No Progress Reports Generated Yet</p>
                <div className="text-xs text-gray-500 mt-2 max-w-md mx-auto space-y-1.5 text-left">
                  <p>This student has <strong>{goals.length} IEP goal{goals.length !== 1 ? "s" : ""}</strong> ready for reporting. Click <strong>"Generate Report"</strong> to create a progress report that auto-populates from session logs and data collection.</p>
                  <p>Each report captures the student's current performance level, rate of progress, and whether they're on track to meet annual goals — formatted for parent distribution and compliance documentation.</p>
                </div>
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
