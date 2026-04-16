import { Router, type IRouter } from "express";
import overviewStatsRouter from "./overviewStats";
import alertsRouter from "./alerts";
import complianceMetricsRouter from "./complianceMetrics";
import chartsDataRouter from "./chartsData";

const router: IRouter = Router();

router.use(overviewStatsRouter);
router.use(alertsRouter);
router.use(complianceMetricsRouter);
router.use(chartsDataRouter);

export default router;
