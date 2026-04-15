import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { setExtraHeaders } from "@workspace/api-client-react";

export type UserRole =
  | "admin"
  | "case_manager"
  | "bcba"
  | "sped_teacher"
  | "coordinator"
  | "provider"
  | "para"
  | "sped_student";

export const STAFF_ROLES: UserRole[] = [
  "admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider", "para",
];

export const ROLE_SUBTITLES: Record<UserRole, string> = {
  admin: "Administrator",
  case_manager: "Case Manager",
  bcba: "BCBA",
  sped_teacher: "SPED Teacher",
  coordinator: "Coordinator",
  provider: "Provider",
  para: "Paraprofessional",
  sped_student: "Student",
};

const ROLE_HOME: Record<UserRole, string> = {
  admin: "/",
  case_manager: "/",
  bcba: "/",
  sped_teacher: "/",
  coordinator: "/",
  provider: "/",
  para: "/",
  sped_student: "/sped-portal",
};

const VALID_ROLES = new Set<string>([
  "admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider", "para", "sped_student",
]);

function isValidRole(r: unknown): r is UserRole {
  return typeof r === "string" && VALID_ROLES.has(r);
}

function lsGet(key: string, fallback = ""): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}

interface DevSession {
  userId: string;
  name: string;
  role: UserRole;
}

function parseSession(): DevSession | null {
  try {
    const token = localStorage.getItem("trellis_session");
    if (!token) return null;
    const payload = JSON.parse(atob(token));
    if (!payload.userId || !isValidRole(payload.role)) return null;
    return { userId: payload.userId, name: payload.name || "User", role: payload.role };
  } catch {
    return null;
  }
}

interface RoleUser {
  name: string;
  subtitle: string;
  initials: string;
}

interface RoleContextType {
  role: UserRole;
  user: RoleUser;
  isDevMode: boolean;
  studentId: number;
  teacherId: number;
  setRole: (role: UserRole) => void;
  setStudentId: (id: number, name?: string) => void;
  setTeacherId: (id: number, name?: string) => void;
}

const RoleContext = createContext<RoleContextType | null>(null);

function getInitials(name: string): string {
  return name.split(" ").map(n => n[0]).filter(Boolean).join("").slice(0, 2).toUpperCase();
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [, setLocation] = useLocation();

  const [session, setSession] = useState<DevSession | null>(() => parseSession());

  const [devRole, setDevRoleState] = useState<UserRole>(() => {
    const saved = lsGet("trellis_role");
    if (isValidRole(saved)) return saved;
    return session?.role ?? "admin";
  });

  const [devStudentId, setDevStudentIdState] = useState<number>(() => {
    return Number(lsGet("trellis_sped_student_id")) || 0;
  });

  const [devStudentName, setDevStudentName] = useState<string>(() => {
    return lsGet("trellis_sped_student_name");
  });

  const [devTeacherId, setDevTeacherIdState] = useState<number>(() => {
    return Number(lsGet("trellis_teacher_id")) || 0;
  });

  const role: UserRole = devRole;
  const studentId = devStudentId;
  const teacherId = devTeacherId;

  useEffect(() => {
    setExtraHeaders({ "x-demo-role": role });
    return () => { setExtraHeaders(null); };
  }, [role]);

  const baseName = (role === "sped_student" && devStudentName)
    ? devStudentName
    : (session?.name || `Demo ${ROLE_SUBTITLES[role]}`);

  const user: RoleUser = {
    name: baseName,
    subtitle: ROLE_SUBTITLES[role] || role,
    initials: getInitials(baseName) || "T",
  };

  function setRole(r: UserRole) {
    setDevRoleState(r);
    lsSet("trellis_role", r);

    // Update the stored session token to reflect the new role
    const current = parseSession();
    if (current) {
      const updated: DevSession = { ...current, role: r };
      const token = btoa(JSON.stringify(updated));
      localStorage.setItem("trellis_session", token);
      setSession(updated);
    }

    setLocation(ROLE_HOME[r]);
  }

  function setStudentId(id: number, name?: string) {
    setDevStudentIdState(id);
    lsSet("trellis_sped_student_id", String(id));
    if (name) {
      setDevStudentName(name);
      lsSet("trellis_sped_student_name", name);
    }
  }

  function setTeacherId(id: number, _name?: string) {
    setDevTeacherIdState(id);
    lsSet("trellis_teacher_id", String(id));
  }

  return (
    <RoleContext.Provider value={{
      role,
      user,
      isDevMode: true,
      studentId,
      teacherId,
      setRole,
      setStudentId,
      setTeacherId,
    }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}
