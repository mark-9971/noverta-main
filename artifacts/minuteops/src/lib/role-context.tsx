import { createContext, useContext, useState, type ReactNode } from "react";
import { useLocation } from "wouter";

export type UserRole = "admin" | "sped_teacher" | "sped_student";

interface RoleUser {
  role: UserRole;
  id: number;
  name: string;
  subtitle: string;
}

const DEMO_USERS: Record<UserRole, RoleUser> = {
  admin: { role: "admin", id: 0, name: "Theresa Jackson", subtitle: "Case Manager / Admin" },
  sped_teacher: { role: "sped_teacher", id: 0, name: "SPED Staff View", subtitle: "SPED Teacher" },
  sped_student: { role: "sped_student", id: 0, name: "Select a student", subtitle: "SPED Student" },
};

const ROLE_HOME: Record<UserRole, string> = {
  admin: "/",
  sped_teacher: "/",
  sped_student: "/sped-portal",
};

interface RoleContextType {
  user: RoleUser;
  role: UserRole;
  setRole: (role: UserRole) => void;
  setTeacherId: (id: number, name?: string) => void;
  setStudentId: (id: number, name?: string) => void;
  teacherId: number;
  studentId: number;
}

const RoleContext = createContext<RoleContextType | null>(null);

function lsGet(key: string, fallback = 0): number {
  return Number(localStorage.getItem(key)) || fallback;
}
function lsGetStr(key: string): string {
  return localStorage.getItem(key) || "";
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [role, setRoleState] = useState<UserRole>(() => {
    const saved = localStorage.getItem("trellis_role");
    if (saved === "admin" || saved === "sped_teacher" || saved === "sped_student") return saved;
    return "admin";
  });

  const [spedStudentId, setSpedStudentIdState] = useState(() => lsGet("trellis_sped_student_id"));
  const [spedStudentName, setSpedStudentName] = useState(() => lsGetStr("trellis_sped_student_name"));

  const setRole = (r: UserRole) => {
    setRoleState(r);
    localStorage.setItem("trellis_role", r);
    setLocation(ROLE_HOME[r]);
  };

  const setTeacherId = (_id: number, _name?: string) => {
  };

  const setStudentId = (id: number, name?: string) => {
    setSpedStudentIdState(id);
    localStorage.setItem("trellis_sped_student_id", String(id));
    if (name) {
      setSpedStudentName(name);
      localStorage.setItem("trellis_sped_student_name", name);
    }
  };

  const teacherId = 0;
  const studentId = spedStudentId;

  const resolvedName = (() => {
    if (role === "sped_student") return spedStudentId ? (spedStudentName || "Student") : DEMO_USERS.sped_student.name;
    return DEMO_USERS[role].name;
  })();

  const user: RoleUser = {
    ...DEMO_USERS[role],
    id: role === "sped_student" ? spedStudentId : 0,
    name: resolvedName,
  };

  return (
    <RoleContext.Provider value={{ user, role, setRole, setTeacherId, setStudentId, teacherId, studentId }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
