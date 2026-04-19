import { Router, type IRouter } from "express";
import { requireRoles } from "../middlewares/auth";
import { sentryInitialized, sentryRelease } from "../lib/sentry";

// tenant-scope: internal — admin only
const router: IRouter = Router();

// Smoke-test endpoint for Sentry. Throws synchronously so the unhandled-error
// pipeline (Sentry expressIntegration + setupExpressErrorHandler) captures
// it. Gated by both an admin-role check and a SENTRY_TEST_ENABLED feature
// flag so it cannot be hit accidentally in production.
router.get(
  "/_internal/sentry-test",
  requireRoles("admin"),
  (req, _res, next) => {
    if (process.env.SENTRY_TEST_ENABLED !== "true") {
      next({ status: 404, message: "Not found" });
      return;
    }
    const tag = (req.query.tag as string | undefined) ?? "manual";
    const err = new Error(`Sentry backend smoke test (${tag})`);
    (err as Error & { status?: number }).status = 500;
    next(err);
  },
);

router.get("/_internal/sentry-status", requireRoles("admin"), (_req, res) => {
  res.json({
    enabled: sentryInitialized(),
    release: sentryRelease() ?? null,
    environment: process.env.NODE_ENV ?? "development",
    testEndpointEnabled: process.env.SENTRY_TEST_ENABLED === "true",
  });
});

export default router;
