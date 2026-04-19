import { useState, useEffect } from "react";
import { useListSessions, useListStudents, useListStaff, useListMissedReasons, useCreateSession, useListServiceRequirements, useUpdateSession, useDeleteSession, listIepGoals, getSession } from "@workspace/api-client-react";
import type { ListSessions200, ListStudents200 } from "@workspace/api-client-react";

type SessionRow = ListSessions200["data"][number] & {
  studentName?: string | null;
  serviceTypeName?: string | null;
  staffName?: string | null;
  missedReasonLabel?: string | null;
  goalCount?: number;
};
type StudentRow = ListStudents200["data"][number];
import { Button } from "@/components/ui/button";
import { Plus, Zap } from "lucide-react";
import { toast } from "sonner";
import { useSchoolContext } from "@/lib/school-context";
import { useRole } from "@/lib/role-context";
import { useSchoolYears } from "@/lib/use-school-years";
import { QuickLogSheet } from "@/components/quick-log-sheet";

import { INITIAL_FORM } from "./types";
import type { GoalFormEntry, EditForm, MarkMissedTarget, LogMakeupFor } from "./types";
import { buildGoalData, mapGoalsFresh, mapGoalsWithExisting } from "./goalHelpers";
import { SessionFilters } from "./SessionFilters";
import { SessionList } from "./SessionList";
import { MarkMissedDialog } from "./MarkMissedDialog";
import { DeleteSessionDialog } from "./DeleteSessionDialog";
import { EditSessionDialog } from "./EditSessionDialog";
import { SessionHistoryDialog } from "./SessionHistoryDialog";
import { LogSessionDialog } from "./LogSessionDialog";

