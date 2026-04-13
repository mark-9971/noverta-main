import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Calendar, AlertTriangle, ClipboardList,
  BarChart3, BookOpen, UserCheck, Bell
} from "lucide-react";
import { useGetDashboardAlertsSummary } from "@workspace/api-client-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/students", label: "Students", icon: Users },
  { href: "/sessions", label: "Sessions", icon: BookOpen },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/staff", label: "Staff", icon: UserCheck },
  { href: "/alerts", label: "Alerts", icon: AlertTriangle, alertBadge: true },
  { href: "/compliance", label: "Compliance", icon: ClipboardList },
  { href: "/reports", label: "Reports", icon: BarChart3 },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: alertsSummary } = useGetDashboardAlertsSummary();
  const openAlerts = (alertsSummary as any)?.total ?? 0;

  return (
    <div className="flex h-screen bg-slate-50/80 overflow-hidden">
      <aside className="w-[220px] bg-white border-r border-slate-200/80 flex flex-col flex-shrink-0">
        <div className="px-5 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
              <ClipboardList className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-slate-800 leading-none">MinuteOps</p>
              <p className="text-[11px] text-slate-400 leading-none mt-1">Service Tracking</p>
            </div>
          </div>
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
              )}>
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

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
