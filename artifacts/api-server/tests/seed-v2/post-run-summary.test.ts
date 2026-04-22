/**
 * V2 — Post-run summary builder shape.
 *
 * Wave 1 introduces the `PostRunSummary` artifact. This test pins the
 * shape the api-server route surfaces to operators so future waves
 * can enrich it without breaking the contract.
 */
import { describe, it, expect } from "vitest";
import { buildPostRunSummary } from "@workspace/db";
import { beginRun, endRun } from "@workspace/db/v2/platform";

describe("v2/postRunSummary — buildPostRunSummary", () => {
  it("populates identity, timing, headline counts, scenario counts, and layer flags", async () => {
    const begin = beginRun(42);
    // Yield the event loop so finishedAtMs > startedAtMs (durationMs >= 0).
    await new Promise((r) => setTimeout(r, 1));
    const meta = endRun(begin, 42);
    const summary = buildPostRunSummary({
      meta,
      districtName: "Test District",
      alreadySeeded: false,
      result: {
        studentsCreated: 60,
        staffCreated: 10,
        serviceRequirements: 120,
        sessionsLogged: 1500,
        alerts: 12,
        compensatoryObligations: 4,
        sizeProfile: "medium",
      },
      scenarioCounts: { healthy: 30, shortfall: 10, urgent: 3 },
    });
    expect(summary.runId).toBe(meta.runId);
    expect(summary.districtId).toBe(42);
    expect(summary.districtName).toBe("Test District");
    expect(summary.alreadySeeded).toBe(false);
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);
    expect(summary.studentsCreated).toBe(60);
    expect(summary.serviceRequirements).toBe(120);
    expect(summary.scenarioCounts.healthy).toBe(30);
    // Layer flags: W1 lights up platform only.
    expect(summary.layers.platform).toBe(true);
    expect(summary.layers.domain).toBe(false);
    expect(summary.layers.simulator).toBe(false);
    expect(summary.layers.overlay).toBe(false);
    // v2Version is stamped from runMetadata.
    expect(summary.v2Version).toMatch(/^v2\./);
  });

  it("W5 — showcase enrichment populates compliance distribution, case counts, example ids, and lights overlay flag", () => {
    const begin = beginRun(99);
    const meta = endRun(begin, 99);
    const summary = buildPostRunSummary({
      meta,
      districtName: "Showcase District",
      alreadySeeded: false,
      result: {
        studentsCreated: 60, staffCreated: 10, serviceRequirements: 120,
        sessionsLogged: 1500, alerts: 12, compensatoryObligations: 4,
        sizeProfile: "small",
      },
      showcase: {
        complianceDistribution: { critical: 2, high: 4, medium: 5, low: 1, resolved: 3 },
        showcaseCaseCounts: {
          at_risk: 3, scheduled_makeup: 2, recently_resolved: 2, provider_overloaded: 1,
          evaluation_due: 2, parent_followup: 1, high_progress: 3, chronic_miss: 3,
          __fallback__: 4,
        },
        exampleShowcaseIds: { at_risk: [101, 102, 103], chronic_miss: [201, 202] },
      },
    });
    expect(summary.complianceDistribution.critical).toBe(2);
    expect(summary.complianceDistribution.resolved).toBe(3);
    expect(summary.showcaseCaseCounts.at_risk).toBe(3);
    expect(summary.showcaseCaseCounts.__fallback__).toBe(4);
    expect(summary.exampleShowcaseIds.at_risk).toEqual([101, 102, 103]);
    expect(summary.layers.overlay).toBe(true);
  });

  it("W5 — without `showcase`, compliance/showcase counts are zero and overlay flag stays false", () => {
    const begin = beginRun(11);
    const meta = endRun(begin, 11);
    const summary = buildPostRunSummary({
      meta, districtName: null, alreadySeeded: false,
      result: {
        studentsCreated: 0, staffCreated: 0, serviceRequirements: 0,
        sessionsLogged: 0, alerts: 0, compensatoryObligations: 0, sizeProfile: "small",
      },
    });
    expect(summary.complianceDistribution).toEqual({ critical: 0, high: 0, medium: 0, low: 0, resolved: 0 });
    expect(Object.values(summary.showcaseCaseCounts).every((n) => n === 0)).toBe(true);
    expect(summary.exampleShowcaseIds).toEqual({});
    expect(summary.layers.overlay).toBe(false);
  });

  it("scenarioCounts defaults to {} when omitted", () => {
    const begin = beginRun(7);
    const meta = endRun(begin, 7);
    const summary = buildPostRunSummary({
      meta,
      districtName: null,
      alreadySeeded: true,
      result: {
        studentsCreated: 0, staffCreated: 0, serviceRequirements: 0,
        sessionsLogged: 0, alerts: 0, compensatoryObligations: 0,
        sizeProfile: "small",
      },
    });
    expect(summary.scenarioCounts).toEqual({});
    expect(summary.alreadySeeded).toBe(true);
    expect(summary.districtName).toBeNull();
  });
});
