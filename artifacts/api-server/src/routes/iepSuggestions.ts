import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
// tenant-scope: district-join
  studentsTable, iepGoalsTable, serviceRequirementsTable,
  behaviorTargetsTable, programTargetsTable, programStepsTable
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireTierAccess } from "../middlewares/tierGate";

const router: IRouter = Router();
router.use(
  [
    "/students/:studentId/iep-suggestions",
    "/students/:studentId/apply-suggestions",
    "/iep-suggestions",
  ],
  requireTierAccess("clinical.iep_suggestions"),
);

const BEHAVIOR_CATALOG: Array<{
  name: string; measurementType: string; targetDirection: string;
  baselineValue: string; goalValue: string; tags: string[];
  goalAreaMatch: string[];
}> = [
  { name: "Aggression", measurementType: "frequency", targetDirection: "decrease", baselineValue: "8", goalValue: "1", tags: ["safety","behavioral"], goalAreaMatch: ["Behavior","Aggression","Self-Regulation"] },
  { name: "Elopement", measurementType: "frequency", targetDirection: "decrease", baselineValue: "5", goalValue: "0", tags: ["safety","behavioral"], goalAreaMatch: ["Behavior","Elopement","Safety"] },
  { name: "Task Refusal", measurementType: "frequency", targetDirection: "decrease", baselineValue: "10", goalValue: "2", tags: ["compliance","behavioral"], goalAreaMatch: ["Behavior","Task Completion","Following Directions","Compliance"] },
  { name: "On-Task Behavior", measurementType: "percentage", targetDirection: "increase", baselineValue: "35", goalValue: "85", tags: ["attention","behavioral"], goalAreaMatch: ["Behavior","Attending","Task Completion","Academic"] },
  { name: "Verbal Outbursts", measurementType: "frequency", targetDirection: "decrease", baselineValue: "12", goalValue: "2", tags: ["behavioral","disruptive"], goalAreaMatch: ["Behavior","Self-Regulation","Social-Emotional"] },
  { name: "Self-Injurious Behavior", measurementType: "frequency", targetDirection: "decrease", baselineValue: "6", goalValue: "0", tags: ["safety","behavioral"], goalAreaMatch: ["Behavior","Safety","Self-Regulation"] },
  { name: "Manding (Requesting)", measurementType: "frequency", targetDirection: "increase", baselineValue: "3", goalValue: "15", tags: ["communication","ABA"], goalAreaMatch: ["Communication","ABA","Requesting","Expressive Language"] },
  { name: "Stereotypy", measurementType: "duration", targetDirection: "decrease", baselineValue: "45", goalValue: "10", tags: ["behavioral","sensory"], goalAreaMatch: ["Behavior","Sensory","ABA"] },
  { name: "Social Engagement", measurementType: "frequency", targetDirection: "increase", baselineValue: "2", goalValue: "10", tags: ["social","behavioral"], goalAreaMatch: ["Social","Social Interaction","Pragmatic Language","Social-Emotional"] },
  { name: "Non-Compliance", measurementType: "frequency", targetDirection: "decrease", baselineValue: "14", goalValue: "3", tags: ["compliance","behavioral"], goalAreaMatch: ["Behavior","Following Directions","Compliance"] },
  { name: "Appropriate Peer Interaction", measurementType: "frequency", targetDirection: "increase", baselineValue: "1", goalValue: "8", tags: ["social","behavioral"], goalAreaMatch: ["Social","Social Interaction","Pragmatic Language"] },
  { name: "Property Destruction", measurementType: "frequency", targetDirection: "decrease", baselineValue: "4", goalValue: "0", tags: ["safety","behavioral"], goalAreaMatch: ["Behavior","Aggression","Safety"] },
  { name: "Tantrums", measurementType: "duration", targetDirection: "decrease", baselineValue: "20", goalValue: "3", tags: ["behavioral","emotional"], goalAreaMatch: ["Behavior","Self-Regulation","Emotional"] },
  { name: "Independent Transitions", measurementType: "percentage", targetDirection: "increase", baselineValue: "30", goalValue: "90", tags: ["adaptive","behavioral"], goalAreaMatch: ["Behavior","Transition","Adaptive"] },
  { name: "Hand Raising to Request", measurementType: "frequency", targetDirection: "increase", baselineValue: "1", goalValue: "10", tags: ["classroom","behavioral"], goalAreaMatch: ["Behavior","Communication","Classroom"] },
  { name: "Crying/Emotional Dysregulation", measurementType: "frequency", targetDirection: "decrease", baselineValue: "7", goalValue: "1", tags: ["emotional","behavioral"], goalAreaMatch: ["Behavior","Self-Regulation","Emotional","Social-Emotional"] },
  { name: "Following Group Instructions", measurementType: "percentage", targetDirection: "increase", baselineValue: "25", goalValue: "80", tags: ["compliance","classroom"], goalAreaMatch: ["Behavior","Following Directions","Academic","Classroom"] },
  { name: "Biting", measurementType: "frequency", targetDirection: "decrease", baselineValue: "3", goalValue: "0", tags: ["safety","behavioral"], goalAreaMatch: ["Behavior","Aggression","Safety"] },
  { name: "Scripting/Echolalia", measurementType: "duration", targetDirection: "decrease", baselineValue: "30", goalValue: "5", tags: ["communication","behavioral"], goalAreaMatch: ["Communication","ABA","Behavior"] },
  { name: "Parallel Play", measurementType: "frequency", targetDirection: "increase", baselineValue: "2", goalValue: "8", tags: ["social","behavioral"], goalAreaMatch: ["Social","Social Interaction","Play"] },
];

