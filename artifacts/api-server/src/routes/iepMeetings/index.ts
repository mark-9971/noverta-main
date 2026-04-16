import { Router, type IRouter } from "express";
import schedulingRouter from "./scheduling";
import crudRouter from "./crud";
import attendeesRouter from "./attendees";
import notesMinutesRouter from "./notesMinutes";

const router: IRouter = Router();

router.use(schedulingRouter);
router.use(crudRouter);
router.use(attendeesRouter);
router.use(notesMinutesRouter);

export default router;
