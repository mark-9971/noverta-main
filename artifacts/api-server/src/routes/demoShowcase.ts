/**
 * Demo Showcase Cases — read-only surfacing of the V2 overlay's
 * curated `demo_showcase_cases` table.
 *
 * The Seed Overhaul V2 overlay (W5) writes ~18 rows per district
 * across 8 canonical categories so the demo flow always lands on
 * the same pedagogical moments. This route exposes those rows
 * grouped by category, with student names resolved where
 * applicable, so /admin/demo-readiness can render a "Spotlight
 * cases" panel.
 *
 * Read-only; never mutates overlay state. Mirrors the auth model
 * of /admin/pilot-readiness (district admin + scoped to caller's
 * district).
 */
import { Router, type IRouter, type Request, type Response } from "express";
import { inArray } from "drizzle-orm";
import { requireMinRole } from "../middlewares/auth";
import { resolveDistrictIdForCaller } from "../lib/resolveDistrictForCaller";
import {
  db,
  studentsTable,
  alertsTable,
  scheduleBlocksTable,
  compensatoryObligationsTable,
} from "@workspace/db";
import { listShowcaseCases, SHOWCASE_CATEGORIES } from "@workspace/db/v2/overlay";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const adminOnly = requireMinRole("admin");

interface SpotlightStudent {
  id: number;
  firstName: string | null;
  lastName: string | null;
  grade: string | null;
}

interface SpotlightCase {
  id: number;
  category: string;
  subjectKind: string;
  subjectId: number;
  headline: string | null;
  payload: Record<string, unknown>;
  selectionOrder: number;
  student: SpotlightStudent | null;
}

interface SpotlightResponse {
  generatedAt: string | null;
  runId: string | null;
  totalRows: number;
  categories: readonly string[];
  byCategory: Record<string, SpotlightCase[]>;
}

