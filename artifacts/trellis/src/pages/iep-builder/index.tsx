import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, ChevronRight, ChevronLeft, Users, FileText,
  Clock, TrendingUp, Loader2, Printer,
  BookOpen, MessageSquare, Briefcase,
  RefreshCw, Save, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { getStudentIepBuilderContext, generateIepBuilder } from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
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
import { TeamNotes, type DraftComment } from "./TeamNotes";
import { useUser } from "@clerk/react";

export default function IepBuilderPage() {
  const params = useParams<{ id: string }>();
  const studentId = parseInt(params.id);
  const [, navigate] = useLocation();
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
  const [pendingDraft, setPendingDraft] = useState<{ wizardStep: number; formData: any; updatedAt: string; lastEditorName: string | null } | null>(null);
  const [draftResolved, setDraftResolved] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);

  const [presenceEditors, setPresenceEditors] = useState<{ staffId: number; name: string }[]>([]);

  const { teacherId } = useRole();
  const [staleDraftWarning, setStaleDraftWarning] = useState<{ updatedAt: string; lastEditorName: string | null } | null>(null);
  const draftSavedAtRef = useRef<string | null>(null);
  draftSavedAtRef.current = draftSavedAt;
  const [reloading, setReloading] = useState(false);

  const { user: clerkUser } = useUser();
  const currentStaffId = Number(clerkUser?.publicMetadata?.staffId) || null;
  const [comments, setComments] = useState<DraftComment[]>([]);

  useEffect(() => {
    if (isNaN(studentId)) return;
    let cancelled = false;
    async function loadComments() {
      try {
        const res = await authFetch(`${API_BASE}/students/${studentId}/iep-builder/draft/comments`);
        if (!res.ok) return;
        const data = (await res.json()) as DraftComment[];
        if (!cancelled) setComments(data);
      } catch {}
    }
    loadComments();
    return () => { cancelled = true; };
  }, [studentId]);

  const handleAddComment = useCallback((c: DraftComment) => {
    setComments(prev => [...prev, c]);
  }, []);
  const handleDeleteComment = useCallback((id: number) => {
    setComments(prev => prev.filter(c => c.id !== id));
  }, []);

  const [isDirty, setIsDirty] = useState(false);
  const isDirtyRef = useRef(false);
  // Incremented on every user edit; captured before each save to detect
  // edits that arrive while a save is in-flight.
  const changeVersionRef = useRef(0);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [pendingNavUrl, setPendingNavUrl] = useState<string | null>(null);
  const originalPushStateRef = useRef<typeof window.history.pushState | null>(null);
  const originalReplaceStateRef = useRef<typeof window.history.replaceState | null>(null);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const markDirty = useCallback(() => {
    changeVersionRef.current += 1;
    setIsDirty(true);
    isDirtyRef.current = true;
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  useEffect(() => {
    // Capture the IEP builder URL before any navigation occurs.
    // This is used in the popstate handler because by the time popstate fires,
    // window.location.href has already changed to the previous page's URL.
    const iepBuilderUrl = window.location.href;

    const originalPush = window.history.pushState.bind(window.history);
    const originalReplace = window.history.replaceState.bind(window.history);
    originalPushStateRef.current = originalPush;
    originalReplaceStateRef.current = originalReplace;

    const interceptNav = (originalFn: typeof originalPush, state: any, title: string, url?: string | URL | null) => {
      if (isDirtyRef.current) {
        setPendingNavUrl(url != null ? String(url) : null);
        setShowLeaveDialog(true);
        return;
      }
      originalFn(state, title, url);
    };

    window.history.pushState = (state: any, title: string, url?: string | URL | null) =>
      interceptNav(originalPush, state, title, url);
    window.history.replaceState = (state: any, title: string, url?: string | URL | null) =>
      interceptNav(originalReplace, state, title, url);

    const handlePopState = () => {
      if (isDirtyRef.current) {
        // Push the IEP builder URL back using the ORIGINAL pushState so we don't
        // re-enter our patch. We use `iepBuilderUrl` (captured at mount) because
        // by the time this handler runs, window.location.href is already the
        // previous page's URL — not the builder's URL.
        originalPush(null, "", iepBuilderUrl);
        setPendingNavUrl(null);
        setShowLeaveDialog(true);
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.history.pushState = originalPush;
      window.history.replaceState = originalReplace;
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const confirmLeave = useCallback(() => {
    setIsDirty(false);
    isDirtyRef.current = false;
    setShowLeaveDialog(false);
    if (pendingNavUrl !== null) {
      const url = pendingNavUrl;
      setPendingNavUrl(null);
      if (originalPushStateRef.current) {
        originalPushStateRef.current(null, "", url);
        window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
      }
    } else {
      window.history.back();
    }
  }, [pendingNavUrl]);

  const cancelLeave = useCallback(() => {
    setShowLeaveDialog(false);
    setPendingNavUrl(null);
  }, []);

  const saveDraft = useCallback(async (currentStep: Step, p: ParentQuestionnaire, t: TeacherQuestionnaire, tr: TransitionInput) => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    // Snapshot the version counter before the async request so we can
    // detect whether new edits arrived while the save was in-flight.
    const versionAtSave = changeVersionRef.current;
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
        // Only clear dirty if no new edits arrived while the save was in-flight.
        if (changeVersionRef.current === versionAtSave) {
          setIsDirty(false);
          isDirtyRef.current = false;
        }
      }
    } catch {}
    isSavingRef.current = false;
    setIsSaving(false);
  }, [studentId]);

  const saveNow = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    saveDraft(stepRef.current, parentRef.current, teacherRef.current, transitionRef.current);
  }, [saveDraft]);

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
          setPendingDraft({ wizardStep: draftRes.wizardStep, formData: draftRes.formData, updatedAt: draftRes.updatedAt, lastEditorName: draftRes.lastEditorName ?? null });
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

  useEffect(() => {
    if (isNaN(studentId)) return;
    let cancelled = false;
    const presenceUrl = `${API_BASE}/students/${studentId}/iep-builder/presence`;

    async function tick() {
      try {
        await authFetch(presenceUrl, { method: "POST" });
      } catch {}
      try {
        const res = await authFetch(presenceUrl);
        if (!res.ok) return;
        const data: unknown = await res.json();
        const rawEditors =
          data && typeof data === "object" && "editors" in data
            ? (data as { editors: unknown }).editors
            : null;
        if (!cancelled && Array.isArray(rawEditors)) {
          const next: { staffId: number; name: string }[] = [];
          for (const e of rawEditors) {
            if (
              e && typeof e === "object" &&
              typeof (e as { staffId?: unknown }).staffId === "number" &&
              typeof (e as { name?: unknown }).name === "string"
            ) {
              const ed = e as { staffId: number; name: string };
              next.push({ staffId: ed.staffId, name: ed.name });
            }
          }
          setPresenceEditors(next);
        }
      } catch {}
    }

    tick();
    const interval = setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
      try {
        authFetch(presenceUrl, { method: "DELETE", keepalive: true }).catch(() => {});
      } catch {}
    };
  }, [studentId]);

  // Poll the shared draft every 60s. If a teammate has saved a newer version
  // than our currently loaded baseline, surface a non-blocking banner so the
  // user can choose to reload (losing local edits) or continue (and overwrite).
  useEffect(() => {
    if (!draftResolved || isNaN(studentId)) return;
    let cancelled = false;
    const url = `${API_BASE}/students/${studentId}/iep-builder/draft`;

    async function poll() {
      if (isSavingRef.current) return;
      const baseline = draftSavedAtRef.current;
      if (!baseline) return;
      try {
        const res = await authFetch(url);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (!data || !data.updatedAt) return;
        const remoteNewer = new Date(data.updatedAt).getTime() > new Date(baseline).getTime();
        const differentStaff = data.staffId != null && data.staffId !== teacherId;
        if (remoteNewer && differentStaff) {
          setStaleDraftWarning({ updatedAt: data.updatedAt, lastEditorName: data.lastEditorName ?? null });
        }
      } catch {}
    }

    const interval = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [studentId, draftResolved, teacherId]);

  const reloadFromServer = useCallback(async () => {
    setReloading(true);
    try {
      const res = await authFetch(`${API_BASE}/students/${studentId}/iep-builder/draft`);
      if (!res.ok) { toast.error("Failed to reload draft"); return; }
      const data = await res.json();
      if (!data || !data.formData) { toast.error("Draft no longer available"); return; }
      const fd = data.formData;
      if (fd.parent) setParent({ ...EMPTY_PARENT, ...fd.parent });
      if (fd.teacher) setTeacher({ ...EMPTY_TEACHER, ...fd.teacher });
      if (fd.transition) setTransition({ ...EMPTY_TRANSITION, ...fd.transition });
      setStep(data.wizardStep as Step);
      setDraftSavedAt(data.updatedAt);
      setIsDirty(false);
      isDirtyRef.current = false;
      setStaleDraftWarning(null);
      toast.success("Loaded the latest draft");
    } catch {
      toast.error("Failed to reload draft");
    }
    setReloading(false);
  }, [studentId]);

  const dismissStaleWarning = useCallback(() => {
    // Bump the baseline so we don't immediately re-warn about the same revision.
    if (staleDraftWarning) setDraftSavedAt(staleDraftWarning.updatedAt);
    setStaleDraftWarning(null);
  }, [staleDraftWarning]);

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
      setIsDirty(false);
      deleteDraft();
      setComments([]);
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
    markDirty();
  }

  function setTeacherField(field: keyof TeacherQuestionnaire, value: string) {
    setTeacher(t => ({ ...t, [field]: value }));
    markDirty();
  }

  function setTeacherServiceNote(svcName: string, note: string) {
    setTeacher(t => ({ ...t, serviceChanges: { ...t.serviceChanges, [svcName]: note } }));
    markDirty();
  }

  function setTransitionField(value: TransitionInput) {
    setTransition(value);
    markDirty();
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
      {showLeaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <h2 className="text-base font-bold text-gray-900">Unsaved Changes</h2>
            </div>
            <p className="text-[13px] text-gray-600 mb-5">
              You have unsaved changes in the IEP builder. If you leave now, any changes made since the last auto-save may be lost.
            </p>
            <div className="flex gap-3">
              <Button
                className="flex-1 bg-emerald-700 hover:bg-emerald-800 text-white"
                onClick={cancelLeave}
              >
                Stay and Continue
              </Button>
              <Button className="flex-1" variant="outline" onClick={confirmLeave}>
                Leave Anyway
              </Button>
            </div>
          </div>
        </div>
      )}

      {showResumeDialog && pendingDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Shared Draft Found</h2>
            <p className="text-[13px] text-gray-600 mb-1">
              Your team has a shared IEP draft last saved{" "}
              <span className="font-semibold">{new Date(pendingDraft.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</span>
              {pendingDraft.lastEditorName && (
                <> by <span className="font-semibold">{pendingDraft.lastEditorName}</span></>
              )}.
            </p>
            <p className="text-[12px] text-gray-400 mb-5">The draft is at step {pendingDraft.wizardStep} of the wizard.</p>
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

      {staleDraftWarning && (
        <div
          className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3"
          data-testid="stale-draft-warning"
        >
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-amber-900">
              This draft was updated
              {staleDraftWarning.lastEditorName && <> by <span className="font-semibold">{staleDraftWarning.lastEditorName}</span></>}
              {" "}
              {(() => {
                const mins = Math.max(1, Math.round((Date.now() - new Date(staleDraftWarning.updatedAt).getTime()) / 60000));
                return mins < 60
                  ? `${mins} minute${mins === 1 ? "" : "s"} ago`
                  : new Date(staleDraftWarning.updatedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
              })()}
              . Reload to see the latest, or continue editing to overwrite.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white h-8"
              onClick={reloadFromServer}
              disabled={reloading}
              data-testid="stale-draft-reload"
            >
              {reloading ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1" />}
              Reload
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={dismissStaleWarning}
              data-testid="stale-draft-dismiss"
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-start sm:items-center gap-3 mb-6 flex-wrap">
        <button
          onClick={() => navigate(`/students/${studentId}/iep`)}
          className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-1 sm:mt-0"
          aria-label="Back to student IEP"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">IEP Annual Review Draft Builder</h1>
          <p className="text-[12px] sm:text-[13px] text-gray-500 truncate">{context.student.name} · {context.nextSchoolYear.label} School Year</p>
        </div>
        {presenceEditors.length > 0 && (
          <div
            className="flex items-center gap-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-2.5 py-1.5 flex-shrink-0"
            title={`${presenceEditors.map(e => e.name).join(", ")} ${presenceEditors.length === 1 ? "is" : "are"} also editing this draft`}
            data-testid="presence-indicator"
          >
            <div className="flex -space-x-1.5">
              {presenceEditors.slice(0, 3).map(e => (
                <div
                  key={e.staffId}
                  className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[9px] font-semibold flex items-center justify-center ring-2 ring-white"
                  title={e.name}
                >
                  {e.name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"}
                </div>
              ))}
            </div>
            <span className="truncate max-w-[180px]">
              {presenceEditors.length === 1
                ? `${presenceEditors[0].name} is also editing`
                : presenceEditors.length === 2
                  ? `${presenceEditors[0].name} and ${presenceEditors[1].name} are also editing`
                  : `${presenceEditors[0].name} and ${presenceEditors.length - 1} others are also editing`}
            </span>
          </div>
        )}
        {isDirty ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] text-amber-500 bg-amber-50 rounded-lg px-2.5 py-1.5">
              <Save className="w-3 h-3" />
              Unsaved changes
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={saveNow}
              disabled={isSaving}
              className="h-7 text-[11px] px-2.5"
            >
              {isSaving ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving…</>
              ) : (
                <><Save className="w-3 h-3 mr-1" /> Save now</>
              )}
            </Button>
          </div>
        ) : draftSavedAt ? (
          <div className="flex items-center gap-1.5 text-[11px] text-gray-400 bg-gray-50 rounded-lg px-2.5 py-1.5 flex-shrink-0">
            <Save className="w-3 h-3" />
            Draft saved {new Date(draftSavedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </div>
        ) : null}
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
      {step === 4 && context.needsTransition && <Step4Transition context={context} values={transition} onChange={setTransitionField} />}
      {(step === 5 || (!context.needsTransition && step === 4)) && (
        <Step5Generate draft={draft} generating={generating} onGenerate={generate} onPrint={printDraft} context={context} />
      )}

      {!draft && (
        <TeamNotes
          studentId={studentId}
          wizardStep={step}
          comments={comments}
          currentStaffId={currentStaffId}
          onAdd={handleAddComment}
          onDelete={handleDeleteComment}
        />
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