const PROGRAM_CATALOG: Array<{
  name: string; programType: string; domain: string;
  targetCriterion: string; tags: string[];
  goalAreaMatch: string[]; serviceMatch: string[];
  steps?: string[];
}> = [
  { name: "Receptive Instructions: 2-Step", programType: "discrete_trial", domain: "Language", targetCriterion: "80% across 3 sessions", tags: ["DTT","receptive","language"], goalAreaMatch: ["Communication","Receptive Language","Following Directions","ABA"], serviceMatch: ["aba","speech"], steps: ["Follow 1-step instructions","Follow 2-step instructions","Follow instructions with modifiers"] },
  { name: "Visual Matching: Identical Objects", programType: "discrete_trial", domain: "Cognitive", targetCriterion: "90% across 3 sessions", tags: ["DTT","cognitive","matching"], goalAreaMatch: ["Academic","Cognitive","ABA"], serviceMatch: ["aba"], steps: ["Match identical objects (2 items)","Match identical objects (3 items)","Match identical pictures"] },
  { name: "Independent Handwashing", programType: "task_analysis", domain: "Daily Living", targetCriterion: "100% independent across 5 sessions", tags: ["TA","self-care","adaptive"], goalAreaMatch: ["Self-Care","Adaptive","Daily Living","Motor"], serviceMatch: ["aba","ot"], steps: ["Turn on water","Wet hands","Apply soap","Rub hands together 10 sec","Rinse hands","Turn off water","Dry hands"] },
  { name: "Functional Communication: PECS Phase II", programType: "discrete_trial", domain: "Communication", targetCriterion: "80% across 3 sessions", tags: ["DTT","communication","AAC"], goalAreaMatch: ["Communication","AAC","Expressive Language","ABA","Requesting"], serviceMatch: ["aba","speech"], steps: ["Exchange picture at 1 foot","Exchange at 3 feet","Exchange across room","Discriminate between 2 pictures"] },
  { name: "Tacting: Common Actions", programType: "discrete_trial", domain: "Language", targetCriterion: "80% across 3 sessions", tags: ["DTT","expressive","tacting"], goalAreaMatch: ["Communication","ABA","Expressive Language","Tacting"], serviceMatch: ["aba","speech"], steps: ["Label 5 common actions","Label 10 actions","Label actions in natural environment"] },
  { name: "Imitation: Gross Motor", programType: "discrete_trial", domain: "Motor", targetCriterion: "80% across 3 sessions", tags: ["DTT","motor","imitation"], goalAreaMatch: ["Motor","ABA","Imitation","Gross Motor"], serviceMatch: ["aba","pt"], steps: ["Imitate 3 large motor actions","Imitate 5 actions","Imitate novel gross motor actions"] },
  { name: "Social Greetings", programType: "discrete_trial", domain: "Social", targetCriterion: "80% across 5 sessions", tags: ["DTT","social","pragmatic"], goalAreaMatch: ["Social","Social Interaction","Pragmatic Language","ABA"], serviceMatch: ["aba","counseling","speech"], steps: ["Respond to 'Hi'","Initiate greeting","Greet peers independently","Greet novel adults"] },
  { name: "Following Classroom Routines", programType: "task_analysis", domain: "Adaptive", targetCriterion: "90% independent across 3 sessions", tags: ["TA","adaptive","classroom"], goalAreaMatch: ["Behavior","Adaptive","Transition","Academic Support","Following Directions"], serviceMatch: ["aba","para"], steps: ["Enter classroom","Put away belongings","Check schedule","Get materials","Sit at desk","Begin morning work"] },
  { name: "Intraverbal: Personal Info", programType: "discrete_trial", domain: "Language", targetCriterion: "100% across 3 sessions", tags: ["DTT","language","intraverbal"], goalAreaMatch: ["Communication","ABA","Intraverbal","Expressive Language"], serviceMatch: ["aba","speech"], steps: ["State first name","State last name","State age","State school name","State teacher name"] },
  { name: "First-Then Board Use", programType: "discrete_trial", domain: "Behavior", targetCriterion: "80% compliance across 5 sessions", tags: ["DTT","behavior","visual support"], goalAreaMatch: ["Behavior","Self-Regulation","Task Completion","Compliance"], serviceMatch: ["aba","para"], steps: ["Accept first-then board","Complete 'first' activity","Transition to 'then' activity independently"] },
  { name: "Turn-Taking in Games", programType: "discrete_trial", domain: "Social", targetCriterion: "80% across 3 sessions", tags: ["DTT","social","play"], goalAreaMatch: ["Social","Social Interaction","Play","ABA"], serviceMatch: ["aba","counseling","speech"], steps: ["Take turns with adult","Take turns with 1 peer","Take turns in group of 3","Independently manage turns"] },
  { name: "Expressive ID: Emotions", programType: "discrete_trial", domain: "Language", targetCriterion: "80% across 3 sessions", tags: ["DTT","social-emotional","language"], goalAreaMatch: ["Social-Emotional","Communication","Emotional","ABA"], serviceMatch: ["aba","counseling","speech"], steps: ["Label happy/sad","Label angry/scared","Label 6 emotions in pictures","Label emotions in others"] },
  { name: "Sight Word Reading", programType: "discrete_trial", domain: "Academic", targetCriterion: "90% across 3 sessions", tags: ["DTT","academic","reading"], goalAreaMatch: ["Academic","Reading","Decoding"], serviceMatch: ["aba","para","academic"], steps: ["Read 10 pre-primer words","Read 20 pre-primer words","Read primer sight words","Read grade-level words"] },
  { name: "Self-Regulation: Zones of Regulation", programType: "discrete_trial", domain: "Social-Emotional", targetCriterion: "80% identification across 5 sessions", tags: ["DTT","social-emotional","regulation"], goalAreaMatch: ["Behavior","Self-Regulation","Social-Emotional","Emotional"], serviceMatch: ["aba","counseling"], steps: ["Identify 4 zones by color","Match body feelings to zones","Identify own zone","Select strategy for zone"] },
  { name: "Addition Facts 0-10", programType: "discrete_trial", domain: "Academic", targetCriterion: "90% across 3 sessions", tags: ["DTT","academic","math"], goalAreaMatch: ["Academic","Math","Math Computation"], serviceMatch: ["aba","para","academic"], steps: ["Add with manipulatives","Add with number line","Add from memory (sums to 5)","Add from memory (sums to 10)"] },
  { name: "Expressive Labeling: Common Objects", programType: "discrete_trial", domain: "Language", targetCriterion: "80% across 3 sessions", tags: ["DTT","expressive","tacting"], goalAreaMatch: ["Communication","ABA","Expressive Language","Tacting"], serviceMatch: ["aba","speech"], steps: ["Label 5 objects","Label 15 objects","Label objects in categories","Label objects in natural environment"] },
  { name: "Shoe Tying", programType: "task_analysis", domain: "Daily Living", targetCriterion: "100% independent across 5 sessions", tags: ["TA","self-care","adaptive"], goalAreaMatch: ["Self-Care","Motor","Fine Motor","Daily Living","Adaptive"], serviceMatch: ["aba","ot"], steps: ["Cross laces","Pull tight","Make loop 1","Wrap around","Push through hole","Pull both loops tight"] },
  { name: "Sorting by Category", programType: "discrete_trial", domain: "Cognitive", targetCriterion: "90% across 3 sessions", tags: ["DTT","cognitive","categorization"], goalAreaMatch: ["Academic","Cognitive","ABA"], serviceMatch: ["aba"], steps: ["Sort 2 categories (3 items each)","Sort 3 categories","Sort by function","Sort novel items"] },
  { name: "Requesting Break Appropriately", programType: "discrete_trial", domain: "Behavior", targetCriterion: "80% across 5 sessions", tags: ["DTT","behavior","FCR","communication"], goalAreaMatch: ["Behavior","Self-Regulation","Communication","ABA","Functional Communication"], serviceMatch: ["aba"], steps: ["Use break card with full prompt","Use break card with gestural prompt","Independently request break","Request break before escalation"] },
  { name: "Peer Conversation: 3-Turn Exchange", programType: "discrete_trial", domain: "Social", targetCriterion: "80% across 3 sessions", tags: ["DTT","social","pragmatic"], goalAreaMatch: ["Social","Pragmatic Language","Social Interaction","ABA"], serviceMatch: ["aba","speech","counseling"], steps: ["Respond to peer question","Ask peer a question","Maintain 2-turn exchange","Maintain 3-turn exchange on topic"] },
  { name: "Calendar Skills", programType: "discrete_trial", domain: "Academic", targetCriterion: "90% across 3 sessions", tags: ["DTT","academic","daily living"], goalAreaMatch: ["Academic","Daily Living","Adaptive"], serviceMatch: ["aba","para","academic"], steps: ["Identify day of week","Identify month","Identify date","Answer 'What day is today?'"] },
  { name: "Tooth Brushing", programType: "task_analysis", domain: "Daily Living", targetCriterion: "100% independent across 5 sessions", tags: ["TA","self-care","adaptive"], goalAreaMatch: ["Self-Care","Daily Living","Adaptive","Motor"], serviceMatch: ["aba","ot"], steps: ["Get toothbrush","Apply toothpaste","Brush top teeth","Brush bottom teeth","Brush tongue","Rinse mouth","Rinse brush","Put away materials"] },
  { name: "Counting Objects 1-20", programType: "discrete_trial", domain: "Academic", targetCriterion: "90% across 3 sessions", tags: ["DTT","academic","math"], goalAreaMatch: ["Academic","Math","Number Sense"], serviceMatch: ["aba","para","academic"], steps: ["Count objects 1-5","Count objects 1-10","Count objects 1-15","Count objects 1-20 with 1:1 correspondence"] },
  { name: "Following Visual Schedule", programType: "task_analysis", domain: "Adaptive", targetCriterion: "90% independent across 3 sessions", tags: ["TA","adaptive","visual support"], goalAreaMatch: ["Behavior","Adaptive","Transition","Self-Regulation"], serviceMatch: ["aba","para"], steps: ["Check schedule board","Identify current activity icon","Go to activity area","Complete activity","Return to schedule","Move icon to 'done'","Check next activity"] },
  { name: "Articulation: /r/ Sound Production", programType: "discrete_trial", domain: "Communication", targetCriterion: "80% across 3 sessions", tags: ["DTT","speech","articulation"], goalAreaMatch: ["Communication","Articulation","Speech-Language"], serviceMatch: ["speech"], steps: ["Produce /r/ in isolation","Produce /r/ in initial position words","Produce /r/ in medial position","Produce /r/ in conversation"] },
  { name: "Sentence Building: 3-Word Utterances", programType: "discrete_trial", domain: "Communication", targetCriterion: "80% across 3 sessions", tags: ["DTT","language","expressive"], goalAreaMatch: ["Communication","Expressive Language"], serviceMatch: ["speech","aba"], steps: ["Combine 2 words (agent+action)","Add object (3-word)","Use in structured play","Use spontaneously in routines"] },
  { name: "Pencil Grip & Letter Formation", programType: "task_analysis", domain: "Motor", targetCriterion: "80% legibility across 5 sessions", tags: ["TA","fine-motor","OT"], goalAreaMatch: ["Motor","Fine Motor","Written Expression","Handwriting"], serviceMatch: ["ot"], steps: ["Grasp pencil with tripod grip","Trace straight lines","Trace curved lines","Copy letter strokes","Form letters independently","Write name legibly"] },
  { name: "Sensory Diet: Self-Regulation Routine", programType: "task_analysis", domain: "Sensory", targetCriterion: "90% independent use across 5 sessions", tags: ["TA","sensory","OT","regulation"], goalAreaMatch: ["Sensory","Self-Regulation","Motor","Behavior"], serviceMatch: ["ot"], steps: ["Identify alertness level","Select sensory tool","Use tool for 3-5 minutes","Re-assess alertness","Return to task","Rate effectiveness"] },
  { name: "Gross Motor: Balance & Coordination", programType: "task_analysis", domain: "Motor", targetCriterion: "Age-appropriate performance across 3 sessions", tags: ["TA","gross-motor","PT"], goalAreaMatch: ["Motor","Gross Motor","Physical Therapy"], serviceMatch: ["pt","ape"], steps: ["Stand on one foot 10 sec","Walk heel-to-toe on line","Hop on one foot 5 times","Jump over obstacles","Navigate playground independently"] },
  { name: "Coping Skills Toolkit", programType: "discrete_trial", domain: "Social-Emotional", targetCriterion: "Independent use in 4/5 opportunities", tags: ["DTT","counseling","social-emotional"], goalAreaMatch: ["Social-Emotional","Self-Regulation","Anxiety","Emotional","Conflict Resolution"], serviceMatch: ["counseling"], steps: ["Identify 3 coping strategies","Practice deep breathing","Use 'I feel' statements","Apply strategy independently"] },
  { name: "Conflict Resolution Steps", programType: "task_analysis", domain: "Social-Emotional", targetCriterion: "80% across 5 sessions", tags: ["TA","counseling","social"], goalAreaMatch: ["Social-Emotional","Conflict Resolution","Social Interaction","Perspective Taking"], serviceMatch: ["counseling","aba"], steps: ["Identify the problem","Name my feeling","Think of 2 solutions","Pick the best one","Try it","Evaluate: Did it work?"] },
];

