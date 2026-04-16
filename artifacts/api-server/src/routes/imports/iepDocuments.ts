import { Router, type Request, type Response } from "express";
import multer from "multer";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  db,
  studentsTable,
  iepDocumentsTable,
  iepGoalsTable,
  iepAccommodationsTable,
  serviceTypesTable,
  serviceRequirementsTable,
  behaviorTargetsTable,
  programTargetsTable,
  importsTable,
} from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import { requireAdmin, normalizeDate } from "./shared";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are accepted"));
  },
});

interface ExtractedIepData {
  studentName: { firstName: string; lastName: string };
  studentExternalId?: string;
  iepStartDate: string;
  iepEndDate: string;
  meetingDate?: string;
  iepType: string;
  disabilityCategory?: string;
  plaafp?: {
    academic?: string;
    behavioral?: string;
    communication?: string;
    additional?: string;
  };
  goals: Array<{
    goalArea: string;
    annualGoal: string;
    baseline?: string;
    targetCriterion?: string;
    measurementMethod?: string;
    benchmarks?: string;
    serviceArea?: string;
    goalType: "behavior" | "academic" | "communication" | "social" | "motor" | "functional" | "transition";
  }>;
  services: Array<{
    serviceType: string;
    deliveryType: "direct" | "indirect" | "consultation";
    requiredMinutes: number;
    intervalType: "daily" | "weekly" | "monthly" | "quarterly" | "annually";
    setting?: string;
    groupSize?: string;
  }>;
  accommodations: Array<{
    category: "instructional" | "environmental" | "testing" | "behavioral" | "other";
    description: string;
    setting?: string;
    frequency?: string;
  }>;
  behaviorTargets: Array<{
    name: string;
    description?: string;
    measurementType: "frequency" | "duration" | "interval" | "latency" | "percentage";
    targetDirection: "decrease" | "increase";
    baselineValue?: string;
    goalValue?: string;
  }>;
  programTargets: Array<{
    name: string;
    description?: string;
    programType: "discrete_trial" | "task_analysis" | "fluency" | "other";
    domain?: string;
    targetCriterion?: string;
    masteryCriterionPercent?: number;
  }>;
}

const EXTRACTION_PROMPT = `You are an expert at reading Massachusetts IEP (Individualized Education Program) documents. Extract ALL structured data from the following IEP document text.

Return a JSON object with this exact structure:
{
  "studentName": { "firstName": "...", "lastName": "..." },
  "studentExternalId": "...",
  "iepStartDate": "YYYY-MM-DD",
  "iepEndDate": "YYYY-MM-DD",
  "meetingDate": "YYYY-MM-DD",
  "iepType": "initial|annual|amendment|reevaluation",
  "disabilityCategory": "...",
  "plaafp": {
    "academic": "...",
    "behavioral": "...",
    "communication": "...",
    "additional": "..."
  },
  "goals": [
    {
      "goalArea": "academic|behavior|communication|social_emotional|motor|functional|transition",
      "annualGoal": "Full text of the annual goal",
      "baseline": "Current performance level",
      "targetCriterion": "Target criterion (e.g., 80% accuracy over 3 sessions)",
      "measurementMethod": "How progress is measured",
      "benchmarks": "Short-term objectives if listed",
      "serviceArea": "speech|ot|pt|aba|counseling|academic|other",
      "goalType": "behavior|academic|communication|social|motor|functional|transition"
    }
  ],
  "services": [
    {
      "serviceType": "Speech/Language|Occupational Therapy|Physical Therapy|ABA|Counseling|Paraprofessional|Special Education|etc.",
      "deliveryType": "direct|indirect|consultation",
      "requiredMinutes": 120,
      "intervalType": "weekly|monthly|daily|quarterly|annually",
      "setting": "classroom|resource room|therapy room|etc.",
      "groupSize": "individual|small group|large group"
    }
  ],
  "accommodations": [
    {
      "category": "instructional|environmental|testing|behavioral|other",
      "description": "Full description of accommodation",
      "setting": "all settings|general education|special education|testing",
      "frequency": "daily|as needed|during testing|etc."
    }
  ],
  "behaviorTargets": [
    {
      "name": "Short name for the behavior (e.g., Physical Aggression)",
      "description": "Detailed definition",
      "measurementType": "frequency|duration|interval|latency|percentage",
      "targetDirection": "decrease|increase",
      "baselineValue": "Current rate/level",
      "goalValue": "Target rate/level"
    }
  ],
  "programTargets": [
    {
      "name": "Short name for skill/program target (e.g., Letter Identification)",
      "description": "What the student is learning",
      "programType": "discrete_trial|task_analysis|fluency|other",
      "domain": "academic|communication|social|motor|adaptive|vocational",
      "targetCriterion": "Mastery criterion text",
      "masteryCriterionPercent": 80
    }
  ]
}

IMPORTANT RULES:
1. Extract EVERY goal mentioned in the IEP, not just the first few.
2. For behavior-related goals, also create a corresponding entry in behaviorTargets.
3. For academic/skill goals, also create a corresponding entry in programTargets.
4. Parse service delivery grids carefully — minutes, frequency, and delivery type.
5. Extract ALL accommodations/modifications listed.
6. Dates must be in YYYY-MM-DD format.
7. If data is missing or unclear, omit the field rather than guessing.
8. Return ONLY valid JSON, no markdown or explanation.`;

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}

