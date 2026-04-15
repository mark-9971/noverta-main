import { useState, useEffect, Fragment } from "react";
import { useListSessions, useListStudents, useListStaff, useListMissedReasons, useCreateSession, useListServiceRequirements, useUpdateSession, useDeleteSession, listIepGoals, getSession } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, CheckCircle, XCircle, RotateCcw, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock, MapPin, FileText, User, Monitor, Target, Pencil, Trash2, Save, Activity, BookOpen, BarChart3, TrendingUp, Zap } from "lucide-react";
import { toast } from "sonner";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import { QuickLogSheet } from "@/components/quick-log-sheet";

const INITIAL_FORM = {
  studentId: "",
  serviceRequirementId: "",
  staffId: "",
  sessionDate: new Date().toISOString().split("T")[0],
  startTime: "09:00",
  endTime: "10:00",
  durationMinutes: "60",
  status: "completed",
  deliveryMode: "in_person",
  location: "",
  isMakeup: false,
  missedReasonId: "",
  notes: "",
};

type GoalFormEntry = {
  iepGoalId: number;
  selected: boolean;
  notes: string;
  behaviorTargetId?: number | null;
  behaviorData?: {
    value: string;
    intervalCount: string;
    intervalsWith: string;
    hourBlock: string;
    notes: string;
  };
  programTargetId?: number | null;
  programData?: {
    trialsCorrect: string;
    trialsTotal: string;
    prompted: string;
    stepNumber: string;
    independenceLevel: string;
    promptLevelUsed: string;
    notes: string;
  };
  goalArea: string;
  annualGoal: string;
  linkedTarget?: any;
};

