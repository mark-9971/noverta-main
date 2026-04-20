import type { DemoFlowId } from "@/lib/demo-mode";
import type { UserRole } from "@/lib/role-context";

export interface WalkthroughStep {
  path: string;
  title: string;
  body: string;
}

export interface PersonaWalkthrough {
  id: DemoFlowId;
  label: string;
  /** Persona role to switch to before/while running this flow. */
  role: UserRole;
  /** One-line pitch shown beneath the launcher button. */
  blurb: string;
  steps: WalkthroughStep[];
}

export const PERSONA_WALKTHROUGHS: PersonaWalkthrough[] = [
  {
    id: "admin",
    label: "Admin",
    role: "admin",
    blurb: "District-wide compliance, action center, and reports.",
    steps: [
      { path: "/", title: "District dashboard",
        body: "Open with the leadership-first view: overall compliance and the students who need attention right now." },
      { path: "/action-center", title: "Action center",
        body: "Triage open alerts: timeline-at-risk students, missed sessions, and pending reviews — all in one queue." },
      { path: "/students", title: "Students",
        body: "Drill into the roster to show a single student's services, goals, and minute history." },
      { path: "/compliance", title: "Compliance",
        body: "Show the minute-shortfall view that turns delivery into a defensible compliance number." },
      { path: "/reports", title: "Reports & exports",
        body: "Close on the audit-ready exports the admin can hand to leadership or a state auditor." },
    ],
  },
  {
    id: "coordinator",
    label: "Coordinator",
    role: "coordinator",
    blurb: "Coverage, scheduling, and minutes-at-risk staffing view.",
    steps: [
      { path: "/", title: "Coordinator dashboard",
        body: "Same shell as the admin view — emphasize the staffing and coverage panels." },
      { path: "/scheduling?tab=coverage", title: "Coverage",
        body: "Show the coverage matrix: who is staffed where, and where coverage is thin." },
      { path: "/scheduling?tab=minutes", title: "Minutes at risk",
        body: "Surface the students whose mandated minutes are at risk this week." },
      { path: "/staff", title: "Staff",
        body: "Walk the staff roster and assignment surface." },
    ],
  },
  {
    id: "para",
    label: "Para",
    role: "para",
    blurb: "Day-of paraprofessional workflow: schedule, sessions, incidents.",
    steps: [
      { path: "/my-day", title: "My day",
        body: "Para opens to today's queue: schedule, students, and the next session to log." },
      { path: "/my-schedule", title: "My schedule",
        body: "Show the full week so the para can see what's coming." },
      { path: "/sessions", title: "Session log",
        body: "Log a session in two taps — minutes, goals worked, and a quick note." },
      { path: "/protective-measures", title: "Incidents",
        body: "Capture a restraint or seclusion incident with state-reportable fields." },
    ],
  },
  {
    id: "bcba",
    label: "BCBA",
    role: "bcba",
    blurb: "Caseload, programs, behavior support, and supervision.",
    steps: [
      { path: "/today", title: "Today",
        body: "BCBA opens to a clinician-shaped Today view: caseload, schedule, and program work." },
      { path: "/aba", title: "Learners",
        body: "Walk the learner directory — programs, current targets, and last session." },
      { path: "/behavior-assessment", title: "Behavior support / BIP",
        body: "Show the behavior intervention plan workflow and incident timeline." },
      { path: "/supervision", title: "Supervision",
        body: "Close with the BCBA-supervisor surface: paras, hours, and notes." },
    ],
  },
  {
    id: "executive",
    label: "Executive",
    role: "admin",
    blurb: "Finance lens: contracts, cost avoidance, and Medicaid claims.",
    steps: [
      { path: "/executive", title: "Executive dashboard",
        body: "Lead with the finance-shaped dashboard: spend, recovery, and exposure." },
      { path: "/contract-utilization", title: "Contract utilization",
        body: "Show how contracted agency hours are being used vs. paid for." },
      { path: "/cost-avoidance", title: "Cost avoidance",
        body: "Quantify avoided compensatory dollars from on-time service delivery." },
      { path: "/medicaid-billing", title: "Medicaid claims",
        body: "Close on revenue: the claim queue built from logged sessions." },
    ],
  },
];

export function getWalkthrough(id: DemoFlowId): PersonaWalkthrough | undefined {
  return PERSONA_WALKTHROUGHS.find(w => w.id === id);
}
