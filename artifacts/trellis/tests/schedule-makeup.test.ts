import { describe, expect, it } from "vitest";
import { buildScheduleMakeupHref, riskRowItemId } from "../src/lib/schedule-makeup";

describe("buildScheduleMakeupHref", () => {
  it("includes studentId, intent, tab, and from", () => {
    const href = buildScheduleMakeupHref({ studentId: 42, from: "action-center" });
    expect(href).toBe("/scheduling?tab=minutes&intent=makeup&studentId=42&from=action-center");
  });

  it("appends serviceRequirementId when provided", () => {
    const href = buildScheduleMakeupHref({
      studentId: 7,
      serviceRequirementId: 19,
      from: "compliance",
    });
    expect(href).toContain("serviceRequirementId=19");
    expect(href).toContain("from=compliance");
  });

  it("appends missedSessionId when provided", () => {
    const href = buildScheduleMakeupHref({
      studentId: 1,
      serviceRequirementId: 2,
      missedSessionId: 333,
      from: "action-center",
    });
    expect(href).toContain("missedSessionId=333");
  });

  it("appends sourceActionItemId when provided (T02)", () => {
    const href = buildScheduleMakeupHref({
      studentId: 42,
      serviceRequirementId: 19,
      sourceActionItemId: "risk:42:19",
      from: "compliance",
    });
    expect(href).toBe(
      "/scheduling?tab=minutes&intent=makeup&studentId=42&serviceRequirementId=19&sourceActionItemId=risk%3A42%3A19&from=compliance",
    );
  });

  it("omits null sourceActionItemId (T02)", () => {
    const href = buildScheduleMakeupHref({
      studentId: 1,
      sourceActionItemId: null,
      from: "action-center",
    });
    expect(href).toBe("/scheduling?tab=minutes&intent=makeup&studentId=1&from=action-center");
  });

  it("omits null serviceRequirementId / missedSessionId", () => {
    const href = buildScheduleMakeupHref({
      studentId: 1,
      serviceRequirementId: null,
      missedSessionId: null,
      from: "student-detail",
    });
    expect(href).not.toContain("serviceRequirementId");
    expect(href).not.toContain("missedSessionId");
    expect(href).toContain("from=student-detail");
  });
});

describe("riskRowItemId", () => {
  it("uses the canonical risk:<sid>:<rid> shape (Phase 1E unified)", () => {
    // Phase 1E unified the id format across surfaces — `riskRowItemId`
    // is now a thin alias of `itemIdForRisk` so the Risk Report pill
    // shares state with the Action Center pill via the same row in
    // `action_item_handling`.
    expect(riskRowItemId(123, 456)).toBe("risk:123:456");
  });

  it("is stable for the same inputs", () => {
    expect(riskRowItemId(1, 2)).toBe(riskRowItemId(1, 2));
  });
});
