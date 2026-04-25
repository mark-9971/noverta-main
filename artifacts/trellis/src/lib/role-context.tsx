import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { setExtraHeaders } from "@workspace/api-client-react";
import { setAuthFetchExtraHeaders, getDevAuthBypassHeaders } from "@/lib/auth-fetch";

export type UserRole =
  | "admin"
  | "case_manager"
  | "bcba"
  | "sped_teacher"
  | "coordinator"
  | "provider"
  | "para"
  | "direct_provider"
  | "sped_student"
  | "sped_parent"
  | "trellis_support";

export const STAFF_ROLES: UserRole[] = [
  "admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider", "para", "direct_provider",
];

export const ROLE_SUBTITLES: Record<UserRole, string> = {
  admin: "Administrator",
  case_manager: "Case Manager",
  bcba: "BCBA",
  sped_teacher: "SPED Teacher",
  coordinator: "Coordinator",
  provider: "Provider",
  para: "Paraprofessional",
  direct_provider: "Direct Provider",
  sped_student: "Student",
  sped_parent: "Parent / Guardian",
  trellis_support: "Noverta Support (read-only)",
};

// Phase 2C-3: bcba and sped_teacher land on /today (matches their
// nav-config.ts homeHref and their sidebar's primary "Today" entry),
// not the admin /Dashboard surface.
const ROLE_HOME: Record<UserRole, string> = {
  admin: "/",
  case_manager: "/",
  bcba: "/today",
  sped_teacher: "/today",
  coordinator: "/",
  provider: "/my-day",
  para: "/my-day",
  direct_provider: "/my-day",
  sped_student: "/sped-portal",
  sped_parent: "/guardian-portal",
  trellis_support: "/support-session",
};

const VALID_ROLES = new Set<string>([
  "admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider", "para", "direct_provider",
  "sped_student", "sped_parent", "trellis_support",
]);

/**
 * Boundary canonicalizer for role-string claim values.
 *
 * Mirrors the api-server's `canonicalizeRoleString` (see
 * artifacts/api-server/src/lib/permissions.ts). Accepts the new
 * `"noverta_support"` claim spelling alongside the legacy
 * `"trellis_support"` value during the rename transition and
 * returns the internal canonical name so every downstream
 * `=== "trellis_support"` comparison in this app keeps working
 * unchanged. Once the Clerk dashboard `publicMetadata.role` rename
 * rolls out, both claim values will resolve identically; the legacy
 * literal stays in VALID_ROLES until tenant migration completes
 * (tracked in NEXT-8).
 */
function canonicalizeRoleString(role: unknown): unknown {
  if (role === "noverta_support") return "trellis_support";
  return role;
}

function isValidRole(r: unknown): r is UserRole {
  const c = canonicalizeRoleString(r);
  return typeof c === "string" && VALID_ROLES.has(c);
}

/**
 * Trellis → Noverta key migration shim.
 *
 * Dev-mode role-switcher state (selected role, sped student id, teacher id,
 * guardian id, sped student name) was previously stored under `trellis_*`
 * localStorage keys. We've renamed the canonical keys to `noverta_*` but
 * users mid-session must not lose their selected persona.
 *
 * Migration policy:
 *   - On read: prefer `noverta_*`; if absent, fall back to `trellis_*`
 *     (and copy the legacy value into the new key so subsequent reads are
 *     direct hits).
 *   - On write: write the new `noverta_*` key only (legacy reads still
 *     succeed because step 1 above migrates on first read).
 *   - On delete: remove BOTH so a cleared persona stays cleared across
 *     the rename boundary.
 *
 * Safe to remove the legacy fallback after one full session cycle.
 */
function legacyKey(key: string): string | null {
  if (key.startsWith("noverta_")) return "trellis_" + key.slice("noverta_".length);
  return null;
}
function lsGet(key: string, fallback = ""): string {
  try {
    const direct = localStorage.getItem(key);
    if (direct != null) return direct || fallback;
    const legacy = legacyKey(key);
    if (legacy) {
      const legacyVal = localStorage.getItem(legacy);
      if (legacyVal != null) {
        try { localStorage.setItem(key, legacyVal); } catch {}
        return legacyVal || fallback;
      }
    }
    return fallback;
  } catch { return fallback; }
}
function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}
function lsDel(key: string) {
  try {
    localStorage.removeItem(key);
    const legacy = legacyKey(key);
    if (legacy) localStorage.removeItem(legacy);
  } catch {}
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
  isPlatformAdmin: boolean;
  studentId: number;
  teacherId: number;
  guardianId: number;
  setRole: (role: UserRole) => void;
  setStudentId: (id: number, name?: string) => void;
  setTeacherId: (id: number, name?: string) => void;
  setGuardianId: (id: number) => void;
}

