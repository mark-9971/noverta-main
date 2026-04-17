// Verifies that /minute-progress correctly aggregates delivered minutes from
// completed sessions only — missed sessions must not increase delivered.
// Strategy: snapshot baseline → insert known sessions → re-read → diff → cleanup.
import { req, Suite, DISTRICT_ID, TEST_MARKER, discoverFixtures, probeBypass } from "./_harness.mjs";

function readDelivered(progressBody, serviceReqId) {
  const list = progressBody?.progress || progressBody?.items || progressBody || [];
  const row = Array.isArray(list)
    ? list.find(p => p.serviceRequirementId === serviceReqId || p.id === serviceReqId)
    : null;
  if (!row) return null;
  return row.deliveredMinutes ?? row.minutesDelivered ?? null;
}

export async function run() {
  const s = new Suite("minute-aggregation");
  await probeBypass();
  const { student, serviceReq, staff } = await discoverFixtures();
  if (!serviceReq) {
    s.fail("setup: no service requirement — skipping aggregation test");
    return s.summary();
  }

  const before = await req("admin", DISTRICT_ID, "GET", `/minute-progress?studentId=${student.id}`);
  s.expectStatus("baseline /minute-progress", before, 200);
  const baseline = readDelivered(before.body, serviceReq.id);
  s.expect("baseline deliveredMinutes resolved", typeof baseline === "number", { body: before.body, serviceReqId: serviceReq.id });
  if (typeof baseline !== "number") return s.summary();

  const sessionDate = new Date().toISOString().slice(0, 10);
  const made = [];
  const tmpl = {
    studentId: student.id,
    serviceRequirementId: serviceReq.id,
    serviceTypeId: serviceReq.serviceTypeId,
    staffId: staff?.id ?? null,
    sessionDate,
    isMakeup: false,
    notes: TEST_MARKER,
  };

  try {
    // 3 completed sessions × 10 min = +30 delivered
    for (let i = 0; i < 3; i++) {
      const r = await req("admin", DISTRICT_ID, "POST", "/sessions", { ...tmpl, durationMinutes: 10, status: "completed" });
      const sid = r.body?.id ?? r.body?.session?.id;
      if (typeof sid === "number") made.push(sid);
    }
    // 1 missed × 25 min must NOT count
    const m = await req("admin", DISTRICT_ID, "POST", "/sessions", { ...tmpl, durationMinutes: 25, status: "missed" });
    const msid = m.body?.id ?? m.body?.session?.id;
    if (typeof msid === "number") made.push(msid);

    s.expect("created 4 test sessions", made.length === 4, { madeCount: made.length });

    const after = await req("admin", DISTRICT_ID, "GET", `/minute-progress?studentId=${student.id}`);
    s.expectStatus("post-insert /minute-progress", after, 200);
    const post = readDelivered(after.body, serviceReq.id);
    s.expect("post-insert deliveredMinutes resolved", typeof post === "number", after.body);

    if (typeof post === "number") {
      s.expect(
        `delivered increased by exactly 30 (3×10 completed; missed excluded). before=${baseline} after=${post}`,
        post - baseline === 30,
        { delta: post - baseline, baseline, post },
      );
    }

    // Delete-subtraction (revenue-critical, FIXED in W1 task #214 by adding
    // isNull(sessionLogsTable.deletedAt) to the minuteCalc.ts aggregation queries):
    // a deleted session must NOT continue to count toward delivered minutes.
    // Otherwise duplicate/erroneous sessions that admins delete would still
    // inflate billed minutes.
    if (made.length > 0) {
      const toDelete = made.shift();
      const del = await req("admin", DISTRICT_ID, "DELETE", `/sessions/${toDelete}`);
      s.expect("DELETE one completed session succeeded", del.status >= 200 && del.status < 300,
        { status: del.status, body: del.body });
      const afterDel = await req("admin", DISTRICT_ID, "GET", `/minute-progress?studentId=${student.id}`);
      const afterDelMin = readDelivered(afterDel.body, serviceReq.id);
      if (typeof afterDelMin === "number") {
        s.expect(
          `deleting one 10-min completed session subtracted 10. post=${post} afterDel=${afterDelMin}`,
          post - afterDelMin === 10,
          { delta: post - afterDelMin, post, afterDelMin },
        );
      }
    }
  } finally {
    for (const id of made) {
      await req("admin", DISTRICT_ID, "DELETE", `/sessions/${id}`);
    }
  }

  return s.summary();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(r => process.exit(r.failed ? 1 : 0));
}
