import { Router, type IRouter } from "express";
import cptMappingsRouter from "./cptMappings";
import claimsRouter from "./claims";
import analyticsRouter from "./analytics";
import reportsRouter from "./reports";

const router: IRouter = Router();
router.use(cptMappingsRouter);
router.use(claimsRouter);
router.use(analyticsRouter);
router.use(reportsRouter);

export default router;
