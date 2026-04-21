// T03 — minute-math bucket honesty.
// Verifies the pure pending-makeup reducer that backs the new
// scheduledPendingMinutes / pendingMakeupBlocksCount / stillAtRiskMinutes
// buckets in MinuteProgressResult. These tests intentionally bypass the
// DB so the math contract can be asserted in isolation from session_logs
// joins, school-calendar weighting, etc.

import { describe, it, expect } from "vitest";
import {
  reducePendingMakeupMinutes,
  blockDurationMinutes,
  blockOverlapsInterval,
  type PendingMakeupBlock,
} from "../src/lib/minuteCalc";

const STUDENT = 42;
const SVC_TYPE = 19;

// A canonical "this month" interval used by the per-req suppression checks.
const IVL_START = "2026-04-01";
const IVL_END = "2026-04-30";

const block = (overrides: Partial<PendingMakeupBlock> = {}): PendingMakeupBlock => ({
  studentId: STUDENT,
  serviceTypeId: SVC_TYPE,
  sourceActionItemId: "alert:t03",
  startTime: "09:00",
  endTime: "09:30",
  // Default to "in this month's window" so legacy assertions remain meaningful.
  weekOf: "2026-04-15",
  effectiveFrom: null,
  effectiveTo: null,
  ...overrides,
});

describe("blockDurationMinutes", () => {
  it("computes minutes from HH:MM start/end", () => {
    expect(blockDurationMinutes("09:00", "09:30")).toBe(30);
    expect(blockDurationMinutes("13:15", "14:00")).toBe(45);
  });
  it("returns 0 for malformed or inverted ranges", () => {
    expect(blockDurationMinutes("10:00", "09:00")).toBe(0);
    expect(blockDurationMinutes("", "")).toBe(0);
  });
});

describe("blockOverlapsInterval", () => {
  it("uses weekOf for one-shot makeups", () => {
    expect(blockOverlapsInterval({ weekOf: "2026-04-15", effectiveFrom: null, effectiveTo: null }, IVL_START, IVL_END)).toBe(true);
    expect(blockOverlapsInterval({ weekOf: "2026-03-31", effectiveFrom: null, effectiveTo: null }, IVL_START, IVL_END)).toBe(false);
    expect(blockOverlapsInterval({ weekOf: "2026-05-01", effectiveFrom: null, effectiveTo: null }, IVL_START, IVL_END)).toBe(false);
  });
  it("falls back to effectiveFrom/effectiveTo envelope when weekOf is null", () => {
    expect(blockOverlapsInterval({ weekOf: null, effectiveFrom: "2026-04-10", effectiveTo: "2026-04-20" }, IVL_START, IVL_END)).toBe(true);
    expect(blockOverlapsInterval({ weekOf: null, effectiveFrom: "2026-05-01", effectiveTo: null }, IVL_START, IVL_END)).toBe(false);
    expect(blockOverlapsInterval({ weekOf: null, effectiveFrom: null, effectiveTo: "2026-03-31" }, IVL_START, IVL_END)).toBe(false);
  });
  it("untimed blocks (no weekOf, no effective dates) are NOT counted", () => {
    expect(blockOverlapsInterval({ weekOf: null, effectiveFrom: null, effectiveTo: null }, IVL_START, IVL_END)).toBe(false);
  });
});

