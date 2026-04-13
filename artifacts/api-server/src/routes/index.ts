import { Router, type IRouter } from "express";
import healthRouter from "./health";
import schoolsRouter from "./schools";
import studentsRouter from "./students";
import staffRouter from "./staff";
import servicesRouter from "./services";
import sessionsRouter from "./sessions";
import schedulesRouter from "./schedules";
import alertsRouter from "./alerts";
import dashboardRouter from "./dashboard";
import minuteProgressRouter from "./minuteProgress";
import reportsRouter from "./reports";
import importsRouter from "./imports";
import programDataRouter from "./programData";

const router: IRouter = Router();

router.use(healthRouter);
router.use(schoolsRouter);
router.use(studentsRouter);
router.use(staffRouter);
router.use(servicesRouter);
router.use(sessionsRouter);
router.use(schedulesRouter);
router.use(alertsRouter);
router.use(dashboardRouter);
router.use(minuteProgressRouter);
router.use(reportsRouter);
router.use(importsRouter);
router.use(programDataRouter);

export default router;
