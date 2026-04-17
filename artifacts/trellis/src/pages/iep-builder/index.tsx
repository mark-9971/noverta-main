import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, ChevronRight, ChevronLeft, Users, FileText,
  Clock, TrendingUp, Loader2,
  BookOpen, MessageSquare, Briefcase,
  RefreshCw, Save,
} from "lucide-react";
import { toast } from "sonner";
import { getStudentIepBuilderContext, generateIepBuilder } from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth-fetch";
import {
  type Step, type BuilderContext, type GeneratedDraft,
  type ParentQuestionnaire, type TeacherQuestionnaire, type TransitionInput,
  EMPTY_PARENT, EMPTY_TEACHER, EMPTY_TRANSITION, API_BASE,
} from "./types";
import { StepIndicator } from "./shared";
import { Step1Context } from "./Step1Context";
import { Step2Parent } from "./Step2Parent";
import { Step3Teacher } from "./Step3Teacher";
import { Step4Transition } from "./Step4Transition";
import { Step5Generate } from "./Step5Generate";
import { printDraft as printDraftHtml } from "./printDraft";

export default function IepBuilderPage() {
  const params = useParams<{ id: string }>();
  const studentId = parseInt(params.id);
  const [step, setStep] = useState<Step>(1);
  const [context, setContext] = useState<BuilderContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<GeneratedDraft | null>(null);

  const [parent, setParent] = useState<ParentQuestionnaire>({ ...EMPTY_PARENT });
  const [teacher, setTeacher] = useState<TeacherQuestionnaire>({ ...EMPTY_TEACHER });
  const [transition, setTransition] = useState<TransitionInput>({ ...EMPTY_TRANSITION });

  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [showResumeDialog, setShowResumeDialog] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<{ wizardStep: number; formData: any; updatedAt: string } | null>(null);
  const [draftResolved, setDraftResolved] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  const saveDraft = useCallback(async (currentStep: Step, p: ParentQuestionnaire, t: TeacherQuestionnaire, tr: TransitionInput) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      const res = await authFetch(`${API_BASE}/students/${studentId}/iep-builder/draft`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wizardStep: currentStep,
          formData: { parent: p, teacher: t, transition: tr },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDraftSavedAt(data.updatedAt);
      }
    } catch {}
    isSavingRef.current = false;
  }, [studentId]);

  const deleteDraft = useCallback(async () => {
    try {
      await authFetch(`${API_BASE}/students/${studentId}/iep-builder/draft`, { method: "DELETE" });
    } catch {}
    setDraftSavedAt(null);
  }, [studentId]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const [ctxData, draftRes] = await Promise.all([
          getStudentIepBuilderContext(studentId),
          authFetch(`${API_BASE}/students/${studentId}/iep-builder/draft`).then(r => r.ok ? r.json() : null),
        ]);
        if (cancelled) return;
        setContext(ctxData as any);
        if (draftRes && draftRes.formData) {
          setPendingDraft({ wizardStep: draftRes.wizardStep, formData: draftRes.formData, updatedAt: draftRes.updatedAt });
          setShowResumeDialog(true);
        } else {
          setDraftResolved(true);
        }
      } catch {
        if (!cancelled) toast.error("Failed to load student context");
      }
      if (!cancelled) setLoading(false);
    }
    init();
    return () => { cancelled = true; };
  }, [studentId]);

  function resumeDraft() {
    if (!pendingDraft) return;
    const fd = pendingDraft.formData;
    if (fd.parent) setParent({ ...EMPTY_PARENT, ...fd.parent });
    if (fd.teacher) setTeacher({ ...EMPTY_TEACHER, ...fd.teacher });
    if (fd.transition) setTransition({ ...EMPTY_TRANSITION, ...fd.transition });
    setStep(pendingDraft.wizardStep as Step);
    setDraftSavedAt(pendingDraft.updatedAt);
    setShowResumeDialog(false);
    setPendingDraft(null);
    setDraftResolved(true);
  }

  function startFresh() {
    deleteDraft();
    setShowResumeDialog(false);
    setPendingDraft(null);
    setDraftResolved(true);
  }

  const parentRef = useRef(parent);
  const teacherRef = useRef(teacher);
  const transitionRef = useRef(transition);
  const stepRef = useRef(step);
  parentRef.current = parent;
  teacherRef.current = teacher;
  transitionRef.current = transition;
  stepRef.current = step;

  const draftResolvedRef = useRef(draftResolved);
  draftResolvedRef.current = draftResolved;

  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (!draftResolvedRef.current) return;
      saveDraft(stepRef.current, parentRef.current, teacherRef.current, transitionRef.current);
    }, 30000);
  }, [saveDraft]);

  useEffect(() => {
    if (!draftResolved) return;
    scheduleAutoSave();
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [parent, teacher, transition, draftResolved, scheduleAutoSave]);

  const changeStep = useCallback((newStep: Step) => {
    setStep(newStep);
    if (draftResolvedRef.current) {
      setTimeout(() => {
        saveDraft(newStep, parentRef.current, teacherRef.current, transitionRef.current);
      }, 0);
      scheduleAutoSave();
    }
  }, [saveDraft, scheduleAutoSave]);

  async function generate() {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
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
      deleteDraft();
    } catch {
      toast.error("Failed to generate draft. Please try again.");
      scheduleAutoSave();
    }
    setGenerating(false);
  }

  function printDraft() {
    if (!draft) return;
    printDraftHtml(draft, studentId);
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
    { n: context.needsTransition ? 5 : 4, label: "Assemble Draft", icon: FileText },
  ];
  const maxStep = context.needsTransition ? 5 : 4;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      {showResumeDialog && pendingDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Unfinished Draft Found</h2>
            <p className="text-[13px] text-gray-600 mb-1">
              You have an unfinished IEP draft from{" "}
              <span className="font-semibold">{new Date(pendingDraft.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>.
            </p>
            <p className="text-[12px] text-gray-400 mb-5">You were on step {pendingDraft.wizardStep} of the wizard.</p>
            <div className="flex gap-3">
              <Button className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white" onClick={resumeDraft}>
                <RefreshCw className="w-4 h-4 mr-2" /> Resume
              </Button>
              <Button className="flex-1" variant="outline" onClick={startFresh}>
                Start Fresh
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-6">
        <Link href={`/students/${studentId}/iep`} className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-900">IEP Annual Review Draft Builder</h1>
          <p className="text-[13px] text-gray-500">{context.student.name} · {context.nextSchoolYear.label} School Year</p>
        </div>
        {draftSavedAt && (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 bg-gray-50 rounded-lg px-2.5 py-1.5 flex-shrink-0">
            <Save className="w-3 h-3" />
            Draft saved {new Date(draftSavedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        {steps.map((s, i) => (
          <div key={s.n} className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => { if (s.n < step || (draft && step === maxStep)) changeStep(s.n as Step); }}
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
        <Button variant="outline" size="sm" onClick={() => changeStep(Math.max(1, step - 1) as Step)} disabled={step === 1}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex items-center gap-3">
          {!(step === maxStep) && (
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white"
              onClick={() => changeStep(Math.min(maxStep, step + 1) as Step)}>
              Next <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
          {step === maxStep && !draft && (
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white min-w-[140px]"
              onClick={generate} disabled={generating}>
              {generating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Assembling…</> : <><FileText className="w-4 h-4 mr-1" /> Assemble Draft</>}
            </Button>
          )}
          {step === maxStep && draft && (
            <Button size="sm" variant="outline" onClick={printDraft}>
              <Printer className="w-4 h-4 mr-1" /> Print / Save as PDF
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
