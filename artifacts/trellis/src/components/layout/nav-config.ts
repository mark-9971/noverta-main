import {
  LayoutDashboard, Users, Calendar, AlertTriangle, ClipboardList,
  BarChart3, UserCheck, Upload, Activity,
  Search, Shield, ShieldCheck, Building2,
  Star, Clock, Sparkles, Sun, Library,
  Clipboard, Sprout, Gauge, CalendarDays,
  BookOpen, Scale, MessageSquare, FileText, Briefcase, ListChecks, Database,
  Heart, Trophy, CreditCard, Crown, FileSearch, TrendingDown, DollarSign,
  GraduationCap, Stethoscope, Truck, Contact, Settings, Mail, FileBarChart,
  Trash2, CheckCircle, Bell, Send, Gift, ArrowLeftRight, FileDown, Zap,
  LineChart, Brain, Target, PlusCircle, ClipboardCheck,
} from "lucide-react";
import { type FeatureKey } from "@/lib/module-tiers";

type IconComponent = React.ComponentType<{ className?: string }>;

export type SubNavItem = {
  href: string;
  label: string;
  icon: IconComponent;
};

export type NavItem = {
  href: string;
  label: string;
  icon: IconComponent;
  primary?: boolean;
  alertBadge?: boolean;
  comingSoon?: boolean;
  featureKey?: FeatureKey;
  children?: SubNavItem[];
};

export type NavSection = {
  label?: string;
  icon?: IconComponent;
  items: NavItem[];
  collapsible?: boolean;
  defaultOpen?: boolean;
};

export const platformAdminSection: NavSection = {
  label: "Platform",
  icon: Crown,
  collapsible: true,
  items: [
    { href: "/tenants", label: "Tenant Management", icon: Crown },
    { href: "/admin/demo-readiness", label: "Demo Pre-Flight", icon: Activity },
  ],
};

