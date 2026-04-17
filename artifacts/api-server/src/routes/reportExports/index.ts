import { Router, type IRouter } from "express";
import { requireDistrictScope, requireRoles } from "../../middlewares/auth";
import csvExportsRouter from "./csvExports";
import fullRecordPdfRouter from "./fullRecordPdf";
import complianceReportsRouter from "./complianceReports";
import providerReportsRouter from "./providerReports";
import historyAndScheduledRouter from "./historyAndScheduled";
import complianceRiskReportRouter from "./complianceRiskReport";
import weeklyComplianceSummaryRouter from "./weeklyComplianceSummary";

export { generateReportCSVDirect } from "./historyAndScheduled";
export type { ReportFilters } from "./utils";

const router: IRouter = Router();
// Path-scoped: a path-less router.use() would block every router mounted after this one in
// routes/index.ts, since Express enters this sub-router for every request that reaches it.
// All sub-routes live under `/reports/*` (exports, compliance-risk-report, weekly-compliance-summary).
router.use("/reports", requireDistrictScope, requireRoles("admin", "case_manager", "coordinator", "provider"));

router.use(csvExportsRouter);
router.use(fullRecordPdfRouter);
router.use(complianceReportsRouter);
router.use(providerReportsRouter);
router.use(historyAndScheduledRouter);
router.use(complianceRiskReportRouter);
router.use(weeklyComplianceSummaryRouter);

export default router;
