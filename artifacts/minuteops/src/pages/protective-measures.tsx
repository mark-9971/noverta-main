import { useState, useMemo, Fragment, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listProtectiveIncidents, getProtectiveSummary,
  listStudents, listStaff, getProtectiveIncident,
  createProtectiveIncident, adminReviewIncident, parentNotifyIncident,
  writtenReportIncident, deseReportIncident, signIncidentSignature,
  updateProtectiveIncident, parentNotificationDraftIncident,
  sendParentNotificationIncident, generateIncidentDraft,
  useGetAnalyticsPmOverview, useGetAnalyticsPmByStudent, useGetAnalyticsPmAntecedents,
} from "@workspace/api-client-react";
import {
  Shield, Plus, AlertTriangle, Clock, User, Search,
  ChevronRight, FileText, Bell, CheckCircle, XCircle,
  Filter, Calendar, Eye, ChevronDown, ChevronUp,
  ArrowLeft, TrendingUp, Download, PenLine, Send, UserCheck, Users,
  Mail, FilePenLine, Printer, BarChart2, Flame, History, Zap, Save,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
} from "recharts";
import { Link, useSearch } from "wouter";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { authFetch } from "@/lib/auth-fetch";
import { StudentQuickView } from "@/components/student-quick-view";
import { EmergencyAlertInline } from "@/components/emergency-alert-inline";
import { buildIncidentReportHtml, openPrintWindow, saveGeneratedDocument } from "@/lib/print-document";
import { Phone } from "lucide-react";

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
type StatusHistoryEntry = {
  id: number;
  incidentId: number;
  fromStatus: string;
  toStatus: string;
  note: string;
  actorStaffId: number | null;
  actorFirst: string | null;
  actorLast: string | null;
  createdAt: string;
};
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
  seclusion: "bg-amber-100 text-amber-700",
  time_out: "bg-amber-100 text-amber-700",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  open: "Open",
  under_review: "Under Review",
  resolved: "Resolved",
  dese_reported: "DESE Reported",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-500",
  open: "bg-blue-100 text-blue-700",
  under_review: "bg-purple-100 text-purple-700",
  resolved: "bg-gray-100 text-gray-600",
  dese_reported: "bg-gray-200 text-gray-600",
};

const VALID_TRANSITIONS: Record<string, { toStatus: string; label: string; color: string; isReturn?: boolean }[]> = {
  draft: [
    { toStatus: "open", label: "Submit Incident", color: "bg-blue-600 hover:bg-blue-700 text-white" },
  ],
  open: [
    { toStatus: "under_review", label: "Send to Admin Review", color: "bg-purple-600 hover:bg-purple-700 text-white" },
  ],
  under_review: [
    { toStatus: "resolved", label: "Approve & Resolve", color: "bg-gray-700 hover:bg-gray-800 text-white" },
    { toStatus: "open", label: "Return for Correction", color: "bg-red-100 hover:bg-red-200 text-red-700 border border-red-300", isReturn: true },
  ],
  resolved: [
    { toStatus: "dese_reported", label: "Mark DESE Reported", color: "bg-gray-600 hover:bg-gray-700 text-white" },
  ],
  dese_reported: [],
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
  const search = useSearch();
  const searchParams = new URLSearchParams(search);
  const [view, setView] = useState<"list" | "new" | "quick" | "detail">("list");
  const [detailId, setDetailId] = useState<number | null>(null);
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState(searchParams.get("status") ?? "all");
  const [searchTerm, setSearchTerm] = useState("");

  if (view === "new") return <NewIncidentForm onClose={() => setView("list")} />;
  if (view === "quick") return <QuickReportForm onClose={() => setView("list")} />;
  if (view === "detail" && detailId) return <IncidentDetailView id={detailId} onBack={() => { setView("list"); setDetailId(null); }} />;

  return <IncidentList
    filterType={filterType} setFilterType={setFilterType}
    filterStatus={filterStatus} setFilterStatus={setFilterStatus}
    searchTerm={searchTerm} setSearchTerm={setSearchTerm}
    onNew={() => setView("new")}
    onQuick={() => setView("quick")}
    onDetail={(id: number) => { setDetailId(id); setView("detail"); }}
  />;
}