// Top-level admin IA — wedge-focused layout (Pass 2):
//
//   1) Overview        — daily landing (Dashboard + Alerts)
//   2) Compliance      — core wedge: compliance, risk, compensatory, docs
//   3) Service Delivery — trimmed to 6 core items only
//   4) Reports         — cross-cutting reporting surface
//   5) Billing         — collapsed by default (finance, not compliance)
//   6) Settings        — collapsed by default (config, not daily ops)
//   7) More tools      — everything else, collapsed, route-accessible
//
// Service Delivery trimmed from 11 → 6 items. Demoted to More tools:
//   Staff Calendar, IEP Meetings, IEP Calendar, Caseload Balancing,
//   IEP Search, Evaluations, Progress Reports.
// Directory (Students + Staff) promoted from Staffing → Overview (above Alerts).
// Billing and Settings now default-closed to reduce sidebar weight.
// No routes, pages, APIs, or business logic removed — hidden only.
export const adminNav: NavSection[] = [
  // ── 1. Overview ──────────────────────────────────────────────────────────
  {
    label: "Overview",
    icon: LayoutDashboard,
    collapsible: true,
    defaultOpen: true,
    items: [
      // Action Center: student search + triaged work queue (Urgent/This Week/Coming Up)
      // aggregates alerts, compliance risk, IEP deadlines, evaluations, meetings.
      { href: "/action-center", label: "Action Center", icon: Zap, primary: true },
      { href: "/", label: "Dashboard", icon: LayoutDashboard, primary: true },
      {
        href: "/students", label: "Directory", icon: Users, primary: true,
        children: [
          { href: "/students", label: "Students", icon: Users },
          { href: "/staff", label: "Staff", icon: UserCheck },
        ],
      },
      {
        href: "/alerts", label: "Alerts", icon: AlertTriangle, primary: true, alertBadge: true,
        children: [
          { href: "/alerts?tab=open", label: "Open", icon: AlertTriangle },
          { href: "/alerts?tab=snoozed", label: "Snoozed", icon: Clock },
          { href: "/alerts?tab=resolved", label: "Resolved", icon: CheckCircle },
        ],
      },
    ],
  },
  // ── 2. Compliance & Risk ───────────────────────────────────────────────────
  {
    label: "Compliance & Risk",
    icon: ListChecks,
    collapsible: true,
    defaultOpen: true,
    items: [
      {
        href: "/compliance", label: "Compliance", icon: ListChecks, featureKey: "compliance.service_minutes" as FeatureKey,
        children: [
          { href: "/compliance?tab=risk-report", label: "Risk Report", icon: FileBarChart },
          { href: "/compliance?tab=minutes", label: "Service Minutes", icon: Clock },
          { href: "/compliance?tab=checklist", label: "Checklist", icon: ListChecks },
          { href: "/compliance?tab=timeline", label: "Timeline", icon: Calendar },
          { href: "/compliance?tab=trends", label: "Trends", icon: TrendingDown },
        ],
      },
      // Reports lives here — not under Financial/Executive — because all tabs are
      // compliance artifacts (executive summary, audit package, trend, exports).
      // Moving it here keeps it visible by default alongside the operational
      // compliance view rather than buried in a collapsed financial section.
      {
        href: "/reports", label: "Reports", icon: BarChart3,
        children: [
          { href: "/reports?tab=executive", label: "Executive Summary", icon: BarChart3 },
          { href: "/reports?tab=trend", label: "Compliance Trend", icon: TrendingDown },
          { href: "/reports?tab=audit", label: "Audit Package", icon: FileText },
          // "Minutes Export" — tabular export view (complement to Compliance → Service Minutes)
          { href: "/reports?tab=minutes", label: "Minutes Export", icon: Clock },
          { href: "/reports?tab=missed", label: "Missed Sessions", icon: AlertTriangle },
          // "At-Risk Export" — tabular/CSV export; full narrative at Compliance → Risk Report
          { href: "/reports?tab=risk", label: "At-Risk Export", icon: Shield },
          { href: "/reports?tab=parent", label: "Parent Summary", icon: Heart },
          { href: "/reports?tab=exports", label: "Bulk Exports", icon: FileDown },
          { href: "/weekly-compliance-summary", label: "Weekly Summary", icon: FileBarChart },
          { href: "/leadership-packet", label: "Leadership Packet", icon: FileBarChart },
        ],
      },
      {
        href: "/compensatory-services", label: "Compensatory", icon: Scale,
        children: [
          { href: "/compensatory-services?tab=obligations", label: "Obligations", icon: Gift },
          { href: "/compensatory-services?tab=cost-avoidance", label: "Cost Avoidance", icon: TrendingDown },
          { href: "/compensatory-finance", label: "Financial Exposure", icon: DollarSign },
        ],
      },
      { href: "/scheduling?tab=minutes", label: "Minutes at Risk", icon: AlertTriangle },
      { href: "/document-workflow", label: "Document Workflow", icon: ClipboardList },
    ],
  },
  // ── 3. IEP & Services ─────────────────────────────────────────────────────
  // IEP Hub (/iep) removed from nav — IEP Builder promoted as the direct entry
  // point. Hub route is preserved and deep links still work; it's just no longer
  // a required click in the daily workflow.
  {
    label: "IEP & Services",
    icon: GraduationCap,
    collapsible: true,
    defaultOpen: true,
    items: [
      {
        href: "/iep-builder", label: "IEP Builder", icon: Sparkles, primary: true,
        children: [
          { href: "/iep-builder", label: "Builder", icon: Sparkles },
          { href: "/iep-search", label: "Search", icon: FileSearch },
        ],
      },
      {
        href: "/iep-meetings", label: "IEP Meetings", icon: CalendarDays,
        children: [
          { href: "/iep-meetings", label: "Meetings", icon: CalendarDays },
          { href: "/iep-meetings?tab=calendar", label: "Calendar", icon: Calendar },
        ],
      },
      {
        href: "/evaluations", label: "Evaluations & Progress", icon: FileSearch,
        children: [
          { href: "/evaluations", label: "Evaluations", icon: FileSearch },
          { href: "/progress-reports", label: "Progress Reports", icon: FileText },
        ],
      },
      { href: "/transitions", label: "Transition Planning", icon: Sprout },
      { href: "/accommodation-lookup", label: "Accommodation Verification", icon: FileText },
      {
        href: "/parent-communication", label: "Parent Comms", icon: MessageSquare, featureKey: "engagement.parent_communication" as FeatureKey,
        children: [
          { href: "/parent-communication?tab=all", label: "All Contacts", icon: MessageSquare },
          { href: "/parent-communication?tab=overdue", label: "Overdue Follow-ups", icon: Clock },
          { href: "/parent-communication?tab=notifications", label: "Notifications Needed", icon: Bell },
          { href: "/parent-communication?tab=comms_log", label: "Email Audit Log", icon: Send },
        ],
      },
    ],
  },
  // ── 4. ABA & Behavior ─────────────────────────────────────────────────────
  //
  // Structured as 6 clinical domains — each is a collapsible NavItem group:
  //
  //   Learners    → Who is on the caseload and what they are working on
  //   Sessions    → Session workflow: start, collect, review, gap-track
  //   Programs    → Program library, templates, mastery/maintenance
  //   Analysis    → Graphs, behavior data (distinct destinations only)
  //   Reporting   → Progress reports, team summaries, export/print
  //   Supervision → IOA, fidelity, supervision sessions, staff performance
  //
  // All routes already exist — sub-items use ?tab= params to deep-link into
  // multi-tab pages. No routes, pages, or business logic were changed.
  {
    label: "ABA & Behavior",
    icon: Activity,
    collapsible: true,
    defaultOpen: true,
    items: [
      // ── Learners ─────────────────────────────────────────────────────────
      {
        href: "/aba",
        label: "Learners",
        icon: Users,
        featureKey: "clinical.program_data" as FeatureKey,
        children: [
          { href: "/aba", label: "ABA Caseload", icon: Users },
          { href: "/aba?tab=programs", label: "Active Programs", icon: Activity },
          { href: "/behavior-assessment", label: "Behavior Support / BIP", icon: Shield },
        ],
      },
      // ── Sessions ─────────────────────────────────────────────────────────
      {
        href: "/program-data",
        label: "Sessions",
        icon: CalendarDays,
        children: [
          { href: "/program-data", label: "Data Collection", icon: ClipboardCheck },
          { href: "/aba?tab=programs", label: "Programs & Targets", icon: Activity },
          { href: "/aba?tab=analytics", label: "Session Analytics", icon: BarChart3 },
        ],
      },
      // ── Programs ─────────────────────────────────────────────────────────
      {
        href: "/iep-suggestions",
        label: "Programs",
        icon: Library,
        featureKey: "clinical.program_data" as FeatureKey,
        children: [
          { href: "/iep-suggestions", label: "Program Library", icon: Library },
          { href: "/aba?tab=programs", label: "Templates", icon: Star },
          { href: "/aba?tab=maintenance", label: "Mastery / Maintenance", icon: TrendingDown },
        ],
      },
      // ── Analysis ─────────────────────────────────────────────────────────
      {
        href: "/aba?tab=analytics",
        label: "Analysis",
        icon: LineChart,
        featureKey: "clinical.program_data" as FeatureKey,
        children: [
          { href: "/aba?tab=analytics", label: "Program & Behavior Graphs", icon: LineChart },
          { href: "/behavior-assessment", label: "Behavior Analytics / BIP", icon: Brain },
        ],
      },
      // ── Reporting ─────────────────────────────────────────────────────────
      {
        href: "/progress-reports",
        label: "Reporting",
        icon: FileText,
        children: [
          { href: "/progress-reports", label: "Progress Reports", icon: FileText },
          { href: "/supervision?tab=trend", label: "Team Summaries", icon: FileBarChart },
          { href: "/reports?tab=exports", label: "Export / Print", icon: FileDown },
        ],
      },
      // ── Supervision ───────────────────────────────────────────────────────
      {
        href: "/supervision",
        label: "Supervision",
        icon: UserCheck,
        featureKey: "clinical.supervision" as FeatureKey,
        children: [
          { href: "/supervision?tab=log", label: "Supervision Sessions", icon: Clipboard },
          { href: "/supervision?tab=compliance", label: "IOA & Fidelity", icon: CheckCircle },
          { href: "/supervision?tab=trend", label: "Staff Performance", icon: TrendingDown },
        ],
      },
    ],
  },
  // ── 5. Scheduling ─────────────────────────────────────────────────────────
  {
    label: "Scheduling",
    icon: Users,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/sessions", label: "Session Log", icon: Clipboard },
      {
        href: "/scheduling", label: "Scheduling Hub", icon: Clock,
        children: [
          { href: "/scheduling?tab=schedule", label: "Weekly Schedule", icon: CalendarDays },
          { href: "/scheduling?tab=coverage", label: "Coverage", icon: UserCheck },
          { href: "/scheduling?tab=minutes", label: "Minutes at Risk", icon: AlertTriangle },
          { href: "/scheduling?tab=staff-calendar", label: "Staff Calendar", icon: CalendarDays },
        ],
      },
      { href: "/caseload-balancing", label: "Caseload Balancing", icon: Scale, featureKey: "district.caseload_balancing" as FeatureKey },
    ],
  },
  // ── 6+ sorted below ───────────────────────────────────────────────────────
  {
    label: "Financial / Executive",
    icon: Gauge,
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/executive", label: "Executive Dashboard", icon: Gauge, featureKey: "district.executive" as FeatureKey },
      { href: "/district", label: "District Overview", icon: Building2, featureKey: "district.overview" as FeatureKey },
      { href: "/agencies", label: "Agencies", icon: Truck },
      { href: "/leadership-packet", label: "Leadership Packet", icon: ClipboardList, featureKey: "district.executive" as FeatureKey },
      { href: "/contract-utilization", label: "Contract Utilization", icon: Briefcase, featureKey: "district.contract_utilization" as FeatureKey },
      { href: "/resource-management", label: "Resource Management", icon: Database, featureKey: "district.resource_management" as FeatureKey },
      { href: "/medicaid-billing", label: "Medicaid Billing", icon: CreditCard, featureKey: "district.medicaid_billing" as FeatureKey },
    ],
  },
  {
    label: "Admin / Tools",
    icon: Settings,
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/state-reporting", label: "State Reports", icon: Building2 },
      { href: "/protective-measures", label: "Restraint & Seclusion", icon: Shield, featureKey: "compliance.protective_measures" as FeatureKey },
      { href: "/data-health", label: "Data Health Check", icon: ShieldCheck },
      { href: "/import", label: "Data Import", icon: Upload },
      {
        href: "/settings", label: "Settings", icon: Settings,
        children: [
          { href: "/settings?tab=general", label: "General", icon: Settings },
          { href: "/settings?tab=school-year", label: "School Year", icon: CalendarDays },
          { href: "/settings?tab=billing-rates", label: "Billing Rates", icon: DollarSign },
          { href: "/settings?tab=sis", label: "SIS Integration", icon: Database },
          { href: "/settings?tab=audit-log", label: "Audit Log", icon: FileText },
          { href: "/settings?tab=recently-deleted", label: "Recently Deleted", icon: Trash2 },
          { href: "/settings?tab=system-status", label: "System Status", icon: Activity },
          { href: "/settings?tab=legal", label: "Legal & Compliance", icon: Scale },
          // Billing (Stripe subscription management) lives in settings, not in
          // the operational nav — it's account management, not a product feature.
          { href: "/billing", label: "Subscription & Billing", icon: CreditCard },
        ],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Demo-focused admin nav.
//
// Used when the active district is a demo district. Trims the sprawling admin
// IA down to the wedge-only surfaces a pilot prospect needs to see:
//   Dashboard, Alerts, Compliance, Compensatory Services, Students/Staff,
//   Sessions, Scheduling, Reports, Compensatory Finance, Executive Dashboard,
//   Settings.
//
// Hidden (NOT removed — routes still resolve, deep links still work):
//   IEP Hub, Evaluations, Transitions, Parent Comms, Document Workflow,
//   State Reports, Restraint & Seclusion, ABA section, District Overview,
//   Agencies, Leadership Packet, Contract Utilization, Resource Management,
//   Medicaid Billing, Billing, Data Health Check, Data Import.
//
// To switch back to the full admin nav, the user can leave demo mode
// (district.isDemo = false) — no code change required.
// ─────────────────────────────────────────────────────────────────────────────
const DEMO_NAV_ALLOWED_HREFS = new Set<string>([
  "/",
  "/action-center",
  "/alerts",
  "/compliance",
  "/compensatory-services",
  "/students",
  "/staff",
  "/sessions",
  "/scheduling",
  "/reports",
  "/weekly-compliance-summary",
  "/compensatory-finance",
  "/executive",
  "/leadership-packet",
  "/settings",
  // ABA & Behavior — include in demo for clinical story
  "/aba",
  "/behavior-assessment",
  "/program-data",
  "/iep-suggestions",
  "/supervision",
  // IEP — core clinical feature for pilot
  "/iep-builder",
  "/iep-meetings",
  "/evaluations",
  "/progress-reports",
]);

const DEMO_SECTION_DEFAULT_OPEN: Record<string, boolean> = {
  "Overview": true,
  "Compliance & Risk": true,
  "IEP & Services": false,
  "ABA & Behavior": false,
  "Scheduling": true,
  "Financial / Executive": false,
  "Admin / Tools": false,
};

export const demoFocusedAdminNav: NavSection[] = adminNav
  .map(section => {
    const items = section.items.filter(item => DEMO_NAV_ALLOWED_HREFS.has(item.href));
    if (items.length === 0) return null;
    const defaultOpen = section.label && section.label in DEMO_SECTION_DEFAULT_OPEN
      ? DEMO_SECTION_DEFAULT_OPEN[section.label]
      : section.defaultOpen;
    return { ...section, items, defaultOpen };
  })
  .filter((s): s is NavSection => s !== null);

/** Returns the appropriate admin nav based on whether the user is in demo mode.
 *
 * Demo mode trims to the pilot-relevant surfaces (Compliance, ABA, IEP core)
 * and collapses IEP & Services + ABA & Behavior by default so the compliance
 * wedge is front-and-centre without hiding clinical depth.
 * Admin-only surfaces (Data Import, State Reports, Data Health) are hidden.
 */
export function getAdminNavForMode(isDemo: boolean): NavSection[] {
  return isDemo ? demoFocusedAdminNav : adminNav;
}

// ─────────────────────────────────────────────────────────────────────────────
// Case Manager nav — IEP-workflow + Compliance focus.
//
// Included sections: Overview, Compliance Tools (minus admin-only items),
//   IEP & Services (full), Staffing (Directory + Sessions only — no scheduling,
//   no caseload balancing, those belong to coordinators).
// Excluded sections: ABA, Financial / Executive, Admin / Tools.
// Excluded Staffing items: Scheduling Hub, Staff Calendar, Caseload Balancing.
// Excluded Compliance items: State Reports, Restraint & Seclusion.
// ─────────────────────────────────────────────────────────────────────────────
const CASE_MANAGER_EXCLUDED_SECTIONS = new Set(["ABA & Behavior", "Financial / Executive", "Admin / Tools"]);
const CASE_MANAGER_EXCLUDED_HREFS = new Set([
  "/state-reporting",
  "/protective-measures",
  "/scheduling",
  "/staff-calendar",
  "/caseload-balancing",
]);

export const caseManagerNav: NavSection[] = adminNav
  .filter(s => !s.label || !CASE_MANAGER_EXCLUDED_SECTIONS.has(s.label))
  .map(s => ({
    ...s,
    items: s.items.filter(i => !CASE_MANAGER_EXCLUDED_HREFS.has(i.href)),
  }))
  .filter(s => s.items.length > 0);

// ─────────────────────────────────────────────────────────────────────────────
// Coordinator nav — Staffing + scheduling focus with light compliance oversight.
//
// Included sections: Overview, Compliance Tools (trimmed to Compliance +
//   Compensatory only), Staffing (full — Directory, Sessions, Scheduling Hub,
//   Staff Calendar, Caseload Balancing).
// Excluded sections: IEP & Services, ABA, Financial / Executive, Admin / Tools.
// Compliance trimmed: only /compliance and /compensatory-services exposed.
// ─────────────────────────────────────────────────────────────────────────────
const COORDINATOR_EXCLUDED_SECTIONS = new Set(["IEP & Services", "ABA & Behavior", "Financial / Executive", "Admin / Tools"]);
const COORDINATOR_COMPLIANCE_ALLOWED = new Set(["/compliance", "/compensatory-services"]);

export const coordinatorNav: NavSection[] = adminNav
  .filter(s => !s.label || !COORDINATOR_EXCLUDED_SECTIONS.has(s.label))
  .map(s => {
    if (s.label === "Compliance & Risk") {
      return { ...s, items: s.items.filter(i => COORDINATOR_COMPLIANCE_ALLOWED.has(i.href)) };
    }
    return s;
  })
  .filter(s => s.items.length > 0);

// SPED teachers do not see "Financial / Executive" or "Admin / Tools" (admin-only).
// All other sections are visible: IEP, Accommodations & Transitions, Compliance & Risk, Staffing, ABA & Behavior.
const SPED_TEACHER_EXCLUDED_GROUPS = new Set(["Financial / Executive", "Admin / Tools"]);
const SPED_TEACHER_LABEL_MAP: Record<string, string> = {
  "Scheduling": "My Caseload",
};
const SPED_TEACHER_ITEM_LABEL_MAP: Record<string, string> = {
  "Directory": "My Directory",
  "Sessions": "My Sessions",
};

export const spedTeacherNav: NavSection[] = adminNav
  .filter(s => !s.label || !SPED_TEACHER_EXCLUDED_GROUPS.has(s.label))
  .map(s => {
    const label = s.label && SPED_TEACHER_LABEL_MAP[s.label] ? SPED_TEACHER_LABEL_MAP[s.label] : s.label;
    let items = s.items.map(item => ({
      ...item,
      label: SPED_TEACHER_ITEM_LABEL_MAP[item.label] ?? item.label,
    }));
    if (s.label === "Overview") {
      // Teachers use /today as their home — exclude the admin Dashboard (/)
      // so it doesn't match every route via startsWith("/") active-state logic.
      const teacherItems = items.filter(i => i.href !== "/");
      items = [
        { href: "/today", label: "Today", icon: Sun, primary: true },
        ...teacherItems,
        { href: "/my-caseload", label: "Caseload Dashboard", icon: Briefcase },
        { href: "/my-schedule", label: "My Schedule", icon: ArrowLeftRight },
      ];
    }
    return { ...s, label, items };
  });

// Purpose-built nav for BCBAs. The ABA section is the primary workspace —
// structured as 6 clinical domains (Learners, Sessions, Programs, Analysis,
// Reporting, Supervision). "My Caseload" is folded into ABA → Learners.
// Overview stays light; Compliance is available but collapsed by default.
export const bcbaNav: NavSection[] = [
  {
    label: "Overview",
    icon: LayoutDashboard,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/today", label: "Today", icon: Sun, primary: true },
      { href: "/", label: "Dashboard", icon: LayoutDashboard, primary: true },
      { href: "/action-center", label: "Action Center", icon: Zap, primary: true },
      { href: "/my-caseload", label: "Caseload Dashboard", icon: Briefcase },
      { href: "/my-schedule", label: "My Schedule", icon: ArrowLeftRight },
    ],
  },
  // ── ABA & Behavior (6-domain structure) ───────────────────────────────────
  {
    label: "ABA & Behavior",
    icon: Activity,
    collapsible: true,
    defaultOpen: true,
    items: [
      // ── Learners ──────────────────────────────────────────────────────────
      {
        href: "/aba",
        label: "Learners",
        icon: Users,
        featureKey: "clinical.program_data" as FeatureKey,
        children: [
          { href: "/aba", label: "ABA Caseload", icon: Users },
          { href: "/students", label: "Student Directory", icon: Search },
          { href: "/aba?tab=programs", label: "Active Programs", icon: Activity },
          { href: "/behavior-assessment", label: "Behavior Support / BIP", icon: Shield },
        ],
      },
      // ── Sessions ──────────────────────────────────────────────────────────
      {
        href: "/sessions",
        label: "Sessions",
        icon: CalendarDays,
        children: [
          { href: "/sessions", label: "Session Log", icon: Clipboard },
          { href: "/program-data", label: "Data Collection", icon: ClipboardCheck },
          { href: "/reports?tab=missed", label: "Missed Sessions", icon: AlertTriangle },
        ],
      },
      // ── Programs ──────────────────────────────────────────────────────────
      {
        href: "/iep-suggestions",
        label: "Programs",
        icon: Library,
        featureKey: "clinical.program_data" as FeatureKey,
        children: [
          { href: "/iep-suggestions", label: "Program Library", icon: Library },
          { href: "/aba?tab=programs", label: "Templates", icon: Star },
          { href: "/aba?tab=maintenance", label: "Mastery / Maintenance", icon: TrendingDown },
        ],
      },
      // ── Analysis ──────────────────────────────────────────────────────────
      {
        href: "/aba?tab=analytics",
        label: "Analysis",
        icon: LineChart,
        featureKey: "clinical.program_data" as FeatureKey,
        children: [
          { href: "/aba?tab=analytics", label: "Program & Behavior Graphs", icon: LineChart },
          { href: "/behavior-assessment", label: "Behavior Analytics / BIP", icon: Brain },
        ],
      },
      // ── Reporting ─────────────────────────────────────────────────────────
      {
        href: "/progress-reports",
        label: "Reporting",
        icon: FileText,
        children: [
          { href: "/progress-reports", label: "Progress Reports", icon: FileText },
          { href: "/supervision?tab=trend", label: "Team Summaries", icon: FileBarChart },
          { href: "/reports?tab=exports", label: "Export / Print", icon: FileDown },
        ],
      },
      // ── Supervision ───────────────────────────────────────────────────────
      {
        href: "/supervision",
        label: "Supervision",
        icon: UserCheck,
        featureKey: "clinical.supervision" as FeatureKey,
        children: [
          { href: "/supervision?tab=log", label: "Supervision Sessions", icon: Clipboard },
          { href: "/supervision?tab=compliance", label: "IOA & Fidelity", icon: CheckCircle },
          { href: "/supervision?tab=trend", label: "Staff Performance", icon: TrendingDown },
        ],
      },
    ],
  },
  {
    label: "Other",
    icon: ListChecks,
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/compliance", label: "Compliance", icon: ListChecks, featureKey: "compliance.service_minutes" as FeatureKey },
      { href: "/compensatory-services", label: "Compensatory Services", icon: Scale },
      { href: "/protective-measures", label: "Restraint & Seclusion", icon: Shield, featureKey: "compliance.protective_measures" as FeatureKey },
      { href: "/parent-communication", label: "Parent Comms", icon: MessageSquare, featureKey: "engagement.parent_communication" as FeatureKey },
    ],
  },
];

