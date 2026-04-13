import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Calendar, AlertTriangle, ClipboardList,
  BarChart3, BookOpen, UserCheck, Bell, Upload, Activity,
  Menu, X, MoreHorizontal, Search, Shield, PieChart,
  GraduationCap, FileText, Award, Inbox, Bookmark, Brain, Star, Clock, Sparkles
} from "lucide-react";
import { useGetDashboardAlertsSummary } from "@workspace/api-client-react";
import { Toaster } from "sonner";
import { useRole } from "@/lib/role-context";
import { RoleSwitcher } from "./RoleSwitcher";

type NavItem = { href: string; label: string; icon: any; primary?: boolean; alertBadge?: boolean };
type NavSection = { label?: string; items: NavItem[] };

const adminNav: NavSection[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, primary: true },
      { href: "/students", label: "Students", icon: Users, primary: true },
      { href: "/sessions", label: "Sessions", icon: BookOpen, primary: true },
      { href: "/schedule", label: "Schedule", icon: Calendar },
    ],
  },
  {
    label: "Compliance",
    items: [
      { href: "/program-data", label: "Program Data", icon: Activity, primary: true },
      { href: "/iep-suggestions", label: "IEP Suggestions", icon: Sparkles },
      { href: "/compliance", label: "Minutes & Risk", icon: ClipboardList },
      { href: "/protective-measures", label: "Restraint & Seclusion", icon: Shield },
      { href: "/alerts", label: "Alerts", icon: AlertTriangle, alertBadge: true },
    ],
  },
  {
    label: "Academics",
    items: [
      { href: "/classes", label: "Classes", icon: BookOpen },
      { href: "/gradebook", label: "Gradebook", icon: Award },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/analytics", label: "Analytics", icon: PieChart, primary: true },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/staff", label: "Staff", icon: UserCheck },
      { href: "/search", label: "IEP Search", icon: Search },
      { href: "/import", label: "Import", icon: Upload },
    ],
  },
];

const spedTeacherNav: NavSection[] = [
  {
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard, primary: true },
      { href: "/students", label: "My Students", icon: Users, primary: true },
      { href: "/sessions", label: "Sessions", icon: BookOpen, primary: true },
      { href: "/schedule", label: "Schedule", icon: Calendar, primary: true },
    ],
  },
  {
    label: "Clinical",
    items: [
      { href: "/program-data", label: "Program Data", icon: Activity },
      { href: "/iep-suggestions", label: "IEP Suggestions", icon: Sparkles },
      { href: "/compliance", label: "Minutes & Risk", icon: ClipboardList },
      { href: "/alerts", label: "Alerts", icon: AlertTriangle, alertBadge: true },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/analytics", label: "Analytics", icon: PieChart },
      { href: "/reports", label: "Reports", icon: BarChart3 },
      { href: "/search", label: "IEP Search", icon: Search },
    ],
  },
];

const genEdTeacherNav: NavSection[] = [
  {
    items: [
      { href: "/teacher", label: "Dashboard", icon: LayoutDashboard, primary: true },
      { href: "/teacher/classes", label: "My Classes", icon: BookOpen, primary: true },
      { href: "/teacher/gradebook", label: "Gradebook", icon: Award, primary: true },
      { href: "/teacher/assignments", label: "Assignments", icon: FileText, primary: true },
    ],
  },
  {
    label: "Students",
    items: [
      { href: "/teacher/roster", label: "Student Roster", icon: Users },
      { href: "/teacher/submissions", label: "Submissions", icon: Inbox },
    ],
  },
];

const spedStudentNav: NavSection[] = [
  {
    items: [
      { href: "/sped-portal", label: "My Dashboard", icon: LayoutDashboard, primary: true },
      { href: "/sped-portal/goals", label: "My Goals", icon: Star, primary: true },
      { href: "/sped-portal/sessions", label: "My Sessions", icon: Clock, primary: true },
      { href: "/sped-portal/services", label: "My Services", icon: ClipboardList, primary: true },
    ],
  },
];

const genEdStudentNav: NavSection[] = [
  {
    items: [
      { href: "/portal", label: "Dashboard", icon: LayoutDashboard, primary: true },
      { href: "/portal/classes", label: "My Classes", icon: BookOpen, primary: true },
      { href: "/portal/assignments", label: "Assignments", icon: FileText, primary: true },
      { href: "/portal/grades", label: "My Grades", icon: Award, primary: true },
    ],
  },
];