const RELATED_SERVICE_SUGGESTIONS: Record<string, Array<{
  name: string; description: string; category: string; tags: string[];
}>> = {
  speech: [
    { name: "Articulation Therapy", description: "Target speech sound production in isolation, words, sentences, and conversation", category: "Speech-Language", tags: ["articulation","speech"] },
    { name: "Language Therapy: Expressive", description: "Increase vocabulary, sentence length, and communicative functions", category: "Speech-Language", tags: ["expressive","language"] },
    { name: "Language Therapy: Receptive", description: "Improve comprehension of directions, questions, and concepts", category: "Speech-Language", tags: ["receptive","language"] },
    { name: "Pragmatic/Social Language Group", description: "Develop conversation skills, perspective-taking, and social communication", category: "Speech-Language", tags: ["pragmatic","social"] },
    { name: "AAC Device Training", description: "Teach functional use of augmentative communication system", category: "Speech-Language", tags: ["AAC","assistive-technology"] },
    { name: "Fluency Therapy", description: "Stuttering management through easy onset, light contact, and self-monitoring", category: "Speech-Language", tags: ["fluency","stuttering"] },
  ],
  ot: [
    { name: "Fine Motor Program", description: "Strengthen hand muscles, improve pencil grip, cutting, and manipulation skills", category: "Occupational Therapy", tags: ["fine-motor","OT"] },
    { name: "Handwriting Program", description: "Letter formation, sizing, spacing, and legibility using multi-sensory approach", category: "Occupational Therapy", tags: ["handwriting","fine-motor"] },
    { name: "Sensory Processing Program", description: "Develop sensory diet and regulation strategies for classroom participation", category: "Occupational Therapy", tags: ["sensory","regulation"] },
    { name: "Visual Motor Integration", description: "Improve coordination between visual perception and motor output for academic tasks", category: "Occupational Therapy", tags: ["visual-motor","OT"] },
    { name: "Self-Care Skills Training", description: "Dressing, feeding, hygiene independence through task analysis", category: "Occupational Therapy", tags: ["self-care","ADL"] },
  ],
  pt: [
    { name: "Gross Motor Development", description: "Balance, coordination, and strength activities for school participation", category: "Physical Therapy", tags: ["gross-motor","PT"] },
    { name: "Gait Training", description: "Improve walking pattern, endurance, and stair navigation", category: "Physical Therapy", tags: ["gait","mobility"] },
    { name: "Core Strength & Posture", description: "Develop postural stability for seated classroom work and functional mobility", category: "Physical Therapy", tags: ["core","posture"] },
    { name: "Functional Mobility Program", description: "Navigate school environment independently including stairs, ramps, and playground", category: "Physical Therapy", tags: ["mobility","independence"] },
  ],
  counseling: [
    { name: "CBT Anxiety Management", description: "Cognitive behavioral techniques for identifying and managing anxiety triggers", category: "Counseling", tags: ["anxiety","CBT"] },
    { name: "Social Skills Group", description: "Structured peer interaction, role-play, and perspective-taking activities", category: "Counseling", tags: ["social","group"] },
    { name: "Emotional Regulation Program", description: "Identify emotions, develop coping toolkit, and practice self-regulation strategies", category: "Counseling", tags: ["emotional","regulation"] },
    { name: "Self-Advocacy Training", description: "Teach students to identify and communicate their needs and accommodations", category: "Counseling", tags: ["self-advocacy","transition"] },
    { name: "Conflict Resolution Skills", description: "I-statements, compromise, and problem-solving strategies for peer conflicts", category: "Counseling", tags: ["conflict","social"] },
  ],
  aba: [
    { name: "Discrete Trial Training (DTT)", description: "Structured 1:1 teaching of skills using SD-Response-Consequence format", category: "ABA", tags: ["DTT","structured"] },
    { name: "Natural Environment Teaching (NET)", description: "Embedding skill targets in play and natural routines", category: "ABA", tags: ["NET","naturalistic"] },
    { name: "Functional Communication Training (FCT)", description: "Teaching replacement communication for problem behaviors", category: "ABA", tags: ["FCT","communication","behavior"] },
    { name: "Social Skills Training", description: "Peer-mediated instruction, video modeling, and structured social opportunities", category: "ABA", tags: ["social","ABA"] },
    { name: "Behavior Intervention Plan (BIP) Implementation", description: "Systematic intervention for targeted problem behaviors with data collection", category: "ABA", tags: ["BIP","behavior"] },
  ],
  para: [
    { name: "Academic Support in Inclusion", description: "Modify and accommodate academic tasks in general education setting", category: "Para Support", tags: ["academic","inclusion"] },
    { name: "Transition Support Program", description: "Assistance navigating schedule changes, room transitions, and activity shifts", category: "Para Support", tags: ["transition","adaptive"] },
    { name: "Social Facilitation", description: "Support peer interactions during unstructured times (recess, lunch, specials)", category: "Para Support", tags: ["social","peer"] },
    { name: "Independence Fading Plan", description: "Systematically reduce 1:1 support to promote student autonomy", category: "Para Support", tags: ["independence","fading"] },
  ],
};

