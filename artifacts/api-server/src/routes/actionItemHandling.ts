// tenant-scope: district-direct (district_id column on action_item_handling)
/**
 * Phase 1E — Shared operational handling state for the pilot wedge.
 *
 * Backs the cross-user "is anyone already on this?" pill that appears on
 * Action Center, the student-detail Recommended Next Step card, and the
 * compliance Risk Report rows.
 *
 * Strict district scoping — every read and write is keyed by
 * `getEnforcedDistrictId(req)`, so a caller in district A can neither
 * read nor write district B's handling state, even if they guess the
 * itemId.
 *
 * Endpoints:
 *   GET  /action-item-handling?ids=a,b,c   batch read (querystring)
 *   POST /action-item-handling/batch       batch read (JSON body, for >50 ids)
 *   PUT  /action-item-handling/:itemId     upsert state + emit event
 *   GET  /action-item-handling/:itemId/history  recent transitions
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  actionItemHandlingTable,
  actionItemHandlingEventsTable,
  studentsTable,
  staffTable,
} from "@workspace/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { requireRoles, getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// Roles allowed to read/write shared handling state. Mirrors the
// pilot-wedge surfaces (Action Center, student detail, risk report) —
// privileged staff plus providers who actually touch handoffs. Para
// and sped_student/sped_parent are excluded.
const requireHandlingStateAccess = requireRoles(
  "admin", "coordinator", "case_manager", "sped_teacher", "bcba", "provider",
);

// Item ids are produced by `itemIdFor*` helpers in
// artifacts/trellis/src/lib/action-recommendations.ts. We accept any
// reasonable string but cap length and reject obviously malformed input
// so a typo can't poison the unique index.
const ITEM_ID_PATTERN = /^[a-z][a-z0-9-]*:[A-Za-z0-9:_-]+$/;
const ItemIdSchema = z.string().min(3).max(200).regex(ITEM_ID_PATTERN, "invalid item id");

const HANDLING_STATES = [
  "needs_action",
  "awaiting_confirmation",
  "recovery_scheduled",
  "handed_off",
  "under_review",
  "resolved",
] as const;

const PutBodySchema = z.object({
  state: z.enum(HANDLING_STATES),
  note: z.string().max(2000).optional().nullable(),
  recommendedOwnerRole: z.string().max(64).optional().nullable(),
  assignedToRole: z.string().max(64).optional().nullable(),
  assignedToUserId: z.string().max(128).optional().nullable(),
});

const BatchBodySchema = z.object({
  ids: z.array(ItemIdSchema).max(500),
});

function rowToJson(r: typeof actionItemHandlingTable.$inferSelect) {
  return {
    itemId: r.itemId,
    state: r.state,
    note: r.note,
    recommendedOwnerRole: r.recommendedOwnerRole,
    assignedToRole: r.assignedToRole,
    assignedToUserId: r.assignedToUserId,
    updatedByUserId: r.updatedByUserId,
    updatedByName: r.updatedByName,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
    resolvedAt: r.resolvedAt instanceof Date ? r.resolvedAt.toISOString() : r.resolvedAt,
  };
}

async function readByIds(districtId: number, ids: string[]) {
  if (ids.length === 0) return [];
  const uniqIds = Array.from(new Set(ids));
  return await db
    .select()
    .from(actionItemHandlingTable)
    .where(and(
      eq(actionItemHandlingTable.districtId, districtId),
      inArray(actionItemHandlingTable.itemId, uniqIds),
    ));
}

router.get("/action-item-handling", requireHandlingStateAccess, async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (districtId == null) { res.status(403).json({ error: "no district scope" }); return; }

  const raw = String(req.query.ids ?? "").trim();
  const ids = raw.length === 0 ? [] : raw.split(",").map(s => s.trim()).filter(Boolean);
  // Validate every id; if any malformed, reject to keep clients honest.
  for (const id of ids) {
    if (!ITEM_ID_PATTERN.test(id) || id.length > 200) {
      res.status(400).json({ error: "invalid item id", id });
      return;
    }
  }
  const rows = await readByIds(districtId, ids);
  res.json({ data: rows.map(rowToJson) });
});

// Single-id read. Convenience wrapper around `readByIds` so callers
// (Action Center detail polls, e2e specs, etc.) don't have to build a
// querystring just to fetch one row. Returns the row JSON directly, or
// 404 when no handling row exists yet for that itemId in this district.
router.get("/action-item-handling/:itemId", requireHandlingStateAccess, async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (districtId == null) { res.status(403).json({ error: "no district scope" }); return; }
  const idCheck = ItemIdSchema.safeParse(req.params.itemId);
  if (!idCheck.success) { res.status(400).json({ error: "invalid item id" }); return; }
  const rows = await readByIds(districtId, [idCheck.data]);
  if (rows.length === 0) { res.status(404).json({ error: "not found" }); return; }
  res.json(rowToJson(rows[0]));
});

router.post("/action-item-handling/batch", requireHandlingStateAccess, async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (districtId == null) { res.status(403).json({ error: "no district scope" }); return; }
  const parsed = BatchBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const rows = await readByIds(districtId, parsed.data.ids);
  res.json({ data: rows.map(rowToJson) });
});

router.put("/action-item-handling/:itemId", requireHandlingStateAccess, async (req, res): Promise<void> => {
  const authed = req as AuthedRequest;
  const districtId = getEnforcedDistrictId(authed);
  if (districtId == null) { res.status(403).json({ error: "no district scope" }); return; }

  const idCheck = ItemIdSchema.safeParse(req.params.itemId);
  if (!idCheck.success) { res.status(400).json({ error: "invalid item id" }); return; }
  const itemId = idCheck.data;

  const bodyCheck = PutBodySchema.safeParse(req.body);
  if (!bodyCheck.success) { res.status(400).json({ error: bodyCheck.error.message }); return; }
  const body = bodyCheck.data;

  const existingRows = await db
    .select()
    .from(actionItemHandlingTable)
    .where(and(
      eq(actionItemHandlingTable.districtId, districtId),
      eq(actionItemHandlingTable.itemId, itemId),
    ))
    .limit(1);
  const existing = existingRows[0];

  const fromState = existing?.state ?? null;
  const toState = body.state;
  const resolvedAt = toState === "resolved" ? new Date() : null;

  // `needs_action` is the implicit default. To keep the table small we
  // delete the row when the user clears handling, but still record the
  // transition in the events table.
  let resultRow: typeof actionItemHandlingTable.$inferSelect | null = null;
  if (toState === "needs_action") {
    if (existing) {
      await db
        .delete(actionItemHandlingTable)
        .where(and(
          eq(actionItemHandlingTable.districtId, districtId),
          eq(actionItemHandlingTable.itemId, itemId),
        ));
    }
  } else if (existing) {
    const [upd] = await db
      .update(actionItemHandlingTable)
      .set({
        state: toState,
        note: body.note ?? null,
        recommendedOwnerRole: body.recommendedOwnerRole ?? existing.recommendedOwnerRole,
        assignedToRole: body.assignedToRole ?? existing.assignedToRole,
        assignedToUserId: body.assignedToUserId ?? existing.assignedToUserId,
        updatedByUserId: authed.userId,
        updatedByName: authed.displayName ?? null,
        resolvedAt,
      })
      .where(and(
        eq(actionItemHandlingTable.districtId, districtId),
        eq(actionItemHandlingTable.itemId, itemId),
      ))
      .returning();
    resultRow = upd ?? null;
  } else {
    const [ins] = await db
      .insert(actionItemHandlingTable)
      .values({
        districtId,
        itemId,
        state: toState,
        note: body.note ?? null,
        recommendedOwnerRole: body.recommendedOwnerRole ?? null,
        assignedToRole: body.assignedToRole ?? null,
        assignedToUserId: body.assignedToUserId ?? null,
        updatedByUserId: authed.userId,
        updatedByName: authed.displayName ?? null,
        resolvedAt,
      })
      .returning();
    resultRow = ins ?? null;
  }

  // Always emit an event row, including the clear-to-default transition,
  // so the audit log reflects every change.
  if (fromState !== toState) {
    await db.insert(actionItemHandlingEventsTable).values({
      districtId,
      itemId,
      fromState,
      toState,
      note: body.note ?? null,
      changedByUserId: authed.userId,
      changedByName: authed.displayName ?? null,
    });
  }

  res.json({ data: resultRow ? rowToJson(resultRow) : { itemId, state: "needs_action" } });
});

/**
 * Phase 1F — Real "Review with case manager" handoff. Looks up the
 * student's case manager, attaches a structured note built from the
 * recommendation context, and assigns the item to that CM. The CM's
 * Action Center will then show the row in their queue.
 *
 * Body:
 *   - studentId: number (required)
 *   - recommendation: { causeLabel, primaryActionLabel, explanation, confidence } (optional)
 *   - signal: { shortfallMinutes?, requiredMinutes?, deliveredMinutes?, serviceRequirementId? } (optional)
 *   - extraNote: string (optional, free-form prefix)
 */