const PAGE_SIZE = 30;

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function weekStartStr(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function smartDateFrom(role: string): string {
  return role === "admin" || role === "coordinator" ? weekStartStr() : todayStr();
}

export default function Sessions({ embedded = false }: { embedded?: boolean }) {
  const { teacherId, role } = useRole();
  const canRestore = role === "admin";
  const isProvider = role !== "admin" && role !== "coordinator";
  const { typedFilter } = useSchoolContext();
  const { years: schoolYears, activeYear } = useSchoolYears();

  const [search, setSearch] = useState(""); const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState(() => smartDateFrom(role));
  const [dateTo, setDateTo] = useState(() => todayStr());
  const [selectedYearId, setSelectedYearId] = useState<string>("all");
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [studentFilter, setStudentFilter] = useState<string>("all");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("all");
  const [missedReasonFilter, setMissedReasonFilter] = useState<string>("all");
  const [showAddModal, setShowAddModal] = useState(false); const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [page, setPage] = useState(0); const [showReview, setShowReview] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM); const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedData, setExpandedData] = useState<any>(null); const [expandLoading, setExpandLoading] = useState(false);
  const [editingSession, setEditingSession] = useState<any>(null);
  const [historySessionId, setHistorySessionId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ durationMinutes: "", status: "", notes: "", location: "", missedReasonId: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null); const [deleteLoading, setDeleteLoading] = useState(false);
  const [goalEntries, setGoalEntries] = useState<GoalFormEntry[]>([]); const [goalsLoading, setGoalsLoading] = useState(false);
  const [editGoalEntries, setEditGoalEntries] = useState<GoalFormEntry[]>([]); const [editGoalsLoading, setEditGoalsLoading] = useState(false);
  const [markMissedTarget, setMarkMissedTarget] = useState<MarkMissedTarget>(null);
  const [markMissedReason, setMarkMissedReason] = useState(""); const [markMissedNotes, setMarkMissedNotes] = useState("");
  const [markMissedSaving, setMarkMissedSaving] = useState(false);
  const [logMakeupFor, setLogMakeupFor] = useState<LogMakeupFor>(null);

  useEffect(() => {
    if (activeYear && selectedYearId === "all") {
      setSelectedYearId(String(activeYear.id));
    }
  }, [activeYear]);

  const sessionParams = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...typedFilter,
    ...(dateFrom ? { dateFrom } : {}),
    ...(dateTo ? { dateTo } : {}),
    ...(statusFilter !== "all" && statusFilter !== "makeup" ? { status: statusFilter } : {}),
    ...(selectedYearId !== "all" ? { schoolYearId: Number(selectedYearId) } : {}),
    ...(providerFilter !== "all" ? { staffId: Number(providerFilter) } : {}),
    ...(studentFilter !== "all" ? { studentId: Number(studentFilter) } : {}),
  };
  const { data: sessions, isLoading, isError, refetch } = useListSessions(sessionParams);
  const { data: students } = useListStudents({ ...typedFilter, limit: "500" } as any);
  const { data: serviceReqs } = useListServiceRequirements(
    form.studentId ? { studentId: Number(form.studentId) } : {}
  );
  const { data: staffData } = useListStaff(typedFilter);
  const { data: missedReasonsData } = useListMissedReasons();
  const { mutateAsync: createSession } = useCreateSession();
  const updateSessionMutation = useUpdateSession();
  const deleteSessionMutation = useDeleteSession();

  const sessionList: SessionRow[] = (sessions?.data ?? []) as SessionRow[];
  const studentList: StudentRow[] = (students?.data ?? []) as StudentRow[];
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
    const matchServiceType = serviceTypeFilter === "all" || String(s.serviceTypeId ?? "") === serviceTypeFilter;
    const matchMissedReason = missedReasonFilter === "all" || String(s.missedReasonId ?? "") === missedReasonFilter;
    return matchSearch && matchStatus && matchDateFrom && matchDateTo && matchServiceType && matchMissedReason;
  });

  const serviceTypeOptions = (() => {
    const seen = new Map<string, string>();
    for (const s of sessionList) {
      if (s.serviceTypeId != null && s.serviceTypeName) seen.set(String(s.serviceTypeId), s.serviceTypeName);
    }
    return Array.from(seen.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  })();
  const providerOptions = (staffAllList ?? [])
    .map((p: any) => ({ id: p.id, label: `${p.firstName ?? ""} ${p.lastName ?? ""}`.trim() || `Staff ${p.id}` }))
    .sort((a: any, b: any) => a.label.localeCompare(b.label));
  const studentOptions = (studentList ?? [])
    .map((s: any) => ({ id: s.id, label: `${s.lastName ?? ""}, ${s.firstName ?? ""}`.trim() }))
    .sort((a: any, b: any) => a.label.localeCompare(b.label));
  const missedReasonOptions = (missedReasonsList ?? [])
    .map((r: any) => ({ id: r.id, label: r.label ?? r.name ?? `Reason ${r.id}` }));

  const hasActiveFilters =
    providerFilter !== "all" || studentFilter !== "all" ||
    serviceTypeFilter !== "all" || missedReasonFilter !== "all" || !!search;
  function resetFilters() {
    setProviderFilter("all"); setStudentFilter("all");
    setServiceTypeFilter("all"); setMissedReasonFilter("all");
    setSearch(""); setPage(0);
    setDateFrom(smartDateFrom(role));
    setDateTo(todayStr());
  }

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
      .then((goals: any[]) => setGoalEntries(mapGoalsFresh(goals)))
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
      const goalData = buildGoalData(goalEntries);

      await createSession({ data: {
        studentId: Number(form.studentId),
        serviceRequirementId: form.serviceRequirementId ? Number(form.serviceRequirementId) : null,
        serviceTypeId: selectedReq?.serviceTypeId ?? null,
        staffId: form.staffId ? Number(form.staffId) : null,
        missedReasonId: form.missedReasonId ? Number(form.missedReasonId) : null,
        sessionDate: form.sessionDate, startTime: form.startTime || null, endTime: form.endTime || null,
        durationMinutes: Number(form.durationMinutes), status: form.status,
        deliveryMode: form.deliveryMode || null, location: form.location || null,
        isMakeup: form.isMakeup, makeupForId: logMakeupFor && form.isMakeup ? logMakeupFor.id : null,
        notes: form.notes || null, goalData: goalData.length > 0 ? goalData : undefined,
      } } as any);

      setShowAddModal(false);
      setForm(INITIAL_FORM);
      setGoalEntries([]);
      setLogMakeupFor(null);
      setShowReview(false);
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
        setEditGoalEntries(mapGoalsWithExisting(goals, detail.linkedGoals || []));
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
        body.goalData = buildGoalData(editGoalEntries);
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

  return (
    <div className={embedded ? "space-y-4 md:space-y-6" : `p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4 md:space-y-6${!embedded && isProvider ? " pb-24 sm:pb-6" : ""}`}>
      <div className="flex items-center justify-between gap-3">
        {!embedded && (
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Session Log</h1>
            <p className="text-xs md:text-sm text-gray-400 mt-1">{sessionList.length} sessions · Page {page + 1}</p>
          </div>
        )}
        {embedded && (
          <p className="text-xs text-gray-400">{sessionList.length} sessions · Page {page + 1}</p>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          {isProvider ? (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] hidden sm:flex" onClick={() => setQuickLogOpen(true)}>
              <Zap className="w-3.5 h-3.5 mr-1.5" /> Quick Log
            </Button>
          ) : (
            <>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-[13px]" onClick={() => setQuickLogOpen(true)}>
                <Zap className="w-3.5 h-3.5 mr-1.5" /> Quick Log
              </Button>
              <Button size="sm" variant="outline" className="text-[13px]" onClick={() => setShowAddModal(true)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> <span className="hidden sm:inline">Full </span>Form
              </Button>
            </>
          )}
        </div>
      </div>

      <SessionFilters
        search={search}
        onSearch={setSearch}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        counts={{ all: sessionList.length, completed: completedCount, missed: missedCount, makeup: makeupCount }}
        selectedYearId={selectedYearId}
        onYearChange={(v) => { setSelectedYearId(v); setPage(0); }}
        schoolYears={schoolYears}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFrom={setDateFrom}
        onDateTo={setDateTo}
        providers={providerOptions}
        selectedProviderId={providerFilter}
        onProviderChange={(v) => { setProviderFilter(v); setPage(0); }}
        students={studentOptions}
        selectedStudentId={studentFilter}
        onStudentChange={(v) => { setStudentFilter(v); setPage(0); }}
        serviceTypes={serviceTypeOptions}
        selectedServiceTypeId={serviceTypeFilter}
        onServiceTypeChange={(v) => { setServiceTypeFilter(v); setPage(0); }}
        missedReasons={missedReasonOptions}
        selectedMissedReasonId={missedReasonFilter}
        onMissedReasonChange={(v) => { setMissedReasonFilter(v); setPage(0); }}
        onResetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
      />

      <SessionList
        sessions={sessionList}
        filtered={filtered}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        expandedId={expandedId}
        expandedData={expandedData}
        expandLoading={expandLoading}
        onToggleExpand={toggleExpand}
        onEdit={startEdit}
        onMarkMissed={(session) => { setMarkMissedReason(""); setMarkMissedTarget({ id: session.id, studentName: session.studentName ?? "", sessionDate: session.sessionDate }); }}
        onLogMakeup={openLogMakeup}
        onDelete={setDeleteConfirmId}
        onAddSession={() => setShowAddModal(true)}
      />

      <MarkMissedDialog
        target={markMissedTarget}
        reason={markMissedReason}
        notes={markMissedNotes}
        saving={markMissedSaving}
        missedReasonsList={missedReasonsList}
        onReasonChange={setMarkMissedReason}
        onNotesChange={setMarkMissedNotes}
        onCancel={() => { setMarkMissedTarget(null); setMarkMissedNotes(""); setMarkMissedReason(""); }}
        onConfirm={handleMarkMissed}
      />

      <DeleteSessionDialog
        open={deleteConfirmId !== null}
        loading={deleteLoading}
        onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}
        onConfirm={handleDelete}
      />

      <EditSessionDialog
        open={editingSession !== null}
        onClose={() => setEditingSession(null)}
        editForm={editForm}
        setEditForm={setEditForm}
        missedReasonsList={missedReasonsList}
        editGoalEntries={editGoalEntries}
        setEditGoalEntries={setEditGoalEntries}
        editGoalsLoading={editGoalsLoading}
        editSaving={editSaving}
        onSave={handleEditSave}
        onViewHistory={editingSession ? () => setHistorySessionId(editingSession.id) : undefined}
      />

      <SessionHistoryDialog
        sessionId={historySessionId}
        open={historySessionId !== null}
        onClose={() => setHistorySessionId(null)}
        canRestore={canRestore}
        onRestored={() => refetch()}
      />

      <LogSessionDialog
        open={showAddModal}
        onOpenChange={(open) => { setShowAddModal(open); if (!open) { setLogMakeupFor(null); setForm(INITIAL_FORM); setGoalEntries([]); setShowReview(false); } }}
        form={form}
        updateForm={updateForm}
        studentList={studentList}
        reqList={reqList}
        staffAllList={staffAllList}
        missedReasonsList={missedReasonsList}
        goalEntries={goalEntries}
        goalsLoading={goalsLoading}
        toggleGoal={toggleGoal}
        updateGoalEntry={updateGoalEntry}
        updateBehaviorField={updateBehaviorField}
        updateProgramField={updateProgramField}
        showReview={showReview}
        setShowReview={setShowReview}
        submitting={submitting}
        onSubmit={handleSubmit}
        logMakeupFor={logMakeupFor}
      />

      <QuickLogSheet
        isOpen={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        onSuccess={() => refetch()}
        staffId={teacherId}
      />

      {!embedded && isProvider && (
        <div className="fixed bottom-0 left-0 right-0 sm:hidden z-40 px-4 pb-5 pt-2 bg-white/95 backdrop-blur border-t border-gray-100">
          <button
            onClick={() => setQuickLogOpen(true)}
            className="w-full h-14 bg-emerald-600 text-white text-[16px] font-bold rounded-2xl flex items-center justify-center gap-2.5 shadow-lg active:bg-emerald-700 transition-colors"
          >
            <Zap className="w-5 h-5" />
            Quick Log Session
          </button>
        </div>
      )}
    </div>
  );
}
