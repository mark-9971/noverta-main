import { type Request, type Response, type NextFunction } from "express";
import { db, districtSubscriptionsTable, districtsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getPublicMeta } from "../lib/clerkClaims";
import { resolveDistrictIdForCaller } from "../lib/resolveDistrictForCaller";
import { getAuth } from "@clerk/express";

const GATED_STATUSES = ["canceled", "unpaid", "past_due"];
const ALLOWED_STATUSES = ["active", "trialing"];

const EXEMPT_PATHS = [
  "/billing/subscription",
  "/billing/status",
  "/billing/checkout",
  "/billing/portal",
  "/billing/plans",
  "/billing/publishable-key",
  "/billing/sync-subscription",
  "/billing/tenants",
  "/health",
  "/auth",
];

// District resolution is delegated to the shared resolver. Note: the previous
// implementation also fell back to "the only district in the table" when the
// caller had no scope — that was effectively letting an unscoped user inherit
// another tenant's billing status. That fallback is gone; an unresolved caller
// now receives a clear DISTRICT_UNRESOLVABLE 403.

export function requireActiveSubscription(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) {
    next();
    return;
  }

  const requestPath = req.path;
  if (EXEMPT_PATHS.some((p) => requestPath.startsWith(p))) {
    next();
    return;
  }

  // Bypass subscription gate in non-production so dev and demo logins work without
  // a real district subscription record in the database.
  if (process.env.NODE_ENV !== "production") {
    next();
    return;
  }

  const meta = getPublicMeta(req);
  if (meta.platformAdmin) {
    next();
    return;
  }

  resolveDistrictIdForCaller(req)
    .then(async (districtId) => {
      if (!districtId) {
        res.status(403).json({
          error: "Subscription check failed",
          code: "DISTRICT_UNRESOLVABLE",
          message: "Unable to determine your district. Contact your administrator.",
        });
        return;
      }

      // Demo and pilot districts are exempt from billing gates: they're explicitly
      // non-paying tracks (sample data and free pilots) and must never see a paywall.
      const [district] = await db
        .select({ isDemo: districtsTable.isDemo, isPilot: districtsTable.isPilot })
        .from(districtsTable)
        .where(eq(districtsTable.id, districtId))
        .limit(1);
      if (district?.isDemo || district?.isPilot) {
        next();
        return;
      }

      return db
        .select({
          status: districtSubscriptionsTable.status,
        })
        .from(districtSubscriptionsTable)
        .where(eq(districtSubscriptionsTable.districtId, districtId))
        .limit(1)
        .then(([sub]) => {
          if (!sub) {
            res.status(403).json({
              error: "No subscription found",
              code: "NO_SUBSCRIPTION",
              message: "Your district does not have an active subscription. Please contact your administrator.",
            });
            return;
          }

          if (ALLOWED_STATUSES.includes(sub.status)) {
            next();
            return;
          }

          if (GATED_STATUSES.includes(sub.status)) {
            res.status(403).json({
              error: "Subscription inactive",
              code: "SUBSCRIPTION_INACTIVE",
              status: sub.status,
              message:
                sub.status === "canceled"
                  ? "Your subscription has been canceled. Please reactivate to continue."
                  : "Your account has an unpaid balance. Please update your payment method.",
            });
            return;
          }

          res.status(403).json({
            error: "Subscription status invalid",
            code: "SUBSCRIPTION_INVALID",
            status: sub.status,
            message: "Your subscription is in an invalid state. Please contact support.",
          });
        });
    })
    .catch((err) => {
      console.error("Subscription gate error:", err);
      res.status(503).json({
        error: "Service temporarily unavailable",
        code: "SUBSCRIPTION_CHECK_FAILED",
        message: "Unable to verify subscription status. Please try again.",
      });
    });
}
