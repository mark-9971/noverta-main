import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  fbasTable, fbaObservationsTable, functionalAnalysesTable,
  behaviorInterventionPlansTable, studentsTable, staffTable,
  behaviorTargetsTable
} from "@workspace/db";
import { eq, desc, and, sql, asc, max } from "drizzle-orm";

const router: IRouter = Router();

function isoDate(d: Date) { return d.toISOString(); }

router.get("/students/:studentId/fbas", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const fbas = await db.select({
      id: fbasTable.id,
      studentId: fbasTable.studentId,
      conductedBy: fbasTable.conductedBy,
      targetBehavior: fbasTable.targetBehavior,
      operationalDefinition: fbasTable.operationalDefinition,
      status: fbasTable.status,
      referralDate: fbasTable.referralDate,
      startDate: fbasTable.startDate,
      completionDate: fbasTable.completionDate,
      hypothesizedFunction: fbasTable.hypothesizedFunction,
      createdAt: fbasTable.createdAt,
      updatedAt: fbasTable.updatedAt,
      conductedByName: sql<string>`${staffTable.firstName} || ' ' || ${staffTable.lastName}`,
    })
      .from(fbasTable)
      .leftJoin(staffTable, eq(fbasTable.conductedBy, staffTable.id))
      .where(eq(fbasTable.studentId, studentId))
      .orderBy(desc(fbasTable.createdAt));
    res.json(fbas.map(f => ({ ...f, createdAt: isoDate(f.createdAt), updatedAt: isoDate(f.updatedAt) })));
  } catch (e: any) {
    console.error("GET fbas error:", e);
    res.status(500).json({ error: "Failed to fetch FBAs" });
  }
});

router.post("/students/:studentId/fbas", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { targetBehavior, operationalDefinition, conductedBy, referralReason, referralDate,
      settingDescription, status } = req.body;
    if (!targetBehavior || !operationalDefinition) {
      res.status(400).json({ error: "targetBehavior and operationalDefinition are required" });
      return;
    }
    const [fba] = await db.insert(fbasTable).values({
      studentId, targetBehavior, operationalDefinition,
      conductedBy: conductedBy || null,
      referralReason: referralReason || null,
      referralDate: referralDate || null,
      settingDescription: settingDescription || null,
      status: status || "draft",
    }).returning();
    res.status(201).json({ ...fba, createdAt: isoDate(fba.createdAt), updatedAt: isoDate(fba.updatedAt) });
  } catch (e: any) {
    console.error("POST fba error:", e);
    res.status(500).json({ error: "Failed to create FBA" });
  }
});

router.get("/fbas/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [fba] = await db.select().from(fbasTable).where(eq(fbasTable.id, id));
    if (!fba) { res.status(404).json({ error: "FBA not found" }); return; }
    res.json({ ...fba, createdAt: isoDate(fba.createdAt), updatedAt: isoDate(fba.updatedAt) });
  } catch (e: any) {
    console.error("GET fba error:", e);
    res.status(500).json({ error: "Failed to fetch FBA" });
  }
});

router.patch("/fbas/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const allowed = [
      "targetBehavior", "operationalDefinition", "status", "conductedBy",
      "referralReason", "referralDate", "startDate", "completionDate",
      "settingDescription", "indirectMethods", "indirectFindings",
      "directMethods", "directFindings", "hypothesizedFunction",
      "hypothesisNarrative", "recommendations"
    ];
    const updates: any = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [updated] = await db.update(fbasTable).set(updates).where(eq(fbasTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "FBA not found" }); return; }
    res.json({ ...updated, createdAt: isoDate(updated.createdAt), updatedAt: isoDate(updated.updatedAt) });
  } catch (e: any) {
    console.error("PATCH fba error:", e);
    res.status(500).json({ error: "Failed to update FBA" });
  }
});

router.get("/fbas/:fbaId/observations", async (req, res): Promise<void> => {
  try {
    const fbaId = parseInt(req.params.fbaId);
    const obs = await db.select().from(fbaObservationsTable)
      .where(eq(fbaObservationsTable.fbaId, fbaId))
      .orderBy(asc(fbaObservationsTable.observationDate), asc(fbaObservationsTable.observationTime));
    res.json(obs.map(o => ({ ...o, createdAt: isoDate(o.createdAt) })));
  } catch (e: any) {
    console.error("GET observations error:", e);
    res.status(500).json({ error: "Failed to fetch observations" });
  }
});