const HandOffBodySchema = z.object({
  studentId: z.number().int().positive(),
  recommendation: z.object({
    causeLabel: z.string().max(120).optional(),
    primaryActionLabel: z.string().max(120).optional(),
    explanation: z.string().max(800).optional(),
    confidence: z.string().max(32).optional(),
  }).optional(),
  signal: z.object({
    shortfallMinutes: z.number().optional().nullable(),
    requiredMinutes: z.number().optional().nullable(),
    deliveredMinutes: z.number().optional().nullable(),
    serviceRequirementId: z.number().int().nullable().optional(),
  }).optional(),
  extraNote: z.string().max(800).optional(),
});

function buildHandoffNote(opts: {
  routedByName: string | null;
  studentName: string | null;
  recommendation?: { causeLabel?: string; explanation?: string; primaryActionLabel?: string; confidence?: string };
  signal?: { shortfallMinutes?: number | null; requiredMinutes?: number | null; deliveredMinutes?: number | null };
  extraNote?: string;
}): string {
  const lines: string[] = [];
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const by = opts.routedByName ?? "a teammate";
  const who = opts.studentName ? ` for ${opts.studentName}` : "";
  lines.push(`Routed for case-manager review${who} on ${date} by ${by}.`);
  if (opts.recommendation?.primaryActionLabel) {
    const conf = opts.recommendation.confidence ? ` (${opts.recommendation.confidence} confidence)` : "";
    lines.push(`Recommendation: ${opts.recommendation.primaryActionLabel}${conf}.`);
  }
  if (opts.recommendation?.causeLabel) {
    lines.push(`Likely cause: ${opts.recommendation.causeLabel}.`);
  }
  if (opts.recommendation?.explanation) {
    lines.push(`Why: ${opts.recommendation.explanation}`);
  }
  const sig = opts.signal;
  if (sig && (sig.requiredMinutes || sig.shortfallMinutes || sig.deliveredMinutes)) {
    const parts: string[] = [];
    if (sig.requiredMinutes != null) parts.push(`Required: ${sig.requiredMinutes.toLocaleString()} min`);
    if (sig.deliveredMinutes != null) parts.push(`Delivered: ${sig.deliveredMinutes.toLocaleString()} min`);
    if (sig.shortfallMinutes != null) {
      const pct = sig.requiredMinutes ? ` (${Math.round((sig.shortfallMinutes / sig.requiredMinutes) * 100)}%)` : "";
      parts.push(`Shortfall: ${sig.shortfallMinutes.toLocaleString()} min${pct}`);
    }
    if (parts.length) lines.push(parts.join(" · "));
  }
  if (opts.extraNote) lines.push(opts.extraNote);
  lines.push("Open this item in your queue to review IEP requirement, schedule blocks, and recent sessions together.");
  return lines.join("\n");
}

