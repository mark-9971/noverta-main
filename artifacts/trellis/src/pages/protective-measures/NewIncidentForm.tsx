import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bell, PenLine, Save, Send } from "lucide-react";
import {
  listStudents, listStaff, createProtectiveIncident, getProtectiveIncident,
} from "@workspace/api-client-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";
import { EmergencyAlertInline } from "@/components/emergency-alert-inline";
import { ChecklistField } from "@/pages/protective-measures/IncidentList";
import {
  Staff,
  TYPE_LABELS, RESTRAINT_TYPES, BODY_POSITIONS, ANTECEDENT_CATEGORIES,
  DEESC_STRATEGIES, SAFETY_CARE_PROCEDURES,
  inputCls, labelCls, textareaCls,
  formatDate, formatTime,
} from "@/pages/protective-measures/constants";

export function NewIncidentForm({ onClose, editId }: { onClose: () => void; editId?: number }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved">("idle");
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveRef = useRef<string>("");
  const [loadedEdit, setLoadedEdit] = useState(false);
  const [form, setForm] = useState({
    studentId: "",
    incidentDate: new Date().toISOString().split("T")[0],
    incidentTime: "",
    endTime: "",
    incidentType: "physical_restraint",
    location: "",
    precedingActivity: "",
    triggerDescription: "",
    antecedentCategory: "",
    behaviorDescription: "",
    deescalationAttempts: "",
    deescalationStrategies: [] as string[],
    alternativesAttempted: "",
    justification: "",
    restraintType: "",
    restraintDescription: "",
    bodyPosition: "",
    proceduresUsed: [] as string[],
    primaryStaffId: "",
    additionalStaffIds: [] as string[],
    observerStaffIds: [] as string[],
    principalNotifiedName: "",
    continuedOver20Min: false,
    over20MinApproverName: "",
    calmingStrategiesUsed: "",
    studentStateAfter: "",
    studentMoved: false,
    studentMovedTo: "",
    roomCleared: false,
    bipInPlace: false,
    physicalEscortOnly: false,
    emergencyServicesCalled: false,
    studentReturnedToActivity: "",
    timeToCalm: "",
    studentInjury: false,
    studentInjuryDescription: "",
    staffInjury: false,
    staffInjuryDescription: "",
    medicalAttentionRequired: false,
    medicalDetails: "",
    debriefConducted: false,
    debriefDate: "",
    debriefNotes: "",
    reportingStaffSignature: "",
    notes: "",
  });
  const [error, setError] = useState("");

  const isDirtyRef = useRef(false);

  const saveDraft = useCallback(() => {
    if (!isDirtyRef.current) return;
    const snapshot = JSON.stringify(form);
    if (snapshot === lastSaveRef.current) return;
    setDraftStatus("saving");
    try {
      localStorage.setItem("pm-incident-draft", snapshot);
      lastSaveRef.current = snapshot;
      setTimeout(() => setDraftStatus("saved"), 300);
    } catch {
      setDraftStatus("idle");
    }
  }, [form]);

  useEffect(() => {
    if (!isDirtyRef.current) return;
    if (draftTimerRef.current) clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(saveDraft, 30000);
    return () => { if (draftTimerRef.current) clearTimeout(draftTimerRef.current); };
  }, [form, saveDraft]);

  const prevStepRef = useRef(step);
  useEffect(() => {
    if (prevStepRef.current !== step) {
      prevStepRef.current = step;
      saveDraft();
    }
  }, [step, saveDraft]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("pm-incident-draft");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.studentId) {
          setForm(f => ({ ...f, ...parsed }));
          lastSaveRef.current = saved;
          isDirtyRef.current = true;
          setDraftStatus("saved");
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!editId || loadedEdit) return;
    (async () => {
      try {
        const data = await getProtectiveIncident(editId);
        const d = data as any;
        setForm(f => ({
          ...f,
          studentId: String(d.studentId ?? ""),
          incidentDate: d.incidentDate ?? f.incidentDate,
          incidentTime: d.incidentTime ?? "",
          endTime: d.endTime ?? "",
          incidentType: d.incidentType ?? "physical_restraint",
          location: d.location ?? "",
          precedingActivity: d.precedingActivity ?? "",
          triggerDescription: d.triggerDescription ?? "",
          antecedentCategory: d.antecedentCategory ?? "",
          behaviorDescription: d.behaviorDescription ?? "",
          deescalationAttempts: d.deescalationAttempts ?? "",
          deescalationStrategies: Array.isArray(d.deescalationStrategies) ? d.deescalationStrategies : [],
          alternativesAttempted: d.alternativesAttempted ?? "",
          justification: d.justification ?? "",
          restraintType: d.restraintType ?? "",
          restraintDescription: d.restraintDescription ?? "",
          bodyPosition: d.bodyPosition ?? "",
          proceduresUsed: Array.isArray(d.proceduresUsed) ? d.proceduresUsed : [],
          primaryStaffId: d.primaryStaffId ? String(d.primaryStaffId) : "",
          additionalStaffIds: Array.isArray(d.additionalStaffIds) ? d.additionalStaffIds.map(String) : [],
          observerStaffIds: Array.isArray(d.observerStaffIds) ? d.observerStaffIds.map(String) : [],
          principalNotifiedName: d.principalNotifiedName ?? "",
          continuedOver20Min: d.continuedOver20Min ?? false,
          over20MinApproverName: d.over20MinApproverName ?? "",
          calmingStrategiesUsed: d.calmingStrategiesUsed ?? "",
          studentStateAfter: d.studentStateAfter ?? "",
          studentMoved: d.studentMoved ?? false,
          studentMovedTo: d.studentMovedTo ?? "",
          roomCleared: d.roomCleared ?? false,
          bipInPlace: d.bipInPlace ?? false,
          physicalEscortOnly: d.physicalEscortOnly ?? false,
          emergencyServicesCalled: d.emergencyServicesCalled ?? false,
          studentReturnedToActivity: d.studentReturnedToActivity ?? "",
          timeToCalm: d.timeToCalm ? String(d.timeToCalm) : "",
          studentInjury: d.studentInjury ?? false,
          studentInjuryDescription: d.studentInjuryDescription ?? "",
          staffInjury: d.staffInjury ?? false,
          staffInjuryDescription: d.staffInjuryDescription ?? "",
          medicalAttentionRequired: d.medicalAttentionRequired ?? false,
          medicalDetails: d.medicalDetails ?? "",
          debriefConducted: d.debriefConducted ?? false,
          debriefDate: d.debriefDate ?? "",
          debriefNotes: d.debriefNotes ?? "",
          reportingStaffSignature: d.reportingStaffSignature ?? "",
          notes: d.notes ?? "",
        }));
        setLoadedEdit(true);
        isDirtyRef.current = false;
      } catch {}
    })();
  }, [editId, loadedEdit]);

  const { data: students = [] } = useQuery<any[]>({
    queryKey: ["students-list"],
    queryFn: ({ signal }) => listStudents(undefined, { signal }),
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-list"],
    queryFn: ({ signal }) => listStaff(undefined, { signal }) as Promise<Staff[]>,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const dur = form.incidentTime && form.endTime ? (() => {
        const [sh, sm] = form.incidentTime.split(":").map(Number);
        const [eh, em] = form.endTime.split(":").map(Number);
        return (eh * 60 + em) - (sh * 60 + sm);
      })() : null;

      const payload = {
        ...form,
        studentId: Number(form.studentId),
        primaryStaffId: form.primaryStaffId ? Number(form.primaryStaffId) : null,
        additionalStaffIds: form.additionalStaffIds.length > 0 ? form.additionalStaffIds.map(Number) : null,
        observerStaffIds: form.observerStaffIds.length > 0 ? form.observerStaffIds.map(Number) : null,
        durationMinutes: dur && dur > 0 ? dur : null,
        reportingStaffSignedAt: form.reportingStaffSignature ? new Date().toISOString() : null,
        timeToCalm: form.timeToCalm ? Number(form.timeToCalm) : null,
        proceduresUsed: form.proceduresUsed.length > 0 ? form.proceduresUsed : null,
        deescalationStrategies: form.deescalationStrategies.length > 0 ? form.deescalationStrategies : null,
      };

      if (editId) {
        const res = await authFetch(`/api/protective-measures/incidents/${editId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Update failed" }));
          throw new Error(err.error || "Update failed");
        }
        return res.json();
      }

      const res = await createProtectiveIncident(payload);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["protective-incidents"] });
      queryClient.invalidateQueries({ queryKey: ["protective-summary"] });
      if (editId) queryClient.invalidateQueries({ queryKey: ["protective-incident", editId] });
      try { localStorage.removeItem("pm-incident-draft"); } catch {}
      toast.success(editId ? "Incident updated" : "Incident report submitted");
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const set = (key: string, val: any) => {
    isDirtyRef.current = true;
    setForm(f => ({ ...f, [key]: val }));
  };

  const toggleStaffMulti = (field: "additionalStaffIds" | "observerStaffIds", staffId: string) => {
    isDirtyRef.current = true;
    setForm(f => {
      const arr = f[field];
      return { ...f, [field]: arr.includes(staffId) ? arr.filter(x => x !== staffId) : [...arr, staffId] };
    });
  };

  const STEPS = ["Incident", "Context & Behavior", "Staff & Environment", "Injuries & Safety", "Debrief, Sign & Submit"];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">{editId ? "Continue Report" : "Report Incident"}</h1>
          <p className="text-sm text-gray-500">603 CMR 46.06 Compliant Documentation</p>
        </div>
        {draftStatus !== "idle" && (
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Save className="w-3.5 h-3.5" />
            {draftStatus === "saving" ? "Saving..." : "Draft saved"}
          </div>
        )}
      </div>

      <div className="flex gap-1 mb-4">
        {STEPS.map((label, i) => (
          <div key={i} className="flex-1">
            <div className={`h-1.5 rounded-full ${i < step ? "bg-emerald-500" : "bg-gray-200"}`} />
            <p className={`text-[9px] mt-1 text-center ${i < step ? "text-emerald-700 font-medium" : "text-gray-400"}`}>{label}</p>
          </div>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      {step === 1 && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800">Incident Details — 603 CMR 46.06(4)(a)</h2>
          {form.studentId && <EmergencyAlertInline studentId={Number(form.studentId)} />}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Student *</label>
              <select value={form.studentId} onChange={e => set("studentId", e.target.value)} className={inputCls}>
                <option value="">Select student...</option>
                {(students || []).map((s: any) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — Grade {s.grade}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Incident Type *</label>
              <select value={form.incidentType} onChange={e => set("incidentType", e.target.value)} className={inputCls}>
                <option value="physical_restraint">Physical Restraint</option>
                <option value="seclusion">Seclusion (Emergency Only)</option>
                <option value="time_out">Time-Out (Exclusionary)</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Date *</label>
              <input type="date" value={form.incidentDate} onChange={e => set("incidentDate", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Time Began *</label>
              <input type="time" value={form.incidentTime} onChange={e => set("incidentTime", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Time Ended *</label>
              <input type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Location</label>
              <input type="text" placeholder="e.g., Classroom 204, Hallway" value={form.location} onChange={e => set("location", e.target.value)} className={inputCls} />
            </div>
            {form.incidentType === "physical_restraint" && (
              <>
                <div>
                  <label className={labelCls}>Type of Restraint</label>
                  <select value={form.restraintType} onChange={e => set("restraintType", e.target.value)} className={inputCls}>
                    <option value="">Select type...</option>
                    {Object.entries(RESTRAINT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Body Position During Restraint</label>
                  <select value={form.bodyPosition} onChange={e => set("bodyPosition", e.target.value)} className={inputCls}>
                    <option value="">Select position...</option>
                    {Object.entries(BODY_POSITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>

          <label className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg cursor-pointer hover:bg-emerald-100/70 transition-colors">
            <input type="checkbox" checked={form.bipInPlace} onChange={e => set("bipInPlace", e.target.checked)}
              className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500" />
            <div>
              <span className="text-sm font-medium text-emerald-800">Student has a Behavior Intervention Plan (BIP)</span>
              <p className="text-xs text-emerald-700">Check if the student's IEP includes a BIP</p>
            </div>
          </label>

          {form.incidentType === "physical_restraint" && (
            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
              <input type="checkbox" checked={form.physicalEscortOnly} onChange={e => set("physicalEscortOnly", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
              <div>
                <span className="text-sm font-medium text-gray-700">Physical escort only (brief, temporary contact)</span>
                <p className="text-xs text-gray-500">Student was guided to safety without sustained physical restraint</p>
              </div>
            </label>
          )}

          <label className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg cursor-pointer hover:bg-amber-100/70 transition-colors">
            <input type="checkbox" checked={form.continuedOver20Min} onChange={e => set("continuedOver20Min", e.target.checked)}
              className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500" />
            <div>
              <span className="text-sm font-medium text-amber-800">Restraint continued beyond 20 minutes</span>
              <p className="text-xs text-amber-700">Per 603 CMR 46.05(5)(c), principal/designee approval required</p>
            </div>
          </label>
          {form.continuedOver20Min && (
            <input type="text" placeholder="Name of principal/designee who approved continuation" value={form.over20MinApproverName} onChange={e => set("over20MinApproverName", e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-amber-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20" />
          )}

          <div className="flex justify-end">
            <button onClick={() => {
              if (!form.studentId || !form.incidentTime || !form.incidentDate) { setError("Please select a student and fill in the date/time fields"); return; }
              setError(""); setStep(2);
            }} className="px-5 py-2.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800">
              Next: Context & Behavior
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800">Behavioral Context — 603 CMR 46.06(4)(b)</h2>

          <div>
            <label className={labelCls}>Antecedent Category *</label>
            <select value={form.antecedentCategory} onChange={e => set("antecedentCategory", e.target.value)} className={inputCls}>
              <option value="">Select what triggered the behavior...</option>
              {Object.entries(ANTECEDENT_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Activity Preceding Incident *</label>
            <textarea value={form.precedingActivity} onChange={e => set("precedingActivity", e.target.value)} rows={2}
              placeholder="Describe the activity the student and others were engaged in immediately before the restraint..."
              className={textareaCls} />
          </div>
          <div>
            <label className={labelCls}>Trigger / Antecedent Description</label>
            <textarea value={form.triggerDescription} onChange={e => set("triggerDescription", e.target.value)} rows={2}
              placeholder="What happened immediately before the incident?"
              className={textareaCls} />
          </div>
          <div>
            <label className={labelCls}>Behavior That Prompted Restraint *</label>
            <textarea value={form.behaviorDescription} onChange={e => set("behaviorDescription", e.target.value)} rows={3}
              placeholder="Describe the specific behavior that posed a threat of imminent, serious physical harm..."
              className={textareaCls} />
          </div>

          <ChecklistField label="De-escalation Strategies Used (select all that apply)" options={DEESC_STRATEGIES} selected={form.deescalationStrategies} onChange={v => set("deescalationStrategies", v)} />

          <div>
            <label className={labelCls}>Additional De-escalation Details</label>
            <textarea value={form.deescalationAttempts} onChange={e => set("deescalationAttempts", e.target.value)} rows={2}
              placeholder="Describe any additional de-escalation strategies not listed above..."
              className={textareaCls} />
          </div>
          <div>
            <label className={labelCls}>Alternatives to Restraint Attempted *</label>
            <textarea value={form.alternativesAttempted} onChange={e => set("alternativesAttempted", e.target.value)} rows={2}
              placeholder="What alternatives to physical restraint were tried?"
              className={textareaCls} />
          </div>
          <div>
            <label className={labelCls}>Justification for Initiating Restraint *</label>
            <textarea value={form.justification} onChange={e => set("justification", e.target.value)} rows={2}
              placeholder="Explain why physical restraint was necessary — what imminent serious physical harm was the restraint preventing..."
              className={textareaCls} />
          </div>

          {form.incidentType === "physical_restraint" && (
            <ChecklistField label="Procedures / Holds Used (select all that apply)" options={SAFETY_CARE_PROCEDURES} selected={form.proceduresUsed} onChange={v => set("proceduresUsed", v)} />
          )}

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Back</button>
            <button onClick={() => {
              if (!form.behaviorDescription) { setError("Behavior description is required"); return; }
              setError(""); setStep(3);
            }} className="px-5 py-2.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800">Next: Staff & Environment</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800">Staff & Environment — 603 CMR 46.06(4)(a)</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Primary Staff Who Administered *</label>
              <select value={form.primaryStaffId} onChange={e => set("primaryStaffId", e.target.value)} className={inputCls}>
                <option value="">Select staff...</option>
                {(staff || []).map((s: Staff) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.title || s.role}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Principal/Designee Notified</label>
              <input type="text" placeholder="Name of principal or designee" value={form.principalNotifiedName} onChange={e => set("principalNotifiedName", e.target.value)} className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Additional Staff Who Administered</label>
            <div className="flex flex-wrap gap-2">
              {(staff || []).filter(s => String(s.id) !== form.primaryStaffId).map((s: Staff) => (
                <button key={s.id} type="button" onClick={() => toggleStaffMulti("additionalStaffIds", String(s.id))}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${form.additionalStaffIds.includes(String(s.id)) ? "bg-emerald-100 border-emerald-300 text-emerald-800" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                  {s.firstName} {s.lastName}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Observers (staff who witnessed but did not administer)</label>
            <div className="flex flex-wrap gap-2">
              {(staff || []).filter(s => String(s.id) !== form.primaryStaffId && !form.additionalStaffIds.includes(String(s.id))).map((s: Staff) => (
                <button key={s.id} type="button" onClick={() => toggleStaffMulti("observerStaffIds", String(s.id))}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${form.observerStaffIds.includes(String(s.id)) ? "bg-emerald-50 border-emerald-300 text-emerald-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                  {s.firstName} {s.lastName}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-gray-200" />
          <h3 className="text-sm font-semibold text-gray-800">Environment During Incident</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
              <input type="checkbox" checked={form.studentMoved} onChange={e => set("studentMoved", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
              <div>
                <span className="text-sm font-medium text-gray-700">Student was moved</span>
                <p className="text-xs text-gray-500">To a different location during/after</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
              <input type="checkbox" checked={form.roomCleared} onChange={e => set("roomCleared", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
              <div>
                <span className="text-sm font-medium text-gray-700">Room was cleared</span>
                <p className="text-xs text-gray-500">Other students were removed</p>
              </div>
            </label>
          </div>
          {form.studentMoved && (
            <div>
              <label className={labelCls}>Where was the student moved?</label>
              <input type="text" placeholder="e.g., Calm room, hallway, nurse's office" value={form.studentMovedTo} onChange={e => set("studentMovedTo", e.target.value)} className={inputCls} />
            </div>
          )}

          <label className="flex items-center gap-3 p-3 bg-red-50 rounded-lg cursor-pointer hover:bg-red-100/70 transition-colors">
            <input type="checkbox" checked={form.emergencyServicesCalled} onChange={e => set("emergencyServicesCalled", e.target.checked)}
              className="w-4 h-4 rounded border-red-300 text-red-600 focus:ring-red-500" />
            <div>
              <span className="text-sm font-medium text-red-700">Emergency services (911) were called</span>
              <p className="text-xs text-red-600">Police, ambulance, or crisis team dispatched</p>
            </div>
          </label>

          <hr className="border-gray-200" />
          <h3 className="text-sm font-semibold text-gray-800">Resolution & Calming</h3>

          <div>
            <label className={labelCls}>Calming Strategies Used During/After</label>
            <textarea value={form.calmingStrategiesUsed} onChange={e => set("calmingStrategiesUsed", e.target.value)} rows={2}
              placeholder="Describe strategies used to help the student calm..."
              className={textareaCls} />
          </div>
          <div>
            <label className={labelCls}>Student's Physical/Emotional State After</label>
            <textarea value={form.studentStateAfter} onChange={e => set("studentStateAfter", e.target.value)} rows={2}
              placeholder="Describe the student's condition after the restraint ended..."
              className={textareaCls} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Student Returned To</label>
              <select value={form.studentReturnedToActivity} onChange={e => set("studentReturnedToActivity", e.target.value)} className={inputCls}>
                <option value="">Select...</option>
                <option value="classroom">Classroom (same activity)</option>
                <option value="classroom_different">Classroom (different activity)</option>
                <option value="calm_room">Calm/Cool-Down Room</option>
                <option value="counselor">Counselor's Office</option>
                <option value="nurse">Nurse's Office</option>
                <option value="admin_office">Admin Office</option>
                <option value="home">Sent Home</option>
                <option value="hospital">Hospital/ER</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Approximate Time to Calm (minutes)</label>
              <input type="number" min="0" placeholder="Minutes" value={form.timeToCalm} onChange={e => set("timeToCalm", e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Back</button>
            <button onClick={() => setStep(4)} className="px-5 py-2.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800">Next: Injuries & Safety</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800">Injuries & Medical Attention — 603 CMR 46.06(4)(c)-(g)</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
              <input type="checkbox" checked={form.studentInjury} onChange={e => set("studentInjury", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-500" />
              <div>
                <span className="text-sm font-medium text-gray-700">Student sustained injury</span>
                <p className="text-xs text-gray-500">Any visible mark, bruise, or reported pain</p>
              </div>
            </label>
            {form.studentInjury && (
              <textarea value={form.studentInjuryDescription} onChange={e => set("studentInjuryDescription", e.target.value)} rows={2}
                placeholder="Describe student injury in detail (type, location, severity)..." className={textareaCls} />
            )}

            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
              <input type="checkbox" checked={form.staffInjury} onChange={e => set("staffInjury", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-500" />
              <div>
                <span className="text-sm font-medium text-gray-700">Staff sustained injury</span>
                <p className="text-xs text-gray-500">Any injury to staff member(s) during the incident</p>
              </div>
            </label>
            {form.staffInjury && (
              <textarea value={form.staffInjuryDescription} onChange={e => set("staffInjuryDescription", e.target.value)} rows={2}
                placeholder="Describe staff injury in detail..." className={textareaCls} />
            )}

            <label className="flex items-center gap-3 p-3 bg-red-50 rounded-lg cursor-pointer hover:bg-red-100/70 transition-colors">
              <input type="checkbox" checked={form.medicalAttentionRequired} onChange={e => set("medicalAttentionRequired", e.target.checked)}
                className="w-4 h-4 rounded border-red-300 text-red-600 focus:ring-red-500" />
              <div>
                <span className="text-sm font-medium text-red-700">Medical attention required</span>
                <p className="text-xs text-red-600">Nurse visit, 911, or other medical care was needed</p>
              </div>
            </label>
            {form.medicalAttentionRequired && (
              <textarea value={form.medicalDetails} onChange={e => set("medicalDetails", e.target.value)} rows={2}
                placeholder="Describe medical response and treatment..." className="w-full px-3 py-2.5 bg-white border border-red-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none" />
            )}
          </div>

          {(form.studentInjury || form.staffInjury) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-red-800 flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> DESE Injury Reporting Required</p>
              <p className="text-xs text-red-700 mt-1">Per 603 CMR 46.06(7), when a restraint results in injury, a copy of this report must be sent to DESE within 3 school working days, along with the record of restraints for the prior 30 days.</p>
            </div>
          )}

          {form.incidentType === "physical_restraint" && !form.restraintType && (
            <div>
              <label className={labelCls}>Restraint Description</label>
              <textarea value={form.restraintDescription} onChange={e => set("restraintDescription", e.target.value)} rows={2}
                placeholder="Describe the physical hold or intervention used..." className={textareaCls} />
            </div>
          )}

          <div>
            <label className={labelCls}>Additional Notes</label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2}
              placeholder="Any other relevant details..." className={textareaCls} />
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Back</button>
            <button onClick={() => setStep(5)} className="px-5 py-2.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800">Next: Debrief & Submit</button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800">Post-Incident Debrief & Submission</h2>

          <label className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg cursor-pointer hover:bg-emerald-100/70 transition-colors">
            <input type="checkbox" checked={form.debriefConducted} onChange={e => set("debriefConducted", e.target.checked)}
              className="w-4 h-4 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500" />
            <div>
              <span className="text-sm font-medium text-emerald-800">Post-incident debrief conducted</span>
              <p className="text-xs text-emerald-700">Staff debrief to review what happened and prevent future incidents</p>
            </div>
          </label>
          {form.debriefConducted && (
            <div className="space-y-3 ml-4">
              <div>
                <label className={labelCls}>Debrief Date</label>
                <input type="date" value={form.debriefDate} onChange={e => set("debriefDate", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Debrief Notes / Key Takeaways</label>
                <textarea value={form.debriefNotes} onChange={e => set("debriefNotes", e.target.value)} rows={3}
                  placeholder="What was discussed? What changes will be made? What prevention strategies identified?"
                  className={textareaCls} />
              </div>
            </div>
          )}

          <hr className="border-gray-200" />

          <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-sm">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Summary Review</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-gray-500">Student:</span> <span className="font-medium text-gray-800">{students?.find((s: any) => s.id === Number(form.studentId))?.firstName} {students?.find((s: any) => s.id === Number(form.studentId))?.lastName}</span></div>
              <div><span className="text-gray-500">Type:</span> <span className="font-medium text-gray-800">{TYPE_LABELS[form.incidentType]}</span></div>
              <div><span className="text-gray-500">Date:</span> <span className="font-medium text-gray-800">{formatDate(form.incidentDate)}</span></div>
              <div><span className="text-gray-500">Time:</span> <span className="font-medium text-gray-800">{form.incidentTime ? formatTime(form.incidentTime) : "—"}{form.endTime ? ` – ${formatTime(form.endTime)}` : ""}</span></div>
              {form.location && <div><span className="text-gray-500">Location:</span> <span className="font-medium text-gray-800">{form.location}</span></div>}
              {form.restraintType && <div><span className="text-gray-500">Restraint:</span> <span className="font-medium text-gray-800">{RESTRAINT_TYPES[form.restraintType]}</span></div>}
              {form.bodyPosition && <div><span className="text-gray-500">Body Position:</span> <span className="font-medium text-gray-800">{BODY_POSITIONS[form.bodyPosition]}</span></div>}
              {form.antecedentCategory && <div><span className="text-gray-500">Antecedent:</span> <span className="font-medium text-gray-800">{ANTECEDENT_CATEGORIES[form.antecedentCategory]}</span></div>}
              {form.bipInPlace && <div className="col-span-2"><span className="text-emerald-600 font-medium">BIP in place</span></div>}
            </div>
            {form.deescalationStrategies.length > 0 && (
              <div><span className="text-gray-500">De-escalation:</span> <p className="text-gray-700 mt-1">{form.deescalationStrategies.join(", ")}</p></div>
            )}
            {form.proceduresUsed.length > 0 && (
              <div><span className="text-gray-500">Procedures:</span> <p className="text-gray-700 mt-1">{form.proceduresUsed.join(", ")}</p></div>
            )}
            {(form.studentInjury || form.staffInjury) && (
              <div className="bg-red-50 rounded p-2">
                {form.studentInjury && <p className="text-red-700">Student injury: {form.studentInjuryDescription || "Yes"}</p>}
                {form.staffInjury && <p className="text-red-700">Staff injury: {form.staffInjuryDescription || "Yes"}</p>}
                {form.medicalAttentionRequired && <p className="text-red-700 font-medium">Medical attention required: {form.medicalDetails || "Yes"}</p>}
              </div>
            )}
            {form.continuedOver20Min && (
              <div className="bg-amber-50 rounded p-2">
                <p className="text-amber-700 font-medium">Restraint exceeded 20 minutes — approved by: {form.over20MinApproverName || "Not specified"}</p>
              </div>
            )}
            {(form.studentMoved || form.roomCleared || form.emergencyServicesCalled) && (
              <div className="flex gap-3 flex-wrap text-xs">
                {form.studentMoved && <span className="bg-gray-200 rounded px-2 py-1">Student moved{form.studentMovedTo ? `: ${form.studentMovedTo}` : ""}</span>}
                {form.roomCleared && <span className="bg-gray-200 rounded px-2 py-1">Room cleared</span>}
                {form.emergencyServicesCalled && <span className="bg-red-200 text-red-800 rounded px-2 py-1">Emergency services called</span>}
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><PenLine className="w-4 h-4" /> Reporting Staff Signature</h3>
            <p className="text-xs text-gray-500">By typing your name, you attest that this report is accurate and complete. All involved staff and administrators will be automatically notified to provide their signatures.</p>
            <input type="text" placeholder="Type your full name to sign" value={form.reportingStaffSignature} onChange={e => set("reportingStaffSignature", e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 font-medium italic" />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <p className="font-semibold flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> After Submission: Signature Requests</p>
            <ul className="mt-1.5 space-y-0.5 ml-5 list-disc">
              <li>All involved staff (primary, additional, observers) will be asked to sign</li>
              <li>Administrators will receive a signature request for review and approval</li>
              <li>Written report to parent due within <strong>3 school working days</strong></li>
              <li>Verbal parent/guardian notification within <strong>24 hours</strong></li>
              {(form.studentInjury || form.staffInjury) && (
                <li className="text-red-700 font-medium">DESE injury report required within <strong>3 school working days</strong></li>
              )}
            </ul>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(4)} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Back</button>
            <button onClick={() => {
              if (!form.studentId || !form.incidentTime || !form.incidentDate) { setError("Go back and complete required fields"); return; }
              if (!form.behaviorDescription) { setError("Go back to Step 2 and complete the behavior description"); return; }
              mutation.mutate();
            }} disabled={mutation.isPending}
              className="px-6 py-2.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 disabled:opacity-50 flex items-center gap-2">
              {mutation.isPending ? "Submitting..." : "Submit Incident Report"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
