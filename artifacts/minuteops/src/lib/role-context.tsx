import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";

export type UserRole = "admin" | "sped_teacher" | "gen_ed_teacher" | "sped_student" | "gen_ed_student";

interface RoleUser {
  role: UserRole;
  id: number;
  name: string;
  subtitle: string;
}

const DEMO_USERS: Record<UserRole, RoleUser> = {
  admin: { role: "admin", id: 0, name: "Theresa Jackson", subtitle: "Case Manager / Admin" },
  sped_teacher: { role: "sped_teacher", id: 0, name: "SPED Staff View", subtitle: "SPED Teacher" },
  gen_ed_teacher: { role: "gen_ed_teacher", id: 0, name: "Select a teacher", subtitle: "Gen Ed Teacher" },
  sped_student: { role: "sped_student", id: 0, name: "Select a student", subtitle: "SPED Student" },
  gen_ed_student: { role: "gen_ed_student", id: 0, name: "Select a student", subtitle: "Gen Ed Student" },
};

const ROLE_HOME: Record<UserRole, string> = {
  admin: "/",
  sped_teacher: "/",
  gen_ed_teacher: "/teacher",
  sped_student: "/sped-portal",
  gen_ed_student: "/portal",
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
    const saved = localStorage.getItem("minuteops_role");
    return (saved as UserRole) || "admin";
  });

  const [genEdTeacherId, setGenEdTeacherIdState] = useState(() => lsGet("minuteops_gen_ed_teacher_id"));
  const [genEdTeacherName, setGenEdTeacherName] = useState(() => lsGetStr("minuteops_gen_ed_teacher_name"));

  const [spedStudentId, setSpedStudentIdState] = useState(() => lsGet("minuteops_sped_student_id"));
  const [spedStudentName, setSpedStudentName] = useState(() => lsGetStr("minuteops_sped_student_name"));

  const [genEdStudentId, setGenEdStudentIdState] = useState(() => lsGet("minuteops_gen_ed_student_id"));
  const [genEdStudentName, setGenEdStudentName] = useState(() => lsGetStr("minuteops_gen_ed_student_name"));

  const setRole = (r: UserRole) => {
    setRoleState(r);
    localStorage.setItem("minuteops_role", r);
    setLocation(ROLE_HOME[r]);
  };

  const setTeacherId = (id: number, name?: string) => {
    setGenEdTeacherIdState(id);
    localStorage.setItem("minuteops_gen_ed_teacher_id", String(id));
    if (name) {
      setGenEdTeacherName(name);
      localStorage.setItem("minuteops_gen_ed_teacher_name", name);
    }
  };

  const setStudentId = (id: number, name?: string) => {
    if (role === "sped_student") {
      setSpedStudentIdState(id);
      localStorage.setItem("minuteops_sped_student_id", String(id));
      if (name) {
        setSpedStudentName(name);
        localStorage.setItem("minuteops_sped_student_name", name);
      }
    } else {
      setGenEdStudentIdState(id);
      localStorage.setItem("minuteops_gen_ed_student_id", String(id));
      if (name) {
        setGenEdStudentName(name);
        localStorage.setItem("minuteops_gen_ed_student_name", name);
      }
    }
  };

  const teacherId = genEdTeacherId;
  const studentId = role === "sped_student" ? spedStudentId : genEdStudentId;

  const resolvedName = (() => {
    if (role === "gen_ed_teacher") return genEdTeacherId ? (genEdTeacherName || "Teacher") : DEMO_USERS.gen_ed_teacher.name;
    if (role === "sped_student") return spedStudentId ? (spedStudentName || "Student") : DEMO_USERS.sped_student.name;
    if (role === "gen_ed_student") return genEdStudentId ? (genEdStudentName || "Student") : DEMO_USERS.gen_ed_student.name;
    return DEMO_USERS[role].name;
  })();

  const user: RoleUser = {
    ...DEMO_USERS[role],
    id: role === "gen_ed_teacher" ? genEdTeacherId
      : role === "sped_student" ? spedStudentId
      : role === "gen_ed_student" ? genEdStudentId
      : 0,
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
