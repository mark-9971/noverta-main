/**
 * seed-clinical.ts
 * Seeds 6 months of data_sessions, program_data, and behavior_data for all 50 students.
 * Realistic therapeutic day school ABA data with improvement trends.
 *
 * Run: cd lib/db && pnpm exec tsx src/seed-clinical.ts
 */
import { db } from "./index";
import {
  studentsTable, staffTable, dataSessionsTable,
  programTargetsTable, behaviorTargetsTable,
  programDataTable, behaviorDataTable,
} from "./index";
import { eq, inArray, sql } from "drizzle-orm";

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randF(min: number, max: number) { return Math.random() * (max - min) + min; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle<T>(arr: T[]): T[] { return [...arr].sort(() => Math.random() - 0.5); }
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

// ── Date helpers ──────────────────────────────────────────────────────────────

const START_DATE = new Date("2025-10-01");
const END_DATE   = new Date("2026-04-11");

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getSchoolDays(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  let cur = new Date(from);
  while (cur <= to) {
    const dow = cur.getDay();
    if (dow >= 1 && dow <= 5) days.push(new Date(cur));
    cur = addDays(cur, 1);
  }
  return days;
}

// Roughly how many weeks into the 6-month period a date falls (0..1)
function progress(date: Date): number {
  const total = END_DATE.getTime() - START_DATE.getTime();
  const elapsed = date.getTime() - START_DATE.getTime();
  return Math.max(0, Math.min(1, elapsed / total));
}

// ── Prompt level progression ───────────────────────────────────────────────────

const PROMPT_LEVELS = ["full_physical", "partial_physical", "model", "gestural", "verbal", "independent"];

function promptLevelAtProgress(p: number, baseIdx: number): string {
  const targetIdx = Math.min(PROMPT_LEVELS.length - 1, baseIdx + Math.floor(p * 3.5));
  return PROMPT_LEVELS[clamp(targetIdx + rand(-1, 1), 0, PROMPT_LEVELS.length - 1)];
}

// ── Realistic accuracy curve ───────────────────────────────────────────────────
// Sigmoidal learning: slow start, accelerated middle, plateau

function programAccuracy(p: number, startPct: number, endPct: number): number {
  // sigmoid centered at p=0.4
  const sig = 1 / (1 + Math.exp(-12 * (p - 0.4)));
  const base = startPct + (endPct - startPct) * sig;
  // Add some noise and occasional regression
  const noise = randF(-12, 12);
  const regression = Math.random() < 0.08 ? -rand(10, 20) : 0;
  return clamp(Math.round(base + noise + regression), 0, 100);
}

// ── Realistic behavior frequency curve (decrease targets) ─────────────────────
// Starts high, trends downward, some noise and escalation events

function behaviorFrequency(p: number, baselineVal: number, goalVal: number): number {
  const range = baselineVal - goalVal;
  const base = baselineVal - range * Math.pow(p, 0.6);
  const noise = randF(-1.5, 1.5);
  // Occasional escalation periods (first month and near week 10-12)
  const escalation = (p < 0.1 || (p > 0.35 && p < 0.45 && Math.random() < 0.25)) ? rand(1, 3) : 0;
  return clamp(Math.round(base + noise + escalation), Math.max(0, goalVal - 1), baselineVal + 2);
}

// ── Realistic behavior percentage curve (increase targets) ────────────────────
function behaviorPercentage(p: number, startPct: number, endPct: number): number {
  const sig = 1 / (1 + Math.exp(-10 * (p - 0.45)));
  const base = startPct + (endPct - startPct) * sig;
  const noise = randF(-8, 8);
  return clamp(Math.round(base + noise), 0, 100);
}

// ── Session time helpers ───────────────────────────────────────────────────────
const SESSION_SLOTS = [
  { start: "08:30", end: "09:00" },
  { start: "09:00", end: "09:30" },
  { start: "09:30", end: "10:00" },
  { start: "10:00", end: "10:30" },
  { start: "10:30", end: "11:00" },
  { start: "11:00", end: "11:30" },
  { start: "13:00", end: "13:30" },
  { start: "13:30", end: "14:00" },
  { start: "14:00", end: "14:30" },
  { start: "14:30", end: "15:00" },
];

const SESSION_NOTES_TEMPLATES = [
  "Student engaged well throughout session. Targets addressed as planned.",
  "Session conducted in resource room. Student required additional prompting today.",
  "Smooth session overall. Student demonstrated emerging independence.",
  "Student initially resistant but settled after preferred activity. Good progress.",
  "Completed all planned programs. Staff noted increased frustration near session end.",
  "Student requested breaks appropriately. Targets addressed with minimal prompting.",
  "High-energy session. Student responded well to structured routine.",
  "Challenging start; student self-regulated within 10 minutes. Targets addressed.",
  "Excellent engagement today. Student exceeded expectations on several programs.",
  "Behavior support strategies implemented throughout. Session objectives met.",
  null, null, null, // Some sessions have no notes
];

// ── Main seed ─────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding 6 months of clinical data...");

  // 1. Load all students
  const students = await db.select({ id: studentsTable.id, schoolId: studentsTable.schoolId })
    .from(studentsTable).orderBy(studentsTable.id);
  const activeStudents = students.filter(s => s.schoolId === 1 || s.schoolId === 2);
  console.log(`  Found ${activeStudents.length} active students`);

  // 2. Load staff per school (BCBAs, teachers, paras collect data)
  const allStaff = await db.select({ id: staffTable.id, schoolId: staffTable.schoolId, role: staffTable.role })
    .from(staffTable).where(inArray(staffTable.schoolId, [1, 2]));

  const clinicalRoles = ["bcba", "teacher", "para", "case_manager"];
  const staffBySchool: Record<number, number[]> = { 1: [], 2: [] };
  for (const st of allStaff) {
    if (st.schoolId && clinicalRoles.includes(st.role) && staffBySchool[st.schoolId]) {
      staffBySchool[st.schoolId].push(st.id);
    }
  }
  console.log(`  School 1 staff: ${staffBySchool[1].length}, School 2 staff: ${staffBySchool[2].length}`);

  // 3. Load program targets per student
  const allProgramTargets = await db.select({
    id: programTargetsTable.id,
    studentId: programTargetsTable.studentId,
    masteryCriterionPercent: programTargetsTable.masteryCriterionPercent,
  }).from(programTargetsTable).where(eq(programTargetsTable.active, true));

  const programTargetsByStudent: Record<number, { id: number; masteryCriterionPercent: number | null }[]> = {};
  for (const pt of allProgramTargets) {
    if (!programTargetsByStudent[pt.studentId]) programTargetsByStudent[pt.studentId] = [];
    programTargetsByStudent[pt.studentId].push(pt);
  }

  // 4. Load behavior targets per student
  const allBehaviorTargets = await db.select({
    id: behaviorTargetsTable.id,
    studentId: behaviorTargetsTable.studentId,
    measurementType: behaviorTargetsTable.measurementType,
    targetDirection: behaviorTargetsTable.targetDirection,
    baselineValue: behaviorTargetsTable.baselineValue,
    goalValue: behaviorTargetsTable.goalValue,
  }).from(behaviorTargetsTable).where(eq(behaviorTargetsTable.active, true));

  const behaviorTargetsByStudent: Record<number, typeof allBehaviorTargets> = {};
  for (const bt of allBehaviorTargets) {
    if (!behaviorTargetsByStudent[bt.studentId]) behaviorTargetsByStudent[bt.studentId] = [];
    behaviorTargetsByStudent[bt.studentId].push(bt);
  }

  // 5. Generate all school days in the range
  const allDays = getSchoolDays(START_DATE, END_DATE);
  console.log(`  ${allDays.length} school days from ${fmt(START_DATE)} to ${fmt(END_DATE)}`);

  // 6. For each student, generate sessions
  let totalSessions = 0;
  let totalProgram = 0;
  let totalBehavior = 0;

  for (const student of activeStudents) {
    const schoolId = student.schoolId ?? 1;
    const schoolStaff = staffBySchool[schoolId] ?? staffBySchool[1];
    const progTargets = programTargetsByStudent[student.id] ?? [];
    const behTargets = behaviorTargetsByStudent[student.id] ?? [];

    if (schoolStaff.length === 0) continue;

    // Pick 2-3 "primary" staff for this student (realistic - a student has a dedicated para/teacher)
    const primaryStaff = shuffle(schoolStaff).slice(0, rand(2, 3));

    // Assign a consistent starting accuracy to each program target
    const ptStartAccuracy: Record<number, number> = {};
    const ptEndAccuracy: Record<number, number> = {};
    const ptBasePromptIdx: Record<number, number> = {};
    for (const pt of progTargets) {
      ptStartAccuracy[pt.id] = rand(30, 60);
      ptEndAccuracy[pt.id] = rand(65, 95);
      ptBasePromptIdx[pt.id] = rand(0, 2); // start from full_physical or partial_physical
    }

    // Assign realistic baselines to behavior targets
    const btBaseline: Record<number, number> = {};
    const btGoal: Record<number, number> = {};
    for (const bt of behTargets) {
      if (bt.targetDirection === "decrease") {
        if (bt.measurementType === "frequency") {
          btBaseline[bt.id] = bt.baselineValue ? parseFloat(bt.baselineValue) : rand(6, 14);
          btGoal[bt.id] = bt.goalValue ? parseFloat(bt.goalValue) : rand(1, 3);
        } else {
          btBaseline[bt.id] = bt.baselineValue ? parseFloat(bt.baselineValue) : rand(55, 80);
          btGoal[bt.id] = bt.goalValue ? parseFloat(bt.goalValue) : rand(10, 30);
        }
      } else {
        btBaseline[bt.id] = bt.baselineValue ? parseFloat(bt.baselineValue) : rand(20, 45);
        btGoal[bt.id] = bt.goalValue ? parseFloat(bt.goalValue) : rand(70, 90);
      }
    }

    // Collect sessions to insert
    const sessionInserts: any[] = [];
    const programInserts: any[] = [];
    const behaviorInserts: any[] = [];

    for (const day of allDays) {
      // Each student has ~75% chance of a data session on any given school day
      if (Math.random() > 0.75) continue;

      const p = progress(day);
      const staffId = pick(primaryStaff);
      const slot = pick(SESSION_SLOTS);

      sessionInserts.push({
        studentId: student.id,
        staffId,
        sessionDate: fmt(day),
        startTime: slot.start,
        endTime: slot.end,
        notes: pick(SESSION_NOTES_TEMPLATES) as string | null,
      });
    }

    // Insert sessions in batch and get IDs back
    if (sessionInserts.length === 0) continue;

    const insertedSessions = await db.insert(dataSessionsTable)
      .values(sessionInserts)
      .returning({ id: dataSessionsTable.id, sessionDate: dataSessionsTable.sessionDate });

    totalSessions += insertedSessions.length;

    // For each inserted session, generate program and behavior data
    for (const sess of insertedSessions) {
      const sessDate = new Date(sess.sessionDate + "T12:00:00");
      const p = progress(sessDate);

      // Pick 2-4 program targets for this session
      if (progTargets.length > 0) {
        const numProg = rand(2, Math.min(4, progTargets.length));
        const pickedProg = shuffle(progTargets).slice(0, numProg);

        for (const pt of pickedProg) {
          const accuracy = programAccuracy(p, ptStartAccuracy[pt.id], ptEndAccuracy[pt.id]);
          const trialsTotal = pick([5, 8, 10, 10, 10]);
          const trialsCorrect = Math.round(trialsTotal * accuracy / 100);
          const promptLevel = promptLevelAtProgress(p, ptBasePromptIdx[pt.id]);

          programInserts.push({
            dataSessionId: sess.id,
            programTargetId: pt.id,
            trialsCorrect,
            trialsTotal,
            prompted: Math.max(0, trialsTotal - trialsCorrect - rand(0, 1)),
            percentCorrect: String(accuracy),
            promptLevelUsed: promptLevel,
            independenceLevel: accuracy >= 90 ? "independent" : accuracy >= 70 ? "prompted" : "full_prompt",
            notes: null,
          });
        }
        totalProgram += pickedProg.length;
      }

      // Pick 2-4 behavior targets for this session
      if (behTargets.length > 0) {
        const numBeh = rand(2, Math.min(4, behTargets.length));
        const pickedBeh = shuffle(behTargets).slice(0, numBeh);

        for (const bt of pickedBeh) {
          let value: number;

          if (bt.targetDirection === "decrease") {
            if (bt.measurementType === "frequency") {
              value = behaviorFrequency(p, btBaseline[bt.id], btGoal[bt.id]);
            } else if (bt.measurementType === "duration") {
              const baseMin = btBaseline[bt.id];
              const goalMin = btGoal[bt.id];
              value = clamp(Math.round(baseMin - (baseMin - goalMin) * Math.pow(p, 0.7) + randF(-2, 2)), Math.max(0, goalMin - 1), baseMin + 3);
            } else if (bt.measurementType === "percentage") {
              value = clamp(Math.round(btBaseline[bt.id] - (btBaseline[bt.id] - btGoal[bt.id]) * Math.pow(p, 0.6) + randF(-8, 8)), Math.max(0, btGoal[bt.id] - 5), btBaseline[bt.id] + 5);
            } else {
              value = behaviorFrequency(p, btBaseline[bt.id], btGoal[bt.id]);
            }
          } else {
            // increase target
            value = behaviorPercentage(p, btBaseline[bt.id], btGoal[bt.id]);
          }

          const entry: any = {
            dataSessionId: sess.id,
            behaviorTargetId: bt.id,
            value: String(value),
            notes: null,
          };

          // Add interval data for interval measurement type
          if (bt.measurementType === "interval") {
            const intervals = rand(8, 16);
            const pctOn = bt.targetDirection === "decrease"
              ? Math.max(0, Math.round(btBaseline[bt.id] - (btBaseline[bt.id] - btGoal[bt.id]) * p + randF(-8, 8)))
              : Math.min(100, Math.round(btBaseline[bt.id] + (btGoal[bt.id] - btBaseline[bt.id]) * p + randF(-8, 8)));
            entry.intervalCount = intervals;
            entry.intervalsWith = Math.round(intervals * pctOn / 100);
          }

          behaviorInserts.push(entry);
        }
        totalBehavior += pickedBeh.length;
      }
    }

    // Insert program and behavior data in batches of 200
    const BATCH = 200;
    for (let i = 0; i < programInserts.length; i += BATCH) {
      await db.insert(programDataTable).values(programInserts.slice(i, i + BATCH));
    }
    for (let i = 0; i < behaviorInserts.length; i += BATCH) {
      await db.insert(behaviorDataTable).values(behaviorInserts.slice(i, i + BATCH));
    }

    if (student.id % 10 === 0) {
      console.log(`  Student ${student.id} done (${totalSessions} sessions, ${totalProgram} prog, ${totalBehavior} beh so far)`);
    }
  }

  console.log("\n✅ Clinical data seeded:");
  console.log(`   Data sessions:  ${totalSessions}`);
  console.log(`   Program data:   ${totalProgram}`);
  console.log(`   Behavior data:  ${totalBehavior}`);
  process.exit(0);
}

main().catch(e => { console.error("Seed failed:", e); process.exit(1); });