export const paraNav: NavSection[] = [
  {
    items: [
      { href: "/my-day", label: "My Day", icon: Sun, primary: true },
      { href: "/", label: "Dashboard", icon: LayoutDashboard, primary: true },
    ],
  },
  {
    label: "Session Work",
    items: [
      { href: "/my-schedule", label: "My Schedule", icon: ArrowLeftRight, primary: true },
      { href: "/sessions", label: "Session Log", icon: Clipboard },
      { href: "/program-data", label: "Programs & Behaviors", icon: Activity },
    ],
  },
];

export const guardianPortalNav: NavSection[] = [
  {
    items: [
      { href: "/guardian-portal", label: "Overview", icon: LayoutDashboard, primary: true },
      { href: "/guardian-portal/messages", label: "Messages", icon: Mail, primary: true },
      { href: "/guardian-portal/documents", label: "Documents", icon: FileText, primary: true },
      { href: "/guardian-portal/meetings", label: "Meetings", icon: Calendar, primary: true },
      { href: "/guardian-portal/contact-history", label: "Contact History", icon: MessageSquare, primary: true },
    ],
  },
];

export const spedStudentNav: NavSection[] = [
  {
    items: [
      { href: "/sped-portal", label: "My Dashboard", icon: LayoutDashboard, primary: true },
      { href: "/sped-portal/goals", label: "My Goals", icon: Star, primary: true },
      { href: "/sped-portal/check-in", label: "Daily Check-In", icon: Heart, primary: true },
      { href: "/sped-portal/wins", label: "My Wins", icon: Trophy, primary: true },
      { href: "/sped-portal/services", label: "My Services", icon: BookOpen },
      { href: "/sped-portal/sessions", label: "My Sessions", icon: Clock },
    ],
  },
];

