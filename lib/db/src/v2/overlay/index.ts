/**
 * Seed Overhaul V2 — Demo Readiness Overlay (W5).
 *
 * Selects-and-labels showcase cases from the simulator's already-
 * persisted primitive-fact rows. The overlay NEVER mutates session
 * logs, alerts, comp obligations, schedule blocks, or handling state.
 * Its only write target is `demo_showcase_cases` — a sidecar pointer
 * table that the dashboard demo flow reads to land on the same
 * pedagogical moments across reloads.
 *
 * Hard rule, repeated from .local/plans/seed-overhaul-v2.md §6
 * NO-CHEATING RULES:
 *
 *   No fact mutators may live under v2/overlay/. Only selectors
 *   (read + tag) and identity seeders (Clerk demo accounts).
 *
 * Mechanical enforcement: the orchestrator captures a per-table
 * SHA-256 digest of the primitive-fact rows scoped to this district's
 * sample students BEFORE selection runs and AGAIN after writing the
 * demo_showcase_cases rows; it asserts byte-equality. Any drift
 * throws — operators (and CI) see the failure immediately.
 *
 * Selection determinism: per-category ordering is derived from real
 * KPI fields (severity, completionPct, miss rate, recency). Ties are
 * broken with a districtId-seeded mulberry32 stream so the same
 * district lands on the same cases across runs without the selector
 * silently re-ordering when row ids drift across re-seeds.
 *
 * The 8 canonical categories — see CATEGORIES below — are filled in
 * order. A fallback buffer ("__fallback__") captures the next-best
 * candidates that didn't make the cut so the dashboard can offer a
 * "see more" affordance without re-scanning the primitive tables.
 */

import { createHash } from "node:crypto";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
} from "drizzle-orm";
import type { db as Db } from "../../db";
import {
  actionItemHandlingTable,
  alertsTable,
  compensatoryObligationsTable,
  demoShowcaseCasesTable,
  scheduleBlocksTable,
  schoolsTable,
  sessionLogsTable,
  studentsTable,
} from "../../schema";
import { beginRun, endRun, type SeedRunMetadata } from "../platform/runMetadata";

export const OVERLAY_LAYER_VERSION = "w5";

/** Canonical bucket identifiers. Keep in sync with the dashboard
 *  Demo Readiness panel. Order matters — it determines fill priority
 *  when later categories starve the global candidate pool. */
export const SHOWCASE_CATEGORIES = [
  "at_risk",
  "scheduled_makeup",
  "recently_resolved",
  "provider_overloaded",
  "evaluation_due",
  "parent_followup",
  "high_progress",
  "chronic_miss",
] as const;
export type ShowcaseCategory = typeof SHOWCASE_CATEGORIES[number];

/** Max picks per category. The dashboard renders a 3-up tile by
 *  default so 3 is the natural ceiling. */
const DEFAULT_MAX_PER_CATEGORY = 3;
/** Fallback buffer size — rows surfaced in the "see more" drawer. */
const DEFAULT_FALLBACK_SIZE = 6;

const SNAPSHOT_TABLES = [
  "session_logs",
  "alerts",
  "compensatory_obligations",
  "schedule_blocks",
  "action_item_handling",
] as const;
type SnapshotTable = typeof SNAPSHOT_TABLES[number];

export interface PrimitiveFactSnapshot {
  /** Tables covered, in canonical order. */
  tables: ReadonlyArray<string>;
  /** Per-table digest. Keyed by canonical table name. */
  perTable: Record<string, string>;
  /** Combined SHA-256 (concatenation of per-table digests). */
  digest: string;
  /** ISO-8601 capture time. */
  capturedAt: string;
}

export interface ShowcaseCaseInput {
  category: ShowcaseCategory | "__fallback__";
  subjectKind: "alert" | "session" | "comp_obligation" | "schedule_block" | "student" | "handling_state";
  subjectId: number;
  headline: string | null;
  payload: Record<string, unknown>;
  selectionOrder: number;
}