router.post("/action-item-handling/:itemId/hand-off-to-case-manager", requireHandlingStateAccess, async (req, res): Promise<void> => {
  const authed = req as AuthedRequest;
  const districtId = getEnforcedDistrictId(authed);
  if (districtId == null) { res.status(403).json({ error: "no district scope" }); return; }

  const idCheck = ItemIdSchema.safeParse(req.params.itemId);
  if (!idCheck.success) { res.status(400).json({ error: "invalid item id" }); return; }
  const itemId = idCheck.data;

  const bodyCheck = HandOffBodySchema.safeParse(req.body);
  if (!bodyCheck.success) { res.status(400).json({ error: bodyCheck.error.message }); return; }
  const body = bodyCheck.data;

  // Look up the student in the caller's district to enforce scope.
  const [student] = await db
    .select({
      id: studentsTable.id,
      firstName: studentsTable.firstName,
      lastName: studentsTable.lastName,
      caseManagerId: studentsTable.caseManagerId,
    })
    .from(studentsTable)
    .where(and(eq(studentsTable.id, body.studentId), eq(studentsTable.districtId, districtId)))
    .limit(1);
  if (!student) { res.status(404).json({ error: "student not found in your district" }); return; }
  if (!student.caseManagerId) {
    res.status(409).json({ error: "no_case_manager_assigned", message: "This student has no case manager assigned. Assign one on the student's record first." });
    return;
  }

  const [cm] = await db
    .select({ id: staffTable.id, firstName: staffTable.firstName, lastName: staffTable.lastName, email: staffTable.email })
    .from(staffTable)
    .where(eq(staffTable.id, student.caseManagerId))
    .limit(1);
  const caseManagerName = cm ? `${cm.firstName ?? ""} ${cm.lastName ?? ""}`.trim() : null;

  const studentName = `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim();
  const note = buildHandoffNote({
    routedByName: authed.displayName ?? null,
    studentName,
    recommendation: body.recommendation,
    signal: body.signal,
    extraNote: body.extraNote,
  });

  // Upsert the handling row with assignment + structured note.
  const existingRows = await db
    .select()
    .from(actionItemHandlingTable)
    .where(and(
      eq(actionItemHandlingTable.districtId, districtId),
      eq(actionItemHandlingTable.itemId, itemId),
    ))
    .limit(1);
  const existing = existingRows[0];
  const fromState = existing?.state ?? null;

  let row: typeof actionItemHandlingTable.$inferSelect;
  if (existing) {
    const [upd] = await db
      .update(actionItemHandlingTable)
      .set({
        state: "handed_off",
        note,
        recommendedOwnerRole: "case_manager",
        assignedToRole: "case_manager",
        assignedToUserId: String(student.caseManagerId),
        updatedByUserId: authed.userId,
        updatedByName: authed.displayName ?? null,
        resolvedAt: null,
      })
      .where(and(
        eq(actionItemHandlingTable.districtId, districtId),
        eq(actionItemHandlingTable.itemId, itemId),
      ))
      .returning();
    row = upd;
  } else {
    const [ins] = await db
      .insert(actionItemHandlingTable)
      .values({
        districtId,
        itemId,
        state: "handed_off",
        note,
        recommendedOwnerRole: "case_manager",
        assignedToRole: "case_manager",
        assignedToUserId: String(student.caseManagerId),
        updatedByUserId: authed.userId,
        updatedByName: authed.displayName ?? null,
      })
      .returning();
    row = ins;
  }

  if (fromState !== "handed_off") {
    await db.insert(actionItemHandlingEventsTable).values({
      districtId,
      itemId,
      fromState,
      toState: "handed_off",
      note: `Handed off to case manager${caseManagerName ? ` ${caseManagerName}` : ""}.`,
      changedByUserId: authed.userId,
      changedByName: authed.displayName ?? null,
    });
  }

  res.json({
    data: rowToJson(row),
    caseManager: cm ? { id: cm.id, name: caseManagerName, email: cm.email } : null,
    student: { id: student.id, name: studentName },
  });
});

router.get("/action-item-handling/:itemId/history", requireHandlingStateAccess, async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (districtId == null) { res.status(403).json({ error: "no district scope" }); return; }
  const idCheck = ItemIdSchema.safeParse(req.params.itemId);
  if (!idCheck.success) { res.status(400).json({ error: "invalid item id" }); return; }
  const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);

  const rows = await db
    .select()
    .from(actionItemHandlingEventsTable)
    .where(and(
      eq(actionItemHandlingEventsTable.districtId, districtId),
      eq(actionItemHandlingEventsTable.itemId, idCheck.data),
    ))
    .orderBy(desc(actionItemHandlingEventsTable.changedAt))
    .limit(limit);

  res.json({
    data: rows.map(r => ({
      id: r.id,
      itemId: r.itemId,
      fromState: r.fromState,
      toState: r.toState,
      note: r.note,
      changedByUserId: r.changedByUserId,
      changedByName: r.changedByName,
      changedAt: r.changedAt instanceof Date ? r.changedAt.toISOString() : r.changedAt,
    })),
  });
});

/**
 * Aggregate read used by the dashboard "Where are we at risk?" pill —
 * returns one row per studentId with the worst non-default handling
 * state across all that student's items. Cheaper than a batch read of
 * every item for every student.
 */
router.post("/action-item-handling/aggregate-by-student", requireHandlingStateAccess, async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (districtId == null) { res.status(403).json({ error: "no district scope" }); return; }
  const schema = z.object({ studentIds: z.array(z.number().int().positive()).max(2000) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.studentIds.length === 0) { res.json({ data: [] }); return; }

  // Pull rows whose itemId encodes one of the requested studentIds. We
  // match by `risk:<sid>:`, `student:<sid>:`, `service-gap:<sid>:`,
  // and `deadline:<sid>:` prefixes — the canonical id forms.
  const ids = parsed.data.studentIds;
  const prefixes = ids.flatMap(sid => [
    `risk:${sid}:`, `student:${sid}:`, `service-gap:${sid}:`, `deadline:${sid}:`,
  ]);
  const rows = await db.execute(sql`
    SELECT item_id, state FROM action_item_handling
    WHERE district_id = ${districtId}
      AND state <> 'resolved'
      AND state <> 'needs_action'
      AND (${sql.raw(prefixes.map(p => `item_id LIKE ${"'" + p.replace(/'/g, "''") + "%'"}`).join(" OR "))})
  `);

  // Deterministic severity ordering for "worst" pick — must match the
  // frontend's HANDLING_SEVERITY in use-handling-state.ts.
  const SEV: Record<string, number> = {
    needs_action: 0, resolved: 1, recovery_scheduled: 2, handed_off: 3, under_review: 4, awaiting_confirmation: 5,
  };
  const out = new Map<number, string>();
  for (const r of rows.rows as { item_id: string; state: string }[]) {
    const m = r.item_id.match(/^(?:risk|student|service-gap|deadline):(\d+):/);
    if (!m) continue;
    const sid = Number(m[1]);
    const cur = out.get(sid);
    if (!cur || (SEV[r.state] ?? 0) > (SEV[cur] ?? 0)) out.set(sid, r.state);
  }
  res.json({ data: Array.from(out.entries()).map(([studentId, state]) => ({ studentId, state })) });
});

export default router;