router.get(
  "/admin/demo/showcase-cases",
  adminOnly,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const districtId = await resolveDistrictIdForCaller(req);
      if (!districtId) {
        res.status(403).json({ error: "Unable to determine district" });
        return;
      }

      const rows = await listShowcaseCases(db, districtId);
      const empty: SpotlightResponse = {
        generatedAt: null,
        runId: null,
        totalRows: 0,
        categories: SHOWCASE_CATEGORIES,
        byCategory: Object.fromEntries(SHOWCASE_CATEGORIES.map((c: string) => [c, []])),
      };
      if (rows.length === 0) {
        res.json(empty);
        return;
      }

      // Resolve studentId for each row. The overlay puts studentId in
      // payload for alert/schedule_block/comp_obligation/student_via_payload
      // shapes; for "student" subjectKind, subjectId IS the studentId.
      // For handling_state rows (provider_overloaded / parent_followup) the
      // subject is staff-shaped, not student-shaped — we leave student null.
      const alertSubjectIds: number[] = [];
      const blockSubjectIds: number[] = [];
      const compSubjectIds: number[] = [];
      for (const r of rows) {
        const payloadSid =
          typeof (r.payload as { studentId?: unknown })?.studentId === "number"
            ? ((r.payload as { studentId: number }).studentId)
            : null;
        if (payloadSid != null) continue;
        if (r.subjectKind === "alert") alertSubjectIds.push(r.subjectId);
        if (r.subjectKind === "schedule_block") blockSubjectIds.push(r.subjectId);
        if (r.subjectKind === "comp_obligation") compSubjectIds.push(r.subjectId);
      }

      const [alertJoin, blockJoin, compJoin] = await Promise.all([
        alertSubjectIds.length
          ? db
              .select({ id: alertsTable.id, studentId: alertsTable.studentId })
              .from(alertsTable)
              .where(inArray(alertsTable.id, alertSubjectIds))
          : Promise.resolve([] as { id: number; studentId: number | null }[]),
        blockSubjectIds.length
          ? db
              .select({ id: scheduleBlocksTable.id, studentId: scheduleBlocksTable.studentId })
              .from(scheduleBlocksTable)
              .where(inArray(scheduleBlocksTable.id, blockSubjectIds))
          : Promise.resolve([] as { id: number; studentId: number | null }[]),
        compSubjectIds.length
          ? db
              .select({ id: compensatoryObligationsTable.id, studentId: compensatoryObligationsTable.studentId })
              .from(compensatoryObligationsTable)
              .where(inArray(compensatoryObligationsTable.id, compSubjectIds))
          : Promise.resolve([] as { id: number; studentId: number | null }[]),
      ]);

      const alertMap = new Map(alertJoin.map((r) => [r.id, r.studentId]));
      const blockMap = new Map(blockJoin.map((r) => [r.id, r.studentId]));
      const compMap = new Map(compJoin.map((r) => [r.id, r.studentId]));

      const resolveStudentId = (
        kind: string,
        subjectId: number,
        payload: Record<string, unknown>,
      ): number | null => {
        if (kind === "student") return subjectId;
        const payloadSid =
          typeof payload?.studentId === "number" ? (payload.studentId as number) : null;
        if (payloadSid != null) return payloadSid;
        if (kind === "alert") return alertMap.get(subjectId) ?? null;
        if (kind === "schedule_block") return blockMap.get(subjectId) ?? null;
        if (kind === "comp_obligation") return compMap.get(subjectId) ?? null;
        return null;
      };

      const studentIds = new Set<number>();
      for (const r of rows) {
        const sid = resolveStudentId(r.subjectKind, r.subjectId, r.payload as Record<string, unknown>);
        if (sid != null) studentIds.add(sid);
      }

      const studentRows = studentIds.size
        ? await db
            .select({
              id: studentsTable.id,
              firstName: studentsTable.firstName,
              lastName: studentsTable.lastName,
              grade: studentsTable.grade,
            })
            .from(studentsTable)
            .where(inArray(studentsTable.id, Array.from(studentIds)))
        : [];
      const studentMap = new Map(studentRows.map((s) => [s.id, s]));

      const byCategory: Record<string, SpotlightCase[]> = Object.fromEntries(
        SHOWCASE_CATEGORIES.map((c: string) => [c, [] as SpotlightCase[]]),
      );
      // Surface __fallback__ if present so the panel can flag thin
      // overlay runs explicitly rather than silently skipping rows.
      byCategory["__fallback__"] = [];

      for (const r of rows) {
        const sid = resolveStudentId(
          r.subjectKind,
          r.subjectId,
          r.payload as Record<string, unknown>,
        );
        const studentRow = sid != null ? studentMap.get(sid) : undefined;
        const bucket = byCategory[r.category] ?? (byCategory[r.category] = []);
        bucket.push({
          id: r.id,
          category: r.category,
          subjectKind: r.subjectKind,
          subjectId: r.subjectId,
          headline: r.headline,
          payload: (r.payload ?? {}) as Record<string, unknown>,
          selectionOrder: r.selectionOrder,
          student: studentRow
            ? {
                id: studentRow.id,
                firstName: studentRow.firstName,
                lastName: studentRow.lastName,
                grade: studentRow.grade,
              }
            : null,
        });
      }

      // Pick generatedAt/runId from the most-recent row (rows share a runId
      // post-rewrite, but be defensive about ordering).
      let generatedAt: Date | null = null;
      let runId: string | null = null;
      for (const r of rows) {
        if (!generatedAt || r.createdAt > generatedAt) {
          generatedAt = r.createdAt;
          runId = r.runId;
        }
      }

      const response: SpotlightResponse = {
        generatedAt: generatedAt ? generatedAt.toISOString() : null,
        runId,
        totalRows: rows.length,
        categories: SHOWCASE_CATEGORIES,
        byCategory,
      };
      res.json(response);
    } catch (err) {
      logger.error({ err }, "Failed to load demo showcase cases");
      res.status(500).json({ error: "Failed to load showcase cases" });
    }
  },
);

export default router;
