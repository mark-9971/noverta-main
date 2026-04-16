import { requireRoles } from "../../middlewares/auth";

export const requireReportExport = requireRoles("admin", "case_manager", "coordinator");
