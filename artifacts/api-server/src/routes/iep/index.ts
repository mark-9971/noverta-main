import { Router, type IRouter } from "express";
import goalsRouter from "./goals";
import progressReportsRouter from "./progressReports";
import documentsRouter from "./documents";
import accommodationsRouter from "./accommodations";

const router: IRouter = Router();

router.use(goalsRouter);
router.use(progressReportsRouter);
router.use(documentsRouter);
router.use(accommodationsRouter);

export default router;
