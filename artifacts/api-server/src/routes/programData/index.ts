import { Router, type IRouter } from "express";
import { requireTierAccess } from "../../middlewares/tierGate";
import crudRouter from "./crud";
import templatesRouter from "./templates";
import dataCollectionRouter from "./dataCollection";
import analyticsRouter from "./analytics";
import caseloadAnalyticsRouter from "./caseloadAnalytics";

const router: IRouter = Router();
router.use(
  [
    "/students/:studentId/behavior-targets",
    "/students/:studentId/program-targets",
    "/students/:studentId/data-sessions",
    "/students/:studentId/behavior-data",
    "/students/:studentId/program-data",
    "/students/:studentId/phase-changes",
    "/students/:studentId/ioa-summary",
    "/behavior-targets",
    "/program-targets",
    "/program-templates",
    "/program-steps",
    "/phase-changes",
    "/modification-markers",
    "/data-sessions",
    "/aba/caseload-analytics",
  ],
  requireTierAccess("clinical.program_data"),
);

router.use(crudRouter);
router.use(templatesRouter);
router.use(dataCollectionRouter);
router.use(analyticsRouter);
router.use(caseloadAnalyticsRouter);

export default router;
