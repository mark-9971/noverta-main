import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, Plus, AlertTriangle, Clock, User, Search,
  ChevronRight, FileText, Bell, CheckCircle, XCircle,
  Filter, Calendar, Eye, ChevronDown, ChevronUp,
  ArrowLeft, TrendingUp, Download, PenLine, Send
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

type Incident = {
  id: number;
  studentId: number;
  studentFirstName: string;
  studentLastName: string;
  studentGrade: string;
  incidentDate: string;
  incidentTime: string;
  endTime: string | null;
  durationMinutes: number | null;
  incidentType: string;
  location: string | null;
  behaviorDescription: string;
  restraintType: string | null;
  primaryStaffId: number | null;
  studentInjury: boolean;
  staffInjury: boolean;
  medicalAttentionRequired: boolean;
  parentNotified: boolean;
  parentNotifiedAt: string | null;
  parentVerbalNotification: boolean;
  writtenReportSent: boolean;
  adminReviewedBy: number | null;
  adminReviewedAt: string | null;
  deseReportRequired: boolean;
  deseReportSentAt: string | null;
  status: string;
  createdAt: string;
};

type Summary = {
  totalIncidents: number;
  byType: { physical_restraint: number; seclusion: number; time_out: number };
  pendingReview: number;
  parentNotificationsPending: number;
  writtenReportsPending: number;
  injuries: number;
  deseReportsPending: number;
  averageRestraintDurationMinutes: number;
  studentsWithMultipleIncidents: { studentId: number; count: number }[];
  monthlyBreakdown: Record<string, { restraints: number; seclusions: number; timeouts: number; total: number }>;
};

type IncidentDetail = any;
type Staff = { id: number; firstName: string; lastName: string; role: string; title: string };

const TYPE_LABELS: Record<string, string> = {
  physical_restraint: "Physical Restraint",
  seclusion: "Seclusion",
  time_out: "Time-Out",
};
const TYPE_COLORS: Record<string, string> = {
  physical_restraint: "bg-red-100 text-red-700",
  seclusion: "bg-orange-100 text-orange-700",
  time_out: "bg-amber-100 text-amber-700",
};
const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending Review",
  reviewed: "Reviewed",
  closed: "Closed",
};
const STATUS_COLORS: Record<string, string> = {
  pending_review: "bg-amber-100 text-amber-700",
  reviewed: "bg-emerald-100 text-emerald-700",
  closed: "bg-slate-100 text-slate-600",
};
const RESTRAINT_TYPES: Record<string, string> = {
  floor: "Floor Restraint",
  seated: "Seated Restraint",
  standing: "Standing Restraint",
  escort: "Physical Escort",
  other: "Other",
};

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

function hoursUntilDeadline(incidentDate: string, incidentTime: string) {
  const incidentTs = new Date(`${incidentDate}T${incidentTime}`).getTime();
  const deadline = incidentTs + 24 * 60 * 60 * 1000;
  const now = Date.now();
  return Math.round((deadline - now) / (60 * 60 * 1000));
}

export default function ProtectiveMeasuresPage() {
  const [view, setView] = useState<"list" | "new" | "detail">("list");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  if (view === "new") return <NewIncidentForm onClose={() => setView("list")} />;
  if (view === "detail" && detailId) return <IncidentDetailView id={detailId} onBack={() => { setView("list"); setDetailId(null); }} />;

  return <IncidentList
    filterType={filterType} setFilterType={setFilterType}
    filterStatus={filterStatus} setFilterStatus={setFilterStatus}
    searchTerm={searchTerm} setSearchTerm={setSearchTerm}
    onNew={() => setView("new")}
    onDetail={(id: number) => { setDetailId(id); setView("detail"); }}
  />;
}

