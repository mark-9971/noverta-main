import { useState, useEffect } from "react";
import { useClerk } from "@clerk/react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Calendar, AlertTriangle, ClipboardList,
  BarChart3, UserCheck, Upload, Activity,
  Menu, X, MoreHorizontal, Search, Shield, PieChart, Building2,
  Star, Clock, Sparkles, Sun,
  Timer, Clipboard, Sprout, Gauge, CalendarDays,
  BookOpen, Scale, Gift, MessageSquare, ClipboardCheck, LogOut, FileText, Trash2, Rocket, Briefcase, ListChecks, Database,
  Heart, Trophy, CreditCard
} from "lucide-react";
import { useGetDashboardAlertsSummary } from "@workspace/api-client-react";
import { Toaster } from "sonner";
import { useRole } from "@/lib/role-context";
import { useSchoolContext } from "@/lib/school-context";
import { RoleSwitcher } from "./RoleSwitcher";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { SchoolDistrictSelector } from "./SchoolDistrictSelector";
import { CommandPalette } from "@/components/search/CommandPalette";
import { ThemePicker } from "./ThemePicker";
import { useTheme } from "@/lib/theme-context";

type NavItem = { href: string; label: string; icon: any; primary?: boolean; alertBadge?: boolean };
type NavSection = { label?: string; items: NavItem[] };

// ADMIN — SPED Director / Administrator
// Workflow: triage alerts → student compliance overview → IEP deadlines →
//           session oversight → clinical review → district reporting → admin tools
const adminNav: NavSection[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, primary: true },
      { href: "/alerts", label: "Alerts", icon: AlertTriangle, primary: true, alertBadge: true },
    ],
  },
  {
    label: "Students & Compliance",
    items: [
      { href: "/students", label: "Students", icon: Users, primary: true },
      { href: "/iep-calendar", label: "IEP Calendar", icon: CalendarDays },
      { href: "/iep-meetings", label: "IEP Meetings", icon: Users },
      { href: "/compliance/checklist", label: "Compliance Checklist", icon: ListChecks },
      { href: "/compliance", label: "Service Minutes", icon: Timer },
      { href: "/evaluations", label: "Evaluations", icon: FileText },
      { href: "/transitions", label: "Transition Planning", icon: Sprout },
    ],
  },
  {
    label: "Sessions & Schedule",
    items: [
      { href: "/schedule", label: "Schedule", icon: Calendar },
      { href: "/sessions", label: "Session Log", icon: Clipboard },
    ],
  },
  {
    label: "Clinical",
    items: [
      { href: "/program-data", label: "Programs & Behaviors", icon: Activity },
      { href: "/behavior-assessment", label: "FBA / BIP", icon: ClipboardList },
      { href: "/supervision", label: "Supervision", icon: ClipboardCheck },
      { href: "/protective-measures", label: "Restraint & Seclusion", icon: Shield },
    ],
  },
  {
    label: "District & Reports",
    items: [
      { href: "/executive", label: "Executive Dashboard", icon: Gauge },
      { href: "/district", label: "District Overview", icon: Building2 },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/state-reporting", label: "State Reporting", icon: FileText },
      { href: "/analytics", label: "Analytics", icon: PieChart },
      { href: "/resource-management", label: "Resource Management", icon: Scale },
      { href: "/compensatory-services", label: "Comp Services", icon: Gift },
      { href: "/parent-communication", label: "Parent Comms", icon: MessageSquare },
      { href: "/contract-utilization", label: "Contract Utilization", icon: Gauge },
    ],
  },
  {
    label: "Admin Tools",
    items: [
      { href: "/staff", label: "Staff Directory", icon: UserCheck },
      { href: "/agencies", label: "Agencies", icon: Building2 },
      { href: "/iep-suggestions", label: "IEP Suggestions", icon: Sparkles },
      { href: "/search", label: "IEP Search", icon: Search },
      { href: "/import", label: "Data Import", icon: Upload },
      { href: "/sis-settings", label: "SIS Integration", icon: Database },
      { href: "/audit-log", label: "Audit Log", icon: FileText },
      { href: "/recently-deleted", label: "Recently Deleted", icon: Trash2 },
      { href: "/setup", label: "Setup Wizard", icon: Rocket },
      { href: "/billing", label: "Billing", icon: CreditCard },
      { href: "/tenants", label: "Tenant Management", icon: Building2 },
    ],
  },
];