function normalizeGoalArea(area: string): string {
  return (area || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function goalAreaMatches(goalAreas: string[], matchList: string[]): boolean {
  const normalizedGoals = goalAreas.map(normalizeGoalArea);
  return matchList.some(m => {
    const nm = normalizeGoalArea(m);
    return normalizedGoals.some(g => g.includes(nm) || nm.includes(g));
  });
}

function serviceMatches(serviceTypes: string[], matchList: string[]): boolean {
  const norm = serviceTypes.map(s => s.toLowerCase());
  return matchList.some(m => norm.some(s => s.includes(m) || m.includes(s)));
}

function scoreRelevance(goalAreas: string[], serviceTypes: string[], item: { goalAreaMatch: string[]; serviceMatch?: string[] }): number {
  let score = 0;
  const normalizedGoals = goalAreas.map(normalizeGoalArea);
  for (const m of item.goalAreaMatch) {
    const nm = normalizeGoalArea(m);
    if (normalizedGoals.some(g => g.includes(nm) || nm.includes(g))) score += 2;
  }
  if (item.serviceMatch) {
    const norm = serviceTypes.map(s => s.toLowerCase());
    for (const m of item.serviceMatch) {
      if (norm.some(s => s.includes(m) || m.includes(s))) score += 1;
    }
  }
  return score;
}

router.get("/students/:studentId/iep-suggestions", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const student = await db.select().from(studentsTable).where(eq(studentsTable.id, studentId)).limit(1);
    if (!student.length) { res.status(404).json({ error: "Student not found" }); return; }
    const stu = student[0];

    const goals = await db.select().from(iepGoalsTable).where(eq(iepGoalsTable.studentId, studentId));
    const goalAreas = [...new Set(goals.map(g => g.goalArea).filter(Boolean) as string[])];
    const serviceAreas = [...new Set(goals.map(g => g.serviceArea).filter(Boolean) as string[])];

    const svcReqs = await db.query.serviceRequirementsTable
      ? await db.select().from(serviceRequirementsTable).where(eq(serviceRequirementsTable.studentId, studentId))
      : [];

    let serviceTypeNames: string[] = [];
    try {
      const svcRows = await db.execute(sql`
        SELECT DISTINCT st.name FROM service_requirements sr
        JOIN service_types st ON sr.service_type_id = st.id
        WHERE sr.student_id = ${studentId}
      `);
      serviceTypeNames = (svcRows.rows as any[]).map(r => r.name);
    } catch { }

    const existingBehaviors = await db.select({ name: behaviorTargetsTable.name })
      .from(behaviorTargetsTable)
      .where(and(eq(behaviorTargetsTable.studentId, studentId), eq(behaviorTargetsTable.active, true)));
    const existingBehaviorNames = new Set(existingBehaviors.map(b => b.name.toLowerCase()));

    const existingPrograms = await db.select({ name: programTargetsTable.name })
      .from(programTargetsTable)
      .where(and(eq(programTargetsTable.studentId, studentId), eq(programTargetsTable.active, true)));
    const existingProgramNames = new Set(existingPrograms.map(p => p.name.toLowerCase()));

    const allAreas = [...goalAreas, ...serviceAreas];

    const behaviorSuggestions = BEHAVIOR_CATALOG
      .filter(b => !existingBehaviorNames.has(b.name.toLowerCase()))
      .map(b => ({
        ...b,
        relevance: scoreRelevance(allAreas, serviceTypeNames, b),
        reason: buildReason(allAreas, serviceTypeNames, b),
      }))
      .filter(b => b.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance);

    const dttSuggestions = PROGRAM_CATALOG
      .filter(p => p.programType === "discrete_trial" && !existingProgramNames.has(p.name.toLowerCase()))
      .map(p => ({
        ...p,
        relevance: scoreRelevance(allAreas, serviceTypeNames, p),
        reason: buildReason(allAreas, serviceTypeNames, p),
      }))
      .filter(p => p.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance);

    const taSuggestions = PROGRAM_CATALOG
      .filter(p => p.programType === "task_analysis" && !existingProgramNames.has(p.name.toLowerCase()))
      .map(p => ({
        ...p,
        relevance: scoreRelevance(allAreas, serviceTypeNames, p),
        reason: buildReason(allAreas, serviceTypeNames, p),
      }))
      .filter(p => p.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance);

    const dttAndTaNames = new Set([...dttSuggestions, ...taSuggestions].map(p => p.name));
    const academicPrograms = PROGRAM_CATALOG
      .filter(p => p.domain === "Academic" && !existingProgramNames.has(p.name.toLowerCase()) && !dttAndTaNames.has(p.name))
      .map(p => ({
        ...p,
        relevance: scoreRelevance(allAreas, serviceTypeNames, p),
        reason: buildReason(allAreas, serviceTypeNames, p),
      }))
      .filter(p => p.relevance > 0)
      .sort((a, b) => b.relevance - a.relevance);

    const relatedServices: Array<any> = [];
    for (const svcName of serviceTypeNames) {
      const key = svcName.toLowerCase().includes("speech") ? "speech"
        : svcName.toLowerCase().includes("occupational") || svcName.toLowerCase().includes("ot") ? "ot"
        : svcName.toLowerCase().includes("physical") || svcName.toLowerCase().includes("pt") ? "pt"
        : svcName.toLowerCase().includes("counsel") ? "counseling"
        : svcName.toLowerCase().includes("aba") || svcName.toLowerCase().includes("behavior") ? "aba"
        : svcName.toLowerCase().includes("para") ? "para"
        : null;
      if (key && RELATED_SERVICE_SUGGESTIONS[key]) {
        for (const s of RELATED_SERVICE_SUGGESTIONS[key]) {
          if (!relatedServices.some(r => r.name === s.name)) {
            relatedServices.push({ ...s, linkedService: svcName, relevance: 3 });
          }
        }
      }
    }

    res.json({
      student: { id: stu.id, firstName: stu.firstName, lastName: stu.lastName, grade: stu.grade, disabilityCategory: stu.disabilityCategory },
      iepGoalAreas: goalAreas,
      serviceTypes: serviceTypeNames,
      existingBehaviorCount: existingBehaviors.length,
      existingProgramCount: existingPrograms.length,
      suggestions: {
        behaviors: behaviorSuggestions,
        dtt: dttSuggestions,
        taskAnalyses: taSuggestions,
        academicPrograms,
        relatedServices,
      },
      totalSuggestions: behaviorSuggestions.length + dttSuggestions.length + taSuggestions.length + academicPrograms.length + relatedServices.length,
    });
  } catch (e: any) {
    console.error("GET iep-suggestions error:", e);
    res.status(500).json({ error: "Failed to generate suggestions" });
  }
});

