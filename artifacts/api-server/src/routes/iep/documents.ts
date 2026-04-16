import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  iepDocumentsTable,
  transitionPlansTable, transitionGoalsTable, transitionAgencyReferralsTable,
} from "@workspace/db";
import { eq, desc, and, isNull } from "drizzle-orm";
import { logAudit } from "../../lib/auditLog";
import { getActiveSchoolYearIdForStudent } from "../../lib/activeSchoolYear";
import { createAutoVersion } from "../../lib/documentVersioning";
import { getEnforcedDistrictId, type AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

router.get("/students/:studentId/iep-documents", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const docs = await db.select().from(iepDocumentsTable)
      .where(eq(iepDocumentsTable.studentId, studentId))
      .orderBy(desc(iepDocumentsTable.iepStartDate));
    logAudit(req, {
      action: "read",
      targetTable: "iep_documents",
      studentId: studentId,
      summary: `Viewed ${docs.length} IEP documents for student #${studentId}`,
    });
    res.json(docs.map(d => ({ ...d, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() })));
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch IEP documents" });
  }
});

router.get("/iep-documents/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [doc] = await db.select().from(iepDocumentsTable).where(eq(iepDocumentsTable.id, id));
    if (!doc) { res.status(404).json({ error: "Not found" }); return; }

    const linkedPlans = await db.select()
      .from(transitionPlansTable)
      .where(and(eq(transitionPlansTable.iepDocumentId, id), isNull(transitionPlansTable.deletedAt)));

    let transitionPlanData = null;
    if (linkedPlans.length > 0) {
      const plan = linkedPlans[0];
      const goals = await db.select().from(transitionGoalsTable)
        .where(and(eq(transitionGoalsTable.transitionPlanId, plan.id), isNull(transitionGoalsTable.deletedAt)));
      const refs = await db.select().from(transitionAgencyReferralsTable)
        .where(and(eq(transitionAgencyReferralsTable.transitionPlanId, plan.id), isNull(transitionAgencyReferralsTable.deletedAt)));
      transitionPlanData = {
        ...plan,
        goals: goals.map(g => ({ ...g, createdAt: g.createdAt.toISOString(), updatedAt: g.updatedAt.toISOString() })),
        agencyReferrals: refs.map(r => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() })),
        createdAt: plan.createdAt.toISOString(),
        updatedAt: plan.updatedAt.toISOString(),
      };
    }

    logAudit(req, {
      action: "read",
      targetTable: "iep_documents",
      targetId: id,
      studentId: doc.studentId,
      summary: `Viewed IEP document #${id} for student #${doc.studentId}`,
    });
    res.json({ ...doc, transitionPlan: transitionPlanData, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to fetch IEP document" });
  }
});

router.post("/students/:studentId/iep-documents", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { iepStartDate, iepEndDate, meetingDate, studentConcerns, parentConcerns, teamVision,
            plaafpAcademic, plaafpBehavioral, plaafpCommunication, plaafpAdditional,
            transitionAssessment, transitionPostsecGoals, transitionServices, transitionAgencies,
            esyEligible, esyServices, esyJustification,
            assessmentParticipation, assessmentAccommodations, alternateAssessmentJustification,
            scheduleModifications, transportationServices, preparedBy } = req.body;
    if (!iepStartDate || !iepEndDate) { res.status(400).json({ error: "iepStartDate and iepEndDate are required" }); return; }
    const iepSchoolYearId = await getActiveSchoolYearIdForStudent(studentId);
    const [doc] = await db.insert(iepDocumentsTable).values({
      studentId, iepStartDate, iepEndDate, meetingDate,
      studentConcerns, parentConcerns, teamVision,
      plaafpAcademic, plaafpBehavioral, plaafpCommunication, plaafpAdditional,
      transitionAssessment, transitionPostsecGoals, transitionServices, transitionAgencies,
      esyEligible: esyEligible ?? null, esyServices, esyJustification,
      assessmentParticipation, assessmentAccommodations, alternateAssessmentJustification,
      scheduleModifications, transportationServices, preparedBy: preparedBy || null,
      ...(iepSchoolYearId != null ? { schoolYearId: iepSchoolYearId } : {}),
    }).returning();
    logAudit(req, {
      action: "create",
      targetTable: "iep_documents",
      targetId: doc.id,
      studentId: studentId,
      summary: `Created IEP document #${doc.id} for student #${studentId} (${iepStartDate} - ${iepEndDate})`,
      newValues: { iepStartDate, iepEndDate, meetingDate } as Record<string, unknown>,
    });
    res.status(201).json({ ...doc, createdAt: doc.createdAt.toISOString(), updatedAt: doc.updatedAt.toISOString() });
  } catch (e: any) {
    console.error("POST iep-document error:", e);
    res.status(500).json({ error: "Failed to create IEP document" });
  }
});

router.patch("/iep-documents/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const updates: any = {};
    for (const key of ["iepStartDate","iepEndDate","meetingDate","status","studentConcerns","parentConcerns","teamVision",
                        "plaafpAcademic","plaafpBehavioral","plaafpCommunication","plaafpAdditional",
                        "transitionAssessment","transitionPostsecGoals","transitionServices","transitionAgencies",
                        "esyEligible","esyServices","esyJustification",
                        "assessmentParticipation","assessmentAccommodations","alternateAssessmentJustification",
                        "scheduleModifications","transportationServices","preparedBy","active"]) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [oldDoc] = await db.select().from(iepDocumentsTable).where(eq(iepDocumentsTable.id, id));
    const [updated] = await db.update(iepDocumentsTable).set(updates).where(eq(iepDocumentsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    const oldVals = oldDoc ? (Object.fromEntries(Object.keys(updates).map(k => [k, (oldDoc as Record<string, unknown>)[k]]))) : null;
    logAudit(req, {
      action: "update",
      targetTable: "iep_documents",
      targetId: id,
      studentId: updated.studentId,
      summary: `Updated IEP document #${id}`,
      oldValues: oldVals,
      newValues: updates as Record<string, unknown>,
    });
    const authed = req as AuthedRequest;
    const districtId = getEnforcedDistrictId(authed);
    if (districtId) {
      createAutoVersion({
        documentType: "iep",
        documentId: id,
        studentId: updated.studentId,
        districtId,
        authorUserId: authed.userId || "system",
        authorName: authed.displayName || "System",
        title: `IEP Document #${id} updated`,
        oldValues: oldVals,
        newValues: updates as Record<string, unknown>,
      });
    }
    res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to update IEP document" });
  }
});

router.delete("/iep-documents/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [oldDoc] = await db.select().from(iepDocumentsTable).where(eq(iepDocumentsTable.id, id));
    await db.delete(iepDocumentsTable).where(eq(iepDocumentsTable.id, id));
    logAudit(req, {
      action: "delete",
      targetTable: "iep_documents",
      targetId: id,
      studentId: oldDoc?.studentId,
      summary: `Deleted IEP document #${id}`,
      oldValues: oldDoc ? { iepStartDate: oldDoc.iepStartDate, iepEndDate: oldDoc.iepEndDate, status: oldDoc.status } as Record<string, unknown> : null,
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Failed to delete IEP document" });
  }
});

export default router;
