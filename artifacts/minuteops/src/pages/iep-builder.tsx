import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  ArrowLeft, ChevronRight, ChevronLeft, Users, Target, FileText,
  CheckCircle2, AlertCircle, Clock, TrendingUp, Download, Loader2,
  Sparkles, BookOpen, MessageSquare, Briefcase, GraduationCap,
  Home, Building2, Star, RefreshCw, Info
} from "lucide-react";
import { toast } from "sonner";
import { getStudentIepBuilderContext, generateIepBuilder } from "@workspace/api-client-react";
import { saveGeneratedDocument, buildDocumentHtml, openPrintWindow, esc as escDoc, type DocumentSection } from "@/lib/print-document";

type Step = 1 | 2 | 3 | 4 | 5;

interface GoalSummary {
  id: number; goalArea: string; goalNumber: number; annualGoal: string;
  baseline: string | null; targetCriterion: string | null; serviceArea: string | null;
  progressCode: string; progressLabel: string; currentPerformance: string;
  percentCorrect: number | null; trendDirection: string; dataPoints: number;
  narrative: string | null;
  recommendation: { action: string; rationale: string; suggestedGoal: string; suggestedCriterion: string };
}

interface ServiceInfo {
  id: number; serviceTypeName: string | null; requiredMinutes: number | null;
  intervalType: string | null; deliveryType: string | null; groupSize: string | null;
  setting: string | null; compliancePercent: number | null; deliveredMinutes: number | null;
  missedSessions: number | null;
}

interface BuilderContext {
  student: {
    id: number; name: string; grade: string | null; dateOfBirth: string | null;
    age: number | null; disabilityCategory: string | null; placementType: string | null;
    primaryLanguage: string | null; schoolName: string | null;
    parentName: string | null; parentEmail: string | null; parentPhone: string | null;
  };
  currentIep: any | null;
  goalSummary: GoalSummary[];
  goalCounts: { total: number; mastered: number; sufficientProgress: number; needsAttention: number; notAddressed: number };
  services: ServiceInfo[];
  accommodations: any[];
  latestReportPeriod: string | null;
  totalDataPoints: number;
  ageAppropriateSkills: string[];
  needsTransition: boolean;
  transitionDomains: { domain: string; prompt: string }[];
  nextSchoolYear: { start: string; end: string; label: string };
  ageBand: string;
}

interface ParentQuestionnaire {
  strengthsAtHome: string;
  primaryConcerns: string;
  prioritiesForYear: string;
  learningStyle: string;
  dailyLivingSkills: string;
  studentGoals: string;
  newGoalAreas: string;
  transitionConcerns: string;
  healthChanges: string;
  additionalComments: string;
}

interface TeacherQuestionnaire {
  academicPerformance: string;
  areasOfStrength: string;
  areasOfNeed: string;
  behavioralObservations: string;
  socialEmotional: string;
  communicationSkills: string;
  selfAdvocacy: string;
  studentSelfAdvocacy: string;
  recommendedNewGoals: string;
  recommendedAccommodations: string;
  serviceChanges: Record<string, string>;
  teamDiscussionTopics: string;
  transitionNotes: string;
  responseToServices: string;
}

interface AccommodationRec {
  description: string;
  category: string;
  action: string;
}

interface TransitionDomain {
  goal: string;
  services: string;
  assessment?: string;
}

interface TransitionPlanDraft {
  domains: Record<string, TransitionDomain>;
  agencyLinkages: string;
}

interface TransitionInput {
  employment: { goal: string; services: string; assessment: string };
  postSecondary: { goal: string; services: string; assessment: string };
  independentLiving: { goal: string; services: string };
  agencyLinkages: string;
}

interface GeneratedDraft {
  studentName: string; studentId: number; generatedFor: string;
  iepStartDate: string; iepEndDate: string;
  plaafp: Record<string, string>;
  goalRecommendations: Array<{
    id: number; goalArea: string; goalNumber: number; currentGoal: string;
    progressCode: string; currentPerformance: string;
    recommendation: { action: string; rationale: string; suggestedGoal: string; suggestedCriterion: string };
  }>;
  additionalGoalSuggestions: Array<{ goalArea: string; suggestedGoal: string; rationale: string; source: string }>;
  serviceRecommendations: Array<{
    serviceType: string | null; currentMinutes: number | null; currentInterval: string | null;
    deliveryType: string | null; groupSize: string | null; setting: string | null;
    compliancePercent: number; action: string; rationale: string;
    suggestedMinutes: number | null; suggestedInterval: string | null;
  }>;
  accommodationRecommendations: AccommodationRec[];
  transitionPlan: TransitionPlanDraft | null;
  teamDiscussionNotes: string[];
  disclaimer: string;
  generatedAt: string;
}

const PROGRESS_COLORS: Record<string, { bg: string; color: string; border: string }> = {
  M:  { bg: "bg-emerald-50", color: "text-emerald-700", border: "border-emerald-200" },
  SP: { bg: "bg-blue-50", color: "text-blue-700", border: "border-blue-200" },
  IP: { bg: "bg-amber-50", color: "text-amber-700", border: "border-amber-200" },
  NP: { bg: "bg-orange-50", color: "text-orange-700", border: "border-orange-200" },
  R:  { bg: "bg-red-50", color: "text-red-700", border: "border-red-200" },
  NA: { bg: "bg-gray-50", color: "text-gray-500", border: "border-gray-200" },
};

