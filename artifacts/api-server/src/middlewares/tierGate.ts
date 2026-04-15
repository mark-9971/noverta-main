import { type Request, type Response, type NextFunction } from "express";
import { db, districtsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  type DistrictTier, type FeatureKey,
  isTierFeatureAccessible, getRequiredTierForFeature,
  TIER_LABELS, API_ROUTE_FEATURE_MAP,
} from "@workspace/db";
import { getPublicMeta } from "../lib/clerkClaims";
import { getAuth } from "@clerk/express";

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
    const auth = getAuth(req);
    if (!auth?.userId) {
      next();
      return;
    }

    const meta = getPublicMeta(req);
    if (meta.platformAdmin) {
      next();
      return;
    }

    try {
      const tier = await resolveDistrictTier(req);

      if (isTierFeatureAccessible(tier, featureKey)) {
        next();
        return;
      }

      const requiredTier = getRequiredTierForFeature(featureKey);
      res.status(403).json({
        error: "Feature not available on your current plan",
        code: "TIER_UPGRADE_REQUIRED",
        currentTier: tier,
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

export function tierGateByRoute(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  if (!auth?.userId) {
    next();
    return;
  }

  const meta = getPublicMeta(req);
  if (meta.platformAdmin) {
    next();
    return;
  }

  const path = req.path;
  let featureKey: FeatureKey | null = null;
  for (const [route, fk] of Object.entries(API_ROUTE_FEATURE_MAP)) {
    if (path.startsWith(route)) {
      featureKey = fk;
      break;
    }
  }

  if (!featureKey) {
    next();
    return;
  }

  resolveDistrictTier(req)
    .then((tier) => {
      if (isTierFeatureAccessible(tier, featureKey!)) {
        next();
        return;
      }

      const requiredTier = getRequiredTierForFeature(featureKey!);
      res.status(403).json({
        error: "Feature not available on your current plan",
        code: "TIER_UPGRADE_REQUIRED",
        currentTier: tier,
        requiredTier,
        requiredTierLabel: TIER_LABELS[requiredTier],
        featureKey,
        message: `This feature requires the ${TIER_LABELS[requiredTier]} plan. Please upgrade to access it.`,
      });
    })
    .catch((err) => {
      console.error("Tier gate error:", err);
      res.status(503).json({
        error: "Unable to verify subscription tier",
        code: "TIER_CHECK_FAILED",
      });
    });
}
