import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";

export type UserRole = "admin" | "teacher" | "student";

interface RoleUser {
  role: UserRole;
  id: number;
  name: string;
  subtitle: string;
}

const DEMO_USERS: Record<UserRole, RoleUser> = {
  admin: { role: "admin", id: 0, name: "Theresa Jackson", subtitle: "Case Manager / Admin" },
  teacher: { role: "teacher", id: 0, name: "Jennifer Martinez", subtitle: "Math Teacher" },
  student: { role: "student", id: 0, name: "Loading...", subtitle: "Student" },
};

const ROLE_HOME: Record<UserRole, string> = {
  admin: "/",
  teacher: "/teacher",
  student: "/portal",
};

interface RoleContextType {
  user: RoleUser;
  role: UserRole;
  setRole: (role: UserRole) => void;
  setTeacherId: (id: number) => void;
  setStudentId: (id: number) => void;
  teacherId: number;
  studentId: number;
}

const RoleContext = createContext<RoleContextType | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();
  const [role, setRoleState] = useState<UserRole>(() => {
    const saved = localStorage.getItem("minuteops_role");
    return (saved as UserRole) || "admin";
  });
  const [teacherId, setTeacherId] = useState<number>(() => {
    return Number(localStorage.getItem("minuteops_teacher_id")) || 0;
  });
  const [studentId, setStudentId] = useState<number>(() => {
    return Number(localStorage.getItem("minuteops_student_id")) || 0;
  });

  const setRole = (r: UserRole) => {
    setRoleState(r);
    localStorage.setItem("minuteops_role", r);
    setLocation(ROLE_HOME[r]);
  };

  useEffect(() => {
    if (teacherId) localStorage.setItem("minuteops_teacher_id", String(teacherId));
  }, [teacherId]);
  useEffect(() => {
    if (studentId) localStorage.setItem("minuteops_student_id", String(studentId));
  }, [studentId]);

  const user: RoleUser = {
    ...DEMO_USERS[role],
    id: role === "teacher" ? teacherId : role === "student" ? studentId : 0,
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
