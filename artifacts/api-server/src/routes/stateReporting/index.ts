import { Router, type IRouter } from "express";
import { requireTierAccess } from "../../middlewares/tierGate";
import routes from "./routes";

const router: IRouter = Router();
router.use(requireTierAccess("compliance.state_reporting"));
router.use(routes);

export const stateReportingRouter = router;
export default router;
