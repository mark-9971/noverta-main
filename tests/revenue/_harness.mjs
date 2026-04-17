const BASE = process.env.API_BASE || "http://localhost:8080/api";

// District 4 (MetroWest Collaborative) is the demo-populated district in the
// dev DB. Override via TEST_DISTRICT_ID for other environments.
export const DISTRICT_ID = Number(process.env.TEST_DISTRICT_ID || 4);
export const FOREIGN_DISTRICT_ID = Number(process.env.TEST_FOREIGN_DISTRICT_ID || 99);
export const TEST_MARKER = `__REVENUE_TEST__${process.pid}`;

export async function req(role, districtId, method, path, body, extraHeaders = {}) {
  const headers = {
    "content-type": "application/json",
    ...extraHeaders,
  };
  if (role !== null) {
    headers["x-test-user-id"] = `revenue-test-${role}`;
    headers["x-test-role"] = role;
  }
  if (districtId !== null) {
    headers["x-test-district-id"] = String(districtId);
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = { _raw: text }; }
  return { status: res.status, body: json };
}

export class Suite {
  constructor(name) {
    this.name = name;
    this.results = [];
  }
  pass(label) { this.results.push({ ok: true, label }); console.log(`  ✓ ${label}`); }
  fail(label, detail) {
    this.results.push({ ok: false, label, detail });
    console.log(`  ✗ ${label}`);
    if (detail !== undefined) console.log(`      ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  expect(label, cond, detail) { cond ? this.pass(label) : this.fail(label, detail); }
  expectStatus(label, response, expected) {
    const ok = Array.isArray(expected) ? expected.includes(response.status) : response.status === expected;
    this.expect(`${label} → status ${expected}`, ok, ok ? undefined : { got: response.status, body: response.body });
  }
  expectClose(label, actual, expected, tol = 0.01) {
    const ok = typeof actual === "number" && Math.abs(actual - expected) <= tol;
    this.expect(`${label} (≈ ${expected})`, ok, ok ? undefined : { actual, expected, tol });
  }
  summary() {
    const passed = this.results.filter(r => r.ok).length;
    const failed = this.results.length - passed;
    console.log(`\n[${this.name}] ${passed} passed, ${failed} failed (${this.results.length} total)\n`);
    return { name: this.name, passed, failed, total: this.results.length, failures: this.results.filter(r => !r.ok) };
  }
}

export async function discoverFixtures() {
  const studentsRes = await req("admin", DISTRICT_ID, "GET", "/students?limit=50");
  if (studentsRes.status !== 200) throw new Error(`Cannot list students: ${studentsRes.status}`);
  const students = (studentsRes.body?.students || studentsRes.body || []);
  const student = students.find(s => s.status === "active") || students[0];
  if (!student) throw new Error("No students in test district");

  const reqsRes = await req("admin", DISTRICT_ID, "GET", `/service-requirements?studentId=${student.id}`);
  const reqs = reqsRes.body?.serviceRequirements || reqsRes.body || [];
  const serviceReq = reqs[0];

  const staffRes = await req("admin", DISTRICT_ID, "GET", "/staff?limit=20");
  const staff = (staffRes.body?.staff || staffRes.body || []).find(s => s.role !== "admin") || (staffRes.body?.staff || staffRes.body || [])[0];

  return { student, serviceReq, staff };
}

export async function probeBypass() {
  const r = await req("admin", DISTRICT_ID, "GET", "/students?limit=1");
  if (r.status === 401) {
    console.error("\n✗ x-test-* auth bypass not active. Start the API server with NODE_ENV=test.\n");
    process.exit(2);
  }
}
