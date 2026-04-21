// tenant-scope: district-direct (district_id column on action_item_dismissals)
/**
 * Task #951 — Shared Action Center dismiss/snooze.
 *
 * Sibling router to actionItemHandling. Backs the cross-user / cross-device
 * "this item is hidden for our district" behavior on the Action Center.
 *
 * Strict district scoping — every read and write is keyed by
 * `getEnforcedDistrictId(req)`, so a caller in district A can neither
 * read nor write district B's dismissal state, even if they guess the
 * itemId.
 *
 * Endpoints:
 *   GET    /action-item-dismissals?ids=a,b,c     batch read (querystring)
 *   POST   /action-item-dismissals/batch         batch read (JSON body, for >50 ids)
 *   POST   /action-item-dismissals               upsert dismiss/snooze for one itemId
 *   DELETE /action-item-dismissals/:itemId       restore (delete the row)
 *
 * `/batch` and `?ids=` filter out rows whose `dismissed_until` has passed,
 * so an expired snooze automatically reappears for everyone in the district.
 */
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { actionItemDismissalsTable } from "@workspace/db";
import { and, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod/v4";
import { requireRoles, getEnforcedDistrictId } from "../middlewares/auth";
import type { AuthedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// Mirrors the handling-state allowlist. Para and student/parent roles
// have no Action Center surface so they don't need this either.
const requireDismissalAccess = requireRoles(
  "admin", "coordinator", "case_manager", "sped_teacher", "bcba", "provider",
);

const ITEM_ID_PATTERN = /^[a-z][a-z0-9-]*:[A-Za-z0-9:_-]+$/;
const ItemIdSchema = z.string().min(3).max(200).regex(ITEM_ID_PATTERN, "invalid item id");

const DISMISSAL_STATES = ["dismissed", "snoozed"] as const;

const SnapshotSchema = z.object({
  title: z.string().max(500).optional().nullable(),
  detail: z.string().max(2000).optional().nullable(),
}).optional().nullable();

const UpsertBodySchema = z.object({
  itemId: ItemIdSchema,
  state: z.enum(DISMISSAL_STATES),
  /** ISO timestamp; null/omitted ⇒ indefinite (only valid for 'dismissed'). */
  dismissedUntil: z.string().datetime().optional().nullable(),
  durationLabel: z.string().max(64).optional().nullable(),
  snapshot: SnapshotSchema,
});

const BatchBodySchema = z.object({
  ids: z.array(ItemIdSchema).max(500),
});

function rowToJson(r: typeof actionItemDismissalsTable.$inferSelect) {
  return {
    itemId: r.itemId,
    state: r.state as "dismissed" | "snoozed",
    dismissedUntil: r.dismissedUntil instanceof Date ? r.dismissedUntil.toISOString() : r.dismissedUntil,
    durationLabel: r.durationLabel,
    snapshot: {
      title: r.snapshotTitle ?? "",
      detail: r.snapshotDetail ?? "",
    },
    updatedByUserId: r.updatedByUserId,
    updatedByName: r.updatedByName,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  };
}

async function readActiveByIds(districtId: number, ids: string[]) {
  if (ids.length === 0) return [];
  const uniqIds = Array.from(new Set(ids));
  const now = new Date();
  return await db
    .select()
    .from(actionItemDismissalsTable)
    .where(and(
      eq(actionItemDismissalsTable.districtId, districtId),
      inArray(actionItemDismissalsTable.itemId, uniqIds),
      or(
        isNull(actionItemDismissalsTable.dismissedUntil),
        gt(actionItemDismissalsTable.dismissedUntil, now),
      ),
    ));
}

router.get("/action-item-dismissals", requireDismissalAccess, async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (districtId == null) { res.status(403).json({ error: "no district scope" }); return; }

  const raw = String(req.query.ids ?? "").trim();
  const ids = raw.length === 0 ? [] : raw.split(",").map(s => s.trim()).filter(Boolean);
  for (const id of ids) {
    if (!ITEM_ID_PATTERN.test(id) || id.length > 200) {
      res.status(400).json({ error: "invalid item id", id });
      return;
    }
  }
  const rows = await readActiveByIds(districtId, ids);
  res.json({ data: rows.map(rowToJson) });
});

router.post("/action-item-dismissals/batch", requireDismissalAccess, async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (districtId == null) { res.status(403).json({ error: "no district scope" }); return; }
  const parsed = BatchBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const rows = await readActiveByIds(districtId, parsed.data.ids);
  res.json({ data: rows.map(rowToJson) });
});

