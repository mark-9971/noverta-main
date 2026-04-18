import { Router, type IRouter } from "express";
import { requireDistrictScope } from "../../middlewares/auth";
import { requireTierAccess } from "../../middlewares/tierGate";
import incidentsRouter from "./incidents";
import searchRouter from "./search";
import transitionsRouter from "./transitions";
import notificationsRouter from "./notifications";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

// requireDistrictScope: non-platform-admin users without a district claim get 403.
// Applies before all handlers — guarantees getEnforcedDistrictId() is non-null for regular users.
// Path-scoped: a path-less router.use() would block every router mounted after this one in
// routes/index.ts, since Express enters this sub-router for every request that reaches it.
// Routes here live under `/protective-measures/*` AND `/students/:id/protective-measures`,
// so both paths must be covered.
router.use(
  ["/protective-measures", "/students/:id/protective-measures"],
  requireDistrictScope,
  requireTierAccess("compliance.protective_measures"),
);

router.use(searchRouter);
router.use(incidentsRouter);
router.use(transitionsRouter);
router.use(notificationsRouter);
router.use(analyticsRouter);

export default router;