export default function Sessions() {
  const { teacherId } = useRole();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedData, setExpandedData] = useState<any>(null);
  const [expandLoading, setExpandLoading] = useState(false);
  const [editingSession, setEditingSession] = useState<any>(null);
  const [editForm, setEditForm] = useState({ durationMinutes: "", status: "", notes: "", location: "", missedReasonId: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [goalEntries, setGoalEntries] = useState<GoalFormEntry[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(false);
  const [editGoalEntries, setEditGoalEntries] = useState<GoalFormEntry[]>([]);
  const [editGoalsLoading, setEditGoalsLoading] = useState(false);
  const [markMissedTarget, setMarkMissedTarget] = useState<{ id: number; studentName: string; sessionDate: string } | null>(null);
  const [markMissedReason, setMarkMissedReason] = useState("");
  const [markMissedNotes, setMarkMissedNotes] = useState("");
  const [markMissedSaving, setMarkMissedSaving] = useState(false);
  const [logMakeupFor, setLogMakeupFor] = useState<{ id: number; studentId: number; studentName: string; serviceRequirementId: number | null; sessionDate: string } | null>(null);

  const { typedFilter } = useSchoolContext();
  const sessionParams = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...typedFilter,
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(statusFilter !== "all" && statusFilter !== "makeup" ? { status: statusFilter } : {}),
  };
  const { data: sessions, isLoading, isError, refetch } = useListSessions(sessionParams);
  const { data: students } = useListStudents(typedFilter);
  const { data: serviceReqs } = useListServiceRequirements(
    form.studentId ? { studentId: Number(form.studentId) } : {}
  );
  const { data: staffData } = useListStaff(typedFilter);
  const { data: missedReasonsData } = useListMissedReasons();
  const { mutateAsync: createSession } = useCreateSession();
  const updateSessionMutation = useUpdateSession();
  const deleteSessionMutation = useDeleteSession();

  const sessionList = (sessions as any[]) ?? [];
  const studentList = (students as any[]) ?? [];
  const staffAllList = (staffData as any[]) ?? [];
  const missedReasonsList = (missedReasonsData as any[]) ?? [];
  const reqList = (serviceReqs as any[]) ?? [];

  const filtered = sessionList.filter(s => {
    const matchSearch = search.trim() === "" ||
      s.studentName?.toLowerCase().includes(search.toLowerCase()) ||
      s.serviceTypeName?.toLowerCase().includes(search.toLowerCase()) ||
      s.staffName?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" ||
      (statusFilter === "makeup" ? s.isMakeup : s.status === statusFilter);
    const matchDateFrom = !dateFrom || s.sessionDate >= dateFrom;
    const matchDateTo = !dateTo || s.sessionDate <= dateTo;
    return matchSearch && matchStatus && matchDateFrom && matchDateTo;
  });

  const missedCount = sessionList.filter(s => s.status === "missed").length;
  const completedCount = sessionList.filter(s => s.status === "completed").length;
  const makeupCount = sessionList.filter(s => s.isMakeup).length;

  useEffect(() => {
    if (!form.studentId) {
      setGoalEntries([]);
      return;
    }
    setGoalsLoading(true);
    listIepGoals(Number(form.studentId), { active: "true" })
      .then((goals: any[]) => {
        setGoalEntries(goals.map(g => ({
          iepGoalId: g.id,
          selected: false,
          notes: "",
          behaviorTargetId: g.behaviorTargetId || null,
          behaviorData: g.linkedTarget?.type === "behavior" ? {
            value: "", intervalCount: "", intervalsWith: "", hourBlock: "", notes: "",
          } : undefined,
          programTargetId: g.programTargetId || null,
          programData: g.linkedTarget?.type === "program" ? {
            trialsCorrect: "", trialsTotal: "10", prompted: "0", stepNumber: "",
            independenceLevel: "", promptLevelUsed: g.linkedTarget?.currentPromptLevel || "", notes: "",
          } : undefined,
          goalArea: g.goalArea,
          annualGoal: g.annualGoal,
          linkedTarget: g.linkedTarget,
        })));
      })
      .catch(() => setGoalEntries([]))
      .finally(() => setGoalsLoading(false));
  }, [form.studentId]);

  function updateForm(field: string, value: any) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function toggleGoal(idx: number) {
    setGoalEntries(prev => prev.map((g, i) => i === idx ? { ...g, selected: !g.selected } : g));
  }

  function updateGoalEntry(idx: number, field: string, value: any) {
    setGoalEntries(prev => prev.map((g, i) => i === idx ? { ...g, [field]: value } : g));
  }

  function updateBehaviorField(idx: number, field: string, value: string) {
    setGoalEntries(prev => prev.map((g, i) => {
      if (i !== idx || !g.behaviorData) return g;
      return { ...g, behaviorData: { ...g.behaviorData, [field]: value } };
    }));
  }

  function updateProgramField(idx: number, field: string, value: string) {
    setGoalEntries(prev => prev.map((g, i) => {
      if (i !== idx || !g.programData) return g;
      return { ...g, programData: { ...g.programData, [field]: value } };
    }));
  }

  async function handleSubmit() {
    if (!form.studentId) { toast.error("Please select a student"); return; }
    if (!form.sessionDate) { toast.error("Please enter a session date"); return; }
    const dur = Number(form.durationMinutes);
    if (!dur || dur <= 0 || dur > 480) { toast.error("Duration must be between 1 and 480 minutes"); return; }
    setSubmitting(true);
    try {
      const selectedReq = reqList.find((r: any) => String(r.id) === form.serviceRequirementId);
      const selectedGoals = goalEntries.filter(g => g.selected);
      const goalData = selectedGoals.map(g => {
        const entry: any = { iepGoalId: g.iepGoalId, notes: g.notes || null };
        if (g.behaviorData && g.behaviorTargetId) {
          entry.behaviorTargetId = g.behaviorTargetId;
          entry.behaviorData = {
            value: Number(g.behaviorData.value) || 0,
            intervalCount: g.behaviorData.intervalCount ? Number(g.behaviorData.intervalCount) : null,
            intervalsWith: g.behaviorData.intervalsWith ? Number(g.behaviorData.intervalsWith) : null,
            hourBlock: g.behaviorData.hourBlock || null,
            notes: g.behaviorData.notes || null,
          };
        }
        if (g.programData && g.programTargetId) {
          entry.programTargetId = g.programTargetId;
          entry.programData = {
            trialsCorrect: Number(g.programData.trialsCorrect) || 0,
            trialsTotal: Number(g.programData.trialsTotal) || 0,
            prompted: g.programData.prompted ? Number(g.programData.prompted) : null,
            stepNumber: g.programData.stepNumber ? Number(g.programData.stepNumber) : null,
            independenceLevel: g.programData.independenceLevel || null,
            promptLevelUsed: g.programData.promptLevelUsed || null,
            notes: g.programData.notes || null,
          };
        }
        return entry;
      });

      await createSession({
        data: {
          studentId: Number(form.studentId),
          serviceRequirementId: form.serviceRequirementId ? Number(form.serviceRequirementId) : null,
          serviceTypeId: selectedReq?.serviceTypeId ?? null,
          staffId: form.staffId ? Number(form.staffId) : null,
          missedReasonId: form.missedReasonId ? Number(form.missedReasonId) : null,
          sessionDate: form.sessionDate,
          startTime: form.startTime || null,
          endTime: form.endTime || null,
          durationMinutes: Number(form.durationMinutes),
          status: form.status,
          deliveryMode: form.deliveryMode || null,
          location: form.location || null,
          isMakeup: form.isMakeup,
          makeupForId: logMakeupFor && form.isMakeup ? logMakeupFor.id : null,
          notes: form.notes || null,
          goalData: goalData.length > 0 ? goalData : undefined,
        },
      } as any);

      setShowAddModal(false);
      setForm(INITIAL_FORM);
      setGoalEntries([]);
      setLogMakeupFor(null);
      toast.success(logMakeupFor ? `Makeup session logged for ${logMakeupFor.studentName}` : "Session logged successfully");
      refetch();
    } catch (e) {
      toast.error("Failed to save session. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(session: any) {
    setEditingSession(session);
    setEditForm({
      durationMinutes: String(session.durationMinutes ?? ""),
      status: session.status ?? "completed",
      notes: session.notes ?? "",
      location: session.location ?? "",
      missedReasonId: session.missedReasonId ? String(session.missedReasonId) : "",
    });
    setEditGoalEntries([]);
    if (session.studentId) {
      setEditGoalsLoading(true);
      Promise.all([
        listIepGoals(session.studentId, { active: "true" }),
        getSession(session.id),
      ]).then(([goals, detail]: [any[], any]) => {
        const linked = detail.linkedGoals || [];
        const linkedMap = new Map<number, any>();
        for (const lg of linked) linkedMap.set(lg.id, lg);
        setEditGoalEntries(goals.map((g: any) => {
          const existing = linkedMap.get(g.id);
          const bData = existing?.behaviorData;
          const pData = existing?.programData;
          return {
            iepGoalId: g.id,
            selected: !!existing,
            notes: existing?.notes || "",
            behaviorTargetId: g.behaviorTargetId || null,
            behaviorData: g.linkedTarget?.type === "behavior" ? {
              value: bData?.value ?? "", intervalCount: bData?.intervalCount ?? "", intervalsWith: bData?.intervalsWith ?? "", hourBlock: bData?.hourBlock ?? "", notes: bData?.notes ?? "",
            } : undefined,
            programTargetId: g.programTargetId || null,
            programData: g.linkedTarget?.type === "program" ? {
              trialsCorrect: pData?.trialsCorrect ?? "", trialsTotal: pData?.trialsTotal ?? "10", prompted: pData?.prompted ?? "0", stepNumber: pData?.stepNumber ?? "",
              independenceLevel: pData?.independenceLevel ?? "", promptLevelUsed: pData?.promptLevelUsed || g.linkedTarget?.currentPromptLevel || "", notes: pData?.notes ?? "",
            } : undefined,
            goalArea: g.goalArea,
            annualGoal: g.annualGoal,
            linkedTarget: g.linkedTarget,
          };
        }));
      }).catch(() => setEditGoalEntries([])).finally(() => setEditGoalsLoading(false));
    }
  }

  async function handleEditSave() {
    if (!editingSession) return;
    const dur = Number(editForm.durationMinutes);
    if (!dur || dur <= 0 || dur > 480) { toast.error("Duration must be 1–480 minutes"); return; }
    if (editForm.status === "missed" && !editForm.missedReasonId) { toast.error("Please select a missed reason"); return; }
    setEditSaving(true);
    try {
      const body: any = {
        durationMinutes: dur,
        status: editForm.status,
        notes: editForm.notes || null,
        location: editForm.location || null,
        missedReasonId: editForm.status === "missed" && editForm.missedReasonId ? Number(editForm.missedReasonId) : null,
      };
      if (editGoalEntries.length > 0) {
        const selected = editGoalEntries.filter(g => g.selected);
        body.goalData = selected.map(g => {
          const entry: any = { iepGoalId: g.iepGoalId, notes: g.notes || null };
          if (g.behaviorData && g.behaviorTargetId) {
            entry.behaviorTargetId = g.behaviorTargetId;
            entry.behaviorData = { value: Number(g.behaviorData.value) || 0, intervalCount: g.behaviorData.intervalCount ? Number(g.behaviorData.intervalCount) : null, intervalsWith: g.behaviorData.intervalsWith ? Number(g.behaviorData.intervalsWith) : null, hourBlock: g.behaviorData.hourBlock || null, notes: g.behaviorData.notes || null };
          }
          if (g.programData && g.programTargetId) {
            entry.programTargetId = g.programTargetId;
            entry.programData = { trialsCorrect: Number(g.programData.trialsCorrect) || 0, trialsTotal: Number(g.programData.trialsTotal) || 0, prompted: g.programData.prompted ? Number(g.programData.prompted) : null, stepNumber: g.programData.stepNumber ? Number(g.programData.stepNumber) : null, independenceLevel: g.programData.independenceLevel || null, promptLevelUsed: g.programData.promptLevelUsed || null, notes: g.programData.notes || null };
          }
          return entry;
        });
      }
      await updateSessionMutation.mutateAsync({ id: editingSession.id, data: body });
      toast.success("Session updated");
      setEditingSession(null);
      refetch();
    } catch {
      toast.error("Failed to update session");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteConfirmId == null) return;
    setDeleteLoading(true);
    try {
      await deleteSessionMutation.mutateAsync({ id: deleteConfirmId });
      toast.success("Session deleted");
      setDeleteConfirmId(null);
      if (expandedId === deleteConfirmId) { setExpandedId(null); setExpandedData(null); }
      refetch();
    } catch {
      toast.error("Failed to delete session");
    } finally {
      setDeleteLoading(false);
    }
  }

  function formatDate(d: string) {
    if (!d) return "—";
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function formatTime(t: string | null) {
    if (!t) return null;
    const [h, m] = t.split(":");
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
  }

  async function toggleExpand(session: any) {
    if (expandedId === session.id) {
      setExpandedId(null);
      setExpandedData(null);
      return;
    }
    setExpandedId(session.id);
    setExpandLoading(true);
    try {
      const detail = await getSession(session.id);
      setExpandedData(detail);
    } catch {
      setExpandedData(session);
    }
    setExpandLoading(false);
  }

  async function handleMarkMissed() {
    if (!markMissedTarget || !markMissedReason) { toast.error("Please select a missed reason"); return; }
    setMarkMissedSaving(true);
    try {
      const missedData: Record<string, unknown> = { status: "missed", missedReasonId: Number(markMissedReason) };
      if (markMissedNotes.trim()) missedData.notes = markMissedNotes.trim();
      await updateSessionMutation.mutateAsync({ id: markMissedTarget.id, data: missedData });
      toast.success("Session marked as missed");
      setMarkMissedTarget(null);
      setMarkMissedReason("");
      setMarkMissedNotes("");
      refetch();
    } catch {
      toast.error("Failed to mark session as missed");
    }
    setMarkMissedSaving(false);
  }

  function openLogMakeup(session: any) {
    setLogMakeupFor({
      id: session.id,
      studentId: session.studentId,
      studentName: session.studentName ?? `Student ${session.studentId}`,
      serviceRequirementId: session.serviceRequirementId ?? null,
      sessionDate: session.sessionDate,
    });
    setForm(f => ({
      ...f,
      studentId: String(session.studentId),
      serviceRequirementId: session.serviceRequirementId ? String(session.serviceRequirementId) : "",
      status: "completed",
      isMakeup: true,
      sessionDate: new Date().toISOString().split("T")[0],
    }));
    setShowAddModal(true);
  }

  function SessionExpandedDetail({ session, detail }: { session: any; detail: any }) {
    const d = detail || session;
    const goals: any[] = d.linkedGoals || [];
    const clinicalData: any[] = d.clinicalData || [];
    const allProgram = clinicalData.flatMap((c: any) => c.programData || []);
    const allBehavior = clinicalData.flatMap((c: any) => c.behaviorData || []);
    const hasClinical = allProgram.length > 0 || allBehavior.length > 0;
    const hasRecordedData = goals.some((g: any) => g.behaviorData || g.programData);
    return (
      <div className="px-5 py-4 bg-gray-50/80 border-t border-gray-100 space-y-4">
        {expandLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400"><Clock className="w-4 h-4 animate-spin" /> Loading details...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Session Info</h4>
                <div className="space-y-1.5">
                  <DetailRow icon={<Clock className="w-3.5 h-3.5" />} label="Duration" value={`${d.durationMinutes} min`} />
                  {(d.startTime || d.endTime) && (
                    <DetailRow icon={<Clock className="w-3.5 h-3.5" />} label="Time" value={`${formatTime(d.startTime) || "—"} — ${formatTime(d.endTime) || "—"}`} />
                  )}
                  {d.location && <DetailRow icon={<MapPin className="w-3.5 h-3.5" />} label="Location" value={d.location} />}
                  {d.deliveryMode && <DetailRow icon={<Monitor className="w-3.5 h-3.5" />} label="Mode" value={d.deliveryMode === "in_person" ? "In Person" : d.deliveryMode === "remote" ? "Remote/Telehealth" : d.deliveryMode} />}
                </div>
              </div>
              <div className="md:col-span-2 space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Session Documentation</h4>
                {d.notes ? (
                  <p className="text-[13px] text-gray-700 bg-white rounded-lg p-3 border border-gray-200 leading-relaxed">{d.notes}</p>
                ) : (
                  <p className="text-[11px] text-gray-400 italic">No session notes recorded.</p>
                )}
                {d.missedReasonLabel && (
                  <div className="flex items-center gap-1.5 text-[12px] text-red-600">
                    <XCircle className="w-3.5 h-3.5" /> Missed: {d.missedReasonLabel}
                  </div>
                )}
              </div>
            </div>

            {goals.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-emerald-600" /> IEP Goals Addressed ({goals.length})
                  {hasRecordedData && <span className="text-[10px] font-normal text-emerald-600 ml-1">with data</span>}
                </h4>
                <div className="grid grid-cols-1 gap-2">
                  {goals.map((g: any) => (
                    <div key={g.id} className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 flex-shrink-0 mt-0.5">{g.goalArea}</span>
                        <p className="text-[12px] text-gray-700 leading-snug line-clamp-2 flex-1">{g.annualGoal}</p>
                      </div>
                      {g.targetCriterion && (
                        <p className="text-[10px] text-gray-400 mt-1 ml-0.5">Target: {g.targetCriterion}</p>
                      )}

                      {g.behaviorData && (
                        <div className="mt-2 bg-amber-50 rounded-md px-2.5 py-2 border border-amber-100">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Activity className="w-3 h-3 text-amber-600" />
                            <span className="text-[10px] font-semibold text-amber-700 uppercase">Behavior Data</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-[11px]">
                            <div>
                              <span className="text-amber-500">Value:</span>{" "}
                              <span className="text-slate-700 font-medium">{g.behaviorData.value}</span>
                              {g.behaviorData.measurementType && (
                                <span className="text-amber-400 ml-0.5">({g.behaviorData.measurementType})</span>
                              )}
                            </div>
                            {g.behaviorData.targetName && (
                              <div><span className="text-amber-500">Target:</span> <span className="text-slate-700">{g.behaviorData.targetName}</span></div>
                            )}
                            {g.behaviorData.goalValue && (
                              <div><span className="text-amber-500">Goal:</span> <span className="text-slate-700">{g.behaviorData.goalValue} ({g.behaviorData.targetDirection})</span></div>
                            )}
                            {g.behaviorData.notes && (
                              <div className="col-span-full"><span className="text-amber-500">Notes:</span> <span className="text-slate-600">{g.behaviorData.notes}</span></div>
                            )}
                          </div>
                        </div>
                      )}

                      {g.programData && (
                        <div className="mt-2 bg-blue-50 rounded-md px-2.5 py-2 border border-blue-100">
                          <div className="flex items-center gap-1.5 mb-1">
                            <BarChart3 className="w-3 h-3 text-blue-600" />
                            <span className="text-[10px] font-semibold text-blue-700 uppercase">Program Data</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-[11px]">
                            <div>
                              <span className="text-blue-500">Trials:</span>{" "}
                              <span className="text-slate-700 font-medium">{g.programData.trialsCorrect}/{g.programData.trialsTotal}</span>
                              {g.programData.percentCorrect && (
                                <span className="text-blue-400 ml-0.5">({g.programData.percentCorrect}%)</span>
                              )}
                            </div>
                            {g.programData.promptLevelUsed && (
                              <div><span className="text-blue-500">Prompt:</span> <span className="text-slate-700">{formatPromptLevel(g.programData.promptLevelUsed)}</span></div>
                            )}
                            {g.programData.targetName && (
                              <div><span className="text-blue-500">Program:</span> <span className="text-slate-700">{g.programData.targetName}</span></div>
                            )}
                            {g.programData.masteryCriterionPercent && (
                              <div><span className="text-blue-500">Mastery:</span> <span className="text-slate-700">{g.programData.masteryCriterionPercent}%</span></div>
                            )}
                            {g.programData.notes && (
                              <div className="col-span-full"><span className="text-blue-500">Notes:</span> <span className="text-slate-600">{g.programData.notes}</span></div>
                            )}
                          </div>
                        </div>
                      )}

                      {g.notes && (
                        <p className="text-[10px] text-slate-500 mt-1.5 ml-0.5 italic">Goal notes: {g.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {hasClinical && (
              <div className="space-y-3 border-t border-gray-200 pt-3">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-600" /> Clinical Data Recorded This Day
                </h4>

                {allProgram.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> Program Trials ({allProgram.length} targets)
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                      {allProgram.map((pd: any, i: number) => {
                        const pct = pd.percentCorrect != null ? Math.round(parseFloat(pd.percentCorrect)) : null;
                        const atMastery = pct != null && pct >= 80;
                        return (
                          <div key={pd.id ?? i} className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium text-gray-700 truncate flex-1 min-w-0">{pd.targetName || `Program #${pd.programTargetId}`}</span>
                              <span className={`text-[12px] font-bold flex-shrink-0 ${atMastery ? "text-emerald-600" : pct != null && pct >= 60 ? "text-gray-700" : "text-gray-500"}`}>
                                {pct != null ? `${pct}%` : "—"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${Math.min(100, pct ?? 0)}%`,
                                    backgroundColor: atMastery ? "#10b981" : pct != null && pct >= 60 ? "#059669" : "#d1d5db",
                                  }}
                                />
                              </div>
                              {pd.trialsCorrect != null && pd.trialsTotal != null && (
                                <span className="text-[9px] text-gray-400 flex-shrink-0">{pd.trialsCorrect}/{pd.trialsTotal}</span>
                              )}
                            </div>
                            {pd.promptLevelUsed && (
                              <p className="text-[9px] text-gray-400 mt-0.5">{pd.promptLevelUsed.replace(/_/g, " ")}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {allBehavior.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Activity className="w-3 h-3" /> Behavior Data ({allBehavior.length} targets)
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                      {allBehavior.map((bd: any, i: number) => {
                        const val = parseFloat(bd.value);
                        const isDecrease = bd.targetDirection === "decrease";
                        const isGood = isDecrease ? val <= 3 : val >= 70;
                        return (
                          <div key={bd.id ?? i} className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-medium text-gray-700 truncate flex-1 min-w-0">{bd.targetName || `Behavior #${bd.behaviorTargetId}`}</span>
                              <span className={`text-[12px] font-bold flex-shrink-0 ${isGood ? "text-emerald-600" : "text-gray-700"}`}>
                                {bd.measurementType === "percentage" || bd.measurementType === "interval"
                                  ? `${Math.round(val)}%`
                                  : Math.round(val)}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5 text-[9px] text-gray-400">
                              <span className="capitalize">{bd.measurementType}</span>
                              <span>·</span>
                              <span className={isDecrease ? "text-red-500" : "text-emerald-600"}>{isDecrease ? "↓ decrease" : "↑ increase"}</span>
                              {bd.intervalCount != null && <span>· {bd.intervalsWith}/{bd.intervalCount} intervals</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-gray-200 flex-wrap">
              <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1" onClick={() => startEdit(session)}>
                <Pencil className="w-3 h-3" /> Edit
              </Button>
              {session.status === "completed" && (
                <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-200"
                  onClick={() => { setMarkMissedReason(""); setMarkMissedTarget({ id: session.id, studentName: session.studentName ?? "", sessionDate: session.sessionDate }); }}>
                  <XCircle className="w-3 h-3" /> Mark as Missed
                </Button>
              )}
              {session.status === "missed" && (
                <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                  onClick={() => openLogMakeup(session)}>
                  <RotateCcw className="w-3 h-3" /> Log Makeup Session
                </Button>
              )}
              {session.isMakeup && session.makeupForId && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">
                  <RotateCcw className="w-2.5 h-2.5" /> Makeup for session #{session.makeupForId}
                </span>
              )}
              <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto" onClick={() => setDeleteConfirmId(session.id)}>
                <Trash2 className="w-3 h-3" /> Delete
              </Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Session Log</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1">{sessionList.length} sessions · Page {page + 1}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="text-[13px] border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex"
            onClick={() => setQuickLogOpen(true)}
          >
            <Zap className="w-3.5 h-3.5 mr-1.5" />
            <span className="hidden sm:inline">Quick </span>Log
          </Button>
          <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[13px]" onClick={() => setShowAddModal(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> <span className="hidden sm:inline">Log </span>Session
          </Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { key: "all", label: "All", count: sessionList.length },
          { key: "completed", label: "Completed", count: completedCount },
          { key: "missed", label: "Missed", count: missedCount },
          { key: "makeup", label: "Makeup", count: makeupCount },
        ].map(item => (
          <button
            key={item.key}
            aria-pressed={statusFilter === item.key}
            onClick={() => setStatusFilter(item.key)}
            className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all ${
              statusFilter === item.key ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
            }`}
          >{item.label} ({item.count})</button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-10 h-9 text-[13px] bg-white" placeholder="Search sessions..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5">
          <Input type="date" className="h-9 text-[12px] bg-white w-[140px]" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-[11px] text-gray-400">to</span>
          <Input type="date" className="h-9 text-[12px] bg-white w-[140px]" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-[11px] text-gray-400 hover:text-gray-600 px-1.5">Clear</button>
          )}
        </div>
      </div>

      <div className="md:hidden space-y-2">
        {isError ? (
          <ErrorBanner message="Failed to load sessions." onRetry={() => refetch()} />
        ) : isLoading ? (
          [...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
        ) : filtered.map(session => (
          <Card key={session.id} className="overflow-hidden">
            <button className="w-full p-3.5 text-left" onClick={() => toggleExpand(session)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-800 truncate">{session.studentName ?? `Student ${session.studentId}`}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{session.serviceTypeName ?? "—"} · {session.staffName ?? "—"}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(session.goalCount > 0) && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                      <Target className="w-2.5 h-2.5 inline mr-0.5" />{session.goalCount}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    session.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                    session.status === "missed" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                  }`}>
                    {session.status === "completed" ? <CheckCircle className="w-3 h-3" /> :
                     session.status === "missed" ? <XCircle className="w-3 h-3" /> : null}
                    {session.isMakeup ? "Makeup" : session.status}
                  </span>
                  {expandedId === session.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                <span>{formatDate(session.sessionDate)}</span>
                <span>{session.durationMinutes} min</span>
                {session.location && <span>{session.location}</span>}
              </div>
            </button>
            {expandedId === session.id && <SessionExpandedDetail session={session} detail={expandedData} />}
          </Card>
        ))}
        {!isLoading && filtered.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-12">No sessions found</p>
        )}
        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-gray-400">{filtered.length} sessions</p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-8 text-[11px]" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-[11px]" disabled={sessionList.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>
              Next <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <Card className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="w-8 px-2"></th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Student</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Provider</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Duration</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Goals</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i}>{[...Array(8)].map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                ))
              ) : filtered.map(session => (
                <Fragment key={session.id}>
                  <tr className={`hover:bg-gray-50/50 transition-colors cursor-pointer ${expandedId === session.id ? "bg-gray-50/50" : ""}`}
                    onClick={() => toggleExpand(session)}>
                    <td className="px-2 py-3 text-center">
                      {expandedId === session.id ? <ChevronUp className="w-4 h-4 text-gray-400 mx-auto" /> : <ChevronDown className="w-4 h-4 text-gray-300 mx-auto" />}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-600 whitespace-nowrap">{formatDate(session.sessionDate)}</td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-medium text-gray-800">{session.studentName ?? `Student ${session.studentId}`}</p>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-gray-500 max-w-[160px] truncate">{session.serviceTypeName ?? "—"}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-500">{session.staffName ?? "—"}</td>
                    <td className="px-4 py-3 text-[13px] text-gray-600">{session.durationMinutes} min</td>
                    <td className="px-4 py-3">
                      {session.goalCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600">
                          <Target className="w-3 h-3" /> {session.goalCount}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        session.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                        session.status === "missed" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                      }`}>
                        {session.status === "completed" ? <CheckCircle className="w-3 h-3" /> :
                         session.status === "missed" ? <XCircle className="w-3 h-3" /> : null}
                        {session.isMakeup ? <><RotateCcw className="w-3 h-3" /> Makeup</> : session.status}
                      </span>
                    </td>
                  </tr>
                  {expandedId === session.id && (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <SessionExpandedDetail session={session} detail={expandedData} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-16 text-center text-gray-400 text-sm">No sessions found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
          <p className="text-[12px] text-gray-400">Showing {filtered.length} sessions</p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> Prev
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[11px]" disabled={sessionList.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>
              Next <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </Button>
          </div>
        </div>
      </Card>

      {markMissedTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-gray-800">Mark Session as Missed</h3>
              <p className="text-sm text-gray-500 mt-1">
                {markMissedTarget.studentName} · {formatDate(markMissedTarget.sessionDate)}
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Missed Reason <span className="text-red-500">*</span></label>
              <select value={markMissedReason} onChange={e => setMarkMissedReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
                <option value="">Select reason...</option>
                {missedReasonsList.map((r: any) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes <span className="text-gray-400">(optional)</span></label>
              <textarea
                value={markMissedNotes}
                onChange={e => setMarkMissedNotes(e.target.value)}
                rows={2}
                placeholder="Additional context about why this session was missed..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setMarkMissedTarget(null); setMarkMissedNotes(""); setMarkMissedReason(""); }} disabled={markMissedSaving}>Cancel</Button>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleMarkMissed} disabled={markMissedSaving || !markMissedReason}>
                {markMissedSaving ? "Saving..." : "Mark as Missed"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this session log. This action cannot be undone and will affect compliance minute calculations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? "Deleting..." : "Delete Session"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={editingSession !== null} onOpenChange={(open) => { if (!open) setEditingSession(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">Edit Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12px] text-gray-500">Duration (min)</Label>
                <Input type="number" className="h-9 text-[13px]" value={editForm.durationMinutes} onChange={e => setEditForm(p => ({ ...p, durationMinutes: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] text-gray-500">Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="missed">Missed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {editForm.status === "missed" && (
              <div className="space-y-1.5">
                <Label className="text-[12px] text-gray-500">Missed Reason *</Label>
                <Select value={editForm.missedReasonId} onValueChange={v => setEditForm(p => ({ ...p, missedReasonId: v }))}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    {missedReasonsList.map((r: any) => (
                      <SelectItem key={r.id} value={String(r.id)}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[12px] text-gray-500">Location</Label>
              <Input className="h-9 text-[13px]" value={editForm.location} onChange={e => setEditForm(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Room 204" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-gray-500">Notes</Label>
              <Textarea className="text-[13px] resize-none" rows={3} value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            {editGoalsLoading ? (
              <div className="text-[12px] text-slate-400 py-2">Loading IEP goals...</div>
            ) : editGoalEntries.length > 0 && (
              <div className="space-y-2">
                <Label className="text-[12px] text-slate-500 flex items-center gap-1"><Target className="w-3.5 h-3.5" /> IEP Goals Addressed</Label>
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {editGoalEntries.map((g, idx) => (
                    <div key={g.iepGoalId} className={`border rounded-lg p-2 ${g.selected ? "border-indigo-300 bg-indigo-50/30" : "border-slate-200"}`}>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" checked={g.selected} onChange={() => setEditGoalEntries(prev => prev.map((ge, i) => i === idx ? { ...ge, selected: !ge.selected } : ge))} className="mt-1" />
                        <div className="flex-1 min-w-0">
                          <div className="text-[12px] font-medium text-slate-700 truncate">{g.goalArea}</div>
                          <div className="text-[11px] text-slate-500 truncate">{g.annualGoal}</div>
                          {g.linkedTarget && <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${g.linkedTarget.type === "behavior" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{g.linkedTarget.type}: {g.linkedTarget.name}</span>}
                        </div>
                      </label>
                      {g.selected && g.behaviorData && (
                        <div className="mt-2 pl-6 grid grid-cols-2 gap-2">
                          <div><Label className="text-[10px] text-amber-600">Value *</Label><Input type="number" className="h-7 text-[12px]" value={g.behaviorData.value} onChange={e => setEditGoalEntries(prev => prev.map((ge, i) => i === idx ? { ...ge, behaviorData: { ...ge.behaviorData!, value: e.target.value } } : ge))} /></div>
                          <div><Label className="text-[10px] text-amber-600">Intervals</Label><Input type="number" className="h-7 text-[12px]" value={g.behaviorData.intervalCount} onChange={e => setEditGoalEntries(prev => prev.map((ge, i) => i === idx ? { ...ge, behaviorData: { ...ge.behaviorData!, intervalCount: e.target.value } } : ge))} /></div>
                        </div>
                      )}
                      {g.selected && g.programData && (
                        <div className="mt-2 pl-6 grid grid-cols-3 gap-2">
                          <div><Label className="text-[10px] text-blue-600">Correct</Label><Input type="number" className="h-7 text-[12px]" value={g.programData.trialsCorrect} onChange={e => setEditGoalEntries(prev => prev.map((ge, i) => i === idx ? { ...ge, programData: { ...ge.programData!, trialsCorrect: e.target.value } } : ge))} /></div>
                          <div><Label className="text-[10px] text-blue-600">Total</Label><Input type="number" className="h-7 text-[12px]" value={g.programData.trialsTotal} onChange={e => setEditGoalEntries(prev => prev.map((ge, i) => i === idx ? { ...ge, programData: { ...ge.programData!, trialsTotal: e.target.value } } : ge))} /></div>
                          <div><Label className="text-[10px] text-blue-600">Prompt</Label><Input className="h-7 text-[12px]" value={g.programData.promptLevelUsed} onChange={e => setEditGoalEntries(prev => prev.map((ge, i) => i === idx ? { ...ge, programData: { ...ge.programData!, promptLevelUsed: e.target.value } } : ge))} /></div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-[12px]" onClick={() => setEditingSession(null)}>Cancel</Button>
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] gap-1" disabled={editSaving} onClick={handleEditSave}>
              <Save className="w-3.5 h-3.5" /> {editSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddModal} onOpenChange={(open) => { setShowAddModal(open); if (!open) { setLogMakeupFor(null); setForm(INITIAL_FORM); setGoalEntries([]); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">{logMakeupFor ? `Log Makeup Session — ${logMakeupFor.studentName}` : "Log Session"}</DialogTitle>
          </DialogHeader>
          {logMakeupFor && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-[12px] text-indigo-700 flex items-center gap-2">
              <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />
              Making up missed session from {formatDate(logMakeupFor.sessionDate)} — will be automatically linked.
            </div>
          )}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12px] text-gray-500">Student *</Label>
                <Select value={form.studentId} onValueChange={v => { updateForm("studentId", v); updateForm("serviceRequirementId", ""); }}>
                  <SelectTrigger className="h-10 md:h-9 text-[13px]"><SelectValue placeholder="Select student" /></SelectTrigger>
                  <SelectContent>
                    {studentList.map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] text-gray-500">Service</Label>
                <Select value={form.serviceRequirementId} onValueChange={v => updateForm("serviceRequirementId", v)} disabled={!form.studentId}>
                  <SelectTrigger className="h-10 md:h-9 text-[13px]"><SelectValue placeholder={form.studentId ? "Select service" : "Select student first"} /></SelectTrigger>
                  <SelectContent>
                    {reqList.map((r: any) => (
                      <SelectItem key={r.id} value={String(r.id)}>{r.serviceTypeName} — {r.minutesPerWeek} min/wk</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-gray-500">Provider</Label>
              <Select value={form.staffId} onValueChange={v => updateForm("staffId", v)}>
                <SelectTrigger className="h-10 md:h-9 text-[13px]"><SelectValue placeholder="Select provider" /></SelectTrigger>
                <SelectContent>
                  {staffAllList.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName} — {s.role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12px] text-gray-500">Date *</Label>
                <Input type="date" className="h-10 md:h-9 text-[13px]" value={form.sessionDate} onChange={e => updateForm("sessionDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] text-gray-500">Start Time</Label>
                <Input type="time" className="h-10 md:h-9 text-[13px]" value={form.startTime} onChange={e => updateForm("startTime", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] text-gray-500">End Time</Label>
                <Input type="time" className="h-10 md:h-9 text-[13px]" value={form.endTime} onChange={e => updateForm("endTime", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12px] text-gray-500">Duration (min) *</Label>
                <Input type="number" className="h-9 text-[13px]" value={form.durationMinutes} onChange={e => updateForm("durationMinutes", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] text-gray-500">Status *</Label>
                <Select value={form.status} onValueChange={v => updateForm("status", v)}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="missed">Missed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] text-gray-500">Mode</Label>
                <Select value={form.deliveryMode} onValueChange={v => updateForm("deliveryMode", v)}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_person">In Person</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.status === "missed" && (
              <div className="space-y-1.5">
                <Label className="text-[12px] text-gray-500">Missed Reason</Label>
                <Select value={form.missedReasonId} onValueChange={v => updateForm("missedReasonId", v)}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    {missedReasonsList.map((r: any) => (
                      <SelectItem key={r.id} value={String(r.id)}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <label className="flex items-center gap-2 text-[13px] text-gray-600 cursor-pointer">
              <input type="checkbox" checked={form.isMakeup} onChange={e => updateForm("isMakeup", e.target.checked)} className="rounded border-gray-300" />
              This is a makeup session
            </label>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-gray-500">Notes</Label>
              <Textarea className="text-[13px] resize-none" rows={2} value={form.notes} onChange={e => updateForm("notes", e.target.value)} placeholder="Optional session notes..." />
            </div>

            {form.studentId && (
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-indigo-500" />
                  <h3 className="text-sm font-semibold text-slate-700">IEP Goals Addressed</h3>
                  {goalEntries.filter(g => g.selected).length > 0 && (
                    <span className="text-[11px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">
                      {goalEntries.filter(g => g.selected).length} selected
                    </span>
                  )}
                </div>
                {goalsLoading ? (
                  <div className="flex items-center gap-2 text-[12px] text-slate-400">
                    <Clock className="w-3.5 h-3.5 animate-spin" /> Loading goals...
                  </div>
                ) : goalEntries.length === 0 ? (
                  <p className="text-[12px] text-slate-400 italic">No active IEP goals found for this student.</p>
                ) : (
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {goalEntries.map((ge, idx) => (
                      <div key={ge.iepGoalId} className={`rounded-lg border transition-all ${ge.selected ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200 bg-white"}`}>
                        <label className="flex items-start gap-2.5 p-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ge.selected}
                            onChange={() => toggleGoal(idx)}
                            className="mt-0.5 rounded border-slate-300"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600">{ge.goalArea}</span>
                              {ge.linkedTarget && (
                                <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                                  ge.linkedTarget.type === "behavior" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                                }`}>{ge.linkedTarget.type === "behavior" ? "Behavior" : "Program"}</span>
                              )}
                            </div>
                            <p className="text-[12px] text-slate-700 leading-snug mt-1 line-clamp-2">{ge.annualGoal}</p>
                          </div>
                        </label>

                        {ge.selected && (
                          <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2">
                            {ge.behaviorData && (
                              <div className="bg-amber-50 rounded-md p-2.5 border border-amber-100 space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <Activity className="w-3 h-3 text-amber-600" />
                                  <span className="text-[10px] font-semibold text-amber-700 uppercase">Behavior Data</span>
                                  {ge.linkedTarget && (
                                    <span className="text-[10px] text-amber-500">({ge.linkedTarget.measurementType})</span>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[10px] text-amber-600">Value *</Label>
                                    <Input
                                      type="number"
                                      className="h-7 text-[12px]"
                                      placeholder="0"
                                      value={ge.behaviorData.value}
                                      onChange={e => updateBehaviorField(idx, "value", e.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] text-amber-600">Intervals (count)</Label>
                                    <Input
                                      type="number"
                                      className="h-7 text-[12px]"
                                      placeholder="—"
                                      value={ge.behaviorData.intervalCount}
                                      onChange={e => updateBehaviorField(idx, "intervalCount", e.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] text-amber-600">Intervals w/ behavior</Label>
                                    <Input
                                      type="number"
                                      className="h-7 text-[12px]"
                                      placeholder="—"
                                      value={ge.behaviorData.intervalsWith}
                                      onChange={e => updateBehaviorField(idx, "intervalsWith", e.target.value)}
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-amber-600">Notes</Label>
                                  <Input
                                    className="h-7 text-[12px]"
                                    placeholder="Optional notes..."
                                    value={ge.behaviorData.notes}
                                    onChange={e => updateBehaviorField(idx, "notes", e.target.value)}
                                  />
                                </div>
                              </div>
                            )}

                            {ge.programData && (
                              <div className="bg-blue-50 rounded-md p-2.5 border border-blue-100 space-y-2">
                                <div className="flex items-center gap-1.5">
                                  <BarChart3 className="w-3 h-3 text-blue-600" />
                                  <span className="text-[10px] font-semibold text-blue-700 uppercase">Program Data</span>
                                  {ge.linkedTarget && (
                                    <span className="text-[10px] text-blue-500">({ge.linkedTarget.name})</span>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[10px] text-blue-600">Trials Correct</Label>
                                    <Input
                                      type="number"
                                      className="h-7 text-[12px]"
                                      placeholder="0"
                                      value={ge.programData.trialsCorrect}
                                      onChange={e => updateProgramField(idx, "trialsCorrect", e.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] text-blue-600">Trials Total</Label>
                                    <Input
                                      type="number"
                                      className="h-7 text-[12px]"
                                      placeholder="10"
                                      value={ge.programData.trialsTotal}
                                      onChange={e => updateProgramField(idx, "trialsTotal", e.target.value)}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] text-blue-600">Prompt Level</Label>
                                    <Select
                                      value={ge.programData.promptLevelUsed}
                                      onValueChange={v => updateProgramField(idx, "promptLevelUsed", v)}
                                    >
                                      <SelectTrigger className="h-7 text-[12px]"><SelectValue placeholder="Select" /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="full_physical">Full Physical</SelectItem>
                                        <SelectItem value="partial_physical">Partial Physical</SelectItem>
                                        <SelectItem value="model">Model</SelectItem>
                                        <SelectItem value="gestural">Gestural</SelectItem>
                                        <SelectItem value="verbal">Verbal</SelectItem>
                                        <SelectItem value="independent">Independent</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <Label className="text-[10px] text-blue-600">Independence Level</Label>
                                    <Select
                                      value={ge.programData.independenceLevel}
                                      onValueChange={v => updateProgramField(idx, "independenceLevel", v)}
                                    >
                                      <SelectTrigger className="h-7 text-[12px]"><SelectValue placeholder="Select" /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="independent">Independent</SelectItem>
                                        <SelectItem value="emerging">Emerging</SelectItem>
                                        <SelectItem value="prompted">Prompted</SelectItem>
                                        <SelectItem value="dependent">Dependent</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px] text-blue-600">Prompted Count</Label>
                                    <Input
                                      type="number"
                                      className="h-7 text-[12px]"
                                      placeholder="0"
                                      value={ge.programData.prompted}
                                      onChange={e => updateProgramField(idx, "prompted", e.target.value)}
                                    />
                                  </div>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-blue-600">Notes</Label>
                                  <Input
                                    className="h-7 text-[12px]"
                                    placeholder="Optional notes..."
                                    value={ge.programData.notes}
                                    onChange={e => updateProgramField(idx, "notes", e.target.value)}
                                  />
                                </div>
                              </div>
                            )}

                            {!ge.behaviorData && !ge.programData && (
                              <div className="space-y-1">
                                <Label className="text-[10px] text-slate-500">Goal Notes</Label>
                                <Input
                                  className="h-7 text-[12px]"
                                  placeholder="Notes for this goal..."
                                  value={ge.notes}
                                  onChange={e => updateGoalEntry(idx, "notes", e.target.value)}
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-[12px]" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" disabled={!form.studentId || !form.sessionDate || !form.durationMinutes || submitting} onClick={handleSubmit}>
              {submitting ? "Saving..." : "Log Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickLogSheet
        isOpen={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        onSuccess={() => refetch()}
        staffId={teacherId}
      />
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-400 flex-shrink-0">{icon}</span>
      <span className="text-[11px] text-gray-400 min-w-[60px]">{label}</span>
      <span className="text-[13px] text-gray-700">{value}</span>
    </div>
  );
}

function formatPromptLevel(level: string) {
  return level.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
