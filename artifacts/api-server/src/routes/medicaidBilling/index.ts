import { Router, type IRouter } from "express";
import cptMappingsRouter from "./cptMappings";
import claimsRouter from "./claims";
import analyticsRouter from "./analytics";

const router: IRouter = Router();
router.use(cptMappingsRouter);
router.use(claimsRouter);
router.use(analyticsRouter);

export default router;
