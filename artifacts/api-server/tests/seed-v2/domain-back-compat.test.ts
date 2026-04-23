/**
 * V2 domain — public API back-compat (compile-time + runtime).
 *
 * Architect review of W2 flagged the risk that future moves could
 * silently drop the legacy import surface external callers depend on:
 *
 *   - The api-server `setup` page imports `SizeProfile`, `DemoEmphasis`,
 *     and `SeedSampleOptions` from `@workspace/db` (root barrel).
 *   - W3+ simulator code is expected to import the same names from
 *     `@workspace/db/v2/domain` (the new subpath).
 *
 * This test pins both import paths so a drop on either side fails CI.
 * The TypeScript checks run at compile time (the file would not type-
 * check if an export disappeared); the runtime assertions verify the
 * value-shaped exports (constants, builders) stay reachable too.
 */
import { describe, it, expect } from "vitest";

// Root barrel — legacy public surface.
import type {
  SizeProfile as RootSizeProfile,
  DemoEmphasis as RootDemoEmphasis,
  SeedSampleOptions as RootSeedSampleOptions,
} from "@workspace/db";
import {
  seedSampleDataForDistrict,
  teardownSampleData,
  buildPostRunSummary,
} from "@workspace/db";

// W2 domain subpath — the new authoritative surface for W3+.
import type {
  SizeProfile as DomainSizeProfile,
  DemoEmphasis as DomainDemoEmphasis,
  SeedSampleOptions as DomainSeedSampleOptions,
  SeedShape,
  StudentDef,
  StudentSpec,
} from "@workspace/db/v2/domain";
import {
  SAMPLE_BOUNDS,
  SIZE_PROFILES,
  buildStaffSeeds,
  buildStudentDefs,
  resolveSeedShape,
  resolveSizeProfile,
  GOAL_BANK,
  ACCOM_BANK,
  DOMAIN_LAYER_VERSION,
} from "@workspace/db/v2/domain";

describe("v2/domain — back-compat surface", () => {
  it("root barrel keeps the seeder + summary value exports reachable", () => {
    expect(typeof seedSampleDataForDistrict).toBe("function");
    expect(typeof teardownSampleData).toBe("function");
    expect(typeof buildPostRunSummary).toBe("function");
  });

  it("v2/domain subpath exposes builders + reference + clinical surfaces", () => {
    expect(typeof buildStaffSeeds).toBe("function");
    expect(typeof buildStudentDefs).toBe("function");
    expect(typeof resolveSeedShape).toBe("function");
    expect(typeof resolveSizeProfile).toBe("function");
    expect(SAMPLE_BOUNDS.requiredMinutes).toEqual([60, 360]);
    // T-V2-09 — medium default is now 350 students (mid-point of the
    // 200-500 contract range). Pre-T-V2-09 value was 60.
    expect(SIZE_PROFILES.medium.students).toBe(350);
    expect(GOAL_BANK).toBeTypeOf("object");
    expect(ACCOM_BANK.length).toBeGreaterThan(0);
    expect(DOMAIN_LAYER_VERSION).toBe("w2");
  });

  it("type aliases are equivalent across both surfaces (compile-time pin)", () => {
    // If the root-barrel re-export ever drifts from v2/domain, these
    // assignments fail TypeScript. The runtime side is just a no-op.
    const a: RootSizeProfile = "medium";
    const b: DomainSizeProfile = a;
    const c: RootDemoEmphasis = "balanced";
    const d: DomainDemoEmphasis = c;
    const e: RootSeedSampleOptions = { sizeProfile: "small" };
    const f: DomainSeedSampleOptions = e;
    expect(b).toBe("medium");
    expect(d).toBe("balanced");
    expect(f.sizeProfile).toBe("small");
    // Touch the W3-facing aliases so a type rename trips the compiler.
    const g: SeedShape | null = null;
    const h: StudentDef | null = null;
    const i: StudentSpec | null = null;
    expect(g).toBeNull();
    expect(h).toBeNull();
    expect(i).toBeNull();
  });
});
