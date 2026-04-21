/**
 * Demo Readiness Closure — verify the handling-state demo seeder
 * (1) is exported from `@workspace/db` so the reset-demo route can wire
 * it in, and (2) produces all four in-flight states the showcase needs
 * — including the previously-missing `recovery_scheduled` row.
 *
 * Pure assertions on the row composition; no DB writes. The full
 * integration (seeder is invoked by `/api/sample-data/reset-demo`) is
 * verified by the existing 12-action-item-handling.test.ts contract
 * plus the wired call site in `routes/sampleData.ts` reset-demo.
 */
import { describe, it, expect } from "vitest";
import { buildDemoHandlingRows, seedDemoHandlingState } from "@workspace/db";

describe("Demo Readiness — handling-state seed coverage", () => {
  it("seedDemoHandlingState is exported from @workspace/db", () => {
    expect(typeof seedDemoHandlingState).toBe("function");
  });

  it("composes the four in-flight states with canonical itemId shapes", () => {
    const rows = buildDemoHandlingRows([
      { studentId: 11, serviceRequirementId: 101 },
      { studentId: 12, serviceRequirementId: 102 },
      { studentId: 13, serviceRequirementId: 103 },
      { studentId: 14, serviceRequirementId: 104 },
    ]);
    const byState = new Map(rows.map(r => [r.state, r]));
    expect(byState.get("awaiting_confirmation")?.itemId).toBe("risk:11:101");
    expect(byState.get("recovery_scheduled")?.itemId).toBe("risk:12:102");
    expect(byState.get("under_review")?.itemId).toBe("student:13:next-step");
    expect(byState.get("handed_off")?.itemId).toBe("service-gap:14:104");
  });

  it("includes a recovery_scheduled row so the Schedule-makeup pill is visible on first login", () => {
    const rows = buildDemoHandlingRows([
      { studentId: 1, serviceRequirementId: 1 },
      { studentId: 2, serviceRequirementId: 2 },
      { studentId: 3, serviceRequirementId: 3 },
      { studentId: 4, serviceRequirementId: 4 },
    ]);
    const recovery = rows.find(r => r.state === "recovery_scheduled");
    expect(recovery).toBeDefined();
    expect(recovery!.itemId.startsWith("risk:")).toBe(true);
    expect(recovery!.recommendedOwnerRole).toBe("scheduler");
  });

  it("uses DISTINCT students across rows so the Risk Report shows a believable spread", () => {
    const rows = buildDemoHandlingRows([
      { studentId: 11, serviceRequirementId: 101 },
      { studentId: 12, serviceRequirementId: 102 },
      { studentId: 13, serviceRequirementId: 103 },
      { studentId: 14, serviceRequirementId: 104 },
    ]);
    const studentIds = rows.map(r => r.itemId.split(":")[1]);
    expect(new Set(studentIds).size).toBe(rows.length);
  });

  it("degrades gracefully when fewer than four picks are available", () => {
    expect(buildDemoHandlingRows([])).toHaveLength(0);
    const two = buildDemoHandlingRows([
      { studentId: 1, serviceRequirementId: 1 },
      { studentId: 2, serviceRequirementId: 2 },
    ]);
    expect(two).toHaveLength(2);
    expect(two.find(r => r.state === "recovery_scheduled")).toBeDefined();
  });
});