async function extractIepDataWithAi(pdfText: string): Promise<ExtractedIepData> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      { role: "user", content: `Here is the IEP document text to extract data from:\n\n${pdfText.slice(0, 60000)}` },
    ],
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("AI returned empty response");

  return JSON.parse(content) as ExtractedIepData;
}

async function findStudentByName(
  firstName: string,
  lastName: string,
  externalId?: string
): Promise<{ id: number; firstName: string; lastName: string } | null> {
  if (externalId) {
    const byExtId = await db
      .select()
      .from(studentsTable)
      .where(eq(studentsTable.externalId, externalId))
      .limit(1);
    if (byExtId.length > 0) return byExtId[0];
  }

  if (firstName && lastName) {
    const byName = await db
      .select()
      .from(studentsTable)
      .where(
        and(
          ilike(studentsTable.firstName, firstName.trim()),
          ilike(studentsTable.lastName, lastName.trim())
        )
      )
      .limit(1);
    if (byName.length > 0) return byName[0];
  }

  return null;
}

async function findOrCreateServiceType(serviceTypeName: string): Promise<number> {
  const normalized = serviceTypeName.toLowerCase().trim();
  const allTypes = await db.select().from(serviceTypesTable);

  const exact = allTypes.find((t) => t.name.toLowerCase() === normalized);
  if (exact) return exact.id;

  const partial = allTypes.find(
    (t) =>
      normalized.includes(t.name.toLowerCase()) ||
      t.name.toLowerCase().includes(normalized)
  );
  if (partial) return partial.id;

  const catMap: Record<string, string> = {
    speech: "speech",
    slp: "speech",
    language: "speech",
    ot: "ot",
    occupational: "ot",
    pt: "pt",
    physical: "pt",
    aba: "aba",
    behavior: "aba",
    bcba: "aba",
    counsel: "counseling",
    social: "counseling",
    para: "para_support",
    aide: "para_support",
    "special education": "other",
    sped: "other",
  };

  for (const [key, cat] of Object.entries(catMap)) {
    if (normalized.includes(key)) {
      const found = allTypes.find((t) => t.category === cat);
      if (found) return found.id;
    }
  }

  const [created] = await db
    .insert(serviceTypesTable)
    .values({
      name: serviceTypeName,
      category: "other",
    })
    .returning();
  return created.id;
}

