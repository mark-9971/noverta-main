import { useState, useMemo, Fragment, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield, Plus, AlertTriangle, Clock, User, Search,
  ChevronRight, FileText, Bell, CheckCircle, XCircle,
  Filter, Calendar, Eye, ChevronDown, ChevronUp,
  ArrowLeft, TrendingUp, Download, PenLine, Send, UserCheck, Users,
  Mail, FilePenLine, Printer
} from "lucide-react";
import { toast } from "sonner";

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
  pendingSignatures: number;
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
type Signature = {
  id: number;
  incidentId: number;
  staffId: number;
  staffFirstName: string;
  staffLastName: string;
  staffTitle: string | null;
  staffRole: string;
  role: string;
  signatureName: string | null;
  signedAt: string | null;
  requestedAt: string;
  status: string;
  notes: string | null;
};

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
  closed: "bg-gray-100 text-gray-600",
};
const RESTRAINT_TYPES: Record<string, string> = {
  floor: "Floor Restraint",
  seated: "Seated Restraint",
  standing: "Standing Restraint",
  escort: "Physical Escort",
  other: "Other",
};
const BODY_POSITIONS: Record<string, string> = {
  prone: "Prone (face down)",
  supine: "Supine (face up)",
  seated: "Seated",
  standing: "Standing",
  side_lying: "Side-Lying",
  kneeling: "Kneeling",
};
const ANTECEDENT_CATEGORIES: Record<string, string> = {
  demand: "Task/Demand Placed",
  denied_access: "Denied Access / Told No",
  transition: "Transition Between Activities",
  sensory: "Sensory Overload",
  social: "Social Conflict / Peer Interaction",
  unstructured: "Unstructured Time",
  unexpected_change: "Unexpected Change in Routine",
  internal: "Internal State (pain, hunger, fatigue)",
  unknown: "Unknown / No Clear Antecedent",
  other: "Other",
};
const DEESC_STRATEGIES = [
  "Verbal redirection",
  "Offered choices",
  "Offered break / cool-down space",
  "Reduced demands",
  "Proximity / calm presence",
  "Sensory tools offered",
  "Visual supports / schedule reviewed",
  "Humor / rapport",
  "Planned ignoring",
  "Peer support",
  "Called crisis team / backup",
  "Moved other students away",
  "Timer / countdown",
  "Processing time given",
];
const SAFETY_CARE_PROCEDURES = [
  "CPI: Children's Control Position",
  "CPI: Team Control Position",
  "CPI: Transport Position",
  "Safety Care: Standing Stabilization",
  "Safety Care: Seated Stabilization",
  "Safety Care: Kneeling Stabilization",
  "Safety Care: Supine Stabilization",
  "Safety Care: Escort",
  "CALM: Standing Hold",
  "CALM: Seated Hold",
  "CALM: Floor Hold",
  "CALM: Transport",
  "PMT: Basket Hold",
  "PMT: Bear Hug",
  "NVCI: Standing Containment",
  "NVCI: Seated Containment",
  "Agency-specific procedure (see notes)",
];
const CALMING_STRATEGIES = [
  "Deep breathing prompts",
  "Counting exercises",
  "Reduced stimulation / quiet space",
  "Sensory input (weighted blanket, fidget)",
  "Verbal reassurance",
  "Music / calming audio",
  "Movement break (walk, stretch)",
  "Preferred activity offered",
  "Water / snack offered",
  "Check-in with preferred adult",
];
const SIG_ROLE_LABELS: Record<string, string> = {
  reporting_staff: "Reporting Staff",
  additional_staff: "Additional Staff",
  observer: "Observer / Witness",
  admin_reviewer: "Administrator",
  principal: "Principal",
  witness: "Witness",
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
  return Math.round((deadline - Date.now()) / (60 * 60 * 1000));
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
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-700" />
            Protective Measures
          </h1>
          <p className="text-sm text-gray-500 mt-1">Restraint & seclusion tracking · 603 CMR 46.00</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-lg px-2 py-1.5">
            <select value={exportYear} onChange={e => setExportYear(e.target.value)}
              className="text-xs bg-transparent border-none focus:outline-none text-gray-600">
              <option value="2025-2026">SY 2025-26</option>
              <option value="2024-2025">SY 2024-25</option>
              <option value="2023-2024">SY 2023-24</option>
            </select>
            <button onClick={handleDeseExport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-md text-xs font-medium hover:bg-emerald-700 transition-colors">
              <Download className="w-3.5 h-3.5" /> DESE Export
            </button>
          </div>
          <button onClick={onNew} className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 text-white rounded-lg text-sm font-medium hover:bg-emerald-800 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Report Incident
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <SummaryCard
            label="Total Incidents"
            value={summary.totalIncidents}
            icon={<Shield className="w-4 h-4 text-gray-400" />}
            detail={[
              summary.byType.physical_restraint > 0 ? `${summary.byType.physical_restraint} restraint${summary.byType.physical_restraint !== 1 ? "s" : ""}` : null,
              summary.byType.seclusion > 0 ? `${summary.byType.seclusion} seclusion${summary.byType.seclusion !== 1 ? "s" : ""}` : null,
              summary.byType.time_out > 0 ? `${summary.byType.time_out} time-out${summary.byType.time_out !== 1 ? "s" : ""}` : null,
            ].filter(Boolean).join(" · ") || undefined}
          />
          <SummaryCard
            label="Needs Review"
            value={summary.pendingReview}
            icon={<Clock className="w-4 h-4 text-amber-400" />}
            color={summary.pendingReview > 0 ? "text-amber-600" : "text-gray-600"}
          />
          <SummaryCard
            label="Pending Signatures"
            value={summary.pendingSignatures || 0}
            icon={<PenLine className="w-4 h-4 text-purple-400" />}
            color={(summary.pendingSignatures || 0) > 0 ? "text-purple-600" : "text-gray-600"}
          />
          <SummaryCard
            label="Action Items Due"
            value={summary.parentNotificationsPending + summary.writtenReportsPending}
            icon={<Bell className="w-4 h-4 text-red-400" />}
            color={summary.parentNotificationsPending + summary.writtenReportsPending > 0 ? "text-red-600" : "text-gray-600"}
            detail={`${summary.parentNotificationsPending} notices · ${summary.writtenReportsPending} reports`}
          />
          <SummaryCard
            label="DESE Reports Due"
            value={summary.deseReportsPending}
            icon={<Send className="w-4 h-4 text-purple-400" />}
            color={summary.deseReportsPending > 0 ? "text-purple-600" : "text-gray-600"}
          />
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Search by student name or description..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400" />
        </div>
        <div className="flex gap-2">
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
            <option value="all">All Types</option>
            <option value="physical_restraint">Physical Restraint</option>
            <option value="seclusion">Seclusion</option>
            <option value="time_out">Time-Out</option>
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
            <option value="all">All Status</option>
            <option value="pending_review">Pending Review</option>
            <option value="reviewed">Reviewed</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-400">Loading incidents...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Shield className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">No incidents recorded</p>
            <p className="text-xs text-gray-400 mt-1">Use "Report Incident" to document a restraint, seclusion, or time-out event</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(inc => (
              <button key={inc.id} onClick={() => onDetail(inc.id)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors text-left">
                <div className="flex-shrink-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${inc.incidentType === "physical_restraint" ? "bg-red-100" : inc.incidentType === "seclusion" ? "bg-orange-100" : "bg-amber-100"}`}>
                    <Shield className={`w-5 h-5 ${inc.incidentType === "physical_restraint" ? "text-red-600" : inc.incidentType === "seclusion" ? "text-orange-600" : "text-amber-600"}`} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-800">{inc.studentFirstName} {inc.studentLastName}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[inc.incidentType] || "bg-gray-100 text-gray-600"}`}>
                      {TYPE_LABELS[inc.incidentType] || inc.incidentType}
                    </span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[inc.status] || "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[inc.status] || inc.status}
                    </span>
                    {inc.deseReportRequired && !inc.deseReportSentAt && (
                      <span className="text-[10px] font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">DESE DUE</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate">{inc.behaviorDescription}</p>
                </div>
                <div className="flex-shrink-0 text-right space-y-1">
                  <p className="text-xs font-medium text-gray-700">{formatDate(inc.incidentDate)}</p>
                  <p className="text-[11px] text-gray-400">{formatTime(inc.incidentTime)}{inc.durationMinutes ? ` · ${inc.durationMinutes} min` : ""}</p>
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
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon, color, detail }: { label: string; value: string | number; icon: React.ReactNode; color?: string; detail?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200/80 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-1.5">{icon}<span className="text-[11px] text-gray-500 font-medium">{label}</span></div>
      <p className={`text-2xl font-bold ${color || "text-gray-800"}`}>{value}</p>
      {detail && <p className="text-[11px] text-gray-400 mt-1">{detail}</p>}
    </div>
  );
}

function ChecklistField({ label, options, selected, onChange }: { label: string; options: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => {
    onChange(selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt]);
  };
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-2">{label}</label>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => (
          <button key={opt} type="button" onClick={() => toggle(opt)}
            className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${selected.includes(opt) ? "bg-emerald-100 border-emerald-300 text-emerald-800 font-medium" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

const inputCls = "w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400";
const textareaCls = "w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none";
const labelCls = "block text-xs font-medium text-gray-600 mb-1.5";

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
          timeToCalm: form.timeToCalm ? Number(form.timeToCalm) : null,
          proceduresUsed: form.proceduresUsed.length > 0 ? form.proceduresUsed : null,
          deescalationStrategies: form.deescalationStrategies.length > 0 ? form.deescalationStrategies : null,
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

  const STEPS = ["Incident", "Context & Behavior", "Staff & Environment", "Injuries & Safety", "Debrief, Sign & Submit"];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-800">Report Incident</h1>
          <p className="text-sm text-gray-500">603 CMR 46.06 Compliant Documentation</p>
        </div>
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

          <label className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100/70 transition-colors">
            <input type="checkbox" checked={form.bipInPlace} onChange={e => set("bipInPlace", e.target.checked)}
              className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
            <div>
              <span className="text-sm font-medium text-blue-800">Student has a Behavior Intervention Plan (BIP)</span>
              <p className="text-xs text-blue-700">Check if the student's IEP includes a BIP</p>
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
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${form.observerStaffIds.includes(String(s.id)) ? "bg-blue-100 border-blue-300 text-blue-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
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
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-purple-800 flex items-center gap-1.5"><Send className="w-3.5 h-3.5" /> DESE Injury Reporting Required</p>
              <p className="text-xs text-purple-700 mt-1">Per 603 CMR 46.06(7), when a restraint results in injury, a copy of this report must be sent to DESE within 3 school working days, along with the record of restraints for the prior 30 days.</p>
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

          <label className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100/70 transition-colors">
            <input type="checkbox" checked={form.debriefConducted} onChange={e => set("debriefConducted", e.target.checked)}
              className="w-4 h-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500" />
            <div>
              <span className="text-sm font-medium text-blue-800">Post-incident debrief conducted</span>
              <p className="text-xs text-blue-700">Staff debrief to review what happened and prevent future incidents</p>
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
              {form.bipInPlace && <div className="col-span-2"><span className="text-blue-600 font-medium">BIP in place</span></div>}
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

  const signMutation = useMutation({
    mutationFn: async (data: { sigId: number; signatureName: string; notes?: string }) => {
      const res = await fetch(`${API}/api/protective-measures/incidents/${id}/signatures/${data.sigId}/sign`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureName: data.signatureName, notes: data.notes }),
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

  const saveDraftMutation = useMutation({
    mutationFn: async (draft: string) => {
      const res = await fetch(`${API}/api/protective-measures/incidents/${id}/parent-notification-draft`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: invalidateAll,
  });

  const sendNotificationMutation = useMutation({
    mutationFn: async (data: { senderId: number; draft: string; method: string }) => {
      const res = await fetch(`${API}/api/protective-measures/incidents/${id}/send-parent-notification`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast.success("Parent notification sent successfully"); },
    onError: (err: Error) => { toast.error(err.message); },
  });

  const [showNotify, setShowNotify] = useState(false);
  const [showWritten, setShowWritten] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [notifyForm, setNotifyForm] = useState({ staffId: "", method: "phone" });
  const [writtenMethod, setWrittenMethod] = useState("email");
  const [reviewForm, setReviewForm] = useState({ adminStaffId: "", notes: "", signature: "" });
  const [commentForm, setCommentForm] = useState({ parentComment: "", studentComment: "" });

  if (isLoading || !incident) return <div className="p-12 text-center text-sm text-gray-400">Loading...</div>;

  const signatures: Signature[] = incident.signatures || [];
  const pendingSigs = signatures.filter(s => s.status === "pending");
  const signedSigs = signatures.filter(s => s.status === "signed");

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-gray-800">
            {incident.student?.firstName} {incident.student?.lastName} — {TYPE_LABELS[incident.incidentType]}
          </h1>
          <p className="text-sm text-gray-500">{formatDate(incident.incidentDate)} at {formatTime(incident.incidentTime)}{incident.durationMinutes ? ` · ${incident.durationMinutes} min` : ""}</p>
        </div>
        <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${STATUS_COLORS[incident.status]}`}>
          {STATUS_LABELS[incident.status]}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Incident Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div><span className="text-gray-500 text-xs">Type</span><p className="font-medium text-gray-800">{TYPE_LABELS[incident.incidentType]}</p></div>
              <div><span className="text-gray-500 text-xs">Location</span><p className="font-medium text-gray-800">{incident.location || "—"}</p></div>
              {incident.restraintType && <div><span className="text-gray-500 text-xs">Restraint Type</span><p className="font-medium text-gray-800">{RESTRAINT_TYPES[incident.restraintType]}</p></div>}
              {incident.bodyPosition && <div><span className="text-gray-500 text-xs">Body Position</span><p className="font-medium text-gray-800">{BODY_POSITIONS[incident.bodyPosition] || incident.bodyPosition}</p></div>}
              {incident.antecedentCategory && <div><span className="text-gray-500 text-xs">Antecedent</span><p className="font-medium text-gray-800">{ANTECEDENT_CATEGORIES[incident.antecedentCategory] || incident.antecedentCategory}</p></div>}
              <div><span className="text-gray-500 text-xs">BIP in Place</span><p className="font-medium text-gray-800">{incident.bipInPlace ? "Yes" : "No"}</p></div>
              {incident.timeToCalm && <div><span className="text-gray-500 text-xs">Time to Calm</span><p className="font-medium text-gray-800">{incident.timeToCalm} min</p></div>}
              {incident.studentReturnedToActivity && <div><span className="text-gray-500 text-xs">Returned To</span><p className="font-medium text-gray-800 capitalize">{incident.studentReturnedToActivity.replace(/_/g, " ")}</p></div>}
            </div>

            {(incident.studentMoved || incident.roomCleared || incident.emergencyServicesCalled || incident.physicalEscortOnly) && (
              <div className="flex gap-2 flex-wrap">
                {incident.physicalEscortOnly && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full font-medium">Physical Escort Only</span>}
                {incident.studentMoved && <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">Student Moved{incident.studentMovedTo ? `: ${incident.studentMovedTo}` : ""}</span>}
                {incident.roomCleared && <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">Room Cleared</span>}
                {incident.emergencyServicesCalled && <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-medium">911 Called</span>}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Behavioral Context</h3>
            {incident.precedingActivity && <div><p className="text-xs font-medium text-gray-500 mb-1">Preceding Activity</p><p className="text-sm text-gray-700">{incident.precedingActivity}</p></div>}
            {incident.triggerDescription && <div><p className="text-xs font-medium text-gray-500 mb-1">Trigger / Antecedent</p><p className="text-sm text-gray-700">{incident.triggerDescription}</p></div>}
            <div><p className="text-xs font-medium text-gray-500 mb-1">Behavior Description</p><p className="text-sm text-gray-700">{incident.behaviorDescription}</p></div>
            {Array.isArray(incident.deescalationStrategies) && incident.deescalationStrategies.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">De-escalation Strategies Used</p>
                <div className="flex flex-wrap gap-1.5">
                  {(incident.deescalationStrategies as string[]).map((s: string) => (
                    <span key={s} className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {incident.deescalationAttempts && <div><p className="text-xs font-medium text-gray-500 mb-1">Additional De-escalation Details</p><p className="text-sm text-gray-700">{incident.deescalationAttempts}</p></div>}
            {incident.alternativesAttempted && <div><p className="text-xs font-medium text-gray-500 mb-1">Alternatives Attempted</p><p className="text-sm text-gray-700">{incident.alternativesAttempted}</p></div>}
            {incident.justification && <div><p className="text-xs font-medium text-gray-500 mb-1">Justification</p><p className="text-sm text-gray-700">{incident.justification}</p></div>}
            {Array.isArray(incident.proceduresUsed) && incident.proceduresUsed.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1.5">Procedures / Holds Used</p>
                <div className="flex flex-wrap gap-1.5">
                  {(incident.proceduresUsed as string[]).map((s: string) => (
                    <span key={s} className="text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded-full">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {incident.calmingStrategiesUsed && <div><p className="text-xs font-medium text-gray-500 mb-1">Calming Strategies</p><p className="text-sm text-gray-700">{incident.calmingStrategiesUsed}</p></div>}
            {incident.studentStateAfter && <div><p className="text-xs font-medium text-gray-500 mb-1">Student State After</p><p className="text-sm text-gray-700">{incident.studentStateAfter}</p></div>}
          </div>

          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">Staff Involved</h3>
            <div className="space-y-2">
              {incident.primaryStaff && (
                <div className="flex items-center gap-3 p-2 bg-emerald-50 rounded-lg">
                  <User className="w-4 h-4 text-emerald-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{incident.primaryStaff.firstName} {incident.primaryStaff.lastName}</p>
                    <p className="text-xs text-gray-500">{incident.primaryStaff.title || incident.primaryStaff.role} — Primary (administered restraint)</p>
                  </div>
                </div>
              )}
              {incident.additionalStaff?.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                  <User className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.firstName} {s.lastName}</p>
                    <p className="text-xs text-gray-500">{s.title || s.role} — Additional staff</p>
                  </div>
                </div>
              ))}
              {incident.observerStaff?.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 p-2 bg-blue-50 rounded-lg">
                  <Eye className="w-4 h-4 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{s.firstName} {s.lastName}</p>
                    <p className="text-xs text-gray-500">{s.title || s.role} — Observer</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {(incident.studentInjury || incident.staffInjury) && (
            <div className="bg-white rounded-xl border border-red-200 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-red-700">Injuries</h3>
              {incident.studentInjury && (
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-700">Student Injury</p>
                  <p className="text-sm text-red-800 mt-1">{incident.studentInjuryDescription || "Injury reported — no details"}</p>
                </div>
              )}
              {incident.staffInjury && (
                <div className="bg-red-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-700">Staff Injury</p>
                  <p className="text-sm text-red-800 mt-1">{incident.staffInjuryDescription || "Injury reported — no details"}</p>
                </div>
              )}
              {incident.medicalAttentionRequired && (
                <div className="bg-red-100 rounded-lg p-3">
                  <p className="text-xs font-semibold text-red-800">Medical Attention Required</p>
                  <p className="text-sm text-red-800 mt-1">{incident.medicalDetails || "Yes"}</p>
                </div>
              )}
            </div>
          )}

          {incident.debriefConducted && (
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Post-Incident Debrief</h3>
              {incident.debriefDate && <p className="text-xs text-gray-500">Conducted: {formatDate(incident.debriefDate)}</p>}
              {incident.debriefNotes && <p className="text-sm text-gray-700">{incident.debriefNotes}</p>}
            </div>
          )}

          {(incident.parentComment || incident.studentComment || incident.parentCommentOpportunityGiven) && (
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-3">
              <h3 className="text-sm font-semibold text-gray-800">Parent/Student Comments — 603 CMR 46.06(3)</h3>
              {incident.parentComment && <div className="bg-blue-50 rounded-lg p-3"><p className="text-xs font-medium text-blue-700">Parent Comment</p><p className="text-sm text-blue-800 mt-1">{incident.parentComment}</p></div>}
              {incident.studentComment && <div className="bg-blue-50 rounded-lg p-3"><p className="text-xs font-medium text-blue-700">Student Comment</p><p className="text-sm text-blue-800 mt-1">{incident.studentComment}</p></div>}
              {incident.parentCommentOpportunityGiven && !incident.parentComment && !incident.studentComment && (
                <p className="text-xs text-gray-500">Comment opportunity was provided; no comments were submitted.</p>
              )}
            </div>
          )}

          {incident.notes && (
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{incident.notes}</p>
            </div>
          )}

          {incident.followUpPlan && (
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Follow-Up Plan</h3>
              <p className="text-sm text-gray-600">{incident.followUpPlan}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              Signatures ({signedSigs.length}/{signatures.length})
            </h3>

            {signatures.length === 0 ? (
              <p className="text-xs text-gray-400">No signature requests yet</p>
            ) : (
              <div className="space-y-2">
                {signatures.map(sig => (
                  <SignatureRow key={sig.id} sig={sig} onSign={(name, notes) => signMutation.mutate({ sigId: sig.id, signatureName: name, notes })} isPending={signMutation.isPending} />
                ))}
              </div>
            )}

            {pendingSigs.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                <p className="text-xs text-amber-800 font-medium">{pendingSigs.length} signature{pendingSigs.length !== 1 ? "s" : ""} pending</p>
              </div>
            )}
          </div>

          <ParentNotificationPanel
            incident={incident}
            staff={staff}
            incidentId={id}
            saveDraftMutation={saveDraftMutation}
            sendNotificationMutation={sendNotificationMutation}
          />

          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Compliance Checklist — 603 CMR 46.06</h3>

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
                  <button onClick={() => setShowNotify(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded">Cancel</button>
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
                  <button onClick={() => setShowWritten(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded">Cancel</button>
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
                  <button onClick={() => setShowComment(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded">Cancel</button>
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
              label="Admin Review & Signature"
              sublabel={incident.adminReviewedBy && incident.adminReviewer
                ? `Reviewed by ${incident.adminReviewer.firstName} ${incident.adminReviewer.lastName}`
                : "Principal must review and sign"}
            />

            {!incident.adminReviewedBy && !showReview && (
              <button onClick={() => setShowReview(true)} className="w-full px-3 py-2 bg-emerald-700 text-white rounded-lg text-xs font-medium hover:bg-emerald-800 flex items-center justify-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" /> Complete Admin Review
              </button>
            )}
            {showReview && !incident.adminReviewedBy && (
              <div className="bg-emerald-50 rounded-lg p-3 space-y-2">
                <select value={reviewForm.adminStaffId} onChange={e => setReviewForm(f => ({ ...f, adminStaffId: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-emerald-200 rounded text-xs bg-white">
                  <option value="">Reviewer...</option>
                  {staff.filter(s => s.role === "admin" || s.role === "case_manager").map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
                </select>
                <textarea value={reviewForm.notes} onChange={e => setReviewForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Review notes..." rows={2} className="w-full px-2 py-1.5 border border-emerald-200 rounded text-xs bg-white resize-none" />
                <input type="text" placeholder="Admin signature (type full name)" value={reviewForm.signature} onChange={e => setReviewForm(f => ({ ...f, signature: e.target.value }))}
                  className="w-full px-2 py-1.5 border border-emerald-200 rounded text-xs bg-white italic" />
                <div className="flex gap-2">
                  <button onClick={() => setShowReview(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded">Cancel</button>
                  <button onClick={() => { if (reviewForm.adminStaffId) reviewMutation.mutate({ adminStaffId: Number(reviewForm.adminStaffId), notes: reviewForm.notes, signature: reviewForm.signature }); }}
                    disabled={!reviewForm.adminStaffId || reviewMutation.isPending}
                    className="flex-1 px-2 py-1.5 text-xs bg-emerald-700 text-white rounded disabled:opacity-50">
                    {reviewMutation.isPending ? "..." : "Submit Review"}
                  </button>
                </div>
              </div>
            )}

            {incident.deseReportRequired && (
              <>
                <hr className="border-gray-200" />
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

          {incident.adminReviewNotes && (
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Admin Review Notes</h3>
              <p className="text-sm text-gray-600">{incident.adminReviewNotes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ParentNotificationPanel({ incident, staff, incidentId, saveDraftMutation, sendNotificationMutation }: {
  incident: any;
  staff: Staff[];
  incidentId: number;
  saveDraftMutation: any;
  sendNotificationMutation: any;
}) {
  const [draftText, setDraftText] = useState(incident.parentNotificationDraft || "");
  const [senderId, setSenderId] = useState("");
  const [sendMethod, setSendMethod] = useState("email");
  const [showConfirm, setShowConfirm] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);

  const isAdminReviewed = incident.status === "reviewed";
  const alreadySent = !!incident.parentNotificationSentAt;

  const eligibleSenders = staff.filter(s =>
    s.role === "case_manager" || s.role === "bcba" || s.role === "coordinator" || s.role === "admin"
  );

  const generateDraft = async () => {
    setLoadingDraft(true);
    try {
      const res = await fetch(`${API}/api/protective-measures/incidents/${incidentId}/generate-draft`);
      if (!res.ok) throw new Error("Failed to generate draft");
      const data = await res.json();
      setDraftText(data.draft);
      if (data.caseManager && !senderId) {
        setSenderId(String(data.caseManager.id));
      }
    } catch { toast.error("Failed to generate draft"); }
    setLoadingDraft(false);
  };

  useEffect(() => {
    if (isAdminReviewed && !alreadySent && !draftText && !incident.parentNotificationDraft) {
      generateDraft();
    }
  }, [isAdminReviewed, alreadySent]);

  const handleDownloadPdf = () => {
    window.open(`${API}/api/protective-measures/incidents/${incidentId}/report-pdf`, "_blank");
  };

  const handleSaveDraft = () => {
    saveDraftMutation.mutate(draftText);
    toast.success("Draft saved");
  };

  const handleSend = () => {
    if (!senderId) { toast.error("Select who is authorizing this notification"); return; }
    sendNotificationMutation.mutate({ senderId: Number(senderId), draft: draftText, method: sendMethod });
    setShowConfirm(false);
  };

  if (!isAdminReviewed && !alreadySent) {
    return (
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Mail className="w-4 h-4" /> Parent Notification
        </h3>
        <div className="bg-gray-50 rounded-lg p-3">
          <p className="text-xs text-gray-500">Admin review must be completed before sending parent notification.</p>
        </div>
        <button onClick={handleDownloadPdf} className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 flex items-center justify-center gap-1.5">
          <Printer className="w-3.5 h-3.5" /> Preview Restraint Report PDF
        </button>
      </div>
    );
  }

  if (alreadySent) {
    const senderStaff = incident.parentNotificationSentBy ? staff.find(s => s.id === incident.parentNotificationSentBy) : null;
    return (
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
          <Mail className="w-4 h-4 text-emerald-600" /> Parent Notification
        </h3>
        <div className="bg-emerald-50 rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <p className="text-xs font-semibold text-emerald-700">Notification Sent</p>
          </div>
          <p className="text-[11px] text-emerald-600">
            Sent {new Date(incident.parentNotificationSentAt).toLocaleDateString()} via {incident.parentNotificationMethod || "email"}
            {senderStaff ? ` by ${senderStaff.firstName} ${senderStaff.lastName}` : ""}
          </p>
        </div>
        {incident.parentNotificationDraft && (
          <details className="group">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700 flex items-center gap-1">
              <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" /> View sent message
            </summary>
            <div className="mt-2 bg-gray-50 rounded-lg p-3">
              <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{incident.parentNotificationDraft}</pre>
            </div>
          </details>
        )}
        <button onClick={handleDownloadPdf} className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 flex items-center justify-center gap-1.5">
          <Download className="w-3.5 h-3.5" /> Download Restraint Report PDF
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-5 space-y-4">
      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <Mail className="w-4 h-4 text-emerald-600" /> Parent Notification & Report
      </h3>
      <p className="text-xs text-gray-500">
        Admin has reviewed this incident. Compose and authorize the parent notification below. The restraint report PDF will be attached.
      </p>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-gray-700">Notification Letter</label>
          <div className="flex gap-1.5">
            <button onClick={generateDraft} disabled={loadingDraft}
              className="text-[10px] px-2 py-1 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1">
              <FilePenLine className="w-3 h-3" /> {loadingDraft ? "Generating..." : "Auto-Generate"}
            </button>
            <button onClick={handleSaveDraft} disabled={saveDraftMutation.isPending || !draftText}
              className="text-[10px] px-2 py-1 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 disabled:opacity-50">
              {saveDraftMutation.isPending ? "..." : "Save Draft"}
            </button>
          </div>
        </div>
        <textarea
          value={draftText}
          onChange={e => setDraftText(e.target.value)}
          rows={12}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white resize-y font-sans leading-relaxed focus:ring-1 focus:ring-emerald-300 focus:border-emerald-300"
          placeholder="Write the parent notification letter here..."
        />
      </div>

      <button onClick={handleDownloadPdf} className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-200 flex items-center justify-center gap-1.5">
        <Printer className="w-3.5 h-3.5" /> Preview / Download Restraint Report PDF
      </button>

      <div className="border-t border-gray-100 pt-3 space-y-2">
        <label className="text-xs font-medium text-gray-700">Authorize & Send</label>
        <p className="text-[11px] text-gray-500">Only the SPED teacher or case manager may authorize sending this notification.</p>
        <select value={senderId} onChange={e => setSenderId(e.target.value)}
          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
          <option value="">Select authorizing staff...</option>
          {eligibleSenders.map(s => (
            <option key={s.id} value={s.id}>{s.firstName} {s.lastName} — {s.title || s.role}</option>
          ))}
        </select>
        <select value={sendMethod} onChange={e => setSendMethod(e.target.value)}
          className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
          <option value="email">Email</option>
          <option value="certified_mail">Certified Mail</option>
          <option value="hand_delivered">Hand Delivered</option>
        </select>

        {!showConfirm ? (
          <button onClick={() => setShowConfirm(true)} disabled={!senderId || !draftText}
            className="w-full px-3 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
            <Send className="w-3.5 h-3.5" /> Send Parent Notification with Report
          </button>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800">Confirm Send</p>
            <p className="text-[11px] text-amber-700">This will mark the parent notification as sent and attach the restraint report. This action cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setShowConfirm(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded">Cancel</button>
              <button onClick={handleSend} disabled={sendNotificationMutation.isPending}
                className="flex-1 px-2 py-1.5 text-xs bg-emerald-700 text-white rounded disabled:opacity-50 font-medium">
                {sendNotificationMutation.isPending ? "Sending..." : "Confirm & Send"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SignatureRow({ sig, onSign, isPending }: { sig: Signature; onSign: (name: string, notes?: string) => void; isPending: boolean }) {
  const [showSign, setShowSign] = useState(false);
  const [name, setName] = useState("");

  return (
    <div className={`rounded-lg p-2.5 ${sig.status === "signed" ? "bg-emerald-50" : "bg-amber-50"}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {sig.status === "signed"
            ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            : <Clock className="w-3.5 h-3.5 text-amber-500" />
          }
          <div>
            <p className="text-xs font-medium text-gray-800">{sig.staffFirstName} {sig.staffLastName}</p>
            <p className="text-[10px] text-gray-500">{SIG_ROLE_LABELS[sig.role] || sig.role}</p>
          </div>
        </div>
        {sig.status === "signed" ? (
          <div className="text-right">
            <p className="text-[10px] italic text-emerald-700">{sig.signatureName}</p>
            {sig.signedAt && <p className="text-[9px] text-gray-400">{new Date(sig.signedAt).toLocaleDateString()}</p>}
          </div>
        ) : (
          !showSign && (
            <button onClick={() => setShowSign(true)} className="text-[10px] px-2 py-1 bg-amber-500 text-white rounded font-medium hover:bg-amber-600">
              Sign
            </button>
          )
        )}
      </div>
      {showSign && sig.status === "pending" && (
        <div className="mt-2 space-y-1.5">
          <input type="text" placeholder="Type full name to sign" value={name} onChange={e => setName(e.target.value)}
            className="w-full px-2 py-1.5 border border-amber-200 rounded text-xs bg-white italic" />
          <div className="flex gap-2">
            <button onClick={() => setShowSign(false)} className="flex-1 px-2 py-1 text-[10px] bg-white border border-gray-200 rounded">Cancel</button>
            <button onClick={() => { if (name) onSign(name); }} disabled={!name || isPending}
              className="flex-1 px-2 py-1 text-[10px] bg-emerald-700 text-white rounded disabled:opacity-50">
              {isPending ? "..." : "Confirm"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ComplianceItem({ done, label, sublabel, urgent }: { done: boolean; label: string; sublabel: string; urgent?: boolean }) {
  return (
    <div className={`flex items-start gap-3 p-2.5 rounded-lg ${done ? "bg-emerald-50" : urgent ? "bg-red-50" : "bg-gray-50"}`}>
      {done
        ? <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
        : urgent
          ? <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          : <Clock className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
      }
      <div>
        <p className={`text-xs font-semibold ${done ? "text-emerald-700" : urgent ? "text-red-700" : "text-gray-700"}`}>{label}</p>
        <p className={`text-[11px] ${done ? "text-emerald-600" : urgent ? "text-red-600" : "text-gray-500"}`}>{sublabel}</p>
      </div>
    </div>
  );
}
