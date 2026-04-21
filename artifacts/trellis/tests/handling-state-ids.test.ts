/**
 * Phase 1E — canonical itemId helpers.
 *
 * These ids are the join key between every surface (Action Center,
 * student detail, Risk Report) and the server-side
 * `action_item_handling` table. If two surfaces produce different
 * strings for the "same" item, the shared pill stops working.
 */
import { describe, it, expect } from "vitest";
import {
  itemIdForAlert,
  itemIdForRisk,
  itemIdForDeadline,
  itemIdForServiceGap,
  itemIdForStudent,
  studentIdFromItemId,
} from "../src/lib/action-recommendations";
import { riskRowItemId } from "../src/lib/schedule-makeup";

describe("canonical action-item ids", () => {
  it("alert id encodes the alert pk", () => {
    expect(itemIdForAlert(42)).toBe("alert:42");
    expect(itemIdForAlert("abc")).toBe("alert:abc");
  });

  it("risk id encodes student + service requirement", () => {
    expect(itemIdForRisk(7, 31)).toBe("risk:7:31");
    expect(itemIdForRisk(7, null)).toBe("risk:7:none");
    expect(itemIdForRisk(7, undefined)).toBe("risk:7:none");
  });

  it("riskRowItemId stays in lockstep with itemIdForRisk", () => {
    // Both forms must produce identical strings or the Risk Report
    // pill won't share state with the Action Center pill.
    expect(riskRowItemId(7, 31)).toBe(itemIdForRisk(7, 31));
  });

  it("deadline id slugifies the event type", () => {
    expect(itemIdForDeadline(5, "iep_expiring")).toBe("deadline:5:iep-expiring");
    expect(itemIdForDeadline(5, "Re-Eval")).toBe("deadline:5:re-eval");
  });

  it("service-gap id encodes student + requirement", () => {
    expect(itemIdForServiceGap(2, 9)).toBe("service-gap:2:9");
    expect(itemIdForServiceGap(2, null)).toBe("service-gap:2:none");
  });

  it("student id encodes kind and optional requirement id", () => {
    expect(itemIdForStudent(11, "next-step")).toBe("student:11:next-step");
    expect(itemIdForStudent(11, "Next Step", 4)).toBe("student:11:next-step:4");
  });

  it("studentIdFromItemId extracts the student", () => {
    expect(studentIdFromItemId("risk:7:31")).toBe(7);
    expect(studentIdFromItemId("student:11:next-step")).toBe(11);
    expect(studentIdFromItemId("service-gap:2:none")).toBe(2);
    expect(studentIdFromItemId("deadline:5:iep-expiring")).toBe(5);
    expect(studentIdFromItemId("alert:42")).toBe(null);
  });
});
