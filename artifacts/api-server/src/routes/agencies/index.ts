import { Router, type IRouter } from "express";
import crudRouter from "./crud";
import staffLinksRouter from "./staffLinks";
import contractsRouter from "./contracts";
import utilizationRouter from "./utilization";

const router: IRouter = Router();

router.use(crudRouter);
router.use(staffLinksRouter);
router.use(contractsRouter);
router.use(utilizationRouter);

export default router;