export type RoleThemeConfig = {
  nav: NavSection[];
  color: string;
  textColor: string;
  bgActive: string;
  iconActive: string;
  label: string;
  subtitle: string;
  homeHref: string;
};

const STAFF_NAV_CONFIG = {
  admin: {
    nav: adminNav,
    color: "bg-emerald-600",
    textColor: "text-emerald-600",
    bgActive: "bg-emerald-50 text-emerald-700 font-semibold",
    iconActive: "text-emerald-600",
    label: "Trellis",
    subtitle: "Service-minute compliance for SPED.",
    homeHref: "/",
  },
  bcba: {
    nav: bcbaNav,
    color: "bg-indigo-600",
    textColor: "text-indigo-600",
    bgActive: "bg-indigo-50 text-indigo-700 font-semibold",
    iconActive: "text-indigo-600",
    label: "Trellis",
    subtitle: "ABA & behavior support.",
    homeHref: "/today",
  },
  sped_teacher: {
    nav: spedTeacherNav,
    color: "bg-emerald-700",
    textColor: "text-emerald-700",
    bgActive: "bg-emerald-50 text-emerald-700 font-semibold",
    iconActive: "text-emerald-700",
    label: "Trellis",
    subtitle: "Service-minute compliance for SPED.",
    homeHref: "/today",
  },
} satisfies Record<string, RoleThemeConfig>;