router.post("/fbas/:fbaId/observations", async (req, res): Promise<void> => {
  try {
    const fbaId = parseInt(req.params.fbaId);
    const { observerId, observationDate, observationTime, durationMinutes, setting, activity,
      antecedent, antecedentCategory, behavior, behaviorIntensity, behaviorDurationSeconds,
      consequence, consequenceCategory, perceivedFunction, notes } = req.body;
    if (!antecedent || !behavior || !consequence || !observationDate) {
      res.status(400).json({ error: "antecedent, behavior, consequence, and observationDate are required" });
      return;
    }
    const [obs] = await db.insert(fbaObservationsTable).values({
      fbaId, observerId: observerId || null,
      observationDate, observationTime: observationTime || null,
      durationMinutes: durationMinutes || null,
      setting: setting || null, activity: activity || null,
      antecedent, antecedentCategory: antecedentCategory || null,
      behavior, behaviorIntensity: behaviorIntensity || null,
      behaviorDurationSeconds: behaviorDurationSeconds || null,
      consequence, consequenceCategory: consequenceCategory || null,
      perceivedFunction: perceivedFunction || null,
      notes: notes || null,
    }).returning();
    res.status(201).json({ ...obs, createdAt: isoDate(obs.createdAt) });
  } catch (e: any) {
    console.error("POST observation error:", e);
    res.status(500).json({ error: "Failed to create observation" });
  }
});

router.delete("/observations/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(fbaObservationsTable).where(eq(fbaObservationsTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "Observation not found" }); return; }
    res.json({ success: true });
  } catch (e: any) {
    console.error("DELETE observation error:", e);
    res.status(500).json({ error: "Failed to delete observation" });
  }
});

