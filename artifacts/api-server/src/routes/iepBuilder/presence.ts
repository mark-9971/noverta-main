import { Router, type IRouter } from "express";
import { db, staffTable } from "@workspace/db";
import { inArray } from "drizzle-orm";
import { getStaffIdFromReq } from "./shared";
import { assertStudentInCallerDistrict } from "../../lib/districtScope";
import type { AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

const PRESENCE_TTL_MS = 30_000;

const presence = new Map<number, Map<number, number>>();

function pruneStudent(studentId: number, now: number): Map<number, number> | null {
  const entries = presence.get(studentId);
  if (!entries) return null;
  for (const [staffId, lastSeen] of entries) {
    if (now - lastSeen > PRESENCE_TTL_MS) entries.delete(staffId);
  }
  if (entries.size === 0) {
    presence.delete(studentId);
    return null;
  }
  return entries;
}

router.post("/students/:studentId/iep-builder/presence", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId as string, 10);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }
    if (!(await assertStudentInCallerDistrict(req as unknown as AuthedRequest, studentId, res))) return;
    const staffId = getStaffIdFromReq(req);
    if (staffId == null) { res.json({ ok: true }); return; }
    const now = Date.now();
    let entries = presence.get(studentId);
    if (!entries) {
      entries = new Map();
      presence.set(studentId, entries);
    }
    entries.set(staffId, now);
    res.json({ ok: true });
  } catch (e: unknown) {
    console.error("POST iep-builder presence error:", e);
    res.status(500).json({ error: "Failed to record presence" });
  }
});

router.delete("/students/:studentId/iep-builder/presence", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId as string, 10);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }
    if (!(await assertStudentInCallerDistrict(req as unknown as AuthedRequest, studentId, res))) return;
    const staffId = getStaffIdFromReq(req);
    const entries = presence.get(studentId);
    if (entries && staffId != null) {
      entries.delete(staffId);
      if (entries.size === 0) presence.delete(studentId);
    }
    res.json({ ok: true });
  } catch (e: unknown) {
    console.error("DELETE iep-builder presence error:", e);
    res.status(500).json({ error: "Failed to clear presence" });
  }
});

router.get("/students/:studentId/iep-builder/presence", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId as string, 10);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }
    if (!(await assertStudentInCallerDistrict(req as unknown as AuthedRequest, studentId, res))) return;
    const callerStaffId = getStaffIdFromReq(req);
    const now = Date.now();
    const entries = pruneStudent(studentId, now);
    if (!entries) { res.json({ editors: [] }); return; }
    const otherStaffIds = [...entries.keys()].filter(id => id !== callerStaffId);
    if (otherStaffIds.length === 0) { res.json({ editors: [] }); return; }
    const rows = await db.select({
      id: staffTable.id,
      firstName: staffTable.firstName,
      lastName: staffTable.lastName,
    }).from(staffTable).where(inArray(staffTable.id, otherStaffIds));
    const editors = rows.map(r => ({
      staffId: r.id,
      name: `${r.firstName} ${r.lastName}`.trim(),
      lastSeenAt: new Date(entries.get(r.id) ?? now).toISOString(),
    }));
    res.json({ editors });
  } catch (e: unknown) {
    console.error("GET iep-builder presence error:", e);
    res.status(500).json({ error: "Failed to load presence" });
  }
});

export default router;
