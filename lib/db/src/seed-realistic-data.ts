import { db } from "./index";
import {
  studentsTable, iepDocumentsTable, serviceRequirementsTable,
  sessionLogsTable, behaviorTargetsTable, programTargetsTable,
  dataSessionsTable, behaviorDataTable, programDataTable
} from "./index";
import { eq, sql } from "drizzle-orm";

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}

const IEP_START_BUCKETS = [
  { offset: 0, days: [3, 15] },
  { offset: 1, days: [1, 20] },
  { offset: 2, days: [5, 18] },
  { offset: 3, days: [2, 12] },
  { offset: 4, days: [8, 22] },
  { offset: 5, days: [3, 19] },
  { offset: 6, days: [5, 25] },
  { offset: 7, days: [1, 15] },
];

function generateIepStartDate(studentId: number) {
  const bucket = IEP_START_BUCKETS[(studentId * 7 + 3) % IEP_START_BUCKETS.length];
  const baseDate = new Date(2025, 8 + bucket.offset, 1);
  const day = bucket.days[0] + ((studentId * 13) % (bucket.days[1] - bucket.days[0]));
  baseDate.setDate(Math.min(day, 28));
  return baseDate.toISOString().split("T")[0];
}

const NO_SCHOOL = [
  ["2025-11-27", "2025-11-28"],
  ["2025-12-22", "2026-01-02"],
  ["2026-02-16", "2026-02-20"],
  ["2026-04-20", "2026-04-24"],
];

function isSchoolDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  for (const [s, e] of NO_SCHOOL) { if (dateStr >= s && dateStr <= e) return false; }
  return true;
}

const SERVICE_DURATIONS: Record<number, { typical: number; min: number; max: number }> = {
  1: { typical: 60, min: 45, max: 75 },
  2: { typical: 30, min: 25, max: 45 },
  3: { typical: 30, min: 20, max: 45 },
  4: { typical: 30, min: 25, max: 45 },
  5: { typical: 60, min: 45, max: 90 },
  6: { typical: 30, min: 25, max: 45 },
  7: { typical: 30, min: 20, max: 30 },
  8: { typical: 30, min: 15, max: 45 },
};

const BEHAVIOR_PROFILES: Record<number, Array<{ name: string; measurementType: string; targetDirection: string; baselineValue: string; goalValue: string }>> = {
  2: [
    { name: "Elopement", measurementType: "frequency", targetDirection: "decrease", baselineValue: "5", goalValue: "0" },
    { name: "Task Refusal", measurementType: "frequency", targetDirection: "decrease", baselineValue: "8", goalValue: "1" },
    { name: "On-Task Behavior", measurementType: "percentage", targetDirection: "increase", baselineValue: "40", goalValue: "85" },
  ],
  3: [
    { name: "Verbal Outbursts", measurementType: "frequency", targetDirection: "decrease", baselineValue: "10", goalValue: "2" },
    { name: "Self-Injurious Behavior", measurementType: "frequency", targetDirection: "decrease", baselineValue: "6", goalValue: "0" },
    { name: "Manding (Requesting)", measurementType: "frequency", targetDirection: "increase", baselineValue: "3", goalValue: "15" },
  ],
  8: [
    { name: "Stereotypy", measurementType: "duration", targetDirection: "decrease", baselineValue: "45", goalValue: "10" },
    { name: "Social Engagement", measurementType: "frequency", targetDirection: "increase", baselineValue: "2", goalValue: "10" },
  ],
  9: [
    { name: "Non-Compliance", measurementType: "frequency", targetDirection: "decrease", baselineValue: "12", goalValue: "2" },
    { name: "Appropriate Peer Interaction", measurementType: "frequency", targetDirection: "increase", baselineValue: "1", goalValue: "8" },
    { name: "Property Destruction", measurementType: "frequency", targetDirection: "decrease", baselineValue: "4", goalValue: "0" },
  ],
  10: [
    { name: "Tantrums", measurementType: "duration", targetDirection: "decrease", baselineValue: "20", goalValue: "3" },
    { name: "Independent Transitions", measurementType: "percentage", targetDirection: "increase", baselineValue: "30", goalValue: "90" },
  ],
};

