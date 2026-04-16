import { Router, type IRouter } from "express";
import listRouter from "./list";
import studentsRouter from "./students";
import serviceRequirementsRouter from "./serviceRequirements";
import sessionsRouter from "./sessions";
import goalsDataRouter from "./goalsData";

const router: IRouter = Router();
router.use(listRouter);
router.use(studentsRouter);
router.use(serviceRequirementsRouter);
router.use(sessionsRouter);
router.use(goalsDataRouter);

export default router;