router.get("/fbas/:fbaId/observations/summary", async (req, res): Promise<void> => {
  try {
    const fbaId = parseInt(req.params.fbaId);
    const obs = await db.select().from(fbaObservationsTable)
      .where(eq(fbaObservationsTable.fbaId, fbaId));

    const functionCounts: Record<string, number> = {};
    const antecedentCounts: Record<string, number> = {};
    const consequenceCounts: Record<string, number> = {};
    const hourCounts: Record<string, number> = {};

    for (const o of obs) {
      if (o.perceivedFunction) functionCounts[o.perceivedFunction] = (functionCounts[o.perceivedFunction] || 0) + 1;
      if (o.antecedentCategory) antecedentCounts[o.antecedentCategory] = (antecedentCounts[o.antecedentCategory] || 0) + 1;
      if (o.consequenceCategory) consequenceCounts[o.consequenceCategory] = (consequenceCounts[o.consequenceCategory] || 0) + 1;
      if (o.observationTime) {
        const hour = o.observationTime.split(":")[0];
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      }
    }

    const topFunction = Object.entries(functionCounts).sort((a, b) => b[1] - a[1])[0];

    res.json({
      totalObservations: obs.length,
      functionCounts,
      antecedentCounts,
      consequenceCounts,
      scatterData: hourCounts,
      suggestedFunction: topFunction ? topFunction[0] : null,
    });
  } catch (e: any) {
    console.error("GET observation summary error:", e);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

router.get("/fbas/:fbaId/fa-sessions", async (req, res): Promise<void> => {
  try {
    const fbaId = parseInt(req.params.fbaId);
    const sessions = await db.select().from(functionalAnalysesTable)
      .where(eq(functionalAnalysesTable.fbaId, fbaId))
      .orderBy(asc(functionalAnalysesTable.sessionNumber));
    res.json(sessions.map(s => ({ ...s, createdAt: isoDate(s.createdAt) })));
  } catch (e: any) {
    console.error("GET fa-sessions error:", e);
    res.status(500).json({ error: "Failed to fetch FA sessions" });
  }
});

router.post("/fbas/:fbaId/fa-sessions", async (req, res): Promise<void> => {
  try {
    const fbaId = parseInt(req.params.fbaId);
    const { sessionNumber, condition, sessionDate, conductedBy, durationMinutes,
      responseCount, responseRate, latencySeconds, durationOfBehaviorSeconds, notes } = req.body;
    if (!condition || !sessionDate) {
      res.status(400).json({ error: "condition and sessionDate are required" });
      return;
    }
    const [session] = await db.insert(functionalAnalysesTable).values({
      fbaId, sessionNumber: sessionNumber || 1,
      condition, sessionDate,
      conductedBy: conductedBy || null,
      durationMinutes: durationMinutes || 10,
      responseCount: responseCount || 0,
      responseRate: responseRate != null ? String(responseRate) : null,
      latencySeconds: latencySeconds || null,
      durationOfBehaviorSeconds: durationOfBehaviorSeconds || null,
      notes: notes || null,
    }).returning();
    res.status(201).json({ ...session, createdAt: isoDate(session.createdAt) });
  } catch (e: any) {
    console.error("POST fa-session error:", e);
    res.status(500).json({ error: "Failed to create FA session" });
  }
});

router.delete("/fa-sessions/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [deleted] = await db.delete(functionalAnalysesTable).where(eq(functionalAnalysesTable.id, id)).returning();
    if (!deleted) { res.status(404).json({ error: "FA session not found" }); return; }
    res.json({ success: true });
  } catch (e: any) {
    console.error("DELETE fa-session error:", e);
    res.status(500).json({ error: "Failed to delete FA session" });
  }
});

router.get("/students/:studentId/bips", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const statusFilter = req.query.status as string | undefined;
    const conditions: any[] = [eq(behaviorInterventionPlansTable.studentId, studentId)];
    if (statusFilter) conditions.push(eq(behaviorInterventionPlansTable.status, statusFilter));

    const bips = await db.select({
      id: behaviorInterventionPlansTable.id,
      studentId: behaviorInterventionPlansTable.studentId,
      behaviorTargetId: behaviorInterventionPlansTable.behaviorTargetId,
      fbaId: behaviorInterventionPlansTable.fbaId,
      createdBy: behaviorInterventionPlansTable.createdBy,
      version: behaviorInterventionPlansTable.version,
      status: behaviorInterventionPlansTable.status,
      targetBehavior: behaviorInterventionPlansTable.targetBehavior,
      operationalDefinition: behaviorInterventionPlansTable.operationalDefinition,
      hypothesizedFunction: behaviorInterventionPlansTable.hypothesizedFunction,
      replacementBehaviors: behaviorInterventionPlansTable.replacementBehaviors,
      preventionStrategies: behaviorInterventionPlansTable.preventionStrategies,
      teachingStrategies: behaviorInterventionPlansTable.teachingStrategies,
      consequenceStrategies: behaviorInterventionPlansTable.consequenceStrategies,
      reinforcementSchedule: behaviorInterventionPlansTable.reinforcementSchedule,
      crisisPlan: behaviorInterventionPlansTable.crisisPlan,
      implementationNotes: behaviorInterventionPlansTable.implementationNotes,
      dataCollectionMethod: behaviorInterventionPlansTable.dataCollectionMethod,
      progressCriteria: behaviorInterventionPlansTable.progressCriteria,
      reviewDate: behaviorInterventionPlansTable.reviewDate,
      effectiveDate: behaviorInterventionPlansTable.effectiveDate,
      createdAt: behaviorInterventionPlansTable.createdAt,
      updatedAt: behaviorInterventionPlansTable.updatedAt,
      createdByFirst: staffTable.firstName,
      createdByLast: staffTable.lastName,
      behaviorTargetName: behaviorTargetsTable.name,
    }).from(behaviorInterventionPlansTable)
      .leftJoin(staffTable, eq(staffTable.id, behaviorInterventionPlansTable.createdBy))
      .leftJoin(behaviorTargetsTable, eq(behaviorTargetsTable.id, behaviorInterventionPlansTable.behaviorTargetId))
      .where(and(...conditions))
      .orderBy(desc(behaviorInterventionPlansTable.version), desc(behaviorInterventionPlansTable.createdAt));

    res.json(bips.map(b => ({
      ...b,
      createdByName: b.createdByFirst ? `${b.createdByFirst} ${b.createdByLast}` : null,
      createdAt: isoDate(b.createdAt),
      updatedAt: isoDate(b.updatedAt),
    })));
  } catch (e: any) {
    console.error("GET bips error:", e);
    res.status(500).json({ error: "Failed to fetch BIPs" });
  }
});

