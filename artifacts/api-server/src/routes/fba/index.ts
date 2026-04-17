import { Router, type IRouter } from "express";
import { requireTierAccess } from "../../middlewares/tierGate";
import fbaCrudRouter from "./fbaCrud";
import abcDataRouter from "./abcData";
import functionalAnalysisRouter from "./functionalAnalysis";
import bipManagementRouter from "./bipManagement";

const router: IRouter = Router();
router.use(
  [
    "/students/:studentId/fbas",
    "/fbas",
    "/observations",
    "/fa-sessions",
    "/students/:studentId/bips",
    "/bips",
  ],
  requireTierAccess("clinical.fba_bip"),
);

router.use(fbaCrudRouter);
router.use(abcDataRouter);
router.use(functionalAnalysisRouter);
router.use(bipManagementRouter);

export default router;