const PM_MONTH_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#d1fae5", "#bbf7d0", "#a7f3d0", "#6ee7b7", "#34d399"];
const ANT_LABELS: Record<string, string> = {
  academic_demand: "Academic", transition: "Transition", unstructured_time: "Unstructured",
  sensory_overload: "Sensory", social_conflict: "Social", peer_interaction: "Peer",
  staff_redirection: "Staff Redirect", denied_access: "Denied Access",
};

function TrendsPanel() {
  const { data: _ov } = useGetAnalyticsPmOverview();
  const { data: _byStudent } = useGetAnalyticsPmByStudent();
  const { data: _ants } = useGetAnalyticsPmAntecedents();
  const ov = _ov as any;
  const byStudent = (_byStudent as any[]) ?? [];
  const ants = (_ants as any[]) ?? [];

  const [open, setOpen] = useState(true);

  if (!ov) return null;

  const monthlyData = (ov.monthlyTrend ?? []).map((m: any) => ({
    month: m.month ? new Date(m.month + "-01").toLocaleDateString("en-US", { month: "short" }) : m.month,
    total: m.total ?? 0,
  }));

  const highFreq = byStudent.filter((s: any) => s.total >= 10).slice(0, 5);

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <BarChart2 className="w-4 h-4 text-emerald-500" />
          Incident Trends &amp; Insights
          <span className="ml-2 text-[11px] font-normal text-gray-400">
            {ov.totalIncidents} incidents · {ov.studentsAffected} students · {ov.injuryRate}% injury rate
          </span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 p-5 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div>
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-2">Monthly Volume</p>
            <div className="h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} barSize={14}>
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis hide allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-white rounded shadow border border-gray-100 px-2.5 py-1.5 text-xs">
                          <span className="font-semibold text-gray-700">{label}: {payload[0].value} incidents</span>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                    {monthlyData.map((_: any, i: number) => (
                      <Cell key={i} fill={i >= monthlyData.length - 2 ? "#059669" : "#e5e7eb"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-2">Top Antecedents</p>
            <div className="space-y-1.5">
              {ants.slice(0, 5).map((a: any, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="text-[11px] text-gray-600 w-28 flex-shrink-0">{ANT_LABELS[a.category] ?? a.category}</div>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${a.percentage}%` }} />
                  </div>
                  <span className="text-[11px] text-gray-500 w-8 text-right">{a.percentage}%</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[11px] text-gray-400 font-medium uppercase tracking-wide mb-2 flex items-center gap-1">
              <Flame className="w-3 h-3 text-red-400" /> High-Frequency Students (10+ incidents)
            </p>
            {highFreq.length === 0 ? (
              <p className="text-xs text-gray-400">No students with 10+ incidents</p>
            ) : (
              <div className="space-y-2">
                {highFreq.map((s: any) => (
                  <Link key={s.studentId} href={`/students/${s.studentId}`}>
                    <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors cursor-pointer">
                      <span className="text-xs font-medium text-red-800">{s.firstName} {s.lastName}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-red-700">{s.total}</span>
                        {s.injuries > 0 && <span className="text-[10px] bg-red-200 text-red-800 rounded px-1">{s.injuries} inj.</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 gap-2 text-center">
              <div>
                <div className="text-lg font-bold text-gray-800">{ov.bipRate}%</div>
                <div className="text-[10px] text-gray-400">BIP in Place</div>
              </div>
              <div>
                <div className="text-lg font-bold text-gray-800">{ov.debriefRate}%</div>
                <div className="text-[10px] text-gray-400">Debrief Rate</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IncidentList({ filterType, setFilterType, filterStatus, setFilterStatus, searchTerm, setSearchTerm, onNew, onQuick, onDetail }: {
  filterType: string; setFilterType: (v: string) => void;
  filterStatus: string; setFilterStatus: (v: string) => void;
  searchTerm: string; setSearchTerm: (v: string) => void;
  onNew: () => void;
  onQuick: () => void;
  onDetail: (id: number) => void;
}) {
  const [exportYear, setExportYear] = useState("2025-2026");

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ["protective-incidents", filterType, filterStatus],
    queryFn: ({ signal }) => listProtectiveIncidents({
      ...(filterType !== "all" ? { incidentType: filterType } : {}),
      ...(filterStatus !== "all" ? { status: filterStatus } : {}),
    }, { signal }) as Promise<Incident[]>,
  });

  const { data: _summaryData } = useQuery({
    queryKey: ["protective-summary"],
    queryFn: ({ signal }) => getProtectiveSummary(undefined, { signal }),
  });
  const summary = _summaryData as Summary | undefined;

  const filtered = useMemo(() => {
    if (!searchTerm) return incidents;
    const lower = searchTerm.toLowerCase();
    return incidents.filter(i =>
      `${i.studentFirstName} ${i.studentLastName}`.toLowerCase().includes(lower) ||
      i.behaviorDescription.toLowerCase().includes(lower)
    );
  }, [incidents, searchTerm]);

  const handleDeseExport = () => {
    window.open(`/api/protective-measures/dese-export?schoolYear=${exportYear}`, "_blank");
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
          <button onClick={onQuick} className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors shadow-sm">
            <Zap className="w-4 h-4" /> Quick Report
          </button>
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
            icon={<PenLine className="w-4 h-4 text-amber-400" />}
            color={(summary.pendingSignatures || 0) > 0 ? "text-amber-600" : "text-gray-600"}
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
            icon={<Send className="w-4 h-4 text-amber-400" />}
            color={summary.deseReportsPending > 0 ? "text-amber-600" : "text-gray-600"}
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

      <TrendsPanel />

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
            <option value="draft">Draft</option>
            <option value="open">Open</option>
            <option value="under_review">Under Review</option>
            <option value="resolved">Resolved</option>
            <option value="dese_reported">DESE Reported</option>
            <option value="notification_pending">Notifications Pending</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-gray-400">Loading incidents...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Shield}
            title="No incidents recorded"
            description='Use "Report Incident" to document any restraint, seclusion, or time-out event for this student.'
            compact
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map(inc => (
              <button key={inc.id} onClick={() => onDetail(inc.id)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50/60 transition-colors text-left">
                <div className="flex-shrink-0">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${inc.incidentType === "physical_restraint" ? "bg-red-100" : inc.incidentType === "seclusion" ? "bg-amber-100" : "bg-amber-50"}`}>
                    <Shield className={`w-5 h-5 ${inc.incidentType === "physical_restraint" ? "text-red-600" : inc.incidentType === "seclusion" ? "text-amber-700" : "text-amber-600"}`} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-gray-800">{inc.studentFirstName} {inc.studentLastName}</span>
                    <StudentQuickView
                      studentId={inc.studentId}
                      studentName={`${inc.studentFirstName} ${inc.studentLastName}`}
                      grade={null}
                      trigger={
                        <span className="p-1 rounded hover:bg-gray-100 flex-shrink-0 transition-colors" title="Quick view: emergency contacts &amp; alerts">
                          <Phone className="w-3 h-3 text-gray-400 hover:text-emerald-600" />
                        </span>
                      }
                    />
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[inc.incidentType] || "bg-gray-100 text-gray-600"}`}>
                      {TYPE_LABELS[inc.incidentType] || inc.incidentType}
                    </span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[inc.status] || "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[inc.status] || inc.status}
                    </span>
                    {inc.deseReportRequired && !inc.deseReportSentAt && (
                      <span className="text-[10px] font-semibold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">DESE DUE</span>
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
                  {inc.staffInjury && <span className="w-2 h-2 rounded-full bg-amber-500" title="Staff injury" />}
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

function QuickReportForm({ onClose }: { onClose: () => void }) {
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

function NewIncidentForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved">("idle");
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaveRef = useRef<string>("");
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

      const res = await createProtectiveIncident({
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
        });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["protective-incidents"] });
      queryClient.invalidateQueries({ queryKey: ["protective-summary"] });
      try { localStorage.removeItem("pm-incident-draft"); } catch {}
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
          <h1 className="text-xl font-bold text-gray-800">Report Incident</h1>
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

function IncidentTransitionDialog({
  incident,
  onClose,
  onTransitioned,
}: {
  incident: { id: number; status: string; studentFirstName: string; studentLastName: string };
  onClose: () => void;
  onTransitioned: () => void;
}) {
  const transitions = VALID_TRANSITIONS[incident.status] ?? [];
  const [toStatus, setToStatus] = useState(transitions[0]?.toStatus ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const selectedTransition = transitions.find(t => t.toStatus === toStatus);
  const isReturn = selectedTransition?.isReturn ?? false;

  async function handleSubmit() {
    if (!note.trim()) { toast.error("A note is required for this transition"); return; }
    if (!toStatus) { toast.error("Select a target status"); return; }
    setSaving(true);
    try {
      const res = await authFetch(`/api/protective-measures/incidents/${incident.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus, note: note.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || "Failed");
      }
      toast.success(`Status updated to "${STATUS_LABELS[toStatus]}"`);
      onTransitioned();
    } catch (e: any) {
      toast.error(e.message || "Failed to transition status");
    }
    setSaving(false);
  }

  if (transitions.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-800">
            {isReturn ? "Return for Correction" : "Update Incident Status"}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {incident.studentFirstName} {incident.studentLastName} — currently{" "}
            <span className={`font-medium px-1.5 py-0.5 rounded text-xs ${STATUS_COLORS[incident.status]}`}>
              {STATUS_LABELS[incident.status]}
            </span>
          </p>
        </div>
        {transitions.length > 1 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Move to</label>
            <div className="flex gap-2 flex-wrap">
              {transitions.map(t => (
                <button key={t.toStatus} onClick={() => setToStatus(t.toStatus)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border-2 transition-colors ${
                    toStatus === t.toStatus ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {toStatus === "resolved" || toStatus === "dese_reported" ? "Resolution Note" : "Transition Note"}{" "}
            <span className="text-red-500">*</span>
          </label>
          <textarea
            className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400 resize-none"
            rows={3}
            placeholder={isReturn ? "Describe what needs to be corrected or clarified before this can proceed…" :
              toStatus === "resolved" ? "Describe how this incident was resolved and any follow-up taken…" :
              toStatus === "under_review" ? "Note the reason for escalation to admin review…" :
              "Add a note for this status change…"}
            value={note}
            onChange={e => setNote(e.target.value)}
            autoFocus
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors" disabled={saving}>
            Cancel
          </button>
          <button onClick={handleSubmit}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${transitions.find(t => t.toStatus === toStatus)?.color || "bg-emerald-700 text-white"}`}
            disabled={saving}>
            {saving ? "Saving…" : (transitions.find(t => t.toStatus === toStatus)?.label ?? "Confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

function IncidentDetailView({ id, onBack }: { id: number; onBack: () => void }) {
  const queryClient = useQueryClient();

  const { data: incident, isLoading } = useQuery<IncidentDetail>({
    queryKey: ["protective-incident", id],
    queryFn: ({ signal }) => getProtectiveIncident(id, { signal }),
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["staff-list"],
    queryFn: ({ signal }) => listStaff(undefined, { signal }) as Promise<Staff[]>,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["protective-incident", id] });
    queryClient.invalidateQueries({ queryKey: ["protective-incidents"] });
    queryClient.invalidateQueries({ queryKey: ["protective-summary"] });
  };

  const reviewMutation = useMutation({
    mutationFn: (data: { adminStaffId: number; notes: string; signature: string }) =>
      adminReviewIncident(id, data),
    onSuccess: invalidateAll,
  });

  const notifyMutation = useMutation({
    mutationFn: (data: { notifiedById: number; method: string; verbal?: boolean }) =>
      parentNotifyIncident(id, data),
    onSuccess: invalidateAll,
  });

  const writtenReportMutation = useMutation({
    mutationFn: (method: string) => writtenReportIncident(id, { method }),
    onSuccess: invalidateAll,
  });

  const [showDeseDialog, setShowDeseDialog] = useState(false);
  const [deseNote, setDeseNote] = useState("");
  const deseMutation = useMutation({
    mutationFn: (note: string) => deseReportIncident(id, { thirtyDayLogSent: true, note } as Record<string, unknown>),
    onSuccess: () => { invalidateAll(); setShowDeseDialog(false); setDeseNote(""); },
  });

  const signMutation = useMutation({
    mutationFn: (data: { sigId: number; signatureName: string; notes?: string }) =>
      signIncidentSignature(id, data.sigId, { signatureName: data.signatureName, notes: data.notes }),
    onSuccess: invalidateAll,
  });

  const commentMutation = useMutation({
    mutationFn: (data: { parentComment?: string; studentComment?: string }) =>
      updateProtectiveIncident(id, { ...data, parentCommentOpportunityGiven: true }),
    onSuccess: invalidateAll,
  });

  const saveDraftMutation = useMutation({
    mutationFn: (draft: string) => parentNotificationDraftIncident(id, { draft }),
    onSuccess: invalidateAll,
  });

  type SendNotificationResult = {
    emailNotSent?: boolean;
    emailResult?: {
      success: boolean;
      notConfigured?: boolean;
      error?: string;
      communicationEventId?: number;
    };
    parentNotificationSentAt?: string | null;
    [key: string]: unknown;
  };

  const [lastEmailFailure, setLastEmailFailure] = useState<{ notConfigured: boolean; error: string } | null>(null);

  const sendNotificationMutation = useMutation({
    mutationFn: (data: { draft: string; method: string }) =>
      sendParentNotificationIncident(id, data) as Promise<SendNotificationResult>,
    onSuccess: (data: SendNotificationResult) => {
      invalidateAll();
      const er = data?.emailResult;
      if (data?.emailNotSent) {
        if (er?.notConfigured) {
          setLastEmailFailure({ notConfigured: true, error: "Email provider not configured" });
          toast.warning("Notification draft saved. Email delivery is not configured — add RESEND_API_KEY to enable real delivery.", { duration: 8000 });
        } else {
          const msg = er?.error ?? "Unknown error";
          setLastEmailFailure({ notConfigured: false, error: msg });
          toast.error(`Email delivery failed: ${msg}. Please retry or choose a different notification method.`, { duration: 8000 });
        }
      } else if (er?.success === true) {
        setLastEmailFailure(null);
        toast.success("Parent notification email sent successfully");
      } else {
        setLastEmailFailure(null);
        toast.success("Parent notification recorded");
      }
    },
    onError: (err: Error) => { toast.error(err.message || "Failed to send notification"); },
  });

  const reviewNotificationMutation = useMutation({
    mutationFn: (data: { action: "approve" | "return"; note: string }) =>
      authFetch(`/api/protective-measures/incidents/${id}/review-notification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async r => { if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error((e as { error?: string }).error || "Review failed"); } return r.json(); }),
    onSuccess: () => { invalidateAll(); queryClient.invalidateQueries({ queryKey: ["incident-status-history", id] }); },
    onError: (err: Error) => { toast.error(err.message || "Failed to record review"); },
  });

  const { data: statusHistory = [] } = useQuery<StatusHistoryEntry[]>({
    queryKey: ["incident-status-history", id],
    queryFn: ({ signal }) =>
      authFetch(`/api/protective-measures/incidents/${id}/status-history`, { signal })
        .then(r => r.json()),
    enabled: !!id,
  });

  const [showNotify, setShowNotify] = useState(false);
  const [showWritten, setShowWritten] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [showComment, setShowComment] = useState(false);
  const [showTransition, setShowTransition] = useState(false);
  const [notifyForm, setNotifyForm] = useState({ staffId: "", method: "phone" });
  const [writtenMethod, setWrittenMethod] = useState("email");
  const [reviewForm, setReviewForm] = useState({ adminStaffId: "", notes: "", signature: "" });
  const [commentForm, setCommentForm] = useState({ parentComment: "", studentComment: "" });

  if (isLoading || !incident) return <div className="p-12 text-center text-sm text-gray-400">Loading...</div>;

  const signatures: Signature[] = incident.signatures || [];
  const pendingSigs = signatures.filter(s => s.status === "pending");
  const signedSigs = signatures.filter(s => s.status === "signed");
  const availableTransitions = VALID_TRANSITIONS[incident.status] ?? [];

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto space-y-6">
      {showTransition && incident.student && (
        <IncidentTransitionDialog
          incident={{
            id: incident.id,
            status: incident.status,
            studentFirstName: incident.student.firstName,
            studentLastName: incident.student.lastName,
          }}
          onClose={() => setShowTransition(false)}
          onTransitioned={() => { setShowTransition(false); invalidateAll(); }}
        />
      )}

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
        {availableTransitions.length > 0 && (
          <button
            onClick={() => setShowTransition(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5"
          >
            <ChevronRight className="w-3.5 h-3.5" />
            Advance Status
          </button>
        )}
        {incident.resolutionNote && (
          <div className="w-full mt-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <p className="text-[11px] text-gray-500 font-medium">Resolution Note</p>
            <p className="text-[12px] text-gray-700 mt-0.5 italic">"{incident.resolutionNote}"</p>
          </div>
        )}
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
                {incident.physicalEscortOnly && <span className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded-full font-medium">Physical Escort Only</span>}
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
                <div key={s.id} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg">
                  <Eye className="w-4 h-4 text-gray-500" />
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
              {incident.parentComment && <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs font-medium text-gray-700">Parent Comment</p><p className="text-sm text-gray-800 mt-1">{incident.parentComment}</p></div>}
              {incident.studentComment && <div className="bg-gray-50 rounded-lg p-3"><p className="text-xs font-medium text-gray-700">Student Comment</p><p className="text-sm text-gray-800 mt-1">{incident.studentComment}</p></div>}
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
            reviewNotificationMutation={reviewNotificationMutation}
            statusHistory={statusHistory}
            lastEmailFailure={lastEmailFailure}
            setLastEmailFailure={setLastEmailFailure}
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
              <button onClick={() => setShowComment(true)} className="w-full px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 flex items-center justify-center gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Record Comments
              </button>
            )}
            {showComment && !incident.parentCommentOpportunityGiven && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                <textarea value={commentForm.parentComment} onChange={e => setCommentForm(f => ({ ...f, parentComment: e.target.value }))}
                  placeholder="Parent comment (leave blank if none)..." rows={2} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs bg-white resize-none" />
                <textarea value={commentForm.studentComment} onChange={e => setCommentForm(f => ({ ...f, studentComment: e.target.value }))}
                  placeholder="Student comment (leave blank if none)..." rows={2} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs bg-white resize-none" />
                <div className="flex gap-2">
                  <button onClick={() => setShowComment(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded">Cancel</button>
                  <button onClick={() => commentMutation.mutate({ parentComment: commentForm.parentComment || undefined, studentComment: commentForm.studentComment || undefined })}
                    disabled={commentMutation.isPending}
                    className="flex-1 px-2 py-1.5 text-xs bg-emerald-600 text-white rounded disabled:opacity-50">
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
                  <button onClick={() => setShowDeseDialog(true)} disabled={deseMutation.isPending}
                    className="w-full px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 flex items-center justify-center gap-1.5 disabled:opacity-50">
                    <Send className="w-3.5 h-3.5" /> Mark DESE Report Sent
                  </button>
                )}
                {showDeseDialog && (
                  <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 space-y-4">
                      <h3 className="text-base font-semibold text-gray-800">File DESE Report</h3>
                      <p className="text-sm text-gray-500">Document the submission of this incident to DESE. A note is required.</p>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Note <span className="text-red-500">*</span></label>
                        <textarea
                          value={deseNote}
                          onChange={e => setDeseNote(e.target.value)}
                          rows={3}
                          placeholder="Describe the report submitted, submission method, and any confirmation details…"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={() => { setShowDeseDialog(false); setDeseNote(""); }}
                          className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50" disabled={deseMutation.isPending}>
                          Cancel
                        </button>
                        <button
                          onClick={() => { if (!deseNote.trim()) { toast.error("A note is required"); return; } deseMutation.mutate(deseNote.trim()); }}
                          disabled={deseMutation.isPending || !deseNote.trim()}
                          className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                          {deseMutation.isPending ? "Filing..." : "File DESE Report"}
                        </button>
                      </div>
                    </div>
                  </div>
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

          {statusHistory.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <History className="w-4 h-4 text-gray-400" />
                Status History
              </h3>
              <div className="space-y-3">
                {statusHistory.map(entry => (
                  <div key={entry.id} className="relative pl-4 border-l-2 border-gray-200">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[entry.fromStatus] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABELS[entry.fromStatus] ?? entry.fromStatus}</span>
                      <ChevronRight className="w-3 h-3 text-gray-400" />
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[entry.toStatus] ?? "bg-gray-100 text-gray-600"}`}>{STATUS_LABELS[entry.toStatus] ?? entry.toStatus}</span>
                    </div>
                    <p className="text-[11px] text-gray-600 italic mt-0.5">"{entry.note}"</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {entry.actorFirst ? `${entry.actorFirst} ${entry.actorLast} · ` : ""}{new Date(entry.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ParentNotificationPanel({ incident, staff, incidentId, saveDraftMutation, sendNotificationMutation, reviewNotificationMutation, statusHistory, lastEmailFailure, setLastEmailFailure }: {
  incident: any;
  staff: Staff[];
  incidentId: number;
  saveDraftMutation: any;
  sendNotificationMutation: any;
  reviewNotificationMutation: any;
  statusHistory: StatusHistoryEntry[];
  lastEmailFailure: { notConfigured: boolean; error: string } | null;
  setLastEmailFailure: (v: { notConfigured: boolean; error: string } | null) => void;
}) {
  const [draftText, setDraftText] = useState(incident.parentNotificationDraft || "");
  const [sendMethod, setSendMethod] = useState("email");
  const [showConfirm, setShowConfirm] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [showReviewPanel, setShowReviewPanel] = useState(false);
  const [reviewAction, setReviewAction] = useState<"approve" | "return">("approve");

  const isAdminReviewed = incident.status === "under_review" || incident.status === "resolved";
  const alreadySent = !!incident.parentNotificationSentAt;
  const lastReviewEntry = statusHistory.find(h =>
    h.toStatus === "notification_approved" || h.toStatus === "notification_returned"
  );
  const notificationApproved = lastReviewEntry?.toStatus === "notification_approved";

  const generateDraft = async () => {
    setLoadingDraft(true);
    try {
      const data = await generateIncidentDraft(incidentId) as { draft: string; caseManager?: { id: number } };
      setDraftText(data.draft);
    } catch { toast.error("Failed to generate draft"); }
    setLoadingDraft(false);
  };

  useEffect(() => {
    if (isAdminReviewed && !alreadySent && !draftText && !incident.parentNotificationDraft) {
      generateDraft();
    }
  }, [isAdminReviewed, alreadySent]);

  const handleDownloadPdf = () => {
    const staffMap: Record<number, string> = {};
    staff.forEach(s => { staffMap[s.id] = `${s.firstName} ${s.lastName}`; });
    const studentName = incident.studentFirstName
      ? `${incident.studentFirstName} ${incident.studentLastName}`
      : incident.student ? `${incident.student.firstName} ${incident.student.lastName}` : "Student";
    const html = buildIncidentReportHtml({
      incident: incident as Record<string, unknown>,
      studentName,
      studentDob: incident.student?.dateOfBirth ?? null,
      school: incident.schoolName ?? incident.school?.name ?? null,
      district: incident.districtName ?? incident.district?.name ?? null,
      staffMap,
    });
    openPrintWindow(html);
    const studentId: number | undefined = incident.studentId;
    if (studentId) {
      saveGeneratedDocument({
        studentId,
        type: "incident_report",
        title: `Restraint/Seclusion Report — ${new Date(incident.incidentDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
        htmlSnapshot: html,
        linkedRecordId: incidentId,
        status: "finalized",
      });
    }
  };

  const handleSaveDraft = () => {
    saveDraftMutation.mutate(draftText);
    toast.success("Draft saved");
  };

  const handleReviewSubmit = () => {
    if (!reviewNote.trim()) { toast.error("A review note is required"); return; }
    reviewNotificationMutation.mutate({ action: reviewAction, note: reviewNote }, {
      onSuccess: () => {
        setShowReviewPanel(false);
        setReviewNote("");
        toast.success(reviewAction === "approve" ? "Notification approved for sending" : "Notification returned for correction");
      },
    });
  };

  const handleSend = () => {
    sendNotificationMutation.mutate({ draft: draftText, method: sendMethod });
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

      {lastReviewEntry && (
        <div className={`rounded-lg px-3 py-2 text-[11px] flex items-start gap-2 ${lastReviewEntry.toStatus === "notification_approved" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
          {lastReviewEntry.toStatus === "notification_approved"
            ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            : <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
          <div>
            <span className="font-medium">{lastReviewEntry.toStatus === "notification_approved" ? "Approved for sending" : "Returned for correction"}</span>
            {lastReviewEntry.actorFirst && <span className="text-[10px] opacity-75 ml-1">— {lastReviewEntry.actorFirst} {lastReviewEntry.actorLast}</span>}
            <p className="mt-0.5 opacity-80">{lastReviewEntry.note}</p>
          </div>
        </div>
      )}

      {!showReviewPanel ? (
        <div className="flex gap-2">
          <button onClick={() => { setReviewAction("approve"); setShowReviewPanel(true); }}
            disabled={notificationApproved}
            className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
            <CheckCircle className="w-3 h-3" /> {notificationApproved ? "Approved" : "Approve for Sending"}
          </button>
          <button onClick={() => { setReviewAction("return"); setShowReviewPanel(true); }}
            className="flex-1 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold hover:bg-red-100 flex items-center justify-center gap-1.5">
            <XCircle className="w-3 h-3" /> Return for Correction
          </button>
        </div>
      ) : (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-700">
            {reviewAction === "approve" ? "Approve Notification" : "Return for Correction"} — Note Required
          </p>
          <textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} rows={3}
            placeholder={reviewAction === "approve" ? "Note why this notification is approved..." : "Describe what needs to be corrected..."}
            className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs bg-white focus:ring-1 focus:ring-emerald-300 resize-none" />
          <div className="flex gap-2">
            <button onClick={() => setShowReviewPanel(false)} className="flex-1 px-2 py-1.5 text-xs bg-white border border-gray-200 rounded">Cancel</button>
            <button onClick={handleReviewSubmit} disabled={reviewNotificationMutation.isPending || !reviewNote.trim()}
              className={`flex-1 px-2 py-1.5 text-xs text-white rounded disabled:opacity-50 font-medium ${reviewAction === "approve" ? "bg-emerald-700" : "bg-red-600"}`}>
              {reviewNotificationMutation.isPending ? "Saving..." : reviewAction === "approve" ? "Confirm Approval" : "Return for Correction"}
            </button>
          </div>
        </div>
      )}

      {notificationApproved && (
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <label className="text-xs font-medium text-gray-700">Send Notification</label>
          <select value={sendMethod} onChange={e => setSendMethod(e.target.value)}
            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white">
            <option value="email">Email</option>
            <option value="certified_mail">Certified Mail</option>
            <option value="hand_delivered">Hand Delivered</option>
          </select>

          {lastEmailFailure && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-red-700">
                  {lastEmailFailure.notConfigured ? "Email not configured" : "Email delivery failed"}
                </p>
                <p className="text-[10px] text-red-600 mt-0.5">
                  {lastEmailFailure.notConfigured
                    ? "Add RESEND_API_KEY to enable real email delivery, or switch to Certified Mail / Hand Delivered below."
                    : `${lastEmailFailure.error}. Update the method or try again.`}
                </p>
              </div>
              <button
                onClick={() => { setLastEmailFailure(null); setShowConfirm(true); }}
                disabled={!draftText}
                className="text-[10px] px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 whitespace-nowrap flex-shrink-0">
                Retry
              </button>
            </div>
          )}

          {!showConfirm ? (
            <button onClick={() => setShowConfirm(true)} disabled={!draftText}
              className="w-full px-3 py-2.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
              <Send className="w-3.5 h-3.5" /> Send Parent Notification with Report
            </button>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-amber-800">Confirm Send</p>
              {sendMethod === "email"
                ? <p className="text-[11px] text-amber-700">The notification will be emailed to the parent/guardian. The incident will only be marked as sent after confirmed delivery. If email is not configured, you can use "Preview / Download Restraint Report PDF" above as a fallback.</p>
                : <p className="text-[11px] text-amber-700">This will mark the parent notification as sent via {sendMethod.replace(/_/g, " ")} and attach the restraint report. This action cannot be undone.</p>
              }
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
      )}
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
