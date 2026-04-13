import { useState } from "react";
import { useListSessions, useListStudents, useListStaff, useListMissedReasons, useCreateSession, useListServiceRequirements } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, CheckCircle, XCircle, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";

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
  const [showAddModal, setShowAddModal] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 30;
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);

  const { data: sessions, isLoading, refetch } = useListSessions({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) } as any);
  const { data: students } = useListStudents({} as any);
  const { data: serviceReqs } = useListServiceRequirements(
    form.studentId ? { studentId: Number(form.studentId) } as any : ({} as any)
  );
  const { data: staffData } = useListStaff({} as any);
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
    return matchSearch && matchStatus;
  });

  const missedCount = sessionList.filter(s => s.status === "missed").length;
  const completedCount = sessionList.filter(s => s.status === "completed").length;
  const makeupCount = sessionList.filter(s => s.isMakeup).length;

  function updateForm(field: string, value: any) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    const dur = Number(form.durationMinutes);
    if (!form.studentId || !form.sessionDate || !dur || dur <= 0 || dur > 480) return;
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
      refetch();
    } catch (e) {
      console.error("Failed to create session:", e);
    } finally {
      setSubmitting(false);
    }
  }

  function formatDate(d: string) {
    if (!d) return "—";
    const date = new Date(d + "T00:00:00");
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4 md:space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold text-slate-800 tracking-tight">Session Log</h1>
          <p className="text-xs md:text-sm text-slate-400 mt-1">{sessionList.length} sessions · Page {page + 1}</p>
        </div>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] flex-shrink-0" onClick={() => setShowAddModal(true)}>
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

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input className="pl-10 h-10 text-[13px] bg-white" placeholder="Search sessions..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-2">
        {isLoading ? (
          [...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
        ) : filtered.map(session => (
          <Card key={session.id} className="p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{session.studentName ?? `Student ${session.studentId}`}</p>
                <p className="text-xs text-slate-400 mt-0.5 truncate">{session.serviceTypeName ?? "—"} · {session.staffName ?? "—"}</p>
              </div>
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                session.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                session.status === "missed" ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"
              }`}>
                {session.status === "completed" ? <CheckCircle className="w-3 h-3" /> :
                 session.status === "missed" ? <XCircle className="w-3 h-3" /> : null}
                {session.isMakeup ? "Makeup" : session.status}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
              <span>{formatDate(session.sessionDate)}</span>
              <span>{session.durationMinutes} min</span>
            </div>
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

      {/* Desktop table view */}
      <Card className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Student</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Service</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Provider</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Duration</th>
                <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {isLoading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-5 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                ))
              ) : filtered.map(session => (
                <tr key={session.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3 text-[13px] text-slate-600 whitespace-nowrap">{formatDate(session.sessionDate)}</td>
                  <td className="px-5 py-3">
                    <p className="text-[13px] font-medium text-slate-800">{session.studentName ?? `Student ${session.studentId}`}</p>
                  </td>
                  <td className="px-5 py-3 text-[13px] text-slate-500 max-w-[160px] truncate">{session.serviceTypeName ?? "—"}</td>
                  <td className="px-5 py-3 text-[13px] text-slate-500">{session.staffName ?? "—"}</td>
                  <td className="px-5 py-3 text-[13px] text-slate-600">{session.durationMinutes} min</td>
                  <td className="px-5 py-3">
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
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center text-slate-400 text-sm">No sessions found</td>
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
            <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white text-[12px]" disabled={!form.studentId || !form.sessionDate || !form.durationMinutes || submitting} onClick={handleSubmit}>
              {submitting ? "Saving..." : "Log Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
