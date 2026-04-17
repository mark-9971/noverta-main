import { type Request, type Response, type NextFunction } from "express";
import { db, districtsTable, districtSubscriptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  type DistrictTier, type FeatureKey,
  isTierFeatureAccessible, getRequiredTierForFeature, TIER_LABELS,
  getModuleForFeature,
} from "@workspace/db";
import { getPublicMeta } from "../lib/clerkClaims";
import { recordAccessDenial } from "../lib/accessDenials";
import { resolveDistrictIdForCaller } from "../lib/resolveDistrictForCaller";
import { getAuth } from "@clerk/express";

interface DistrictGateContext {
  tier: DistrictTier;
  isDemo: boolean;
  isPilot: boolean;
  addOns: string[];
  /** Whether the caller's district could be resolved at all. */
  resolved: boolean;
}

async function resolveDistrictGateContext(req: Request): Promise<DistrictGateContext> {
  const districtId = await resolveDistrictIdForCaller(req);

  if (!districtId) {
    // Caller has no resolvable district scope. Return a default "essentials,
    // not demo/pilot, no add-ons" context with resolved=false so the gate
    // can decide how to respond. Previously this fell back to "the only
    // district in the table"; that fallback has been removed because it
    // silently leased one tenant's tier to an unscoped user.
    return { tier: "essentials", isDemo: false, isPilot: false, addOns: [], resolved: false };
  }

  const [district] = await db
    .select({
      tier: districtsTable.tier,
      tierOverride: districtsTable.tierOverride,
      isDemo: districtsTable.isDemo,
      isPilot: districtsTable.isPilot,
    })
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId))
    .limit(1);

  const [sub] = await db
    .select({ addOns: districtSubscriptionsTable.addOns })
    .from(districtSubscriptionsTable)
    .where(eq(districtSubscriptionsTable.districtId, districtId))
    .limit(1);

  const tier = (district?.tierOverride || district?.tier || "essentials") as DistrictTier;
  return {
    tier,
    isDemo: !!district?.isDemo,
    isPilot: !!district?.isPilot,
    addOns: sub?.addOns ?? [],
    resolved: true,
  };
}

export function requireTierAccess(featureKey: FeatureKey) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Production: explicitly reject dev-only test headers.
    if (process.env.NODE_ENV === "production") {
      if (req.headers["x-test-user-id"] || req.headers["x-test-role"] || req.headers["x-test-district-id"]) {
        res.status(400).json({ error: "Dev-only headers are not accepted in production" });
        return;
      }
    }

    // Test-mode bypass: strictly NODE_ENV === "test" only (not "development" or staging).
    // Allows the permission-matrix test suite to reach tier-gated routes without a real Clerk session.
    if (process.env.NODE_ENV === "test") {
      const testUserId = req.headers["x-test-user-id"];
      if (typeof testUserId === "string" && testUserId) {
        next();
        return;
      }
    }

    const auth = getAuth(req);
    if (!auth?.userId) {
      recordAccessDenial(req, "unauthenticated", 401, `Tier gate hit without auth (feature: ${featureKey})`);
      res.status(401).json({ error: "Unauthenticated", code: "UNAUTHENTICATED" });
      return;
    }

    // In test mode, always grant enterprise-level access so dev/demo logins
    // can reach every feature without a real subscription tier in the DB.
    // In production, tier is resolved from the DB.
    if (process.env.NODE_ENV === "test") {
      next();
      return;
    }

    const meta = getPublicMeta(req);
    if (meta.platformAdmin) {
      next();
      return;
    }

    try {
      const ctx = await resolveDistrictGateContext(req);

      if (!ctx.resolved) {
        // Caller is authenticated but not linked to any district; we can't
        // safely grant access to a tier-gated feature without knowing whose
        // tier to check. Tell the user explicitly rather than silently
        // granting (or borrowing the only district's tier).
        recordAccessDenial(
          req,
          "no_district_scope",
          403,
          `Tier gate hit by user with no resolvable district (feature: ${featureKey})`,
        );
        res.status(403).json({
          error: "Your account isn't linked to a district yet. Ask a district admin to add your email to their staff list, then sign in again.",
          code: "NO_DISTRICT_SCOPE",
        });
        return;
      }

      // Demo and pilot districts get full access regardless of tier — they're
      // explicitly non-paying tracks and must never see "upgrade required" walls.
      if (ctx.isDemo || ctx.isPilot) {
        next();
        return;
      }

      if (isTierFeatureAccessible(ctx.tier, featureKey)) {
        next();
        return;
      }

      // Add-on grant: if the feature's module has been purchased à la carte,
      // allow it even when the base tier doesn't include it.
      const moduleKey = getModuleForFeature(featureKey);
      if (moduleKey && ctx.addOns.includes(moduleKey)) {
        next();
        return;
      }

      const requiredTier = getRequiredTierForFeature(featureKey);
      recordAccessDenial(req, "tier_upgrade_required", 403,
        `Feature "${featureKey}" requires ${requiredTier}; district is on ${ctx.tier} (add-ons: ${ctx.addOns.length === 0 ? "none" : ctx.addOns.join(",")})`);
      res.status(403).json({
        error: "Feature not available on your current plan",
        code: "TIER_UPGRADE_REQUIRED",
        currentTier: ctx.tier,
        requiredTier,
        requiredTierLabel: TIER_LABELS[requiredTier],
        featureKey,
        message: `This feature requires the ${TIER_LABELS[requiredTier]} plan. Please upgrade to access it.`,
      });
    } catch (err) {
      console.error("Tier gate error:", err);
      recordAccessDenial(req, "tier_check_failed", 503, `Tier resolution failed for feature "${featureKey}"`);
      res.status(503).json({
        error: "Unable to verify subscription tier",
        code: "TIER_CHECK_FAILED",
      });
    }
  };
}
