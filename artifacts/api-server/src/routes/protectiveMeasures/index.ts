import { Router, type IRouter } from "express";
import { requireDistrictScope } from "../../middlewares/auth";
import { requireTierAccess } from "../../middlewares/tierGate";
import incidentsRouter from "./incidents";
import searchRouter from "./search";
import transitionsRouter from "./transitions";
import notificationsRouter from "./notifications";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

// requireDistrictScope: non-platform-admin users without a district claim get 403.
// Applies before all handlers — guarantees getEnforcedDistrictId() is non-null for regular users.
router.use(requireDistrictScope);
router.use(requireTierAccess("clinical.protective_measures"));

router.use(searchRouter);
router.use(incidentsRouter);
router.use(transitionsRouter);
router.use(notificationsRouter);
router.use(analyticsRouter);

export default router;
