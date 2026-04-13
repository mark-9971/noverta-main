import { useState } from "react";
import { useListSessions, useListStudents, useCreateSession, useListServiceRequirements } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, CheckCircle, XCircle, RotateCcw, BookOpen } from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  completed: { label: "Completed", color: "text-green-700 bg-green-50 border-green-200", icon: CheckCircle },
  missed: { label: "Missed", color: "text-red-700 bg-red-50 border-red-200", icon: XCircle },
  makeup: { label: "Makeup", color: "text-indigo-700 bg-indigo-50 border-indigo-200", icon: RotateCcw },
  pending: { label: "Pending", color: "text-slate-600 bg-slate-50 border-slate-200", icon: BookOpen },
};

const INITIAL_FORM = {
  studentId: "",
  serviceRequirementId: "",
  sessionDate: new Date().toISOString().split("T")[0],
  startTime: "09:00",
  endTime: "10:00",
  durationMinutes: "60",
  status: "completed",
  deliveryMode: "in_person",
  location: "",
  isMakeup: false,
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
  const { mutateAsync: createSession } = useCreateSession();

  const sessionList = (sessions as any[]) ?? [];
  const studentList = (students as any[]) ?? [];
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

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Session Log</h1>
          <p className="text-sm text-slate-500 mt-0.5">{sessionList.length} sessions loaded · {missedCount} missed</p>
        </div>
        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => setShowAddModal(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Log Session
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { key: "completed", label: "Completed", count: completedCount, color: "text-green-600" },
          { key: "missed", label: "Missed", count: missedCount, color: "text-red-600" },
          { key: "makeup", label: "Makeup", count: sessionList.filter(s => s.isMakeup).length, color: "text-indigo-600" },
        ].map(item => (
          <button
            key={item.key}
            onClick={() => setStatusFilter(statusFilter === item.key ? "all" : item.key)}
            className={`p-3 rounded-lg border text-left bg-white hover:border-slate-300 transition-all ${
              statusFilter === item.key ? "border-slate-400 shadow-sm" : "border-slate-200"
            }`}
          >
            <p className="text-xs text-slate-500 font-medium">{item.label}</p>
            <p className={`text-xl font-bold ${item.color}`}>{item.count}</p>
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input className="pl-9 h-9 text-sm" placeholder="Search sessions..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-9 text-sm">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="missed">Missed</SelectItem>
            <SelectItem value="makeup">Makeup</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Service</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Provider</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Duration</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                [...Array(10)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(6)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.map(session => {
                const statusCfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.pending;
                return (
                  <tr key={session.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap text-xs">{session.sessionDate}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-800">{session.studentName ?? `Student ${session.studentId}`}</td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs max-w-[160px] truncate">{session.serviceTypeName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">{session.staffName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600 text-xs">{session.durationMinutes ?? "—"} min</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusCfg.color}`}>
                        <statusCfg.icon className="w-3 h-3" />
                        {session.isMakeup ? "Makeup" : statusCfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400 text-sm">No sessions found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <p className="text-xs text-slate-400">Showing {filtered.length} of {sessionList.length} sessions</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={sessionList.length < PAGE_SIZE} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </Card>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log Session</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Student *</Label>
                <Select value={form.studentId} onValueChange={v => { updateForm("studentId", v); updateForm("serviceRequirementId", ""); }}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select student" />
                  </SelectTrigger>
                  <SelectContent>
                    {studentList.map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Service Requirement</Label>
                <Select value={form.serviceRequirementId} onValueChange={v => updateForm("serviceRequirementId", v)} disabled={!form.studentId}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder={form.studentId ? "Select service" : "Select student first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {reqList.map((r: any) => (
                      <SelectItem key={r.id} value={String(r.id)}>{r.serviceTypeName} — {r.minutesPerWeek} min/wk</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Date *</Label>
                <Input type="date" className="h-9 text-sm" value={form.sessionDate} onChange={e => updateForm("sessionDate", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Start Time</Label>
                <Input type="time" className="h-9 text-sm" value={form.startTime} onChange={e => updateForm("startTime", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">End Time</Label>
                <Input type="time" className="h-9 text-sm" value={form.endTime} onChange={e => updateForm("endTime", e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Duration (min) *</Label>
                <Input type="number" className="h-9 text-sm" value={form.durationMinutes} onChange={e => updateForm("durationMinutes", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status *</Label>
                <Select value={form.status} onValueChange={v => updateForm("status", v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="missed">Missed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Delivery Mode</Label>
                <Select value={form.deliveryMode} onValueChange={v => updateForm("deliveryMode", v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_person">In Person</SelectItem>
                    <SelectItem value="remote">Remote</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isMakeup} onChange={e => updateForm("isMakeup", e.target.checked)} className="rounded border-slate-300" />
                This is a makeup session
              </label>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea className="text-sm resize-none" rows={2} value={form.notes} onChange={e => updateForm("notes", e.target.value)} placeholder="Optional session notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
              disabled={!form.studentId || !form.sessionDate || !form.durationMinutes || submitting}
              onClick={handleSubmit}
            >
              {submitting ? "Saving..." : "Log Session"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
