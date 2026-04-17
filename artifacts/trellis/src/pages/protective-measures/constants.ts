export type Incident = {
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

export type Summary = {
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

export type IncidentDetail = any;
export type Staff = { id: number; firstName: string; lastName: string; role: string; title: string };
export type StatusHistoryEntry = {
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
export type Signature = {
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

export const TYPE_LABELS: Record<string, string> = {
  physical_restraint: "Physical Restraint",
  seclusion: "Seclusion",
  time_out: "Time-Out",
};
export const TYPE_COLORS: Record<string, string> = {
  physical_restraint: "bg-red-100 text-red-700",
  seclusion: "bg-amber-100 text-amber-700",
  time_out: "bg-amber-100 text-amber-700",
};
export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  draft_quick: "Draft — Quick Report",
  open: "Open",
  under_review: "Under Review",
  resolved: "Resolved",
  dese_reported: "DESE Reported",
};
export const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-500",
  draft_quick: "bg-amber-100 text-amber-700",
  open: "bg-blue-100 text-blue-700",
  under_review: "bg-purple-100 text-purple-700",
  resolved: "bg-gray-100 text-gray-600",
  dese_reported: "bg-gray-200 text-gray-600",
};

export const VALID_TRANSITIONS: Record<string, { toStatus: string; label: string; color: string; isReturn?: boolean }[]> = {
  draft: [
    { toStatus: "open", label: "Submit Incident", color: "bg-blue-600 hover:bg-blue-700 text-white" },
  ],
  draft_quick: [
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
export const RESTRAINT_TYPES: Record<string, string> = {
  floor: "Floor Restraint",
  seated: "Seated Restraint",
  standing: "Standing Restraint",
  escort: "Physical Escort",
  other: "Other",
};
export const BODY_POSITIONS: Record<string, string> = {
  prone: "Prone (face down)",
  supine: "Supine (face up)",
  seated: "Seated",
  standing: "Standing",
  side_lying: "Side-Lying",
  kneeling: "Kneeling",
};
export const ANTECEDENT_CATEGORIES: Record<string, string> = {
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
export const DEESC_STRATEGIES = [
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
export const SAFETY_CARE_PROCEDURES = [
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
export const CALMING_STRATEGIES = [
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
export const SIG_ROLE_LABELS: Record<string, string> = {
  reporting_staff: "Reporting Staff",
  additional_staff: "Additional Staff",
  observer: "Observer / Witness",
  admin_reviewer: "Administrator",
  principal: "Principal",
  witness: "Witness",
};

export function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
export function formatTime(t: string) {
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}
export function hoursUntilDeadline(incidentDate: string, incidentTime: string) {
  const incidentTs = new Date(`${incidentDate}T${incidentTime}`).getTime();
  const deadline = incidentTs + 24 * 60 * 60 * 1000;
  return Math.round((deadline - Date.now()) / (60 * 60 * 1000));
}

export const inputCls = "w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400";
export const textareaCls = "w-full px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none";
export const labelCls = "block text-xs font-medium text-gray-600 mb-1.5";