router.post("/action-item-dismissals", requireDismissalAccess, async (req, res): Promise<void> => {
  const authed = req as AuthedRequest;
  const districtId = getEnforcedDistrictId(authed);
  if (districtId == null) { res.status(403).json({ error: "no district scope" }); return; }

  const parsed = UpsertBodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const body = parsed.data;

  // Snooze without an expiration would be a permanent dismiss — reject so
  // clients are explicit and the UI labels stay honest.
  if (body.state === "snoozed" && !body.dismissedUntil) {
    res.status(400).json({ error: "snoozed requires dismissedUntil" });
    return;
  }

  const dismissedUntil = body.dismissedUntil ? new Date(body.dismissedUntil) : null;
  const snapshotTitle = body.snapshot?.title ?? null;
  const snapshotDetail = body.snapshot?.detail ?? null;

  // Upsert on (district_id, item_id). ON CONFLICT keeps the original
  // created_at / updated_by_user_id but refreshes everything else, so
  // re-snoozing an item bumps the expiration without losing audit info.
  const [row] = await db
    .insert(actionItemDismissalsTable)
    .values({
      districtId,
      itemId: body.itemId,
      state: body.state,
      dismissedUntil,
      snapshotTitle,
      snapshotDetail,
      durationLabel: body.durationLabel ?? null,
      updatedByUserId: authed.userId,
      updatedByName: authed.displayName ?? null,
    })
    .onConflictDoUpdate({
      target: [actionItemDismissalsTable.districtId, actionItemDismissalsTable.itemId],
      set: {
        state: body.state,
        dismissedUntil,
        snapshotTitle,
        snapshotDetail,
        durationLabel: body.durationLabel ?? null,
        updatedByUserId: authed.userId,
        updatedByName: authed.displayName ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json({ data: row ? rowToJson(row) : null });
});

router.delete("/action-item-dismissals/:itemId", requireDismissalAccess, async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (districtId == null) { res.status(403).json({ error: "no district scope" }); return; }
  const idCheck = ItemIdSchema.safeParse(req.params.itemId);
  if (!idCheck.success) { res.status(400).json({ error: "invalid item id" }); return; }

  await db
    .delete(actionItemDismissalsTable)
    .where(and(
      eq(actionItemDismissalsTable.districtId, districtId),
      eq(actionItemDismissalsTable.itemId, idCheck.data),
    ));
  res.json({ ok: true });
});

/** Bulk restore — used by the "Restore all" button in the hidden footer. */
router.post("/action-item-dismissals/restore-all", requireDismissalAccess, async (req, res): Promise<void> => {
  const districtId = getEnforcedDistrictId(req as AuthedRequest);
  if (districtId == null) { res.status(403).json({ error: "no district scope" }); return; }
  const schema = z.object({ ids: z.array(ItemIdSchema).max(500).optional() });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const ids = parsed.data.ids;
  if (ids && ids.length > 0) {
    await db.delete(actionItemDismissalsTable).where(and(
      eq(actionItemDismissalsTable.districtId, districtId),
      inArray(actionItemDismissalsTable.itemId, ids),
    ));
  } else {
    // No ids provided ⇒ wipe every dismissal in the district. This
    // matches the "Restore all" intent in the footer (which only knows
    // about currently-hidden items).
    await db.delete(actionItemDismissalsTable).where(eq(actionItemDismissalsTable.districtId, districtId));
  }
  res.json({ ok: true });
});

export default router;
