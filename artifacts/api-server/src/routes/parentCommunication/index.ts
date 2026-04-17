import { Router, type IRouter } from "express";
import { requireTierAccess } from "../../middlewares/tierGate";
import contactsRouter from "./contacts";
import progressSharingRouter from "./progressSharing";

const router: IRouter = Router();
// NOTE: /shared/progress is intentionally NOT tier-gated. It is the public,
// unauthenticated parent-facing endpoint where the random token IS the
// capability. The previous mount placed it behind requireTierAccess, which
// 401s any unauthenticated request — meaning parents could never load the
// link they were sent. Issuance and management routes remain tier-gated.
router.use(
  [
    "/parent-contacts",
    "/students/:studentId/progress-summary",
  ],
  requireTierAccess("engagement.parent_communication"),
);
router.use(contactsRouter);
router.use(progressSharingRouter);

export default router;
