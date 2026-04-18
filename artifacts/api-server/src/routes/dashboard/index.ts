import { Router, type IRouter } from "express";
import overviewStatsRouter from "./overviewStats";
import alertsRouter from "./alerts";
import complianceMetricsRouter from "./complianceMetrics";
import chartsDataRouter from "./chartsData";
import complianceTrendsRouter from "./complianceTrends";
import schoolComplianceRouter from "./schoolCompliance";
import iepExpirationsRouter from "./iepExpirations";
import makeupObligationsRouter from "./makeupObligations";
import providerCompletionRatesRouter from "./providerCompletionRates";
import parentEngagementRouter from "./parentEngagement";
import credentialExpirationRouter from "./credentialExpiration";

const router: IRouter = Router();

router.use(overviewStatsRouter);
router.use(alertsRouter);
router.use(complianceMetricsRouter);
router.use(chartsDataRouter);
router.use(complianceTrendsRouter);
router.use(schoolComplianceRouter);
router.use(iepExpirationsRouter);
router.use(makeupObligationsRouter);
router.use(providerCompletionRatesRouter);
router.use(parentEngagementRouter);
router.use(credentialExpirationRouter);

export default router;
