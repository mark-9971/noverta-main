import { useRole, type UserRole } from "@/lib/role-context";
import { Shield, Briefcase, Activity, HandHelping } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

// Phase 2B demo simplification: collapse the visible demo personas to four
// grouped roles. Underlying UserRole keys (coordinator, sped_teacher,
// provider, direct_provider, sped_student, sped_parent) still exist and
// continue to work when reached directly — they're just hidden from the
// main demo switcher to keep the demo story focused.
//
// Visible persona      →  underlying role used by the shell
//   Admin              →  admin
//   Case Mgr / Teacher →  case_manager   (cleaner case-mgmt shell)
//   BCBA / Provider    →  bcba           (preserves ABA differentiation)
//   Para               →  para
const roles: { value: UserRole; label: string; icon: LucideIcon; activeClass: string }[] = [
  { value: "admin",        label: "Admin",                  icon: Shield,      activeClass: "bg-emerald-800 text-white shadow-sm" },
  { value: "case_manager", label: "Case Manager / Teacher", icon: Briefcase,   activeClass: "bg-emerald-700 text-white shadow-sm" },
  { value: "bcba",         label: "BCBA / Provider",        icon: Activity,    activeClass: "bg-emerald-600 text-white shadow-sm" },
  { value: "para",         label: "Para",                   icon: HandHelping, activeClass: "bg-emerald-500 text-white shadow-sm" },
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
            data-testid={`button-role-${r.value}`}
          >
            <r.icon className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{r.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
