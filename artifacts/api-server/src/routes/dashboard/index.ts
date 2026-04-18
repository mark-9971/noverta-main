import { Router, type IRouter } from "express";
import overviewStatsRouter from "./overviewStats";
import alertsRouter from "./alerts";
import complianceMetricsRouter from "./complianceMetrics";
import chartsDataRouter from "./chartsData";
import complianceTrendsRouter from "./complianceTrends";
import schoolComplianceRouter from "./schoolCompliance";

const router: IRouter = Router();

router.use(overviewStatsRouter);
router.use(alertsRouter);
router.use(complianceMetricsRouter);
router.use(chartsDataRouter);
router.use(complianceTrendsRouter);
router.use(schoolComplianceRouter);

export default router;
