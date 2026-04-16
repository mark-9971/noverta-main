import { Router, type IRouter } from "express";
import loggingRouter from "./logging";
import crudRouter from "./crud";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(loggingRouter);
router.use(reportsRouter);
router.use(crudRouter);

export default router;
