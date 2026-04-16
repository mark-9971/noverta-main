import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, Edit2, FileCheck, FileText, History, Save } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { amendIepDocument, createIepDocument, updateIepDocument } from "@workspace/api-client-react";

export interface Student { id: number; firstName: string; lastName: string; grade: string; dateOfBirth?: string | null; }
export interface IepDocument {
  id: number; studentId: number; iepStartDate: string; iepEndDate: string;
  meetingDate: string | null; status: string; iepType?: string | null; version?: string | null;
  studentConcerns: string | null; parentConcerns: string | null; teamVision: string | null;
  plaafpAcademic: string | null; plaafpBehavioral: string | null;
  plaafpCommunication: string | null; plaafpAdditional: string | null;
  transitionAssessment: string | null; transitionPostsecGoals: string | null;
  transitionServices: string | null; transitionAgencies: string | null;
  esyEligible: boolean | null; esyServices: string | null; esyJustification: string | null;
  assessmentParticipation: string | null; assessmentAccommodations: string | null;
  alternateAssessmentJustification: string | null;
  scheduleModifications: string | null; transportationServices: string | null;
  active: boolean;
}

const PLAAFP_SECTIONS = [
  { key: "plaafpAcademic", label: "A. Academic Performance" },
  { key: "plaafpBehavioral", label: "B. Behavioral / Social-Emotional" },
  { key: "plaafpCommunication", label: "C. Communication" },
  { key: "plaafpAdditional", label: "D. Additional (Health, Physical, Daily Living)" },
] as const;

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function AmendButton({ studentId, docId, onAmended }: { studentId: number; docId: number; onAmended: () => void }) {
  const [showDialog, setShowDialog] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function createAmendment() {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      await amendIepDocument(studentId, docId, { amendmentReason: reason.trim() });
      setShowDialog(false);
      setReason("");
      onAmended();
    } catch (e) {
      console.error("Failed to create amendment:", e);
    }
    setSubmitting(false);
  }

  if (!showDialog) {
    return (
      <Button size="sm" variant="outline" className="text-[12px] h-8 text-amber-600 border-amber-200 hover:bg-amber-50"
        onClick={() => setShowDialog(true)}>
        <Copy className="w-3.5 h-3.5 mr-1" /> Amend
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-lg p-6 w-full max-w-md">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Create IEP Amendment</h3>
        <p className="text-[12px] text-gray-500 mb-3">This will copy the current IEP as a draft amendment. The original remains active until the amendment is finalized.</p>
        <label className="text-[11px] font-medium text-gray-500">Reason for Amendment</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Describe why this IEP needs to be amended..."
          className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
        <div className="flex justify-end gap-2 mt-4">
          <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => { setShowDialog(false); setReason(""); }}>Cancel</Button>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white text-[12px] h-8" onClick={createAmendment} disabled={submitting || !reason.trim()}>
            <Copy className="w-3.5 h-3.5 mr-1" /> {submitting ? "Creating..." : "Create Amendment Draft"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function IepDocumentSection({ studentId, student, iepDocs, onSaved }: {
  studentId: number; student: Student | null; iepDocs: IepDocument[]; onSaved: () => void;
}) {
  const activeDoc = iepDocs.find(d => d.active) || iepDocs[0] || null;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<IepDocument>>({});

  const studentAge = student?.dateOfBirth
    ? Math.floor((Date.now() - new Date(student.dateOfBirth).getTime()) / (365.25 * 86400000))
    : null;
  const showTransition = studentAge !== null && studentAge >= 14;

  function startEdit() {
    if (activeDoc) {
      setForm({ ...activeDoc });
    } else {
      const now = new Date();
      const nextYear = new Date(now);
      nextYear.setFullYear(nextYear.getFullYear() + 1);
      setForm({
        iepStartDate: now.toISOString().split("T")[0],
        iepEndDate: nextYear.toISOString().split("T")[0],
        meetingDate: now.toISOString().split("T")[0],
        status: "draft",
      });
    }
    setEditing(true);
  }

  function updateField(key: string, val: any) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  async function save() {
    setSaving(true);
    try {
      if (activeDoc) {
        await updateIepDocument(activeDoc.id, form);
      } else {
        await createIepDocument(studentId, { ...form, studentId });
      }
      setEditing(false);
      onSaved();
    } catch (e) {
      console.error("Failed to save IEP document:", e);
    }
    setSaving(false);
  }

  function TextSection({ label, fieldKey, rows = 3 }: { label: string; fieldKey: string; rows?: number }) {
    const val = (form as any)[fieldKey] ?? "";
    const displayVal = activeDoc ? (activeDoc as any)[fieldKey] ?? "" : "";
    if (editing) {
      return (
        <div>
          <label className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">{label}</label>
          <textarea value={val} onChange={e => updateField(fieldKey, e.target.value)} rows={rows}
            className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200 resize-none" />
        </div>
      );
    }
    if (!displayVal) return null;
    return (
      <div>
        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-[13px] text-gray-600 whitespace-pre-line">{displayVal}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-600">IEP Document (MA DESE Form)</h3>
          {activeDoc?.iepType && (
            <span className="text-[10px] text-gray-400 mt-0.5">
              Type: {activeDoc.iepType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}
              {activeDoc.version ? ` (v${activeDoc.version})` : ""}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {!editing && activeDoc && (
            <AmendButton studentId={studentId} docId={activeDoc.id} onAmended={onSaved} />
          )}
          {!editing && (
            <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={startEdit}>
              <Edit2 className="w-3.5 h-3.5 mr-1" /> {activeDoc ? "Edit" : "Create IEP Document"}
            </Button>
          )}
          {editing && (
            <>
              <Button size="sm" variant="outline" className="text-[12px] h-8" onClick={() => setEditing(false)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8" onClick={save} disabled={saving}>
                <Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>

      {iepDocs.length > 1 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-2">
              <History className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">IEP History & Amendments</span>
            </div>
            <div className="space-y-1">
              {iepDocs.map(doc => (
                <div key={doc.id} className={`flex items-center justify-between px-2 py-1.5 rounded text-[12px] ${doc.active ? "bg-emerald-50 border border-emerald-200" : "hover:bg-gray-50"}`}>
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-gray-700">
                      {doc.iepType ? doc.iepType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) : "IEP"}
                      {doc.version ? ` v${doc.version}` : ""}
                    </span>
                    {doc.active && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[9px] font-medium">Active</span>}
                    {doc.status === "draft" && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[9px] font-medium">Draft</span>}
                  </div>
                  <span className="text-gray-400 text-[11px]">
                    {doc.iepStartDate ? formatDate(doc.iepStartDate) : ""} - {doc.iepEndDate ? formatDate(doc.iepEndDate) : ""}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!activeDoc && !editing && (
        <Card>
          <CardContent className="p-2">
            <EmptyState
              icon={FileCheck}
              title="No IEP document on file"
              description="Create a new IEP document to track all Massachusetts-required sections, or use the AI assistant to draft one based on existing goals."
              action={{ label: "Build IEP Draft with AI", href: `/students/${studentId}/iep-builder` }}
              secondaryAction={{ label: "Create Blank IEP", onClick: () => setEditing(true), variant: "outline" }}
            />
          </CardContent>
        </Card>
      )}

      {(activeDoc || editing) && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <h4 className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider">IEP Dates & Status</h4>
              {editing ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">IEP Start Date</label>
                    <input type="date" value={form.iepStartDate || ""} onChange={e => updateField("iepStartDate", e.target.value)}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">IEP End Date</label>
                    <input type="date" value={form.iepEndDate || ""} onChange={e => updateField("iepEndDate", e.target.value)}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">Meeting Date</label>
                    <input type="date" value={form.meetingDate || ""} onChange={e => updateField("meetingDate", e.target.value)}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 text-[13px] text-gray-600">
                  <span>Start: {formatDate(activeDoc!.iepStartDate)}</span>
                  <span>End: {formatDate(activeDoc!.iepEndDate)}</span>
                  {activeDoc!.meetingDate && <span>Meeting: {formatDate(activeDoc!.meetingDate)}</span>}
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${activeDoc!.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {activeDoc!.status}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <h4 className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider">Student & Parent Concerns / Team Vision</h4>
              <TextSection label="Student Concerns" fieldKey="studentConcerns" />
              <TextSection label="Parent Concerns" fieldKey="parentConcerns" />
              <TextSection label="Team Vision Statement" fieldKey="teamVision" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <h4 className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider">Present Levels of Academic Achievement & Functional Performance (PLAAFP)</h4>
              {PLAAFP_SECTIONS.map(s => (
                <TextSection key={s.key} label={s.label} fieldKey={s.key} rows={4} />
              ))}
            </CardContent>
          </Card>

          {(showTransition || editing) && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <h4 className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider">
                  Transition Planning (Age 14+)
                  {studentAge !== null && <span className="text-gray-400 font-normal ml-2">Student age: {studentAge}</span>}
                </h4>
                <TextSection label="Transition Assessment" fieldKey="transitionAssessment" />
                <TextSection label="Postsecondary Goals" fieldKey="transitionPostsecGoals" />
                <TextSection label="Transition Services" fieldKey="transitionServices" />
                <TextSection label="Agency Linkages" fieldKey="transitionAgencies" />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4 space-y-4">
              <h4 className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider">Extended School Year (ESY)</h4>
              {editing ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">ESY Eligible?</label>
                    <select value={form.esyEligible == null ? "" : form.esyEligible ? "yes" : "no"}
                      onChange={e => updateField("esyEligible", e.target.value === "" ? null : e.target.value === "yes")}
                      className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-emerald-200">
                      <option value="">Not determined</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  <TextSection label="ESY Services" fieldKey="esyServices" />
                  <TextSection label="ESY Justification" fieldKey="esyJustification" />
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[13px] text-gray-600">
                    Eligible: {activeDoc!.esyEligible == null ? "Not determined" : activeDoc!.esyEligible ? "Yes" : "No"}
                  </p>
                  <TextSection label="ESY Services" fieldKey="esyServices" />
                  <TextSection label="ESY Justification" fieldKey="esyJustification" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <h4 className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider">Assessment Participation</h4>
              <TextSection label="Assessment Participation" fieldKey="assessmentParticipation" />
              <TextSection label="Assessment Accommodations" fieldKey="assessmentAccommodations" />
              <TextSection label="Alternate Assessment Justification" fieldKey="alternateAssessmentJustification" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-4">
              <h4 className="text-[12px] font-semibold text-emerald-700 uppercase tracking-wider">Additional Services</h4>
              <TextSection label="Schedule Modifications" fieldKey="scheduleModifications" />
              <TextSection label="Transportation Services" fieldKey="transportationServices" />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
