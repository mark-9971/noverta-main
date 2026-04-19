import { useRole, type UserRole } from "@/lib/role-context";
import { Shield, Brain, User, Users, Sun, Briefcase, Activity, ClipboardList, Stethoscope, HandHelping } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// Phase 2A follow-up: switcher now exposes every staff role plus the
// student/parent personas so all role-gated views are testable from the UI.
// Order roughly mirrors org seniority (admin → coordinator → case mgr →
// teacher → BCBA → provider → direct provider → para → student → parent).
const roles: { value: UserRole; label: string; icon: LucideIcon; activeClass: string }[] = [
  { value: "admin",           label: "Admin",             icon: Shield,        activeClass: "bg-emerald-800 text-white shadow-sm" },
  { value: "coordinator",     label: "Coordinator",       icon: ClipboardList, activeClass: "bg-emerald-700 text-white shadow-sm" },
  { value: "case_manager",    label: "Case Manager",      icon: Briefcase,     activeClass: "bg-emerald-700 text-white shadow-sm" },
  { value: "sped_teacher",    label: "SPED Teacher",      icon: Brain,         activeClass: "bg-emerald-700 text-white shadow-sm" },
  { value: "bcba",            label: "BCBA",              icon: Activity,      activeClass: "bg-emerald-600 text-white shadow-sm" },
  { value: "provider",        label: "Provider",          icon: Stethoscope,   activeClass: "bg-emerald-600 text-white shadow-sm" },
  { value: "direct_provider", label: "Direct Provider",   icon: Sun,           activeClass: "bg-emerald-600 text-white shadow-sm" },
  { value: "para",            label: "Paraprofessional",  icon: HandHelping,   activeClass: "bg-emerald-500 text-white shadow-sm" },
  { value: "sped_student",    label: "SPED Student",      icon: User,          activeClass: "bg-emerald-500 text-white shadow-sm" },
  { value: "sped_parent",     label: "Parent / Guardian", icon: Users,         activeClass: "bg-purple-600 text-white shadow-sm" },
];

export function RoleSwitcher() {
  const { role, setRole } = useRole();

  return (
    <div className="space-y-1">
      <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider px-0.5 mb-1">Demo Role</p>
      <div className="grid grid-cols-1 gap-0.5">
        {roles.map((r) => (
          <button
            key={r.value}
            onClick={() => setRole(r.value)}
            className={cn(
              "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all w-full text-left",
              role === r.value
                ? r.activeClass
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            )}
          >
            <r.icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{r.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
