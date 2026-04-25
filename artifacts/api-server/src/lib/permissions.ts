export type TrellisRole =
  | "admin"
  | "case_manager"
  | "bcba"
  | "sped_teacher"
  | "coordinator"
  | "provider"
  | "para"
  | "sped_student"
  | "sped_parent"
  | "trellis_support";

/**
 * Canonical Noverta-era alias for the same role-string union.
 *
 * The internal/stored representation of every role-string remains the
 * legacy name (e.g. `"trellis_support"`) during the rename transition
 * so:
 *   - existing Clerk publicMetadata.role values continue to satisfy
 *     `isRole()` and authorization checks unchanged,
 *   - the ~10 in-repo `=== "trellis_support"` literal comparisons
 *     across api-server + trellis frontend keep working without a
 *     scatter-shot rewrite (which would risk silently weakening
 *     support-session enforcement).
 *
 * Boundary parsers (`extractRole` in middlewares/auth.ts;
 * `isValidRole` in artifacts/trellis/src/lib/role-context.tsx) accept
 * the new `"noverta_support"` claim value and canonicalize it back to
 * `"trellis_support"` via `canonicalizeRoleString` below — so once the
 * Clerk dashboard is updated to issue `"noverta_support"` in
 * publicMetadata.role, this codebase admits both values and treats
 * them identically. The legacy `"trellis_support"` literal in the
 * union and HIERARCHY map is retained until every Clerk tenant has
 * been migrated; removal is tracked in NEXT-8.
 */
export type NovertaRole = TrellisRole;

export const ROLE_HIERARCHY: Record<TrellisRole, number> = {
  admin: 100,
  case_manager: 80,
  bcba: 70,
  sped_teacher: 60,
  coordinator: 50,
  provider: 40,
  para: 30,
  sped_student: 10,
  sped_parent: 5,
  // Noverta-employee read-only support role. Outside the district staff
  // hierarchy entirely; ranking is set low so it never satisfies a minRole
  // check by accident. Read access is granted only when an active
  // support_sessions row pins the request to a specific district (see
  // requireAuth's support-session override in middlewares/auth.ts).
  // Internal canonical name is `trellis_support`; `noverta_support` is
  // accepted at boundary parsers and remapped to this value. See
  // `canonicalizeRoleString` below.
  trellis_support: 1,
};

/**
 * Boundary canonicalizer for role-string claim values.
 *
 * Accepts both the legacy `"trellis_support"` claim (still issued by
 * existing Clerk tenants) and the canonical Noverta-era
 * `"noverta_support"` claim (to be issued once the Clerk dashboard
 * `publicMetadata.role` rename rolls out — see NEXT-7 §10 checklist).
 * Returns the internal canonical role-string used by every downstream
 * comparison in the api-server and trellis frontend, so the
 * authorization layer never has to know which spelling the token used.
 *
 * Idempotent: passing an already-canonical role returns it unchanged.
 * Non-string / unrecognized inputs are returned untouched so the
 * caller's existing `isRole()` validation still rejects them.
 */
export function canonicalizeRoleString(role: unknown): unknown {
  if (role === "noverta_support") return "trellis_support";
  return role;
}

export const STAFF_ROLES: TrellisRole[] = [
  "admin",
  "case_manager",
  "bcba",
  "sped_teacher",
  "coordinator",
  "provider",
  "para",
];

export const PRIVILEGED_STAFF_ROLES: TrellisRole[] = [
  "admin",
  "case_manager",
  "bcba",
  "sped_teacher",
  "coordinator",
];

export const WRITE_SUPERVISION_ROLES: TrellisRole[] = [
  "admin",
  "bcba",
  "sped_teacher",
  "case_manager",
  "coordinator",
];

export function isRole(r: unknown): r is TrellisRole {
  return typeof r === "string" && r in ROLE_HIERARCHY;
}

export function hasMinRole(userRole: TrellisRole, minRole: TrellisRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minRole];
}

export function isStaffRole(role: TrellisRole): boolean {
  return STAFF_ROLES.includes(role);
}

export function isPrivilegedStaff(role: TrellisRole): boolean {
  return PRIVILEGED_STAFF_ROLES.includes(role);
}

export const PERMISSIONS = {
  students: {
    read: PRIVILEGED_STAFF_ROLES,
    write: ["admin", "case_manager", "sped_teacher", "coordinator"] as TrellisRole[],
  },
  ieps: {
    read: PRIVILEGED_STAFF_ROLES,
    write: ["admin", "case_manager", "sped_teacher"] as TrellisRole[],
  },
  sessionLogs: {
    read: STAFF_ROLES,
    write: STAFF_ROLES,
  },
  protectiveMeasures: {
    read: PRIVILEGED_STAFF_ROLES,
    write: ["admin", "bcba", "sped_teacher", "case_manager"] as TrellisRole[],
  },
  supervision: {
    read: STAFF_ROLES,
    write: WRITE_SUPERVISION_ROLES,
    complianceDashboard: ["admin", "bcba", "case_manager", "coordinator", "sped_teacher"] as TrellisRole[],
  },
  staff: {
    read: PRIVILEGED_STAFF_ROLES,
    write: ["admin"] as TrellisRole[],
  },
  schools: {
    read: STAFF_ROLES,
    write: ["admin"] as TrellisRole[],
  },
  compliance: {
    read: PRIVILEGED_STAFF_ROLES,
    export: ["admin", "case_manager", "coordinator"] as TrellisRole[],
  },
  reports: {
    read: PRIVILEGED_STAFF_ROLES,
    export: ["admin", "case_manager", "coordinator"] as TrellisRole[],
  },
  parentCommunication: {
    read: PRIVILEGED_STAFF_ROLES,
    write: ["admin", "case_manager", "sped_teacher"] as TrellisRole[],
  },
  dataImport: {
    write: ["admin"] as TrellisRole[],
  },
  adminDashboard: {
    read: ["admin", "case_manager", "coordinator"] as TrellisRole[],
  },
  studentPortal: {
    read: ["sped_student"] as TrellisRole[],
  },
} satisfies Record<string, Partial<Record<string, TrellisRole[]>>>;
