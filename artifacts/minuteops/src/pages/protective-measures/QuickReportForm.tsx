import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send, Zap } from "lucide-react";
import { listStudents, listStaff, createProtectiveIncident } from "@workspace/api-client-react";
import { toast } from "sonner";
import { Staff, inputCls, labelCls, textareaCls } from "@/pages/protective-measures/constants";

export function QuickReportForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    studentId: "",
    incidentDate: new Date().toISOString().split("T")[0],
    incidentTime: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    incidentType: "physical_restraint",
    behaviorDescription: "",
    primaryStaffId: "",
    studentInjury: false,
    staffInjury: false,
  });
  const [error, setError] = useState("");

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
      const res = await createProtectiveIncident({
        studentId: Number(form.studentId),
        incidentDate: form.incidentDate,
        incidentTime: form.incidentTime,
        incidentType: form.incidentType,
        behaviorDescription: form.behaviorDescription,
        primaryStaffId: form.primaryStaffId ? Number(form.primaryStaffId) : null,
        studentInjury: form.studentInjury,
        staffInjury: form.staffInjury,
        draftSource: "quick",
        notes: "[Quick Report] — expand to add full details",
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["protective-incidents"] });
      queryClient.invalidateQueries({ queryKey: ["protective-summary"] });
      toast.success("Quick report saved as draft");
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  return (
    <div className="p-4 md:p-8 max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-500" /> Quick Report
          </h1>
          <p className="text-sm text-gray-500">Capture the essentials now — add full details later</p>
        </div>
      </div>

      <div className="flex gap-1 mb-4">
        {["Incident Basics", "Staff & Injuries"].map((label, i) => (
          <div key={i} className="flex-1">
            <div className={`h-1.5 rounded-full ${i < step ? "bg-amber-500" : "bg-gray-200"}`} />
            <p className={`text-[10px] mt-1 text-center ${i < step ? "text-amber-700 font-medium" : "text-gray-400"}`}>{label}</p>
          </div>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      {step === 1 && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800">What happened?</h2>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Student *</label>
              <select value={form.studentId} onChange={e => set("studentId", e.target.value)} className={inputCls}>
                <option value="">Select student...</option>
                {(students || []).map((s: any) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — Grade {s.grade}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Date *</label>
                <input type="date" value={form.incidentDate} onChange={e => set("incidentDate", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Time *</label>
                <input type="time" value={form.incidentTime} onChange={e => set("incidentTime", e.target.value)} className={inputCls} />
              </div>
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
              <label className={labelCls}>Brief Description *</label>
              <textarea value={form.behaviorDescription} onChange={e => set("behaviorDescription", e.target.value)} rows={3}
                placeholder="What behavior prompted this incident? (You can add more detail later)"
                className={textareaCls} />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={() => {
              if (!form.studentId || !form.incidentDate || !form.incidentTime || !form.behaviorDescription.trim()) {
                setError("Please fill in all required fields"); return;
              }
              setError(""); setStep(2);
            }} className="px-5 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600">
              Next: Staff & Injuries
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-800">Who was involved?</h2>
          <div className="space-y-4">
            <div>
              <label className={labelCls}>Primary Staff Who Administered</label>
              <select value={form.primaryStaffId} onChange={e => set("primaryStaffId", e.target.value)} className={inputCls}>
                <option value="">Select staff...</option>
                {(staff || []).map((s: Staff) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.title || s.role}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
              <input type="checkbox" checked={form.studentInjury} onChange={e => set("studentInjury", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-500" />
              <div>
                <span className="text-sm font-medium text-gray-700">Student sustained injury</span>
                <p className="text-xs text-gray-500">Any visible mark, bruise, or reported pain</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
              <input type="checkbox" checked={form.staffInjury} onChange={e => set("staffInjury", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-500" />
              <div>
                <span className="text-sm font-medium text-gray-700">Staff sustained injury</span>
                <p className="text-xs text-gray-500">Any injury to staff member(s) during the incident</p>
              </div>
            </label>
          </div>

          {(form.studentInjury || form.staffInjury) && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-red-800 flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> DESE Injury Reporting Required</p>
              <p className="text-xs text-red-700 mt-1">Per 603 CMR 46.06(7), a DESE report will be required within 3 school working days.</p>
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800">
              <span className="font-semibold">This creates a draft report.</span> You can open the draft later to add full 603 CMR 46.06 details including de-escalation strategies, staff signatures, and parent notifications.
            </p>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">Back</button>
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
              className="px-6 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2">
              {mutation.isPending ? "Saving..." : "Save Quick Report"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