async function importIepForStudent(
  studentId: number,
  data: ExtractedIepData
): Promise<{
  iepDocumentId: number;
  goalsCreated: number;
  servicesCreated: number;
  accommodationsCreated: number;
  behaviorTargetsCreated: number;
  programTargetsCreated: number;
}> {
  return await db.transaction(async (tx) => {
    return await _importIepForStudentTx(tx, studentId, data);
  });
}

async function _importIepForStudentTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  studentId: number,
  data: ExtractedIepData
): Promise<{
  iepDocumentId: number;
  goalsCreated: number;
  servicesCreated: number;
  accommodationsCreated: number;
  behaviorTargetsCreated: number;
  programTargetsCreated: number;
}> {
  const startDate = normalizeDate(data.iepStartDate) || new Date().toISOString().slice(0, 10);
  const endDate =
    normalizeDate(data.iepEndDate) ||
    new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [iepDoc] = await tx
    .insert(iepDocumentsTable)
    .values({
      studentId,
      iepStartDate: startDate,
      iepEndDate: endDate,
      meetingDate: data.meetingDate ? normalizeDate(data.meetingDate) : null,
      iepType: data.iepType || "initial",
      status: "active",
      plaafpAcademic: data.plaafp?.academic || null,
      plaafpBehavioral: data.plaafp?.behavioral || null,
      plaafpCommunication: data.plaafp?.communication || null,
      plaafpAdditional: data.plaafp?.additional || null,
      active: true,
    })
    .returning();

  let goalsCreated = 0;
  const behaviorTargetMap = new Map<string, number>();
  const programTargetMap = new Map<string, number>();

  let behaviorTargetsCreated = 0;
  for (const bt of data.behaviorTargets || []) {
    const existing = await tx
      .select()
      .from(behaviorTargetsTable)
      .where(
        and(
          eq(behaviorTargetsTable.studentId, studentId),
          ilike(behaviorTargetsTable.name, bt.name)
        )
      )
      .limit(1);

    let targetId: number;
    if (existing.length > 0) {
      targetId = existing[0].id;
    } else {
      const [created] = await tx
        .insert(behaviorTargetsTable)
        .values({
          studentId,
          name: bt.name,
          description: bt.description || null,
          measurementType: bt.measurementType || "frequency",
          targetDirection: bt.targetDirection || "decrease",
          baselineValue: bt.baselineValue || null,
          goalValue: bt.goalValue || null,
          active: true,
        })
        .returning();
      targetId = created.id;
      behaviorTargetsCreated++;
    }
    behaviorTargetMap.set(bt.name.toLowerCase(), targetId);
  }

  let programTargetsCreated = 0;
  for (const pt of data.programTargets || []) {
    const existing = await tx
      .select()
      .from(programTargetsTable)
      .where(
        and(
          eq(programTargetsTable.studentId, studentId),
          ilike(programTargetsTable.name, pt.name)
        )
      )
      .limit(1);

    let targetId: number;
    if (existing.length > 0) {
      targetId = existing[0].id;
    } else {
      const [created] = await tx
        .insert(programTargetsTable)
        .values({
          studentId,
          name: pt.name,
          description: pt.description || null,
          programType: pt.programType || "discrete_trial",
          domain: pt.domain || null,
          targetCriterion: pt.targetCriterion || null,
          masteryCriterionPercent: pt.masteryCriterionPercent || 80,
          active: true,
        })
        .returning();
      targetId = created.id;
      programTargetsCreated++;
    }
    programTargetMap.set(pt.name.toLowerCase(), targetId);
  }

  for (const goal of data.goals || []) {
    const isBehavior =
      goal.goalType === "behavior" ||
      goal.goalArea === "behavior" ||
      goal.serviceArea === "aba";

    let behaviorTargetId: number | null = null;
    let programTargetId: number | null = null;

    if (isBehavior) {
      const matchedBt = findClosestKey(behaviorTargetMap, goal.annualGoal);
      behaviorTargetId = matchedBt || null;
    } else {
      const matchedPt = findClosestKey(programTargetMap, goal.annualGoal);
      programTargetId = matchedPt || null;
    }

    await tx.insert(iepGoalsTable).values({
      studentId,
      goalArea: goal.goalArea || "academic",
      goalNumber: goalsCreated + 1,
      annualGoal: goal.annualGoal,
      baseline: goal.baseline || null,
      targetCriterion: goal.targetCriterion || null,
      measurementMethod: goal.measurementMethod || null,
      benchmarks: goal.benchmarks || null,
      serviceArea: goal.serviceArea || null,
      behaviorTargetId,
      programTargetId,
      iepDocumentId: iepDoc.id,
      status: "active",
      active: true,
    });
    goalsCreated++;
  }

  let servicesCreated = 0;
  for (const svc of data.services || []) {
    const serviceTypeId = await findOrCreateServiceType(svc.serviceType);

    const existing = await tx
      .select()
      .from(serviceRequirementsTable)
      .where(
        and(
          eq(serviceRequirementsTable.studentId, studentId),
          eq(serviceRequirementsTable.serviceTypeId, serviceTypeId),
          eq(serviceRequirementsTable.active, true)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await tx.insert(serviceRequirementsTable).values({
        studentId,
        serviceTypeId,
        deliveryType: svc.deliveryType || "direct",
        requiredMinutes: svc.requiredMinutes || 30,
        intervalType: svc.intervalType || "weekly",
        startDate: startDate,
        endDate: endDate,
        setting: svc.setting || null,
        groupSize: svc.groupSize || null,
        active: true,
      });
      servicesCreated++;
    }
  }

  let accommodationsCreated = 0;
  for (const acc of data.accommodations || []) {
    await tx.insert(iepAccommodationsTable).values({
      studentId,
      iepDocumentId: iepDoc.id,
      category: acc.category || "instructional",
      description: acc.description,
      setting: acc.setting || null,
      frequency: acc.frequency || null,
      active: true,
    });
    accommodationsCreated++;
  }

  return {
    iepDocumentId: iepDoc.id,
    goalsCreated,
    servicesCreated,
    accommodationsCreated,
    behaviorTargetsCreated,
    programTargetsCreated,
  };
}

function findClosestKey(map: Map<string, number>, goalText: string): number | null {
  const goalLower = goalText.toLowerCase();
  for (const [name, id] of map) {
    if (goalLower.includes(name) || name.includes(goalLower.slice(0, 30))) {
      return id;
    }
  }
  return null;
}

router.post(
  "/imports/iep-documents",
  requireAdmin,
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: "No PDF file uploaded" });
        return;
      }

      const studentIdParam = req.body?.studentId;

      const pdfText = await extractTextFromPdf(req.file.buffer);
      if (!pdfText || pdfText.trim().length < 50) {
        res.status(400).json({ error: "Could not extract text from PDF. The file may be scanned/image-based." });
        return;
      }

      const extracted = await extractIepDataWithAi(pdfText);

      let studentId: number | null = studentIdParam ? parseInt(studentIdParam) : null;

      if (!studentId) {
        const student = await findStudentByName(
          extracted.studentName.firstName,
          extracted.studentName.lastName,
          extracted.studentExternalId
        );
        if (student) {
          studentId = student.id;
        }
      }

      if (!studentId) {
        res.status(404).json({
          error: "Student not found",
          extractedName: extracted.studentName,
          message: `Could not find student "${extracted.studentName.firstName} ${extracted.studentName.lastName}" in the system. Please import students first.`,
        });
        return;
      }

      if (extracted.disabilityCategory) {
        await db
          .update(studentsTable)
          .set({ disabilityCategory: extracted.disabilityCategory })
          .where(eq(studentsTable.id, studentId));
      }

      const result = await importIepForStudent(studentId, extracted);

      await db.insert(importsTable).values({
        importType: "iep_documents",
        fileName: req.file.originalname || "iep-upload.pdf",
        rowsProcessed: 1,
        rowsImported: 1,
        rowsErrored: 0,
        status: "completed",
      });

      res.json({
        success: true,
        studentId,
        studentName: extracted.studentName,
        ...result,
        summary: `Imported IEP for ${extracted.studentName.firstName} ${extracted.studentName.lastName}: ${result.goalsCreated} goals, ${result.servicesCreated} services, ${result.accommodationsCreated} accommodations, ${result.behaviorTargetsCreated} behavior targets, ${result.programTargetsCreated} program targets`,
      });
    } catch (error) {
      console.error("IEP import error:", error);
      res.status(500).json({
        error: "Failed to process IEP document",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
);

router.post(
  "/imports/iep-documents/bulk",
  requireAdmin,
  upload.array("files", 50),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        res.status(400).json({ error: "No files uploaded" });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const sendEvent = (event: Record<string, unknown>) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      sendEvent({ type: "started", total: files.length });

      let successCount = 0;
      let errorCount = 0;
      const results: Array<{
        fileName: string;
        success: boolean;
        studentName?: { firstName: string; lastName: string };
        error?: string;
        details?: Record<string, number>;
      }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        sendEvent({
          type: "processing",
          index: i,
          fileName: file.originalname,
          total: files.length,
        });

        try {
          const pdfText = await extractTextFromPdf(file.buffer);
          if (!pdfText || pdfText.trim().length < 50) {
            throw new Error("Could not extract text from PDF");
          }

          const extracted = await extractIepDataWithAi(pdfText);

          const student = await findStudentByName(
            extracted.studentName.firstName,
            extracted.studentName.lastName,
            extracted.studentExternalId
          );

          if (!student) {
            throw new Error(
              `Student not found: ${extracted.studentName.firstName} ${extracted.studentName.lastName}`
            );
          }

          if (extracted.disabilityCategory) {
            await db
              .update(studentsTable)
              .set({ disabilityCategory: extracted.disabilityCategory })
              .where(eq(studentsTable.id, student.id));
          }

          const importResult = await importIepForStudent(student.id, extracted);
          successCount++;

          results.push({
            fileName: file.originalname,
            success: true,
            studentName: extracted.studentName,
            details: {
              goalsCreated: importResult.goalsCreated,
              servicesCreated: importResult.servicesCreated,
              accommodationsCreated: importResult.accommodationsCreated,
              behaviorTargetsCreated: importResult.behaviorTargetsCreated,
              programTargetsCreated: importResult.programTargetsCreated,
            },
          });

          sendEvent({
            type: "progress",
            index: i,
            fileName: file.originalname,
            success: true,
            studentName: extracted.studentName,
            goalsCreated: importResult.goalsCreated,
            servicesCreated: importResult.servicesCreated,
            accommodationsCreated: importResult.accommodationsCreated,
            completed: i + 1,
            total: files.length,
          });
        } catch (err) {
          errorCount++;
          const errMsg = err instanceof Error ? err.message : "Unknown error";
          results.push({
            fileName: file.originalname,
            success: false,
            error: errMsg,
          });

          sendEvent({
            type: "progress",
            index: i,
            fileName: file.originalname,
            success: false,
            error: errMsg,
            completed: i + 1,
            total: files.length,
          });
        }
      }

      await db.insert(importsTable).values({
        importType: "iep_documents",
        fileName: `Bulk IEP upload (${files.length} files)`,
        rowsProcessed: files.length,
        rowsImported: successCount,
        rowsErrored: errorCount,
        status: errorCount === 0 ? "completed" : errorCount === files.length ? "failed" : "partial",
      });

      sendEvent({
        type: "complete",
        total: files.length,
        success: successCount,
        errors: errorCount,
        results,
      });

      res.end();
    } catch (error) {
      console.error("Bulk IEP import error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          error: "Failed to process bulk IEP upload",
          details: error instanceof Error ? error.message : "Unknown error",
        });
      } else {
        res.write(
          `data: ${JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "Unknown error" })}\n\n`
        );
        res.end();
      }
    }
  }
);

export default router;
