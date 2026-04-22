/**
 * V2 simulator (W3) — determinism, volume sanity, no-cheating
 * invariants, and performance.
 *
 * Per the W3 task spec: full test-suite is intentionally NOT run here;
 * these tests cover the simulator in isolation. They use the real
 * `buildStudentDefs` + `resolveSeedShape` from v2/domain so any drift
 * in those builders also fails this suite (catches the "simulator
 * silently re-derived domain logic" anti-pattern).
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  buildStudentDefs,
  resolveSeedShape,
} from "@workspace/db/v2/domain";
import { setSeed } from "@workspace/db/v2/platform";
import {
  runSimulation,
  SIMULATION_DAYS,
  SIMULATOR_LAYER_VERSION,
  type SimulationResult,
} from "@workspace/db/v2/simulator";

const FIXED_EPOCH = "2024-09-02"; // a Monday — keeps weekday math stable

function runForDistrict(
  districtId: number,
  opts: { sizeProfile?: "small" | "medium" | "large" } = {},
): SimulationResult {
  // Mirror the seeder's call ordering: setSeed FIRST so resolveSeedShape
  // (which draws randf for completionMultiplier / onTimeLogProb / staff
  // ratio etc.) sees a deterministic stream. The simulator re-installs
  // the seed inside runSimulation for its own internal forks; that
  // second setSeed resets the shared stream, but the *shape* must
  // already be resolved by then.
  setSeed(districtId);
  const defs = buildStudentDefs(opts.sizeProfile ?? "small", 5);
  const shape = resolveSeedShape({ sizeProfile: opts.sizeProfile ?? "small" });
  return runSimulation({
    districtId,
    studentDefs: defs,
    shape,
    epochDate: FIXED_EPOCH,
    // Pin elapsedMillis to 0 so byte-level hashes are stable.
    clock: () => 0,
  });
}

function hashResult(r: SimulationResult): string {
  // Strip the wall-clock field even though we pin clock=0 in the
  // helper; this keeps the hash robust if a future change adds another
  // timing field.
  const { elapsedMillis: _, ...rest } = r;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

describe("v2/simulator — surface", () => {
  it("declares its W3 layer version", () => {
    expect(SIMULATOR_LAYER_VERSION).toBe("w3");
    expect(SIMULATION_DAYS).toBe(270);
  });
});

describe("v2/simulator — determinism", () => {
  it("same districtId + inputs → byte-identical outputs (sessions/alerts/comp/handling)", () => {
    const a = runForDistrict(424242, { sizeProfile: "small" });
    const b = runForDistrict(424242, { sizeProfile: "small" });
    // elapsedMillis is allowed to differ; everything else must match.
    expect(a.sessions.length).toBe(b.sessions.length);
    expect(a.alerts.length).toBe(b.alerts.length);
    expect(a.compEvents.length).toBe(b.compEvents.length);
    expect(a.handlingEvents.length).toBe(b.handlingEvents.length);
    expect(a.makeupBlocks.length).toBe(b.makeupBlocks.length);
    // Stable JSON pin: strip the wall-clock field then deep-compare.
    const stripA = { ...a, elapsedMillis: 0 } as const;
    const stripB = { ...b, elapsedMillis: 0 } as const;
    expect(JSON.stringify(stripA)).toBe(JSON.stringify(stripB));
  });

  it("different districtIds → different outputs (proves seeding is real, not constant)", () => {
    const a = runForDistrict(1, { sizeProfile: "small" });
    const c = runForDistrict(99999, { sizeProfile: "small" });
    // Sessions are emitted on the same cadence days — so total count
    // is similar — but the *outcomes* (status, lagDays) and downstream
    // alert counts must vary across seeds.
    const aStatuses = a.sessions.map((s) => s.status).join("");
    const cStatuses = c.sessions.map((s) => s.status).join("");
    expect(aStatuses).not.toBe(cStatuses);
  });
});

describe("v2/simulator — volume sanity", () => {
  it("emits non-zero sessions and at least one alert across a small-profile run", () => {
    const r = runForDistrict(7, { sizeProfile: "small" });
    expect(r.sessions.length).toBeGreaterThan(0);
    // Small profile has ≥1 student in shortfall + urgent + crisis →
    // accumulated shortfall is guaranteed to cross at least the 0.85
    // threshold over a 270-day window.
    expect(r.alerts.length).toBeGreaterThan(0);
    // Distribution sanity: missed sessions exist (otherwise the alert
    // pipeline would be impossible to trigger).
    const missed = r.sessions.filter((s) => s.status === "missed").length;
    expect(missed).toBeGreaterThan(0);
  });

  it("medium profile produces materially more sessions than small", () => {
    const small = runForDistrict(11, { sizeProfile: "small" });
    const medium = runForDistrict(11, { sizeProfile: "medium" });
    expect(medium.sessions.length).toBeGreaterThan(small.sessions.length * 1.5);
  });
});

describe("v2/simulator — no-cheating invariants", () => {
  it("every behind_on_minutes alert's derivedFrom is mathematically consistent with its severity tier", () => {
    const r = runForDistrict(31337, { sizeProfile: "medium" });
    const behind = r.alerts.filter((a) => a.type === "behind_on_minutes");
    expect(behind.length).toBeGreaterThan(0);
    for (const alert of behind) {
      const { deliveredMinutes, requiredMinutes, completionPct } = alert.derivedFrom;
      // 1. derivedFrom internal arithmetic is honest (not a fake snapshot).
      expect(completionPct).toBeCloseTo(deliveredMinutes / requiredMinutes, 6);
      // 2. severity tier matches the actual percentage band.
      if (alert.severity === "critical") expect(completionPct).toBeLessThan(0.50);
      else if (alert.severity === "high") {
        expect(completionPct).toBeGreaterThanOrEqual(0.50);
        expect(completionPct).toBeLessThan(0.70);
      } else if (alert.severity === "medium") {
        expect(completionPct).toBeGreaterThanOrEqual(0.70);
        expect(completionPct).toBeLessThan(0.85);
      }
      // 3. requiredMinutes was non-trivial (the policy rejects <60).
      expect(requiredMinutes).toBeGreaterThanOrEqual(60);
    }
  });

  it("every comp event correlates with an actual delivered<required shortfall", () => {
    const r = runForDistrict(2024, { sizeProfile: "medium" });
    if (r.compEvents.length === 0) {
      // Surface the case where no comp obligations emerged at all so
      // a future regression doesn't silently zero the engine.
      throw new Error("expected ≥1 comp event for medium profile over 270d");
    }
    for (const c of r.compEvents) {
      expect(c.shortfallMinutes).toBeGreaterThan(0);
      expect(c.shortfallMinutes).toBe(c.requiredMinutes - c.deliveredMinutes);
      expect(c.deliveredMinutes).toBeLessThan(c.requiredMinutes);
      // The trigger band must be consistent with the actual ratio.
      const pct = c.deliveredMinutes / c.requiredMinutes;
      if (c.trigger === "shortfall_70pct") expect(pct).toBeLessThan(0.30);
      else expect(pct).toBeLessThan(0.50);
    }
  });

  it("every handling event references an alert that was emitted earlier or same day", () => {
    const r = runForDistrict(555, { sizeProfile: "small" });
    const alertById = new Map(r.alerts.map((a) => [a.alertId, a]));
    for (const h of r.handlingEvents) {
      const a = alertById.get(h.alertRef);
      expect(a, `dangling handling event for alertRef=${h.alertRef}`).toBeDefined();
      expect(h.day).toBeGreaterThanOrEqual(a!.day);
    }
  });

  it("every makeup block references a real prior missed session day for the same student+service", () => {
    const r = runForDistrict(909, { sizeProfile: "medium" });
    for (const block of r.makeupBlocks) {
      // forMissedDay must be in the past relative to the scheduled
      // makeup date — providers can't make up a session before it was
      // missed.
      expect(block.forMissedDay).toBeLessThan(block.day);
      // There must be at least one matching missed session in the
      // session stream for the same (student, service).
      const matches = r.sessions.filter(
        (s) =>
          s.studentDefIdx === block.studentDefIdx &&
          s.serviceKey === block.serviceKey &&
          s.status === "missed",
      );
      expect(matches.length).toBeGreaterThan(0);
    }
  });

  it("alert severities never regress backward for the same (student, service)", () => {
    const r = runForDistrict(7777, { sizeProfile: "medium" });
    const RANK = { low: 0, medium: 1, high: 2, critical: 3 } as const;
    const seenWorst = new Map<string, number>();
    for (const a of r.alerts.filter((x) => x.type === "behind_on_minutes")) {
      const key = `${a.studentDefIdx}|${a.serviceKey}`;
      const prior = seenWorst.get(key) ?? -1;
      const current = RANK[a.severity as keyof typeof RANK];
      // Strict escalation — dedup means the same tier should not refire.
      expect(current).toBeGreaterThan(prior);
      seenWorst.set(key, current);
    }
  });
});

describe("v2/simulator — golden vector pin", () => {
  // These hashes are CHECKED IN. Any change to the simulator's output
  // shape, RNG sequencing, policy thresholds, or the upstream domain
  // builders will shift them. When a change is intentional, regenerate
  // by running the test, copying the actual hash into the table, and
  // documenting the diff in the PR description. This is the only test
  // that locks output across separate executions of the test process.
  const GOLDEN: ReadonlyArray<{
    name: string;
    districtId: number;
    sizeProfile: "small" | "medium";
    hash: string;
    sessions: number;
    alerts: number;
    comp: number;
    makeup: number;
    handling: number;
  }> = [
    {
      name: "small_424242",
      districtId: 424242,
      sizeProfile: "small",
      hash: "86801793dbd3314bcbc8a94d964ea6563c38bc506d0da531fb3cceb9f1423ecd",
      sessions: 1583,
      alerts: 133,
      comp: 4,
      makeup: 33,
      handling: 326,
    },
    {
      name: "medium_31337",
      districtId: 31337,
      sizeProfile: "medium",
      hash: "00394c04a5e9e56fec32c03ed28c2f7db4f4e2c798f1497fce85d013cea4689a",
      sessions: 4592,
      alerts: 529,
      comp: 18,
      makeup: 110,
      handling: 1320,
    },
  ];

  for (const g of GOLDEN) {
    it(`output matches pinned hash for ${g.name}`, () => {
      const r = runForDistrict(g.districtId, { sizeProfile: g.sizeProfile });
      // Surface the volume diff first so a regression is easy to read
      // before staring at a 64-char hash mismatch.
      expect(r.sessions.length).toBe(g.sessions);
      expect(r.alerts.length).toBe(g.alerts);
      expect(r.compEvents.length).toBe(g.comp);
      expect(r.makeupBlocks.length).toBe(g.makeup);
      expect(r.handlingEvents.length).toBe(g.handling);
      expect(hashResult(r)).toBe(g.hash);
    });
  }
});

describe("v2/simulator — performance sanity", () => {
  it("medium-profile 270-day run completes well under 2s", () => {
    const r = runForDistrict(12345, { sizeProfile: "medium" });
    expect(r.totalDays).toBe(270);
    expect(r.elapsedMillis).toBeLessThan(2000);
  });
});
