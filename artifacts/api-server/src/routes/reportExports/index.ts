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
router.use(requireDistrictScope);
router.use(requireRoles("admin", "case_manager", "coordinator"));

router.use(csvExportsRouter);
router.use(fullRecordPdfRouter);
router.use(complianceReportsRouter);
router.use(providerReportsRouter);
router.use(historyAndScheduledRouter);
router.use(complianceRiskReportRouter);
router.use(weeklyComplianceSummaryRouter);

export default router;
