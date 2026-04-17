import { type Request, type Response, type NextFunction } from "express";
import { db, districtsTable, districtSubscriptionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  type DistrictTier, type FeatureKey,
  isTierFeatureAccessible, getRequiredTierForFeature, TIER_LABELS,
  getModuleForFeature,
} from "@workspace/db";
import { getPublicMeta } from "../lib/clerkClaims";
import { getAuth } from "@clerk/express";

interface DistrictGateContext {
  tier: DistrictTier;
  isDemo: boolean;
  isPilot: boolean;
  addOns: string[];
}

async function resolveDistrictGateContext(req: Request): Promise<DistrictGateContext> {
  const meta = getPublicMeta(req);

  let districtId: number | null = meta.districtId ?? null;

  if (!districtId && meta.staffId) {
    const result = await db.execute(
      sql`SELECT d.id FROM districts d
          JOIN schools s ON s.district_id = d.id
          JOIN staff st ON st.school_id = s.id
          WHERE st.id = ${meta.staffId} LIMIT 1`
    );
    if (result.rows && result.rows.length > 0) {
      districtId = Number((result.rows[0] as Record<string, unknown>).id);
    }
  }

  if (!districtId) {
    const allDistricts = await db.execute(sql`SELECT id FROM districts LIMIT 2`);
    if (allDistricts.rows && allDistricts.rows.length === 1) {
      districtId = Number((allDistricts.rows[0] as Record<string, unknown>).id);
    }
  }

  if (!districtId) {
    return { tier: "essentials", isDemo: false, isPilot: false, addOns: [] };
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
  };
}

async function resolveDistrictTier(req: Request): Promise<DistrictTier> {
  const meta = getPublicMeta(req);

  let districtId: number | null = meta.districtId ?? null;

  if (!districtId && meta.staffId) {
    const result = await db.execute(
      sql`SELECT d.id, d.tier, d.tier_override FROM districts d
          JOIN schools s ON s.district_id = d.id
          JOIN staff st ON st.school_id = s.id
          WHERE st.id = ${meta.staffId} LIMIT 1`
    );
    const rows = result.rows;
    if (rows && rows.length > 0) {
      const row = rows[0] as Record<string, unknown>;
      const override = row.tier_override as string | null;
      return (override || row.tier || "essentials") as DistrictTier;
    }
  }

  if (!districtId) {
    const allDistricts = await db.execute(sql`SELECT id FROM districts LIMIT 2`);
    const rows = allDistricts.rows;
    if (rows && rows.length === 1) {
      const row = rows[0] as Record<string, unknown>;
      districtId = Number(row.id);
    }
  }

  if (!districtId) {
    return "essentials";
  }

  const [district] = await db
    .select({ tier: districtsTable.tier, tierOverride: districtsTable.tierOverride })
    .from(districtsTable)
    .where(eq(districtsTable.id, districtId))
    .limit(1);

  if (!district) return "essentials";
  return (district.tierOverride || district.tier || "essentials") as DistrictTier;
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
      res.status(503).json({
        error: "Unable to verify subscription tier",
        code: "TIER_CHECK_FAILED",
      });
    }
  };
}
