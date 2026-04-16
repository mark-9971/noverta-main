import { Router, type IRouter } from "express";
import overviewRouter from "./overview";
import behaviorSummaryRouter from "./behaviorSummary";
import programSummaryRouter from "./programSummary";
import minutesSummaryRouter from "./minutesSummary";
import studentAnalyticsRouter from "./studentAnalytics";
import protectiveMeasuresRouter from "./protectiveMeasures";

const router: IRouter = Router();

router.use(overviewRouter);
router.use(behaviorSummaryRouter);
router.use(programSummaryRouter);
router.use(minutesSummaryRouter);
router.use(studentAnalyticsRouter);
router.use(protectiveMeasuresRouter);

export default router;