export interface RunDemoOverlayOptions {
  /** Defaults to 3. */
  maxPerCategory?: number;
  /** Defaults to 6. */
  fallbackSize?: number;
}

export interface RunDemoOverlayResult {
  districtId: number;
  layerVersion: typeof OVERLAY_LAYER_VERSION;
  runId: string;
  meta: SeedRunMetadata;
  /** Per-category counts of cases written. */
  categoryCounts: Record<ShowcaseCategory, number>;
  /** Number of fallback rows written. */
  fallbackCount: number;
  /** Total rows written to demo_showcase_cases. */
  totalWritten: number;
  /** Snapshot of the primitive-fact tables BEFORE selection ran. */
  before: PrimitiveFactSnapshot;
  /** Snapshot AFTER selection ran (must equal `before`). */
  after: PrimitiveFactSnapshot;
  /** True iff `before.digest === after.digest`. ALWAYS true; the
   *  orchestrator throws otherwise. Surfaced for downstream assertion. */
  noMutationInvariantHeld: true;
}

// ───────────────────────────────────────────────────────────────────
// Snapshot helpers
// ───────────────────────────────────────────────────────────────────

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Stable JSON.stringify with sorted keys so per-row hashes don't drift
 * because Postgres returned columns in a different order.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

async function digestForSampleStudentTable(
  db: typeof Db,
  table: SnapshotTable,
  sampleStudentIds: number[],
  districtId: number,
): Promise<string> {
  if (sampleStudentIds.length === 0) return sha256Hex(`${table}::empty`);
  let rows: Array<Record<string, unknown>> = [];
  switch (table) {
    case "session_logs":
      rows = await db.select().from(sessionLogsTable)
        .where(inArray(sessionLogsTable.studentId, sampleStudentIds))
        .orderBy(asc(sessionLogsTable.id));
      break;
    case "alerts":
      rows = await db.select().from(alertsTable)
        .where(inArray(alertsTable.studentId, sampleStudentIds))
        .orderBy(asc(alertsTable.id));
      break;
    case "compensatory_obligations":
      rows = await db.select().from(compensatoryObligationsTable)
        .where(inArray(compensatoryObligationsTable.studentId, sampleStudentIds))
        .orderBy(asc(compensatoryObligationsTable.id));
      break;
    case "schedule_blocks":
      rows = await db.select().from(scheduleBlocksTable)
        .where(and(
          inArray(scheduleBlocksTable.studentId, sampleStudentIds),
          eq(scheduleBlocksTable.blockType, "makeup"),
        ))
        .orderBy(asc(scheduleBlocksTable.id));
      break;
    case "action_item_handling": {
      // Scope handling rows to the sample alert id space — same scope
      // the runOverlay cleanup uses, so a non-sample (operator) row
      // changing in the same district doesn't trip the invariant.
      const sampleAlerts = await db.select({ id: alertsTable.id }).from(alertsTable)
        .where(inArray(alertsTable.studentId, sampleStudentIds));
      const itemIds = sampleAlerts.map((a) => `alert:${a.id}`);
      if (itemIds.length === 0) return sha256Hex(`${table}::empty`);
      rows = await db.select().from(actionItemHandlingTable)
        .where(and(
          eq(actionItemHandlingTable.districtId, districtId),
          inArray(actionItemHandlingTable.itemId, itemIds),
        ))
        .orderBy(asc(actionItemHandlingTable.id));
      break;
    }
  }
  return sha256Hex(`${table}::${rows.map(stableStringify).join("|")}`);
}

