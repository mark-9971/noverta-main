import { Router, type IRouter } from "express";
import crudRouter from "./crud";
import enrollmentRouter from "./enrollment";
import emergencyContactsRouter from "./emergencyContacts";
import medicalAlertsRouter from "./medicalAlerts";
import snapshotRouter from "./snapshot";
import journeyRouter from "./journey";

const router: IRouter = Router();

// medicalAlertsRouter MUST mount before crudRouter so the literal
// route GET /students/life-threatening-alerts wins over crud's
// GET /students/:id, which would otherwise treat the literal segment
// as a (non-numeric) :id and 400 on zod parse.
router.use(medicalAlertsRouter);
router.use(crudRouter);
router.use(enrollmentRouter);
router.use(emergencyContactsRouter);
router.use(snapshotRouter);
router.use(journeyRouter);

export default router;
