import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { formatDate } from "@/lib/formatters";
import { FileSearch, Plus, Save, Loader2, CheckCircle2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { REFERRAL_SOURCES, CONCERN_AREAS } from "./constants";
import {
  referralStatusBadge, consentStatusBadge, deadlineBadge,
  fetchStudents, fetchStaff, FormField,
} from "./shared";
import type { ReferralRecord, StudentOption, StaffOption } from "./types";

export function ReferralsTab() {
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
