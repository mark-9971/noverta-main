import { Router, type IRouter } from "express";
import { db, iepBuilderDraftCommentsTable, staffTable } from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getStaffIdFromReq } from "./shared";
import { assertStudentInCallerDistrict } from "../../lib/districtScope";
import { requireRoles, type AuthedRequest } from "../../middlewares/auth";

const requireStaffOnly = requireRoles(
  "admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider", "para",
);

const router: IRouter = Router();

// GET /students/:studentId/iep-builder/draft/comments
router.get("/students/:studentId/iep-builder/draft/comments", requireStaffOnly, async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId as string, 10);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }
    if (!(await assertStudentInCallerDistrict(req as unknown as AuthedRequest, studentId, res))) return;
    const resolverStaff = alias(staffTable, "resolver_staff");
    const rows = await db.select({
      id: iepBuilderDraftCommentsTable.id,
      wizardStep: iepBuilderDraftCommentsTable.wizardStep,
      staffId: iepBuilderDraftCommentsTable.staffId,
      body: iepBuilderDraftCommentsTable.body,
      createdAt: iepBuilderDraftCommentsTable.createdAt,
      resolvedAt: iepBuilderDraftCommentsTable.resolvedAt,
      resolvedByStaffId: iepBuilderDraftCommentsTable.resolvedByStaffId,
      authorFirstName: staffTable.firstName,
      authorLastName: staffTable.lastName,
      resolverFirstName: resolverStaff.firstName,
      resolverLastName: resolverStaff.lastName,
    }).from(iepBuilderDraftCommentsTable)
      .leftJoin(staffTable, eq(staffTable.id, iepBuilderDraftCommentsTable.staffId))
      .leftJoin(resolverStaff, eq(resolverStaff.id, iepBuilderDraftCommentsTable.resolvedByStaffId))
      .where(eq(iepBuilderDraftCommentsTable.studentId, studentId))
      .orderBy(asc(iepBuilderDraftCommentsTable.createdAt));
    res.json(rows.map(r => ({
      id: r.id,
      wizardStep: r.wizardStep,
      staffId: r.staffId,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      authorName: r.authorFirstName ? `${r.authorFirstName} ${r.authorLastName}` : null,
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      resolvedByStaffId: r.resolvedByStaffId,
      resolvedByName: r.resolverFirstName ? `${r.resolverFirstName} ${r.resolverLastName}` : null,
    })));
  } catch (e: unknown) {
    console.error("GET iep-builder draft comments error:", e);
    res.status(500).json({ error: "Failed to load comments" });
  }
});