export const roleConfig: Record<string, RoleThemeConfig> = {
  admin: STAFF_NAV_CONFIG.admin,
  case_manager: {
    nav: caseManagerNav,
    color: "bg-emerald-600",
    textColor: "text-emerald-600",
    bgActive: "bg-emerald-50 text-emerald-700 font-semibold",
    iconActive: "text-emerald-600",
    label: "Trellis",
    subtitle: "IEP & compliance management.",
    homeHref: "/",
  },
  coordinator: {
    nav: coordinatorNav,
    color: "bg-emerald-600",
    textColor: "text-emerald-600",
    bgActive: "bg-emerald-50 text-emerald-700 font-semibold",
    iconActive: "text-emerald-600",
    label: "Trellis",
    subtitle: "Staffing & scheduling.",
    homeHref: "/",
  },
  bcba: STAFF_NAV_CONFIG.bcba,
  sped_teacher: STAFF_NAV_CONFIG.sped_teacher,
  provider: STAFF_NAV_CONFIG.sped_teacher,
  para: {
    nav: paraNav,
    color: "bg-emerald-600",
    textColor: "text-emerald-600",
    bgActive: "bg-emerald-50 text-emerald-600 font-semibold",
    iconActive: "text-emerald-600",
    label: "Trellis",
    subtitle: "Your day, at a glance.",
    homeHref: "/my-day",
  },
  sped_student: {
    nav: spedStudentNav,
    color: "bg-emerald-600",
    textColor: "text-emerald-600",
    bgActive: "bg-emerald-50 text-emerald-700 font-semibold",
    iconActive: "text-emerald-600",
    label: "Trellis",
    subtitle: "Your goals, sessions, and wins.",
    homeHref: "/sped-portal",
  },
  sped_parent: {
    nav: guardianPortalNav,
    color: "bg-purple-600",
    textColor: "text-purple-600",
    bgActive: "bg-purple-50 text-purple-700 font-semibold",
    iconActive: "text-purple-600",
    label: "Trellis",
    subtitle: "Parent Portal",
    homeHref: "/guardian-portal",
  },
};
