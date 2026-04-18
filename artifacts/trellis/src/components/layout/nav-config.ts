import {
  LayoutDashboard, Users, Calendar, AlertTriangle, ClipboardList,
  BarChart3, UserCheck, Upload, Activity,
  Search, Shield, ShieldCheck, Building2,
  Star, Clock, Sparkles, Sun, Library,
  Clipboard, Sprout, Gauge, CalendarDays,
  BookOpen, Scale, MessageSquare, FileText, Briefcase, ListChecks, Database,
  Heart, Trophy, CreditCard, Crown, FileSearch, TrendingDown, DollarSign,
  GraduationCap, Stethoscope, Truck, Contact, Settings, Mail, FileBarChart,
  MoreHorizontal,
} from "lucide-react";
import { type FeatureKey } from "@/lib/module-tiers";

type IconComponent = React.ComponentType<{ className?: string }>;

export type NavItem = {
  href: string;
  label: string;
  icon: IconComponent;
  primary?: boolean;
  alertBadge?: boolean;
  comingSoon?: boolean;
  featureKey?: FeatureKey;
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
// Staff Directory promoted from More tools → Service Delivery (renamed "Staff").
// Billing and Settings now default-closed to reduce sidebar weight.
// No routes, pages, APIs, or business logic removed — hidden only.
export const adminNav: NavSection[] = [
  {
    label: "Overview",
    icon: LayoutDashboard,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, primary: true },
      { href: "/alerts", label: "Alerts", icon: AlertTriangle, primary: true, alertBadge: true },
    ],
  },
  {
    label: "Compliance Tools",
    icon: ListChecks,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/compliance", label: "Compliance", icon: ListChecks, featureKey: "compliance.service_minutes" as FeatureKey },
      { href: "/compensatory-services", label: "Compensatory Services", icon: Scale },
      { href: "/document-workflow", label: "Document Workflow", icon: ClipboardList },
      { href: "/state-reporting", label: "State Reports", icon: Building2 },
      { href: "/protective-measures", label: "Restraint & Seclusion", icon: Shield, featureKey: "clinical.protective_measures" as FeatureKey },
    ],
  },
  {
    label: "IEP / Education",
    icon: GraduationCap,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/iep-meetings", label: "IEP Meetings", icon: Users },
      { href: "/iep-calendar", label: "IEP Calendar", icon: CalendarDays },
      { href: "/evaluations", label: "Evaluations", icon: FileSearch },
      { href: "/progress-reports", label: "Progress Reports", icon: FileText },
      { href: "/search", label: "IEP Search", icon: Search },
      { href: "/accommodation-lookup", label: "Accommodations", icon: ShieldCheck },
    ],
  },
  {
    label: "Service Delivery",
    icon: Calendar,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/students", label: "Student List", icon: Users, primary: true },
      { href: "/sessions", label: "Sessions", icon: Clipboard },
      { href: "/schedule", label: "Schedule", icon: Calendar },
      { href: "/coverage", label: "Coverage", icon: UserCheck },
      { href: "/staff", label: "Staff", icon: UserCheck },
    ],
  },
  {
    label: "ABA",
    icon: Activity,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/program-data", label: "Programs & Behaviors", icon: Activity, featureKey: "clinical.program_data" as FeatureKey },
      { href: "/behavior-assessment", label: "FBA / BIP", icon: ClipboardList, featureKey: "clinical.fba_bip" as FeatureKey },
    ],
  },
  {
    label: "Financial / Executive",
    icon: Gauge,
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/executive", label: "Executive Dashboard", icon: Gauge, featureKey: "district.executive" as FeatureKey },
      { href: "/district", label: "District Overview", icon: Building2, featureKey: "district.overview" as FeatureKey },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/leadership-packet", label: "Leadership Packet", icon: ClipboardList, featureKey: "district.executive" as FeatureKey },
      { href: "/contract-utilization", label: "Contract Utilization", icon: Briefcase, featureKey: "district.contract_utilization" as FeatureKey },
      { href: "/resource-management", label: "Resource Management", icon: Database, featureKey: "district.resource_management" as FeatureKey },
      { href: "/medicaid-billing", label: "Medicaid Billing", icon: CreditCard, featureKey: "district.medicaid_billing" as FeatureKey },
      { href: "/compensatory-finance", label: "Compensatory Finance", icon: DollarSign },
      { href: "/billing", label: "Billing", icon: CreditCard },
    ],
  },
  {
    label: "Admin / Tools",
    icon: Settings,
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/data-health", label: "Data Health Check", icon: ShieldCheck },
      { href: "/import", label: "Data Import", icon: Upload },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
  {
    label: "More tools",
    icon: MoreHorizontal,
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/staff-calendar", label: "Staff Calendar", icon: CalendarDays },
      { href: "/caseload-balancing", label: "Caseload Balancing", icon: Scale, featureKey: "district.caseload_balancing" as FeatureKey },
      { href: "/agencies", label: "Agencies", icon: Truck },
      { href: "/parent-communication", label: "Parent Comms", icon: MessageSquare, featureKey: "engagement.parent_communication" as FeatureKey },
      { href: "/transitions", label: "Transition Planning", icon: Sprout },
      { href: "/iep-suggestions", label: "Catalog Matches", icon: Library, featureKey: "clinical.iep_suggestions" as FeatureKey },
      { href: "/supervision", label: "Supervision", icon: UserCheck, featureKey: "clinical.supervision" as FeatureKey },
    ],
  },
];

