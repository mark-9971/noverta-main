import { Router, type IRouter } from "express";
import scheduleBlocksRouter from "./scheduleBlocks";
import schedulerRouter from "./scheduler";
import staffAssignmentsRouter from "./staffAssignments";
import coverageRouter from "./coverage";
import myScheduleRouter from "./mySchedule";

const router: IRouter = Router();

router.use(scheduleBlocksRouter);
router.use(schedulerRouter);
router.use(staffAssignmentsRouter);
router.use(coverageRouter);
router.use(myScheduleRouter);

export default router;