router.post("/students/:studentId/bips", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { fbaId, createdBy, behaviorTargetId, targetBehavior, operationalDefinition, hypothesizedFunction,
      replacementBehaviors, preventionStrategies, teachingStrategies, consequenceStrategies,
      reinforcementSchedule, crisisPlan, implementationNotes, dataCollectionMethod, progressCriteria,
      reviewDate, effectiveDate, status } = req.body;
    if (!targetBehavior || !operationalDefinition || !hypothesizedFunction) {
      res.status(400).json({ error: "targetBehavior, operationalDefinition, and hypothesizedFunction are required" });
      return;
    }
    const [bip] = await db.insert(behaviorInterventionPlansTable).values({
      studentId, fbaId: fbaId || null, createdBy: createdBy || null,
      behaviorTargetId: behaviorTargetId || null,
      targetBehavior, operationalDefinition, hypothesizedFunction,
      replacementBehaviors: replacementBehaviors || null,
      preventionStrategies: preventionStrategies || null,
      teachingStrategies: teachingStrategies || null,
      consequenceStrategies: consequenceStrategies || null,
      reinforcementSchedule: reinforcementSchedule || null,
      crisisPlan: crisisPlan || null,
      implementationNotes: implementationNotes || null,
      dataCollectionMethod: dataCollectionMethod || null,
      progressCriteria: progressCriteria || null,
      reviewDate: reviewDate || null,
      effectiveDate: effectiveDate || null,
      status: status || "draft",
      version: 1,
    }).returning();
    res.status(201).json({ ...bip, createdAt: isoDate(bip.createdAt), updatedAt: isoDate(bip.updatedAt) });
  } catch (e: any) {
    console.error("POST bip error:", e);
    res.status(500).json({ error: "Failed to create BIP" });
  }
});

router.get("/bips/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [bip] = await db.select({
      id: behaviorInterventionPlansTable.id,
      studentId: behaviorInterventionPlansTable.studentId,
      behaviorTargetId: behaviorInterventionPlansTable.behaviorTargetId,
      fbaId: behaviorInterventionPlansTable.fbaId,
      createdBy: behaviorInterventionPlansTable.createdBy,
      version: behaviorInterventionPlansTable.version,
      status: behaviorInterventionPlansTable.status,
      targetBehavior: behaviorInterventionPlansTable.targetBehavior,
      operationalDefinition: behaviorInterventionPlansTable.operationalDefinition,
      hypothesizedFunction: behaviorInterventionPlansTable.hypothesizedFunction,
      replacementBehaviors: behaviorInterventionPlansTable.replacementBehaviors,
      preventionStrategies: behaviorInterventionPlansTable.preventionStrategies,
      teachingStrategies: behaviorInterventionPlansTable.teachingStrategies,
      consequenceStrategies: behaviorInterventionPlansTable.consequenceStrategies,
      reinforcementSchedule: behaviorInterventionPlansTable.reinforcementSchedule,
      crisisPlan: behaviorInterventionPlansTable.crisisPlan,
      implementationNotes: behaviorInterventionPlansTable.implementationNotes,
      dataCollectionMethod: behaviorInterventionPlansTable.dataCollectionMethod,
      progressCriteria: behaviorInterventionPlansTable.progressCriteria,
      reviewDate: behaviorInterventionPlansTable.reviewDate,
      effectiveDate: behaviorInterventionPlansTable.effectiveDate,
      createdAt: behaviorInterventionPlansTable.createdAt,
      updatedAt: behaviorInterventionPlansTable.updatedAt,
      createdByFirst: staffTable.firstName,
      createdByLast: staffTable.lastName,
      behaviorTargetName: behaviorTargetsTable.name,
    }).from(behaviorInterventionPlansTable)
      .leftJoin(staffTable, eq(staffTable.id, behaviorInterventionPlansTable.createdBy))
      .leftJoin(behaviorTargetsTable, eq(behaviorTargetsTable.id, behaviorInterventionPlansTable.behaviorTargetId))
      .where(eq(behaviorInterventionPlansTable.id, id));

    if (!bip) { res.status(404).json({ error: "BIP not found" }); return; }
    res.json({
      ...bip,
      createdByName: bip.createdByFirst ? `${bip.createdByFirst} ${bip.createdByLast}` : null,
      createdAt: isoDate(bip.createdAt),
      updatedAt: isoDate(bip.updatedAt),
    });
  } catch (e: any) {
    console.error("GET bip error:", e);
    res.status(500).json({ error: "Failed to fetch BIP" });
  }
});

