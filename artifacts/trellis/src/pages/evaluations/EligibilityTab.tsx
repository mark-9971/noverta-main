import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { formatDate } from "@/lib/formatters";
import { Users, Calendar, Plus, Save, Loader2 } from "lucide-react";
import { DISABILITY_CATEGORIES } from "./constants";
import {
  statusBadge, deadlineBadge,
  fetchStudents, FormField, TeamMemberPicker,
} from "./shared";
import type { EligibilityRecord, StudentOption } from "./types";

export function EligibilityTab() {
  const [determinations, setDeterminations] = useState<EligibilityRecord[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    studentId: "", meetingDate: new Date().toISOString().slice(0, 10),
    primaryDisability: "", secondaryDisability: "",
    eligible: "" as string, determinationBasis: "",
    determinationNotes: "", iepRequired: false,
    reEvalCycleMonths: "36", teamMembers: [] as string[],
  });

  const load = useCallback(async () => {
    try {
      const [detsRes, stu] = await Promise.all([
        authFetch("/api/evaluations/eligibility"),
        fetchStudents(),
      ]);
      const dets = detsRes.ok ? await detsRes.json() : [];
      setDeterminations(dets);
      setStudents(stu);
    } catch { toast.error("Failed to load eligibility records"); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!form.studentId || !form.meetingDate) { toast.error("Student and meeting date are required"); return; }
    setSaving(true);
    try {
      await authFetch("/api/evaluations/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: parseInt(form.studentId),
          meetingDate: form.meetingDate,
          teamMembers: form.teamMembers,
          eligible: form.eligible === "true" ? true : form.eligible === "false" ? false : null,
          iepRequired: form.iepRequired,
          reEvalCycleMonths: parseInt(form.reEvalCycleMonths) || 36,
          primaryDisability: form.primaryDisability || null,
          secondaryDisability: form.secondaryDisability || null,
          determinationBasis: form.determinationBasis || null,
          determinationNotes: form.determinationNotes || null,
          status: "final",
        }),
      });
      toast.success("Eligibility determination saved");
      setShowAdd(false);
      setForm({ studentId: "", meetingDate: new Date().toISOString().slice(0, 10), primaryDisability: "", secondaryDisability: "", eligible: "", determinationBasis: "", determinationNotes: "", iepRequired: false, reEvalCycleMonths: "36", teamMembers: [] });
      load();
    } catch { toast.error("Failed to save determination"); }
    setSaving(false);
  }

  if (loading) return <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  const upcomingReEvals = determinations
    .filter(d => d.nextReEvalDate && d.daysUntilReEval !== null && d.daysUntilReEval <= 90)
    .sort((a, b) => (a.daysUntilReEval ?? 999) - (b.daysUntilReEval ?? 999));

  return (
    <div className="space-y-4">
      {upcomingReEvals.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-[13px] font-semibold text-amber-700 flex items-center gap-2">
              <Calendar className="w-4 h-4" /> Upcoming Re-Evaluations (within 90 days)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingReEvals.map(d => (
              <div key={d.id} className="flex items-center justify-between text-[12px] py-1.5 border-b border-amber-100 last:border-0">
                <div>
                  <span className="font-medium text-gray-700">{d.studentName ?? "—"}</span>
                  <span className="text-gray-400 ml-2">{d.primaryDisability ?? "—"}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400">Re-eval by: {d.nextReEvalDate ? formatDate(d.nextReEvalDate) : "—"}</span>
                  {deadlineBadge(d.daysUntilReEval)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <p className="text-[13px] text-gray-500 font-medium">{determinations.length} determination{determinations.length !== 1 ? "s" : ""}</p>
        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8 gap-1" onClick={() => setShowAdd(!showAdd)}>
          <Plus className="w-3 h-3" /> New Determination
        </Button>
      </div>

      {showAdd && (
        <Card className="border-emerald-200">
          <CardContent className="py-4 px-5 space-y-3">
            <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">Eligibility Determination</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <FormField label="Student *">
                <select value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))} className="form-select">
                  <option value="">Select student…</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>
              </FormField>
              <FormField label="Meeting Date *">
                <input type="date" value={form.meetingDate} onChange={e => setForm(f => ({ ...f, meetingDate: e.target.value }))} className="form-input" />
              </FormField>
              <FormField label="Eligible?">
                <select value={form.eligible} onChange={e => setForm(f => ({ ...f, eligible: e.target.value, iepRequired: e.target.value === "true" }))} className="form-select">
                  <option value="">Not determined</option>
                  <option value="true">Yes — Eligible</option>
                  <option value="false">No — Not Eligible</option>
                </select>
              </FormField>
              <FormField label="Primary Disability">
                <select value={form.primaryDisability} onChange={e => setForm(f => ({ ...f, primaryDisability: e.target.value }))} className="form-select">
                  <option value="">Select…</option>
                  {DISABILITY_CATEGORIES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </FormField>
              <FormField label="Secondary Disability">
                <select value={form.secondaryDisability} onChange={e => setForm(f => ({ ...f, secondaryDisability: e.target.value }))} className="form-select">
                  <option value="">None</option>
                  {DISABILITY_CATEGORIES.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </FormField>
              <FormField label="Re-Eval Cycle">
                <select value={form.reEvalCycleMonths} onChange={e => setForm(f => ({ ...f, reEvalCycleMonths: e.target.value }))} className="form-select">
                  <option value="36">Every 3 Years (default)</option>
                  <option value="24">Every 2 Years</option>
                  <option value="12">Every Year</option>
                </select>
              </FormField>
            </div>
            <FormField label="Team Members">
              <TeamMemberPicker selected={form.teamMembers} onChange={members => setForm(f => ({ ...f, teamMembers: members }))} />
            </FormField>
            <FormField label="Determination Basis">
              <textarea value={form.determinationBasis} onChange={e => setForm(f => ({ ...f, determinationBasis: e.target.value }))} rows={2} placeholder="Basis for the eligibility decision…" className="form-textarea" />
            </FormField>
            <FormField label="Notes">
              <textarea value={form.determinationNotes} onChange={e => setForm(f => ({ ...f, determinationNotes: e.target.value }))} rows={2} placeholder="Additional notes…" className="form-textarea" />
            </FormField>
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={form.iepRequired} onChange={e => setForm(f => ({ ...f, iepRequired: e.target.checked }))} id="iepRequired" className="rounded border-gray-300" />
              <label htmlFor="iepRequired" className="text-[12px] text-gray-600">IEP required</label>
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8" onClick={submit} disabled={saving}>
                {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />} Save Determination
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {determinations.length === 0 && !showAdd && (
        <Card><CardContent className="py-16 text-center">
          <Users className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No eligibility determinations yet.</p>
        </CardContent></Card>
      )}

      {determinations.map(det => (
        <Card key={det.id} className="hover:border-gray-300 transition-colors">
          <CardContent className="py-3 px-5">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] font-semibold text-gray-800">{det.studentName ?? "—"}</span>
                  {det.eligible === true && statusBadge("Eligible", "emerald")}
                  {det.eligible === false && statusBadge("Not Eligible", "red")}
                  {det.eligible === null && statusBadge("Undetermined", "gray")}
                  {det.iepRequired && statusBadge("IEP Required", "blue")}
                </div>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Meeting: {formatDate(det.meetingDate)}
                  {det.primaryDisability ? ` · ${det.primaryDisability}` : ""}
                  {det.secondaryDisability ? ` / ${det.secondaryDisability}` : ""}
                </p>
                {det.teamMembers?.length > 0 && (
                  <p className="text-[10px] text-gray-400 mt-0.5">Team: {det.teamMembers.join(", ")}</p>
                )}
                {det.determinationBasis && (
                  <p className="text-[12px] text-gray-600 mt-1 line-clamp-2">{det.determinationBasis}</p>
                )}
              </div>
              {det.nextReEvalDate && (
                <div className="text-center flex-shrink-0">
                  <p className="text-[10px] text-gray-400">Next Re-Evaluation</p>
                  <p className="text-[12px] font-semibold text-gray-700">{formatDate(det.nextReEvalDate)}</p>
                  {deadlineBadge(det.daysUntilReEval)}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
