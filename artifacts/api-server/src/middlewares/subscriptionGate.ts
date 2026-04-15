import { type Request, type Response, type NextFunction } from "express";
import { db, districtSubscriptionsTable, staffTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getPublicMeta } from "../lib/clerkClaims";
import { getAuth } from "@clerk/express";

const GATED_STATUSES = ["canceled", "unpaid"];
const ALLOWED_STATUSES = ["active", "trialing", "past_due"];

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

async function resolveDistrictId(req: Request): Promise<number | null> {
  const meta = getPublicMeta(req);
  if (meta.staffId) {
    const [staff] = await db
      .select({ schoolId: staffTable.schoolId })
      .from(staffTable)
      .where(eq(staffTable.id, meta.staffId))
      .limit(1);
    if (staff?.schoolId) {
      const result = await db.execute(
        sql`SELECT district_id FROM schools WHERE id = ${staff.schoolId} LIMIT 1`
      );
      const rows = result.rows as Array<{ district_id: number }>;
      if (rows.length > 0) return Number(rows[0].district_id);
    }
  }
  const allDistricts = await db.execute(sql`SELECT id FROM districts LIMIT 2`);
  const rows = allDistricts.rows as Array<{ id: number }>;
  if (rows.length === 1) return Number(rows[0].id);
  return null;
}

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

  const meta = getPublicMeta(req);
  if (meta.platformAdmin) {
    next();
    return;
  }

  resolveDistrictId(req)
    .then((districtId) => {
      if (!districtId) {
        res.status(403).json({
          error: "Subscription check failed",
          code: "DISTRICT_UNRESOLVABLE",
          message: "Unable to determine your district. Contact your administrator.",
        });
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
