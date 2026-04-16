import { Router, type IRouter } from "express";
import { requireTierAccess } from "../../middlewares/tierGate";
import crudRouter from "./crud";
import templatesRouter from "./templates";
import dataCollectionRouter from "./dataCollection";
import analyticsRouter from "./analytics";

const router: IRouter = Router();
router.use(requireTierAccess("clinical.program_data"));

router.use(crudRouter);
router.use(templatesRouter);
router.use(dataCollectionRouter);
router.use(analyticsRouter);

export default router;