const RoleContext = createContext<RoleContextType | null>(null);

function getInitials(name: string): string {
  return name.split(" ").map(n => n[0]).filter(Boolean).join("").slice(0, 2).toUpperCase();
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const { user: clerkUser, isLoaded } = useUser();
  const [, setLocation] = useLocation();
  const isDevAuthBypass =
    import.meta.env.VITE_DEV_AUTH_BYPASS === "1" &&
    import.meta.env.MODE !== "production";
  const isDevMode = import.meta.env.DEV || isDevAuthBypass;

  // Persona override is enabled in dev mode AND for platform admins in prod
  // (used by the Demo Control Center role-walkthrough panel). The override
  // only changes client-side routing/UI; server-side role gates still apply.
  const [devRole, setDevRoleState] = useState<UserRole | null>(() => {
    const saved = lsGet("noverta_role");
    return isValidRole(saved) ? saved : null;
  });

  const [devStudentId, setDevStudentIdState] = useState<number>(() => {
    return Number(lsGet("noverta_sped_student_id")) || 0;
  });

  const [devStudentName, setDevStudentName] = useState<string>(() => {
    return lsGet("noverta_sped_student_name");
  });

  const [devTeacherId, setDevTeacherIdState] = useState<number>(() => {
    return Number(lsGet("noverta_teacher_id")) || 0;
  });

  const [devGuardianId, setDevGuardianIdState] = useState<number>(() => {
    return Number(lsGet("noverta_guardian_id")) || 1;
  });

  // Run Clerk's publicMetadata.role through the boundary canonicalizer
  // so the new `"noverta_support"` claim is mapped to the internal
  // `"trellis_support"` role before any UI compare or routing decision.
  const rawClerkRole = clerkUser?.publicMetadata?.role;
  const canonicalClerkRole = canonicalizeRoleString(rawClerkRole);
  const clerkRole = isValidRole(canonicalClerkRole)
    ? (canonicalClerkRole as UserRole)
    : null;

  const clerkStudentId = Number(clerkUser?.publicMetadata?.studentId) || 0;
  const clerkStaffId = Number(clerkUser?.publicMetadata?.staffId) || 0;
  const isPlatformAdmin = clerkUser?.publicMetadata?.platformAdmin === true;

  const canOverrideRole = isDevMode || isPlatformAdmin;
  const role: UserRole = (canOverrideRole && devRole) ? devRole : (clerkRole ?? (isDevMode ? "admin" : "sped_teacher"));
  const studentId = (isDevMode && devStudentId) ? devStudentId : clerkStudentId;
  const teacherId = (isDevMode && devTeacherId) ? devTeacherId : clerkStaffId;
  const clerkGuardianId = Number(clerkUser?.publicMetadata?.guardianId) || 0;
  const guardianId = (isDevMode && devGuardianId) ? devGuardianId : clerkGuardianId;

  useEffect(() => {
    if (isDevMode) {
      const headers: Record<string, string> = { "x-demo-role": role };
      if (role === "sped_parent") {
        headers["x-demo-guardian-id"] = String(guardianId);
      }
      // Preserve dev auth bypass headers so RoleProvider doesn't clobber them.
      Object.assign(headers, getDevAuthBypassHeaders());
      setExtraHeaders(headers);
      setAuthFetchExtraHeaders(headers);
    }
    return () => {
      if (isDevMode) {
        setExtraHeaders(null);
        setAuthFetchExtraHeaders(null);
      }
    };
  }, [isDevMode, role, guardianId]);

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
    if (!isDevMode && !isPlatformAdmin) return;
    setDevRoleState(r);
    lsSet("noverta_role", r);
    setLocation(ROLE_HOME[r]);
  }

  function setStudentId(id: number, name?: string) {
    if (!isDevMode) return;
    setDevStudentIdState(id);
    lsSet("noverta_sped_student_id", String(id));
    if (name) {
      setDevStudentName(name);
      lsSet("noverta_sped_student_name", name);
    }
  }

  function setTeacherId(id: number, _name?: string) {
    if (!isDevMode) return;
    setDevTeacherIdState(id);
    lsSet("noverta_teacher_id", String(id));
  }

  function setGuardianId(id: number) {
    if (!isDevMode) return;
    setDevGuardianIdState(id);
    lsSet("noverta_guardian_id", String(id));
  }

  if (!isLoaded && !isDevAuthBypass) return null;

  return (
    <RoleContext.Provider value={{
      role,
      user,
      isDevMode,
      isPlatformAdmin,
      studentId,
      teacherId,
      guardianId,
      setRole,
      setStudentId,
      setTeacherId,
      setGuardianId,
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