const PROGRAM_PROFILES: Record<number, Array<{ name: string; programType: string; domain: string; targetCriterion: string; tutorInstructions?: string }>> = {
  2: [
    { name: "Receptive Instructions: 2-Step", programType: "discrete_trial", domain: "Language", targetCriterion: "80% across 3 sessions", tutorInstructions: "Give 2-step instruction. Wait 10 seconds." },
    { name: "Visual Matching: Identical Objects", programType: "discrete_trial", domain: "Cognitive", targetCriterion: "90% across 3 sessions" },
    { name: "Independent Handwashing", programType: "task_analysis", domain: "Daily Living", targetCriterion: "100% independent across 5 sessions" },
  ],
  3: [
    { name: "Functional Communication: PECS Phase II", programType: "discrete_trial", domain: "Communication", targetCriterion: "80% across 3 sessions" },
    { name: "Tacting: Common Actions", programType: "discrete_trial", domain: "Language", targetCriterion: "80% across 3 sessions" },
    { name: "Imitation: Gross Motor", programType: "discrete_trial", domain: "Motor", targetCriterion: "80% across 3 sessions" },
  ],
  8: [
    { name: "Social Greetings", programType: "natural_environment", domain: "Social", targetCriterion: "80% across 5 sessions" },
    { name: "Following Classroom Routines", programType: "task_analysis", domain: "Adaptive", targetCriterion: "90% independent across 3 sessions" },
    { name: "Intraverbal: Personal Info", programType: "discrete_trial", domain: "Language", targetCriterion: "100% across 3 sessions" },
  ],
  9: [
    { name: "First-Then Board Use", programType: "discrete_trial", domain: "Behavior", targetCriterion: "80% compliance across 5 sessions" },
    { name: "Turn-Taking in Games", programType: "natural_environment", domain: "Social", targetCriterion: "80% across 3 sessions" },
    { name: "Expressive ID: Emotions", programType: "discrete_trial", domain: "Language", targetCriterion: "80% across 3 sessions" },
  ],
  10: [
    { name: "Sight Word Reading", programType: "discrete_trial", domain: "Academic", targetCriterion: "90% across 3 sessions" },
    { name: "Self-Regulation: Zones of Regulation", programType: "natural_environment", domain: "Social-Emotional", targetCriterion: "80% identification across 5 sessions" },
    { name: "Addition Facts 0-10", programType: "discrete_trial", domain: "Academic", targetCriterion: "90% across 3 sessions" },
  ],
};