function buildReason(goalAreas: string[], serviceTypes: string[], item: { goalAreaMatch: string[]; serviceMatch?: string[] }): string {
  const parts: string[] = [];
  const normalizedGoals = goalAreas.map(normalizeGoalArea);
  const matchedGoals = item.goalAreaMatch.filter(m => {
    const nm = normalizeGoalArea(m);
    return normalizedGoals.some(g => g.includes(nm) || nm.includes(g));
  });
  if (matchedGoals.length > 0) parts.push(`IEP goals: ${matchedGoals.slice(0, 3).join(", ")}`);
  if (item.serviceMatch) {
    const norm = serviceTypes.map(s => s.toLowerCase());
    const matchedSvcs = item.serviceMatch.filter(m => norm.some(s => s.includes(m) || m.includes(s)));
    if (matchedSvcs.length > 0) parts.push(`Services: ${serviceTypes.filter(s => item.serviceMatch!.some(m => s.toLowerCase().includes(m))).slice(0, 2).join(", ")}`);
  }
  return parts.join(" · ") || "General recommendation";
}

router.post("/students/:studentId/apply-suggestions", async (req, res): Promise<void> => {
  try {
    const studentId = parseInt(req.params.studentId);
    const { behaviors, programs } = req.body;
    const results: any = { behaviorsCreated: 0, programsCreated: 0, skippedDuplicates: 0 };

    const existingBehaviors = await db.select({ name: behaviorTargetsTable.name })
      .from(behaviorTargetsTable)
      .where(and(eq(behaviorTargetsTable.studentId, studentId), eq(behaviorTargetsTable.active, true)));
    const existingBehaviorNames = new Set(existingBehaviors.map(b => b.name.toLowerCase()));

    const existingPrograms = await db.select({ name: programTargetsTable.name })
      .from(programTargetsTable)
      .where(and(eq(programTargetsTable.studentId, studentId), eq(programTargetsTable.active, true)));
    const existingProgramNames = new Set(existingPrograms.map(p => p.name.toLowerCase()));

    if (behaviors && Array.isArray(behaviors)) {
      for (const b of behaviors) {
        const catalogItem = BEHAVIOR_CATALOG.find(c => c.name === b.name);
        if (!catalogItem) continue;
        if (existingBehaviorNames.has(catalogItem.name.toLowerCase())) {
          results.skippedDuplicates++;
          continue;
        }
        await db.insert(behaviorTargetsTable).values({
          studentId,
          name: catalogItem.name,
          description: `Auto-generated from IEP analysis`,
          measurementType: catalogItem.measurementType,
          targetDirection: catalogItem.targetDirection,
          baselineValue: catalogItem.baselineValue,
          goalValue: catalogItem.goalValue,
        });
        existingBehaviorNames.add(catalogItem.name.toLowerCase());
        results.behaviorsCreated++;
      }
    }

    if (programs && Array.isArray(programs)) {
      for (const p of programs) {
        const catalogItem = PROGRAM_CATALOG.find(c => c.name === p.name);
        if (!catalogItem) continue;
        if (existingProgramNames.has(catalogItem.name.toLowerCase())) {
          results.skippedDuplicates++;
          continue;
        }
        const [created] = await db.insert(programTargetsTable).values({
          studentId,
          name: catalogItem.name,
          description: `Auto-generated from IEP analysis`,
          programType: catalogItem.programType,
          targetCriterion: catalogItem.targetCriterion,
          domain: catalogItem.domain,
        }).returning();
        if (created && catalogItem.steps) {
          for (let i = 0; i < catalogItem.steps.length; i++) {
            await db.insert(programStepsTable).values({
              programTargetId: created.id,
              stepNumber: i + 1,
              name: catalogItem.steps[i],
            });
          }
        }
        existingProgramNames.add(catalogItem.name.toLowerCase());
        results.programsCreated++;
      }
    }

    res.json(results);
  } catch (e: any) {
    console.error("POST apply-suggestions error:", e);
    res.status(500).json({ error: "Failed to apply suggestions" });
  }
});

