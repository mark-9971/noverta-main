import { useRole, type UserRole } from "@/lib/role-context";
import { GraduationCap, BookOpen, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

const roles: { value: UserRole; label: string; icon: any; color: string }[] = [
  { value: "admin", label: "Admin", icon: Shield, color: "bg-indigo-600" },
  { value: "teacher", label: "Teacher", icon: BookOpen, color: "bg-emerald-600" },
  { value: "student", label: "Student", icon: GraduationCap, color: "bg-blue-600" },
];

export function RoleSwitcher() {
  const { role, setRole } = useRole();

  return (
    <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
      {roles.map((r) => (
        <button
          key={r.value}
          onClick={() => setRole(r.value)}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-all",
            role === r.value
              ? `${r.color} text-white shadow-sm`
              : "text-slate-500 hover:text-slate-700 hover:bg-white"
          )}
        >
          <r.icon className="w-3.5 h-3.5" />
          {r.label}
        </button>
      ))}
    </div>
  );
}
