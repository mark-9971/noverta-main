/**
 * V2 persistence (W4) — pure payload builder tests.
 *
 * Validates the bridge from W3 simulator outputs to operational table
 * row arrays WITHOUT touching a database. Locks:
 *   - shape (counts match simulator outputs minus orphans)
 *   - determinism (same simulation + mapping → byte-identical payload)
 *   - no-cheating invariants (alerts/comp/sessions only originate from
 *     simulator events; never fabricated)
 *   - mapping orphan handling (drops, never invents)
 *   - golden hash so any silent drift fails loudly
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  buildStudentDefs,
  resolveSeedShape,
} from "@workspace/db/v2/domain";
import { setSeed } from "@workspace/db/v2/platform";
import { runSimulation, type SimulationResult } from "@workspace/db/v2/simulator";
import {
  buildPersistencePayload,
  classifyServiceTypeName,
  type PersistenceMapping,
  type MappedStudent,
} from "@workspace/db/v2/persistence";

const FIXED_EPOCH = "2024-09-02";
const SYSTEM_USER = "system:test";
const SYSTEM_NAME = "Test Runner";

function simulateSmall(districtId = 4242): SimulationResult {
  setSeed(districtId);
  const defs = buildStudentDefs("small", 5);
  const shape = resolveSeedShape({ sizeProfile: "small" });
  return runSimulation({ districtId, studentDefs: defs, shape, epochDate: FIXED_EPOCH });
}

/**
 * Build a synthetic mapping that matches the simulator's per-student
 * service plan exactly. Allocates dense fake DB ids so payload rows
 * are well-formed and orphan counts stay at zero.
 */
function mappingFromSimulation(simulation: SimulationResult): PersistenceMapping {
  const students: MappedStudent[] = simulation.studentScenarios.map((s, idx) => ({
    studentDefIdx: s.studentDefIdx,
    studentId: 1000 + idx,
    services: s.services.map((key, sIdx) => ({
      serviceIdx: sIdx,
      serviceKey: key,
      serviceRequirementId: 5000 + idx * 10 + sIdx,
      serviceTypeId: 200 + sIdx,
      providerStaffId: 800 + sIdx,
      requiredMinutes: 120,
    })),
  }));
  return {
    districtId: 4242,
    schoolYearId: 99,
    defaultStaffId: 800,
    students,
  };
}

