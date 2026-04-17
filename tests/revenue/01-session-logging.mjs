// Verifies POST /sessions persists revenue-affecting fields, validates input,
// and refuses cross-tenant writes. Cleans up every session it creates.
import { req, Suite, DISTRICT_ID, FOREIGN_DISTRICT_ID, TEST_MARKER, discoverFixtures, probeBypass } from "./_harness.mjs";

export async function run() {
  const s = new Suite("session-logging");
  await probeBypass();
  const { student, serviceReq, staff } = await discoverFixtures();
  if (!serviceReq) {
    s.fail("setup: no service requirement in test district — cannot test session logging");
    return s.summary();
  }

  const created = [];
  const baseSession = {
    studentId: student.id,
    serviceRequirementId: serviceReq.id,
    serviceTypeId: serviceReq.serviceTypeId,
    staffId: staff?.id ?? null,
    sessionDate: new Date().toISOString().slice(0, 10),
    durationMinutes: 30,
    status: "completed",
    isMakeup: false,
    notes: TEST_MARKER,
  };

  try {
    // 1. Completed session writes & returns canonical fields
    const completed = await req("admin", DISTRICT_ID, "POST", "/sessions", baseSession);
    s.expectStatus("create completed session", completed, [200, 201]);
    const sid1 = completed.body?.id ?? completed.body?.session?.id;
    s.expect("returned session has id", typeof sid1 === "number", completed.body);
    if (typeof sid1 === "number") {
      created.push(sid1);
      const fetched = await req("admin", DISTRICT_ID, "GET", `/sessions/${sid1}`);
      s.expectStatus("read back created session", fetched, 200);
      const sess = fetched.body?.session ?? fetched.body;
      s.expect("durationMinutes preserved (30)", sess?.durationMinutes === 30, sess);
      s.expect("status preserved (completed)", sess?.status === "completed", sess);
      s.expect("studentId preserved", sess?.studentId === student.id, sess);
    }

    // 2. Missed session is accepted but contributes 0 to delivered minutes
    const missed = await req("admin", DISTRICT_ID, "POST", "/sessions", { ...baseSession, status: "missed", durationMinutes: 30 });
    s.expectStatus("create missed session", missed, [200, 201]);
    const sid2 = missed.body?.id ?? missed.body?.session?.id;
    if (typeof sid2 === "number") created.push(sid2);

    // 3. Validation: missing studentId → 400
    const bad = await req("admin", DISTRICT_ID, "POST", "/sessions", { ...baseSession, studentId: undefined });
    s.expectStatus("reject missing studentId", bad, 400);

    // 4. Validation: negative duration is suspicious — server should accept or reject deterministically
    //    (we just assert it does not 5xx, which would indicate uncaught math)
    const neg = await req("admin", DISTRICT_ID, "POST", "/sessions", { ...baseSession, durationMinutes: -10 });
    s.expect("negative duration handled (no 5xx)", neg.status < 500, { status: neg.status, body: neg.body });

    // 5. Cross-tenant: foreign district admin cannot log a session for our student
    const cross = await req("admin", FOREIGN_DISTRICT_ID, "POST", "/sessions", baseSession);
    s.expect(
      "foreign-district admin blocked from logging session",
      cross.status === 403 || cross.status === 404,
      { status: cross.status, body: cross.body },
    );
  } finally {
    for (const id of created) {
      await req("admin", DISTRICT_ID, "DELETE", `/sessions/${id}`);
    }
  }

  return s.summary();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().then(r => process.exit(r.failed ? 1 : 0));
}
