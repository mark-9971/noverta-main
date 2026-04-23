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
  trellis_support: 1,
};

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