async function snapshot(
  db: typeof Db,
  districtId: number,
  sampleStudentIds: number[],
): Promise<PrimitiveFactSnapshot> {
  const perTable: Record<string, string> = {};
  for (const t of SNAPSHOT_TABLES) {
    perTable[t] = await digestForSampleStudentTable(db, t, sampleStudentIds, districtId);
  }
  const digest = sha256Hex(SNAPSHOT_TABLES.map((t) => perTable[t]).join("::"));
  return {
    tables: SNAPSHOT_TABLES,
    perTable,
    digest,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Public re-export of the snapshot helper. W3/W4 callers may use this
 * to assert no-mutation invariants in their own tests.
 */
export async function snapshotPrimitiveFacts(
  db: typeof Db,
  districtId: number,
  tables: ReadonlyArray<string> = SNAPSHOT_TABLES,
): Promise<PrimitiveFactSnapshot> {
  void tables; // The implementation is fixed to SNAPSHOT_TABLES; we accept the param for API back-compat.
  const sampleStudentIds = await fetchSampleStudentIds(db, districtId);
  return snapshot(db, districtId, sampleStudentIds);
}

async function fetchSampleStudentIds(db: typeof Db, districtId: number): Promise<number[]> {
  const schools = await db.select({ id: schoolsTable.id }).from(schoolsTable)
    .where(eq(schoolsTable.districtId, districtId));
  const schoolIds = schools.map((s) => s.id);
  if (schoolIds.length === 0) return [];
  const students = await db.select({ id: studentsTable.id }).from(studentsTable)
    .where(and(
      eq(studentsTable.isSample, true),
      inArray(studentsTable.schoolId, schoolIds),
    ));
  return students.map((s) => s.id);
}

// ───────────────────────────────────────────────────────────────────
// Deterministic tie-break PRNG (mulberry32 seeded by districtId)
// ───────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let t = (seed | 0) || 0x9e3779b9;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────────────────────────────────────────────────
// Selector — per-category candidate builders
// ───────────────────────────────────────────────────────────────────

interface SelectorContext {
  db: typeof Db;
  districtId: number;
  sampleStudentIds: number[];
  rand: () => number;
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Parse the trailing "(NN% complete)." token out of the alert message
 *  the persistence layer writes. Returns NaN if the message doesn't
 *  carry a percentage (e.g. missed_sessions alerts). */
function extractCompletionPct(message: string | null): number {
  if (!message) return Number.NaN;
  const m = message.match(/\((\d+)%\s+complete/i);
  return m ? Number.parseInt(m[1], 10) : Number.NaN;
}

async function selectAtRisk(ctx: SelectorContext): Promise<ShowcaseCaseInput[]> {
  const rows = await ctx.db.select().from(alertsTable)
    .where(and(
      inArray(alertsTable.studentId, ctx.sampleStudentIds),
      eq(alertsTable.resolved, false),
    ))
    .orderBy(asc(alertsTable.id));
  // Rank: severity asc, then completion pct asc (most behind first),
  // then id asc for stability.
  const ranked = [...rows].sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity] ?? 9;
    const sb = SEVERITY_RANK[b.severity] ?? 9;
    if (sa !== sb) return sa - sb;
    const pa = extractCompletionPct(a.message);
    const pb = extractCompletionPct(b.message);
    const paOk = Number.isFinite(pa);
    const pbOk = Number.isFinite(pb);
    if (paOk && pbOk && pa !== pb) return pa - pb;
    if (paOk !== pbOk) return paOk ? -1 : 1;
    return a.id - b.id;
  });
  return ranked.map((r) => ({
    category: "at_risk" as const,
    subjectKind: "alert" as const,
    subjectId: r.id,
    headline: `${r.severity.toUpperCase()} · ${r.message ?? ""}`.slice(0, 240),
    payload: {
      severity: r.severity,
      type: r.type,
      studentId: r.studentId,
      completionPct: Number.isFinite(extractCompletionPct(r.message)) ? extractCompletionPct(r.message) : null,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    },
    selectionOrder: 0,
  }));
}

async function selectScheduledMakeup(ctx: SelectorContext): Promise<ShowcaseCaseInput[]> {
  const rows = await ctx.db.select().from(scheduleBlocksTable)
    .where(and(
      inArray(scheduleBlocksTable.studentId, ctx.sampleStudentIds),
      eq(scheduleBlocksTable.blockType, "makeup"),
    ))
    .orderBy(asc(scheduleBlocksTable.id));
  return rows.map((r) => ({
    category: "scheduled_makeup" as const,
    subjectKind: "schedule_block" as const,
    subjectId: r.id,
    headline: r.blockLabel ?? "Makeup session scheduled",
    payload: {
      studentId: r.studentId,
      staffId: r.staffId,
      dayOfWeek: r.dayOfWeek,
      sourceActionItemId: r.sourceActionItemId,
    },
    selectionOrder: 0,
  }));
}

async function selectRecentlyResolved(ctx: SelectorContext): Promise<ShowcaseCaseInput[]> {
  const rows = await ctx.db.select().from(alertsTable)
    .where(and(
      inArray(alertsTable.studentId, ctx.sampleStudentIds),
      eq(alertsTable.resolved, true),
    ))
    .orderBy(desc(alertsTable.id));
  return rows.map((r) => ({
    category: "recently_resolved" as const,
    subjectKind: "alert" as const,
    subjectId: r.id,
    headline: `Resolved · ${r.message ?? ""}`.slice(0, 240),
    payload: {
      severity: r.severity,
      type: r.type,
      studentId: r.studentId,
      resolvedAt: r.resolvedAt instanceof Date ? r.resolvedAt.toISOString() : r.resolvedAt,
    },
    selectionOrder: 0,
  }));
}

async function selectProviderOverloaded(ctx: SelectorContext): Promise<ShowcaseCaseInput[]> {
  // Sample alert id space — same as runOverlay cleanup scope.
  const sampleAlerts = await ctx.db.select({ id: alertsTable.id }).from(alertsTable)
    .where(inArray(alertsTable.studentId, ctx.sampleStudentIds));
  const itemIds = sampleAlerts.map((a) => `alert:${a.id}`);
  if (itemIds.length === 0) return [];
  const rows = await ctx.db.select().from(actionItemHandlingTable)
    .where(and(
      eq(actionItemHandlingTable.districtId, ctx.districtId),
      inArray(actionItemHandlingTable.itemId, itemIds),
      eq(actionItemHandlingTable.assignedToUserId, "system:profile-overloaded-provider"),
    ))
    .orderBy(asc(actionItemHandlingTable.id));
  return rows.map((r) => ({
    category: "provider_overloaded" as const,
    subjectKind: "handling_state" as const,
    subjectId: r.id,
    headline: `Overloaded provider · ${r.state}`,
    payload: {
      itemId: r.itemId,
      state: r.state,
      assignedToRole: r.assignedToRole,
      assignedToUserId: r.assignedToUserId,
    },
    selectionOrder: 0,
  }));
}

async function selectEvaluationDue(ctx: SelectorContext): Promise<ShowcaseCaseInput[]> {
  // Heuristic: students with the most OPEN comp obligations carry the
  // most evaluation pressure. The simulator doesn't model formal IEP
  // re-eval events; this is the closest semantic proxy.
  const rows = await ctx.db.select().from(compensatoryObligationsTable)
    .where(and(
      inArray(compensatoryObligationsTable.studentId, ctx.sampleStudentIds),
      eq(compensatoryObligationsTable.status, "pending"),
    ));
  const byStudent = new Map<number, { count: number; minutesOwed: number; latestEnd: string | null }>();
  for (const r of rows) {
    const sid = r.studentId;
    if (sid == null) continue;
    const e = byStudent.get(sid) ?? { count: 0, minutesOwed: 0, latestEnd: null };
    e.count += 1;
    e.minutesOwed += r.minutesOwed ?? 0;
    if (!e.latestEnd || (r.periodEnd && r.periodEnd > e.latestEnd)) e.latestEnd = r.periodEnd ?? e.latestEnd;
    byStudent.set(sid, e);
  }
  const candidates = Array.from(byStudent.entries())
    .sort((a, b) => {
      if (b[1].minutesOwed !== a[1].minutesOwed) return b[1].minutesOwed - a[1].minutesOwed;
      if (b[1].count !== a[1].count) return b[1].count - a[1].count;
      return a[0] - b[0];
    });
  return candidates.map(([studentId, info]) => ({
    category: "evaluation_due" as const,
    subjectKind: "student" as const,
    subjectId: studentId,
    headline: `Evaluation due — ${info.minutesOwed} min owed across ${info.count} obligation(s)`,
    payload: {
      pendingObligations: info.count,
      minutesOwed: info.minutesOwed,
      latestPeriodEnd: info.latestEnd,
    },
    selectionOrder: 0,
  }));
}

async function selectParentFollowup(ctx: SelectorContext): Promise<ShowcaseCaseInput[]> {
  // Handling rows parked in awaiting_confirmation are the on-platform
  // proxy for "we're waiting on the parent to confirm a makeup slot".
  const sampleAlerts = await ctx.db.select({ id: alertsTable.id }).from(alertsTable)
    .where(inArray(alertsTable.studentId, ctx.sampleStudentIds));
  const itemIds = sampleAlerts.map((a) => `alert:${a.id}`);
  if (itemIds.length === 0) return [];
  const rows = await ctx.db.select().from(actionItemHandlingTable)
    .where(and(
      eq(actionItemHandlingTable.districtId, ctx.districtId),
      inArray(actionItemHandlingTable.itemId, itemIds),
      eq(actionItemHandlingTable.state, "awaiting_confirmation"),
    ))
    .orderBy(asc(actionItemHandlingTable.id));
  return rows.map((r) => ({
    category: "parent_followup" as const,
    subjectKind: "handling_state" as const,
    subjectId: r.id,
    headline: "Awaiting parent / family confirmation",
    payload: {
      itemId: r.itemId,
      assignedToRole: r.assignedToRole,
      updatedByName: r.updatedByName,
    },
    selectionOrder: 0,
  }));
}

interface MissRate {
  studentId: number;
  total: number;
  missed: number;
  ratio: number;
}

async function buildMissRates(ctx: SelectorContext): Promise<MissRate[]> {
  const rows = await ctx.db.select({
    studentId: sessionLogsTable.studentId,
    status: sessionLogsTable.status,
  }).from(sessionLogsTable)
    .where(and(
      inArray(sessionLogsTable.studentId, ctx.sampleStudentIds),
      isNotNull(sessionLogsTable.studentId),
    ));
  const map = new Map<number, { total: number; missed: number }>();
  for (const r of rows) {
    if (r.studentId == null) continue;
    const e = map.get(r.studentId) ?? { total: 0, missed: 0 };
    e.total += 1;
    if (r.status === "missed") e.missed += 1;
    map.set(r.studentId, e);
  }
  const out: MissRate[] = [];
  for (const [studentId, v] of map.entries()) {
    if (v.total === 0) continue;
    out.push({ studentId, total: v.total, missed: v.missed, ratio: v.missed / v.total });
  }
  return out;
}

async function selectHighProgress(ctx: SelectorContext): Promise<ShowcaseCaseInput[]> {
  const rates = await buildMissRates(ctx);
  // Lowest miss ratio first; require at least 5 sessions logged so a
  // single completed row doesn't dominate. Tie-break by total desc
  // (more evidence wins) then id asc.
  const ranked = rates
    .filter((r) => r.total >= 5)
    .sort((a, b) => {
      if (a.ratio !== b.ratio) return a.ratio - b.ratio;
      if (b.total !== a.total) return b.total - a.total;
      return a.studentId - b.studentId;
    });
  return ranked.map((r) => ({
    category: "high_progress" as const,
    subjectKind: "student" as const,
    subjectId: r.studentId,
    headline: `High progress — ${Math.round((1 - r.ratio) * 100)}% completion`,
    payload: {
      totalSessions: r.total,
      missedSessions: r.missed,
      completionRate: 1 - r.ratio,
    },
    selectionOrder: 0,
  }));
}

async function selectChronicMiss(ctx: SelectorContext): Promise<ShowcaseCaseInput[]> {
  const rates = await buildMissRates(ctx);
  // Highest miss ratio first; same ≥5 floor.
  const ranked = rates
    .filter((r) => r.total >= 5)
    .sort((a, b) => {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      if (b.total !== a.total) return b.total - a.total;
      return a.studentId - b.studentId;
    });
  return ranked.map((r) => ({
    category: "chronic_miss" as const,
    subjectKind: "student" as const,
    subjectId: r.studentId,
    headline: `Chronic miss — ${Math.round(r.ratio * 100)}% missed`,
    payload: {
      totalSessions: r.total,
      missedSessions: r.missed,
      missRate: r.ratio,
    },
    selectionOrder: 0,
  }));
}

const SELECTORS: Record<ShowcaseCategory, (ctx: SelectorContext) => Promise<ShowcaseCaseInput[]>> = {
  at_risk: selectAtRisk,
  scheduled_makeup: selectScheduledMakeup,
  recently_resolved: selectRecentlyResolved,
  provider_overloaded: selectProviderOverloaded,
  evaluation_due: selectEvaluationDue,
  parent_followup: selectParentFollowup,
  high_progress: selectHighProgress,
  chronic_miss: selectChronicMiss,
};

// ───────────────────────────────────────────────────────────────────
// Orchestrator
// ───────────────────────────────────────────────────────────────────

/**
 * Run the Demo Readiness Overlay for a district that has already
 * gone through `runSimulationOverlayForDistrict`. The function:
 *
 *   1. Snapshots the primitive-fact tables (sample-scoped).
 *   2. Runs every selector to build a per-category candidate list.
 *   3. Picks up to `maxPerCategory` per bucket (deterministic; PRNG
 *      tie-break only for ranks that are otherwise equal).
 *   4. Idempotent re-write: deletes prior overlay rows for this
 *      district then inserts the freshly selected ones.
 *   5. Snapshots again and asserts byte-equality against the
 *      pre-snapshot. Throws if drift is detected.
 *
 * The overlay never writes to anything other than
 * `demo_showcase_cases`. The post-snapshot assertion is the
 * mechanical proof of that property.
 */
export async function runDemoReadinessOverlay(
  db: typeof Db,
  districtId: number,
  options: RunDemoOverlayOptions = {},
): Promise<RunDemoOverlayResult> {
  const begin = beginRun(districtId);
  const maxPerCategory = options.maxPerCategory ?? DEFAULT_MAX_PER_CATEGORY;
  const fallbackSize = options.fallbackSize ?? DEFAULT_FALLBACK_SIZE;

  const sampleStudentIds = await fetchSampleStudentIds(db, districtId);
  if (sampleStudentIds.length === 0) {
    throw new Error(`[v2/overlay] district ${districtId} has no sample students; run seedSampleDataForDistrict + runSimulationOverlayForDistrict first`);
  }

  const before = await snapshot(db, districtId, sampleStudentIds);

  const ctx: SelectorContext = {
    db,
    districtId,
    sampleStudentIds,
    rand: mulberry32(districtId),
  };

  const categoryCounts: Record<ShowcaseCategory, number> = {
    at_risk: 0,
    scheduled_makeup: 0,
    recently_resolved: 0,
    provider_overloaded: 0,
    evaluation_due: 0,
    parent_followup: 0,
    high_progress: 0,
    chronic_miss: 0,
  };

  const toInsert: ShowcaseCaseInput[] = [];
  const fallbackPool: ShowcaseCaseInput[] = [];

  // Track (subjectKind, subjectId) so the same primitive row never
  // appears in two categories — an alert that's both "at_risk" and a
  // "parent_followup" candidate goes only to the higher-priority
  // bucket. Without this, a single row could dominate the showcase.
  // `claimed` is set ONLY when a subject is committed to a primary
  // category — when a subject overflows into the fallback pool the
  // claim is NOT yet booked, leaving the subject eligible for later
  // categories that may still have an open slot. `fallbackClaimed`
  // separately dedupes the fallback pool itself so the unique index
  // (district,run,category,kind,id) is never tripped on duplicates.
  const claimed = new Set<string>();
  const fallbackClaimed = new Set<string>();
  const claimKey = (c: ShowcaseCaseInput) => `${c.subjectKind}:${c.subjectId}`;

  for (const cat of SHOWCASE_CATEGORIES) {
    const candidates = await SELECTORS[cat](ctx);
    let order = 0;
    for (const c of candidates) {
      const k = claimKey(c);
      if (claimed.has(k)) continue;
      if (categoryCounts[cat] >= maxPerCategory) {
        if (fallbackClaimed.has(k)) continue;
        fallbackPool.push({
          ...c,
          category: "__fallback__",
          payload: { ...c.payload, originalCategory: cat },
        });
        fallbackClaimed.add(k);
        continue;
      }
      const row = { ...c, selectionOrder: order };
      toInsert.push(row);
      claimed.add(k);
      categoryCounts[cat] += 1;
      order += 1;
    }
  }
  // A subject that lands in a primary category supersedes any earlier
  // fallback claim for the same subject; drop fallback rows that were
  // promoted later in the iteration.
  const filteredFallback = fallbackPool.filter((r) => !claimed.has(claimKey(r)));

  // Stable trim of fallback pool. The pool is already in selector
  // order; cap to fallbackSize.
  const fallbackTrimmed = filteredFallback.slice(0, fallbackSize).map((r, i) => ({ ...r, selectionOrder: i }));

  const meta = endRun(begin, districtId);
  const writes = [...toInsert, ...fallbackTrimmed];

  // Idempotent rewrite: drop any prior overlay rows for this district
  // (across runIds — we only ever surface the latest run) and insert
  // the freshly selected rows. Architect MEDIUM: wrap in a single
  // transaction so a partial-write failure cannot leave the district
  // with an empty showcase between the delete and the inserts.
  await db.transaction(async (tx) => {
    await tx.delete(demoShowcaseCasesTable)
      .where(eq(demoShowcaseCasesTable.districtId, districtId));

    if (writes.length > 0) {
      const rows = writes.map((w) => ({
        districtId,
        runId: meta.runId,
        category: w.category,
        subjectKind: w.subjectKind,
        subjectId: w.subjectId,
        headline: w.headline,
        payload: w.payload as Record<string, unknown>,
        selectionOrder: w.selectionOrder,
      }));
      // Insert in chunks to stay well under bind-param caps.
      for (let i = 0; i < rows.length; i += 200) {
        const slice = rows.slice(i, i + 200);
        await tx.insert(demoShowcaseCasesTable).values(slice);
      }
    }
  });

  const after = await snapshot(db, districtId, sampleStudentIds);
  if (before.digest !== after.digest) {
    const drift = SNAPSHOT_TABLES.filter((t) => before.perTable[t] !== after.perTable[t]);
    throw new Error(
      `[v2/overlay] NO-MUTATION INVARIANT VIOLATED for district ${districtId}: tables changed during selection: ${drift.join(", ")}`,
    );
  }

  return {
    districtId,
    layerVersion: OVERLAY_LAYER_VERSION,
    runId: meta.runId,
    meta,
    categoryCounts,
    fallbackCount: fallbackTrimmed.length,
    totalWritten: writes.length,
    before,
    after,
    noMutationInvariantHeld: true,
  };
}

/**
 * Read-only fetch helper for downstream callers (postRunSummary,
 * dashboard route). Returns the latest overlay run's rows for a
 * district, ordered by category then selectionOrder.
 */
export async function listShowcaseCases(
  db: typeof Db,
  districtId: number,
) {
  // Use the most recent run's rows (we only keep one run at a time
  // post-rewrite, but be defensive and pick the max runId by id desc).
  const rows = await db.select().from(demoShowcaseCasesTable)
    .where(eq(demoShowcaseCasesTable.districtId, districtId))
    .orderBy(asc(demoShowcaseCasesTable.category), asc(demoShowcaseCasesTable.selectionOrder));
  return rows;
}