const roleConfig = {
  admin: {
    nav: adminNav,
    color: "bg-indigo-600",
    textColor: "text-indigo-600",
    bgActive: "bg-indigo-50 text-indigo-700",
    iconActive: "text-indigo-600",
    label: "MinuteOps",
    subtitle: "Admin / Compliance",
    homeHref: "/",
  },
  sped_teacher: {
    nav: spedTeacherNav,
    color: "bg-purple-600",
    textColor: "text-purple-600",
    bgActive: "bg-purple-50 text-purple-700",
    iconActive: "text-purple-600",
    label: "MinuteOps",
    subtitle: "SPED Teacher",
    homeHref: "/",
  },
  gen_ed_teacher: {
    nav: genEdTeacherNav,
    color: "bg-emerald-600",
    textColor: "text-emerald-600",
    bgActive: "bg-emerald-50 text-emerald-700",
    iconActive: "text-emerald-600",
    label: "MinuteOps",
    subtitle: "Teacher Portal",
    homeHref: "/teacher",
  },
  sped_student: {
    nav: spedStudentNav,
    color: "bg-violet-600",
    textColor: "text-violet-600",
    bgActive: "bg-violet-50 text-violet-700",
    iconActive: "text-violet-600",
    label: "MinuteOps",
    subtitle: "Student Portal",
    homeHref: "/sped-portal",
  },
  gen_ed_student: {
    nav: genEdStudentNav,
    color: "bg-blue-600",
    textColor: "text-blue-600",
    bgActive: "bg-blue-50 text-blue-700",
    iconActive: "text-blue-600",
    label: "MinuteOps",
    subtitle: "Student Portal",
    homeHref: "/portal",
  },
};

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { role, user } = useRole();
  const { data: alertsSummary } = useGetDashboardAlertsSummary();
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

  return (
    <div className="flex h-screen bg-slate-50/80 overflow-hidden">
      <Toaster position="top-right" richColors closeButton duration={4000} />
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={cn(
        "bg-white border-r border-slate-200/80 flex flex-col flex-shrink-0 z-50",
        "fixed inset-y-0 left-0 w-[220px] transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shadow-sm", config.color)}>
                <ClipboardList className="w-4 h-4 text-white" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-slate-800 leading-none">{config.label}</p>
                <p className="text-[11px] text-slate-400 leading-none mt-1">{config.subtitle}</p>
              </div>
            </div>
            <button
              className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <RoleSwitcher />
        </div>

        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          {navSections.map((section, si) => (
            <div key={si} className={si > 0 ? "mt-4" : ""}>
              {section.label && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{section.label}</p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = item.href === homeHref
                    ? location === item.href
                    : location.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href} className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150",
                      isActive
                        ? config.bgActive
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                    )} onClick={() => setSidebarOpen(false)}>
                      <item.icon className={cn("w-[18px] h-[18px]", isActive ? config.iconActive : "text-slate-400")} />
                      <span className="flex-1">{item.label}</span>
                      {item.alertBadge && openAlerts > 0 && (
                        <span className="bg-red-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none">
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

        <div className="px-4 py-4 border-t border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold", config.color)}>
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-slate-700 truncate">{user.name}</p>
              <p className="text-[11px] text-slate-400 truncate">{user.subtitle}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden bg-white border-b border-slate-200/80 px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <button
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className={cn("w-6 h-6 rounded-md flex items-center justify-center", config.color)}>
              <ClipboardList className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-800">{config.label}</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          {children}
        </main>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-stretch z-30 safe-area-bottom">
          {primaryItems.map((item) => {
            const isActive = item.href === homeHref
              ? location === item.href
              : location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors",
                  isActive ? config.textColor : "text-slate-400"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
          {secondaryItems.length > 0 && (
            <div className="flex-1 relative">
              <button
                className={cn(
                  "w-full flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors",
                  isSecondaryActive ? config.textColor : "text-slate-400"
                )}
                onClick={() => setMoreOpen(!moreOpen)}
              >
                <MoreHorizontal className="w-5 h-5" />
                <span className="text-[10px] font-medium">More</span>
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                  <div className="absolute bottom-full right-0 mb-2 bg-white rounded-xl shadow-xl border border-slate-200 py-2 w-52 z-50">
                    {secondaryItems.map((item) => {
                      const isActive = item.href === homeHref ? location === homeHref : location.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors",
                            isActive ? `${config.textColor} bg-slate-50` : "text-slate-600 hover:bg-slate-50"
                          )}
                          onClick={() => setMoreOpen(false)}
                        >
                          <item.icon className="w-4 h-4" />
                          <span className="flex-1">{item.label}</span>
                        </Link>
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
