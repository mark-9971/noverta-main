import { Router, type IRouter } from "express";
import listRouter from "./list";
import studentsRouter from "./students";
import staffRouter from "./staff";
import serviceRequirementsRouter from "./serviceRequirements";
import sessionsRouter from "./sessions";
import goalsDataRouter from "./goalsData";
import iepDocumentsRouter from "./iepDocuments";
import validateRouter from "./validate";

const router: IRouter = Router();
router.use(listRouter);
router.use(studentsRouter);
router.use(staffRouter);
router.use(serviceRequirementsRouter);
router.use(sessionsRouter);
router.use(goalsDataRouter);
router.use(iepDocumentsRouter);
router.use(validateRouter);

export default router;