// SPED TEACHER / PROVIDER — Case Manager, BCBA, Therapist
// Workflow: see today's schedule → log sessions → track student minutes →
//           collect clinical data → IEP documentation → check reports
const spedTeacherNav: NavSection[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, primary: true },
      { href: "/alerts", label: "Alerts", icon: AlertTriangle, primary: true, alertBadge: true },
    ],
  },
  {
    label: "My Caseload",
    items: [
      { href: "/my-caseload", label: "Caseload Dashboard", icon: Briefcase, primary: true },
      { href: "/students", label: "My Students", icon: Users, primary: true },
      { href: "/schedule", label: "Schedule", icon: Calendar, primary: true },
      { href: "/compliance/checklist", label: "Compliance Checklist", icon: ListChecks },
      { href: "/compliance", label: "Service Minutes", icon: Timer },
      { href: "/evaluations", label: "Evaluations", icon: FileText },
      { href: "/transitions", label: "Transition Planning", icon: Sprout },
    ],
  },
  {
    label: "Session Work",
    items: [
      { href: "/sessions", label: "Session Log", icon: Clipboard },
      { href: "/program-data", label: "Programs & Behaviors", icon: Activity },
    ],
  },
  {
    label: "IEP & Clinical",
    items: [
      { href: "/iep-calendar", label: "IEP Calendar", icon: CalendarDays },
      { href: "/iep-meetings", label: "IEP Meetings", icon: Users },
      { href: "/behavior-assessment", label: "FBA / BIP", icon: ClipboardList },
      { href: "/supervision", label: "Supervision", icon: ClipboardCheck },
      { href: "/iep-suggestions", label: "IEP Suggestions", icon: Sparkles },
      { href: "/search", label: "IEP Search", icon: Search },
    ],
  },
  {
    label: "Reports",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/analytics", label: "Analytics", icon: PieChart },
      { href: "/parent-communication", label: "Parent Comms", icon: MessageSquare },
    ],
  },
];

