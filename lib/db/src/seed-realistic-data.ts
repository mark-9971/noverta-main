import { db } from "./index";
import {
  studentsTable, iepDocumentsTable, serviceRequirementsTable,
  sessionLogsTable, behaviorTargetsTable, programTargetsTable,
  dataSessionsTable, behaviorDataTable, programDataTable,
  iepGoalsTable
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

const BEHAVIOR_TEMPLATES: Array<{ name: string; measurementType: string; targetDirection: string; baselineValue: string; goalValue: string }> = [
  { name: "Aggression", measurementType: "frequency", targetDirection: "decrease", baselineValue: "8", goalValue: "1" },
  { name: "Elopement", measurementType: "frequency", targetDirection: "decrease", baselineValue: "5", goalValue: "0" },
  { name: "Task Refusal", measurementType: "frequency", targetDirection: "decrease", baselineValue: "10", goalValue: "2" },
  { name: "On-Task Behavior", measurementType: "percentage", targetDirection: "increase", baselineValue: "35", goalValue: "85" },
  { name: "Verbal Outbursts", measurementType: "frequency", targetDirection: "decrease", baselineValue: "12", goalValue: "2" },
  { name: "Self-Injurious Behavior", measurementType: "frequency", targetDirection: "decrease", baselineValue: "6", goalValue: "0" },
  { name: "Manding (Requesting)", measurementType: "frequency", targetDirection: "increase", baselineValue: "3", goalValue: "15" },
  { name: "Stereotypy", measurementType: "duration", targetDirection: "decrease", baselineValue: "45", goalValue: "10" },
  { name: "Social Engagement", measurementType: "frequency", targetDirection: "increase", baselineValue: "2", goalValue: "10" },
  { name: "Non-Compliance", measurementType: "frequency", targetDirection: "decrease", baselineValue: "14", goalValue: "3" },
  { name: "Appropriate Peer Interaction", measurementType: "frequency", targetDirection: "increase", baselineValue: "1", goalValue: "8" },
  { name: "Property Destruction", measurementType: "frequency", targetDirection: "decrease", baselineValue: "4", goalValue: "0" },
  { name: "Tantrums", measurementType: "duration", targetDirection: "decrease", baselineValue: "20", goalValue: "3" },
  { name: "Independent Transitions", measurementType: "percentage", targetDirection: "increase", baselineValue: "30", goalValue: "90" },
  { name: "Hand Raising to Request", measurementType: "frequency", targetDirection: "increase", baselineValue: "1", goalValue: "10" },
  { name: "Crying/Emotional Dysregulation", measurementType: "frequency", targetDirection: "decrease", baselineValue: "7", goalValue: "1" },
  { name: "Following Group Instructions", measurementType: "percentage", targetDirection: "increase", baselineValue: "25", goalValue: "80" },
  { name: "Biting", measurementType: "frequency", targetDirection: "decrease", baselineValue: "3", goalValue: "0" },
  { name: "Scripting/Echolalia", measurementType: "duration", targetDirection: "decrease", baselineValue: "30", goalValue: "5" },
  { name: "Parallel Play", measurementType: "frequency", targetDirection: "increase", baselineValue: "2", goalValue: "8" },
];

const PROGRAM_TEMPLATES: Array<{ name: string; programType: string; domain: string; targetCriterion: string }> = [
  { name: "Receptive Instructions: 2-Step", programType: "discrete_trial", domain: "Language", targetCriterion: "80% across 3 sessions" },
  { name: "Visual Matching: Identical Objects", programType: "discrete_trial", domain: "Cognitive", targetCriterion: "90% across 3 sessions" },
  { name: "Independent Handwashing", programType: "task_analysis", domain: "Daily Living", targetCriterion: "100% independent across 5 sessions" },
  { name: "Functional Communication: PECS Phase II", programType: "discrete_trial", domain: "Communication", targetCriterion: "80% across 3 sessions" },
  { name: "Tacting: Common Actions", programType: "discrete_trial", domain: "Language", targetCriterion: "80% across 3 sessions" },
  { name: "Imitation: Gross Motor", programType: "discrete_trial", domain: "Motor", targetCriterion: "80% across 3 sessions" },
  { name: "Social Greetings", programType: "discrete_trial", domain: "Social", targetCriterion: "80% across 5 sessions" },
  { name: "Following Classroom Routines", programType: "task_analysis", domain: "Adaptive", targetCriterion: "90% independent across 3 sessions" },
  { name: "Intraverbal: Personal Info", programType: "discrete_trial", domain: "Language", targetCriterion: "100% across 3 sessions" },
  { name: "First-Then Board Use", programType: "discrete_trial", domain: "Behavior", targetCriterion: "80% compliance across 5 sessions" },
  { name: "Turn-Taking in Games", programType: "discrete_trial", domain: "Social", targetCriterion: "80% across 3 sessions" },
  { name: "Expressive ID: Emotions", programType: "discrete_trial", domain: "Language", targetCriterion: "80% across 3 sessions" },
  { name: "Sight Word Reading", programType: "discrete_trial", domain: "Academic", targetCriterion: "90% across 3 sessions" },
  { name: "Self-Regulation: Zones of Regulation", programType: "discrete_trial", domain: "Social-Emotional", targetCriterion: "80% identification across 5 sessions" },
  { name: "Addition Facts 0-10", programType: "discrete_trial", domain: "Academic", targetCriterion: "90% across 3 sessions" },
  { name: "Expressive Labeling: Common Objects", programType: "discrete_trial", domain: "Language", targetCriterion: "80% across 3 sessions" },
  { name: "Shoe Tying", programType: "task_analysis", domain: "Daily Living", targetCriterion: "100% independent across 5 sessions" },
  { name: "Sorting by Category", programType: "discrete_trial", domain: "Cognitive", targetCriterion: "90% across 3 sessions" },
  { name: "Requesting Break Appropriately", programType: "discrete_trial", domain: "Behavior", targetCriterion: "80% across 5 sessions" },
  { name: "Peer Conversation: 3-Turn Exchange", programType: "discrete_trial", domain: "Social", targetCriterion: "80% across 3 sessions" },
  { name: "Calendar Skills", programType: "discrete_trial", domain: "Academic", targetCriterion: "90% across 3 sessions" },
  { name: "Tooth Brushing", programType: "task_analysis", domain: "Daily Living", targetCriterion: "100% independent across 5 sessions" },
  { name: "Counting Objects 1-20", programType: "discrete_trial", domain: "Academic", targetCriterion: "90% across 3 sessions" },
  { name: "Following Visual Schedule", programType: "task_analysis", domain: "Adaptive", targetCriterion: "90% independent across 3 sessions" },
];

const SESSION_NOTES_BY_SERVICE: Record<number, string[]> = {
  1: [
    "Ran DTT trials for {program}. Student achieved {pct}% accuracy across 10 trials. {behavior_note} Reinforced correct responses with verbal praise and token board.",
    "Focused on {program} using errorless teaching. Student required {prompt} prompting for 40% of trials. Targeted {behavior} — recorded {count} instances. Used differential reinforcement.",
    "NET session targeting {program} during snack routine. Student demonstrated {pct}% independence. {behavior_note} Adjusted antecedent strategies for transitions.",
    "Conducted preference assessment then ran {program} trials. Student engaged well with new reinforcers. {behavior} was {trend} compared to last session. Prompt fading continues.",
    "ABA session: Worked on {program} — {pct}% correct. Also ran maintenance trials on previously mastered targets. {behavior_note} No crisis behaviors observed.",
    "Session focused on behavior reduction for {behavior}. Implemented planned ignoring + FCR. {count} occurrences recorded. Also collected data on {program}.",
    "Ran {program} in small group format with 2 peers. Student required {prompt} prompting. {behavior_note} Social interactions were appropriate throughout.",
    "Intensive teaching on {program} with {pct}% accuracy. Introduced new SD for next step. {behavior} data: {count} occurrences. Consulted with BCBA on prompt level.",
  ],
  2: [
    "OT session: Worked on fine motor goal — {goal}. Student completed {pct}% of tasks with {prompt} support. Hand-over-hand assistance needed for scissor cutting. Grip strength improving.",
    "Addressed sensory processing and {goal}. Student tolerated 3/5 new textures during sensory exploration. Used weighted vest during tabletop work — improved seated attention to 12 min.",
    "Focused on handwriting — {goal}. Letter formation practice using Handwriting Without Tears. Student formed 7/10 target letters correctly. Pencil grip improving with adaptive gripper.",
    "Visual-motor integration session: {goal}. Completed bead stringing (8/10 independently), button practice (needs mod assist), and drawing shapes (circle, square mastered). {pct}% accuracy overall.",
    "Self-care skills: Worked on {goal}. Zipper manipulation at partial physical prompt level. Button fastening improving — 4/6 independently. Introduced snap practice.",
    "Upper extremity strengthening and {goal}. Putty exercises, clothespin activities, tong transfers. Student engaged for full session. Bilateral coordination improving for cutting activities.",
  ],
  3: [
    "Speech session: Targeted {goal}. Student produced target sounds with {pct}% accuracy in structured drill. Practiced /s/ blends in initial position — improvement noted in 'sp' and 'st' clusters.",
    "Language session addressing {goal}. Worked on 2-3 word utterances during play-based activity. Student initiated 6 spontaneous requests. MLU increased to 2.4 morphemes this session.",
    "Articulation therapy: {goal}. Targeted /r/ in all positions. Achieved 70% accuracy in isolation, 45% in words. Used visual feedback (mirror) and tactile cues. Home practice sheet provided.",
    "Pragmatic language session: {goal}. Practiced topic maintenance across 3-turn exchanges. Student identified emotions in picture cards with {pct}% accuracy. Role-played greeting peers.",
    "AAC device training and {goal}. Student navigated to correct page for requesting in 8/10 opportunities. Modeling use of 2-word combinations on device. Peer interaction supported with AAC.",
    "Fluency session: {goal}. Practiced easy onset and light contact techniques. Student self-corrected 60% of disfluencies. Read passage with 85% fluent speech. Confidence improving.",
  ],
  4: [
    "Counseling session: Addressed {goal}. Student identified 3 coping strategies for anger (deep breathing, counting, asking for break). Practiced scenarios with role-play. Emotional vocabulary expanding.",
    "Individual counseling: Focused on {goal}. Used CBT techniques to challenge automatic negative thoughts. Student completed thought record — identified 2 cognitive distortions. Mood reportedly improved this week.",
    "Social skills group (3 students): {goal}. Practiced perspective-taking with social scenarios. Student participated in 4/5 structured activities. Needed 1 redirect for off-topic behavior.",
    "Counseling: {goal}. Check-in using feelings thermometer — student rated anxiety at 5/10 (down from 7 last session). Practiced progressive muscle relaxation. Developed safety plan for recess conflicts.",
    "Addressed self-advocacy skills — {goal}. Student practiced asking for help in 3 simulated classroom scenarios. Successfully used 'I need' statements independently in 2/3 trials. Processing peer conflict from yesterday.",
    "Transition planning session: {goal}. Discussed self-regulation strategies for independent work time. Student created visual reminder card. Reviewed progress toward social-emotional IEP goals.",
  ],
  5: [
    "Para support: Assisted with {goal} during math block. Student completed 8/12 problems with visual supports. Prompted to use number line 3 times. Faded prompts on last 4 problems.",
    "Supported {goal} in ELA inclusion class. Student followed along with modified text. Answered 3/5 comprehension questions correctly. Highlighted vocabulary with partner support.",
    "Provided 1:1 support during science lab. Focused on {goal}. Student followed 4/6 lab steps independently. Needed verbal prompts for safety procedures. Peer interaction was positive.",
    "Recess/lunch support: Monitored {goal}. Student initiated play with 2 peers. Required 1 verbal redirect during structured game. Ate independently — new food item accepted (carrots).",
    "Transition support throughout the day — {goal}. Student used visual schedule to navigate 5/6 transitions independently. Needed physical proximity for cafeteria transition. Timer strategy effective.",
    "Academic support during writing workshop: {goal}. Student generated 3 sentences with graphic organizer. Used word prediction on iPad for spelling. Completed paragraph with minimal prompting.",
    "Supported student in specials (art class): {goal}. Student participated in group activity for 25 minutes before requesting break. Used sensory tools proactively. Created art project with peers.",
  ],
  6: [
    "Adapted PE: Worked on {goal}. Student participated in modified basketball drills — bounced ball 8/10 times, passed to partner 6/10 times. Needed hand-over-hand for overhand throw. Stamina improving.",
    "Motor skills session: {goal}. Balance beam walk (3/5 attempts without step-off), hop on one foot (4 consecutive), and jump rope (needs physical assist). Coordination exercises continued.",
    "Adapted PE group: {goal}. Student participated in relay activities with 3 peers. Completed obstacle course with 2 verbal prompts. Demonstrated improved body awareness in space. Gross motor progress noted.",
  ],
  7: [
    "PT session: Worked on {goal}. Gait training with emphasis on heel-toe pattern — 80% of steps correct. Stair navigation: ascending independently, descending with one-hand rail support.",
    "Physical therapy: {goal}. Core strengthening exercises (plank hold 15 sec, improved from 10). Balance activities on wobble board. Addressed postural alignment during seated work — improved with verbal cueing.",
    "PT: {goal}. Stretching and ROM exercises for lower extremities. Student tolerated full range stretches. Practiced functional mobility — floor to stand in 4 seconds (goal: 3 sec). Wheelchair positioning reviewed.",
  ],
  8: [
    "BCBA consultation: Reviewed {behavior} data — trend is {trend}. Updated BIP recommendations: increase ratio of reinforcement schedule. Discussed prompt fading plan for {program} with RBT team.",
    "BCBA observation and consultation: Observed student during morning routine. {behavior} occurred {count} times in 30 min observation. Recommended antecedent modification: pre-teaching transition expectations.",
    "Treatment integrity check and supervision. RBT implementing DTT protocol with 92% fidelity. Reviewed data for {program} — recommend advancing to next step. Parent training scheduled for next week.",
  ],
};

const OT_GOALS = [
  "improve fine motor control for classroom tasks",
  "develop handwriting legibility for letter formation",
  "increase self-care independence (dressing, feeding)",
  "improve sensory processing and self-regulation",
  "develop bilateral coordination skills",
  "increase visual-motor integration for copying tasks",
];

const SPEECH_GOALS = [
  "increase expressive vocabulary and sentence length",
  "improve articulation of target phonemes",
  "develop pragmatic language skills for peer interaction",
  "improve receptive language comprehension",
  "increase AAC device proficiency for functional communication",
  "improve oral motor skills for speech clarity",
];

const COUNSELING_GOALS = [
  "develop coping strategies for anxiety and frustration",
  "improve peer relationship skills",
  "increase self-advocacy in classroom settings",
  "develop emotional identification and expression",
  "improve conflict resolution skills",
  "increase self-regulation during unstructured times",
];

const PARA_GOALS = [
  "increase independence in academic tasks",
  "improve self-management during transitions",
  "develop social interaction skills with peers",
  "increase participation in general education settings",
  "improve organizational skills and task completion",
  "develop self-monitoring strategies",
];

const ABA_BEHAVIOR_GOALS = [
  "reduce frequency of {behavior} from baseline to target",
  "increase {behavior} using ABA-based interventions",
  "demonstrate replacement behavior for {behavior}",
];

const ABA_PROGRAM_GOALS = [
  "master {program} at criterion of {criterion}",
  "demonstrate skill acquisition in {domain}: {program}",
  "increase independence in {program}",
];

const PT_GOALS = [
  "improve gross motor coordination and balance",
  "increase functional mobility for school participation",
  "develop core strength and postural stability",
];

const APE_GOALS = [
  "participate in adapted physical activities with peers",
  "improve gross motor skills for recreational activities",
  "increase stamina and coordination in PE settings",
];

const BCBA_GOALS = [
  "oversee ABA program implementation and data analysis",
  "ensure treatment integrity and update behavior intervention plan",
  "coordinate behavior support across school settings",
];

const GOAL_TEMPLATES_BY_SERVICE: Record<number, string[]> = {
  1: ABA_BEHAVIOR_GOALS.concat(ABA_PROGRAM_GOALS),
  2: OT_GOALS,
  3: SPEECH_GOALS,
  4: COUNSELING_GOALS,
  5: PARA_GOALS,
  6: APE_GOALS,
  7: PT_GOALS,
  8: BCBA_GOALS,
};

const GOAL_AREAS_BY_SERVICE: Record<number, string> = {
  1: "Behavior/ABA",
  2: "Occupational Therapy",
  3: "Speech-Language",
  4: "Social-Emotional",
  5: "Academic Support",
  6: "Motor/PE",
  7: "Physical Therapy",
  8: "Behavior Consultation",
};

const PROMPT_LEVELS = ["full_physical", "partial_physical", "model", "gestural", "verbal", "independent"];

function generateSessionNotes(serviceTypeId: number, goalText: string, progressRatio: number, behavTargets: string[], progTargets: string[]): string {
  const templates = SESSION_NOTES_BY_SERVICE[serviceTypeId] || SESSION_NOTES_BY_SERVICE[5];
  let note = pick(templates);

  const goalShort = goalText.length > 40 ? goalText.substring(0, 40) : goalText;
  note = note.replace(/\{goal\}/g, goalShort);

  const pct = Math.min(100, Math.max(10, Math.round(30 + progressRatio * 50 + (Math.random() * 20 - 10))));
  note = note.replace(/\{pct\}/g, String(pct));

  const promptIdx = Math.min(PROMPT_LEVELS.length - 1, Math.max(0, Math.round(progressRatio * 4 + (Math.random() - 0.5))));
  note = note.replace(/\{prompt\}/g, PROMPT_LEVELS[promptIdx].replace("_", " "));

  const behavior = behavTargets.length > 0 ? pick(behavTargets) : "target behavior";
  note = note.replace(/\{behavior\}/g, behavior);

  const count = Math.max(0, Math.round(8 - progressRatio * 6 + (Math.random() * 4 - 2)));
  note = note.replace(/\{count\}/g, String(count));

  const trend = progressRatio > 0.3 ? pick(["decreasing", "improving", "stable"]) : pick(["variable", "elevated", "above target"]);
  note = note.replace(/\{trend\}/g, trend);

  const program = progTargets.length > 0 ? pick(progTargets) : "current target program";
  note = note.replace(/\{program\}/g, program);

  note = note.replace(/\{behavior_note\}/g, behavTargets.length > 0 ? `${pick(behavTargets)}: ${count} occurrences.` : "No problem behaviors observed.");

  return note;
}

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

  console.log("Step 2: Create behavior & program targets for ALL students with relevant services...");
  const allSRs = await db.select().from(serviceRequirementsTable).where(eq(serviceRequirementsTable.active, true));

  const studentServices: Record<number, number[]> = {};
  for (const sr of allSRs) {
    (studentServices[sr.studentId] ??= []).push(sr.serviceTypeId);
  }

  await db.delete(behaviorDataTable);
  await db.delete(programDataTable);
  await db.delete(dataSessionsTable);
  await db.delete(behaviorTargetsTable);
  await db.delete(programTargetsTable);

  const behaviorTargetsByStudent: Record<number, Array<{ id: number; name: string; measurementType: string; targetDirection: string; baselineValue: string; goalValue: string }>> = {};
  const programTargetsByStudent: Record<number, Array<{ id: number; name: string; programType: string; domain: string; targetCriterion: string }>> = {};

  for (const sid of Object.keys(studentServices).map(Number)) {
    const services = studentServices[sid];
    const hasABA = services.includes(1);
    const numBehaviors = hasABA ? rand(2, 4) : (services.includes(4) || services.includes(5) ? rand(1, 2) : 0);
    const numPrograms = hasABA ? rand(2, 4) : rand(1, 3);

    const behPool = [...BEHAVIOR_TEMPLATES].sort(() => Math.random() - 0.5);
    const progPool = [...PROGRAM_TEMPLATES].sort(() => Math.random() - 0.5);

    behaviorTargetsByStudent[sid] = [];
    for (let i = 0; i < numBehaviors && i < behPool.length; i++) {
      const t = behPool[i];
      const baseAdj = Math.round(parseFloat(t.baselineValue) * (0.7 + Math.random() * 0.6));
      const [inserted] = await db.insert(behaviorTargetsTable).values({
        studentId: sid,
        name: t.name,
        measurementType: t.measurementType,
        targetDirection: t.targetDirection,
        baselineValue: String(baseAdj || t.baselineValue),
        goalValue: t.goalValue,
      }).returning();
      behaviorTargetsByStudent[sid].push({ ...inserted, name: t.name, measurementType: t.measurementType, targetDirection: t.targetDirection, baselineValue: inserted.baselineValue ?? t.baselineValue, goalValue: inserted.goalValue ?? t.goalValue });
    }

    programTargetsByStudent[sid] = [];
    for (let i = 0; i < numPrograms && i < progPool.length; i++) {
      const t = progPool[i];
      const [inserted] = await db.insert(programTargetsTable).values({
        studentId: sid,
        name: t.name,
        programType: t.programType,
        domain: t.domain,
        targetCriterion: t.targetCriterion,
      } as any).returning();
      programTargetsByStudent[sid].push({ id: inserted.id, name: t.name, programType: t.programType, domain: t.domain, targetCriterion: t.targetCriterion });
    }
  }
  console.log(`  Created targets for ${Object.keys(behaviorTargetsByStudent).length} students`);

  console.log("Step 3: Create IEP goals linked to targets and services...");
  await db.delete(iepGoalsTable);

  for (const sid of Object.keys(studentServices).map(Number)) {
    const services = studentServices[sid];
    const iepDocs = await db.select({ id: iepDocumentsTable.id }).from(iepDocumentsTable).where(eq(iepDocumentsTable.studentId, sid));
    const iepDocId = iepDocs.length > 0 ? iepDocs[0].id : null;
    let goalNum = 1;

    const behTargets = behaviorTargetsByStudent[sid] || [];
    for (const bt of behTargets) {
      const tmpl = pick(ABA_BEHAVIOR_GOALS);
      const goalText = tmpl.replace("{behavior}", bt.name);
      await db.insert(iepGoalsTable).values({
        studentId: sid,
        goalArea: "Behavior",
        goalNumber: goalNum++,
        annualGoal: `${goalText}. Baseline: ${bt.baselineValue}. Target: ${bt.goalValue} (${bt.measurementType}).`,
        baseline: bt.baselineValue,
        targetCriterion: `${bt.targetDirection} to ${bt.goalValue}`,
        measurementMethod: bt.measurementType,
        serviceArea: "ABA/Behavior Intervention",
        behaviorTargetId: bt.id,
        iepDocumentId: iepDocId,
        active: true,
      } as any);
    }

    const progTargets = programTargetsByStudent[sid] || [];
    for (const pt of progTargets) {
      const tmpl = pick(ABA_PROGRAM_GOALS);
      const goalText = tmpl.replace("{program}", pt.name).replace("{criterion}", pt.targetCriterion).replace("{domain}", pt.domain);
      await db.insert(iepGoalsTable).values({
        studentId: sid,
        goalArea: pt.domain,
        goalNumber: goalNum++,
        annualGoal: `${goalText}. Domain: ${pt.domain}.`,
        targetCriterion: pt.targetCriterion,
        measurementMethod: pt.programType === "discrete_trial" ? "Trial-based data" : "Task analysis checklist",
        serviceArea: services.includes(1) ? "ABA/Behavior Intervention" : "Academic Support",
        programTargetId: pt.id,
        iepDocumentId: iepDocId,
        active: true,
      } as any);
    }

    for (const svcId of services) {
      if (svcId === 1) continue;
      const goalTemplates = GOAL_TEMPLATES_BY_SERVICE[svcId] || [];
      const goalArea = GOAL_AREAS_BY_SERVICE[svcId] || "General";
      const numGoals = rand(1, 2);
      const shuffled = [...goalTemplates].sort(() => Math.random() - 0.5);
      for (let i = 0; i < numGoals && i < shuffled.length; i++) {
        await db.insert(iepGoalsTable).values({
          studentId: sid,
          goalArea,
          goalNumber: goalNum++,
          annualGoal: `Student will ${shuffled[i]}, as measured by data collection and progress monitoring.`,
          targetCriterion: "80% accuracy across 3 consecutive sessions",
          measurementMethod: "Direct observation and data collection",
          serviceArea: goalArea,
          iepDocumentId: iepDocId,
          active: true,
        } as any);
      }
    }
  }
  console.log(`  Created IEP goals`);

  console.log("Step 4: Regenerate session logs with clinical notes tied to goals...");
  await db.delete(sessionLogsTable);

  const goalsByStudentService: Record<string, string[]> = {};
  const allGoals = await db.select().from(iepGoalsTable).where(eq(iepGoalsTable.active, true));
  for (const g of allGoals) {
    const serviceArea = g.serviceArea || "General";
    for (const [svcId, areaName] of Object.entries(GOAL_AREAS_BY_SERVICE)) {
      if (serviceArea.toLowerCase().includes(areaName.toLowerCase().split("/")[0]) || serviceArea.toLowerCase().includes(areaName.toLowerCase())) {
        const key = `${g.studentId}-${svcId}`;
        (goalsByStudentService[key] ??= []).push(g.annualGoal!);
      }
    }
    if (serviceArea.includes("ABA")) {
      const key = `${g.studentId}-1`;
      if (!goalsByStudentService[key]) goalsByStudentService[key] = [];
      if (!goalsByStudentService[key].includes(g.annualGoal!)) goalsByStudentService[key].push(g.annualGoal!);
    }
  }

  const schoolDays: string[] = [];
  let cur = new Date("2025-09-08T00:00:00");
  const end = new Date("2026-04-13T00:00:00");
  while (cur <= end) {
    const ds = cur.toISOString().split("T")[0];
    if (isSchoolDay(ds)) schoolDays.push(ds);
    cur.setDate(cur.getDate() + 1);
  }

  const REALISTIC_MONTHLY: Record<number, number> = {
    1: 240,
    2: 90,
    3: 90,
    4: 120,
    5: 300,
    6: 90,
    7: 90,
    8: 120,
  };

  const struggleStudentIds = new Set([3, 12, 27, 38, 45]);

  for (const sr of allSRs) {
    let newRequired = REALISTIC_MONTHLY[sr.serviceTypeId] || 60;
    if (struggleStudentIds.has(sr.studentId)) {
      newRequired = Math.round(newRequired * 1.8);
    }
    const updates: any = { requiredMinutes: newRequired };
    if (sr.intervalType === "weekly") {
      updates.intervalType = "monthly";
      sr.intervalType = "monthly";
    }
    sr.requiredMinutes = newRequired;
    await db.update(serviceRequirementsTable)
      .set(updates)
      .where(eq(serviceRequirementsTable.id, sr.id));
  }
  console.log("  Adjusted service requirement minutes and intervals to realistic values");

  const MIN_SESS_PER_WEEK: Record<number, number> = {
    1: 3, 2: 2, 3: 2, 4: 2, 5: 3, 6: 2, 7: 2, 8: 2,
  };

  const sessionBatch: any[] = [];
  for (const sr of allSRs) {
    const svc = SERVICE_DURATIONS[sr.serviceTypeId] || { typical: 30, min: 20, max: 45 };
    const minSess = MIN_SESS_PER_WEEK[sr.serviceTypeId] || 1;
    let sessPerWeek = Math.max(minSess, Math.round((sr.requiredMinutes / 4.3) / svc.typical));
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
    const behNames = (behaviorTargetsByStudent[sr.studentId] || []).map(b => b.name);
    const progNames = (programTargetsByStudent[sr.studentId] || []).map(p => p.name);
    const svcGoals = goalsByStudentService[`${sr.studentId}-${sr.serviceTypeId}`] || [];

    const isStruggling = struggleStudentIds.has(sr.studentId);

    let sessionIndex = 0;
    for (const date of schoolDays) {
      const dow = new Date(date + "T00:00:00").getDay();
      if (!preferred.includes(dow)) continue;

      let missRate: number;
      if (isStruggling) {
        missRate = 0.45;
      } else {
        missRate = 0.03;
      }
      const isMissed = Math.random() < missRate;

      let duration = 0;
      let notes: string | null = null;
      if (!isMissed) {
        duration = svc.typical + Math.round((Math.random() * 2 - 1) * (svc.max - svc.min) * 0.3);
        duration = Math.max(svc.min, Math.min(svc.max, duration));
        duration = Math.round(duration / 5) * 5;

        const totalSessions = Math.floor(schoolDays.length * (sessPerWeek / 5));
        const progressRatio = Math.min(1, sessionIndex / Math.max(1, totalSessions));
        const goalText = svcGoals.length > 0 ? pick(svcGoals) : "current IEP objectives";
        notes = generateSessionNotes(sr.serviceTypeId, goalText, progressRatio, behNames, progNames);
      } else {
        const missedReasons = [
          "Student absent from school.",
          "Provider absent — session rescheduled.",
          "School-wide assembly conflicted with session time.",
          "Student pulled for testing — session not held.",
          "Fire drill during scheduled session.",
          "Student in crisis — services deferred.",
        ];
        notes = pick(missedReasons);
      }

      const hour = 8 + (sr.serviceTypeId + sr.studentId) % 7;
      const startTime = `${String(hour).padStart(2, "0")}:00`;
      const endHour = hour + Math.floor(duration / 60);
      const endMin = duration % 60;
      const endTime = `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;

      sessionBatch.push({
        studentId: sr.studentId,
        serviceRequirementId: sr.id,
        serviceTypeId: sr.serviceTypeId,
        staffId,
        sessionDate: date,
        startTime,
        endTime,
        durationMinutes: duration,
        location: pick(["Resource Room", "Classroom", "Therapy Room", "Gym", "Office", "Sensory Room", "Speech Room", "Counseling Office"]),
        deliveryMode: Math.random() < 0.93 ? "in_person" : "remote",
        status: isMissed ? "missed" : "completed",
        isMakeup: false,
        notes,
      });
      sessionIndex++;
    }
  }

  for (let i = 0; i < sessionBatch.length; i += 500) {
    await db.insert(sessionLogsTable).values(sessionBatch.slice(i, i + 500));
  }
  console.log(`  Inserted ${sessionBatch.length} session logs with notes`);

  console.log("Step 5: Generate data sessions with behavior & program data for ALL students...");

  for (const sid of Object.keys(behaviorTargetsByStudent).map(Number)) {
    const bTargets = behaviorTargetsByStudent[sid] || [];
    const pTargets = programTargetsByStudent[sid] || [];
    if (bTargets.length === 0 && pTargets.length === 0) continue;

    const dataStartOffset = (sid * 5) % 40;
    const dataStart = addDays("2026-01-15", dataStartOffset);
    const dows = sid % 3 === 0 ? [1, 3, 5] : sid % 3 === 1 ? [2, 4, 5] : [1, 2, 4];
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

    const behBatch: any[] = [];
    const progBatch: any[] = [];

    for (let si = 0; si < sessionDays.length; si++) {
      const date = sessionDays[si];
      const progressRatio = si / sessionDays.length;
      const staffId = (sid % 18) + 1;

      const [session] = await db.insert(dataSessionsTable).values({
        studentId: sid, staffId, sessionDate: date,
        startTime: `${String(8 + (sid % 4)).padStart(2, "0")}:00`,
        endTime: `${String(8 + (sid % 4)).padStart(2, "0")}:30`,
        notes: si % 3 === 0 ? pick([
          "Student engaged well today. Good attending throughout.",
          "Slight increase in off-task behavior after lunch.",
          "Excellent session — student met criterion on 2 targets.",
          "Student required extra reinforcement breaks today.",
          "Used new reinforcer (iPad time) — very effective.",
          "Challenging session — antecedent strategies adjusted mid-session.",
        ]) : null,
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

        behBatch.push({
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
        const promptLevel = PROMPT_LEVELS[Math.min(5, Math.max(0, Math.round(progressRatio * 4 + (Math.random() - 0.5))))];

        progBatch.push({
          dataSessionId: session.id,
          programTargetId: pt.id,
          trialsCorrect: correct,
          trialsTotal: total,
          prompted,
          percentCorrect: String(accuracy),
          promptLevelUsed: promptLevel,
        });
      }
    }

    if (behBatch.length > 0) {
      for (let i = 0; i < behBatch.length; i += 500) {
        await db.insert(behaviorDataTable).values(behBatch.slice(i, i + 500));
      }
    }
    if (progBatch.length > 0) {
      for (let i = 0; i < progBatch.length; i += 500) {
        await db.insert(programDataTable).values(progBatch.slice(i, i + 500));
      }
    }

    console.log(`  Student ${sid}: ${sessionDays.length} data sessions, ${bTargets.length} behaviors, ${pTargets.length} programs`);
  }

  console.log("=== Realistic data seeding complete ===");
}
