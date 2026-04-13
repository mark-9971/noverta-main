import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Calendar, AlertTriangle, ClipboardList,
  BarChart3, BookOpen, UserCheck, Bell, Upload, Activity,
  Menu, X, MoreHorizontal, Search
} from "lucide-react";
import { useGetDashboardAlertsSummary } from "@workspace/api-client-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, primary: true },
  { href: "/students", label: "Students", icon: Users, primary: true },
  { href: "/sessions", label: "Sessions", icon: BookOpen, primary: true },
  { href: "/program-data", label: "Data", icon: Activity, primary: true },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/staff", label: "Staff", icon: UserCheck },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle, alertBadge: true },
  { href: "/compliance", label: "Compliance", icon: ClipboardList },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/search", label: "IEP Search", icon: Search },
  { href: "/import", label: "Import", icon: Upload },
];

const primaryItems = navItems.filter(i => i.primary);
const secondaryItems = navItems.filter(i => !i.primary);

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: alertsSummary } = useGetDashboardAlertsSummary();
  const openAlerts = (alertsSummary as any)?.total ?? 0;

  const isSecondaryActive = secondaryItems.some(i =>
    i.href === "/" ? location === "/" : location.startsWith(i.href)
  );

  return (
    <div className="flex h-screen bg-slate-50/80 overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={cn(
        "bg-white border-r border-slate-200/80 flex flex-col flex-shrink-0 z-50",
        "fixed inset-y-0 left-0 w-[260px] transform transition-transform duration-200 ease-in-out lg:relative lg:translate-x-0 lg:w-[220px]",
        sidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="px-5 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
              <ClipboardList className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-slate-800 leading-none">MinuteOps</p>
              <p className="text-[11px] text-slate-400 leading-none mt-1">Service Tracking</p>
            </div>
          </div>
          <button
            className="lg:hidden p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
                isActive
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              )} onClick={() => setSidebarOpen(false)}>
                <item.icon className={cn("w-[18px] h-[18px]", isActive ? "text-indigo-600" : "text-slate-400")} />
                <span className="flex-1">{item.label}</span>
                {item.alertBadge && openAlerts > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none">
                    {openAlerts > 99 ? "99+" : openAlerts}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-xs font-bold">TJ</div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-slate-700 truncate">Theresa Jackson</p>
              <p className="text-[11px] text-slate-400 truncate">Case Manager</p>
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
            <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center">
              <ClipboardList className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-semibold text-slate-800">MinuteOps</span>
          </div>
        </header>

        <main className="flex-1 overflow-auto pb-20 md:pb-0">
          {children}
        </main>

        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-stretch z-30 safe-area-bottom">
          {primaryItems.map((item) => {
            const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors",
                  isActive ? "text-indigo-600" : "text-slate-400"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
          <div className="flex-1 relative">
            <button
              className={cn(
                "w-full flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors",
                isSecondaryActive ? "text-indigo-600" : "text-slate-400"
              )}
              onClick={() => setMoreOpen(!moreOpen)}
            >
              {openAlerts > 0 && (
                <span className="absolute top-1 right-1/4 w-2 h-2 bg-red-500 rounded-full" />
              )}
              <MoreHorizontal className="w-5 h-5" />
              <span className="text-[10px] font-medium">More</span>
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
                <div className="absolute bottom-full right-0 mb-2 bg-white rounded-xl shadow-xl border border-slate-200 py-2 w-52 z-50">
                  {secondaryItems.map((item) => {
                    const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors",
                          isActive ? "text-indigo-600 bg-indigo-50" : "text-slate-600 hover:bg-slate-50"
                        )}
                        onClick={() => setMoreOpen(false)}
                      >
                        <item.icon className="w-4.5 h-4.5" />
                        <span className="flex-1">{item.label}</span>
                        {item.alertBadge && openAlerts > 0 && (
                          <span className="bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                            {openAlerts > 99 ? "99+" : openAlerts}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </nav>
      </div>
    </div>
  );
}
