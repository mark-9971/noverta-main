import { Router, type IRouter } from "express";
import crudRouter from "./crud";
import enrollmentRouter from "./enrollment";
import emergencyContactsRouter from "./emergencyContacts";
import medicalAlertsRouter from "./medicalAlerts";
import snapshotRouter from "./snapshot";

const router: IRouter = Router();

router.use(crudRouter);
router.use(enrollmentRouter);
router.use(emergencyContactsRouter);
router.use(medicalAlertsRouter);
router.use(snapshotRouter);

export default router;
