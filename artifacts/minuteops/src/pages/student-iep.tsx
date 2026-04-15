import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  ArrowLeft, Plus, FileText, Target, TrendingUp, TrendingDown, Minus as MinusIcon,
  Save, X, ChevronRight, ChevronDown, AlertTriangle, CheckCircle2, Clock, Sparkles,
  Download, Edit2, BookOpen, BarChart3, Loader2, FileCheck, Search,
  CalendarDays, Users, Copy, History, Phone, Mail, MessageSquare, Wand2,
  Circle, Printer, UserPlus, ClipboardList as ClipboardListIcon, Video, MapPin
} from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getStudent, listIepGoals, listProgressReports, listProgramTargets,
  listBehaviorTargets, listIepDocuments, listAccommodations, listTeamMeetings,
  autoCreateIepGoals, createIepGoal, generateProgressReport, updateProgressReport,
  amendIepDocument, updateIepDocument, createIepDocument,
  createAccommodation, deleteAccommodation, updateTeamMeeting, createTeamMeeting,
  deleteTeamMeeting, listGoalBank, listParentContacts, createParentContact,
  getStudentIepDocumentCompleteness,
} from "@workspace/api-client-react";



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
  benchmarks?: string | null; measurementMethod?: string | null; serviceArea?: string | null;
}
interface ServiceDeliveryBreakdown {
  serviceType: string; requiredMinutes: number; deliveredMinutes: number;
  missedSessions: number; completedSessions: number; compliancePercent: number;
}
interface ProgressReport {
  id: number; studentId: number; reportingPeriod: string; periodStart: string;
  periodEnd: string; status: string; overallSummary: string | null;
  serviceDeliverySummary: string | null; recommendations: string | null;
  parentNotes: string | null; goalProgress: GoalProgressEntry[];
  preparedByName?: string | null; createdAt: string;
  studentDob?: string | null; studentGrade?: string | null;
  schoolName?: string | null; districtName?: string | null;
  iepStartDate?: string | null; iepEndDate?: string | null;
  serviceBreakdown?: ServiceDeliveryBreakdown[];
  parentNotificationDate?: string | null; nextReportDate?: string | null;
}
interface IepDocument {
  id: number; studentId: number; iepStartDate: string; iepEndDate: string;
  meetingDate: string | null; status: string; iepType?: string | null; version?: string | null;
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
interface ActionItem { id: string; description: string; assignee: string; dueDate: string | null; status: "open" | "completed" }
interface TeamMeeting {
  id: number; studentId: number; meetingType: string; scheduledDate: string;
  scheduledTime: string | null; duration: number | null; location: string | null;
  meetingFormat: string | null; status: string;
  agendaItems: string[] | null;
  attendees: { name: string; role: string; present?: boolean }[] | null;
  notes: string | null;
  actionItems: ActionItem[] | null;
  outcome: string | null; followUpDate: string | null; minutesFinalized: boolean | null;
  consentStatus: string | null; noticeSentDate: string | null;
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
  sufficient_progress: { label: "Sufficient Progress", color: "text-emerald-700", icon: TrendingUp, bg: "bg-emerald-50" },
  some_progress: { label: "Some Progress", color: "text-amber-700", icon: Clock, bg: "bg-amber-50" },
  insufficient_progress: { label: "Insufficient Progress", color: "text-red-700", icon: AlertTriangle, bg: "bg-red-50" },
  not_addressed: { label: "Not Addressed", color: "text-gray-500", icon: MinusIcon, bg: "bg-gray-50" },
};

const MA_PROGRESS_CODES: Record<string, { label: string; fullLabel: string; color: string; bg: string }> = {
  M: { label: "M", fullLabel: "Mastered", color: "text-emerald-700", bg: "bg-emerald-50" },
  SP: { label: "SP", fullLabel: "Sufficient Progress", color: "text-emerald-700", bg: "bg-emerald-50" },
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

const MEETING_TYPES = [
  { value: "annual", label: "Annual IEP Review" },
  { value: "initial", label: "Initial Eligibility" },
  { value: "reevaluation", label: "Reevaluation" },
  { value: "amendment", label: "IEP Amendment" },
  { value: "transition", label: "Transition Planning" },
  { value: "manifestation", label: "Manifestation Determination" },
  { value: "eligibility", label: "Eligibility Meeting" },
  { value: "other", label: "Other Meeting" },
];

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  scheduled: { bg: "bg-gray-100", color: "text-gray-700", label: "Scheduled" },
  completed: { bg: "bg-emerald-100", color: "text-emerald-700", label: "Completed" },
  cancelled: { bg: "bg-gray-100", color: "text-gray-400", label: "Cancelled" },
};

const MEETING_FORMATS = [
  { value: "in-person", label: "In Person", icon: MapPin },
  { value: "virtual", label: "Virtual", icon: Video },
  { value: "hybrid", label: "Hybrid", icon: Users },
];

const SUGGESTED_ATTENDEE_ROLES = [
  "Parent / Guardian", "Student", "Special Education Teacher",
  "General Education Teacher", "School Psychologist",
  "Speech-Language Pathologist", "Occupational Therapist",
  "Physical Therapist", "ABA Therapist / BCBA",
  "School Administrator / LEA Rep", "Social Worker",
  "Paraprofessional", "Interpreter", "Outside Agency Rep",
];

const ACCOMMODATION_CATEGORIES = [
  { value: "instruction", label: "Instruction" },
  { value: "assessment", label: "Assessment" },
  { value: "environment", label: "Environment" },
  { value: "materials", label: "Materials" },
  { value: "behavioral", label: "Behavioral" },
  { value: "communication", label: "Communication" },
  { value: "other", label: "Other" },
];

const ACCOMMODATION_TEMPLATES: Array<{ category: string; description: string; setting?: string; frequency?: string }> = [
  { category: "instruction", description: "Extended time (1.5×) for assignments and tests", setting: "All settings", frequency: "As needed" },
  { category: "instruction", description: "Directions repeated or re-read as needed", setting: "All settings", frequency: "As needed" },
  { category: "instruction", description: "Preferential seating near the teacher or board", setting: "Classroom", frequency: "Daily" },
  { category: "instruction", description: "Chunked assignments into smaller steps", setting: "All settings", frequency: "Daily" },
  { category: "instruction", description: "Check-ins for comprehension during instruction", setting: "Classroom", frequency: "Daily" },
  { category: "instruction", description: "Use of visual supports and graphic organizers", setting: "Classroom", frequency: "Daily" },
  { category: "instruction", description: "Verbal rather than written responses allowed", setting: "All settings", frequency: "As needed" },
  { category: "instruction", description: "Reduced assignment length (same learning objectives)", setting: "Classroom", frequency: "Daily" },
  { category: "assessment", description: "Extended time (1.5×) on all assessments", setting: "Testing", frequency: "All assessments" },
  { category: "assessment", description: "Extended time (2×) on all assessments", setting: "Testing", frequency: "All assessments" },
  { category: "assessment", description: "Separate, distraction-reduced testing environment", setting: "Testing", frequency: "All assessments" },
  { category: "assessment", description: "Test questions read aloud by adult or text-to-speech", setting: "Testing", frequency: "All assessments" },
  { category: "assessment", description: "Scribe — adult records student's oral responses", setting: "Testing", frequency: "All assessments" },
  { category: "assessment", description: "Calculator permitted for computation sections", setting: "Testing", frequency: "As specified" },
  { category: "assessment", description: "Breaks during assessments as needed", setting: "Testing", frequency: "All assessments" },
  { category: "assessment", description: "MCAS: approved accessibility and accommodation features per DESE guidelines", setting: "MCAS only", frequency: "MCAS testing" },
  { category: "environment", description: "Access to quiet work area to reduce distractions", setting: "School building", frequency: "As needed" },
  { category: "environment", description: "Flexible seating (wobble chair, standing desk)", setting: "Classroom", frequency: "Daily" },
  { category: "environment", description: "Movement breaks scheduled throughout the day", setting: "All settings", frequency: "Daily" },
  { category: "environment", description: "Noise-canceling headphones available for use", setting: "All settings", frequency: "As needed" },
  { category: "materials", description: "Printed copy of notes or teacher slides provided in advance", setting: "Classroom", frequency: "Daily" },
  { category: "materials", description: "Text-to-speech software (e.g., Read&Write, Kurzweil)", setting: "All settings", frequency: "As needed" },
  { category: "materials", description: "Word processing with spell-check for written work", setting: "All settings", frequency: "As needed" },
  { category: "materials", description: "Graphic organizers and visual aids provided", setting: "Classroom", frequency: "Daily" },
  { category: "materials", description: "Highlighted or color-coded reading materials", setting: "Classroom", frequency: "As needed" },
  { category: "behavioral", description: "Behavior intervention plan (BIP) in effect — see attached", setting: "All settings", frequency: "Daily" },
  { category: "behavioral", description: "Positive reinforcement system aligned with BIP goals", setting: "All settings", frequency: "Daily" },
  { category: "behavioral", description: "Check-in/check-out (CICO) daily self-monitoring", setting: "All settings", frequency: "Daily" },
  { category: "behavioral", description: "Designated quiet space for emotional regulation breaks", setting: "School building", frequency: "As needed" },
  { category: "behavioral", description: "Advance notice of transitions and schedule changes", setting: "All settings", frequency: "As needed" },
  { category: "communication", description: "Augmentative and Alternative Communication (AAC) device access", setting: "All settings", frequency: "Daily" },
  { category: "communication", description: "Speech-language supports embedded into instruction", setting: "Classroom", frequency: "Daily" },
  { category: "communication", description: "Visual schedule provided and reviewed at start of day", setting: "All settings", frequency: "Daily" },
  { category: "communication", description: "Use of picture symbols or communication boards", setting: "All settings", frequency: "As needed" },
];

function genId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
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
  const [tab, setTab] = useState<"document" | "goals" | "accommodations" | "reports" | "meetings" | "contacts">("document");
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
                  <Wand2 className="w-4 h-4" /> Annual Review Assistant
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
      await createIepGoal(studentId, {
          goalArea, goalNumber, annualGoal: annualGoal.trim(),
          baseline: baseline || null, targetCriterion: targetCriterion || null,
          measurementMethod: measurementMethod || null, serviceArea: serviceArea || null,
          benchmarks: benchmarks || null,
          programTargetId: linkedType === "program" ? linkedId : null,
          behaviorTargetId: linkedType === "behavior" ? linkedId : null,
        });
      toast.success("IEP goal added"); onSaved();
    } catch { toast.error("Failed to save goal"); }
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
    const report = await generateProgressReport(studentId, { periodStart, periodEnd, reportingPeriod });
    onGenerated(report as unknown as ProgressReport);
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
  const serviceBreakdown = (report.serviceBreakdown ?? []) as ServiceDeliveryBreakdown[];

  async function saveChanges() {
    setSaving(true);
    const updatedGoals = [...goalProgress];
    if (editingNarrative !== null) {
      const idx = updatedGoals.findIndex(g => g.iepGoalId === editingNarrative);
      if (idx >= 0) updatedGoals[idx] = { ...updatedGoals[idx], narrative: narrativeText };
    }

    await updateProgressReport(report.id, {
        overallSummary: summaryText,
        recommendations: recommendationsText,
        parentNotes: parentNotesText || null,
        goalProgress: updatedGoals,
      });
    onUpdated({
      overallSummary: summaryText,
      recommendations: recommendationsText,
      parentNotes: parentNotesText || null,
      goalProgress: updatedGoals,
    });
    setEditingNarrative(null);
    setEditingSummary(false);
    setSaving(false);
  }

  async function finalizeReport() {
    setSaving(true);
    await updateProgressReport(report.id, { status: "final" });
    onUpdated({ status: "final" });
    setSaving(false);
  }

  function printReport() {
    const printWin = window.open("", "_blank");
    if (!printWin) return;
    const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const goalRows = goalProgress.map(gp => `
      <tr>
        <td style="padding:6px 8px;border:1px solid #d1d5db;font-size:12px">${esc(String(gp.goalNumber))}</td>
        <td style="padding:6px 8px;border:1px solid #d1d5db;font-size:12px">${esc(gp.goalArea)}${gp.serviceArea ? ` (${esc(gp.serviceArea)})` : ""}</td>
        <td style="padding:6px 8px;border:1px solid #d1d5db;font-size:12px">${esc(gp.annualGoal)}</td>
        <td style="padding:6px 8px;border:1px solid #d1d5db;font-size:12px">${esc(gp.baseline) || "N/A"}</td>
        <td style="padding:6px 8px;border:1px solid #d1d5db;font-size:12px;text-align:center;font-weight:bold">${esc(gp.progressCode)}</td>
        <td style="padding:6px 8px;border:1px solid #d1d5db;font-size:12px">${esc(gp.currentPerformance)}</td>
        <td style="padding:6px 8px;border:1px solid #d1d5db;font-size:12px">${esc(gp.narrative)}</td>
      </tr>
    `).join("");
    const svcRows = serviceBreakdown.map(s => `
      <tr>
        <td style="padding:4px 8px;border:1px solid #d1d5db;font-size:12px">${esc(s.serviceType)}</td>
        <td style="padding:4px 8px;border:1px solid #d1d5db;font-size:12px;text-align:center">${s.requiredMinutes}</td>
        <td style="padding:4px 8px;border:1px solid #d1d5db;font-size:12px;text-align:center">${s.deliveredMinutes}</td>
        <td style="padding:4px 8px;border:1px solid #d1d5db;font-size:12px;text-align:center">${s.completedSessions}</td>
        <td style="padding:4px 8px;border:1px solid #d1d5db;font-size:12px;text-align:center">${s.missedSessions}</td>
        <td style="padding:4px 8px;border:1px solid #d1d5db;font-size:12px;text-align:center;font-weight:bold">${s.compliancePercent}%</td>
      </tr>
    `).join("");
    printWin.document.write(`<!DOCTYPE html><html><head><title>IEP Progress Report - ${esc(studentName)}</title>
      <style>body{font-family:Arial,sans-serif;margin:40px;color:#111}h1{font-size:18px;margin:0}h2{font-size:14px;margin:20px 0 8px;border-bottom:2px solid #059669;padding-bottom:4px}
      table{width:100%;border-collapse:collapse;margin:8px 0}th{background:#f3f4f6;padding:6px 8px;border:1px solid #d1d5db;font-size:11px;text-align:left}
      .header{text-align:center;border-bottom:3px solid #059669;padding-bottom:12px;margin-bottom:16px}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:13px;margin:12px 0}
      .code-key{display:grid;grid-template-columns:repeat(3,1fr);gap:2px;font-size:11px;margin:8px 0;padding:8px;background:#f9fafb;border-radius:4px}
      .footer{margin-top:30px;padding-top:16px;border-top:2px solid #e5e7eb;font-size:11px;color:#6b7280}
      .sig-line{margin-top:40px;display:flex;gap:40px}.sig-line div{flex:1;border-top:1px solid #9ca3af;padding-top:4px;font-size:11px}
      @media print{body{margin:20px}}</style></head><body>
      <div class="header">
        <h1>MASSACHUSETTS IEP PROGRESS REPORT</h1>
        <p style="font-size:12px;color:#6b7280;margin:4px 0">Pursuant to 603 CMR 28.07(8)</p>
      </div>
      <div class="meta">
        <div><strong>Student:</strong> ${esc(studentName)}</div>
        <div><strong>DOB:</strong> ${report.studentDob ? esc(formatDate(report.studentDob)) : "N/A"}</div>
        <div><strong>Grade:</strong> ${esc(report.studentGrade) || "N/A"}</div>
        <div><strong>School:</strong> ${esc(report.schoolName) || "N/A"}</div>
        <div><strong>District:</strong> ${esc(report.districtName) || "N/A"}</div>
        <div><strong>Reporting Period:</strong> ${esc(formatDate(report.periodStart))} — ${esc(formatDate(report.periodEnd))}</div>
        ${report.iepStartDate ? `<div><strong>IEP Dates:</strong> ${esc(formatDate(report.iepStartDate))} — ${esc(formatDate(report.iepEndDate || ""))}</div>` : ""}
        <div><strong>Report Status:</strong> ${report.status === "final" ? "FINAL" : "DRAFT"}</div>
      </div>
      <h2>Progress Code Key</h2>
      <div class="code-key">
        <div><strong>M</strong> = Mastered</div><div><strong>SP</strong> = Sufficient Progress</div><div><strong>IP</strong> = Insufficient Progress</div>
        <div><strong>NP</strong> = No Progress</div><div><strong>R</strong> = Regression</div><div><strong>NA</strong> = Not Addressed</div>
      </div>
      <h2>Goal-by-Goal Progress</h2>
      <table><thead><tr><th>#</th><th>Area</th><th>Annual Goal</th><th>Baseline</th><th>Code</th><th>Current Performance</th><th>Narrative</th></tr></thead>
      <tbody>${goalRows}</tbody></table>
      ${serviceBreakdown.length > 0 ? `<h2>Service Delivery Summary</h2>
      <table><thead><tr><th>Service</th><th>Required Min</th><th>Delivered Min</th><th>Sessions</th><th>Missed</th><th>Compliance</th></tr></thead>
      <tbody>${svcRows}</tbody></table>` : ""}
      <h2>Recommendations</h2>
      <p style="font-size:13px">${esc(report.recommendations) || "None"}</p>
      ${report.parentNotes ? `<h2>Parent/Guardian Notes</h2><p style="font-size:13px">${esc(report.parentNotes)}</p>` : ""}
      <div class="footer">
        <p><strong>Parent/Guardian Notification:</strong> This progress report is provided pursuant to 603 CMR 28.07(8), which requires that parents/guardians
        be informed of their child's progress toward IEP goals at least as often as parents of non-disabled children are informed of their child's progress.
        Parents/guardians have the right to request an IEP Team meeting at any time to discuss their child's progress.</p>
        ${report.nextReportDate ? `<p><strong>Next Report Due:</strong> ${esc(formatDate(report.nextReportDate))}</p>` : ""}
        ${report.preparedByName ? `<p><strong>Prepared By:</strong> ${esc(report.preparedByName)}</p>` : ""}
      </div>
      <div class="sig-line">
        <div>Educator Signature / Date</div>
        <div>Parent/Guardian Signature / Date</div>
      </div>
      </body></html>`);
    printWin.document.close();
    setTimeout(() => printWin.print(), 500);
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
            <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={printReport}>
              <Download className="w-3.5 h-3.5 mr-1" /> Print / PDF
            </Button>
            {report.status === "draft" && (
              <Button size="sm" variant="outline" className="text-[12px] h-8 text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={finalizeReport} disabled={saving}>
                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Finalize
              </Button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-4 md:p-5 space-y-5">
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
            <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider mb-2">603 CMR 28.07(8) — IEP Progress Report</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-[12px] text-gray-700">
              <div><span className="text-gray-400">Student:</span> {studentName}</div>
              <div><span className="text-gray-400">DOB:</span> {report.studentDob ? formatDate(report.studentDob) : "N/A"}</div>
              <div><span className="text-gray-400">Grade:</span> {report.studentGrade || "N/A"}</div>
              <div><span className="text-gray-400">School:</span> {report.schoolName || "N/A"}</div>
              <div><span className="text-gray-400">District:</span> {report.districtName || "N/A"}</div>
              <div><span className="text-gray-400">Period:</span> {formatDate(report.periodStart)} — {formatDate(report.periodEnd)}</div>
              {report.iepStartDate && <div><span className="text-gray-400">IEP:</span> {formatDate(report.iepStartDate)} — {formatDate(report.iepEndDate || "")}</div>}
              {report.nextReportDate && <div><span className="text-gray-400">Next Report:</span> {formatDate(report.nextReportDate)}</div>}
            </div>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
            {Object.entries(MA_PROGRESS_CODES).map(([code, cfg]) => {
              const cnt = goalProgress.filter(g => g.progressCode === code).length;
              return (
                <div key={code} className={`${cfg.bg} rounded-lg p-2 text-center`}>
                  <p className={`text-lg font-bold ${cfg.color}`}>{cnt}</p>
                  <p className={`text-[9px] font-medium ${cfg.color}`}>{code} — {cfg.fullLabel}</p>
                </div>
              );
            })}
          </div>

          {serviceBreakdown.length > 0 && (
            <div>
              <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Service Delivery Compliance</h3>
              <div className="space-y-1.5">
                {serviceBreakdown.map((s, i) => (
                  <div key={i} className="bg-gray-50 rounded-lg p-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-gray-700">{s.serviceType}</p>
                      <p className="text-[11px] text-gray-400">{s.completedSessions} sessions · {s.deliveredMinutes} of {s.requiredMinutes} min</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.missedSessions > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">{s.missedSessions} missed</span>}
                      <span className={`text-[12px] font-bold ${s.compliancePercent >= 90 ? "text-emerald-700" : s.compliancePercent >= 75 ? "text-amber-600" : "text-red-600"}`}>
                        {s.compliancePercent}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                <textarea value={summaryText} onChange={e => setSummaryText(e.target.value)} rows={6}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none font-mono" />
                <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" onClick={saveChanges} disabled={saving}>
                  <Save className="w-3.5 h-3.5 mr-1" /> Save
                </Button>
              </div>
            ) : (
              <p className="text-[12px] text-gray-600 whitespace-pre-line bg-gray-50 rounded-lg p-3">{report.overallSummary}</p>
            )}
          </div>

          <div>
            <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Goal-by-Goal Progress</h3>
            <div className="space-y-3">
              {goalProgress.map((gp) => {
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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">{gp.goalArea}</span>
                            {gp.serviceArea && gp.serviceArea !== gp.goalArea && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600">{gp.serviceArea}</span>
                            )}
                          </div>
                          <p className="text-[13px] font-medium text-gray-700 mt-0.5">{gp.annualGoal}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                        <div className={`${MA_PROGRESS_CODES[gp.progressCode]?.bg || rating.bg} rounded-lg p-2 text-center`}>
                          <p className={`text-lg font-bold ${MA_PROGRESS_CODES[gp.progressCode]?.color || rating.color}`}>{gp.progressCode}</p>
                          <p className={`text-[9px] font-medium mt-0.5 ${MA_PROGRESS_CODES[gp.progressCode]?.color || rating.color}`}>
                            {MA_PROGRESS_CODES[gp.progressCode]?.fullLabel || rating.label}
                          </p>
                        </div>
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

                      {(gp.baseline || gp.targetCriterion || gp.promptLevel || gp.measurementMethod) && (
                        <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400 flex-wrap">
                          {gp.baseline && <span>Baseline: {gp.baseline}</span>}
                          {gp.targetCriterion && <span>Target: {gp.targetCriterion}</span>}
                          {gp.promptLevel && <span>Prompt: {gp.promptLevel}</span>}
                          {gp.measurementMethod && <span>Method: {gp.measurementMethod}</span>}
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

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
            <p className="text-[11px] text-gray-500 leading-relaxed">
              <strong>Parent/Guardian Notification (603 CMR 28.07(8)):</strong> This progress report is provided pursuant to Massachusetts regulations
              requiring that parents/guardians be informed of their child's progress toward IEP goals at least as often as parents of non-disabled children
              are informed of their child's progress. You have the right to request an IEP Team meeting at any time to discuss your child's progress.
            </p>
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

function AmendButton({ studentId, docId, onAmended }: { studentId: number; docId: number; onAmended: () => void }) {
  const [showDialog, setShowDialog] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function createAmendment() {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await amendIepDocument(studentId, docId, { amendmentReason: reason.trim() });
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
        await updateIepDocument(activeDoc.id, form);
      } else {
        await createIepDocument(studentId, { ...form, studentId });
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
          <CardContent className="p-2">
            <EmptyState
              icon={FileCheck}
              title="No IEP document on file"
              description="Create a new IEP document to track all Massachusetts-required sections, or use the AI assistant to draft one based on existing goals."
              action={{ label: "Build IEP Draft with AI", href: `/students/${studentId}/iep-builder` }}
              secondaryAction={{ label: "Create Blank IEP", onClick: () => setEditing(true), variant: "outline" }}
            />
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
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateFilter, setTemplateFilter] = useState("all");
  const [saving, setSaving] = useState(false);
  const [category, setCategory] = useState("instruction");
  const [description, setDescription] = useState("");
  const [setting, setSetting] = useState("");
  const [frequency, setFrequency] = useState("");
  const [provider, setProvider] = useState("");

  function applyTemplate(t: typeof ACCOMMODATION_TEMPLATES[0]) {
    setCategory(t.category);
    setDescription(t.description);
    setSetting(t.setting ?? "");
    setFrequency(t.frequency ?? "");
    setProvider("");
    setShowTemplates(false);
    setShowAdd(true);
  }

  const filteredTemplates = templateFilter === "all"
    ? ACCOMMODATION_TEMPLATES
    : ACCOMMODATION_TEMPLATES.filter(t => t.category === templateFilter);

  async function addAccommodation() {
    if (!description.trim()) return;
    setSaving(true);
    try {
      await createAccommodation(studentId, {
          category, description: description.trim(),
          setting: setting || null, frequency: frequency || null, provider: provider || null,
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
    try {
      await deleteAccommodation(id);
      onSaved();
    } catch { toast.error("Failed to remove accommodation"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-700">Accommodations & Modifications</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="text-[12px] h-7 gap-1" onClick={() => { setShowTemplates(!showTemplates); setShowAdd(false); }}>
            <Sparkles className="w-3 h-3" /> From Template
          </Button>
          <Button size="sm" variant="outline" className="text-[12px] h-7" onClick={() => { setShowAdd(!showAdd); setShowTemplates(false); }}>
            <Plus className="w-3 h-3 mr-1" /> Add Custom
          </Button>
        </div>
      </div>

      {showTemplates && (
        <div className="border border-emerald-200 rounded-xl bg-emerald-50/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">603 CMR 28 Accommodation Templates</p>
            <button onClick={() => setShowTemplates(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {[{ value: "all", label: "All" }, ...ACCOMMODATION_CATEGORIES].map(c => (
              <button key={c.value} onClick={() => setTemplateFilter(c.value)}
                className={`px-2.5 py-1 text-[11px] rounded-full font-medium border transition-colors ${templateFilter === c.value ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"}`}>
                {c.label}
              </button>
            ))}
          </div>
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {filteredTemplates.map((t, i) => {
              const alreadyAdded = accommodations.some(a => a.description === t.description && a.active);
              return (
                <div key={i} className={`flex items-start justify-between gap-3 p-2.5 rounded-lg bg-white border ${alreadyAdded ? "border-gray-100 opacity-50" : "border-gray-200 hover:border-emerald-200 cursor-pointer"}`}
                  onClick={() => !alreadyAdded && applyTemplate(t)}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-gray-800">{t.description}</p>
                    <div className="flex gap-3 mt-0.5 text-[10px] text-gray-400">
                      {t.setting && <span>{t.setting}</span>}
                      {t.frequency && <span>{t.frequency}</span>}
                    </div>
                  </div>
                  {alreadyAdded
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    : <Plus className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {accommodations.length === 0 && !showAdd && !showTemplates && (
        <div className="text-center py-10 border border-dashed border-gray-200 rounded-lg">
          <p className="text-sm text-gray-400">No accommodations recorded.</p>
          <div className="flex gap-2 justify-center mt-3">
            <Button size="sm" variant="outline" className="text-[12px] gap-1" onClick={() => setShowTemplates(true)}>
              <Sparkles className="w-3 h-3" /> From Template
            </Button>
            <Button size="sm" variant="outline" className="text-[12px]" onClick={() => setShowAdd(true)}>
              <Plus className="w-3 h-3 mr-1" /> Add Custom
            </Button>
          </div>
        </div>
      )}

      {ACCOMMODATION_CATEGORIES.map(cat => {
        const items = accommodations.filter(a => a.category === cat.value && a.active);
        if (items.length === 0) return null;
        return (
          <div key={cat.value} className="space-y-2">
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{cat.label}</p>
            {items.map(acc => (
              <div key={acc.id} className="flex items-start gap-3 bg-white border border-gray-200 rounded-lg p-3 group">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-gray-800">{acc.description}</p>
                  <div className="flex flex-wrap gap-3 mt-1 text-[11px] text-gray-400">
                    {acc.setting && <span>Setting: {acc.setting}</span>}
                    {acc.frequency && <span>Frequency: {acc.frequency}</span>}
                    {acc.provider && <span>Provider: {acc.provider}</span>}
                  </div>
                </div>
                <button onClick={() => removeAccommodation(acc.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 flex-shrink-0 mt-0.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        );
      })}

      {showAdd && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
          <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">New Accommodation</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Category</label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                {ACCOMMODATION_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Setting (optional)</label>
              <input value={setting} onChange={e => setSetting(e.target.value)}
                placeholder="e.g. All settings, Testing only"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 font-medium">Description *</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="Describe the accommodation or modification…"
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Frequency (optional)</label>
              <input value={frequency} onChange={e => setFrequency(e.target.value)}
                placeholder="e.g. Daily, As needed"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Provider (optional)</label>
              <input value={provider} onChange={e => setProvider(e.target.value)}
                placeholder="e.g. Special Ed Teacher"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8"
              onClick={addAccommodation} disabled={saving || !description.trim()}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MeetingCard({ meeting, onSaved, onDelete }: {
  meeting: TeamMeeting; onSaved: () => void; onDelete: () => void;
}) {
  const [m, setM] = useState<TeamMeeting>(meeting);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"agenda" | "attendees" | "notes" | "actions" | "outcome">("agenda");
  const [saving, setSaving] = useState(false);
  const [newAgenda, setNewAgenda] = useState("");
  const [newAttendee, setNewAttendee] = useState({ name: "", role: "" });
  const [showAttendeeSuggestions, setShowAttendeeSuggestions] = useState(false);
  const [newAction, setNewAction] = useState({ description: "", assignee: "", dueDate: "" });

  async function patch(updates: Partial<TeamMeeting>) {
    setSaving(true);
    try {
      const updated = await updateTeamMeeting(m.id, updates);
      setM(prev => ({ ...prev, ...(updated as Partial<TeamMeeting>) }));
      onSaved();
    } catch { toast.error("Failed to save changes"); }
    setSaving(false);
  }

  function togglePresent(idx: number) {
    const updated = [...(m.attendees || [])];
    updated[idx] = { ...updated[idx], present: !updated[idx].present };
    setM(p => ({ ...p, attendees: updated }));
    patch({ attendees: updated });
  }

  function addAgendaItem() {
    if (!newAgenda.trim()) return;
    const updated = [...(m.agendaItems || []), newAgenda.trim()];
    setM(p => ({ ...p, agendaItems: updated }));
    patch({ agendaItems: updated });
    setNewAgenda("");
  }

  function removeAgendaItem(idx: number) {
    const updated = (m.agendaItems || []).filter((_, i) => i !== idx);
    setM(p => ({ ...p, agendaItems: updated }));
    patch({ agendaItems: updated });
  }

  function addAttendee(name?: string, role?: string) {
    const a = { name: name ?? newAttendee.name.trim(), role: role ?? newAttendee.role.trim(), present: false };
    if (!a.name) return;
    const updated = [...(m.attendees || []), a];
    setM(p => ({ ...p, attendees: updated }));
    patch({ attendees: updated });
    setNewAttendee({ name: "", role: "" });
    setShowAttendeeSuggestions(false);
  }

  function removeAttendee(idx: number) {
    const updated = (m.attendees || []).filter((_, i) => i !== idx);
    setM(p => ({ ...p, attendees: updated }));
    patch({ attendees: updated });
  }

  function addActionItem() {
    if (!newAction.description.trim()) return;
    const item: ActionItem = { id: genId(), description: newAction.description.trim(), assignee: newAction.assignee.trim(), dueDate: newAction.dueDate || null, status: "open" };
    const updated = [...(m.actionItems || []), item];
    setM(p => ({ ...p, actionItems: updated }));
    patch({ actionItems: updated });
    setNewAction({ description: "", assignee: "", dueDate: "" });
  }

  function toggleActionItem(id: string) {
    const updated = (m.actionItems || []).map(a => a.id === id ? { ...a, status: a.status === "open" ? "completed" as const : "open" as const } : a);
    setM(p => ({ ...p, actionItems: updated }));
    patch({ actionItems: updated });
  }

  function removeActionItem(id: string) {
    const updated = (m.actionItems || []).filter(a => a.id !== id);
    setM(p => ({ ...p, actionItems: updated }));
    patch({ actionItems: updated });
  }

  function printMinutes() {
    const win = window.open("", "_blank");
    if (!win) return;
    const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const typeLabel = MEETING_TYPES.find(t => t.value === m.meetingType)?.label ?? m.meetingType;
    const presentAttendees = (m.attendees || []).filter(a => a.present);
    const absentAttendees = (m.attendees || []).filter(a => !a.present);
    const openItems = (m.actionItems || []).filter(a => a.status === "open");
    const doneItems = (m.actionItems || []).filter(a => a.status === "completed");

    win.document.write(`<!DOCTYPE html><html><head><title>Meeting Minutes — ${esc(typeLabel)}</title>
    <style>body{font-family:Arial,sans-serif;margin:40px;font-size:12px;color:#111}
    h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;border-bottom:2px solid #059669;padding-bottom:4px;margin:18px 0 8px}
    .header{border-bottom:3px solid #059669;padding-bottom:12px;margin-bottom:18px}
    table{width:100%;border-collapse:collapse;margin:6px 0 12px}th{background:#f3f4f6;padding:5px 8px;border:1px solid #d1d5db;text-align:left;font-size:11px}
    td{padding:5px 8px;border:1px solid #d1d5db;font-size:11px}
    .item{padding:4px 0;border-bottom:1px solid #f3f4f6;font-size:12px}
    .confidential{background:#fef9c3;border:1px solid #fde68a;padding:8px;border-radius:4px;font-size:10px;margin-top:18px}
    @media print{body{margin:20px}}</style></head><body>
    <div class="header">
      <h1>${esc(typeLabel)}</h1>
      <p style="color:#6b7280;margin:2px 0">Date: ${esc(formatDate(m.scheduledDate))}${m.scheduledTime ? ` at ${esc(m.scheduledTime)}` : ""}${m.duration ? ` · Duration: ${m.duration} min` : ""}</p>
      ${m.location ? `<p style="color:#6b7280;margin:2px 0">Location: ${esc(m.location)}</p>` : ""}
      <p style="color:#6b7280;margin:2px 0">Status: ${esc(STATUS_STYLES[m.status]?.label ?? m.status)}${m.minutesFinalized ? " · MINUTES FINALIZED" : " · DRAFT"}</p>
    </div>

    ${presentAttendees.length > 0 ? `<h2>Attendees Present</h2>
    <table><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody>
    ${presentAttendees.map(a => `<tr><td>${esc(a.name)}</td><td>${esc(a.role)}</td></tr>`).join("")}
    </tbody></table>` : ""}

    ${absentAttendees.length > 0 ? `<h2>Unable to Attend</h2>
    ${absentAttendees.map(a => `<p class="item">${esc(a.name)} (${esc(a.role)})</p>`).join("")}` : ""}

    ${m.agendaItems && m.agendaItems.length > 0 ? `<h2>Agenda</h2>
    ${m.agendaItems.map((item, i) => `<p class="item">${i+1}. ${esc(item)}</p>`).join("")}` : ""}

    ${m.notes ? `<h2>Meeting Notes / Minutes</h2><p style="white-space:pre-wrap;font-size:12px;line-height:1.6">${esc(m.notes)}</p>` : ""}

    ${m.outcome ? `<h2>Outcome / Decisions Made</h2><p style="font-size:12px">${esc(m.outcome)}</p>` : ""}

    ${openItems.length > 0 ? `<h2>Open Action Items</h2>
    <table><thead><tr><th>Task</th><th>Assigned To</th><th>Due Date</th></tr></thead><tbody>
    ${openItems.map(a => `<tr><td>${esc(a.description)}</td><td>${esc(a.assignee)}</td><td>${esc(a.dueDate ?? "—")}</td></tr>`).join("")}
    </tbody></table>` : ""}

    ${doneItems.length > 0 ? `<h2>Completed Action Items</h2>
    ${doneItems.map(a => `<p class="item" style="color:#6b7280;text-decoration:line-through">✓ ${esc(a.description)} (${esc(a.assignee)})</p>`).join("")}` : ""}

    ${m.followUpDate ? `<h2>Next Meeting</h2><p style="font-size:12px">Scheduled for: ${esc(formatDate(m.followUpDate))}</p>` : ""}

    ${m.consentStatus ? `<h2>Consent Status</h2><p style="font-size:12px">${esc(m.consentStatus)}</p>` : ""}

    <div class="confidential">CONFIDENTIAL — This document contains protected student information under FERPA and 603 CMR 23.00. Do not distribute without authorization.</div>
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }

  const typeLabel = MEETING_TYPES.find(t => t.value === m.meetingType)?.label ?? m.meetingType;
  const statusStyle = STATUS_STYLES[m.status] || { bg: "bg-gray-50", color: "text-gray-600", label: m.status };
  const presentCount = (m.attendees || []).filter(a => a.present).length;
  const totalAttendees = (m.attendees || []).length;
  const openActionCount = (m.actionItems || []).filter(a => a.status === "open").length;
  const fmt = MEETING_FORMATS.find(f => f.value === m.meetingFormat);

  const cardTabs = [
    { key: "agenda" as const, label: "Agenda", count: (m.agendaItems || []).length },
    { key: "attendees" as const, label: "Attendees", count: totalAttendees },
    { key: "notes" as const, label: "Notes / Minutes", count: null },
    { key: "actions" as const, label: "Action Items", count: openActionCount },
    { key: "outcome" as const, label: "Outcome", count: null },
  ];

  return (
    <Card className={`border ${m.minutesFinalized ? "border-emerald-200" : "border-gray-200"}`}>
      <CardContent className="p-0">
        <button className="w-full p-3.5 text-left" onClick={() => setExpanded(e => !e)}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${m.status === "completed" ? "bg-emerald-100" : "bg-gray-100"}`}>
              <CalendarDays className={`w-5 h-5 ${m.status === "completed" ? "text-emerald-700" : "text-gray-500"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[13px] font-semibold text-gray-800">{typeLabel}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusStyle.bg} ${statusStyle.color}`}>{statusStyle.label}</span>
                {m.minutesFinalized && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium">Minutes Finalized</span>}
                {fmt && <span className="text-[10px] text-gray-400 flex items-center gap-0.5"><fmt.icon className="w-3 h-3" /> {fmt.label}</span>}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5 flex-wrap">
                <span>{formatDate(m.scheduledDate)}{m.scheduledTime ? ` · ${m.scheduledTime}` : ""}{m.duration ? ` · ${m.duration} min` : ""}</span>
                {m.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{m.location}</span>}
                {totalAttendees > 0 && <span className="flex items-center gap-0.5"><Users className="w-3 h-3" />{m.status === "completed" ? `${presentCount}/${totalAttendees} present` : `${totalAttendees} invited`}</span>}
                {openActionCount > 0 && <span className="text-amber-600 font-medium">{openActionCount} open action{openActionCount !== 1 ? "s" : ""}</span>}
              </div>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
          </div>
        </button>

        {expanded && (
          <div className="border-t border-gray-100">
            <div className="flex items-center gap-0.5 border-b border-gray-100 px-3 overflow-x-auto">
              {cardTabs.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`px-3 py-2 text-[11px] font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === t.key ? "border-emerald-600 text-emerald-700" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                  {t.label}{t.count !== null && t.count > 0 ? ` (${t.count})` : ""}
                </button>
              ))}
            </div>

            <div className="p-3.5 space-y-3">
              {activeTab === "agenda" && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    {(m.agendaItems || []).length === 0 && <p className="text-[12px] text-gray-400 italic">No agenda items yet. Add items below.</p>}
                    {(m.agendaItems || []).map((item, i) => (
                      <div key={i} className="flex items-start gap-2 group bg-gray-50 rounded p-2">
                        <span className="text-[11px] font-bold text-gray-400 mt-0.5 w-4 flex-shrink-0">{i+1}.</span>
                        <p className="text-[12px] text-gray-700 flex-1">{item}</p>
                        <button onClick={() => removeAgendaItem(i)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input value={newAgenda} onChange={e => setNewAgenda(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addAgendaItem(); } }}
                      placeholder="Add agenda item…"
                      className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                    <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={addAgendaItem}><Plus className="w-3 h-3 mr-1" /> Add</Button>
                  </div>
                </div>
              )}

              {activeTab === "attendees" && (
                <div className="space-y-2">
                  <div className="space-y-1">
                    {(m.attendees || []).length === 0 && <p className="text-[12px] text-gray-400 italic">No attendees added yet.</p>}
                    {(m.attendees || []).map((a, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-50 rounded p-2 group">
                        <button onClick={() => togglePresent(i)}
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${a.present ? "bg-emerald-600 border-emerald-600 text-white" : "border-gray-300 text-transparent hover:border-emerald-400"}`}>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium text-gray-700">{a.name}</p>
                          <p className="text-[11px] text-gray-400">{a.role}</p>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${a.present ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>{a.present ? "Present" : "Absent"}</span>
                        <button onClick={() => removeAttendee(i)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                  <div className="relative">
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setShowAttendeeSuggestions(!showAttendeeSuggestions)}>
                      <UserPlus className="w-3 h-3 mr-1" /> Add from Suggestions
                    </Button>
                    {showAttendeeSuggestions && (
                      <div className="absolute z-10 top-8 left-0 bg-white border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-2 gap-1 w-72">
                        {SUGGESTED_ATTENDEE_ROLES.map(role => (
                          <button key={role} onClick={() => addAttendee(role, role)}
                            className="text-left px-2 py-1 text-[11px] text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 rounded">
                            {role}
                          </button>
                        ))}
                        <button onClick={() => setShowAttendeeSuggestions(false)} className="col-span-2 text-center text-[10px] text-gray-400 mt-1">Close</button>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <input value={newAttendee.name} onChange={e => setNewAttendee(p => ({ ...p, name: e.target.value }))} placeholder="Name"
                      className="flex-1 min-w-[120px] border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                    <input value={newAttendee.role} onChange={e => setNewAttendee(p => ({ ...p, role: e.target.value }))} placeholder="Role"
                      className="flex-1 min-w-[120px] border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                    <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={() => addAttendee()}><Plus className="w-3 h-3 mr-1" /> Add</Button>
                  </div>
                </div>
              )}

              {activeTab === "notes" && (
                <div className="space-y-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Meeting Minutes / Notes</p>
                  <textarea value={m.notes || ""} rows={8}
                    onChange={e => setM(p => ({ ...p, notes: e.target.value }))}
                    onBlur={() => patch({ notes: m.notes })}
                    placeholder="Record meeting minutes, discussion points, decisions made, and any other relevant notes here…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-[12px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
                  <p className="text-[10px] text-gray-300">Notes auto-save when you click away.</p>
                </div>
              )}

              {activeTab === "actions" && (
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    {(m.actionItems || []).length === 0 && <p className="text-[12px] text-gray-400 italic">No action items yet.</p>}
                    {(m.actionItems || []).map(a => (
                      <div key={a.id} className={`flex items-start gap-2 rounded p-2 group ${a.status === "completed" ? "bg-gray-50 opacity-60" : "bg-amber-50"}`}>
                        <button onClick={() => toggleActionItem(a.id)}
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${a.status === "completed" ? "bg-emerald-600 border-emerald-600 text-white" : "border-amber-400 text-transparent hover:border-emerald-400"}`}>
                          <CheckCircle2 className="w-3 h-3" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12px] text-gray-700 ${a.status === "completed" ? "line-through" : "font-medium"}`}>{a.description}</p>
                          <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                            {a.assignee && <span>→ {a.assignee}</span>}
                            {a.dueDate && <span>Due: {formatDate(a.dueDate)}</span>}
                          </div>
                        </div>
                        <button onClick={() => removeActionItem(a.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500"><X className="w-3 h-3" /></button>
                      </div>
                    ))}
                  </div>
                  <div className="border border-gray-200 rounded-lg p-2.5 space-y-2">
                    <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Add Action Item</p>
                    <input value={newAction.description} onChange={e => setNewAction(p => ({ ...p, description: e.target.value }))} placeholder="Task description…"
                      className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                    <div className="flex gap-2">
                      <input value={newAction.assignee} onChange={e => setNewAction(p => ({ ...p, assignee: e.target.value }))} placeholder="Assigned to"
                        className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                      <input type="date" value={newAction.dueDate} onChange={e => setNewAction(p => ({ ...p, dueDate: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-emerald-300" />
                      <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white h-8 text-[11px]" onClick={addActionItem}><Plus className="w-3 h-3 mr-1" /> Add</Button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "outcome" && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Outcome / Decisions Made</label>
                    <textarea value={m.outcome || ""} rows={3}
                      onChange={e => setM(p => ({ ...p, outcome: e.target.value }))}
                      onBlur={() => patch({ outcome: m.outcome })}
                      placeholder="Summarize the decisions made and key outcomes of this meeting…"
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Next Meeting Date</label>
                    <input type="date" value={m.followUpDate || ""}
                      onChange={e => { setM(p => ({ ...p, followUpDate: e.target.value })); patch({ followUpDate: e.target.value || null }); }}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Parent Consent Status</label>
                      <select value={m.consentStatus || ""}
                        onChange={e => { setM(p => ({ ...p, consentStatus: e.target.value || null })); patch({ consentStatus: e.target.value || null }); }}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[12px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                        <option value="">— Not recorded —</option>
                        <option value="Consent given — IEP accepted">Consent given — IEP accepted</option>
                        <option value="Consent given — IEP rejected">Consent given — IEP rejected</option>
                        <option value="Parent did not attend">Parent did not attend</option>
                        <option value="Parent requested additional time">Parent requested additional time</option>
                        <option value="Consent not applicable">Not applicable</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Notice Sent Date</label>
                      <input type="date" value={m.noticeSentDate || ""}
                        onChange={e => { setM(p => ({ ...p, noticeSentDate: e.target.value || null })); patch({ noticeSentDate: e.target.value || null }); }}
                        className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 px-3.5 py-2.5 gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                {m.status !== "completed" && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]"
                    onClick={() => { setM(p => ({ ...p, status: "completed" })); patch({ status: "completed" }); }}>
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Complete
                  </Button>
                )}
                {m.status !== "cancelled" && m.status !== "completed" && (
                  <Button size="sm" variant="outline" className="h-7 text-[11px] text-amber-600 border-amber-200"
                    onClick={() => { setM(p => ({ ...p, status: "cancelled" })); patch({ status: "cancelled" }); }}>
                    Cancel
                  </Button>
                )}
                {saving && <span className="text-[11px] text-gray-400">Saving…</span>}
              </div>
              <div className="flex items-center gap-1.5">
                {!m.minutesFinalized ? (
                  <Button size="sm" variant="outline" className="h-7 text-[11px] text-emerald-700 border-emerald-200"
                    onClick={() => { setM(p => ({ ...p, minutesFinalized: true })); patch({ minutesFinalized: true }); }}>
                    <Save className="w-3 h-3 mr-1" /> Finalize Minutes
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-[11px] text-gray-500"
                    onClick={() => { setM(p => ({ ...p, minutesFinalized: false })); patch({ minutesFinalized: false }); }}>
                    Unfinalize
                  </Button>
                )}
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={printMinutes}>
                  <Download className="w-3 h-3 mr-1" /> Print Minutes
                </Button>
                <button onClick={onDelete} className="text-red-400 hover:text-red-600 p-1 ml-1"><X className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function generateMeetingPrepPacket(
  student: Student | null,
  meetings: TeamMeeting[],
  goals: IepGoal[],
  accommodations: Accommodation[],
  iepDocs: IepDocument[]
) {
  const esc = (s: string | null | undefined) => (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const name = student ? `${student.firstName} ${student.lastName}` : "Student";
  const doc = iepDocs.find(d => d.active) ?? iepDocs[0] ?? null;
  const nextMeeting = [...meetings].filter(m => m.status === "scheduled").sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0] ?? null;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const activeGoals = goals.filter(g => g.active !== false);
  const activeAccs = accommodations.filter(a => a.active !== false);
  const RATING_LABELS: Record<string, string> = {
    mastered: "Mastered", sufficient_progress: "On Track", some_progress: "Making Progress",
    insufficient_progress: "Needs Support", regression: "Concern", not_addressed: "Not Yet Measured",
  };

  const html = `<!DOCTYPE html><html lang="en">
<head><meta charset="UTF-8"><title>Meeting Prep Packet — ${esc(name)}</title>
<style>
  body { font-family: Georgia, serif; color: #1a1a1a; max-width: 800px; margin: 0 auto; padding: 40px 32px; font-size: 13px; }
  h1 { font-size: 22px; font-weight: bold; margin: 0 0 4px; }
  h2 { font-size: 14px; font-weight: bold; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #d1d5db; color: #1a1a1a; }
  h3 { font-size: 12px; font-weight: bold; margin: 12px 0 4px; color: #374151; }
  .meta { color: #6b7280; font-size: 12px; margin-bottom: 20px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 8px; }
  .info-item label { display: block; font-size: 10px; font-weight: bold; text-transform: uppercase; color: #9ca3af; margin-bottom: 2px; letter-spacing: 0.05em; }
  .info-item span { font-size: 13px; color: #111827; }
  .goal-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; margin-bottom: 8px; page-break-inside: avoid; }
  .goal-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .goal-num { font-size: 10px; font-weight: bold; background: #e5e7eb; color: #374151; padding: 2px 6px; border-radius: 4px; }
  .rating { font-size: 10px; font-weight: bold; padding: 2px 8px; border-radius: 10px; }
  .rating-ok { background: #d1fae5; color: #065f46; }
  .rating-progress { background: #dbeafe; color: #1e40af; }
  .rating-warn { background: #fef3c7; color: #92400e; }
  .rating-concern { background: #fee2e2; color: #991b1b; }
  .rating-gray { background: #f3f4f6; color: #4b5563; }
  .acc-row { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 12px; }
  .acc-cat { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #9ca3af; min-width: 90px; margin-top: 1px; }
  .section-empty { font-size: 12px; color: #9ca3af; font-style: italic; padding: 8px 0; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
  @media print { body { padding: 20px; } }
</style></head>
<body>
<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:8px">
  <div>
    <h1>${esc(name)}</h1>
    <p class="meta">IEP Team Meeting Prep Packet · Prepared ${esc(today)}</p>
  </div>
  <div style="text-align:right;font-size:11px;color:#9ca3af">
    <p style="margin:0;font-weight:bold;color:#374151">Trellis</p>
    <p style="margin:0">CONFIDENTIAL — Team Use Only</p>
  </div>
</div>

<div class="info-grid">
  <div class="info-item"><label>Student</label><span>${esc(name)}</span></div>
  <div class="info-item"><label>Grade</label><span>${esc(student?.grade ?? "—")}</span></div>
  <div class="info-item"><label>DOB</label><span>${esc(student?.dob ?? "—")}</span></div>
  ${doc ? `
  <div class="info-item"><label>IEP Start</label><span>${esc(doc.startDate ?? "—")}</span></div>
  <div class="info-item"><label>IEP End</label><span>${esc(doc.endDate ?? "—")}</span></div>
  <div class="info-item"><label>IEP Type</label><span>${esc(doc.iepType ?? "Initial")}</span></div>
  ` : ""}
  ${nextMeeting ? `
  <div class="info-item"><label>Meeting Date</label><span>${esc(nextMeeting.scheduledDate)}</span></div>
  <div class="info-item"><label>Meeting Type</label><span>${esc(nextMeeting.meetingType.replace(/_/g, " "))}</span></div>
  <div class="info-item"><label>Format</label><span>${esc(nextMeeting.meetingFormat ?? "—")}</span></div>
  ` : ""}
</div>

<h2>Annual IEP Goals (${activeGoals.length})</h2>
${activeGoals.length === 0 ? `<p class="section-empty">No active goals on record.</p>` : activeGoals.map((g, i) => {
  const ratingClass = (["mastered", "sufficient_progress"].includes(g.progressRating ?? "") ? "rating-ok"
    : g.progressRating === "some_progress" ? "rating-progress"
    : g.progressRating === "insufficient_progress" ? "rating-warn"
    : g.progressRating === "regression" ? "rating-concern"
    : "rating-gray");
  return `<div class="goal-box">
    <div class="goal-header">
      <span class="goal-num">Goal ${g.goalNumber ?? i + 1}</span>
      <strong style="font-size:12px">${esc(g.goalArea ?? "")}</strong>
      ${g.progressRating ? `<span class="rating ${ratingClass}">${esc(RATING_LABELS[g.progressRating] ?? g.progressRating)}</span>` : ""}
    </div>
    <p style="margin:0 0 6px;font-size:12px;color:#374151">${esc(g.annualGoal)}</p>
    ${g.baseline ? `<p style="margin:0;font-size:11px;color:#6b7280"><strong>Baseline:</strong> ${esc(g.baseline)}</p>` : ""}
    ${g.targetCriterion ? `<p style="margin:0;font-size:11px;color:#6b7280"><strong>Target:</strong> ${esc(g.targetCriterion)}</p>` : ""}
    ${g.currentPerformance ? `<p style="margin:0;font-size:11px;color:#059669"><strong>Current Performance:</strong> ${esc(g.currentPerformance)}</p>` : ""}
  </div>`;
}).join("")}

<h2>Accommodations & Modifications (${activeAccs.length})</h2>
${activeAccs.length === 0 ? `<p class="section-empty">No accommodations on record.</p>` : activeAccs.map(a =>
  `<div class="acc-row"><span class="acc-cat">${esc(a.category)}</span><div><span>${esc(a.description)}</span>${a.setting || a.frequency ? `<span style="color:#9ca3af;font-size:11px"> — ${[a.setting, a.frequency].filter(Boolean).join(", ")}</span>` : ""}</div></div>`
).join("")}

<h2>Team Notes & Discussion Topics</h2>
<div style="border:1px solid #e5e7eb;border-radius:6px;padding:12px;min-height:100px;background:#fafafa">
  <p style="margin:0;font-size:11px;color:#d1d5db;font-style:italic">Use this space to add notes before or during the meeting.</p>
</div>

<h2>Action Items from This Meeting</h2>
<div style="border:1px solid #e5e7eb;border-radius:6px;padding:12px;min-height:80px;background:#fafafa">
  <p style="margin:0;font-size:11px;color:#d1d5db;font-style:italic">Record action items, owners, and due dates.</p>
</div>

<div class="footer">
  <span>Generated by Trellis · ${esc(today)}</span>
  <span>CONFIDENTIAL — For IEP Team Use Only</span>
</div>
</body></html>`;

  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }
}

function TeamMeetingsSection({ studentId, meetings, onSaved, student, goals, accommodations, iepDocs }: {
  studentId: number; meetings: TeamMeeting[]; onSaved: () => void;
  student?: Student | null; goals?: IepGoal[]; accommodations?: Accommodation[]; iepDocs?: IepDocument[];
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    meetingType: "annual", scheduledDate: "", scheduledTime: "", duration: "",
    location: "", meetingFormat: "in-person", noticeSentDate: "",
  });

  const sorted = [...meetings].sort((a, b) => {
    if (a.status === "scheduled" && b.status !== "scheduled") return -1;
    if (b.status === "scheduled" && a.status !== "scheduled") return 1;
    return b.scheduledDate.localeCompare(a.scheduledDate);
  });

  const openActions = meetings.flatMap(m => (m.actionItems || []).filter(a => a.status === "open").map(a => ({ ...a, meetingType: m.meetingType, meetingDate: m.scheduledDate })));

  async function addMeeting() {
    if (!form.scheduledDate) return;
    setSaving(true);
    try {
      await createTeamMeeting(studentId, {
          meetingType: form.meetingType,
          scheduledDate: form.scheduledDate,
          scheduledTime: form.scheduledTime || null,
          duration: form.duration ? parseInt(form.duration) : null,
          location: form.location || null,
          meetingFormat: form.meetingFormat || null,
          noticeSentDate: form.noticeSentDate || null,
          status: "scheduled",
        });
      setForm({ meetingType: "annual", scheduledDate: "", scheduledTime: "", duration: "", location: "", meetingFormat: "in-person", noticeSentDate: "" });
      setShowAdd(false);
      onSaved();
      toast.success("Meeting scheduled");
    } catch { toast.error("Failed to schedule meeting"); }
    setSaving(false);
  }

  async function deleteMeeting(id: number) {
    try {
      await deleteTeamMeeting(id);
      onSaved();
      toast.success("Meeting deleted");
    } catch {
      toast.error("Failed to delete meeting");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-700">Team Meetings</h3>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="text-[12px] h-7 gap-1"
            onClick={() => generateMeetingPrepPacket(student ?? null, meetings, goals ?? [], accommodations ?? [], iepDocs ?? [])}>
            <Printer className="w-3 h-3" /> Prep Packet
          </Button>
          <Button size="sm" variant="outline" className="text-[12px] h-7" onClick={() => setShowAdd(!showAdd)}>
            <Plus className="w-3 h-3 mr-1" /> Schedule Meeting
          </Button>
        </div>
      </div>

      {openActions.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-[11px] font-semibold text-amber-700 mb-2 uppercase tracking-wider">Open Action Items ({openActions.length})</p>
          <div className="space-y-1">
            {openActions.map((a, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px] text-amber-800">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                <span>{a.description}{a.assignee ? ` — ${a.assignee}` : ""}{a.dueDate ? ` (due ${formatDate(a.dueDate)})` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAdd && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
          <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider">Schedule New Meeting</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Meeting Type</label>
              <select value={form.meetingType} onChange={e => setForm(p => ({ ...p, meetingType: e.target.value }))}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                {MEETING_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Format</label>
              <select value={form.meetingFormat} onChange={e => setForm(p => ({ ...p, meetingFormat: e.target.value }))}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                {MEETING_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Date *</label>
              <input type="date" value={form.scheduledDate} onChange={e => setForm(p => ({ ...p, scheduledDate: e.target.value }))}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Time</label>
              <input type="time" value={form.scheduledTime} onChange={e => setForm(p => ({ ...p, scheduledTime: e.target.value }))}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Duration (min)</label>
              <input type="number" min="15" max="480" value={form.duration} onChange={e => setForm(p => ({ ...p, duration: e.target.value }))}
                placeholder="60"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Location</label>
              <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                placeholder="e.g. Room 204, Zoom"
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 font-medium">Notice Sent Date</label>
              <input type="date" value={form.noticeSentDate} onChange={e => setForm(p => ({ ...p, noticeSentDate: e.target.value }))}
                className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8"
              onClick={addMeeting} disabled={saving || !form.scheduledDate}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarDays className="w-3 h-3 mr-1" />}
              Schedule
            </Button>
          </div>
        </div>
      )}

      {sorted.length === 0 && !showAdd && (
        <div className="text-center py-10 border border-dashed border-gray-200 rounded-lg">
          <p className="text-sm text-gray-400">No meetings scheduled.</p>
          <Button size="sm" variant="outline" className="mt-3 text-[12px]" onClick={() => setShowAdd(true)}>
            <Plus className="w-3 h-3 mr-1" /> Schedule First Meeting
          </Button>
        </div>
      )}

      <div className="space-y-3">
        {sorted.map(m => (
          <MeetingCard
            key={m.id}
            meeting={m}
            onSaved={onSaved}
            onDelete={() => deleteMeeting(m.id)}
          />
        ))}
      </div>
    </div>
  );
}

function GoalBankModal({ studentId, existingGoals, onClose, onGoalAdded }: {
  studentId: number; existingGoals: IepGoal[]; onClose: () => void; onGoalAdded: () => void;
}) {
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [allGoals, setAllGoals] = useState<GoalBankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<number | null>(null);

  useEffect(() => {
    listGoalBank().then(d => {
      setAllGoals(Array.isArray(d) ? d as any : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const domains = [...new Set(allGoals.map(g => g.domain))].sort();
  const existingGoalTexts = new Set(existingGoals.map(g => g.annualGoal));
  const goals = allGoals.filter(g => {
    if (domainFilter && g.domain !== domainFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return g.goalText.toLowerCase().includes(q) || g.domain.toLowerCase().includes(q) || g.goalArea.toLowerCase().includes(q);
    }
    return true;
  });

  async function addGoalToStudent(g: GoalBankEntry) {
    setAdding(g.id);
    try {
      await createIepGoal(studentId, {
        goalArea: g.goalArea,
        annualGoal: g.goalText,
        benchmarks: g.benchmarkText || null,
        status: "active",
      });
      onGoalAdded();
      toast.success("Goal added from goal bank");
    } catch { toast.error("Failed to add goal"); }
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
            <div key={g.id} className={`border rounded-lg p-3 transition-colors ${existingGoalTexts.has(g.goalText) ? "border-emerald-200 bg-emerald-50/40" : "border-gray-200 hover:border-emerald-200"}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">{g.domain}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{g.goalArea}</span>
                    {g.gradeRange && <span className="text-[10px] text-gray-400">Grades {g.gradeRange}</span>}
                    {existingGoalTexts.has(g.goalText) && <span className="text-[10px] text-emerald-600 font-medium">Already added</span>}
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
                  disabled={adding === g.id || existingGoalTexts.has(g.goalText)} onClick={() => addGoalToStudent(g)}>
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
    getStudentIepDocumentCompleteness(studentId, docId).then(d => setData(d as unknown as CompletenessData))
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
    listParentContacts({ studentId }).catch(() => []).then(d => setContacts(Array.isArray(d) ? d : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [studentId]);

  async function addContact() {
    if (!form.subject.trim()) return;
    setSaving(true);
    try {
      const res = await createParentContact({ ...form, studentId });
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
