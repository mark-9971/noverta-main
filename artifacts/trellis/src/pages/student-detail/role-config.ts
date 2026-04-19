import type { UserRole } from "@/lib/role-context";

export type StudentTabId =
  | "summary"
  | "iep"
  | "sessions"
  | "reports"
  | "behavior"
  | "contacts"
  | "journey"
  | "handoff";

export interface StudentCaps {
  editIep: boolean;
  editMedicaidId: boolean;
  archiveStudent: boolean;
}

export interface StudentWorkspaceConfig {
  defaultTab: StudentTabId;
  visibleTabs: ReadonlySet<StudentTabId>;
  caps: StudentCaps;
}

const ALL_TABS: ReadonlySet<StudentTabId> = new Set<StudentTabId>([
  "summary",
  "iep",
  "sessions",
  "reports",
  "behavior",
  "contacts",
  "journey",
  "handoff",
]);

export function getStudentWorkspaceConfig(
  role: UserRole | null | undefined,
): StudentWorkspaceConfig {
  switch (role) {
    case "bcba":
      return {
        defaultTab: "behavior",
        visibleTabs: new Set<StudentTabId>([
          "behavior",
          "summary",
          "iep",
          "sessions",
          "reports",
          "contacts",
        ]),
        caps: { editIep: false, editMedicaidId: false, archiveStudent: false },
      };

    case "provider":
    case "direct_provider":
      return {
        defaultTab: "sessions",
        visibleTabs: new Set<StudentTabId>([
          "sessions",
          "summary",
          "iep",
          "reports",
          "contacts",
        ]),
        caps: { editIep: false, editMedicaidId: false, archiveStudent: false },
      };

    case "para":
      return {
        defaultTab: "summary",
        visibleTabs: new Set<StudentTabId>(["summary", "sessions", "behavior"]),
        caps: { editIep: false, editMedicaidId: false, archiveStudent: false },
      };

    case "admin":
      return {
        defaultTab: "summary",
        visibleTabs: ALL_TABS,
        caps: { editIep: true, editMedicaidId: true, archiveStudent: true },
      };

    case "case_manager":
      return {
        defaultTab: "summary",
        visibleTabs: ALL_TABS,
        caps: { editIep: true, editMedicaidId: false, archiveStudent: false },
      };

    case "coordinator":
      return {
        defaultTab: "summary",
        visibleTabs: ALL_TABS,
        caps: { editIep: false, editMedicaidId: true, archiveStudent: false },
      };

    case "sped_teacher":
    case "sped_student":
    case "sped_parent":
    case "trellis_support":
    default:
      return {
        defaultTab: "summary",
        visibleTabs: ALL_TABS,
        caps: { editIep: false, editMedicaidId: false, archiveStudent: false },
      };
  }
}
