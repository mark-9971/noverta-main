import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, Calendar, AlertTriangle, ClipboardList,
  BarChart3, Settings, BookOpen, UserCheck, ChevronRight, Bell
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <aside className="w-56 bg-slate-900 text-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-500 rounded-md flex items-center justify-center">
              <ClipboardList className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white leading-none">MinuteOps</p>
              <p className="text-[10px] text-slate-400 leading-none mt-0.5">SPED Service Platform</p>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map((item) => {
            const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <a className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
                  isActive
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                )}>
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {item.alertBadge && openAlerts > 0 && (
                    <Badge className="bg-red-500 text-white text-[10px] px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center">
                      {openAlerts > 99 ? "99+" : openAlerts}
                    </Badge>
                  )}
                  {isActive && <ChevronRight className="w-3 h-3 opacity-60" />}
                </a>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-700">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 text-sm">
            <div className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center text-white text-xs font-bold">T</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-300 truncate">Theresa Jackson</p>
              <p className="text-[10px] text-slate-500 truncate">Case Manager</p>
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