const ACTION_COLORS: Record<string, { bg: string; label: string; color: string }> = {
  graduate:   { bg: "bg-emerald-100", label: "Graduate → Advance", color: "text-emerald-800" },
  continue:   { bg: "bg-blue-100", label: "Continue / Elevate Criterion", color: "text-blue-800" },
  modify:     { bg: "bg-amber-100", label: "Modify Approach", color: "text-amber-800" },
  reconsider: { bg: "bg-red-100", label: "Reconsider / Reassess", color: "text-red-800" },
  review:     { bg: "bg-gray-100", label: "Review Delivery", color: "text-gray-700" },
};

function Textarea({ value, onChange, placeholder, rows = 3, className = "" }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; className?: string;
}) {
  return (
    <textarea
      value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} rows={rows}
      className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none bg-white ${className}`}
    />
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-gray-700 mb-1">{label}</label>
      {hint && <p className="text-[11px] text-gray-400 mb-1.5">{hint}</p>}
      {children}
    </div>
  );
}

function StepIndicator({ step, currentStep }: { step: number; currentStep: Step }) {
  const done = step < currentStep;
  const active = step === currentStep;
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all ${
      done ? "bg-emerald-600 border-emerald-600 text-white" :
      active ? "bg-white border-emerald-600 text-emerald-600" :
      "bg-white border-gray-200 text-gray-400"
    }`}>
      {done ? <CheckCircle2 className="w-4 h-4" /> : step}
    </div>
  );
}