// SPED teachers do not see Billing or Settings (admin-only finance/config).
// "Compliance Tools" and "More tools" stay visible — they host items
// teachers/BCBAs use day-to-day (Parent Comms, Programs & Behaviors, FBA/BIP,
// Restraint & Seclusion, Supervision). Reports link lives in More tools.
const SPED_TEACHER_EXCLUDED_GROUPS = new Set(["Financial / Executive", "Admin / Tools"]);
const SPED_TEACHER_LABEL_MAP: Record<string, string> = {
  "Service Delivery": "My Caseload",
};
const SPED_TEACHER_ITEM_LABEL_MAP: Record<string, string> = {
  "Student List": "My Students",
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
      items = [
        { href: "/today", label: "Today", icon: Sun, primary: true },
        ...items,
        { href: "/my-caseload", label: "Caseload Dashboard", icon: Briefcase },
      ];
    }
    return { ...s, label, items };
  });

// Purpose-built nav for BCBAs. Surfaces ABA clinical tools at the top
// rather than burying them in a collapsed "More tools" drawer.
// No "More tools" section — every item BCBAs need is promoted.
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
    ],
  },
  {
    label: "My Caseload",
    icon: Users,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/students", label: "My Students", icon: Users, primary: true },
      { href: "/sessions", label: "My Sessions", icon: Clipboard },
      { href: "/schedule", label: "Schedule", icon: Calendar },
    ],
  },
  {
    label: "ABA / BCBA",
    icon: Activity,
    collapsible: true,
    defaultOpen: true,
    items: [
      { href: "/program-data", label: "Programs & Behaviors", icon: Activity, featureKey: "clinical.program_data" as FeatureKey },
      { href: "/behavior-assessment", label: "FBA / BIP", icon: ClipboardList, featureKey: "clinical.fba_bip" as FeatureKey },
      { href: "/protective-measures", label: "Restraint & Seclusion", icon: Shield, featureKey: "clinical.protective_measures" as FeatureKey },
      { href: "/supervision", label: "Supervision", icon: UserCheck, featureKey: "clinical.supervision" as FeatureKey },
      { href: "/parent-communication", label: "Parent Comms", icon: MessageSquare, featureKey: "engagement.parent_communication" as FeatureKey },
    ],
  },
  {
    label: "Compliance",
    icon: ListChecks,
    collapsible: true,
    defaultOpen: false,
    items: [
      { href: "/compliance", label: "Compliance", icon: ListChecks, featureKey: "compliance.service_minutes" as FeatureKey },
      { href: "/compensatory-services", label: "Compensatory Services", icon: Scale },
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
      { href: "/schedule", label: "Schedule", icon: Calendar, primary: true },
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
    homeHref: "/",
  },
} satisfies Record<string, RoleThemeConfig>;

export const roleConfig: Record<string, RoleThemeConfig> = {
  admin: STAFF_NAV_CONFIG.admin,
  case_manager: STAFF_NAV_CONFIG.admin,
  coordinator: STAFF_NAV_CONFIG.admin,
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
