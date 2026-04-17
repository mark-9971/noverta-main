import { Router, type IRouter } from "express";
import { requireTierAccess } from "../../middlewares/tierGate";
import contactsRouter from "./contacts";
import progressSharingRouter from "./progressSharing";

const router: IRouter = Router();
router.use(
  [
    "/parent-contacts",
    "/students/:studentId/progress-summary",
    "/shared/progress",
  ],
  requireTierAccess("engagement.parent_communication"),
);
router.use(contactsRouter);
router.use(progressSharingRouter);

export default router;
