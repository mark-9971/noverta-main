import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { formatDate } from "@/lib/formatters";
import { useLocation } from "wouter";
import {
  FileSearch, ClipboardList, Users, Calendar, AlertTriangle,
  Plus, Save, Loader2, CheckCircle2, Clock,
  Timer, Shield, Columns3, List,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

interface StudentOption {
  id: number;
  firstName: string;
  lastName: string;
}

interface StaffOption {
  id: number;
  firstName: string;
  lastName: string;
}

interface ReferralRecord {
  id: number;
  studentId: number;
  referralDate: string;
  referralSource: string;
  referralSourceName: string | null;
  reason: string;
  areasOfConcern: string[];
  consentRequestedDate: string | null;
  consentReceivedDate: string | null;
  consentStatus: string;
  evaluationDeadline: string | null;
  assignedEvaluatorId: number | null;
  status: string;
  notes: string | null;
  studentName: string | null;
  studentGrade: string | null;
  evaluatorName: string | null;
  schoolName: string | null;
  daysUntilDeadline: number | null;
  createdAt: string;
  updatedAt: string;
}

interface EvaluationArea {
  area: string;
  status: string;
}

interface EvaluationRecord {
  id: number;
  studentId: number;
  referralId: number | null;
  evaluationType: string;
  evaluationAreas: EvaluationArea[];
  teamMembers: string[];
  leadEvaluatorId: number | null;
  startDate: string | null;
  dueDate: string | null;
  completionDate: string | null;
  meetingDate: string | null;
  status: string;
  notes: string | null;
  studentName: string | null;
  studentGrade: string | null;
  leadEvaluatorName: string | null;
  daysUntilDue: number | null;
  createdAt: string;
  updatedAt: string;
}

interface EligibilityRecord {
  id: number;
  studentId: number;
  evaluationId: number | null;
  meetingDate: string;
  teamMembers: string[];
  primaryDisability: string | null;
  secondaryDisability: string | null;
  eligible: boolean | null;
  determinationBasis: string | null;
  determinationNotes: string | null;
  iepRequired: boolean;
  nextReEvalDate: string | null;
  reEvalCycleMonths: number;
  status: string;
  studentName: string | null;
  studentGrade: string | null;
  daysUntilReEval: number | null;
  createdAt: string;
  updatedAt: string;
}

interface DashboardData {
  openReferrals: number;
  pendingConsent: number;
  overdueEvaluations: number;
  activeEvaluations: number;
  upcomingReEvaluations: number;
  overdueReEvaluations: number;
  timelineRule: { key: string; label: string; schoolDays: number };
  overdueReferralDeadlines: Array<{
    id: number;
    studentName: string;
    deadline: string;
    daysOverdue: number;
    status: string;
  }>;
  upcomingReEvalList: Array<{
    id: number;
    studentName: string;
    nextReEvalDate: string | null;
    daysUntilReEval: number | null;
    primaryDisability: string | null;
  }>;
}

const REFERRAL_SOURCES = [
  { value: "teacher", label: "Teacher" },
  { value: "parent", label: "Parent / Guardian" },
  { value: "physician", label: "Physician" },
  { value: "outside_agency", label: "Outside Agency" },
  { value: "self", label: "Self-Referral" },
  { value: "school_team", label: "School Team" },
  { value: "other", label: "Other" },
];

const CONCERN_AREAS = [
  "Academic Performance", "Communication / Language", "Social-Emotional",
  "Behavioral", "Motor Skills", "Adaptive / Daily Living", "Sensory",
  "Cognitive / Intellectual", "Transition", "Assistive Technology",
];

const DISABILITY_CATEGORIES = [
  "Autism", "Developmental Delay", "Emotional Disturbance",
  "Hearing Impairment (including Deafness)", "Intellectual Disability",
  "Multiple Disabilities", "Neurological Impairment",
  "Orthopedic Impairment", "Other Health Impairment",
  "Specific Learning Disability", "Speech or Language Impairment",
  "Traumatic Brain Injury", "Visual Impairment (including Blindness)",
];

const EVAL_AREAS = [
  "Educational Assessment", "Psychological Assessment",
  "Speech-Language Evaluation", "Occupational Therapy Evaluation",
  "Physical Therapy Evaluation", "Behavioral Assessment",
  "Assistive Technology Assessment", "Social-Emotional Assessment",
  "Transition Assessment", "Medical / Health Assessment",
  "Functional Behavioral Assessment", "Neuropsychological Evaluation",
];

const TEAM_ROLES = [
  "Parent / Guardian", "Special Education Teacher", "General Education Teacher",
  "School Psychologist", "Speech-Language Pathologist", "Occupational Therapist",
  "Physical Therapist", "BCBA", "School Administrator", "School Nurse",
  "Social Worker", "Transition Specialist", "Student (age 14+)",
];

type StatusColor = "emerald" | "amber" | "red" | "blue" | "gray";

function statusBadge(label: string, color: StatusColor) {
  const styles: Record<StatusColor, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    red: "bg-red-50 text-red-700 border-red-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    gray: "bg-gray-50 text-gray-600 border-gray-200",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${styles[color]}`}>{label}</span>;
}

function deadlineBadge(daysUntil: number | null) {
  if (daysUntil === null) return statusBadge("No deadline", "gray");
  if (daysUntil < 0) return statusBadge(`${Math.abs(daysUntil)}d overdue`, "red");
  if (daysUntil <= 7) return statusBadge(`${daysUntil}d left`, "red");
  if (daysUntil <= 14) return statusBadge(`${daysUntil}d left`, "amber");
  return statusBadge(`${daysUntil}d left`, "emerald");
}

function consentStatusBadge(status: string) {
  if (status === "obtained") return statusBadge("Consent Obtained", "emerald");
  if (status === "refused") return statusBadge("Consent Refused", "red");
  return statusBadge("Consent Pending", "amber");
}

function referralStatusBadge(status: string) {
  const map: Record<string, [string, StatusColor]> = {
    open: ["Open", "blue"],
    evaluation_in_progress: ["Eval In Progress", "amber"],
    evaluation_complete: ["Eval Complete", "emerald"],
    closed: ["Closed", "gray"],
    withdrawn: ["Withdrawn", "gray"],
  };
  const [label, color] = map[status] ?? ["Unknown", "gray"];
  return statusBadge(label, color);
}

function evalStatusBadge(status: string) {
  const map: Record<string, [string, StatusColor]> = {
    pending: ["Pending", "gray"],
    in_progress: ["In Progress", "blue"],
    completed: ["Completed", "emerald"],
    overdue: ["Overdue", "red"],
  };
  const [label, color] = map[status] ?? ["Unknown", "gray"];
  return statusBadge(label, color);
}

async function fetchStudents(): Promise<StudentOption[]> {
  const res = await authFetch("/api/students?limit=500");
  if (!res.ok) return [];
  return res.json();
}

async function fetchStaff(): Promise<StaffOption[]> {
  const res = await authFetch("/api/staff");
  if (!res.ok) return [];
  return res.json();
}

export default function EvaluationsPage() {
  const [viewMode, setViewMode] = useState<"tabs" | "pipeline">(() =>
    typeof window !== "undefined" && window.innerWidth >= 768 ? "pipeline" : "tabs"
  );
  const [activeTab, setActiveTab] = useState("dashboard");
  const [, navigate] = useLocation();

  function handleCardClick(card: PipelineCard) {
    navigate(`/students/${card.studentId}`);
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Evaluations & Eligibility</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1">IDEA evaluation lifecycle — referrals, evaluations, eligibility, re-evaluation tracking</p>
        </div>
        <div className="flex items-center gap-1 border border-gray-200 rounded-lg p-0.5 flex-shrink-0">
          <button
            onClick={() => setViewMode("tabs")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${viewMode === "tabs" ? "bg-emerald-600 text-white" : "text-gray-500 hover:text-gray-700"}`}
          >
            <List className="w-3.5 h-3.5" /> List
          </button>
          <button
            onClick={() => setViewMode("pipeline")}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[12px] font-medium transition-colors ${viewMode === "pipeline" ? "bg-emerald-600 text-white" : "text-gray-500 hover:text-gray-700"}`}
          >
            <Columns3 className="w-3.5 h-3.5" /> Pipeline
          </button>
        </div>
      </div>

      {viewMode === "pipeline" ? (
        <PipelineView onCardClick={handleCardClick} />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="dashboard" className="gap-1.5"><Shield className="w-3.5 h-3.5" /> Dashboard</TabsTrigger>
            <TabsTrigger value="referrals" className="gap-1.5"><FileSearch className="w-3.5 h-3.5" /> Referrals</TabsTrigger>
            <TabsTrigger value="evaluations" className="gap-1.5"><ClipboardList className="w-3.5 h-3.5" /> Evaluations</TabsTrigger>
            <TabsTrigger value="eligibility" className="gap-1.5"><Users className="w-3.5 h-3.5" /> Eligibility</TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard" className="mt-4"><EvalDashboard /></TabsContent>
          <TabsContent value="referrals" className="mt-4"><ReferralsTab /></TabsContent>
          <TabsContent value="evaluations" className="mt-4"><EvaluationsTab /></TabsContent>
          <TabsContent value="eligibility" className="mt-4"><EligibilityTab /></TabsContent>
        </Tabs>
      )}
    </div>
  );
}

interface PipelineCard {
  id: string;
  studentId: number;
  studentName: string;
  studentGrade: string | null;
  type: "referral" | "evaluation" | "eligibility";
  sourceId: number;
  status: string;
  date: string;
  detail: string;
  deadline?: string | null;
  daysUntil?: number | null;
}

function PipelineView({ onCardClick }: { onCardClick: (card: PipelineCard) => void }) {
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [eligibility, setEligibility] = useState<EligibilityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      authFetch("/api/evaluations/referrals").then(r => r.ok ? r.json() : []),
      authFetch("/api/evaluations").then(r => r.ok ? r.json() : []),
      authFetch("/api/evaluations/eligibility").then(r => r.ok ? r.json() : []),
    ]).then(([refs, evals, elig]) => {
      setReferrals(refs);
      setEvaluations(evals);
      setEligibility(elig);
    }).catch(() => toast.error("Failed to load pipeline data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {[1,2,3,4].map(i => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
    </div>
  );

  const evalsByReferralId = new Map<number, EvaluationRecord>();
  for (const ev of evaluations) {
    if (ev.referralId) evalsByReferralId.set(ev.referralId, ev);
  }

  const eligByStudentId = new Map<number, EligibilityRecord>();
  for (const el of eligibility) {
    if (!eligByStudentId.has(el.studentId)) eligByStudentId.set(el.studentId, el);
  }

  const referralCards: PipelineCard[] = referrals
    .filter(r => r.status === "open" && !evalsByReferralId.has(r.id))
    .map(r => ({
      id: `ref-${r.id}`,
      studentId: r.studentId,
      studentName: r.studentName ?? "—",
      studentGrade: r.studentGrade,
      type: "referral",
      sourceId: r.id,
      status: r.consentStatus,
      date: r.referralDate,
      detail: REFERRAL_SOURCES.find(s => s.value === r.referralSource)?.label ?? r.referralSource,
      deadline: r.evaluationDeadline,
      daysUntil: r.daysUntilDeadline,
    }));

  const inProgressCards: PipelineCard[] = evaluations
    .filter(ev => ev.status === "pending" || ev.status === "in_progress" || ev.status === "overdue")
    .map(ev => ({
      id: `eval-${ev.id}`,
      studentId: ev.studentId,
      studentName: ev.studentName ?? "—",
      studentGrade: ev.studentGrade,
      type: "evaluation",
      sourceId: ev.id,
      status: ev.status,
      date: ev.startDate ?? ev.createdAt?.slice(0, 10) ?? "",
      detail: ev.evaluationType.replace(/_/g, " "),
      deadline: ev.dueDate,
      daysUntil: ev.daysUntilDue,
    }));

  const eligByEvalId = new Map<number, EligibilityRecord>();
  for (const el of eligibility) {
    if (el.evaluationId) eligByEvalId.set(el.evaluationId, el);
  }

  const completedCards: PipelineCard[] = evaluations
    .filter(ev => ev.status === "completed")
    .filter(ev => {
      if (ev.id && eligByEvalId.has(ev.id)) return false;
      if (!ev.referralId && eligByStudentId.has(ev.studentId)) return false;
      return true;
    })
    .map(ev => ({
      id: `eval-done-${ev.id}`,
      studentId: ev.studentId,
      studentName: ev.studentName ?? "—",
      studentGrade: ev.studentGrade,
      type: "evaluation",
      sourceId: ev.id,
      status: "completed",
      date: ev.completionDate ?? "",
      detail: ev.evaluationType.replace(/_/g, " "),
    }));

  const eligCards: PipelineCard[] = eligibility.map(el => ({
    id: `elig-${el.id}`,
    studentId: el.studentId,
    studentName: el.studentName ?? "—",
    studentGrade: el.studentGrade,
    type: "eligibility",
    sourceId: el.id,
    status: el.eligible === true ? "eligible" : el.eligible === false ? "not_eligible" : "pending",
    date: el.meetingDate,
    detail: el.primaryDisability ?? "No disability specified",
  }));

  const columns = [
    { key: "referral", label: "Referral", icon: FileSearch, color: "blue", cards: referralCards },
    { key: "in_progress", label: "In Progress", icon: ClipboardList, color: "amber", cards: inProgressCards },
    { key: "completed", label: "Completed", icon: CheckCircle2, color: "emerald", cards: completedCards },
    { key: "eligibility", label: "Eligibility Determined", icon: Users, color: "purple", cards: eligCards },
  ];

  const columnColors: Record<string, { header: string; dot: string; badge: string }> = {
    blue: { header: "text-blue-700", dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-200" },
    amber: { header: "text-amber-700", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-200" },
    emerald: { header: "text-emerald-700", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    purple: { header: "text-purple-700", dot: "bg-purple-500", badge: "bg-purple-50 text-purple-700 border-purple-200" },
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {columns.map(col => {
        const colors = columnColors[col.color];
        const Icon = col.icon;
        return (
          <div key={col.key} className="bg-gray-50/60 rounded-xl border border-gray-200/60 min-h-[300px] flex flex-col">
            <div className="px-3 py-2.5 border-b border-gray-200/60 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
              <span className={`text-[12px] font-semibold ${colors.header}`}>{col.label}</span>
              <span className="ml-auto text-[11px] text-gray-400 font-medium">{col.cards.length}</span>
            </div>
            <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[600px]">
              {col.cards.length === 0 && (
                <p className="text-[11px] text-gray-400 text-center py-6">No items</p>
              )}
              {col.cards.map(card => (
                <div key={card.id} onClick={() => onCardClick(card)} className="bg-white rounded-lg border border-gray-200/80 p-3 shadow-sm hover:shadow transition-shadow cursor-pointer hover:border-gray-300">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] font-semibold text-gray-800 leading-tight">{card.studentName}</p>
                    {card.studentGrade && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 flex-shrink-0">Gr {card.studentGrade}</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 capitalize">{card.detail}</p>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <span className="text-[10px] text-gray-400">{card.date ? formatDate(card.date) : "—"}</span>
                    {card.daysUntil !== undefined && card.daysUntil !== null && (
                      deadlineBadge(card.daysUntil)
                    )}
                    {card.type === "eligibility" && (
                      card.status === "eligible"
                        ? statusBadge("Eligible", "emerald")
                        : card.status === "not_eligible"
                        ? statusBadge("Not Eligible", "red")
                        : statusBadge("Pending", "amber")
                    )}
                  </div>
                  {card.type === "referral" && (
                    <div className="mt-1.5">
                      {card.status === "obtained"
                        ? statusBadge("Consent Obtained", "emerald")
                        : card.status === "refused"
                        ? statusBadge("Consent Refused", "red")
                        : statusBadge("Consent Pending", "amber")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EvalDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch("/api/evaluations/dashboard")
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setData(d as DashboardData); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-32 w-full" />)}</div>;
  if (!data) return <p className="text-sm text-gray-400 py-8 text-center">Failed to load dashboard.</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Open Referrals" value={data.openReferrals} icon={FileSearch} color="blue" />
        <MetricCard label="Pending Consent" value={data.pendingConsent} icon={Clock} color="amber" />
        <MetricCard label="Active Evaluations" value={data.activeEvaluations} icon={ClipboardList} color="blue" />
        <MetricCard label="Overdue Evaluations" value={data.overdueEvaluations} icon={AlertTriangle} color={data.overdueEvaluations > 0 ? "red" : "emerald"} />
        <MetricCard label="Re-Evals Due (90d)" value={data.upcomingReEvaluations} icon={Calendar} color="amber" />
        <MetricCard label="Overdue Re-Evals" value={data.overdueReEvaluations} icon={Timer} color={data.overdueReEvaluations > 0 ? "red" : "emerald"} />
      </div>

      {data.overdueReferralDeadlines.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Overdue Evaluation Deadlines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.overdueReferralDeadlines.map(r => (
              <div key={r.id} className="flex items-center justify-between text-[12px] py-1.5 border-b border-gray-50 last:border-0">
                <span className="font-medium text-gray-700">{r.studentName}</span>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">Deadline: {r.deadline}</span>
                  {statusBadge(`${r.daysOverdue}d overdue`, "red")}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {data.upcomingReEvalList.length > 0 && (
        <Card className="border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold text-amber-700 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Upcoming Re-Evaluations (within 90 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.upcomingReEvalList.map(r => (
              <div key={r.id} className="flex items-center justify-between text-[12px] py-1.5 border-b border-amber-100 last:border-0">
                <div>
                  <span className="font-medium text-gray-700">{r.studentName}</span>
                  {r.primaryDisability && <span className="text-gray-400 ml-2">{r.primaryDisability}</span>}
                </div>
                <div className="flex items-center gap-3">
                  {r.nextReEvalDate && <span className="text-gray-400">Due: {formatDate(r.nextReEvalDate)}</span>}
                  {deadlineBadge(r.daysUntilReEval)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="bg-emerald-50/30 border-emerald-100">
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
              Active Timeline Rule: {data.timelineRule.label}
            </p>
            <span className="text-[10px] text-gray-400">{data.timelineRule.schoolDays} school days from consent</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-2">
            <TimelineStep step="1" label="Referral Received" desc="Parent/teacher/team submits referral" />
            <TimelineStep step="2" label="Consent Obtained" desc="Written parental consent for evaluation" />
            <TimelineStep step="3" label={`Evaluation (${data.timelineRule.schoolDays} school days)`} desc="Assessments completed within deadline" />
            <TimelineStep step="4" label="Eligibility Meeting" desc="Team determines eligibility & disability" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineStep({ step, label, desc }: { step: string; label: string; desc: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="w-6 h-6 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{step}</div>
      <div>
        <p className="text-[12px] font-semibold text-gray-700">{label}</p>
        <p className="text-[11px] text-gray-500">{desc}</p>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    gray: "bg-gray-50 text-gray-500",
  };
  return (
    <Card>
      <CardContent className="py-3 px-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colors[color] ?? colors.gray}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-gray-800 leading-tight">{value}</p>
            <p className="text-[10px] text-gray-400 leading-tight">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TeamMemberPicker({ selected, onChange }: { selected: string[]; onChange: (members: string[]) => void }) {
  const [custom, setCustom] = useState("");

  function addCustom() {
    const trimmed = custom.trim();
    if (trimmed && !selected.includes(trimmed)) {
      onChange([...selected, trimmed]);
    }
    setCustom("");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {TEAM_ROLES.map(role => (
          <button key={role} onClick={() => onChange(selected.includes(role) ? selected.filter(r => r !== role) : [...selected, role])}
            className={`px-2.5 py-1 text-[11px] rounded-full border font-medium transition-colors ${selected.includes(role) ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"}`}>
            {role}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={custom} onChange={e => setCustom(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addCustom())}
          placeholder="Add custom team member…" className="form-input flex-1" />
        <Button size="sm" variant="outline" className="text-[11px] h-7" onClick={addCustom} disabled={!custom.trim()}>Add</Button>
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map(m => (
            <span key={m} className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
              {m}
              <button onClick={() => onChange(selected.filter(r => r !== m))} className="text-emerald-400 hover:text-emerald-700">&times;</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ReferralsTab() {
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    studentId: "", referralDate: new Date().toISOString().slice(0, 10),
    referralSource: "teacher", referralSourceName: "", reason: "",
    areasOfConcern: [] as string[], consentRequestedDate: "", consentReceivedDate: "",
    consentStatus: "pending", assignedEvaluatorId: "", notes: "",
  });

  const load = useCallback(async () => {
    try {
      const [refsRes, stu, stf] = await Promise.all([
        authFetch("/api/evaluations/referrals"),
        fetchStudents(),
        fetchStaff(),
      ]);
      const refs = refsRes.ok ? await refsRes.json() : [];
      setReferrals(refs);
      setStudents(stu);
      setStaff(stf);
    } catch { toast.error("Failed to load referrals"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!form.studentId || !form.reason.trim()) { toast.error("Student and reason are required"); return; }
    setSaving(true);
    try {
      await authFetch("/api/evaluations/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          studentId: parseInt(form.studentId),
          assignedEvaluatorId: form.assignedEvaluatorId ? parseInt(form.assignedEvaluatorId) : null,
          consentRequestedDate: form.consentRequestedDate || null,
          consentReceivedDate: form.consentReceivedDate || null,
        }),
      });
      toast.success("Referral created");
      setShowAdd(false);
      setForm({ studentId: "", referralDate: new Date().toISOString().slice(0, 10), referralSource: "teacher", referralSourceName: "", reason: "", areasOfConcern: [], consentRequestedDate: "", consentReceivedDate: "", consentStatus: "pending", assignedEvaluatorId: "", notes: "" });
      load();
    } catch { toast.error("Failed to create referral"); }
    setSaving(false);
  }

  async function updateConsent(id: number, consentReceivedDate: string) {
    try {
      await authFetch(`/api/evaluations/referrals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consentReceivedDate, consentStatus: "obtained" }),
      });
      toast.success("Consent recorded — deadline calculated");
      load();
    } catch { toast.error("Failed to update consent"); }
  }

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-gray-500 font-medium">{referrals.length} referral{referrals.length !== 1 ? "s" : ""}</p>
        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8 gap-1" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="w-3 h-3" /> New Referral
        </Button>
      </div>

      {showAdd && (
        <Card className="border-emerald-200">
          <CardContent className="py-4 px-5 space-y-3">
            <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">New Referral Intake</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <FormField label="Student *">
                <select value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))} className="form-select">
                  <option value="">Select student…</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>
              </FormField>
              <FormField label="Referral Date *">
                <input type="date" value={form.referralDate} onChange={e => setForm(f => ({ ...f, referralDate: e.target.value }))} className="form-input" />
              </FormField>
              <FormField label="Referral Source *">
                <select value={form.referralSource} onChange={e => setForm(f => ({ ...f, referralSource: e.target.value }))} className="form-select">
                  {REFERRAL_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </FormField>
              <FormField label="Source Name (optional)">
                <input value={form.referralSourceName} onChange={e => setForm(f => ({ ...f, referralSourceName: e.target.value }))} placeholder="Person's name" className="form-input" />
              </FormField>
              <FormField label="Assigned Evaluator">
                <select value={form.assignedEvaluatorId} onChange={e => setForm(f => ({ ...f, assignedEvaluatorId: e.target.value }))} className="form-select">
                  <option value="">Unassigned</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>
              </FormField>
              <FormField label="Consent Status">
                <select value={form.consentStatus} onChange={e => setForm(f => ({ ...f, consentStatus: e.target.value }))} className="form-select">
                  <option value="pending">Pending</option>
                  <option value="obtained">Obtained</option>
                  <option value="refused">Refused</option>
                </select>
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Consent Requested Date">
                <input type="date" value={form.consentRequestedDate} onChange={e => setForm(f => ({ ...f, consentRequestedDate: e.target.value }))} className="form-input" />
              </FormField>
              <FormField label="Consent Received Date">
                <input type="date" value={form.consentReceivedDate} onChange={e => setForm(f => ({ ...f, consentReceivedDate: e.target.value }))} className="form-input" />
              </FormField>
            </div>
            <FormField label="Reason for Referral *">
              <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} placeholder="Describe the reason for referral…" className="form-textarea" />
            </FormField>
            <FormField label="Areas of Concern">
              <div className="flex flex-wrap gap-1.5">
                {CONCERN_AREAS.map(area => (
                  <button key={area} onClick={() => setForm(f => ({ ...f, areasOfConcern: f.areasOfConcern.includes(area) ? f.areasOfConcern.filter(a => a !== area) : [...f.areasOfConcern, area] }))}
                    className={`px-2.5 py-1 text-[11px] rounded-full border font-medium transition-colors ${form.areasOfConcern.includes(area) ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"}`}>
                    {area}
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="Notes (optional)">
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Additional notes…" className="form-textarea" />
            </FormField>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8" onClick={submit} disabled={saving}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />} Save Referral
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {referrals.length === 0 && !showAdd && (
        <EmptyState
          icon={FileSearch}
          title="No evaluation referrals yet"
          description="Create a referral to start the IDEA 60-school-day evaluation timeline for a student."
          action={{ label: "Create First Referral", onClick: () => setShowAdd(true) }}
          compact
        />
      )}

      {referrals.map(ref => (
        <Card key={ref.id} className="hover:border-gray-300 transition-colors">
          <CardContent className="py-3 px-5">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-gray-800">{ref.studentName ?? "—"}</span>
                  {ref.studentGrade && <Badge variant="outline" className="text-[10px] h-4 px-1.5">Gr {ref.studentGrade}</Badge>}
                  {referralStatusBadge(ref.status)}
                  {consentStatusBadge(ref.consentStatus)}
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Referred {formatDate(ref.referralDate)} · {REFERRAL_SOURCES.find(s => s.value === ref.referralSource)?.label ?? ref.referralSource}
                  {ref.evaluatorName ? ` · Evaluator: ${ref.evaluatorName}` : ""}
                </p>
                {ref.reason && <p className="text-[12px] text-gray-600 mt-1 line-clamp-2">{ref.reason}</p>}
                {ref.areasOfConcern?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {ref.areasOfConcern.map(a => (
                      <span key={a} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{a}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {ref.evaluationDeadline && (
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400">Eval Deadline</p>
                    <p className="text-[12px] font-semibold text-gray-700">{formatDate(ref.evaluationDeadline)}</p>
                    {deadlineBadge(ref.daysUntilDeadline)}
                  </div>
                )}
                {ref.consentStatus === "pending" && (
                  <Button size="sm" variant="outline" className="text-[11px] h-7 gap-1"
                    onClick={() => updateConsent(ref.id, new Date().toISOString().slice(0, 10))}>
                    <CheckCircle2 className="w-3 h-3" /> Record Consent
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EvaluationsTab() {
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    studentId: "", referralId: "", evaluationType: "initial",
    startDate: new Date().toISOString().slice(0, 10),
    dueDate: "", meetingDate: "", leadEvaluatorId: "",
    evaluationAreas: [] as string[], teamMembers: [] as string[], notes: "",
  });

  const load = useCallback(async () => {
    try {
      const [evalsRes, refsRes, stu, stf] = await Promise.all([
        authFetch("/api/evaluations"),
        authFetch("/api/evaluations/referrals"),
        fetchStudents(),
        fetchStaff(),
      ]);
      const evals = evalsRes.ok ? await evalsRes.json() : [];
      const refs = refsRes.ok ? await refsRes.json() : [];
      setEvaluations(evals);
      setReferrals(refs.filter((r: ReferralRecord) => r.status === "open" || r.status === "evaluation_in_progress"));
      setStudents(stu);
      setStaff(stf);
    } catch { toast.error("Failed to load evaluations"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleReferralSelect(referralId: string) {
    const ref = referrals.find(r => r.id === parseInt(referralId));
    if (ref) {
      setForm(f => ({
        ...f,
        referralId,
        studentId: String(ref.studentId),
        dueDate: ref.evaluationDeadline ?? f.dueDate,
      }));
    } else {
      setForm(f => ({ ...f, referralId }));
    }
  }

  async function submit() {
    if (!form.studentId) { toast.error("Student is required"); return; }
    setSaving(true);
    try {
      await authFetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: parseInt(form.studentId),
          referralId: form.referralId ? parseInt(form.referralId) : null,
          evaluationType: form.evaluationType,
          startDate: form.startDate || null,
          dueDate: form.dueDate || null,
          meetingDate: form.meetingDate || null,
          leadEvaluatorId: form.leadEvaluatorId ? parseInt(form.leadEvaluatorId) : null,
          evaluationAreas: form.evaluationAreas.map(a => ({ area: a, status: "pending" })),
          teamMembers: form.teamMembers,
          notes: form.notes || null,
          status: "in_progress",
        }),
      });
      toast.success("Evaluation created");
      setShowAdd(false);
      setForm({ studentId: "", referralId: "", evaluationType: "initial", startDate: new Date().toISOString().slice(0, 10), dueDate: "", meetingDate: "", leadEvaluatorId: "", evaluationAreas: [], teamMembers: [], notes: "" });
      load();
    } catch { toast.error("Failed to create evaluation"); }
    setSaving(false);
  }

  async function updateStatus(id: number, status: string) {
    try {
      const body: Record<string, string> = { status };
      if (status === "completed") body.completionDate = new Date().toISOString().slice(0, 10);
      await authFetch(`/api/evaluations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success("Evaluation updated");
      load();
    } catch { toast.error("Failed to update evaluation"); }
  }

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-gray-500 font-medium">{evaluations.length} evaluation{evaluations.length !== 1 ? "s" : ""}</p>
        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8 gap-1" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="w-3 h-3" /> New Evaluation
        </Button>
      </div>

      {showAdd && (
        <Card className="border-emerald-200">
          <CardContent className="py-4 px-5 space-y-3">
            <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">New Evaluation</p>
            {referrals.length > 0 && (
              <FormField label="Link to Referral (optional)">
                <select value={form.referralId} onChange={e => handleReferralSelect(e.target.value)} className="form-select">
                  <option value="">No linked referral</option>
                  {referrals.map(r => <option key={r.id} value={r.id}>{r.studentName ?? `Student #${r.studentId}`} — {formatDate(r.referralDate)}</option>)}
                </select>
              </FormField>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <FormField label="Student *">
                <select value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))} className="form-select">
                  <option value="">Select student…</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>
              </FormField>
              <FormField label="Evaluation Type">
                <select value={form.evaluationType} onChange={e => setForm(f => ({ ...f, evaluationType: e.target.value }))} className="form-select">
                  <option value="initial">Initial Evaluation</option>
                  <option value="reevaluation">Re-Evaluation</option>
                  <option value="independent">Independent Evaluation</option>
                </select>
              </FormField>
              <FormField label="Lead Evaluator">
                <select value={form.leadEvaluatorId} onChange={e => setForm(f => ({ ...f, leadEvaluatorId: e.target.value }))} className="form-select">
                  <option value="">Unassigned</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>
              </FormField>
              <FormField label="Start Date">
                <input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} className="form-input" />
              </FormField>
              <FormField label="Due Date">
                <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className="form-input" />
              </FormField>
              <FormField label="Meeting Date">
                <input type="date" value={form.meetingDate} onChange={e => setForm(f => ({ ...f, meetingDate: e.target.value }))} className="form-input" />
              </FormField>
            </div>
            <FormField label="Evaluation Areas">
              <div className="flex flex-wrap gap-1.5">
                {EVAL_AREAS.map(area => (
                  <button key={area} onClick={() => setForm(f => ({ ...f, evaluationAreas: f.evaluationAreas.includes(area) ? f.evaluationAreas.filter(a => a !== area) : [...f.evaluationAreas, area] }))}
                    className={`px-2.5 py-1 text-[11px] rounded-full border font-medium transition-colors ${form.evaluationAreas.includes(area) ? "bg-emerald-700 text-white border-emerald-700" : "bg-white text-gray-600 border-gray-200 hover:border-emerald-300"}`}>
                    {area}
                  </button>
                ))}
              </div>
            </FormField>
            <FormField label="Team Members">
              <TeamMemberPicker selected={form.teamMembers} onChange={members => setForm(f => ({ ...f, teamMembers: members }))} />
            </FormField>
            <FormField label="Notes">
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Additional notes…" className="form-textarea" />
            </FormField>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8" onClick={submit} disabled={saving}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />} Save Evaluation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {evaluations.length === 0 && !showAdd && (
        <Card><CardContent className="py-16 text-center">
          <ClipboardList className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No evaluations yet.</p>
        </CardContent></Card>
      )}

      {evaluations.map(ev => (
        <Card key={ev.id} className="hover:border-gray-300 transition-colors">
          <CardContent className="py-3 px-5">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-gray-800">{ev.studentName ?? "—"}</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 capitalize">{ev.evaluationType.replace(/_/g, " ")}</Badge>
                  {evalStatusBadge(ev.status)}
                  {ev.referralId && statusBadge("From Referral", "blue")}
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Started {ev.startDate ? formatDate(ev.startDate) : "—"}
                  {ev.leadEvaluatorName ? ` · Lead: ${ev.leadEvaluatorName}` : ""}
                  {ev.completionDate ? ` · Completed: ${formatDate(ev.completionDate)}` : ""}
                </p>
                {ev.evaluationAreas?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {ev.evaluationAreas.map((a, i) => (
                      <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${a.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                        {a.area}
                      </span>
                    ))}
                  </div>
                )}
                {ev.teamMembers?.length > 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">Team: {ev.teamMembers.join(", ")}</p>
                )}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {ev.dueDate && (
                  <div className="text-center">
                    <p className="text-[10px] text-gray-400">Due Date</p>
                    <p className="text-[12px] font-semibold text-gray-700">{formatDate(ev.dueDate)}</p>
                    {deadlineBadge(ev.daysUntilDue)}
                  </div>
                )}
                {(ev.status === "pending" || ev.status === "in_progress") && (
                  <Button size="sm" variant="outline" className="text-[11px] h-7 gap-1"
                    onClick={() => updateStatus(ev.id, "completed")}>
                    <CheckCircle2 className="w-3 h-3" /> Complete
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EligibilityTab() {
  const [determinations, setDeterminations] = useState<EligibilityRecord[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    studentId: "", meetingDate: new Date().toISOString().slice(0, 10),
    primaryDisability: "", secondaryDisability: "",
    eligible: "" as string, determinationBasis: "",
    determinationNotes: "", iepRequired: false,
    reEvalCycleMonths: "36", teamMembers: [] as string[],
  });

  const load = useCallback(async () => {
    try {
      const [detsRes, stu] = await Promise.all([
        authFetch("/api/evaluations/eligibility"),
        fetchStudents(),
      ]);
      const dets = detsRes.ok ? await detsRes.json() : [];
      setDeterminations(dets);
      setStudents(stu);
    } catch { toast.error("Failed to load eligibility records"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!form.studentId || !form.meetingDate) { toast.error("Student and meeting date are required"); return; }
    setSaving(true);
    try {
      await authFetch("/api/evaluations/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: parseInt(form.studentId),
          meetingDate: form.meetingDate,
          teamMembers: form.teamMembers,
          eligible: form.eligible === "true" ? true : form.eligible === "false" ? false : null,
          iepRequired: form.iepRequired,
          reEvalCycleMonths: parseInt(form.reEvalCycleMonths) || 36,
          primaryDisability: form.primaryDisability || null,
          secondaryDisability: form.secondaryDisability || null,
          determinationBasis: form.determinationBasis || null,
          determinationNotes: form.determinationNotes || null,
          status: "final",
        }),
      });
      toast.success("Eligibility determination saved");
      setShowAdd(false);
      setForm({ studentId: "", meetingDate: new Date().toISOString().slice(0, 10), primaryDisability: "", secondaryDisability: "", eligible: "", determinationBasis: "", determinationNotes: "", iepRequired: false, reEvalCycleMonths: "36", teamMembers: [] });
      load();
    } catch { toast.error("Failed to save determination"); }
    setSaving(false);
  }

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  const upcomingReEvals = determinations
    .filter(d => d.nextReEvalDate && d.daysUntilReEval !== null && d.daysUntilReEval <= 90)
    .sort((a, b) => (a.daysUntilReEval ?? 999) - (b.daysUntilReEval ?? 999));

  return (
    <div className="space-y-4">
      {upcomingReEvals.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold text-amber-700 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Upcoming Re-Evaluations (within 90 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingReEvals.map(d => (
              <div key={d.id} className="flex items-center justify-between text-[12px] py-1.5 border-b border-amber-100 last:border-0">
                <div>
                  <span className="font-medium text-gray-700">{d.studentName ?? "—"}</span>
                  <span className="text-gray-400 ml-2">{d.primaryDisability ?? "—"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">Re-eval by: {d.nextReEvalDate ? formatDate(d.nextReEvalDate) : "—"}</span>
                  {deadlineBadge(d.daysUntilReEval)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[13px] text-gray-500 font-medium">{determinations.length} determination{determinations.length !== 1 ? "s" : ""}</p>
        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8 gap-1" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="w-3 h-3" /> New Determination
        </Button>
      </div>

      {showAdd && (
        <Card className="border-emerald-200">
          <CardContent className="py-4 px-5 space-y-3">
            <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">Eligibility Determination</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <FormField label="Student *">
                <select value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))} className="form-select">
                  <option value="">Select student…</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>
              </FormField>
              <FormField label="Meeting Date *">
                <input type="date" value={form.meetingDate} onChange={e => setForm(f => ({ ...f, meetingDate: e.target.value }))} className="form-input" />
              </FormField>
              <FormField label="Eligible?">
                <select value={form.eligible} onChange={e => setForm(f => ({ ...f, eligible: e.target.value, iepRequired: e.target.value === "true" }))} className="form-select">
                  <option value="">Not determined</option>
                  <option value="true">Yes — Eligible</option>
                  <option value="false">No — Not Eligible</option>
                </select>
              </FormField>
              <FormField label="Primary Disability">
                <select value={form.primaryDisability} onChange={e => setForm(f => ({ ...f, primaryDisability: e.target.value }))} className="form-select">
                  <option value="">Select…</option>
                  {DISABILITY_CATEGORIES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </FormField>
              <FormField label="Secondary Disability">
                <select value={form.secondaryDisability} onChange={e => setForm(f => ({ ...f, secondaryDisability: e.target.value }))} className="form-select">
                  <option value="">None</option>
                  {DISABILITY_CATEGORIES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </FormField>
              <FormField label="Re-Eval Cycle">
                <select value={form.reEvalCycleMonths} onChange={e => setForm(f => ({ ...f, reEvalCycleMonths: e.target.value }))} className="form-select">
                  <option value="36">Every 3 Years (default)</option>
                  <option value="24">Every 2 Years</option>
                  <option value="12">Every Year</option>
                </select>
              </FormField>
            </div>
            <FormField label="Team Members">
              <TeamMemberPicker selected={form.teamMembers} onChange={members => setForm(f => ({ ...f, teamMembers: members }))} />
            </FormField>
            <FormField label="Determination Basis">
              <textarea value={form.determinationBasis} onChange={e => setForm(f => ({ ...f, determinationBasis: e.target.value }))} rows={2} placeholder="Basis for the eligibility decision…" className="form-textarea" />
            </FormField>
            <FormField label="Notes">
              <textarea value={form.determinationNotes} onChange={e => setForm(f => ({ ...f, determinationNotes: e.target.value }))} rows={2} placeholder="Additional notes…" className="form-textarea" />
            </FormField>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.iepRequired} onChange={e => setForm(f => ({ ...f, iepRequired: e.target.checked }))} id="iepRequired" className="rounded border-gray-300" />
              <label htmlFor="iepRequired" className="text-[12px] text-gray-600">IEP required</label>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8" onClick={submit} disabled={saving}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />} Save Determination
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {determinations.length === 0 && !showAdd && (
        <Card><CardContent className="py-16 text-center">
          <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No eligibility determinations yet.</p>
        </CardContent></Card>
      )}

      {determinations.map(det => (
        <Card key={det.id} className="hover:border-gray-300 transition-colors">
          <CardContent className="py-3 px-5">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-gray-800">{det.studentName ?? "—"}</span>
                  {det.eligible === true && statusBadge("Eligible", "emerald")}
                  {det.eligible === false && statusBadge("Not Eligible", "red")}
                  {det.eligible === null && statusBadge("Undetermined", "gray")}
                  {det.iepRequired && statusBadge("IEP Required", "blue")}
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Meeting: {formatDate(det.meetingDate)}
                  {det.primaryDisability ? ` · ${det.primaryDisability}` : ""}
                  {det.secondaryDisability ? ` / ${det.secondaryDisability}` : ""}
                </p>
                {det.teamMembers?.length > 0 && (
                  <p className="text-[10px] text-gray-400 mt-0.5">Team: {det.teamMembers.join(", ")}</p>
                )}
                {det.determinationBasis && (
                  <p className="text-[12px] text-gray-600 mt-1 line-clamp-2">{det.determinationBasis}</p>
                )}
              </div>
              {det.nextReEvalDate && (
                <div className="text-center flex-shrink-0">
                  <p className="text-[10px] text-gray-400">Next Re-Evaluation</p>
                  <p className="text-[12px] font-semibold text-gray-700">{formatDate(det.nextReEvalDate)}</p>
                  {deadlineBadge(det.daysUntilReEval)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-gray-500 font-medium block mb-1">{label}</label>
      {children}
    </div>
  );
}