describe("reducePendingMakeupMinutes", () => {
  it("scenario A — no makeup scheduled → zero pending", () => {
    const r = reducePendingMakeupMinutes([], new Set(), STUDENT, SVC_TYPE, IVL_START, IVL_END);
    expect(r).toEqual({ minutes: 0, count: 0 });
  });

  it("scenario B — makeup scheduled but not delivered → counted as pending", () => {
    const blocks = [
      block({ sourceActionItemId: "alert:101", startTime: "09:00", endTime: "09:30" }),
      block({ sourceActionItemId: "alert:102", startTime: "10:00", endTime: "11:00" }),
    ];
    const r = reducePendingMakeupMinutes(blocks, new Set(), STUDENT, SVC_TYPE, IVL_START, IVL_END);
    expect(r).toEqual({ minutes: 90, count: 2 });
  });

  it("scenario C — makeup delivered (linked session_log carries same source_action_item_id) → NOT counted", () => {
    const blocks = [
      block({ sourceActionItemId: "alert:101", startTime: "09:00", endTime: "09:30" }),
      block({ sourceActionItemId: "alert:102", startTime: "10:00", endTime: "11:00" }),
    ];
    // alert:101 was logged → drops out of pending; alert:102 still pending.
    const delivered = new Set(["alert:101"]);
    const r = reducePendingMakeupMinutes(blocks, delivered, STUDENT, SVC_TYPE, IVL_START, IVL_END);
    expect(r).toEqual({ minutes: 60, count: 1 });
  });

  it("no-double-counting — a single deep-link block never contributes minutes twice", () => {
    const blocks = [
      block({ sourceActionItemId: "alert:101", startTime: "09:00", endTime: "09:45" }),
    ];
    const deliveredEmpty = reducePendingMakeupMinutes(blocks, new Set(), STUDENT, SVC_TYPE, IVL_START, IVL_END);
    expect(deliveredEmpty).toEqual({ minutes: 45, count: 1 });

    const deliveredFull = reducePendingMakeupMinutes(blocks, new Set(["alert:101"]), STUDENT, SVC_TYPE, IVL_START, IVL_END);
    expect(deliveredFull).toEqual({ minutes: 0, count: 0 });

    expect(deliveredEmpty.minutes + 0).toBe(45);
    expect(deliveredFull.minutes + 45).toBe(45);
  });

  it("excludes blocks without source_action_item_id (hand-entered makeups never count as wedge intent)", () => {
    const blocks = [
      block({ sourceActionItemId: null, startTime: "09:00", endTime: "10:00" }),
      block({ sourceActionItemId: "", startTime: "11:00", endTime: "12:00" }),
      block({ sourceActionItemId: "alert:7", startTime: "13:00", endTime: "13:30" }),
    ];
    const r = reducePendingMakeupMinutes(blocks, new Set(), STUDENT, SVC_TYPE, IVL_START, IVL_END);
    expect(r).toEqual({ minutes: 30, count: 1 });
  });

  it("scopes pending to (studentId, serviceTypeId) — other students/services don't bleed in", () => {
    const blocks = [
      block({ studentId: 99, sourceActionItemId: "alert:other-student" }),
      block({ serviceTypeId: 77, sourceActionItemId: "alert:other-svc" }),
      block({ sourceActionItemId: "alert:mine", startTime: "09:00", endTime: "09:30" }),
    ];
    const r = reducePendingMakeupMinutes(blocks, new Set(), STUDENT, SVC_TYPE, IVL_START, IVL_END);
    expect(r).toEqual({ minutes: 30, count: 1 });
  });

  it("zero-duration / inverted blocks contribute neither minutes nor count", () => {
    const blocks = [
      block({ sourceActionItemId: "alert:zero", startTime: "09:00", endTime: "09:00" }),
      block({ sourceActionItemId: "alert:neg", startTime: "10:00", endTime: "09:00" }),
      block({ sourceActionItemId: "alert:ok", startTime: "11:00", endTime: "11:30" }),
    ];
    const r = reducePendingMakeupMinutes(blocks, new Set(), STUDENT, SVC_TYPE, IVL_START, IVL_END);
    expect(r).toEqual({ minutes: 30, count: 1 });
  });

  it("interval window — blocks outside the requirement's interval do NOT count (architect fix)", () => {
    // Same student/service, but a Jan block must not appear in April's
    // pending bucket. This is the exact regression the architect flagged.
    const blocks = [
      block({ sourceActionItemId: "alert:jan", weekOf: "2026-01-15", startTime: "09:00", endTime: "10:00" }),
      block({ sourceActionItemId: "alert:may", weekOf: "2026-05-01", startTime: "09:00", endTime: "10:00" }),
      block({ sourceActionItemId: "alert:apr", weekOf: "2026-04-22", startTime: "09:00", endTime: "09:30" }),
    ];
    const r = reducePendingMakeupMinutes(blocks, new Set(), STUDENT, SVC_TYPE, IVL_START, IVL_END);
    expect(r).toEqual({ minutes: 30, count: 1 });
  });

  it("interval window — recurring (effective_from/to) blocks count when their envelope overlaps", () => {
    const blocks = [
      block({ sourceActionItemId: "alert:r1", weekOf: null, effectiveFrom: "2026-04-10", effectiveTo: "2026-04-30", startTime: "09:00", endTime: "10:00" }),
      block({ sourceActionItemId: "alert:r2", weekOf: null, effectiveFrom: "2026-05-01", effectiveTo: null, startTime: "09:00", endTime: "10:00" }),
    ];
    const r = reducePendingMakeupMinutes(blocks, new Set(), STUDENT, SVC_TYPE, IVL_START, IVL_END);
    expect(r).toEqual({ minutes: 60, count: 1 });
  });

  it("stillAtRisk identity — required - delivered - pending, never below zero", () => {
    const required = 240;
    const delivered = 90;
    const pending = reducePendingMakeupMinutes(
      [
        block({ sourceActionItemId: "alert:1", startTime: "09:00", endTime: "10:00" }),
        block({ sourceActionItemId: "alert:2", startTime: "10:00", endTime: "10:30" }),
      ],
      new Set(),
      STUDENT,
      SVC_TYPE,
      IVL_START,
      IVL_END,
    );
    const stillAtRisk = Math.max(0, required - delivered - pending.minutes);
    expect(pending).toEqual({ minutes: 90, count: 2 });
    expect(stillAtRisk).toBe(60);

    const overDelivered = Math.max(0, required - 999 - pending.minutes);
    expect(overDelivered).toBe(0);
  });
});