export async function seedRealisticData() {
  console.log("=== Seeding realistic data ===");

  const students = await db.select({ id: studentsTable.id }).from(studentsTable).orderBy(studentsTable.id);

  console.log("Step 1: Stagger IEP dates...");
  for (const s of students) {
    const iepStart = generateIepStartDate(s.id);
    const iepEnd = addDays(iepStart, 365);
    await db.update(iepDocumentsTable)
      .set({ iepStartDate: iepStart, iepEndDate: iepEnd, meetingDate: iepStart })
      .where(eq(iepDocumentsTable.studentId, s.id));
    await db.update(serviceRequirementsTable)
      .set({ startDate: iepStart, endDate: iepEnd })
      .where(eq(serviceRequirementsTable.studentId, s.id));
  }
  console.log(`  Staggered ${students.length} students' IEP and service dates`);

  console.log("Step 2: Regenerate session logs...");
  await db.delete(sessionLogsTable);

  const allSRs = await db.select().from(serviceRequirementsTable).where(eq(serviceRequirementsTable.active, true));
  const schoolDays: string[] = [];
  let cur = new Date("2025-09-08T00:00:00");
  const end = new Date("2026-04-13T00:00:00");
  while (cur <= end) {
    const ds = cur.toISOString().split("T")[0];
    if (isSchoolDay(ds)) schoolDays.push(ds);
    cur.setDate(cur.getDate() + 1);
  }

  const sessionBatch: any[] = [];
  for (const sr of allSRs) {
    const svc = SERVICE_DURATIONS[sr.serviceTypeId] || { typical: 30, min: 20, max: 45 };
    let sessPerWeek = sr.intervalType === "weekly"
      ? Math.max(1, Math.round(sr.requiredMinutes / svc.typical))
      : Math.max(1, Math.round((sr.requiredMinutes / 4.3) / svc.typical));
    sessPerWeek = Math.min(sessPerWeek, 5);

    const preferred: number[] = [];
    const daySlots = [1, 2, 3, 4, 5];
    for (let i = 0; i < sessPerWeek; i++) {
      const idx = (sr.serviceTypeId * 3 + sr.studentId * 2 + i * 2) % 5;
      const day = daySlots[idx];
      if (!preferred.includes(day)) preferred.push(day);
      else { const alt = daySlots.find(d => !preferred.includes(d)); if (alt) preferred.push(alt); }
    }

    const staffId = sr.providerId || ((sr.serviceTypeId + sr.studentId) % 18) + 1;

    for (const date of schoolDays) {
      const dow = new Date(date + "T00:00:00").getDay();
      if (!preferred.includes(dow)) continue;

      const month = parseInt(date.substring(5, 7));
      let missRate = sr.serviceTypeId === 5 ? 0.06 : 0.13;
      if (month === 12 || month === 1 || month === 2) missRate += 0.05;
      const isMissed = Math.random() < missRate;

      let duration = 0;
      if (!isMissed) {
        duration = svc.typical + Math.round((Math.random() * 2 - 1) * (svc.max - svc.min) * 0.3);
        duration = Math.max(svc.min, Math.min(svc.max, duration));
        duration = Math.round(duration / 5) * 5;
      }

      sessionBatch.push({
        studentId: sr.studentId,
        serviceRequirementId: sr.id,
        serviceTypeId: sr.serviceTypeId,
        staffId,
        sessionDate: date,
        durationMinutes: duration,
        location: pick(["Resource Room", "Classroom", "Therapy Room", "Gym", "Office"]),
        status: isMissed ? "missed" : "completed",
        isMakeup: false,
      });
    }
  }

  for (let i = 0; i < sessionBatch.length; i += 500) {
    await db.insert(sessionLogsTable).values(sessionBatch.slice(i, i + 500));
  }
  console.log(`  Inserted ${sessionBatch.length} session logs`);

  console.log("Step 3: Seed behavior/program targets for students without them...");
  for (const [sidStr, targets] of Object.entries(BEHAVIOR_PROFILES)) {
    const sid = parseInt(sidStr);
    const existing = await db.select({ id: behaviorTargetsTable.id }).from(behaviorTargetsTable).where(eq(behaviorTargetsTable.studentId, sid));
    if (existing.length === 0) {
      for (const t of targets) {
        await db.insert(behaviorTargetsTable).values({ studentId: sid, ...t });
      }
    }
  }
  for (const [sidStr, targets] of Object.entries(PROGRAM_PROFILES)) {
    const sid = parseInt(sidStr);
    const existing = await db.select({ id: programTargetsTable.id }).from(programTargetsTable).where(eq(programTargetsTable.studentId, sid));
    if (existing.length === 0) {
      for (const t of targets) {
        await db.insert(programTargetsTable).values({ studentId: sid, ...t } as any);
      }
    }
  }

  console.log("Step 4: Regenerate behavior and program data with realistic trends...");
  await db.delete(behaviorDataTable);
  await db.delete(programDataTable);
  await db.delete(dataSessionsTable);

  const allBeh = await db.select().from(behaviorTargetsTable);
  const allProg = await db.select().from(programTargetsTable);
  const behByStudent: Record<number, typeof allBeh> = {};
  const progByStudent: Record<number, typeof allProg> = {};
  for (const bt of allBeh) { (behByStudent[bt.studentId] ??= []).push(bt); }
  for (const pt of allProg) { (progByStudent[pt.studentId] ??= []).push(pt); }

  for (const sid of Object.keys(behByStudent).map(Number)) {
    const bTargets = behByStudent[sid] || [];
    const pTargets = progByStudent[sid] || [];
    const dataStartOffset = (sid * 5) % 40;
    const dataStart = addDays("2026-01-15", dataStartOffset);
    const dows = sid % 2 === 0 ? [1, 3, 5] : [2, 4, 5];
    const sessionDays: string[] = [];

    let dc = new Date(dataStart + "T00:00:00");
    const de = new Date("2026-04-13T00:00:00");
    while (dc <= de) {
      const ds = dc.toISOString().split("T")[0];
      if (isSchoolDay(ds) && dows.includes(dc.getDay()) && Math.random() > 0.1) {
        sessionDays.push(ds);
      }
      dc.setDate(dc.getDate() + 1);
    }

    for (let si = 0; si < sessionDays.length; si++) {
      const date = sessionDays[si];
      const progressRatio = si / sessionDays.length;
      const staffId = (sid % 18) + 1;

      const [session] = await db.insert(dataSessionsTable).values({
        studentId: sid, staffId, sessionDate: date,
        startTime: `${String(8 + (sid % 4)).padStart(2, "0")}:00`,
        endTime: `${String(8 + (sid % 4)).padStart(2, "0")}:30`,
      }).returning();

      for (const bt of bTargets) {
        const baseline = parseFloat(bt.baselineValue ?? "5");
        const goal = parseFloat(bt.goalValue ?? "0");
        const isDecrease = bt.targetDirection === "decrease";
        const patternSeed = (bt.id * 7 + sid) % 4;
        let trendValue: number;

        if (patternSeed === 0) {
          trendValue = isDecrease ? baseline - (baseline - goal) * progressRatio * 0.7 : baseline + (goal - baseline) * progressRatio * 0.7;
        } else if (patternSeed === 1) {
          const phase = progressRatio < 0.4 ? 0.1 : (progressRatio - 0.4) / 0.6;
          trendValue = isDecrease ? baseline - (baseline - goal) * phase * 0.6 : baseline + (goal - baseline) * phase * 0.6;
        } else if (patternSeed === 2) {
          const spike = progressRatio > 0.3 && progressRatio < 0.5 ? 0.3 : 0;
          const imp = (baseline - goal) * progressRatio * 0.5 - spike * Math.abs(baseline - goal);
          trendValue = isDecrease ? baseline - imp : baseline + imp;
        } else {
          trendValue = isDecrease ? baseline - (baseline - goal) * progressRatio * 0.4 : baseline + (goal - baseline) * progressRatio * 0.4;
        }

        const noise = (Math.random() * 2 - 1) * Math.max(1, Math.abs(baseline - goal) * 0.25);
        let val = Math.round(trendValue + noise);
        if (bt.measurementType === "percentage") val = Math.max(0, Math.min(100, val));
        else val = Math.max(0, val);

        await db.insert(behaviorDataTable).values({
          dataSessionId: session.id,
          behaviorTargetId: bt.id,
          value: String(val),
        });
      }

      for (const pt of pTargets) {
        const patternSeed = (pt.id * 11 + sid) % 5;
        let accuracy: number;

        if (patternSeed === 0) accuracy = 30 + progressRatio * 50 + (Math.random() * 15 - 7);
        else if (patternSeed === 1) accuracy = 40 + progressRatio * 55 + (Math.random() * 10 - 5);
        else if (patternSeed === 2) accuracy = progressRatio < 0.5 ? 25 + progressRatio * 20 + (Math.random() * 15 - 7) : 35 + (progressRatio - 0.5) * 80 + (Math.random() * 10 - 5);
        else if (patternSeed === 3) accuracy = 45 + Math.min(progressRatio * 30, 20) + (Math.random() * 12 - 6);
        else accuracy = 35 + progressRatio * 35 + (Math.random() * 20 - 10);

        accuracy = Math.max(0, Math.min(100, Math.round(accuracy)));
        const total = 10;
        const correct = Math.round(accuracy / 100 * total);
        const prompted = Math.min(Math.max(0, Math.round((total - correct) * 0.6 + (Math.random() * 2 - 1))), total - correct);

        await db.insert(programDataTable).values({
          dataSessionId: session.id,
          programTargetId: pt.id,
          trialsCorrect: correct,
          trialsTotal: total,
          prompted,
          percentCorrect: String(accuracy),
        });
      }
    }
    console.log(`  Student ${sid}: ${sessionDays.length} data sessions`);
  }

  console.log("=== Realistic data seeding complete ===");
}
