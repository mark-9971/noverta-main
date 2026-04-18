import { Router, type IRouter } from "express";
import crudRouter from "./crud";
import enrollmentRouter from "./enrollment";
import emergencyContactsRouter from "./emergencyContacts";
import medicalAlertsRouter from "./medicalAlerts";
import snapshotRouter from "./snapshot";
import journeyRouter from "./journey";

const router: IRouter = Router();

router.use(crudRouter);
router.use(enrollmentRouter);
router.use(emergencyContactsRouter);
router.use(medicalAlertsRouter);
router.use(snapshotRouter);
router.use(journeyRouter);

export default router;