const paraNav: NavSection[] = [
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

// SPED STUDENT — student-facing portal
// Simple: overview → goals (what I'm working toward) → services (what I'm entitled to) → sessions (history)
const spedStudentNav: NavSection[] = [
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

const STAFF_NAV_CONFIG = {
  admin: {
    nav: adminNav,
    color: "bg-emerald-600",
    textColor: "text-emerald-600",
    bgActive: "bg-emerald-50 text-emerald-700 font-semibold",
    iconActive: "text-emerald-600",
    label: "Trellis",
    subtitle: "Built to support.",
    homeHref: "/",
  },
  sped_teacher: {
    nav: spedTeacherNav,
    color: "bg-emerald-700",
    textColor: "text-emerald-700",
    bgActive: "bg-emerald-50 text-emerald-700 font-semibold",
    iconActive: "text-emerald-700",
    label: "Trellis",
    subtitle: "Built to support.",
    homeHref: "/",
  },
};

const roleConfig: Record<string, typeof STAFF_NAV_CONFIG.admin> = {
  admin: STAFF_NAV_CONFIG.admin,
  case_manager: STAFF_NAV_CONFIG.admin,
  coordinator: STAFF_NAV_CONFIG.admin,
  bcba: STAFF_NAV_CONFIG.sped_teacher,
  sped_teacher: STAFF_NAV_CONFIG.sped_teacher,
  provider: STAFF_NAV_CONFIG.sped_teacher,
  para: {
    nav: paraNav,
    color: "bg-emerald-600",
    textColor: "text-emerald-600",
    bgActive: "bg-emerald-50 text-emerald-600 font-semibold",
    iconActive: "text-emerald-600",
    label: "Trellis",
    subtitle: "Built to support.",
    homeHref: "/my-day",
  },
  sped_student: {
    nav: spedStudentNav,
    color: "bg-emerald-600",
    textColor: "text-emerald-600",
    bgActive: "bg-emerald-50 text-emerald-700 font-semibold",
    iconActive: "text-emerald-600",
    label: "Trellis",
    subtitle: "Built to support.",
    homeHref: "/sped-portal",
  },
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { signOut } = useClerk();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { role, user, isDevMode } = useRole();
  const { typedFilter } = useSchoolContext();
  const { theme } = useTheme();
  const { data: alertsSummary } = useGetDashboardAlertsSummary(typedFilter);
  const openAlerts = (alertsSummary as any)?.total ?? 0;
  const config = roleConfig[role] ?? roleConfig["sped_teacher"];

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const navSections = config.nav;
  const navItems = navSections.flatMap(s => s.items);
  const primaryItems = navItems.filter(i => i.primary);
  const secondaryItems = navItems.filter(i => !i.primary);

  const homeHref = config.homeHref;

  const isSecondaryActive = secondaryItems.some(i =>
    i.href === homeHref ? location === homeHref : location.startsWith(i.href)
  );

  const initials = user.initials || user.name.split(" ").map(n => n[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "T";

  function isActive(item: NavItem) {
    return item.href === homeHref
      ? location === item.href
      : location.startsWith(item.href);
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Toaster position="top-right" richColors closeButton duration={4000} />
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={cn(
        "bg-sidebar border-r border-sidebar-border flex flex-col flex-shrink-0 z-50",
        "fixed inset-y-0 left-0 w-[220px] transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo & role switcher */}
        <div className={cn(
          "px-4 pt-5 pb-3",
          theme === "open-air" ? "border-b border-transparent" : "border-b border-sidebar-border"
        )}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              {theme === "open-air" ? (
                <div>
                  <p className="text-[15px] font-extrabold text-gray-900 leading-none tracking-tight">{config.label}</p>
                  <p className="text-[11px] text-gray-300 leading-none mt-1.5 tracking-wide">{config.subtitle}</p>
                </div>
              ) : (
                <>
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", config.color)}>
                    <Sprout className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-[15px] font-bold text-gray-900 leading-none tracking-tight">{config.label}</p>
                    <p className="text-[11px] text-gray-400 leading-none mt-1 tracking-wide">{config.subtitle}</p>
                  </div>
                </>
              )}
            </div>
            <button
              className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {isDevMode && <RoleSwitcher />}
          {role !== "sped_student" && (
            <div className="mt-2">
              <SchoolDistrictSelector />
            </div>
          )}
        </div>

        {/* Search trigger */}
        <div className="px-2.5 pt-2.5 pb-1">
          <button
            onClick={() => setSearchOpen(true)}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-[12px] group",
              theme === "open-air"
                ? "bg-transparent hover:bg-gray-50 text-gray-300 hover:text-gray-500"
                : "bg-gray-50 hover:bg-gray-100 border border-gray-200/70 text-gray-400 hover:text-gray-600"
            )}
          >
            <Search className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="text-[10px] border border-gray-200 rounded px-1 py-0.5 bg-white group-hover:border-gray-300 font-mono leading-none">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2.5 py-2 overflow-y-auto">
          {navSections.map((section, si) => (
            <div key={si} className={si > 0 ? "mt-4" : ""}>
              {section.label && (
                <p className="px-2.5 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "relative flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-100",
                        theme === "open-air"
                          ? active
                            ? "text-gray-900 font-semibold"
                            : "text-gray-400 hover:text-gray-700"
                          : active
                            ? config.bgActive
                            : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                      )}
                      onClick={() => setSidebarOpen(false)}
                    >
                      {theme === "open-air" && active && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-3.5 bg-emerald-500 rounded-full" />
                      )}
                      <item.icon className={cn(
                        "w-[17px] h-[17px] flex-shrink-0",
                        theme === "open-air"
                          ? active ? "text-gray-900" : "text-gray-300"
                          : active ? config.iconActive : "text-gray-400"
                      )} />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.alertBadge && openAlerts > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none">
                          {openAlerts > 99 ? "99+" : openAlerts}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User identity */}
        <div className={cn(
          "px-3 py-3",
          theme === "open-air" ? "border-t border-transparent" : "border-t border-sidebar-border"
        )}>
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0",
              theme === "open-air"
                ? "bg-emerald-50 text-emerald-600"
                : cn("text-white", config.color)
            )}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-800 truncate leading-tight">{user.name}</p>
              <p className={cn(
                "text-[11px] truncate leading-tight mt-0.5",
                theme === "open-air" ? "text-gray-300" : "text-gray-400"
              )}>{user.subtitle}</p>
            </div>
            <ThemePicker />
            <button
              onClick={() => signOut({ redirectUrl: "/sign-in" })}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden bg-sidebar border-b border-sidebar-border px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <button
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className={cn("w-6 h-6 rounded-md flex items-center justify-center", config.color)}>
              <Sprout className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-bold text-gray-900 tracking-tight">{config.label}</span>
          </div>
        </header>

        <SubscriptionBanner />
        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          {children}
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-sidebar border-t border-sidebar-border flex items-stretch z-30 safe-area-bottom">
          {primaryItems.map((item) => {
            const active = isActive(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors relative",
                  active ? config.textColor : "text-gray-400"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
                {item.alertBadge && openAlerts > 0 && (
                  <span className="absolute top-1.5 right-[calc(50%-14px)] bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full min-w-[16px] text-center leading-none">
                    {openAlerts > 99 ? "99+" : openAlerts}
                  </span>
                )}
              </Link>
            );
          })}
          {secondaryItems.length > 0 && (
            <div className="flex-1 relative">
              <button
                className={cn(
                  "w-full flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors",
                  isSecondaryActive ? config.textColor : "text-gray-400"
                )}
                onClick={() => setMoreOpen(!moreOpen)}
              >
                <MoreHorizontal className="w-5 h-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                  <div className="absolute bottom-full right-0 mb-2 bg-white rounded-xl shadow-xl border border-gray-200 py-2 w-56 z-50 max-h-[70vh] overflow-y-auto">
                    {navSections.map((section, si) => {
                      const secItems = section.items.filter(i => !i.primary);
                      if (secItems.length === 0) return null;
                      return (
                        <div key={si}>
                          {section.label && (
                            <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                              {section.label}
                            </p>
                          )}
                          {secItems.map((item) => {
                            const active = isActive(item);
                            return (
                              <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                  "flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition-colors",
                                  active ? `${config.textColor} bg-gray-50` : "text-gray-600 hover:bg-gray-50"
                                )}
                                onClick={() => setMoreOpen(false)}
                              >
                                <item.icon className="w-4 h-4 flex-shrink-0" />
                                <span className="flex-1">{item.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </nav>
      </div>
    </div>
  );
}
