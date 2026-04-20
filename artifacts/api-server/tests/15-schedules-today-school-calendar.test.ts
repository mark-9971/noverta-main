/**
 * School Calendar v0 — Slice 2 cleanup
 *
 * HTTP-level coverage for GET /schedules/today proving that the route
 * honors per-school calendar exceptions:
 *   - closure  → every block becomes status="closed", durationMinutes=0
 *   - early    → blocks fully after dismissal become status="closed",
 *     release    a block straddling dismissal becomes "early_release"
 *                with durationMinutes prorated to the pre-dismissal
 *                portion, and a block fully before dismissal keeps a
 *                non-exception status (logged/in_progress/missed/upcoming).
 *
 * The lib-level math is already covered by
 * 15-school-calendar-read-integration.test.ts; this file proves the
 * route emits the new status values to HTTP clients without breaking
 * the existing flat-array contract.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import {
  app,
  createDistrict,
  createSchool,
  createStaff,
  createStudent,
  cleanupDistrict,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";
import { db, scheduleBlocksTable, schoolCalendarExceptionsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const TEST_USER = "u_today_calendar_provider";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function isoDateToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}

describe("GET /schedules/today honors school calendar exceptions", () => {
  let districtId: number;
  let schoolId: number;
  let staffId: number;
  let studentId: number;
  const insertedBlockIds: number[] = [];
  const todayStr = isoDateToday();
  const todayDayName = DAY_NAMES[new Date().getDay()];

  // Three recurring blocks. With dismissal=12:00 these exercise all
  // three early-release branches in the route:
  //   morning  — 08:00–09:00 → fully before dismissal
  //   straddle — 11:00–12:30 → crosses dismissal (effective 60 min)
  //   afternoon— 14:00–15:00 → fully after dismissal
  let morningBlockId: number;
  let straddleBlockId: number;
  let afternoonBlockId: number;

  beforeAll(async () => {
    const d = await createDistrict({ name: "Today Calendar District" });
    districtId = d.id;
    const s = await createSchool(districtId, { name: "Today Calendar School" });
    schoolId = s.id;
    const staff = await createStaff(schoolId, {
      firstName: "Today", lastName: "Provider", role: "service_provider",
    });
    staffId = staff.id;
    const student = await createStudent(schoolId, { firstName: "Cal", lastName: "Student" });
    studentId = student.id;

    await seedLegalAcceptances([TEST_USER]);

    const [m] = await db.insert(scheduleBlocksTable).values({
      staffId, studentId, blockType: "service",
      dayOfWeek: todayDayName, startTime: "08:00:00", endTime: "09:00:00",
      isRecurring: true, recurrenceType: "weekly", location: "Room A",
    }).returning();
    morningBlockId = m.id;
    insertedBlockIds.push(m.id);

    const [st] = await db.insert(scheduleBlocksTable).values({
      staffId, studentId, blockType: "service",
      dayOfWeek: todayDayName, startTime: "11:00:00", endTime: "12:30:00",
      isRecurring: true, recurrenceType: "weekly", location: "Room B",
    }).returning();
    straddleBlockId = st.id;
    insertedBlockIds.push(st.id);

    const [a] = await db.insert(scheduleBlocksTable).values({
      staffId, studentId, blockType: "service",
      dayOfWeek: todayDayName, startTime: "14:00:00", endTime: "15:00:00",
      isRecurring: true, recurrenceType: "weekly", location: "Room C",
    }).returning();
    afternoonBlockId = a.id;
    insertedBlockIds.push(a.id);
  });

  afterAll(async () => {
    await db.delete(schoolCalendarExceptionsTable)
      .where(eq(schoolCalendarExceptionsTable.schoolId, schoolId));
    await db.delete(scheduleBlocksTable)
      .where(inArray(scheduleBlocksTable.id, insertedBlockIds));
    await cleanupDistrict(districtId);
    await cleanupLegalAcceptances([TEST_USER]);
  });

  function req() {
    return request(app)
      .get("/api/schedules/today")
      .set("x-test-user-id", TEST_USER)
      .set("x-test-role", "provider")
      .set("x-test-district-id", String(districtId))
      .set("x-test-staff-id", String(staffId));
  }

  it("closure day → every block is status='closed' with durationMinutes=0", async () => {
    await db.delete(schoolCalendarExceptionsTable)
      .where(eq(schoolCalendarExceptionsTable.schoolId, schoolId));
    await db.insert(schoolCalendarExceptionsTable).values({
      schoolId, exceptionDate: todayStr, type: "closure",
      reason: "Snow day", dismissalTime: null,
    });

    const res = await req();
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const byId: Record<number, { status: string; durationMinutes: number }> = {};
    for (const b of res.body) byId[b.id] = { status: b.status, durationMinutes: b.durationMinutes };

    expect(byId[morningBlockId].status).toBe("closed");
    expect(byId[morningBlockId].durationMinutes).toBe(0);
    expect(byId[straddleBlockId].status).toBe("closed");
    expect(byId[straddleBlockId].durationMinutes).toBe(0);
    expect(byId[afternoonBlockId].status).toBe("closed");
    expect(byId[afternoonBlockId].durationMinutes).toBe(0);
  });

  it("early-release day → straddler='early_release' (pre-dismissal mins), post-dismissal='closed', pre-dismissal block keeps non-exception status", async () => {
    await db.delete(schoolCalendarExceptionsTable)
      .where(eq(schoolCalendarExceptionsTable.schoolId, schoolId));
    await db.insert(schoolCalendarExceptionsTable).values({
      schoolId, exceptionDate: todayStr, type: "early_release",
      reason: "PD half day", dismissalTime: "12:00",
    });

    const res = await req();
    expect(res.status).toBe(200);
    const byId: Record<number, { status: string; durationMinutes: number }> = {};
    for (const b of res.body) byId[b.id] = { status: b.status, durationMinutes: b.durationMinutes };

    // Morning block (08–09) ends well before noon dismissal → not flipped
    // by the exception path. Its concrete status (in_progress/missed/
    // upcoming) is wall-clock dependent in CI, so we only assert it is
    // NOT one of the new exception statuses and the duration is intact.
    expect(["logged", "in_progress", "missed", "upcoming"]).toContain(byId[morningBlockId].status);
    expect(byId[morningBlockId].durationMinutes).toBe(60);

    // Straddler (11:00–12:30) → early_release with the pre-dismissal
    // chunk only: 12:00 - 11:00 = 60 minutes.
    expect(byId[straddleBlockId].status).toBe("early_release");
    expect(byId[straddleBlockId].durationMinutes).toBe(60);

    // Afternoon (14:00–15:00) starts after dismissal → closed, 0 minutes.
    expect(byId[afternoonBlockId].status).toBe("closed");
    expect(byId[afternoonBlockId].durationMinutes).toBe(0);
  });
});
