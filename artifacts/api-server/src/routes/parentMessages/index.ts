import { Router } from "express";
import templatesRouter from "./templates";
import staffMessagesRouter from "./staffMessages";
import conferencesRouter from "./conferences";
import guardianMessagesRouter from "./guardianPortal";

const router = Router();
router.use(templatesRouter);
router.use(staffMessagesRouter);
router.use(conferencesRouter);

export { guardianMessagesRouter };
export default router;
