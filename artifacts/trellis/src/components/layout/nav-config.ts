import {
  LayoutDashboard, Users, Calendar, AlertTriangle, ClipboardList,
  BarChart3, UserCheck, Upload, Activity,
  Search, Shield, ShieldCheck, Building2,
  Star, Clock, Sparkles, Sun, Library,
  Clipboard, Sprout, Gauge, CalendarDays,
  BookOpen, Scale, MessageSquare, FileText, Briefcase, ListChecks, Database,
  Heart, Trophy, CreditCard, Crown, FileSearch, DollarSign,
  GraduationCap, Truck, Settings, Mail, FileBarChart,
  ArrowLeftRight, Brain,
} from "lucide-react";
import { type FeatureKey } from "@/lib/module-tiers";

type IconComponent = React.ComponentType<{ className?: string }>;

export type SubNavItem = {
  href: string;
  label: string;
  icon: IconComponent;
  pendingChangeRequestBadge?: boolean;
};

export type NavItem = {
  href: string;
  label: string;
  icon: IconComponent;
  primary?: boolean;
  alertBadge?: boolean;
  pendingChangeRequestBadge?: boolean;
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
    { href: "/pilot-feedback", label: "Pilot Feedback", icon: MessageSquare },
    { href: "/pilot-status", label: "Pilot Status", icon: Gauge },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1a IA cleanup (additive, sidebar only — no routes/APIs changed):
//   • Stripped every `?tab=*` sidebar shortcut. Tabs still work on the page;
//     they just no longer pollute the sidebar tree.
//   • Removed self-link children (where child.href === parent.href).
//   • Preserved real standalone destinations as siblings.
//   • Removed sidebar entries for routes that now redirect elsewhere
//     (/action-center, /district, /leadership-packet, /iep, /program-data —
//     redirects defined in App.tsx).
// ─────────────────────────────────────────────────────────────────────────────
export const adminNav: NavSection[] = [
  // ── 1. Overview ──────────────────────────────────────────────────────────
  {
    label: "Overview",
    icon: LayoutDashboard,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, primary: true },
      {
        href: "/students", label: "Directory", icon: Users, primary: true,
        children: [
          { href: "/students", label: "Students", icon: Users },
          { href: "/staff", label: "Staff", icon: UserCheck },
        ],
      },
      { href: "/_action-center-legacy?tab=alerts", label: "Alerts", icon: AlertTriangle, primary: true, alertBadge: true },
      // Phase 1b: promote Session Log into Overview so minute-tracking is
      // above the fold for admins. Removed from the Scheduling section to
      // avoid duplication.
      { href: "/sessions", label: "Session Log", icon: Clipboard, primary: true },
    ],
  },
  // ── 2. Compliance & Risk ────────────────────────────────────────────────
  // Phase 1b: flattened "Reports" and "Compensatory" one-child submenus.
  {
    label: "Compliance & Risk",
    icon: ListChecks,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/compliance", label: "Compliance", icon: ListChecks, featureKey: "compliance.service_minutes" as FeatureKey },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/weekly-compliance-summary", label: "Weekly Summary", icon: FileBarChart },
      { href: "/compensatory", label: "Compensatory", icon: Scale, featureKey: "compliance.compensatory" as FeatureKey },
      { href: "/document-workflow", label: "Document Workflow", icon: ClipboardList },
    ],
  },
  // ── 3. IEP & Services ────────────────────────────────────────────────────
  // Phase 1b: flattened "IEP Builder" and "Evaluations & Progress" one-child submenus.
  {
    label: "IEP & Services",
    icon: GraduationCap,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/iep-builder", label: "IEP Builder", icon: Sparkles, primary: true },
      { href: "/iep-meetings", label: "IEP Meetings", icon: CalendarDays },
      { href: "/evaluations", label: "Evaluations", icon: FileSearch },
      { href: "/progress-reports", label: "Progress Reports", icon: FileText },
      { href: "/transitions", label: "Transition Planning", icon: Sprout },
      { href: "/accommodation-lookup", label: "Accommodation Verification", icon: FileText },
      { href: "/parent-communication", label: "Parent Comms", icon: MessageSquare, featureKey: "engagement.parent_communication" as FeatureKey },
    ],
  },
  // ── 4. ABA & Behavior — Phase 1b: flattened "Learners" submenu ──────────
  {
    label: "ABA & Behavior",
    icon: Activity,
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/aba", label: "Learners", icon: Users, featureKey: "clinical.program_data" as FeatureKey },
      { href: "/behavior-assessment", label: "Behavior Support / BIP", icon: Shield },
      { href: "/iep-suggestions", label: "Programs", icon: Library, featureKey: "clinical.program_data" as FeatureKey },
      { href: "/supervision", label: "Supervision", icon: UserCheck, featureKey: "clinical.supervision" as FeatureKey },
    ],
  },
  // ── 5. Scheduling ────────────────────────────────────────────────────────
  // Phase 1b: /sessions promoted to Overview; this section is now scheduling-only.
  {
    label: "Scheduling",
    icon: Users,
    collapsible: true,
    defaultOpen: true,
    items: [
      {
        href: "/scheduling", label: "Scheduling Hub", icon: Clock, pendingChangeRequestBadge: true,
        children: [
          { href: "/scheduling", label: "Weekly Schedule", icon: CalendarDays },
          { href: "/scheduling?tab=coverage", label: "Coverage", icon: UserCheck },
          { href: "/scheduling?tab=minutes", label: "Minutes at Risk", icon: AlertTriangle },
          { href: "/scheduling?tab=calendar", label: "Staff Calendar", icon: CalendarDays },
        ],
      },
      { href: "/caseload-balancing", label: "Caseload Balancing", icon: Scale, featureKey: "district.caseload_balancing" as FeatureKey },
    ],
  },
  // ── 6. Financial / Executive ─────────────────────────────────────────────
  // /district and /leadership-packet are now redirected onto /executive tabs;
  // sidebar only exposes the canonical entry points.
  {
    label: "Financial / Executive",
    icon: Gauge,
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/executive", label: "Executive Dashboard", icon: Gauge, featureKey: "district.executive" as FeatureKey },
      { href: "/agencies", label: "Agencies", icon: Truck },
      { href: "/contract-utilization", label: "Contract Utilization", icon: Briefcase, featureKey: "district.contract_utilization" as FeatureKey },
      { href: "/resource-management", label: "Resource Management", icon: Database, featureKey: "district.resource_management" as FeatureKey },
      { href: "/medicaid-billing", label: "Medicaid Billing", icon: CreditCard, featureKey: "district.medicaid_billing" as FeatureKey },
    ],
  },
  // ── 7. Admin / Tools ─────────────────────────────────────────────────────
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
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/upgrade", label: "Plans & Features", icon: Sparkles },
      { href: "/billing", label: "Subscription & Billing", icon: CreditCard },
      { href: "/pilot-status", label: "Pilot Status", icon: Gauge },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Focused nav for pilot and demo districts (hand-crafted, not derived).