// POST /students/:studentId/iep-builder/draft/comments
router.post("/students/:studentId/iep-builder/draft/comments", requireStaffOnly, async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId as string, 10);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }
    if (!(await assertStudentInCallerDistrict(req as unknown as AuthedRequest, studentId, res))) return;
    const staffId = getStaffIdFromReq(req);
    const { wizardStep, body } = req.body as { wizardStep: unknown; body: unknown };
    if (typeof wizardStep !== "number" || wizardStep < 1 || wizardStep > 5) {
      res.status(400).json({ error: "wizardStep must be 1-5" });
      return;
    }
    if (typeof body !== "string" || body.trim().length === 0) {
      res.status(400).json({ error: "body required" });
      return;
    }
    if (body.length > 4000) {
      res.status(400).json({ error: "body too long (max 4000 chars)" });
      return;
    }
    let resolvedStaffId: number | null = null;
    let authorName: string | null = null;
    if (staffId != null) {
      const [s] = await db.select({
        id: staffTable.id,
        firstName: staffTable.firstName,
        lastName: staffTable.lastName,
      }).from(staffTable).where(eq(staffTable.id, staffId)).limit(1);
      if (s) {
        resolvedStaffId = s.id;
        authorName = `${s.firstName} ${s.lastName}`;
      }
    }
    const [row] = await db.insert(iepBuilderDraftCommentsTable)
      .values({ studentId, wizardStep, staffId: resolvedStaffId ?? undefined, body: body.trim() })
      .returning();
    res.status(201).json({
      id: row.id,
      wizardStep: row.wizardStep,
      staffId: row.staffId,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      authorName,
      resolvedAt: null,
      resolvedByStaffId: null,
      resolvedByName: null,
    });
  } catch (e: unknown) {
    console.error("POST iep-builder draft comment error:", e);
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// PATCH /students/:studentId/iep-builder/draft/comments/:commentId — toggle resolved
router.patch("/students/:studentId/iep-builder/draft/comments/:commentId", requireStaffOnly, async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId as string, 10);
    const commentId = parseInt(req.params.commentId as string, 10);
    if (isNaN(studentId) || isNaN(commentId)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!(await assertStudentInCallerDistrict(req as unknown as AuthedRequest, studentId, res))) return;
    const staffId = getStaffIdFromReq(req);
    const { resolved } = req.body as { resolved: unknown };
    if (typeof resolved !== "boolean") {
      res.status(400).json({ error: "resolved (boolean) required" });
      return;
    }
    const [existing] = await db.select({ id: iepBuilderDraftCommentsTable.id })
      .from(iepBuilderDraftCommentsTable)
      .where(and(
        eq(iepBuilderDraftCommentsTable.id, commentId),
        eq(iepBuilderDraftCommentsTable.studentId, studentId),
      )).limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const [row] = await db.update(iepBuilderDraftCommentsTable)
      .set({
        resolvedAt: resolved ? sql`now()` : null,
        resolvedByStaffId: resolved ? (staffId ?? null) : null,
      })
      .where(eq(iepBuilderDraftCommentsTable.id, commentId))
      .returning({
        resolvedAt: iepBuilderDraftCommentsTable.resolvedAt,
        resolvedByStaffId: iepBuilderDraftCommentsTable.resolvedByStaffId,
      });
    let resolvedByName: string | null = null;
    if (row.resolvedByStaffId != null) {
      const [s] = await db.select({ firstName: staffTable.firstName, lastName: staffTable.lastName })
        .from(staffTable).where(eq(staffTable.id, row.resolvedByStaffId)).limit(1);
      if (s) resolvedByName = `${s.firstName} ${s.lastName}`;
    }
    res.json({
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      resolvedByStaffId: row.resolvedByStaffId,
      resolvedByName,
    });
  } catch (e: unknown) {
    console.error("PATCH iep-builder draft comment error:", e);
    res.status(500).json({ error: "Failed to update comment" });
  }
});

// DELETE /students/:studentId/iep-builder/draft/comments/:commentId — author can delete their own
router.delete("/students/:studentId/iep-builder/draft/comments/:commentId", requireStaffOnly, async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId as string, 10);
    const commentId = parseInt(req.params.commentId as string, 10);
    if (isNaN(studentId) || isNaN(commentId)) { res.status(400).json({ error: "Invalid id" }); return; }
    if (!(await assertStudentInCallerDistrict(req as unknown as AuthedRequest, studentId, res))) return;
    const staffId = getStaffIdFromReq(req);
    if (staffId == null) { res.status(403).json({ error: "Not allowed" }); return; }
    const [existing] = await db.select({ staffId: iepBuilderDraftCommentsTable.staffId })
      .from(iepBuilderDraftCommentsTable)
      .where(and(
        eq(iepBuilderDraftCommentsTable.id, commentId),
        eq(iepBuilderDraftCommentsTable.studentId, studentId),
      )).limit(1);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    if (existing.staffId !== staffId) { res.status(403).json({ error: "Only the author may delete this comment" }); return; }
    await db.delete(iepBuilderDraftCommentsTable)
      .where(eq(iepBuilderDraftCommentsTable.id, commentId));
    res.json({ ok: true });
  } catch (e: unknown) {
    console.error("DELETE iep-builder draft comment error:", e);
    res.status(500).json({ error: "Failed to delete comment" });
  }
});

export default router;