router.patch("/bips/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const allowed = [
      "targetBehavior", "operationalDefinition", "hypothesizedFunction", "status",
      "behaviorTargetId", "replacementBehaviors", "preventionStrategies", "teachingStrategies",
      "consequenceStrategies", "reinforcementSchedule", "crisisPlan", "implementationNotes",
      "dataCollectionMethod", "progressCriteria", "reviewDate", "effectiveDate"
    ];
    const updates: any = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    const [updated] = await db.update(behaviorInterventionPlansTable).set(updates)
      .where(eq(behaviorInterventionPlansTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "BIP not found" }); return; }
    res.json({ ...updated, createdAt: isoDate(updated.createdAt), updatedAt: isoDate(updated.updatedAt) });
  } catch (e: any) {
    console.error("PATCH bip error:", e);
    res.status(500).json({ error: "Failed to update BIP" });
  }
});

router.post("/bips/:id/new-version", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const [existing] = await db.select().from(behaviorInterventionPlansTable)
      .where(eq(behaviorInterventionPlansTable.id, id));
    if (!existing) { res.status(404).json({ error: "BIP not found" }); return; }
    if (existing.status === "archived") { res.status(400).json({ error: "Cannot version an archived BIP" }); return; }

    const body = req.body || {};
    const newBip = await db.transaction(async (tx) => {
      await tx.update(behaviorInterventionPlansTable)
        .set({ status: "archived" })
        .where(eq(behaviorInterventionPlansTable.id, id));

      const [created] = await tx.insert(behaviorInterventionPlansTable).values({
        studentId: existing.studentId,
        behaviorTargetId: body.behaviorTargetId ?? existing.behaviorTargetId,
        fbaId: existing.fbaId,
        createdBy: body.createdBy ?? existing.createdBy,
        version: existing.version + 1,
        status: body.status || "draft",
        targetBehavior: body.targetBehavior ?? existing.targetBehavior,
        operationalDefinition: body.operationalDefinition ?? existing.operationalDefinition,
        hypothesizedFunction: body.hypothesizedFunction ?? existing.hypothesizedFunction,
        replacementBehaviors: body.replacementBehaviors ?? existing.replacementBehaviors,
        preventionStrategies: body.preventionStrategies ?? existing.preventionStrategies,
        teachingStrategies: body.teachingStrategies ?? existing.teachingStrategies,
        consequenceStrategies: body.consequenceStrategies ?? existing.consequenceStrategies,
        reinforcementSchedule: body.reinforcementSchedule ?? existing.reinforcementSchedule,
        crisisPlan: body.crisisPlan ?? existing.crisisPlan,
        implementationNotes: body.implementationNotes ?? existing.implementationNotes,
        dataCollectionMethod: body.dataCollectionMethod ?? existing.dataCollectionMethod,
        progressCriteria: body.progressCriteria ?? existing.progressCriteria,
        reviewDate: body.reviewDate ?? existing.reviewDate,
        effectiveDate: body.effectiveDate ?? existing.effectiveDate,
      }).returning();
      return created;
    });

    res.status(201).json({ ...newBip, createdAt: isoDate(newBip.createdAt), updatedAt: isoDate(newBip.updatedAt) });
  } catch (e: any) {
    console.error("POST bip new-version error:", e);
    res.status(500).json({ error: "Failed to create new BIP version" });
  }
});

