import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Calendar, AlertTriangle, ClipboardList,
  BarChart3, UserCheck, Upload, Activity,
  Menu, X, MoreHorizontal, Search, Shield, PieChart, Building2,
  Star, Clock, Sparkles,
  Timer, Clipboard, Sprout, Gauge, CalendarDays, ChevronRight,
  FileText, BookOpen
} from "lucide-react";
import { useGetDashboardAlertsSummary } from "@workspace/api-client-react";
import { Toaster } from "sonner";
import { useRole } from "@/lib/role-context";
import { useSchoolContext } from "@/lib/school-context";
import { RoleSwitcher } from "./RoleSwitcher";
import { SchoolDistrictSelector } from "./SchoolDistrictSelector";

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
      { href: "/compliance", label: "Service Minutes", icon: Timer },
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
      { href: "/protective-measures", label: "Restraint & Seclusion", icon: Shield },
    ],
  },
  {
    label: "District & Reports",
    items: [
      { href: "/executive", label: "Executive Dashboard", icon: Gauge },
      { href: "/district", label: "District Overview", icon: Building2 },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/analytics", label: "Analytics", icon: PieChart },
    ],
  },
  {
    label: "Admin Tools",
    items: [
      { href: "/staff", label: "Staff Directory", icon: UserCheck },
      { href: "/iep-suggestions", label: "IEP Suggestions", icon: Sparkles },
      { href: "/search", label: "IEP Search", icon: Search },
      { href: "/import", label: "Data Import", icon: Upload },
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
      { href: "/students", label: "My Students", icon: Users, primary: true },
      { href: "/schedule", label: "Schedule", icon: Calendar, primary: true },
      { href: "/compliance", label: "Service Minutes", icon: Timer },
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
      { href: "/behavior-assessment", label: "FBA / BIP", icon: ClipboardList },
      { href: "/iep-suggestions", label: "IEP Suggestions", icon: Sparkles },
      { href: "/search", label: "IEP Search", icon: Search },
    ],
  },
  {
    label: "Reports",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/analytics", label: "Analytics", icon: PieChart },
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
      { href: "/sped-portal/services", label: "My Services", icon: BookOpen, primary: true },
      { href: "/sped-portal/sessions", label: "My Sessions", icon: Clock },
    ],
  },
];

const roleConfig = {
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { role, user } = useRole();
  const { typedFilter } = useSchoolContext();
  const { data: alertsSummary } = useGetDashboardAlertsSummary(typedFilter);
  const openAlerts = (alertsSummary as any)?.total ?? 0;
  const config = roleConfig[role];

  const navSections = config.nav;
  const navItems = navSections.flatMap(s => s.items);
  const primaryItems = navItems.filter(i => i.primary);
  const secondaryItems = navItems.filter(i => !i.primary);

  const homeHref = config.homeHref;

  const isSecondaryActive = secondaryItems.some(i =>
    i.href === homeHref ? location === homeHref : location.startsWith(i.href)
  );

  const initials = user.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  function isActive(item: NavItem) {
    return item.href === homeHref
      ? location === item.href
      : location.startsWith(item.href);
  }

  return (
    <div className="flex h-screen bg-gray-50/60 overflow-hidden">
      <Toaster position="top-right" richColors closeButton duration={4000} />
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={cn(
        "bg-white border-r border-gray-200/70 flex flex-col flex-shrink-0 z-50",
        "fixed inset-y-0 left-0 w-[220px] transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo & role switcher */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", config.color)}>
                <Sprout className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-[15px] font-bold text-gray-900 leading-none tracking-tight">{config.label}</p>
                <p className="text-[11px] text-gray-400 leading-none mt-1 tracking-wide">{config.subtitle}</p>
              </div>
            </div>
            <button
              className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <RoleSwitcher />
          {(role === "admin" || role === "sped_teacher") && (
            <div className="mt-2">
              <SchoolDistrictSelector />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2.5 py-3 overflow-y-auto">
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
                        "flex items-center gap-2.5 px-2.5 py-[7px] rounded-lg text-[13px] font-medium transition-all duration-100",
                        active
                          ? config.bgActive
                          : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                      )}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <item.icon className={cn(
                        "w-[17px] h-[17px] flex-shrink-0",
                        active ? config.iconActive : "text-gray-400"
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
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0", config.color)}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-gray-800 truncate leading-tight">{user.name}</p>
              <p className="text-[11px] text-gray-400 truncate leading-tight mt-0.5">{user.subtitle}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden bg-white border-b border-gray-200/70 px-4 py-3 flex items-center gap-3 flex-shrink-0">
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

        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          {children}
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-stretch z-30 safe-area-bottom">
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