export default function IepBuilderPage() {
  const params = useParams<{ id: string }>();
  const studentId = parseInt(params.id);
  const [step, setStep] = useState<Step>(1);
  const [context, setContext] = useState<BuilderContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<GeneratedDraft | null>(null);
  const draftRef = useRef<HTMLDivElement>(null);

  const [parent, setParent] = useState<ParentQuestionnaire>({
    strengthsAtHome: "", primaryConcerns: "", prioritiesForYear: "", learningStyle: "",
    dailyLivingSkills: "", studentGoals: "", newGoalAreas: "", transitionConcerns: "",
    healthChanges: "", additionalComments: "",
  });

  const [teacher, setTeacher] = useState<TeacherQuestionnaire>({
    academicPerformance: "", areasOfStrength: "", areasOfNeed: "",
    behavioralObservations: "", socialEmotional: "", communicationSkills: "",
    selfAdvocacy: "", studentSelfAdvocacy: "", recommendedNewGoals: "",
    recommendedAccommodations: "", serviceChanges: {}, teamDiscussionTopics: "",
    transitionNotes: "", responseToServices: "",
  });

  const [transition, setTransition] = useState<TransitionInput>({
    employment: { goal: "", services: "", assessment: "" },
    postSecondary: { goal: "", services: "", assessment: "" },
    independentLiving: { goal: "", services: "" },
    agencyLinkages: "Department of Developmental Services (DDS), Mass Rehab Commission (MRC)",
  });

  useEffect(() => {
    getStudentIepBuilderContext(studentId).then(data => { setContext(data as any); setLoading(false); })
      .catch(() => { toast.error("Failed to load student context"); setLoading(false); });
  }, [studentId]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await generateIepBuilder(studentId, {
          parentQuestionnaire: parent,
          teacherQuestionnaire: teacher,
          transitionInput: transition,
          includeTransition: context?.needsTransition || false,
        });
      setDraft(res as any);
      setStep(5);
    } catch {
      toast.error("Failed to generate draft. Please try again.");
    }
    setGenerating(false);
  }

  function printDraft() {
    if (!draft) return;

    const goalRows = draft.goalRecommendations.map(g => {
      const a = g.recommendation;
      return `<tr>
        <td style="font-weight:bold">${escDoc(String(g.goalNumber))}</td>
        <td>${escDoc(g.goalArea)}</td>
        <td>${escDoc(g.progressCode)}</td>
        <td>${escDoc(g.currentPerformance)}</td>
        <td style="font-style:italic">${escDoc(a.action.toUpperCase())}</td>
        <td>${escDoc(a.suggestedGoal)}</td>
        <td>${escDoc(a.suggestedCriterion)}</td>
      </tr>`;
    }).join("");

    const svcRows = draft.serviceRecommendations.map(s => `<tr>
      <td>${escDoc(s.serviceType ?? "")}</td>
      <td style="text-align:center">${s.currentMinutes ?? "—"} min/${escDoc(s.currentInterval ?? "")}</td>
      <td style="text-align:center">${s.compliancePercent}%</td>
      <td style="font-style:italic">${escDoc(s.action.toUpperCase())}</td>
      <td>${escDoc(s.rationale)}</td>
    </tr>`).join("");

    const plaafpHtml = [
      draft.plaafp.academic ? `<div class="field-box"><div class="field-label">Academic Performance</div>${escDoc(draft.plaafp.academic)}</div>` : "",
      draft.plaafp.behavioral ? `<div class="field-box"><div class="field-label">Behavioral / Functional</div>${escDoc(draft.plaafp.behavioral)}</div>` : "",
      draft.plaafp.communication ? `<div class="field-box"><div class="field-label">Communication</div>${escDoc(draft.plaafp.communication)}</div>` : "",
      draft.plaafp.parentInput ? `<div class="field-box"><div class="field-label">Parent/Guardian Input</div>${escDoc(draft.plaafp.parentInput)}</div>` : "",
      draft.plaafp.studentVoice ? `<div class="field-box"><div class="field-label">Student Voice</div>${escDoc(draft.plaafp.studentVoice)}</div>` : "",
    ].filter(Boolean).join("");

    const sections: DocumentSection[] = [
      {
        heading: "Present Levels of Academic Achievement and Functional Performance (PLAAFP)",
        html: plaafpHtml || "<p>No PLAAFP data available.</p>",
      },
      {
        heading: `Goal Recommendations for ${escDoc(draft.generatedFor)}`,
        html: `<table>
          <thead><tr><th>#</th><th>Area</th><th>Code</th><th>Current Performance</th><th>Action</th><th>Suggested Goal</th><th>Criterion</th></tr></thead>
          <tbody>${goalRows}</tbody>
        </table>`,
      },
      ...(draft.additionalGoalSuggestions?.length > 0 ? [{
        heading: "Additional Goal Suggestions",
        html: draft.additionalGoalSuggestions.map(s => `
          <div class="field-box"><div class="field-label">${escDoc(s.goalArea)} <small>(${escDoc(s.source)})</small></div>
          ${escDoc(s.suggestedGoal)}<br><em style="color:#6b7280">${escDoc(s.rationale)}</em></div>
        `).join(""),
      } as DocumentSection] : []),
      {
        heading: "Service Recommendations",
        html: `<table>
          <thead><tr><th>Service</th><th>Current</th><th>Compliance</th><th>Action</th><th>Rationale</th></tr></thead>
          <tbody>${svcRows}</tbody>
        </table>`,
      },
      ...(draft.accommodationRecommendations?.length > 0 ? [{
        heading: "Accommodations",
        html: draft.accommodationRecommendations.map(a =>
          `<div style="margin:3px 0">• <strong>${escDoc(a.description)}</strong> (${escDoc(a.category)}) — ${escDoc(a.action)}</div>`
        ).join(""),
      } as DocumentSection] : []),
      ...(draft.transitionPlan ? [{
        heading: "Transition Planning",
        html: [
          ...Object.entries(draft.transitionPlan.domains || {}).map(([domain, d]) =>
            `<div class="field-box">
              <div class="field-label">${escDoc(domain)}</div>
              <div><strong>Post-Secondary Goal:</strong> ${escDoc(d.goal)}</div>
              <div><strong>Transition Services:</strong> ${escDoc(d.services)}</div>
              ${d.assessment ? `<div><strong>Assessment:</strong> ${escDoc(d.assessment)}</div>` : ""}
            </div>`
          ),
          draft.transitionPlan.agencyLinkages ? `<div class="field-box"><div class="field-label">Agency Linkages</div>${escDoc(draft.transitionPlan.agencyLinkages)}</div>` : "",
        ].filter(Boolean).join(""),
      } as DocumentSection] : []),
      ...(draft.teamDiscussionNotes?.length > 0 ? [{
        heading: "IEP Team Discussion Items",
        html: draft.teamDiscussionNotes.map(n =>
          `<div style="background:#eff6ff;padding:8px 12px;border-radius:4px;border-left:3px solid #3b82f6;margin:4px 0;font-size:11px">• ${escDoc(n)}</div>`
        ).join(""),
      } as DocumentSection] : []),
      {
        heading: "Important Notice",
        html: `<div class="notice-box"><strong>⚠ DRAFT ONLY:</strong> ${escDoc(draft.disclaimer)}</div>`,
      },
    ];

    const html = buildDocumentHtml({
      documentTitle: "IEP Annual Review — Draft Recommendations",
      documentSubtitle: `School Year: ${escDoc(draft.generatedFor)} · IEP Period: ${escDoc(draft.iepStartDate)} to ${escDoc(draft.iepEndDate)}`,
      studentName: draft.studentName,
      isDraft: true,
      watermark: "DRAFT",
      generatedDate: new Date(draft.generatedAt).toLocaleDateString(),
      sections,
      signatureLines: [
        "Case Manager / Date",
        "Parent/Guardian / Date",
        "Special Education Director / Date",
      ],
      footerHtml: `<p style="margin:3px 0">This document is a DRAFT generated by the Trellis IEP Annual Review Assistant. It requires review and approval by the full IEP team before becoming a final document. Do not distribute to families without team review.</p>`,
    });

    openPrintWindow(html);
    saveGeneratedDocument({
      studentId,
      type: "iep_draft",
      title: `IEP Annual Review Draft — ${draft.generatedFor ?? String(new Date().getFullYear())}`,
      htmlSnapshot: html,
      status: "draft",
    });
  }

  function setParentField(field: keyof ParentQuestionnaire, value: string) {
    setParent(p => ({ ...p, [field]: value }));
  }

  function setTeacherField(field: keyof TeacherQuestionnaire, value: string) {
    setTeacher(t => ({ ...t, [field]: value }));
  }

  function setTeacherServiceNote(svcName: string, note: string) {
    setTeacher(t => ({ ...t, serviceChanges: { ...t.serviceChanges, [svcName]: note } }));
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!context) {
    return (
      <div className="p-6 text-center text-gray-400">
        <p>Student not found.</p>
        <Link href="/students" className="text-emerald-700 text-sm mt-2 inline-block">← Back to Students</Link>
      </div>
    );
  }

  const steps = [
    { n: 1, label: "Context Review", icon: BookOpen },
    { n: 2, label: "Parent Input", icon: MessageSquare },
    { n: 3, label: "Teacher Input", icon: Users },
    ...(context.needsTransition ? [{ n: 4, label: "Transition", icon: Briefcase }] : []),
    { n: context.needsTransition ? 5 : 4, label: "Generate Draft", icon: Sparkles },
  ];
  const maxStep = context.needsTransition ? 5 : 4;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/students/${studentId}/iep`} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">IEP Annual Review Assistant</h1>
          <p className="text-[13px] text-gray-500">{context.student.name} · {context.nextSchoolYear.label} School Year</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { if (s.n < step || (draft && step === maxStep)) setStep(s.n as Step); }}
              className="flex items-center gap-2"
            >
              <StepIndicator step={s.n} currentStep={step} />
              <span className={`text-[12px] font-medium ${step === s.n ? "text-emerald-700" : step > s.n ? "text-gray-500" : "text-gray-400"}`}>
                {s.label}
              </span>
            </button>
            {i < steps.length - 1 && <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" />}
          </div>
        ))}
      </div>

      {step === 1 && <Step1Context context={context} />}
      {step === 2 && <Step2Parent context={context} values={parent} onChange={setParentField} />}
      {step === 3 && <Step3Teacher context={context} values={teacher} onChange={setTeacherField} onServiceNote={setTeacherServiceNote} />}
      {step === 4 && context.needsTransition && <Step4Transition context={context} values={transition} onChange={setTransition} />}
      {(step === 5 || (!context.needsTransition && step === 4)) && (
        <Step5Generate draft={draft} generating={generating} onGenerate={generate} onPrint={printDraft} context={context} />
      )}

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
        <Button variant="outline" size="sm" onClick={() => setStep(s => Math.max(1, s - 1) as Step)} disabled={step === 1}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-3">
          {!(step === maxStep) && (
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={() => setStep(s => Math.min(maxStep, s + 1) as Step)}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {step === maxStep && !draft && (
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white min-w-[140px]"
              onClick={generate} disabled={generating}>
              {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating…</> : <><Sparkles className="w-4 h-4 mr-1" /> Generate Draft</>}
            </Button>
          )}
          {step === maxStep && draft && (
            <Button size="sm" variant="outline" onClick={printDraft}>
              <Download className="w-4 h-4 mr-1" /> Print / PDF
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Step1Context({ context }: { context: BuilderContext }) {
  const { student, goalCounts, goalSummary, services, currentIep, latestReportPeriod, totalDataPoints, ageAppropriateSkills, nextSchoolYear } = context;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600" /> Student Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[12px]">
            {[
              ["Name", student.name],
              ["Grade", student.grade || "N/A"],
              ["Age", student.age !== null ? `${student.age} years old` : "N/A"],
              ["Disability Category", student.disabilityCategory || "N/A"],
              ["Placement", student.placementType || "N/A"],
              ["School", student.schoolName || "N/A"],
            ].map(([k, v]) => (
              <div key={k} className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">{k}</p>
                <p className="font-semibold text-gray-800 mt-0.5">{v}</p>
              </div>
            ))}
          </div>
          {currentIep && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
              <p className="text-[11px] text-emerald-700 font-semibold">Current IEP Period: {currentIep.iepStartDate} to {currentIep.iepEndDate}</p>
              <p className="text-[11px] text-emerald-600 mt-0.5">Next year target: {nextSchoolYear.start} to {nextSchoolYear.end}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-600" /> Goal Progress Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {latestReportPeriod && <p className="text-[11px] text-gray-400 mb-3">Based on most recent report: {latestReportPeriod} · {totalDataPoints} data sessions</p>}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            {[
              { label: "Total Goals", value: goalCounts.total, bg: "bg-gray-50", color: "text-gray-700" },
              { label: "Mastered", value: goalCounts.mastered, bg: "bg-emerald-50", color: "text-emerald-700" },
              { label: "Sufficient Progress", value: goalCounts.sufficientProgress, bg: "bg-blue-50", color: "text-blue-700" },
              { label: "Needs Attention", value: goalCounts.needsAttention, bg: "bg-amber-50", color: "text-amber-700" },
              { label: "Not Addressed", value: goalCounts.notAddressed, bg: "bg-gray-50", color: "text-gray-500" },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-lg p-2.5 text-center`}>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className={`text-[9px] font-medium mt-0.5 ${s.color}`}>{s.label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {goalSummary.map(g => {
              const c = PROGRESS_COLORS[g.progressCode] || PROGRESS_COLORS.NA;
              const a = ACTION_COLORS[g.recommendation.action] || ACTION_COLORS.review;
              return (
                <div key={g.id} className={`border ${c.border} rounded-lg p-3`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${c.bg} ${c.color}`}>{g.progressCode}</span>
                    <span className="text-[12px] font-medium text-gray-700 flex-1">{g.goalArea} — Goal {g.goalNumber}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${a.bg} ${a.color}`}>{a.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 truncate">{g.annualGoal}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{g.currentPerformance}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Service Compliance</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {services.map(s => (
            <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
              <div>
                <p className="text-[13px] font-medium text-gray-700">{s.serviceTypeName}</p>
                <p className="text-[11px] text-gray-400">{s.requiredMinutes} min/{s.intervalType} · {s.deliveryType} · {s.setting}</p>
              </div>
              {s.compliancePercent !== null ? (
                <span className={`text-[12px] font-bold ${s.compliancePercent >= 90 ? "text-emerald-700" : s.compliancePercent >= 75 ? "text-amber-600" : "text-red-600"}`}>
                  {s.compliancePercent}%
                </span>
              ) : <span className="text-[11px] text-gray-400">No data</span>}
            </div>
          ))}
          {services.length === 0 && <p className="text-[13px] text-gray-400 text-center py-4">No active services found.</p>}
        </CardContent>
      </Card>

      {ageAppropriateSkills.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
              <Star className="w-4 h-4 text-emerald-600" /> Age-Appropriate Skill Areas to Consider
              <span className="text-[10px] font-normal text-gray-400 ml-1">for age {student.age ?? "N/A"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {ageAppropriateSkills.map(skill => (
                <div key={skill} className="bg-gray-50 rounded-lg px-3 py-2 text-[12px] text-gray-700 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /> {skill}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Step2Parent({ context, values, onChange }: {
  context: BuilderContext;
  values: ParentQuestionnaire;
  onChange: (field: keyof ParentQuestionnaire, value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex gap-2">
        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-blue-700">
          This questionnaire gathers parent/guardian input for the IEP Annual Review. 
          If using a paper questionnaire, transfer responses here. All fields are optional — 
          complete what is available.
          {context.student.parentName && <span className="font-semibold"> Parent/Guardian: {context.student.parentName}</span>}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Strengths & Observations at Home</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <Field label="What are your child's strengths at home?" hint="Skills, behaviors, interests the child excels at">
            <Textarea value={values.strengthsAtHome} onChange={v => onChange("strengthsAtHome", v)} placeholder="e.g., Strong memory, loves music, helps with chores..." />
          </Field>
          <Field label="How does your child learn best?" hint="Visual, hands-on, repetition, certain environments...">
            <Textarea value={values.learningStyle} onChange={v => onChange("learningStyle", v)} placeholder="e.g., Responds well to visual supports and short task breaks..." rows={2} />
          </Field>
          <Field label="Any significant health, family, or living situation changes this year?">
            <Textarea value={values.healthChanges} onChange={v => onChange("healthChanges", v)} placeholder="e.g., New medication, moved to new home, family changes..." rows={2} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Priorities & Concerns</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <Field label="What are your primary concerns for the upcoming school year?" hint="Academic, behavioral, social, independence, etc.">
            <Textarea value={values.primaryConcerns} onChange={v => onChange("primaryConcerns", v)} placeholder="e.g., Reading comprehension has been difficult. Concerns about peer relationships..." />
          </Field>
          <Field label="What are your top priorities for your child this year?">
            <Textarea value={values.prioritiesForYear} onChange={v => onChange("prioritiesForYear", v)} placeholder="e.g., Build independent self-care skills, develop more friendships, catch up in math..." />
          </Field>
          <Field label="Are there daily living skills you'd like the school to focus on?" hint="e.g., Toileting, meal preparation, community navigation">
            <Textarea value={values.dailyLivingSkills} onChange={v => onChange("dailyLivingSkills", v)} placeholder="e.g., Needs more practice with managing belongings, packing backpack..." rows={2} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Student Voice & New Goals</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <Field label="What does your child want to work on or achieve?" hint="Student's own expressed goals or interests">
            <Textarea value={values.studentGoals} onChange={v => onChange("studentGoals", v)} placeholder="e.g., Wants to learn to read better, wants to have more friends, wants to play soccer..." rows={2} />
          </Field>
          <Field label="Are there specific goal areas you'd like added to the IEP?" hint="List areas separated by commas (e.g., Social Skills, Self-Care, Reading)">
            <Textarea value={values.newGoalAreas} onChange={v => onChange("newGoalAreas", v)} placeholder="e.g., Money management, Community safety, Self-regulation..." rows={2} />
          </Field>
        </CardContent>
      </Card>

      {context.needsTransition && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-emerald-600" /> Transition Concerns
              <span className="text-[10px] font-normal text-gray-400">Age {context.student.age} — Transition Planning Required</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <Field label="Transition concerns or goals for post-secondary life" hint="Employment, living arrangements, education after high school">
              <Textarea value={values.transitionConcerns} onChange={v => onChange("transitionConcerns", v)} placeholder="e.g., Concerned about what will happen after graduation. Would like supported employment..." />
            </Field>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Additional Comments</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <Textarea value={values.additionalComments} onChange={v => onChange("additionalComments", v)} placeholder="Any other information the team should know..." rows={2} />
        </CardContent>
      </Card>
    </div>
  );
}

function Step3Teacher({ context, values, onChange, onServiceNote }: {
  context: BuilderContext;
  values: TeacherQuestionnaire;
  onChange: (field: keyof TeacherQuestionnaire, value: string) => void;
  onServiceNote: (svc: string, note: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
        <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-amber-700">
          Complete this section based on your professional observations and direct assessment of {context.student.name}. 
          This input directly informs the PLAAFP and goal recommendations.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Academic & Functional Performance</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <Field label="Current Academic Performance" hint="Describe reading, writing, math, and other academic skill levels">
            <Textarea value={values.academicPerformance} onChange={v => onChange("academicPerformance", v)} placeholder="e.g., Reading at a 2nd grade level with supports. Decoding skills improving. Math performance at grade level for addition/subtraction..." />
          </Field>
          <Field label="Areas of Strength" hint="What does the student do well?">
            <Textarea value={values.areasOfStrength} onChange={v => onChange("areasOfStrength", v)} placeholder="e.g., Excellent memory for routines, strong visual-spatial skills, highly motivated by..." rows={2} />
          </Field>
          <Field label="Areas of Greatest Need" hint="Where does the student require the most support?">
            <Textarea value={values.areasOfNeed} onChange={v => onChange("areasOfNeed", v)} placeholder="e.g., Expressive language, fine motor skills, reading comprehension, social initiation..." rows={2} />
          </Field>
          <Field label="Response to Current Services" hint="How is the student responding to current IEP services and supports?">
            <Textarea value={values.responseToServices} onChange={v => onChange("responseToServices", v)} placeholder="e.g., Student responds well to structured ABA sessions. Speech services show measurable gains. OT recommendations implemented in classroom..." rows={2} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Behavioral & Social-Emotional</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <Field label="Behavioral Observations" hint="Frequency, intensity, patterns of target behaviors; response to behavior interventions">
            <Textarea value={values.behavioralObservations} onChange={v => onChange("behavioralObservations", v)} placeholder="e.g., Challenging behaviors have decreased since implementing sensory breaks. Remaining concerns: task refusal during writing activities..." />
          </Field>
          <Field label="Social-Emotional Functioning" hint="Peer interactions, emotional regulation, friendship skills, anxiety">
            <Textarea value={values.socialEmotional} onChange={v => onChange("socialEmotional", v)} placeholder="e.g., Student participates in structured peer activities. Difficulty initiating with peers independently. Emotional regulation improving with check-in/check-out..." rows={2} />
          </Field>
          <Field label="Communication Skills" hint="Expressive/receptive language, AAC use, pragmatics">
            <Textarea value={values.communicationSkills} onChange={v => onChange("communicationSkills", v)} placeholder="e.g., Uses device to communicate basic needs. Receptive language age-appropriate. Expressive language emerging with prompting..." rows={2} />
          </Field>
          <Field label="Self-Advocacy & Independence" hint="Does the student request help? Make choices? Self-monitor?">
            <Textarea value={values.selfAdvocacy} onChange={v => onChange("selfAdvocacy", v)} placeholder="e.g., Student can request a break when prompted. Beginning to identify own strengths..." rows={2} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Recommendations for Next IEP</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <Field label="Recommended New Goals" hint="One goal per line. Include goal area and specific objective.">
            <Textarea value={values.recommendedNewGoals} onChange={v => onChange("recommendedNewGoals", v)} rows={4}
              placeholder={`e.g.,\nSelf-care: Student will independently manage lunch tray 100% of opportunities.\nReading: Student will identify main idea from short passages with 80% accuracy.`} />
          </Field>
          <Field label="Recommended New Accommodations" hint="One accommodation per line.">
            <Textarea value={values.recommendedAccommodations} onChange={v => onChange("recommendedAccommodations", v)} rows={3}
              placeholder={`e.g.,\nExtended time (50%) on all assessments.\nPreferential seating near instruction.`} />
          </Field>
        </CardContent>
      </Card>

      {context.services.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800">Service Delivery Notes</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {context.services.map(s => (
              <div key={s.id} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[13px] font-medium text-gray-700">{s.serviceTypeName}</p>
                  {s.compliancePercent !== null && (
                    <span className={`text-[11px] font-bold ${s.compliancePercent >= 90 ? "text-emerald-700" : s.compliancePercent >= 75 ? "text-amber-600" : "text-red-600"}`}>
                      {s.compliancePercent}% compliance
                    </span>
                  )}
                </div>
                <Field label="Notes or recommended changes">
                  <Textarea rows={2} value={values.serviceChanges[s.serviceTypeName || ""] || ""}
                    onChange={v => onServiceNote(s.serviceTypeName || "", v)}
                    placeholder={`e.g., Recommend increasing to 60 min/week. Scheduling conflicts on Fridays...`} />
                </Field>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Team Meeting Topics</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <Field label="Topics to raise at the IEP Team meeting">
            <Textarea value={values.teamDiscussionTopics} onChange={v => onChange("teamDiscussionTopics", v)} rows={2}
              placeholder="e.g., Discuss change in placement, review ESY eligibility, discuss medication change impact..." />
          </Field>
          {context.needsTransition && (
            <Field label="Transition-related observations" hint="Career interests, work-readiness skills, post-secondary goals observed">
              <Textarea value={values.transitionNotes} onChange={v => onChange("transitionNotes", v)} rows={2}
                placeholder="e.g., Student has expressed interest in working with animals. Good task persistence with hands-on activities..." />
            </Field>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Step4Transition({ context, values, onChange }: {
  context: BuilderContext;
  values: TransitionInput;
  onChange: (v: TransitionInput) => void;
}) {
  const set = (domain: keyof TransitionInput, field: string, val: string) => {
    if (typeof values[domain] === "object" && values[domain] !== null) {
      onChange({ ...values, [domain]: { ...(values[domain] as any), [field]: val } });
    } else {
      onChange({ ...values, [domain]: val });
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex gap-2">
        <GraduationCap className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[12px] text-emerald-800 font-semibold">Transition Planning Required (Age {context.student.age})</p>
          <p className="text-[11px] text-emerald-700 mt-0.5">
            Per 603 CMR 28.05(4)(c), the IEP for students age 14+ must include a Transition Planning section.
            Complete the domains below based on assessment data, student/family input, and teacher observations.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-emerald-600" /> Employment / Vocational
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <Field label="Post-Secondary Employment Goal" hint="Describe the student's vocational aspirations">
            <Textarea value={values.employment.goal} onChange={v => set("employment", "goal", v)} rows={2}
              placeholder="e.g., After completing high school, the student will obtain competitive employment in a food service or retail environment with job coaching support." />
          </Field>
          <Field label="Transition Services" hint="Activities and supports that will help reach this goal">
            <Textarea value={values.employment.services} onChange={v => set("employment", "services", v)} rows={2}
              placeholder="e.g., Career exploration, job shadowing, work-based learning, vocational assessment." />
          </Field>
          <Field label="Assessment Used">
            <Textarea value={values.employment.assessment} onChange={v => set("employment", "assessment", v)} rows={1}
              placeholder="e.g., Informal interest inventory, situational assessment at school store." />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-emerald-600" /> Post-Secondary Education / Training
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <Field label="Post-Secondary Education Goal">
            <Textarea value={values.postSecondary.goal} onChange={v => set("postSecondary", "goal", v)} rows={2}
              placeholder="e.g., After high school, student will enroll in a certificate program at a local community college or vocational training program." />
          </Field>
          <Field label="Transition Services">
            <Textarea value={values.postSecondary.services} onChange={v => set("postSecondary", "services", v)} rows={2}
              placeholder="e.g., College visits, guidance counselor meetings, disability services coordination." />
          </Field>
        </CardContent>
      </Card>

      {(context.student.age !== null && context.student.age >= 16) && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
              <Home className="w-4 h-4 text-emerald-600" /> Independent Living
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <Field label="Independent Living Goal">
              <Textarea value={values.independentLiving.goal} onChange={v => set("independentLiving", "goal", v)} rows={2}
                placeholder="e.g., Student will demonstrate functional independent living skills including meal preparation, home management, and community safety." />
            </Field>
            <Field label="Transition Services">
              <Textarea value={values.independentLiving.services} onChange={v => set("independentLiving", "services", v)} rows={2}
                placeholder="e.g., Life skills instruction, community-based training, apartment living program." />
            </Field>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-emerald-600" /> Agency Linkages
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <Field label="Outside agencies to connect with" hint="State agencies, community programs, or service providers to link the student to">
            <Textarea value={values.agencyLinkages} onChange={v => onChange({ ...values, agencyLinkages: v })} rows={2}
              placeholder="e.g., Department of Developmental Services (DDS), Mass Rehab Commission (MRC), Social Security Administration..." />
          </Field>
        </CardContent>
      </Card>
    </div>
  );
}

function Step5Generate({ draft, generating, onGenerate, onPrint, context }: {
  draft: GeneratedDraft | null;
  generating: boolean;
  onGenerate: () => void;
  onPrint: () => void;
  context: BuilderContext;
}) {
  if (!draft && !generating) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <Sparkles className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-lg font-bold text-gray-800">Ready to Generate</h2>
        <p className="text-[13px] text-gray-500 max-w-md mx-auto">
          Trellis will analyze all progress data, questionnaire input, service compliance, and age-appropriate skills
          to generate a structured draft for the {context.nextSchoolYear.label} Annual IEP Review.
        </p>
        <Button className="bg-emerald-700 hover:bg-emerald-800 text-white" onClick={onGenerate}>
          <Sparkles className="w-4 h-4 mr-2" /> Generate Annual IEP Draft
        </Button>
        <p className="text-[11px] text-gray-400 max-w-sm mx-auto">All recommendations require IEP Team review. This tool assists — it does not replace — professional judgment.</p>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="text-center py-16 space-y-4">
        <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto" />
        <p className="text-[13px] text-gray-600">Analyzing progress data, questionnaire input, and service compliance…</p>
      </div>
    );
  }

  if (!draft) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-gray-800">Draft IEP Recommendations — {draft.generatedFor}</h2>
          <p className="text-[11px] text-gray-400">IEP Period: {draft.iepStartDate} to {draft.iepEndDate} · Generated {new Date(draft.generatedAt).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onGenerate}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Regenerate
          </Button>
          <Button size="sm" variant="outline" onClick={onPrint}>
            <Download className="w-3.5 h-3.5 mr-1" /> Print / PDF
          </Button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700">{draft.disclaimer}</p>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Present Levels (PLAAFP) — Draft</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {[
            { key: "academic", label: "Academic Performance" },
            { key: "behavioral", label: "Behavioral / Functional" },
            { key: "communication", label: "Communication" },
            { key: "parentInput", label: "Parent / Guardian Input" },
            { key: "studentVoice", label: "Student Voice" },
          ].map(({ key, label }) => draft.plaafp[key] ? (
            <div key={key} className="bg-gray-50 border-l-2 border-emerald-400 rounded-r-lg p-3">
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-[12px] text-gray-700 leading-relaxed">{draft.plaafp[key]}</p>
            </div>
          ) : null)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Goal Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {draft.goalRecommendations.map((g) => {
            const pc = PROGRESS_COLORS[g.progressCode] || PROGRESS_COLORS.NA;
            const ac = ACTION_COLORS[g.recommendation.action] || ACTION_COLORS.review;
            return (
              <div key={g.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${pc.bg} ${pc.color} ${pc.border}`}>{g.progressCode}</span>
                    <span className="text-[12px] font-semibold text-gray-700">Goal {g.goalNumber} — {g.goalArea}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ac.bg} ${ac.color}`}>{ac.label}</span>
                </div>
                <div className="px-3 py-2.5 space-y-2">
                  <div className="text-[11px] text-gray-400">
                    <span className="font-medium text-gray-500">Current: </span>{g.currentPerformance}
                  </div>
                  <div className="text-[11px] text-gray-500 italic">{g.recommendation.rationale}</div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded p-2.5 space-y-1">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Recommended Annual Goal</p>
                    <p className="text-[12px] text-gray-800">{g.recommendation.suggestedGoal}</p>
                    <p className="text-[11px] text-emerald-600">Criterion: {g.recommendation.suggestedCriterion}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {draft.additionalGoalSuggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800">Additional Goal Suggestions</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {draft.additionalGoalSuggestions.map((s, i) => (
              <div key={i} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-200 text-blue-800 font-medium capitalize">{s.source}</span>
                  <span className="text-[12px] font-medium text-gray-700">{s.goalArea}</span>
                </div>
                <p className="text-[12px] text-gray-700">{s.suggestedGoal}</p>
                <p className="text-[11px] text-gray-400 mt-1">{s.rationale}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Service Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {draft.serviceRecommendations.map((s, i) => {
            const isReview = s.action === "review" || s.action === "increase";
            return (
              <div key={i} className={`rounded-lg border p-3 ${isReview ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[13px] font-medium text-gray-700">{s.serviceType}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">{s.currentMinutes} min/{s.currentInterval}</span>
                    <span className={`text-[11px] font-bold ${s.compliancePercent >= 90 ? "text-emerald-700" : s.compliancePercent >= 75 ? "text-amber-600" : "text-red-600"}`}>
                      {s.compliancePercent}%
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-600">{s.rationale}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {draft.accommodationRecommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800">Accommodations</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-1.5">
              {draft.accommodationRecommendations.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-[12px] text-gray-700 bg-gray-50 rounded-lg p-2.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{a.description}</span>
                    {a.category && a.category !== "Teacher Recommended" && <span className="text-gray-400 ml-1">({a.category})</span>}
                    {a.category === "Teacher Recommended" && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 ml-1">NEW</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {draft.transitionPlan && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-emerald-600" /> Transition Plan
              {draft.transitionPlan.plannedGraduationYear && (
                <span className="text-[10px] font-normal text-gray-400">Planned graduation ~{draft.transitionPlan.plannedGraduationYear}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {Object.entries(draft.transitionPlan.domains || {}).map(([domain, d]: [string, any]) => (
              <div key={domain} className="border border-gray-200 rounded-lg p-3">
                <p className="text-[12px] font-bold text-gray-700 mb-2">{domain}</p>
                <div className="space-y-1 text-[12px] text-gray-600">
                  <p><span className="font-medium">Goal:</span> {d.goal}</p>
                  <p><span className="font-medium">Services:</span> {d.services}</p>
                  {d.assessment && <p><span className="font-medium">Assessment:</span> {d.assessment}</p>}
                </div>
              </div>
            ))}
            {draft.transitionPlan.agencyLinkages && (
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-[11px] font-medium text-gray-600">Agency Linkages: {draft.transitionPlan.agencyLinkages}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {draft.teamDiscussionNotes.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800">IEP Team Discussion Items</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {draft.teamDiscussionNotes.map((note, i) => (
              <div key={i} className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                <AlertCircle className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-[12px] text-blue-800">{note}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
