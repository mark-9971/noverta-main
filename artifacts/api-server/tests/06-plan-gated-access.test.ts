/**
 * Plan-gated feature access.
 *
 * `requireTierAccess(featureKey)` is the single chokepoint that determines
 * whether a tier-gated feature is reachable for a given district subscription.
 * Two layers must hold:
 *
 *   1. Pure tier matrix (`isTierFeatureAccessible`): correctly gates
 *      Professional / Enterprise features behind the right tier. We test
 *      this directly because the integration path is bypassed in
 *      NODE_ENV=test (where the tier middleware short-circuits so the
 *      permission-matrix CI suite can reach every route).
 *   2. The shared resolver returns no fallback districtId when scope is
 *      missing — so the gate's "unresolved" branch fires instead of
 *      silently inheriting the only district in the table.
 */
import { describe, it, expect } from "vitest";
import {
  isTierFeatureAccessible,
  getRequiredTierForFeature,
  type FeatureKey,
  type DistrictTier,
} from "@workspace/db";
import { resolveDistrictForCaller } from "../src/lib/resolveDistrictForCaller";
import type { Request } from "express";

describe("plan-gated feature access (tier matrix)", () => {
  // Real feature keys sourced from lib/tiers, grouped by the module they
  // belong to. Tier→module table:
  //   essentials    → compliance_core only
  //   professional  → compliance_core + clinical_instruction + engagement_access
  //   enterprise    → all four modules
  const cases: Array<{ feature: FeatureKey; allowed: DistrictTier[]; denied: DistrictTier[] }> = [
    // district_operations module — enterprise-only
    {
      feature: "district.contract_utilization",
      allowed: ["enterprise"],
      denied: ["essentials", "professional"],
    },
    {
      feature: "district.executive",
      allowed: ["enterprise"],
      denied: ["essentials", "professional"],
    },
    // clinical_instruction module — professional + enterprise
    {
      feature: "clinical.fba_bip",
      allowed: ["professional", "enterprise"],
      denied: ["essentials"],
    },
    // engagement_access module — professional + enterprise
    {
      feature: "engagement.parent_portal",
      allowed: ["professional", "enterprise"],
      denied: ["essentials"],
    },
    // compliance_core module — every tier
    {
      feature: "compliance.service_minutes",
      allowed: ["essentials", "professional", "enterprise"],
      denied: [],
    },
  ];

  for (const c of cases) {
    for (const tier of c.allowed) {
      it(`tier '${tier}' grants access to '${c.feature}'`, () => {
        expect(isTierFeatureAccessible(tier, c.feature)).toBe(true);
      });
    }
    for (const tier of c.denied) {
      it(`tier '${tier}' DENIES access to '${c.feature}'`, () => {
        expect(isTierFeatureAccessible(tier, c.feature)).toBe(false);
      });
    }
    it(`getRequiredTierForFeature('${c.feature}') returns a real tier`, () => {
      const required = getRequiredTierForFeature(c.feature);
      expect(["essentials", "professional", "enterprise"]).toContain(required);
    });
  }
});

describe("plan-gated feature access (resolver behavior)", () => {
  it("resolveDistrictForCaller returns null when caller has no Clerk meta, no test header, and no staff link", async () => {
    // Use a request shape with no x-test-* headers and no Clerk auth context.
    // The resolver must NOT silently substitute the first district in the
    // table — it must report "unresolved" so the caller can be 403'd.
    const fakeReq = {
      headers: {},
      cookies: {},
      query: {},
      body: {},
      auth: () => ({}),
    } as unknown as Request;
    const result = await resolveDistrictForCaller(fakeReq);
    expect(result.districtId).toBeNull();
    expect(result.source).toBe("unresolved");
  });
});