describe("v2/persistence — buildPersistencePayload", () => {
  const sim = simulateSmall();
  const mapping = mappingFromSimulation(sim);
  const payload = buildPersistencePayload({
    simulation: sim, mapping, systemUserId: SYSTEM_USER, systemUserName: SYSTEM_NAME,
  });

  it("emits 1:1 row arrays for sessions, alerts, comp, makeup blocks", () => {
    expect(payload.counts.sessions).toBe(sim.sessions.length);
    expect(payload.counts.alerts).toBe(sim.alerts.length);
    expect(payload.counts.compObligations).toBe(sim.compEvents.length);
    expect(payload.counts.scheduleBlocks).toBe(sim.makeupBlocks.length);
    expect(payload.counts.handlingEvents).toBe(sim.handlingEvents.length);
    // No orphans when the mapping mirrors the simulator's plan exactly.
    expect(payload.counts.orphanedRefs).toEqual({
      sessions: 0, alerts: 0, compObligations: 0, scheduleBlocks: 0, handlingEvents: 0,
    });
  });

  it("aligns alertRefs[] with alerts[] (same length, same order)", () => {
    expect(payload.alertRefs.length).toBe(payload.alerts.length);
    // Every ref looks like the simulator's alertId format.
    for (const ref of payload.alertRefs) {
      expect(ref).toMatch(/^d\d+\|(behind|missed)\|/);
    }
  });

  it("session rows preserve simulator status/duration verbatim (no-cheating)", () => {
    const completedSim = sim.sessions.filter((s) => s.status === "completed").length;
    const completedRow = payload.sessions.filter((r) => r.status === "completed").length;
    expect(completedRow).toBe(completedSim);

    const totalMinSim = sim.sessions.reduce((a, s) => a + s.durationMinutes, 0);
    const totalMinRow = payload.sessions.reduce((a, r) => a + (r.durationMinutes ?? 0), 0);
    expect(totalMinRow).toBe(totalMinSim);
  });

  it("comp obligation minutesOwed equals simulator shortfallMinutes (no widening)", () => {
    const sumSim = sim.compEvents.reduce((a, c) => a + c.shortfallMinutes, 0);
    const sumRow = payload.compObligations.reduce((a, r) => a + r.minutesOwed, 0);
    expect(sumRow).toBe(sumSim);
  });

  it("makeup schedule_blocks tagged with sourceActionItemId pointing at simulator alertRef", () => {
    for (const b of payload.scheduleBlocks) {
      expect(b.blockType).toBe("makeup");
      expect(b.sourceActionItemId).toMatch(/^d\d+\|(behind|missed)\|/);
    }
  });

  it("handling state collapses to one row per simulator alert (latest event wins)", () => {
    const refsWithEvents = new Set(sim.handlingEvents.map((e) => e.alertRef));
    expect(payload.handlingState.length).toBe(refsWithEvents.size);
    // Resolved-state rows carry resolvedAt; others are null.
    const resolvedRows = payload.handlingState.filter((r) => r.state === "resolved");
    for (const r of resolvedRows) expect(r.resolvedAt).toBeInstanceOf(Date);
    const nonResolved = payload.handlingState.filter((r) => r.state !== "resolved");
    for (const r of nonResolved) expect(r.resolvedAt).toBeNull();
  });

  it("is deterministic — same simulation + mapping → byte-identical payload", () => {
    const a = buildPersistencePayload({ simulation: sim, mapping, systemUserId: SYSTEM_USER, systemUserName: SYSTEM_NAME });
    const b = buildPersistencePayload({ simulation: sim, mapping, systemUserId: SYSTEM_USER, systemUserName: SYSTEM_NAME });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("counts orphans (never fabricates) when mapping omits a student", () => {
    const truncated: PersistenceMapping = { ...mapping, students: mapping.students.slice(0, 1) };
    const p = buildPersistencePayload({ simulation: sim, mapping: truncated, systemUserId: SYSTEM_USER, systemUserName: SYSTEM_NAME });
    // Fewer rows than the simulator emitted; the gap shows up as orphans.
    expect(p.counts.sessions).toBeLessThan(sim.sessions.length);
    const totalOrphaned = p.counts.orphanedRefs.sessions
      + p.counts.orphanedRefs.alerts
      + p.counts.orphanedRefs.compObligations
      + p.counts.orphanedRefs.scheduleBlocks
      + p.counts.orphanedRefs.handlingEvents;
    expect(totalOrphaned).toBeGreaterThan(0);
    // No fabrication: row count + orphan count equals simulator total.
    expect(p.counts.sessions + p.counts.orphanedRefs.sessions).toBe(sim.sessions.length);
  });

  it("orphans (does NOT misroute) when serviceIdx is out of range for the resolved key", () => {
    // Replace one student's services with a single slot of the wrong
    // serviceKey so any simulator event for that student that targets
    // a different key — or even the same key at idx > 0 — orphans
    // rather than silently landing on the only available slot.
    const tampered: PersistenceMapping = {
      ...mapping,
      students: mapping.students.map((s, i) => i === 0
        ? { ...s, services: [{ ...s.services[0], serviceIdx: 0, serviceKey: "pt" }] }
        : s),
    };
    const p = buildPersistencePayload({
      simulation: sim, mapping: tampered, systemUserId: SYSTEM_USER, systemUserName: SYSTEM_NAME,
    });
    // Strict total: persisted + orphaned == simulator emitted. No fab.
    expect(p.counts.sessions + p.counts.orphanedRefs.sessions).toBe(sim.sessions.length);
    expect(p.counts.alerts + p.counts.orphanedRefs.alerts).toBe(sim.alerts.length);
    expect(p.counts.compObligations + p.counts.orphanedRefs.compObligations).toBe(sim.compEvents.length);
    expect(p.counts.scheduleBlocks + p.counts.orphanedRefs.scheduleBlocks).toBe(sim.makeupBlocks.length);
  });

  it("orphans when service-type is unclassified (mapping serviceKey=null)", () => {
    // Null-key slot must NEVER match a simulator event. Verifies the
    // mapping classifier silent-fallback fix from architect W4 R1.
    const allNullKeys: PersistenceMapping = {
      ...mapping,
      students: mapping.students.map((s) => ({
        ...s,
        services: s.services.map((sv) => ({ ...sv, serviceKey: null })),
      })),
    };
    const p = buildPersistencePayload({
      simulation: sim, mapping: allNullKeys, systemUserId: SYSTEM_USER, systemUserName: SYSTEM_NAME,
    });
    // Every simulator session must orphan; not a single one persisted.
    expect(p.counts.sessions).toBe(0);
    expect(p.counts.orphanedRefs.sessions).toBe(sim.sessions.length);
  });

  it("classifyServiceTypeName returns null for unknown names (no silent fallback)", () => {
    expect(classifyServiceTypeName(null)).toBeNull();
    expect(classifyServiceTypeName("")).toBeNull();
    expect(classifyServiceTypeName("Mystery Service")).toBeNull();
    // Sanity: known names still resolve.
    expect(classifyServiceTypeName("Speech-Language Therapy")).toBe("speech");
    expect(classifyServiceTypeName("Occupational Therapy")).toBe("ot");
  });

  it("golden hash — pinned to detect silent drift across waves", () => {
    // Hash the structurally-stable subset of the payload (no Date
    // objects so round-tripping through JSON is faithful).
    const stable = {
      sessions: payload.sessions.map((r) => ({
        s: r.studentId, sr: r.serviceRequirementId, d: r.sessionDate, m: r.durationMinutes, st: r.status, mu: r.isMakeup,
      })),
      alerts: payload.alerts.map((r) => ({ t: r.type, sv: r.severity, s: r.studentId, sr: r.serviceRequirementId })),
      comp: payload.compObligations.map((r) => ({ s: r.studentId, sr: r.serviceRequirementId, m: r.minutesOwed })),
      blocks: payload.scheduleBlocks.map((r) => ({
        s: r.studentId, st: r.staffId, dow: r.dayOfWeek, src: r.sourceActionItemId,
      })),
      counts: payload.counts,
    };
    const hash = createHash("sha256").update(JSON.stringify(stable)).digest("hex");
    if (process.env.LOG_GOLDEN === "1") console.log("payload golden:", hash);
    // Pinned hash for districtId=4242 + small + epoch=2024-09-02. If
    // you intentionally change the payload shape or simulator output,
    // refresh this value AND document the drift in seed-overhaul-v2.md.
    expect(hash).toBe(EXPECTED_GOLDEN_HASH);
  });
});

// Pinned for districtId=4242, sizeProfile=small, epoch=2024-09-02.
const EXPECTED_GOLDEN_HASH =
  "654edf7e928a8b683199c5a9cd1207428625044e21327a0f64e5dbe5014caba6";
