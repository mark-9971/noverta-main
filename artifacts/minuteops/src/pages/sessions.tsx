import { useState, Fragment } from "react";
import { useListSessions, useListStudents, useListStaff, useListMissedReasons, useCreateSession, useListServiceRequirements } from "@workspace/api-client-react";
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
import { Plus, Search, CheckCircle, XCircle, RotateCcw, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Clock, MapPin, FileText, User, Monitor, Target, Pencil, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { useSchoolContext } from "@/lib/school-context";

const API = import.meta.env.VITE_API_URL || "";

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

export default function Sessions() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
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

  const { filterParams } = useSchoolContext();
  const sessionParams: any = { limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE), ...filterParams };
  if (dateFrom) sessionParams.dateFrom = dateFrom;
  if (dateTo) sessionParams.dateTo = dateTo;
  if (statusFilter !== "all" && statusFilter !== "makeup") sessionParams.status = statusFilter;
  const { data: sessions, isLoading, isError, refetch } = useListSessions(sessionParams);
  const { data: students } = useListStudents({ ...filterParams } as any);
  const { data: serviceReqs } = useListServiceRequirements(
    form.studentId ? { studentId: Number(form.studentId) } as any : ({} as any)
  );
  const { data: staffData } = useListStaff({ ...filterParams } as any);
  const { data: missedReasonsData } = useListMissedReasons();
  const { mutateAsync: createSession } = useCreateSession();

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

  function updateForm(field: string, value: any) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    if (!form.studentId) { toast.error("Please select a student"); return; }
    if (!form.sessionDate) { toast.error("Please enter a session date"); return; }
    const dur = Number(form.durationMinutes);
    if (!dur || dur <= 0 || dur > 480) { toast.error("Duration must be between 1 and 480 minutes"); return; }
    setSubmitting(true);
    try {
      const selectedReq = reqList.find((r: any) => String(r.id) === form.serviceRequirementId);
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
          notes: form.notes || null,
        },
      } as any);
      setShowAddModal(false);
      setForm(INITIAL_FORM);
      toast.success("Session logged successfully");
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
      const res = await fetch(`${API}/api/sessions/${editingSession.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
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
      const res = await fetch(`${API}/api/sessions/${deleteConfirmId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
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
      const res = await fetch(`${API}/api/sessions/${session.id}`);
      if (res.ok) {
        setExpandedData(await res.json());
      } else {
        setExpandedData(session);
      }
    } catch {
      setExpandedData(session);
    }
    setExpandLoading(false);
  }

  function SessionExpandedDetail({ session, detail }: { session: any; detail: any }) {
    const d = detail || session;
    const goals: any[] = d.linkedGoals || [];
    return (
      <div className="px-5 py-4 bg-slate-50/80 border-t border-slate-100 space-y-4">
        {expandLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400"><Clock className="w-4 h-4 animate-spin" /> Loading details...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Session Info</h4>
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
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Session Documentation</h4>
                {d.notes ? (
                  <p className="text-[13px] text-slate-700 bg-white rounded-lg p-3 border border-slate-200 leading-relaxed">{d.notes}</p>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">No session notes recorded.</p>
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
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-emerald-600" /> IEP Goals Addressed ({goals.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {goals.map((g: any) => (
                    <div key={g.id} className="bg-white rounded-lg px-3 py-2 border border-slate-200">
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 flex-shrink-0 mt-0.5">{g.goalArea}</span>
                        <p className="text-[12px] text-slate-700 leading-snug line-clamp-2">{g.annualGoal}</p>
                      </div>
                      {g.targetCriterion && (
                        <p className="text-[10px] text-slate-400 mt-1 ml-0.5">Target: {g.targetCriterion}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-slate-200">
              <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1" onClick={() => startEdit(session)}>
                <Pencil className="w-3 h-3" /> Edit
              </Button>
              <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setDeleteConfirmId(session.id)}>
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
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">Session Log</h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">{sessionList.length} sessions · Page {page + 1}</p>
        </div>
        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[13px] flex-shrink-0" onClick={() => setShowAddModal(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> <span className="hidden sm:inline">Log </span>Session
        </Button>
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
              statusFilter === item.key ? "bg-slate-800 text-white" : "bg-white text-slate-500 border border-slate-200 hover:border-slate-300"
            }`}
          >{item.label} ({item.count})</button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-10 h-9 text-[13px] bg-white" placeholder="Search sessions..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5">
          <Input type="date" className="h-9 text-[12px] bg-white w-[140px]" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-[11px] text-slate-400">to</span>
          <Input type="date" className="h-9 text-[12px] bg-white w-[140px]" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-[11px] text-slate-400 hover:text-slate-600 px-1.5">Clear</button>
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
                  <p className="text-sm font-medium text-slate-800 truncate">{session.studentName ?? `Student ${session.studentId}`}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{session.serviceTypeName ?? "—"} · {session.staffName ?? "—"}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    session.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                    session.status === "missed" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"
                  }`}>
                    {session.status === "completed" ? <CheckCircle className="w-3 h-3" /> :
                     session.status === "missed" ? <XCircle className="w-3 h-3" /> : null}
                    {session.isMakeup ? "Makeup" : session.status}
                  </span>
                  {expandedId === session.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                <span>{formatDate(session.sessionDate)}</span>
                <span>{session.durationMinutes} min</span>
                {session.location && <span>{session.location}</span>}
              </div>
            </button>
            {expandedId === session.id && <SessionExpandedDetail session={session} detail={expandedData} />}
          </Card>
        ))}
        {!isLoading && filtered.length === 0 && (
          <p className="text-center text-slate-400 text-sm py-12">No sessions found</p>
        )}
        <div className="flex items-center justify-between pt-2">
          <p className="text-[11px] text-slate-400">{filtered.length} sessions</p>
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
              <tr className="border-b border-slate-100">
                <th className="w-8 px-2"></th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Student</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Service</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Provider</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Duration</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i}>{[...Array(7)].map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                ))
              ) : filtered.map(session => (
                <Fragment key={session.id}>
                  <tr className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${expandedId === session.id ? "bg-slate-50/50" : ""}`}
                    onClick={() => toggleExpand(session)}>
                    <td className="px-2 py-3 text-center">
                      {expandedId === session.id ? <ChevronUp className="w-4 h-4 text-slate-400 mx-auto" /> : <ChevronDown className="w-4 h-4 text-slate-300 mx-auto" />}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-slate-600 whitespace-nowrap">{formatDate(session.sessionDate)}</td>
                    <td className="px-4 py-3">
                      <p className="text-[13px] font-medium text-slate-800">{session.studentName ?? `Student ${session.studentId}`}</p>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-slate-500 max-w-[160px] truncate">{session.serviceTypeName ?? "—"}</td>
                    <td className="px-4 py-3 text-[13px] text-slate-500">{session.staffName ?? "—"}</td>
                    <td className="px-4 py-3 text-[13px] text-slate-600">{session.durationMinutes} min</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        session.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                        session.status === "missed" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"
                      }`}>
                        {session.status === "completed" ? <CheckCircle className="w-3 h-3" /> :
                         session.status === "missed" ? <XCircle className="w-3 h-3" /> : null}
                        {session.isMakeup ? <><RotateCcw className="w-3 h-3" /> Makeup</> : session.status}
                      </span>
                    </td>
                  </tr>
                  {expandedId === session.id && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <SessionExpandedDetail session={session} detail={expandedData} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-slate-400 text-sm">No sessions found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
          <p className="text-[12px] text-slate-400">Showing {filtered.length} sessions</p>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">Edit Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12px] text-slate-500">Duration (min)</Label>
                <Input type="number" className="h-9 text-[13px]" value={editForm.durationMinutes} onChange={e => setEditForm(p => ({ ...p, durationMinutes: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] text-slate-500">Status</Label>
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
                <Label className="text-[12px] text-slate-500">Missed Reason *</Label>
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
              <Label className="text-[12px] text-slate-500">Location</Label>
              <Input className="h-9 text-[13px]" value={editForm.location} onChange={e => setEditForm(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Room 204" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-slate-500">Notes</Label>
              <Textarea className="text-[13px] resize-none" rows={3} value={editForm.notes} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-[12px]" onClick={() => setEditingSession(null)}>Cancel</Button>
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] gap-1" disabled={editSaving} onClick={handleEditSave}>
              <Save className="w-3.5 h-3.5" /> {editSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">Log Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12px] text-slate-500">Student *</Label>
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
                <Label className="text-[12px] text-slate-500">Service</Label>
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
              <Label className="text-[12px] text-slate-500">Provider</Label>
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
                <Label className="text-[12px] text-slate-500">Date *</Label>
                <Input type="date" className="h-10 md:h-9 text-[13px]" value={form.sessionDate} onChange={e => updateForm("sessionDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] text-slate-500">Start Time</Label>
                <Input type="time" className="h-10 md:h-9 text-[13px]" value={form.startTime} onChange={e => updateForm("startTime", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] text-slate-500">End Time</Label>
                <Input type="time" className="h-10 md:h-9 text-[13px]" value={form.endTime} onChange={e => updateForm("endTime", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-[12px] text-slate-500">Duration (min) *</Label>
                <Input type="number" className="h-9 text-[13px]" value={form.durationMinutes} onChange={e => updateForm("durationMinutes", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] text-slate-500">Status *</Label>
                <Select value={form.status} onValueChange={v => updateForm("status", v)}>
                  <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="missed">Missed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px] text-slate-500">Mode</Label>
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
                <Label className="text-[12px] text-slate-500">Missed Reason</Label>
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
            <label className="flex items-center gap-2 text-[13px] text-slate-600 cursor-pointer">
              <input type="checkbox" checked={form.isMakeup} onChange={e => updateForm("isMakeup", e.target.checked)} className="rounded border-slate-300" />
              This is a makeup session
            </label>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-slate-500">Notes</Label>
              <Textarea className="text-[13px] resize-none" rows={2} value={form.notes} onChange={e => updateForm("notes", e.target.value)} placeholder="Optional session notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-[12px]" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" disabled={!form.studentId || !form.sessionDate || !form.durationMinutes || submitting} onClick={handleSubmit}>
              {submitting ? "Saving..." : "Log Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-400 flex-shrink-0">{icon}</span>
      <span className="text-[11px] text-slate-400 min-w-[60px]">{label}</span>
      <span className="text-[13px] text-slate-700">{value}</span>
    </div>
  );
}
