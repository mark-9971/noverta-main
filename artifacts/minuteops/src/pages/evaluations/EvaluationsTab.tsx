import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { formatDate } from "@/lib/formatters";
import { ClipboardList, Plus, Save, Loader2, CheckCircle2 } from "lucide-react";
import { EVAL_AREAS } from "./constants";
import {
  statusBadge, evalStatusBadge, deadlineBadge,
  fetchStudents, fetchStaff, FormField, TeamMemberPicker,
} from "./shared";
import type { EvaluationRecord, ReferralRecord, StudentOption, StaffOption } from "./types";

export function EvaluationsTab() {
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
