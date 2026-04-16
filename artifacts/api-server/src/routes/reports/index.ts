import { Router, type IRouter } from "express";
import { requireDistrictScope } from "../../middlewares/auth";
import shortReportsRouter from "./shortReports";
import complianceTrendRouter from "./complianceTrend";
import executiveSummaryRouter from "./executiveSummary";
import auditPackageRouter from "./auditPackage";
import parentSummaryRouter from "./parentSummary";

const router: IRouter = Router();

router.use(requireDistrictScope);

router.use(shortReportsRouter);
router.use(complianceTrendRouter);
router.use(executiveSummaryRouter);
router.use(auditPackageRouter);
router.use(parentSummaryRouter);

export default router;
