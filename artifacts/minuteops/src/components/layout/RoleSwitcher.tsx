import { useRole, type UserRole } from "@/lib/role-context";
import { GraduationCap, BookOpen, Shield, Brain, User } from "lucide-react";
import { cn } from "@/lib/utils";

const roles: { value: UserRole; label: string; icon: any; color: string; activeClass: string }[] = [
  { value: "admin", label: "Admin", icon: Shield, color: "bg-emerald-800", activeClass: "bg-emerald-800 text-white shadow-sm" },
  { value: "sped_teacher", label: "SPED Teacher", icon: Brain, color: "bg-emerald-700", activeClass: "bg-emerald-700 text-white shadow-sm" },
  { value: "gen_ed_teacher", label: "Gen Ed Teacher", icon: BookOpen, color: "bg-emerald-600", activeClass: "bg-emerald-600 text-white shadow-sm" },
  { value: "sped_student", label: "SPED Student", icon: User, color: "bg-emerald-600", activeClass: "bg-emerald-600 text-white shadow-sm" },
  { value: "gen_ed_student", label: "Gen Ed Student", icon: GraduationCap, color: "bg-gray-600", activeClass: "bg-gray-600 text-white shadow-sm" },
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
