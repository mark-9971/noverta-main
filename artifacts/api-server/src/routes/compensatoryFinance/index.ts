import { Router, type IRouter } from "express";
import overviewRouter from "./overview";
import studentsRouter from "./students";
import burndownRouter from "./burndown";
import exportRouter from "./export";
import ratesRouter from "./rates";

const router: IRouter = Router();

router.use(overviewRouter);
router.use(studentsRouter);
router.use(burndownRouter);
router.use(exportRouter);
router.use(ratesRouter);

export default router;
