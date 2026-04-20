/**
 * School Calendar v0 — Slice 3 (trust/explanation layer)
 *
 * HTTP-level coverage for GET /schedules/today/exception, the sibling
 * endpoint that surfaces day-level school-calendar metadata
 * (type/reason/dismissalTime) so the Today view can render an
 * explanatory banner without re-querying school_calendar_exceptions
 * from the UI.
 *
 * The flat-array contract on /schedules/today is intentionally
 * preserved; this endpoint is purely additive.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import {
  app,
  createDistrict,
  createSchool,
  createStaff,
  cleanupDistrict,
  seedLegalAcceptances,
  cleanupLegalAcceptances,
} from "./helpers";
import { db, schoolCalendarExceptionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const TEST_USER = "u_today_exception_provider";

function isoDateToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dy}`;
}

describe("GET /schedules/today/exception", () => {
  let districtId: number;
  let schoolId: number;
  let staffId: number;
  const todayStr = isoDateToday();

  beforeAll(async () => {
    const d = await createDistrict({ name: "Today Exception District" });
    districtId = d.id;
    const s = await createSchool(districtId, { name: "Today Exception School" });
    schoolId = s.id;
    const staff = await createStaff(schoolId, {
      firstName: "Ex", lastName: "Provider", role: "service_provider",
    });
    staffId = staff.id;
    await seedLegalAcceptances([TEST_USER]);
  });

  afterAll(async () => {
    await db.delete(schoolCalendarExceptionsTable)
      .where(eq(schoolCalendarExceptionsTable.schoolId, schoolId));
    await cleanupDistrict(districtId);
    await cleanupLegalAcceptances([TEST_USER]);
  });

  function req() {
    return request(app)
      .get("/api/schedules/today/exception")
      .set("x-test-user-id", TEST_USER)
      .set("x-test-role", "provider")
      .set("x-test-district-id", String(districtId))
      .set("x-test-staff-id", String(staffId));
  }

  it("returns null when there is no exception today", async () => {
    await db.delete(schoolCalendarExceptionsTable)
      .where(eq(schoolCalendarExceptionsTable.schoolId, schoolId));
    const res = await req();
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("returns closure metadata (type, reason, no dismissalTime) on a closure day", async () => {
    await db.delete(schoolCalendarExceptionsTable)
      .where(eq(schoolCalendarExceptionsTable.schoolId, schoolId));
    await db.insert(schoolCalendarExceptionsTable).values({
      schoolId, exceptionDate: todayStr, type: "closure",
      reason: "Snow day", dismissalTime: null,
    });

    const res = await req();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      type: "closure",
      reason: "Snow day",
      dismissalTime: null,
      date: todayStr,
    });
  });

  it("returns early-release metadata (type, reason, dismissalTime) on an early-release day", async () => {
    await db.delete(schoolCalendarExceptionsTable)
      .where(eq(schoolCalendarExceptionsTable.schoolId, schoolId));
    await db.insert(schoolCalendarExceptionsTable).values({
      schoolId, exceptionDate: todayStr, type: "early_release",
      reason: "PD half day", dismissalTime: "12:00",
    });

    const res = await req();
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("early_release");
    expect(res.body.reason).toBe("PD half day");
    expect(res.body.dismissalTime).toBe("12:00");
    expect(res.body.date).toBe(todayStr);
  });
});