router.post("/fbas/:fbaId/generate-bip", async (req, res): Promise<void> => {
  try {
    const fbaId = parseInt(req.params.fbaId);
    const [fba] = await db.select().from(fbasTable).where(eq(fbasTable.id, fbaId));
    if (!fba) { res.status(404).json({ error: "FBA not found" }); return; }

    const obs = await db.select().from(fbaObservationsTable)
      .where(eq(fbaObservationsTable.fbaId, fbaId));

    const functionCounts: Record<string, number> = {};
    for (const o of obs) {
      if (o.perceivedFunction) functionCounts[o.perceivedFunction] = (functionCounts[o.perceivedFunction] || 0) + 1;
    }
    const topFunction = Object.entries(functionCounts).sort((a, b) => b[1] - a[1])[0];
    const func = fba.hypothesizedFunction || (topFunction ? topFunction[0] : "attention");

    const functionStrategies: Record<string, { prevention: string; teaching: string; consequence: string; replacement: string }> = {
      attention: {
        prevention: "Provide frequent non-contingent attention (NCR). Use proximity and eye contact during instruction. Schedule regular 1:1 check-ins.",
        teaching: "Teach appropriate attention-seeking (raising hand, tapping shoulder). Practice social initiations. Role-play requesting help.",
        consequence: "Provide immediate attention for replacement behavior. Minimize attention during target behavior (planned ignoring when safe). Redirect to task.",
        replacement: "Raising hand to request help. Tapping teacher shoulder appropriately. Using verbal request: 'Can I talk to you?'",
      },
      escape: {
        prevention: "Modify task difficulty. Provide choice in task order. Use first-then boards. Break tasks into smaller steps. Provide pre-teaching.",
        teaching: "Teach appropriate break requests. Use break cards. Practice task completion with graduated difficulty.",
        consequence: "Honor appropriate break requests. Implement escape extinction with prompting (when safe). Reinforce task engagement.",
        replacement: "Using break card appropriately. Saying 'I need a break.' Asking for help with difficult tasks.",
      },
      tangible: {
        prevention: "Use visual schedules showing when preferred items are available. Provide choice boards. Allow brief access to preferred items as transitions.",
        teaching: "Teach waiting skills with visual timer. Practice delayed gratification. Use token economy.",
        consequence: "Provide access to tangible items for replacement behavior. Do not provide items following target behavior. Use first-then contingency.",
        replacement: "Using words or pictures to request items. Waiting appropriately with timer. Trading tokens for preferred items.",
      },
      sensory: {
        prevention: "Provide sensory breaks at regular intervals. Modify environment to reduce aversive stimuli. Offer sensory tools proactively.",
        teaching: "Teach use of sensory tools (fidgets, noise-canceling headphones). Practice self-regulation strategies. Identify sensory needs.",
        consequence: "Redirect to appropriate sensory alternatives. Provide access to sensory room/tools. Reinforce use of appropriate sensory strategies.",
        replacement: "Using designated fidget tools. Requesting sensory break. Using noise-canceling headphones when overwhelmed.",
      },
    };

    const strategies = functionStrategies[func] || functionStrategies.attention;

    const [bip] = await db.insert(behaviorInterventionPlansTable).values({
      studentId: fba.studentId,
      fbaId: fba.id,
      targetBehavior: fba.targetBehavior,
      operationalDefinition: fba.operationalDefinition,
      hypothesizedFunction: func,
      replacementBehaviors: strategies.replacement,
      preventionStrategies: strategies.prevention,
      teachingStrategies: strategies.teaching,
      consequenceStrategies: strategies.consequence,
      reinforcementSchedule: "Continuous reinforcement (CRF) initially, then thin to variable ratio (VR-3) as replacement behavior increases.",
      dataCollectionMethod: "Frequency count of target and replacement behaviors per session. Calculate response rate per hour.",
      progressCriteria: "Target behavior decreases by 80% from baseline over 4 consecutive weeks. Replacement behavior occurs independently in 80% of opportunities.",
      status: "draft",
    }).returning();

    res.status(201).json({ ...bip, createdAt: isoDate(bip.createdAt), updatedAt: isoDate(bip.updatedAt) });
  } catch (e: any) {
    console.error("POST generate-bip error:", e);
    res.status(500).json({ error: "Failed to generate BIP" });
  }
});

export default router;
