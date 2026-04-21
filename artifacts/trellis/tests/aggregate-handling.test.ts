import { describe, expect, it } from "vitest";
import { pickHandlingForStudent, type HandlingMap } from "../src/lib/use-handling-state";

function entry(state: HandlingMap[string]["state"], setAt = Date.now()) {
  return { state, setAt };
}

describe("pickHandlingForStudent", () => {
  it("returns needs_action when nothing matches", () => {
    const merged: HandlingMap = { "alert-9": entry("recovery_scheduled") };
    expect(pickHandlingForStudent(merged, 42)).toBe("needs_action");
  });

  it("matches risk-row:<sid>:* ids", () => {
    const merged: HandlingMap = {
      "risk-row:42:7": entry("recovery_scheduled"),
      "risk-row:99:8": entry("under_review"),
    };
    expect(pickHandlingForStudent(merged, 42)).toBe("recovery_scheduled");
  });

  it("matches student:<sid>:* ids", () => {
    const merged: HandlingMap = {
      "student:42:rec": entry("handed_off"),
    };
    expect(pickHandlingForStudent(merged, 42)).toBe("handed_off");
  });

  it("returns the highest-severity state when several surfaces match", () => {
    const merged: HandlingMap = {
      "risk-row:42:1": entry("recovery_scheduled"),
      "student:42:rec": entry("under_review"),
      "risk-row:42:2": entry("resolved"),
    };
    // under_review (4) outranks recovery_scheduled (2) and resolved (1).
    expect(pickHandlingForStudent(merged, 42)).toBe("under_review");
  });

  it("ignores unrelated student ids", () => {
    const merged: HandlingMap = {
      "risk-row:1:1": entry("awaiting_confirmation"),
      "risk-row:2:1": entry("recovery_scheduled"),
    };
    expect(pickHandlingForStudent(merged, 2)).toBe("recovery_scheduled");
  });
});
