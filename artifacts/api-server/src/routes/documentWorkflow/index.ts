import { Router } from "express";
import versionsRouter from "./versions";
import workflowsRouter from "./workflows";
import dashboardRouter from "./dashboard";
import pwnRouter from "./pwn";

const router = Router();
router.use(versionsRouter);
router.use(workflowsRouter);
router.use(dashboardRouter);
router.use(pwnRouter);

export default router;
