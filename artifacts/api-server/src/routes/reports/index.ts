import { Router, type IRouter } from "express";
import { requireDistrictScope } from "../../middlewares/auth";
import shortReportsRouter from "./shortReports";
import complianceTrendRouter from "./complianceTrend";
import executiveSummaryRouter from "./executiveSummary";
import auditPackageRouter from "./auditPackage";
import parentSummaryRouter from "./parentSummary";
import pilotHealthRouter from "./pilotHealth";

const router: IRouter = Router();

// Path-scoped: a path-less router.use() would block every router mounted after this one in
// routes/index.ts, since Express enters this sub-router for every request that reaches it.
router.use("/reports", requireDistrictScope);

router.use(shortReportsRouter);
router.use(complianceTrendRouter);
router.use(executiveSummaryRouter);
router.use(auditPackageRouter);
router.use(parentSummaryRouter);
router.use(pilotHealthRouter);

export default router;
