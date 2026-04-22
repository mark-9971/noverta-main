/**
 * T04 — End-to-end POST /sessions integration test for the auto-resolve
 * side effect.
 *
 * Where the helper-only test (T04-auto-resolve-on-session.test.ts)
 * proves the inner contract, this test proves the route wiring:
 *   - The new `sourceActionItemId` field on CreateSessionBody is accepted.
 *   - It survives the zod parse + DB insert and lands on session_logs.
 *   - It triggers an auto-resolve transition for a privileged role
 *     (provider) on the normal (non-compensatory) insert branch.
 *   - It is GATED by role: a `para` calling the same endpoint with the
 *     same payload does NOT mutate the shared handling state — closing
 *     the architect-flagged authz bypass.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  db,
  actionItemHandlingTable,
  actionItemHandlingEventsTable,
  sessionLogsTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import {
  asUser,
  createDistrict,
  createSchool,
  createStaff,
  createStudent,
  createServiceType,
  cleanupDistrict,
  cleanupServiceType,
} from "./helpers";

let districtId: number;
let schoolId: number;
let serviceTypeId: number;
let providerStaffId: number;
let paraStaffId: number;
let studentId: number;

const ITEM_PROVIDER = "alert:t04-int-provider";
const ITEM_PARA = "alert:t04-int-para";
const insertedSessionIds: number[] = [];

beforeAll(async () => {
  const d = await createDistrict({ name: "T04 Sessions Integration" });
  districtId = d.id;
  const sc = await createSchool(districtId);
  schoolId = sc.id;
  const svc = await createServiceType();
  serviceTypeId = svc.id;
  const provider = await createStaff(schoolId, { role: "provider" });
  const para = await createStaff(schoolId, { role: "para" });
  providerStaffId = provider.id;
  paraStaffId = para.id;
  const st = await createStudent(schoolId);
  studentId = st.id;
});

afterAll(async () => {
  if (insertedSessionIds.length > 0) {
    await db.delete(sessionLogsTable).where(inArray(sessionLogsTable.id, insertedSessionIds));
  }
  await db.delete(actionItemHandlingEventsTable).where(
    inArray(actionItemHandlingEventsTable.itemId, [ITEM_PROVIDER, ITEM_PARA]),
  );
  await db.delete(actionItemHandlingTable).where(
    inArray(actionItemHandlingTable.itemId, [ITEM_PROVIDER, ITEM_PARA]),
  );
  await cleanupServiceType(serviceTypeId);
  await cleanupDistrict(districtId);
});

async function readRow(itemId: string) {
  const rows = await db
    .select()
    .from(actionItemHandlingTable)
    .where(
      and(
        eq(actionItemHandlingTable.districtId, districtId),
        eq(actionItemHandlingTable.itemId, itemId),
      ),
    );
  return rows[0] ?? null;
}

describe("T04 — POST /sessions integration", () => {
  it("provider role: completed session w/ sourceActionItemId triggers auto-resolve", async () => {
    const provider = asUser({ userId: "user_t04_int_provider", role: "provider", districtId });
    const res = await provider.post("/api/sessions").send({
      studentId,
      staffId: providerStaffId,
      serviceTypeId,
      sessionDate: "2026-04-15",
      durationMinutes: 30,
      status: "completed",
      isMakeup: true,
      sourceActionItemId: ITEM_PROVIDER,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTypeOf("number");
    expect(res.body.sourceActionItemId).toBe(ITEM_PROVIDER);
    insertedSessionIds.push(res.body.id);

    const row = await readRow(ITEM_PROVIDER);
    expect(row).not.toBeNull();
    expect(row!.state).toBe("resolved");
    expect(row!.updatedByUserId).toBe("user_t04_int_provider");
  });

  it("para role: same payload does NOT mutate shared handling state (authz gate)", async () => {
    const para = asUser({ userId: "user_t04_int_para", role: "para", districtId });
    const res = await para.post("/api/sessions").send({
      studentId,
      staffId: paraStaffId,
      serviceTypeId,
      sessionDate: "2026-04-16",
      durationMinutes: 30,
      status: "completed",
      isMakeup: true,
      sourceActionItemId: ITEM_PARA,
    });
    // The session itself should still land — paras are allowed to log
    // sessions. What we're proving is that the handling-state side
    // effect is gated separately.
    expect(res.status).toBe(201);
    expect(res.body.sourceActionItemId).toBe(ITEM_PARA);
    insertedSessionIds.push(res.body.id);

    const row = await readRow(ITEM_PARA);
    expect(row).toBeNull();
  });
});