// ─────────────────────────────────────────────────────────────────────────────
export const focusedAdminNav: NavSection[] = [
  {
    label: "Overview",
    icon: LayoutDashboard,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, primary: true },
      {
        href: "/students", label: "Students & Staff", icon: Users, primary: true,
        children: [
          { href: "/students", label: "Students", icon: Users },
          { href: "/staff", label: "Staff", icon: UserCheck },
        ],
      },
      { href: "/_action-center-legacy?tab=alerts", label: "Alerts", icon: AlertTriangle, primary: true, alertBadge: true },
    ],
  },
  {
    label: "Compliance",
    icon: ListChecks,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/compliance", label: "Compliance", icon: ListChecks, featureKey: "compliance.service_minutes" as FeatureKey },
      // Phase 1b: flattened "Reports" one-child submenu.
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/weekly-compliance-summary", label: "Weekly Summary", icon: FileBarChart },
    ],
  },
  {
    label: "Service Delivery",
    icon: Clipboard,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/sessions", label: "Sessions", icon: Clipboard, primary: true },
      {
        href: "/scheduling", label: "Schedule", icon: CalendarDays, pendingChangeRequestBadge: true,
        children: [
          { href: "/scheduling", label: "Weekly Schedule", icon: CalendarDays },
          { href: "/scheduling?tab=coverage", label: "Coverage", icon: UserCheck },
          { href: "/scheduling?tab=minutes", label: "Minutes at Risk", icon: AlertTriangle },
          { href: "/scheduling?tab=calendar", label: "Staff Calendar", icon: CalendarDays },
        ],
      },
    ],
  },
  {
    label: "ABA & Behavior",
    icon: Activity,
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/aba", label: "ABA Hub", icon: Brain, featureKey: "clinical.program_data" as FeatureKey },
      { href: "/behavior-assessment", label: "Behavior Support / BIP", icon: Shield },
      { href: "/supervision", label: "Supervision", icon: UserCheck, featureKey: "clinical.supervision" as FeatureKey },
    ],
  },
  {
    label: "Settings",
    icon: Settings,
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/**
 * Demo-focused nav: focusedAdminNav minus ABA & Behavior.
 * Shown to coordinators when the district is marked as a demo district.
 * Keeps only the ~8 pilot-relevant items so stakeholder walk-throughs
 * aren't distracted by complex clinical features.
 */
export const demoFocusedAdminNav: NavSection[] = focusedAdminNav.filter(
  s => s.label !== "ABA & Behavior",
);

/**
 * Returns the appropriate admin nav based on district mode.
 *
 * - demo:          demoFocusedAdminNav — ~8 pilot-relevant items for demo walk-throughs.
 * - pilot (non-demo): focusedAdminNav — tighter wedge layout for pilot stakeholders.
 * - full (paid):   adminNav — complete layout for configured districts.
 *
 * Routes remain accessible via direct URL — nothing is removed.
 */
export function getAdminNavForMode(isDemo: boolean, isPilot?: boolean): NavSection[] {
  if (isDemo) return demoFocusedAdminNav;
  if (isPilot) return focusedAdminNav;
  return adminNav;
}

// ─────────────────────────────────────────────────────────────────────────────
// Derived role navs: filter adminNav by section/href. They automatically
// inherit the Phase 1a clutter strip from adminNav above.
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

const COORDINATOR_EXCLUDED_SECTIONS = new Set(["IEP & Services", "ABA & Behavior", "Financial / Executive", "Admin / Tools"]);
const COORDINATOR_COMPLIANCE_ALLOWED = new Set(["/compliance", "/compensatory"]);
// Phase 1b: mirror case-manager's scheduling exclusions. Coordinator now keeps
// only Sessions (which lives in Overview after the 1b move). The Scheduling
// section ends up empty and gets filtered out below.
const COORDINATOR_EXCLUDED_HREFS = new Set(["/scheduling", "/caseload-balancing"]);

export const coordinatorNav: NavSection[] = adminNav
  .filter(s => !s.label || !COORDINATOR_EXCLUDED_SECTIONS.has(s.label))
  .map(s => {
    if (s.label === "Compliance & Risk") {
      return { ...s, items: s.items.filter(i => COORDINATOR_COMPLIANCE_ALLOWED.has(i.href)) };
    }
    return { ...s, items: s.items.filter(i => !COORDINATOR_EXCLUDED_HREFS.has(i.href)) };
  })
  .filter(s => s.items.length > 0);

// SPED teachers do not see Financial/Executive, Admin/Tools, or ABA & Behavior
// (Phase 1b: ABA was leaking into the teacher shell).
const SPED_TEACHER_EXCLUDED_GROUPS = new Set(["Financial / Executive", "Admin / Tools", "ABA & Behavior"]);
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

// ─────────────────────────────────────────────────────────────────────────────
// BCBA nav — Phase 1a: ABA section flattened from 6 groups to 5 destinations.
// All ?tab=* sidebar children removed; tabs are still reachable on each page.
// ─────────────────────────────────────────────────────────────────────────────
export const bcbaNav: NavSection[] = [
  {
    label: "Overview",
    icon: LayoutDashboard,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/today", label: "Today", icon: Sun, primary: true },
      { href: "/", label: "Dashboard", icon: LayoutDashboard, primary: true },
      { href: "/my-caseload", label: "Caseload Dashboard", icon: Briefcase },
      { href: "/my-schedule", label: "My Schedule", icon: ArrowLeftRight },
    ],
  },
  {
    label: "ABA & Behavior",
    icon: Activity,
    collapsible: true,
    defaultOpen: true,
    items: [
      // Phase 1b: removed "Learners" submenu. BIP promoted to a sibling.
      // Student Directory was removed from sidebar; still reachable via /aba.
      { href: "/aba", label: "Learners", icon: Users, featureKey: "clinical.program_data" as FeatureKey },
      { href: "/behavior-assessment", label: "Behavior Support / BIP", icon: Shield },
      { href: "/sessions", label: "Sessions", icon: CalendarDays },
      { href: "/iep-suggestions", label: "Programs", icon: Library, featureKey: "clinical.program_data" as FeatureKey },
      { href: "/progress-reports", label: "Reporting", icon: FileText },
      { href: "/supervision", label: "Supervision", icon: UserCheck, featureKey: "clinical.supervision" as FeatureKey },
    ],
  },
  {
    label: "Compliance & Comms",
    icon: ListChecks,
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/compliance", label: "Compliance", icon: ListChecks, featureKey: "compliance.service_minutes" as FeatureKey },
      { href: "/compensatory", label: "Compensatory", icon: Scale, featureKey: "compliance.compensatory" as FeatureKey },
      { href: "/protective-measures", label: "Restraint & Seclusion", icon: Shield, featureKey: "compliance.protective_measures" as FeatureKey },
      { href: "/parent-communication", label: "Parent Comms", icon: MessageSquare, featureKey: "engagement.parent_communication" as FeatureKey },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Para shell — Phase 1a: minimal. No clinical back doors via sidebar.
//   • Removed "Programs & Behaviors" (/program-data) — not a para surface.
//   • Added Incidents (/protective-measures), gated by feature flag.
// ─────────────────────────────────────────────────────────────────────────────
export const paraNav: NavSection[] = [
  {
    items: [
      { href: "/my-day", label: "My Day", icon: Sun, primary: true },
      { href: "/my-schedule", label: "My Schedule", icon: ArrowLeftRight, primary: true },
      { href: "/sessions", label: "Session Log", icon: Clipboard },
      { href: "/protective-measures", label: "Incidents", icon: Shield, featureKey: "compliance.protective_measures" as FeatureKey },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Provider shell — Phase 2B PR1.
// Before: provider inherited the full SPED Teacher sidebar (~24 destinations
// across 4 sections incl. IEP Builder, Compliance, Scheduling Hub, etc).
// After: tight clinician nav — daily work + reporting only. Routes that
// were removed from the sidebar remain reachable via direct URL.
// ─────────────────────────────────────────────────────────────────────────────
export const providerNav: NavSection[] = [
  {
    label: "My Work",
    items: [
      { href: "/my-day", label: "My Day", icon: Sun, primary: true },
      { href: "/my-schedule", label: "My Schedule", icon: ArrowLeftRight, primary: true },
      { href: "/sessions", label: "Session Log", icon: Clipboard },
      { href: "/my-caseload", label: "Caseload", icon: Users, primary: true },
    ],
  },
  {
    label: "Reporting",
    items: [
      { href: "/progress-reports", label: "Progress Reports", icon: FileText },
      { href: "/parent-communication", label: "Parent Comms", icon: MessageSquare, featureKey: "engagement.parent_communication" as FeatureKey },
    ],
  },
];

export const directProviderNav: NavSection[] = [
  {
    items: [
      { href: "/my-day", label: "My Day", icon: Sun, primary: true },
    ],
  },
  {
    label: "Session Work",
    items: [
      { href: "/my-schedule", label: "My Schedule", icon: ArrowLeftRight, primary: true },
      { href: "/sessions", label: "Session Log", icon: Clipboard },
    ],
  },
  {
    label: "My Students",
    items: [
      { href: "/my-caseload", label: "Caseload", icon: Users, primary: true },
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
  provider: {
    nav: providerNav,
    color: "bg-emerald-600",
    textColor: "text-emerald-600",
    bgActive: "bg-emerald-50 text-emerald-700 font-semibold",
    iconActive: "text-emerald-600",
    label: "Trellis",
    subtitle: "Sessions, schedule, and progress.",
    homeHref: "/my-day",
  },
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
  direct_provider: {
    nav: directProviderNav,
    color: "bg-emerald-600",
    textColor: "text-emerald-600",
    bgActive: "bg-emerald-50 text-emerald-600 font-semibold",
    iconActive: "text-emerald-600",
    label: "Trellis",
    subtitle: "Your schedule & students.",
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