router.get("/iep-suggestions/all-students", async (req, res): Promise<void> => {
  try {
    const students = await db.execute(sql`
      SELECT DISTINCT s.id, s.first_name, s.last_name, s.grade, s.disability_category
      FROM students s
      JOIN service_requirements sr ON sr.student_id = s.id
      WHERE s.status = 'active'
      ORDER BY s.last_name, s.first_name
    `);

    const summaries = [];
    for (const stu of students.rows as any[]) {
      const goals = await db.select({ goalArea: iepGoalsTable.goalArea }).from(iepGoalsTable).where(eq(iepGoalsTable.studentId, stu.id));
      const goalAreas = [...new Set(goals.map(g => g.goalArea).filter(Boolean) as string[])];

      let serviceTypeNames: string[] = [];
      try {
        const svcRows = await db.execute(sql`
          SELECT DISTINCT st.name FROM service_requirements sr
          JOIN service_types st ON sr.service_type_id = st.id
          WHERE sr.student_id = ${stu.id}
        `);
        serviceTypeNames = (svcRows.rows as any[]).map(r => r.name);
      } catch { }

      const existingBehaviors = await db.select().from(behaviorTargetsTable)
        .where(and(eq(behaviorTargetsTable.studentId, stu.id), eq(behaviorTargetsTable.active, true)));
      const existingPrograms = await db.select().from(programTargetsTable)
        .where(and(eq(programTargetsTable.studentId, stu.id), eq(programTargetsTable.active, true)));

      const existingBehaviorNames = new Set(existingBehaviors.map(b => b.name.toLowerCase()));
      const existingProgramNames = new Set(existingPrograms.map(p => p.name.toLowerCase()));
      const allAreas = [...goalAreas, ...serviceTypeNames.map(s => s.split("/")[0].trim())];

      const behaviorCount = BEHAVIOR_CATALOG.filter(b =>
        !existingBehaviorNames.has(b.name.toLowerCase()) && goalAreaMatches(allAreas, b.goalAreaMatch)
      ).length;
      const programCount = PROGRAM_CATALOG.filter(p =>
        !existingProgramNames.has(p.name.toLowerCase()) &&
        (goalAreaMatches(allAreas, p.goalAreaMatch) || serviceMatches(serviceTypeNames.map(s => s.toLowerCase()), p.serviceMatch || []))
      ).length;

      let relatedServiceCount = 0;
      const seen = new Set<string>();
      for (const svcName of serviceTypeNames) {
        const key = svcName.toLowerCase().includes("speech") ? "speech"
          : svcName.toLowerCase().includes("ot") ? "ot"
          : svcName.toLowerCase().includes("pt") ? "pt"
          : svcName.toLowerCase().includes("counsel") ? "counseling"
          : svcName.toLowerCase().includes("aba") ? "aba"
          : svcName.toLowerCase().includes("para") ? "para" : null;
        if (key && RELATED_SERVICE_SUGGESTIONS[key]) {
          for (const s of RELATED_SERVICE_SUGGESTIONS[key]) {
            if (!seen.has(s.name)) { seen.add(s.name); relatedServiceCount++; }
          }
        }
      }

      summaries.push({
        id: stu.id,
        firstName: stu.first_name,
        lastName: stu.last_name,
        grade: stu.grade,
        disabilityCategory: stu.disability_category,
        goalAreas,
        serviceTypes: serviceTypeNames,
        existingBehaviors: existingBehaviors.length,
        existingPrograms: existingPrograms.length,
        suggestedBehaviors: behaviorCount,
        suggestedPrograms: programCount,
        suggestedRelatedServices: relatedServiceCount,
        totalSuggestions: behaviorCount + programCount + relatedServiceCount,
      });
    }

    res.json(summaries);
  } catch (e: any) {
    console.error("GET all-students iep-suggestions error:", e);
    res.status(500).json({ error: "Failed to generate suggestions overview" });
  }
});

export default router;