function IncidentList({ filterType, setFilterType, filterStatus, setFilterStatus, searchTerm, setSearchTerm, onNew, onDetail }: {
  filterType: string; setFilterType: (v: string) => void;
  filterStatus: string; setFilterStatus: (v: string) => void;
  searchTerm: string; setSearchTerm: (v: string) => void;
  onNew: () => void;
  onDetail: (id: number) => void;
}) {
  const [exportYear, setExportYear] = useState("2025-2026");

  const { data: incidents = [], isLoading } = useQuery<Incident[]>({
    queryKey: ["protective-incidents", filterType, filterStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterType !== "all") params.set("incidentType", filterType);
      if (filterStatus !== "all") params.set("status", filterStatus);
      return fetch(`${API}/api/protective-measures/incidents?${params}`).then(r => r.json());
    },
  });

  const { data: summary } = useQuery<Summary>({
    queryKey: ["protective-summary"],
    queryFn: () => fetch(`${API}/api/protective-measures/summary`).then(r => r.json()),
  });

  const filtered = useMemo(() => {
    if (!searchTerm) return incidents;
    const lower = searchTerm.toLowerCase();
    return incidents.filter(i =>
      `${i.studentFirstName} ${i.studentLastName}`.toLowerCase().includes(lower) ||
      i.behaviorDescription.toLowerCase().includes(lower)
    );
  }, [incidents, searchTerm]);

  const handleDeseExport = () => {
    window.open(`${API}/api/protective-measures/dese-export?schoolYear=${exportYear}`, "_blank");
  };

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-indigo-600" />
            Protective Measures
          </h1>
          <p className="text-sm text-slate-500 mt-1">603 CMR 46.00 Restraint & Seclusion Tracking — MA DESE Compliant</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
            <select value={exportYear} onChange={e => setExportYear(e.target.value)}
              className="text-xs bg-transparent border-none focus:outline-none text-slate-600">
              <option value="2025-2026">SY 2025-26</option>
              <option value="2024-2025">SY 2024-25</option>
              <option value="2023-2024">SY 2023-24</option>
            </select>
            <button onClick={handleDeseExport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 transition-colors">
              <Download className="w-3.5 h-3.5" /> DESE Export
            </button>
          </div>
          <button onClick={onNew} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Report Incident
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <SummaryCard label="Total Incidents" value={summary.totalIncidents} icon={<Shield className="w-4 h-4 text-slate-400" />} />
          <SummaryCard label="Restraints" value={summary.byType.physical_restraint} icon={<AlertTriangle className="w-4 h-4 text-red-400" />} color="text-red-600" />
          <SummaryCard label="Seclusions" value={summary.byType.seclusion} icon={<AlertTriangle className="w-4 h-4 text-orange-400" />} color="text-orange-600" />
          <SummaryCard label="Pending Review" value={summary.pendingReview} icon={<Clock className="w-4 h-4 text-amber-400" />} color={summary.pendingReview > 0 ? "text-amber-600" : "text-slate-600"} />
          <SummaryCard label="Parent Notice Due" value={summary.parentNotificationsPending} icon={<Bell className="w-4 h-4 text-red-400" />} color={summary.parentNotificationsPending > 0 ? "text-red-600" : "text-slate-600"} />
          <SummaryCard label="Written Reports Due" value={summary.writtenReportsPending} icon={<FileText className="w-4 h-4 text-amber-400" />} color={summary.writtenReportsPending > 0 ? "text-amber-600" : "text-slate-600"} />
          <SummaryCard label="DESE Reports Due" value={summary.deseReportsPending} icon={<Send className="w-4 h-4 text-red-400" />} color={summary.deseReportsPending > 0 ? "text-red-600" : "text-slate-600"} />
        </div>
      )}

      {summary && summary.studentsWithMultipleIncidents.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-amber-800 text-sm font-semibold mb-1">
            <AlertTriangle className="w-4 h-4" />
            Weekly Review Required: Students with 3+ incidents
          </div>
          <p className="text-xs text-amber-700">
            {summary.studentsWithMultipleIncidents.length} student{summary.studentsWithMultipleIncidents.length > 1 ? "s" : ""} require review team assessment per 603 CMR 46.06(5).
          </p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" placeholder="Search by student name or description..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
        </div>
        <div className="flex gap-2">
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
            <option value="all">All Types</option>
            <option value="physical_restraint">Physical Restraint</option>
            <option value="seclusion">Seclusion</option>
            <option value="time_out">Time-Out</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/20">
            <option value="all">All Status</option>
            <option value="pending_review">Pending Review</option>
            <option value="reviewed">Reviewed</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-slate-400">Loading incidents...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No incidents recorded</p>
            <p className="text-xs text-slate-400 mt-1">Use "Report Incident" to document a restraint, seclusion, or time-out event</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map(inc => (
              <button key={inc.id} onClick={() => onDetail(inc.id)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50/60 transition-colors text-left">
                <div className="flex-shrink-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${inc.incidentType === "physical_restraint" ? "bg-red-100" : inc.incidentType === "seclusion" ? "bg-orange-100" : "bg-amber-100"}`}>
                    <Shield className={`w-5 h-5 ${inc.incidentType === "physical_restraint" ? "text-red-600" : inc.incidentType === "seclusion" ? "text-orange-600" : "text-amber-600"}`} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-slate-800">{inc.studentFirstName} {inc.studentLastName}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[inc.incidentType] || "bg-slate-100 text-slate-600"}`}>
                      {TYPE_LABELS[inc.incidentType] || inc.incidentType}
                    </span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[inc.status] || "bg-slate-100 text-slate-600"}`}>
                      {STATUS_LABELS[inc.status] || inc.status}
                    </span>
                    {inc.deseReportRequired && !inc.deseReportSentAt && (
                      <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">DESE DUE</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1 truncate">{inc.behaviorDescription}</p>
                </div>
                <div className="flex-shrink-0 text-right space-y-1">
                  <p className="text-xs font-medium text-slate-700">{formatDate(inc.incidentDate)}</p>
                  <p className="text-[11px] text-slate-400">{formatTime(inc.incidentTime)}{inc.durationMinutes ? ` · ${inc.durationMinutes} min` : ""}</p>
                </div>
                <div className="flex-shrink-0 flex items-center gap-2">
                  {inc.studentInjury && <span className="w-2 h-2 rounded-full bg-red-500" title="Student injury" />}
                  {inc.staffInjury && <span className="w-2 h-2 rounded-full bg-orange-500" title="Staff injury" />}
                  {!inc.parentVerbalNotification && (
                    <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                      {hoursUntilDeadline(inc.incidentDate, inc.incidentTime) > 0
                        ? `${hoursUntilDeadline(inc.incidentDate, inc.incidentTime)}h left`
                        : "OVERDUE"}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-[11px] text-slate-500 font-medium">{label}</span></div>
      <p className={`text-xl font-bold ${color || "text-slate-800"}`}>{value}</p>
    </div>
  );
}

function NewIncidentForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    studentId: "",
    incidentDate: new Date().toISOString().split("T")[0],
    incidentTime: "",
    endTime: "",
    incidentType: "physical_restraint",
    location: "",
    precedingActivity: "",
    triggerDescription: "",
    behaviorDescription: "",
    deescalationAttempts: "",
    alternativesAttempted: "",
    justification: "",
    restraintType: "",
    restraintDescription: "",
    primaryStaffId: "",
    additionalStaffIds: [] as string[],
    observerStaffIds: [] as string[],
    principalNotifiedName: "",
    continuedOver20Min: false,
    over20MinApproverName: "",
    calmingStrategiesUsed: "",
    studentStateAfter: "",
    studentInjury: false,
    studentInjuryDescription: "",
    staffInjury: false,
    staffInjuryDescription: "",
    medicalAttentionRequired: false,
    medicalDetails: "",
    reportingStaffSignature: "",
    notes: "",
  });
  const [error, setError] = useState("");

  const { data: students = [] } = useQuery<any[]>({
    queryKey: ["students-list"],
    queryFn: () => fetch(`${API}/api/students`).then(r => r.json()),
  });

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["staff-list"],
    queryFn: () => fetch(`${API}/api/staff`).then(r => r.json()),
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const dur = form.incidentTime && form.endTime ? (() => {
        const [sh, sm] = form.incidentTime.split(":").map(Number);
        const [eh, em] = form.endTime.split(":").map(Number);
        return (eh * 60 + em) - (sh * 60 + sm);
      })() : null;

      const res = await fetch(`${API}/api/protective-measures/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          studentId: Number(form.studentId),
          primaryStaffId: form.primaryStaffId ? Number(form.primaryStaffId) : null,
          additionalStaffIds: form.additionalStaffIds.length > 0 ? form.additionalStaffIds.map(Number) : null,
          observerStaffIds: form.observerStaffIds.length > 0 ? form.observerStaffIds.map(Number) : null,
          durationMinutes: dur && dur > 0 ? dur : null,
          reportingStaffSignedAt: form.reportingStaffSignature ? new Date().toISOString() : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to create incident");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["protective-incidents"] });
      queryClient.invalidateQueries({ queryKey: ["protective-summary"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const set = (key: string, val: any) => setForm(f => ({ ...f, [key]: val }));

  const toggleStaffMulti = (field: "additionalStaffIds" | "observerStaffIds", staffId: string) => {
    setForm(f => {
      const arr = f[field];
      return { ...f, [field]: arr.includes(staffId) ? arr.filter(x => x !== staffId) : [...arr, staffId] };
    });
  };

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Report Incident</h1>
          <p className="text-sm text-slate-500">603 CMR 46.06 Compliant Documentation</p>
        </div>
      </div>

      <div className="flex gap-1.5 mb-4">
        {["Incident", "Context & Staff", "Injuries", "Signatures & Submit"].map((label, i) => (
          <div key={i} className="flex-1">
            <div className={`h-1.5 rounded-full ${i < step ? "bg-indigo-500" : "bg-slate-200"}`} />
            <p className={`text-[10px] mt-1 text-center ${i < step ? "text-indigo-600 font-medium" : "text-slate-400"}`}>{label}</p>
          </div>
        ))}
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}

      {step === 1 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-800">Incident Details — 603 CMR 46.06(4)(a)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Student *</label>
              <select value={form.studentId} onChange={e => set("studentId", e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400">
                <option value="">Select student...</option>
                {(students || []).map((s: any) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — Grade {s.grade}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Incident Type *</label>
              <select value={form.incidentType} onChange={e => set("incidentType", e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400">
                <option value="physical_restraint">Physical Restraint</option>
                <option value="seclusion">Seclusion (Emergency Only)</option>
                <option value="time_out">Time-Out (Exclusionary)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Date *</label>
              <input type="date" value={form.incidentDate} onChange={e => set("incidentDate", e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Time Restraint Began *</label>
              <input type="time" value={form.incidentTime} onChange={e => set("incidentTime", e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Time Restraint Ended *</label>
              <input type="time" value={form.endTime} onChange={e => set("endTime", e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Location</label>
              <input type="text" placeholder="e.g., Classroom 204, Hallway" value={form.location} onChange={e => set("location", e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
            </div>
            {form.incidentType === "physical_restraint" && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Type of Restraint</label>
                <select value={form.restraintType} onChange={e => set("restraintType", e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400">
                  <option value="">Select type...</option>
                  {Object.entries(RESTRAINT_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Principal/Designee Notified</label>
              <input type="text" placeholder="Name of principal or designee verbally informed" value={form.principalNotifiedName} onChange={e => set("principalNotifiedName", e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400" />
            </div>
          </div>

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
            }} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              Next: Context & Staff
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-800">Behavioral Context — 603 CMR 46.06(4)(b)</h2>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Activity Preceding Incident *</label>
            <textarea value={form.precedingActivity} onChange={e => set("precedingActivity", e.target.value)} rows={2}
              placeholder="Describe the activity the student and others were engaged in immediately before the restraint..."
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Behavior That Prompted Restraint *</label>
            <textarea value={form.behaviorDescription} onChange={e => set("behaviorDescription", e.target.value)} rows={3}
              placeholder="Describe the specific behavior that posed a threat of imminent, serious physical harm..."
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">De-escalation Strategies Used *</label>
            <textarea value={form.deescalationAttempts} onChange={e => set("deescalationAttempts", e.target.value)} rows={2}
              placeholder="List all specific de-escalation strategies attempted before physical intervention (e.g., verbal redirection, offering breaks, sensory tools)..."
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Alternatives to Restraint Attempted *</label>
            <textarea value={form.alternativesAttempted} onChange={e => set("alternativesAttempted", e.target.value)} rows={2}
              placeholder="What alternatives to physical restraint were tried? (e.g., moved other students, offered choice, called crisis team)..."
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Justification for Initiating Restraint *</label>
            <textarea value={form.justification} onChange={e => set("justification", e.target.value)} rows={2}
              placeholder="Explain why physical restraint was necessary — what imminent serious physical harm was the restraint preventing..."
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Calming Strategies Used During/After</label>
            <textarea value={form.calmingStrategiesUsed} onChange={e => set("calmingStrategiesUsed", e.target.value)} rows={2}
              placeholder="Describe strategies used to help the student calm (e.g., deep breathing prompts, reduced demands, quiet space)..."
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Student's Physical/Emotional State After</label>
            <textarea value={form.studentStateAfter} onChange={e => set("studentStateAfter", e.target.value)} rows={2}
              placeholder="Describe the student's condition after the restraint ended..."
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>

          <hr className="border-slate-200" />
          <h3 className="text-sm font-semibold text-slate-800">Staff Involved — 603 CMR 46.06(4)(a)</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Primary Staff Who Administered *</label>
              <select value={form.primaryStaffId} onChange={e => set("primaryStaffId", e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400">
                <option value="">Select staff...</option>
                {(staff || []).map((s: Staff) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.title || s.role}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Additional Staff Who Administered</label>
            <div className="flex flex-wrap gap-2">
              {(staff || []).filter(s => String(s.id) !== form.primaryStaffId).map((s: Staff) => (
                <button key={s.id} type="button" onClick={() => toggleStaffMulti("additionalStaffIds", String(s.id))}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${form.additionalStaffIds.includes(String(s.id)) ? "bg-indigo-100 border-indigo-300 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                  {s.firstName} {s.lastName}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Observers (staff who witnessed but did not administer)</label>
            <div className="flex flex-wrap gap-2">
              {(staff || []).filter(s => String(s.id) !== form.primaryStaffId && !form.additionalStaffIds.includes(String(s.id))).map((s: Staff) => (
                <button key={s.id} type="button" onClick={() => toggleStaffMulti("observerStaffIds", String(s.id))}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${form.observerStaffIds.includes(String(s.id)) ? "bg-blue-100 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                  {s.firstName} {s.lastName}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Trigger / Antecedent Events</label>
            <textarea value={form.triggerDescription} onChange={e => set("triggerDescription", e.target.value)} rows={2}
              placeholder="What happened immediately before the incident?"
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Back</button>
            <button onClick={() => {
              if (!form.behaviorDescription) { setError("Behavior description is required"); return; }
              setError(""); setStep(3);
            }} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Next: Injuries & Safety</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-800">Injuries & Medical Attention — 603 CMR 46.06(4)(c)-(g)</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
              <input type="checkbox" checked={form.studentInjury} onChange={e => set("studentInjury", e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              <div>
                <span className="text-sm font-medium text-slate-700">Student sustained injury</span>
                <p className="text-xs text-slate-500">Any visible mark, bruise, or reported pain</p>
              </div>
            </label>
            {form.studentInjury && (
              <textarea value={form.studentInjuryDescription} onChange={e => set("studentInjuryDescription", e.target.value)} rows={2}
                placeholder="Describe student injury in detail (type, location, severity)..." className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
            )}

            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
              <input type="checkbox" checked={form.staffInjury} onChange={e => set("staffInjury", e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
              <div>
                <span className="text-sm font-medium text-slate-700">Staff sustained injury</span>
                <p className="text-xs text-slate-500">Any injury to staff member(s) during the incident</p>
              </div>
            </label>
            {form.staffInjury && (
              <textarea value={form.staffInjuryDescription} onChange={e => set("staffInjuryDescription", e.target.value)} rows={2}
                placeholder="Describe staff injury in detail (type, location, severity)..." className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
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
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-purple-800 flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> DESE Injury Reporting Required</p>
              <p className="text-xs text-purple-700 mt-1">Per 603 CMR 46.06(7), when a restraint results in injury, a copy of this report must be sent to DESE within 3 school working days, along with the record of restraints for the prior 30 days.</p>
            </div>
          )}

          {form.incidentType === "physical_restraint" && !form.restraintType && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Restraint Description</label>
              <textarea value={form.restraintDescription} onChange={e => set("restraintDescription", e.target.value)} rows={2}
                placeholder="Describe the physical hold or intervention used..." className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Additional Notes</label>
            <textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2}
              placeholder="Any other relevant details..." className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 resize-none" />
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Back</button>
            <button onClick={() => setStep(4)} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Next: Sign & Submit</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-800">Review, Sign & Submit</h2>

          <div className="bg-slate-50 rounded-lg p-4 space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-slate-500">Student:</span> <span className="font-medium text-slate-800">{students?.find((s: any) => s.id === Number(form.studentId))?.firstName} {students?.find((s: any) => s.id === Number(form.studentId))?.lastName}</span></div>
              <div><span className="text-slate-500">Type:</span> <span className="font-medium text-slate-800">{TYPE_LABELS[form.incidentType]}</span></div>
              <div><span className="text-slate-500">Date:</span> <span className="font-medium text-slate-800">{formatDate(form.incidentDate)}</span></div>
              <div><span className="text-slate-500">Time:</span> <span className="font-medium text-slate-800">{form.incidentTime ? formatTime(form.incidentTime) : "—"}{form.endTime ? ` – ${formatTime(form.endTime)}` : ""}</span></div>
              {form.location && <div><span className="text-slate-500">Location:</span> <span className="font-medium text-slate-800">{form.location}</span></div>}
              {form.restraintType && <div><span className="text-slate-500">Restraint:</span> <span className="font-medium text-slate-800">{RESTRAINT_TYPES[form.restraintType]}</span></div>}
              {form.principalNotifiedName && <div className="col-span-2"><span className="text-slate-500">Principal Notified:</span> <span className="font-medium text-slate-800">{form.principalNotifiedName}</span></div>}
            </div>
            {form.precedingActivity && <div><span className="text-slate-500">Preceding Activity:</span> <p className="text-slate-700 mt-1">{form.precedingActivity}</p></div>}
            {form.behaviorDescription && <div><span className="text-slate-500">Behavior:</span> <p className="text-slate-700 mt-1">{form.behaviorDescription}</p></div>}
            {form.deescalationAttempts && <div><span className="text-slate-500">De-escalation:</span> <p className="text-slate-700 mt-1">{form.deescalationAttempts}</p></div>}
            {form.alternativesAttempted && <div><span className="text-slate-500">Alternatives Attempted:</span> <p className="text-slate-700 mt-1">{form.alternativesAttempted}</p></div>}
            {form.justification && <div><span className="text-slate-500">Justification:</span> <p className="text-slate-700 mt-1">{form.justification}</p></div>}
            {form.calmingStrategiesUsed && <div><span className="text-slate-500">Calming Strategies:</span> <p className="text-slate-700 mt-1">{form.calmingStrategiesUsed}</p></div>}
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
          </div>

          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><PenLine className="w-4 h-4" /> Reporting Staff Signature</h3>
            <p className="text-xs text-slate-500">By typing your name, you attest that this report is accurate and complete to the best of your knowledge.</p>
            <input type="text" placeholder="Type your full name to sign" value={form.reportingStaffSignature} onChange={e => set("reportingStaffSignature", e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-medium italic" />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            <p className="font-semibold flex items-center gap-1.5"><Bell className="w-3.5 h-3.5" /> 603 CMR 46.06 Compliance Requirements</p>
            <ul className="mt-1.5 space-y-0.5 ml-5 list-disc">
              <li>Written report to principal: Due by <strong>next school working day</strong></li>
              <li>Verbal parent/guardian notification: Within <strong>24 hours</strong></li>
              <li>Written report to parent: Within <strong>3 school working days</strong> (email or mail)</li>
              <li>Parent must be offered opportunity to <strong>comment orally and in writing</strong></li>
              {(form.studentInjury || form.staffInjury) && (
                <li className="text-red-700 font-medium">DESE injury report required within <strong>3 school working days</strong> with 30-day prior restraint log</li>
              )}
            </ul>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(3)} className="px-5 py-2.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200">Back</button>
            <button onClick={() => {
              if (!form.studentId || !form.incidentTime || !form.incidentDate) { setError("Go back to Step 1 and complete student/date/time fields"); return; }
              if (!form.behaviorDescription) { setError("Go back to Step 2 and complete the behavior description"); return; }
              mutation.mutate();
            }} disabled={mutation.isPending}
              className="px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
              {mutation.isPending ? "Submitting..." : "Submit Incident Report"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function IncidentDetailView({ id, onBack }: { id: number; onBack: () => void }) {
  const queryClient = useQueryClient();

  const { data: incident, isLoading } = useQuery<IncidentDetail>({
    queryKey: ["protective-incident", id],
    queryFn: () => fetch(`${API}/api/protective-measures/incidents/${id}`).then(r => r.json()),
  });

  const { data: staff = [] } = useQuery<Staff[]>({
    queryKey: ["staff-list"],
    queryFn: () => fetch(`${API}/api/staff`).then(r => r.json()),
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["protective-incident", id] });
    queryClient.invalidateQueries({ queryKey: ["protective-incidents"] });
    queryClient.invalidateQueries({ queryKey: ["protective-summary"] });
  };

  const reviewMutation = useMutation({
    mutationFn: async (data: { adminStaffId: number; notes: string; signature: string }) => {
      const res = await fetch(`${API}/api/protective-measures/incidents/${id}/admin-review`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const notifyMutation = useMutation({
    mutationFn: async (data: { notifiedById: number; method: string; verbal?: boolean }) => {
      const res = await fetch(`${API}/api/protective-measures/incidents/${id}/parent-notification`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const writtenReportMutation = useMutation({
    mutationFn: async (method: string) => {
      const res = await fetch(`${API}/api/protective-measures/incidents/${id}/written-report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const deseMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/protective-measures/incidents/${id}/dese-report`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thirtyDayLogSent: true }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const signatureMutation = useMutation({
    mutationFn: async (data: { type: string; name: string }) => {
      const res = await fetch(`${API}/api/protective-measures/incidents/${id}/signature`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const commentMutation = useMutation({
    mutationFn: async (data: { parentComment?: string; studentComment?: string }) => {
      const res = await fetch(`${API}/api/protective-measures/incidents/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, parentCommentOpportunityGiven: true }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const [reviewForm, setReviewForm] = useState({ adminStaffId: "", notes: "", signature: "" });
  const [notifyForm, setNotifyForm] = useState({ staffId: "", method: "phone" });
  const [writtenMethod, setWrittenMethod] = useState("email");
  const [showReview, setShowReview] = useState(false);
  const [showNotify, setShowNotify] = useState(false);
  const [showWritten, setShowWritten] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [commentForm, setCommentForm] = useState({ parentComment: "", studentComment: "" });

  if (isLoading) return <div className="p-8 text-center text-sm text-slate-400">Loading...</div>;
  if (!incident) return <div className="p-8 text-center text-sm text-red-500">Incident not found</div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"><ArrowLeft className="w-5 h-5" /></button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-800">Incident #{incident.id}</h1>
          <p className="text-sm text-slate-500">{incident.student?.firstName} {incident.student?.lastName} — {formatDate(incident.incidentDate)}</p>
        </div>
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${STATUS_COLORS[incident.status]}`}>{STATUS_LABELS[incident.status]}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">Incident Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500 text-xs">Type</span><p className="font-medium">{TYPE_LABELS[incident.incidentType]}</p></div>
              <div><span className="text-slate-500 text-xs">Date & Time</span><p className="font-medium">{formatDate(incident.incidentDate)} at {formatTime(incident.incidentTime)}{incident.endTime ? ` – ${formatTime(incident.endTime)}` : ""}</p></div>
              {incident.durationMinutes && <div><span className="text-slate-500 text-xs">Duration</span><p className="font-medium">{incident.durationMinutes} minutes</p></div>}
              {incident.location && <div><span className="text-slate-500 text-xs">Location</span><p className="font-medium">{incident.location}</p></div>}
              {incident.restraintType && <div><span className="text-slate-500 text-xs">Restraint Type</span><p className="font-medium">{RESTRAINT_TYPES[incident.restraintType] || incident.restraintType}</p></div>}
              {incident.primaryStaff && <div><span className="text-slate-500 text-xs">Primary Staff</span><p className="font-medium">{incident.primaryStaff.firstName} {incident.primaryStaff.lastName} — {incident.primaryStaff.title || incident.primaryStaff.role}</p></div>}
              {incident.principalNotifiedName && <div><span className="text-slate-500 text-xs">Principal Notified</span><p className="font-medium">{incident.principalNotifiedName}</p></div>}
              {incident.continuedOver20Min && <div><span className="text-slate-500 text-xs">20+ Min Approved By</span><p className="font-medium text-amber-700">{incident.over20MinApproverName || "—"}</p></div>}
            </div>

            {incident.additionalStaff?.length > 0 && (
              <div>
                <span className="text-xs text-slate-500 font-medium">Additional Staff Who Administered</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {incident.additionalStaff.map((s: any) => (
                    <span key={s.id} className="text-xs bg-slate-100 rounded px-2 py-1">{s.firstName} {s.lastName} — {s.title || s.role}</span>
                  ))}
                </div>
              </div>
            )}
            {incident.observerStaff?.length > 0 && (
              <div>
                <span className="text-xs text-slate-500 font-medium">Observers</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {incident.observerStaff.map((s: any) => (
                    <span key={s.id} className="text-xs bg-blue-50 rounded px-2 py-1">{s.firstName} {s.lastName} — {s.title || s.role}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">Behavioral Context — 603 CMR 46.06(4)(b)</h3>
            {incident.precedingActivity && (
              <div><span className="text-xs text-slate-500 font-medium">Activity Preceding Incident</span><p className="text-sm text-slate-700 mt-1 bg-slate-50 rounded-lg p-3">{incident.precedingActivity}</p></div>
            )}
            <div><span className="text-xs text-slate-500 font-medium">Behavior That Prompted Restraint</span><p className="text-sm text-slate-700 mt-1 bg-slate-50 rounded-lg p-3">{incident.behaviorDescription}</p></div>
            {incident.deescalationAttempts && (
              <div><span className="text-xs text-slate-500 font-medium">De-escalation Strategies Used</span><p className="text-sm text-slate-700 mt-1 bg-slate-50 rounded-lg p-3">{incident.deescalationAttempts}</p></div>
            )}
            {incident.alternativesAttempted && (
              <div><span className="text-xs text-slate-500 font-medium">Alternatives to Restraint Attempted</span><p className="text-sm text-slate-700 mt-1 bg-slate-50 rounded-lg p-3">{incident.alternativesAttempted}</p></div>
            )}
            {incident.justification && (
              <div><span className="text-xs text-slate-500 font-medium">Justification for Initiating Restraint</span><p className="text-sm text-slate-700 mt-1 bg-slate-50 rounded-lg p-3">{incident.justification}</p></div>
            )}
            {incident.calmingStrategiesUsed && (
              <div><span className="text-xs text-slate-500 font-medium">Calming Strategies Used</span><p className="text-sm text-slate-700 mt-1 bg-slate-50 rounded-lg p-3">{incident.calmingStrategiesUsed}</p></div>
            )}
            {incident.studentStateAfter && (
              <div><span className="text-xs text-slate-500 font-medium">Student State After Incident</span><p className="text-sm text-slate-700 mt-1 bg-slate-50 rounded-lg p-3">{incident.studentStateAfter}</p></div>
            )}
            {incident.triggerDescription && (
              <div><span className="text-xs text-slate-500 font-medium">Trigger / Antecedent</span><p className="text-sm text-slate-700 mt-1 bg-slate-50 rounded-lg p-3">{incident.triggerDescription}</p></div>
            )}
          </div>

          {(incident.studentInjury || incident.staffInjury || incident.medicalAttentionRequired) && (
            <div className="bg-white rounded-xl border border-red-200 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-red-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Injuries & Medical</h3>
              {incident.studentInjury && (
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-red-700">Student Injury</p>
                  <p className="text-sm text-red-600 mt-0.5">{incident.studentInjuryDescription || "Injury reported"}</p>
                </div>
              )}
              {incident.staffInjury && (
                <div className="bg-orange-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-orange-700">Staff Injury</p>
                  <p className="text-sm text-orange-600 mt-0.5">{incident.staffInjuryDescription || "Injury reported"}</p>
                </div>
              )}
              {incident.medicalAttentionRequired && (
                <div className="bg-red-100 rounded-lg p-3">
                  <p className="text-sm font-semibold text-red-800">Medical Attention Required</p>
                  <p className="text-sm text-red-700 mt-0.5">{incident.medicalDetails || "Details pending"}</p>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><PenLine className="w-4 h-4" /> Signatures</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className={`rounded-lg p-3 ${incident.reportingStaffSignature ? "bg-emerald-50" : "bg-slate-50"}`}>
                <p className="text-xs font-medium text-slate-600">Reporting Staff Signature</p>
                {incident.reportingStaffSignature ? (
                  <p className="text-sm font-medium italic mt-1">{incident.reportingStaffSignature}</p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">Not signed</p>
                )}
                {incident.reportingStaffSignedAt && <p className="text-[10px] text-slate-400 mt-0.5">{incident.reportingStaffSignedAt}</p>}
              </div>
              <div className={`rounded-lg p-3 ${incident.adminSignature ? "bg-emerald-50" : "bg-slate-50"}`}>
                <p className="text-xs font-medium text-slate-600">Administrator Signature</p>
                {incident.adminSignature ? (
                  <p className="text-sm font-medium italic mt-1">{incident.adminSignature}</p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">Not signed</p>
                )}
                {incident.adminSignedAt && <p className="text-[10px] text-slate-400 mt-0.5">{incident.adminSignedAt}</p>}
              </div>
            </div>
            {!incident.reportingStaffSignature && (
              <SignatureInput label="Sign as Reporting Staff" onSign={(name) => signatureMutation.mutate({ type: "reporting_staff", name })} isPending={signatureMutation.isPending} />
            )}
          </div>

          {(incident.parentComment || incident.studentComment || incident.parentCommentOpportunityGiven) && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-800">Parent/Student Comments — 603 CMR 46.06(3)</h3>
              {incident.parentComment && <div className="bg-blue-50 rounded-lg p-3"><p className="text-xs font-medium text-blue-700">Parent Comment</p><p className="text-sm text-blue-800 mt-1">{incident.parentComment}</p></div>}
              {incident.studentComment && <div className="bg-blue-50 rounded-lg p-3"><p className="text-xs font-medium text-blue-700">Student Comment</p><p className="text-sm text-blue-800 mt-1">{incident.studentComment}</p></div>}
              {incident.parentCommentOpportunityGiven && !incident.parentComment && !incident.studentComment && (
                <p className="text-xs text-slate-500">Comment opportunity was provided; no comments were submitted.</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">Compliance Checklist — 603 CMR 46.06</h3>

            <ComplianceItem
              done={incident.parentVerbalNotification}
              label="Verbal Parent Notification (24hr)"
              sublabel={incident.parentVerbalNotification
                ? `Notified ${incident.parentVerbalNotificationAt ? new Date(incident.parentVerbalNotificationAt).toLocaleDateString() : ""}`
                : "Due within 24 hours of incident"}
              urgent={!incident.parentVerbalNotification}
            />

            {!incident.parentVerbalNotification && !showNotify && (
              <button onClick={() => setShowNotify(true)} className="w-full px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 flex items-center justify-center gap-1.5">
                <Bell className="w-3.5 h-3.5" /> Record Verbal Notification
              </button>
            )}
            {showNotify && !incident.parentVerbalNotification && (
              <div className="bg-red-50 rounded-lg p-3 space-y-2">
                <select value={notifyForm.staffId} onChange={e => setNotifyForm(f => ({ ...f, staffId: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-red-200 rounded text-xs bg-white">
                  <option value="">Who notified?</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>
                <select value={notifyForm.method} onChange={e => setNotifyForm(f => ({ ...f, method: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-red-200 rounded text-xs bg-white">
                  <option value="phone">Phone Call</option>
                  <option value="in_person">In Person</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={() => setShowNotify(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded">Cancel</button>
                  <button onClick={() => { if (notifyForm.staffId) notifyMutation.mutate({ notifiedById: Number(notifyForm.staffId), method: notifyForm.method, verbal: true }); }}
                    disabled={!notifyForm.staffId || notifyMutation.isPending}
                    className="flex-1 px-2 py-1.5 text-xs bg-red-600 text-white rounded disabled:opacity-50">
                    {notifyMutation.isPending ? "..." : "Confirm"}
                  </button>
                </div>
              </div>
            )}

            <ComplianceItem
              done={incident.writtenReportSent}
              label="Written Report to Parent (3 days)"
              sublabel={incident.writtenReportSent
                ? `Sent ${incident.writtenReportSentAt ? formatDate(incident.writtenReportSentAt) : ""} via ${incident.writtenReportSentMethod || "—"}`
                : "Due within 3 school working days"}
            />

            {incident.parentVerbalNotification && !incident.writtenReportSent && !showWritten && (
              <button onClick={() => setShowWritten(true)} className="w-full px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 flex items-center justify-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Mark Written Report Sent
              </button>
            )}
            {showWritten && !incident.writtenReportSent && (
              <div className="bg-amber-50 rounded-lg p-3 space-y-2">
                <select value={writtenMethod} onChange={e => setWrittenMethod(e.target.value)}
                  className="w-full px-2 py-1.5 border border-amber-200 rounded text-xs bg-white">
                  <option value="email">Email</option>
                  <option value="regular_mail">Regular Mail</option>
                  <option value="hand_delivered">Hand Delivered</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={() => setShowWritten(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded">Cancel</button>
                  <button onClick={() => writtenReportMutation.mutate(writtenMethod)}
                    disabled={writtenReportMutation.isPending}
                    className="flex-1 px-2 py-1.5 text-xs bg-amber-600 text-white rounded disabled:opacity-50">
                    {writtenReportMutation.isPending ? "..." : "Confirm Sent"}
                  </button>
                </div>
              </div>
            )}

            <ComplianceItem
              done={incident.parentCommentOpportunityGiven}
              label="Parent/Student Comment Opportunity"
              sublabel={incident.parentCommentOpportunityGiven
                ? "Comment opportunity provided"
                : "Must offer opportunity to comment"}
            />

            {!incident.parentCommentOpportunityGiven && !showComment && (
              <button onClick={() => setShowComment(true)} className="w-full px-3 py-2 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600 flex items-center justify-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Record Comments
              </button>
            )}
            {showComment && !incident.parentCommentOpportunityGiven && (
              <div className="bg-blue-50 rounded-lg p-3 space-y-2">
                <textarea value={commentForm.parentComment} onChange={e => setCommentForm(f => ({ ...f, parentComment: e.target.value }))}
                  placeholder="Parent comment (leave blank if none)..." rows={2} className="w-full px-2 py-1.5 border border-blue-200 rounded text-xs bg-white resize-none" />
                <textarea value={commentForm.studentComment} onChange={e => setCommentForm(f => ({ ...f, studentComment: e.target.value }))}
                  placeholder="Student comment (leave blank if none)..." rows={2} className="w-full px-2 py-1.5 border border-blue-200 rounded text-xs bg-white resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => setShowComment(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded">Cancel</button>
                  <button onClick={() => commentMutation.mutate({ parentComment: commentForm.parentComment || undefined, studentComment: commentForm.studentComment || undefined })}
                    disabled={commentMutation.isPending}
                    className="flex-1 px-2 py-1.5 text-xs bg-blue-600 text-white rounded disabled:opacity-50">
                    {commentMutation.isPending ? "..." : "Save"}
                  </button>
                </div>
              </div>
            )}

            <ComplianceItem
              done={!!incident.adminReviewedBy}
              label="Admin Review"
              sublabel={incident.adminReviewedBy && incident.adminReviewer
                ? `Reviewed by ${incident.adminReviewer.firstName} ${incident.adminReviewer.lastName}`
                : "Principal must review"}
            />

            {!incident.adminReviewedBy && !showReview && (
              <button onClick={() => setShowReview(true)} className="w-full px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium hover:bg-indigo-700 flex items-center justify-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" /> Complete Admin Review
              </button>
            )}
            {showReview && !incident.adminReviewedBy && (
              <div className="bg-indigo-50 rounded-lg p-3 space-y-2">
                <select value={reviewForm.adminStaffId} onChange={e => setReviewForm(f => ({ ...f, adminStaffId: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-indigo-200 rounded text-xs bg-white">
                  <option value="">Reviewer...</option>
                  {staff.filter(s => s.role === "admin" || s.role === "case_manager").map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>
                <textarea value={reviewForm.notes} onChange={e => setReviewForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Review notes..." rows={2} className="w-full px-2 py-1.5 border border-indigo-200 rounded text-xs bg-white resize-none" />
                <input type="text" placeholder="Admin signature (type full name)" value={reviewForm.signature} onChange={e => setReviewForm(f => ({ ...f, signature: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-indigo-200 rounded text-xs bg-white italic" />
                <div className="flex gap-2">
                  <button onClick={() => setShowReview(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded">Cancel</button>
                  <button onClick={() => { if (reviewForm.adminStaffId) reviewMutation.mutate({ adminStaffId: Number(reviewForm.adminStaffId), notes: reviewForm.notes, signature: reviewForm.signature }); }}
                    disabled={!reviewForm.adminStaffId || reviewMutation.isPending}
                    className="flex-1 px-2 py-1.5 text-xs bg-indigo-600 text-white rounded disabled:opacity-50">
                    {reviewMutation.isPending ? "..." : "Submit Review"}
                  </button>
                </div>
              </div>
            )}

            {incident.deseReportRequired && (
              <>
                <hr className="border-slate-200" />
                <ComplianceItem
                  done={!!incident.deseReportSentAt}
                  label="DESE Injury Report (3 days)"
                  sublabel={incident.deseReportSentAt
                    ? `Sent ${formatDate(incident.deseReportSentAt)}`
                    : "Required — injury occurred. Due within 3 school working days"}
                  urgent={!incident.deseReportSentAt}
                />
                <ComplianceItem
                  done={incident.thirtyDayLogSentToDese}
                  label="30-Day Prior Restraint Log to DESE"
                  sublabel={incident.thirtyDayLogSentToDese ? "Sent with injury report" : "Must accompany injury report"}
                  urgent={!incident.thirtyDayLogSentToDese && !!incident.deseReportSentAt}
                />
                {!incident.deseReportSentAt && (
                  <button onClick={() => deseMutation.mutate()} disabled={deseMutation.isPending}
                    className="w-full px-3 py-2 bg-purple-600 text-white rounded-lg text-xs font-medium hover:bg-purple-700 flex items-center justify-center gap-1.5 disabled:opacity-50">
                    <Send className="w-3.5 h-3.5" /> {deseMutation.isPending ? "..." : "Mark DESE Report Sent"}
                  </button>
                )}
              </>
            )}
          </div>

          {incident.notes && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Notes</h3>
              <p className="text-sm text-slate-600">{incident.notes}</p>
            </div>
          )}

          {incident.adminReviewNotes && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Admin Review Notes</h3>
              <p className="text-sm text-slate-600">{incident.adminReviewNotes}</p>
            </div>
          )}

          {incident.followUpPlan && (
            <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-2">Follow-Up Plan</h3>
              <p className="text-sm text-slate-600">{incident.followUpPlan}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignatureInput({ label, onSign, isPending }: { label: string; onSign: (name: string) => void; isPending: boolean }) {
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);

  if (!show) return (
    <button onClick={() => setShow(true)} className="w-full px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200 flex items-center justify-center gap-1.5">
      <PenLine className="w-3.5 h-3.5" /> {label}
    </button>
  );

  return (
    <div className="bg-slate-50 rounded-lg p-3 space-y-2">
      <input type="text" placeholder="Type your full name to sign" value={name} onChange={e => setName(e.target.value)}
        className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs bg-white italic" />
      <div className="flex gap-2">
        <button onClick={() => setShow(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded">Cancel</button>
        <button onClick={() => { if (name) onSign(name); }} disabled={!name || isPending}
          className="flex-1 px-2 py-1.5 text-xs bg-indigo-600 text-white rounded disabled:opacity-50">
          {isPending ? "..." : "Sign"}
        </button>
      </div>
    </div>
  );
}

function ComplianceItem({ done, label, sublabel, urgent }: { done: boolean; label: string; sublabel: string; urgent?: boolean }) {
  return (
    <div className={`flex items-start gap-3 p-2.5 rounded-lg ${done ? "bg-emerald-50" : urgent ? "bg-red-50" : "bg-slate-50"}`}>
      {done
        ? <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
        : urgent
          ? <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          : <Clock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
      }
      <div>
        <p className={`text-xs font-semibold ${done ? "text-emerald-700" : urgent ? "text-red-700" : "text-slate-700"}`}>{label}</p>
        <p className={`text-[11px] ${done ? "text-emerald-600" : urgent ? "text-red-600" : "text-slate-500"}`}>{sublabel}</p>
      </div>
    </div>
  );
}
