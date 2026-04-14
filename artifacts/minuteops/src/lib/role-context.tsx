import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useUser } from "@clerk/react";
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
function lsDel(key: string) {
  try { localStorage.removeItem(key); } catch {}
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
  const { user: clerkUser, isLoaded } = useUser();
  const [, setLocation] = useLocation();
  const isDevMode = import.meta.env.DEV;

  const [devRole, setDevRoleState] = useState<UserRole | null>(() => {
    if (!import.meta.env.DEV) return null;
    const saved = lsGet("trellis_role");
    return isValidRole(saved) ? saved : null;
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

  const clerkRole = isValidRole(clerkUser?.publicMetadata?.role)
    ? (clerkUser!.publicMetadata!.role as UserRole)
    : null;

  const clerkStudentId = Number(clerkUser?.publicMetadata?.studentId) || 0;
  const clerkStaffId = Number(clerkUser?.publicMetadata?.staffId) || 0;

  const role: UserRole = (isDevMode && devRole) ? devRole : (clerkRole ?? "admin");
  const studentId = (isDevMode && devStudentId) ? devStudentId : clerkStudentId;
  const teacherId = (isDevMode && devTeacherId) ? devTeacherId : clerkStaffId;

  // In dev mode, tell the API server which role the UI is currently simulating.
  // The backend accepts X-Demo-Role as a fallback when Clerk metadata has no role.
  useEffect(() => {
    if (isDevMode) {
      setExtraHeaders({ "x-demo-role": role });
    }
    return () => {
      if (isDevMode) setExtraHeaders(null);
    };
  }, [isDevMode, role]);

  const clerkName = clerkUser?.fullName || clerkUser?.firstName || "";
  const userName = (isDevMode && devRole)
    ? (role === "sped_student" && devStudentName ? devStudentName : `Demo ${ROLE_SUBTITLES[role]}`)
    : (clerkName || "User");

  const user: RoleUser = {
    name: userName,
    subtitle: ROLE_SUBTITLES[role] || role,
    initials: getInitials(userName) || "T",
  };

  function setRole(r: UserRole) {
    if (!isDevMode) return;
    setDevRoleState(r);
    lsSet("trellis_role", r);
    setLocation(ROLE_HOME[r]);
  }

  function setStudentId(id: number, name?: string) {
    if (!isDevMode) return;
    setDevStudentIdState(id);
    lsSet("trellis_sped_student_id", String(id));
    if (name) {
      setDevStudentName(name);
      lsSet("trellis_sped_student_name", name);
    }
  }

  function setTeacherId(id: number, _name?: string) {
    if (!isDevMode) return;
    setDevTeacherIdState(id);
    lsSet("trellis_teacher_id", String(id));
  }

  if (!isLoaded) return null;

  return (
    <RoleContext.Provider value={{
      role,
      user,
      isDevMode,
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
