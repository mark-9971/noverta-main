import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { isBlockActiveOnDate } from "../src/lib/scheduleUtils";
import {
  asUser,
  createDistrict,
  createSchool,
  createStaff,
  createStudent,
  cleanupDistrict,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";
import { db, scheduleBlocksTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// Anchor: 2024-01-01 is a Monday. weekOffset from this anchor:
//   2024-01-01 (Mon) → 0  on-week
//   2024-01-08 (Mon) → 1  off-week
//   2024-01-15 (Mon) → 2  on-week again
const ANCHOR = "2024-01-01";

function date(str: string): Date {
  return new Date(str + "T12:00:00");
}

const weeklyBlock   = { id: 1, isRecurring: true, recurrenceType: "weekly",   effectiveFrom: ANCHOR };
const biweeklyBlock = { id: 2, isRecurring: true, recurrenceType: "biweekly", effectiveFrom: ANCHOR };
const biweeklyNull  = { id: 3, isRecurring: true, recurrenceType: "biweekly", effectiveFrom: null };

describe("isBlockActiveOnDate — unit", () => {
  it("weekly block is always active (on-week date)", () => {
    expect(isBlockActiveOnDate(weeklyBlock, date("2024-01-01"))).toBe(true);
  });

  it("weekly block is always active (off-week date)", () => {
    expect(isBlockActiveOnDate(weeklyBlock, date("2024-01-08"))).toBe(true);
  });

  it("biweekly block is active on the on-week (offset 0)", () => {
    expect(isBlockActiveOnDate(biweeklyBlock, date("2024-01-01"))).toBe(true);
  });

  it("biweekly block is inactive on the off-week (offset 1)", () => {
    expect(isBlockActiveOnDate(biweeklyBlock, date("2024-01-08"))).toBe(false);
  });

  it("biweekly block is active again two weeks later (offset 2)", () => {
    expect(isBlockActiveOnDate(biweeklyBlock, date("2024-01-15"))).toBe(true);
  });

  it("biweekly with null effectiveFrom is active on on-week (fallback anchor → offset 0)", () => {
    expect(isBlockActiveOnDate(biweeklyNull, date("2024-01-01"))).toBe(true);
  });

  it("biweekly with null effectiveFrom is inactive on off-week (fallback anchor → offset 1)", () => {
    expect(isBlockActiveOnDate(biweeklyNull, date("2024-01-08"))).toBe(false);
  });
});

describe("GET /para/my-day — biweekly block filtering", () => {
  let districtId: number;
  let staffId: number;
  let blockId: number;

  const ON_WEEK_DATE  = "2024-01-01"; // offset 0 → visible
  const OFF_WEEK_DATE = "2024-01-08"; // offset 1 → hidden
  const TEST_USER_IDS = ["u-bw-on", "u-bw-off"];

  beforeAll(async () => {
    const district = await createDistrict();
    districtId = district.id;
    await seedLegalAcceptances(TEST_USER_IDS);
    const school = await createSchool(districtId);
    const staff = await createStaff(school.id, { role: "provider" });
    staffId = staff.id;
    await createStudent(school.id);
    const [block] = await db.insert(scheduleBlocksTable).values({
      staffId,
      dayOfWeek: "monday",
      startTime: "09:00",
      endTime: "09:30",
      isRecurring: true,
      recurrenceType: "biweekly",
      effectiveFrom: ANCHOR,
    }).returning();
    blockId = block.id;
  });

  afterAll(async () => {
    await db.delete(scheduleBlocksTable).where(eq(scheduleBlocksTable.id, blockId));
    await cleanupLegalAcceptances(TEST_USER_IDS);
    await cleanupDistrict(districtId);
  });

  it("block appears on the on-week date", async () => {
    const res = await asUser({ userId: "u-bw-on", role: "coordinator", districtId })
      .get(`/api/para/my-day?staffId=${staffId}&date=${ON_WEEK_DATE}`);
    expect(res.status).toBe(200);
    expect((res.body.blocks as { id: number }[]).map(b => b.id)).toContain(blockId);
  });

  it("block is absent on the off-week date", async () => {
    const res = await asUser({ userId: "u-bw-off", role: "coordinator", districtId })
      .get(`/api/para/my-day?staffId=${staffId}&date=${OFF_WEEK_DATE}`);
    expect(res.status).toBe(200);
    expect((res.body.blocks as { id: number }[]).map(b => b.id)).not.toContain(blockId);
  });
});
