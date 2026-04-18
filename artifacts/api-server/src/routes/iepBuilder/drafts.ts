import { Router, type IRouter } from "express";
import { db, iepBuilderDraftsTable, staffTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getStaffIdFromReq } from "./shared";
import { assertStudentInCallerDistrict } from "../../lib/districtScope";
import { getEnforcedDistrictId, requireRoles, type AuthedRequest } from "../../middlewares/auth";

const requireStaffOnly = requireRoles(
  "admin", "case_manager", "bcba", "sped_teacher", "coordinator", "provider", "para",
);

// tenant-scope: district-join
const router: IRouter = Router();

interface DraftListRow {
  id: number;
  studentId: number;
  wizardStep: number;
  updatedAt: string;
  studentFirstName: string;
  studentLastName: string;
  grade: string | null;
  editorFirstName: string | null;
  editorLastName: string | null;
}

const DRAFT_LIST_SQL = (districtFilter: ReturnType<typeof sql> | null) => sql`
  SELECT
    d.id,
    d.student_id   AS "studentId",
    d.wizard_step  AS "wizardStep",
    d.updated_at   AS "updatedAt",
    s.first_name   AS "studentFirstName",
    s.last_name    AS "studentLastName",
    s.grade,
    st.first_name  AS "editorFirstName",
    st.last_name   AS "editorLastName"
  FROM iep_builder_drafts d
  JOIN students s   ON s.id = d.student_id
  JOIN schools  sch ON sch.id = s.school_id
  LEFT JOIN staff st ON st.id = d.staff_id
  ${districtFilter ?? sql``}
  ORDER BY d.updated_at DESC
`;

// GET /iep-builder/drafts — list all in-progress shared drafts in the caller's district
router.get("/iep-builder/drafts", requireStaffOnly, async (req, res): Promise<void> => {
  try {
    const did = getEnforcedDistrictId(req as AuthedRequest);
    const filter = did != null ? sql`WHERE sch.district_id = ${did}` : null;
    const result = await db.execute(DRAFT_LIST_SQL(filter));
    const rows = result.rows as unknown as DraftListRow[];
    res.json(rows.map(r => ({
      id: r.id,
      studentId: r.studentId,
      studentName: `${r.studentFirstName} ${r.studentLastName}`,
      grade: r.grade,
      wizardStep: r.wizardStep,
      updatedAt: new Date(r.updatedAt).toISOString(),
      lastEditorName: r.editorFirstName
        ? `${r.editorFirstName} ${r.editorLastName}`
        : null,
    })));
  } catch (e: unknown) {
    console.error("GET iep-builder/drafts error:", e);
    res.status(500).json({ error: "Failed to load drafts" });
  }
});

// GET /students/:studentId/iep-builder/draft — get the shared draft for a student
router.get("/students/:studentId/iep-builder/draft", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, studentId, res))) return;
    const rows = await db.select({
      id: iepBuilderDraftsTable.id,
      studentId: iepBuilderDraftsTable.studentId,
      staffId: iepBuilderDraftsTable.staffId,
      wizardStep: iepBuilderDraftsTable.wizardStep,
      formData: iepBuilderDraftsTable.formData,
      updatedAt: iepBuilderDraftsTable.updatedAt,
      editorFirstName: staffTable.firstName,
      editorLastName: staffTable.lastName,
    }).from(iepBuilderDraftsTable)
      .leftJoin(staffTable, eq(staffTable.id, iepBuilderDraftsTable.staffId))
      .where(eq(iepBuilderDraftsTable.studentId, studentId))
      .limit(1);
    if (rows.length === 0) {
      res.json(null);
      return;
    }
    const d = rows[0];
    res.json({
      id: d.id,
      studentId: d.studentId,
      staffId: d.staffId,
      wizardStep: d.wizardStep,
      formData: d.formData,
      updatedAt: d.updatedAt.toISOString(),
      lastEditorName: d.editorFirstName
        ? `${d.editorFirstName} ${d.editorLastName}`
        : null,
    });
  } catch (e: unknown) {
    console.error("GET iep-builder draft error:", e);
    res.status(500).json({ error: "Failed to load draft" });
  }
});

// PUT /students/:studentId/iep-builder/draft — atomic upsert (last-write-wins per student)
router.put("/students/:studentId/iep-builder/draft", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, studentId, res))) return;
    const staffId = getStaffIdFromReq(req);
    const { wizardStep, formData } = req.body as { wizardStep: unknown; formData: unknown };
    if (wizardStep == null || typeof wizardStep !== "number" || wizardStep < 1 || wizardStep > 5) {
      res.status(400).json({ error: "wizardStep must be 1-5" });
      return;
    }
    if (formData == null || typeof formData !== "object" || Array.isArray(formData)) {
      res.status(400).json({ error: "formData object required" });
      return;
    }
    const fd = formData as Record<string, unknown>;
    // Atomic upsert on the per-student unique constraint — race-free multi-user last-write-wins.
    // staffId uses undefined (not null) so Drizzle omits the field when the caller is unidentified,
    // allowing the DB default (NULL) on insert and preserving the existing value on conflict update.
    const [row] = await db.insert(iepBuilderDraftsTable)
      .values({ studentId, staffId: staffId ?? undefined, wizardStep, formData: fd })
      .onConflictDoUpdate({
        target: iepBuilderDraftsTable.studentId,
        set: {
          wizardStep,
          formData: fd,
          // Only overwrite staffId when the caller is identified.
          ...(staffId != null ? { staffId } : {}),
        },
      })
      .returning({ id: iepBuilderDraftsTable.id, updatedAt: iepBuilderDraftsTable.updatedAt });
    res.json({ id: row.id, updatedAt: row.updatedAt.toISOString() });
  } catch (e: unknown) {
    console.error("PUT iep-builder draft error:", e);
    res.status(500).json({ error: "Failed to save draft" });
  }
});

// DELETE /students/:studentId/iep-builder/draft — delete the shared draft for a student
router.delete("/students/:studentId/iep-builder/draft", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    if (isNaN(studentId)) { res.status(400).json({ error: "Invalid studentId" }); return; }
    if (!(await assertStudentInCallerDistrict(req as AuthedRequest, studentId, res))) return;
    await db.delete(iepBuilderDraftsTable)
      .where(eq(iepBuilderDraftsTable.studentId, studentId));
    res.json({ ok: true });
  } catch (e: unknown) {
    console.error("DELETE iep-builder draft error:", e);
    res.status(500).json({ error: "Failed to delete draft" });
  }
});

export default router;
