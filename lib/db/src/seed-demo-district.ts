import { db } from "./index";
import {
  districtsTable, schoolsTable, schoolYearsTable,
  studentsTable, staffTable, staffAssignmentsTable,
  serviceTypesTable, serviceRequirementsTable,
  sessionLogsTable, scheduleBlocksTable,
  iepDocumentsTable, iepGoalsTable,
  alertsTable, compensatoryObligationsTable,
  missedReasonsTable, behaviorTargetsTable, programTargetsTable,
  dataSessionsTable, behaviorDataTable, programDataTable,
  iepAccommodationsTable, sessionGoalDataTable,
  guardiansTable, emergencyContactsTable, medicalAlertsTable,
  fbasTable, functionalAnalysesTable, behaviorInterventionPlansTable,
  evaluationsTable, teamMeetingsTable, iepMeetingAttendeesTable,
  progressReportsTable, restraintIncidentsTable, documentsTable,
} from "./index";
import { eq, sql, and, isNull, inArray } from "drizzle-orm";
import type { GoalProgressEntry, ServiceDeliveryBreakdown } from "./schema/progressReports";

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randf(min: number, max: number) { return min + Math.random() * (max - min); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function addDays(dateStr: string, days: number) {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split("T")[0];
}
function minToTime(mins: number) {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

const NO_SCHOOL = [
  ["2025-09-01", "2025-09-01"],
  ["2025-10-13", "2025-10-13"],
  ["2025-11-11", "2025-11-11"],
  ["2025-11-27", "2025-11-28"],
  ["2025-12-22", "2026-01-02"],
  ["2026-01-19", "2026-01-19"],
  ["2026-02-16", "2026-02-20"],
  ["2026-03-26", "2026-03-26"],
  ["2026-04-20", "2026-04-24"],
];

function isSchoolDay(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  for (const [s, e] of NO_SCHOOL) { if (dateStr >= s && dateStr <= e) return false; }
  return true;
}

const FIRST_NAMES_MALE = [
  "Ethan", "Liam", "Noah", "Mason", "Logan", "James", "Benjamin", "Lucas",
  "Henry", "Alexander", "Owen", "Sebastian", "Caleb", "Daniel", "Matthew",
  "Nathan", "Ryan", "Dylan", "Tyler", "Adrian", "Marcus", "Jaden", "Andre",
  "Kevin", "Carlos", "Miguel", "David", "Samuel", "Isaac", "Gabriel",
];

const FIRST_NAMES_FEMALE = [
  "Olivia", "Emma", "Ava", "Sophia", "Isabella", "Mia", "Charlotte", "Amelia",
  "Harper", "Evelyn", "Abigail", "Ella", "Scarlett", "Grace", "Chloe",
  "Victoria", "Riley", "Aria", "Lily", "Hannah", "Maya", "Nadia", "Priya",
  "Keisha", "Maria", "Rosa", "Sarah", "Leah", "Zoe", "Camila",
];

const LAST_NAMES = [
  "Anderson", "Bernier", "Cabral", "Dasilva", "Esposito", "Fitzgerald",
  "Gagnon", "Hernandez", "Ibrahim", "Jankowski", "Keane", "Lapointe",
  "Morales", "Nguyen", "O'Brien", "Pereira", "Quinn", "Rezendes",
  "Santos", "Tavares", "Upton", "Vasquez", "Walsh", "Xiong",
  "Yakimov", "Zimmerman", "Amaral", "Burke", "Correia", "Dougherty",
  "Farias", "Gallagher", "Hennessy", "Johnson", "Kim", "Leblanc",
  "MacDonald", "Nolan", "Oliveira", "Patel", "Rodrigues", "Sullivan",
  "Torres", "Vargas", "Williams", "Young",
];

const DISABILITY_CATEGORIES = [
  "Autism", "Specific Learning Disability", "Emotional Disturbance",
  "Intellectual Disability", "Communication Impairment",
  "Health Disability", "Neurological Impairment",
  "Developmental Delay", "Sensory: Hearing", "Physical Disability",
];

const DISABILITY_WEIGHTS = [22, 30, 10, 8, 12, 8, 4, 3, 2, 1];

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

const GRADES = ["PK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const PROVIDER_ROSTER: Array<{ firstName: string; lastName: string; role: string; title: string; email: string; qualifications: string }> = [
  { firstName: "Katherine", lastName: "Reilly", role: "bcba", title: "Board Certified Behavior Analyst", email: "kreilly@metrowestsped.org", qualifications: "BCBA, M.Ed. Applied Behavior Analysis" },
  { firstName: "David", lastName: "Kwan", role: "bcba", title: "BCBA Clinical Supervisor", email: "dkwan@metrowestsped.org", qualifications: "BCBA-D, Ph.D. Behavioral Psychology" },
  { firstName: "Rachel", lastName: "Ferreira", role: "slp", title: "Speech-Language Pathologist", email: "rferreira@metrowestsped.org", qualifications: "CCC-SLP, M.S. Communication Disorders" },
  { firstName: "Thomas", lastName: "Bui", role: "slp", title: "Speech-Language Pathologist", email: "tbui@metrowestsped.org", qualifications: "CCC-SLP, M.A. Speech-Language Pathology" },
  { firstName: "Jennifer", lastName: "Walsh", role: "ot", title: "Occupational Therapist", email: "jwalsh@metrowestsped.org", qualifications: "OTR/L, M.S. Occupational Therapy" },
  { firstName: "Brian", lastName: "Okafor", role: "ot", title: "Occupational Therapist", email: "bokafor@metrowestsped.org", qualifications: "OTR/L, Sensory Integration Certification" },
  { firstName: "Amanda", lastName: "Souza", role: "pt", title: "Physical Therapist", email: "asouza@metrowestsped.org", qualifications: "DPT, Pediatric Physical Therapy" },
  { firstName: "Lisa", lastName: "Kowalski", role: "counselor", title: "School Adjustment Counselor", email: "lkowalski@metrowestsped.org", qualifications: "LICSW, M.S.W., Trauma-Focused CBT" },
  { firstName: "Mark", lastName: "Hennessy", role: "counselor", title: "School Psychologist", email: "mhennessy@metrowestsped.org", qualifications: "Ed.S., NCSP, Licensed School Psychologist" },
  { firstName: "Diana", lastName: "Moreno", role: "para", title: "1:1 Paraprofessional", email: "dmoreno@metrowestsped.org", qualifications: "Paraprofessional License, CPI Trained" },
  { firstName: "Steven", lastName: "Roux", role: "para", title: "ABA Paraprofessional", email: "sroux@metrowestsped.org", qualifications: "RBT Certified, CPI Trained" },
  { firstName: "Maria", lastName: "Alvarez", role: "para", title: "Paraprofessional", email: "malvarez@metrowestsped.org", qualifications: "Paraprofessional License, Bilingual (Spanish)" },
  { firstName: "Patricia", lastName: "Lynch", role: "para", title: "Paraprofessional", email: "plynch@metrowestsped.org", qualifications: "Paraprofessional License, First Aid/CPR" },
  { firstName: "Christopher", lastName: "Tang", role: "provider", title: "Registered Behavior Technician", email: "ctang@metrowestsped.org", qualifications: "RBT Certified, B.A. Psychology" },
  { firstName: "Sarah", lastName: "MacDougall", role: "provider", title: "Registered Behavior Technician", email: "smacdougall@metrowestsped.org", qualifications: "RBT Certified, B.S. Education" },
];

const CASE_MANAGER_ROSTER: Array<{ firstName: string; lastName: string; email: string }> = [
  { firstName: "Colleen", lastName: "Murphy", email: "cmurphy@metrowestsped.org" },
  { firstName: "Andrew", lastName: "Costa", email: "acosta@metrowestsped.org" },
  { firstName: "Diane", lastName: "Callahan", email: "dcallahan@metrowestsped.org" },
  { firstName: "Robert", lastName: "Tran", email: "rtran@metrowestsped.org" },
];

const ADMIN_ROSTER: Array<{ firstName: string; lastName: string; email: string; role: string; title: string }> = [
  { firstName: "Ellen", lastName: "Donahue", email: "edonahue@metrowestsped.org", role: "admin", title: "Director of Student Services" },
  { firstName: "James", lastName: "Fitzgerald", email: "jfitzgerald@metrowestsped.org", role: "coordinator", title: "Special Education Coordinator" },
];

const SERVICE_TYPE_DEFS = [
  { name: "ABA Therapy", category: "aba", color: "#6366f1", defaultIntervalType: "monthly", cptCode: "97153", defaultBillingRate: "72.00" },
  { name: "Occupational Therapy", category: "ot", color: "#8b5cf6", defaultIntervalType: "monthly", cptCode: "97530", defaultBillingRate: "65.00" },
  { name: "Speech-Language Therapy", category: "speech", color: "#06b6d4", defaultIntervalType: "monthly", cptCode: "92507", defaultBillingRate: "68.00" },
  { name: "Counseling", category: "counseling", color: "#10b981", defaultIntervalType: "monthly", cptCode: "90837", defaultBillingRate: "55.00" },
  { name: "Paraprofessional Support", category: "para_support", color: "#f59e0b", defaultIntervalType: "monthly", cptCode: null, defaultBillingRate: "32.00" },
  { name: "Physical Therapy", category: "pt", color: "#ef4444", defaultIntervalType: "monthly", cptCode: "97110", defaultBillingRate: "70.00" },
  { name: "BCBA Consultation", category: "aba", color: "#4f46e5", defaultIntervalType: "monthly", cptCode: "97155", defaultBillingRate: "85.00" },
];

const MISSED_REASON_DEFS = [
  { label: "Student absent from school", category: "student_absence" },
  { label: "Student illness", category: "illness" },
  { label: "Provider absent", category: "staff_absence" },
  { label: "Schedule conflict (assembly/testing)", category: "scheduling" },
  { label: "Student refused services", category: "other" },
  { label: "School closure (weather)", category: "other" },
  { label: "Student in crisis — services deferred", category: "other" },
  { label: "Field trip conflict", category: "scheduling" },
];

interface StudentProfile {
  id: number;
  firstName: string;
  lastName: string;
  tier: "minimal" | "moderate" | "intensive";
  scenario: "healthy" | "shortfall" | "compensatory_risk" | "urgent" | "improving" | "new_enrollment";
  disability: string;
  grade: string;
  services: number[];
}

const STUDENT_SCENARIOS: Array<{ scenario: StudentProfile["scenario"]; weight: number }> = [
  { scenario: "healthy", weight: 40 },
  { scenario: "improving", weight: 15 },
  { scenario: "shortfall", weight: 20 },
  { scenario: "compensatory_risk", weight: 10 },
  { scenario: "urgent", weight: 10 },
  { scenario: "new_enrollment", weight: 5 },
];

const TIER_SERVICE_MAP: Record<string, number[][]> = {
  minimal: [
    [2],
    [1],
    [3],
    [2, 3],
    [1, 3],
    [5],
  ],
  moderate: [
    [2, 1, 3],
    [2, 1, 4],
    [0, 5, 6],
    [1, 3, 5],
    [2, 4, 3],
    [1, 2],
  ],
  intensive: [
    [0, 2, 1, 4, 5],
    [0, 1, 3, 4, 6],
    [0, 2, 4, 3],
    [0, 1, 2, 4],
  ],
};

// Required-minutes RANGES (monthly) per intensity tier × service-type index.
// Each entry is a [min, max] envelope from which the actual requirement is
// uniformly sampled. The bounds are deliberately wider than any single
// "typical" value — they encode the full physical band a tier might land
// inside, not a target. Service-idx 0 = ABA, 4 = paraprofessional support
// (both run far more minutes than therapy services).
const TIER_MINUTE_RANGES: Record<string, Record<number, readonly [number, number]>> = {
  minimal: {
    1: [60, 180],
    2: [60, 180],
    3: [60, 180],
    5: [45, 150],
  },
  moderate: {
    0: [600, 1500],
    1: [120, 300],
    2: [120, 300],
    3: [90, 240],
    4: [600, 1800],
    5: [60, 240],
    6: [30, 120],
  },
  intensive: {
    0: [900, 2100],
    1: [150, 360],
    2: [150, 360],
    3: [120, 300],
    4: [1200, 2700],
    5: [90, 270],
    6: [30, 120],
  },
};

// Per-scenario delivery envelopes. Sampled per student so the scenario name
// describes a band rather than a single fixed delivery percentage.
//   missRate  = probability a scheduled session is recorded as "missed"
//   delivery  = upper bound on the per-session "actually delivered" gate
const SCENARIO_DELIVERY_RANGES: Record<string, {
  missRate: readonly [number, number];
  delivery: readonly [number, number];
}> = {
  healthy:           { missRate: [0.02, 0.08], delivery: [0.85, 1.00] },
  improving:         { missRate: [0.03, 0.10], delivery: [0.78, 0.95] },
  shortfall:         { missRate: [0.10, 0.22], delivery: [0.60, 0.82] },
  compensatory_risk: { missRate: [0.18, 0.32], delivery: [0.40, 0.65] },
  urgent:            { missRate: [0.25, 0.40], delivery: [0.30, 0.55] },
  new_enrollment:    { missRate: [0.02, 0.10], delivery: [0.85, 0.98] },
};

const SESSION_DURATIONS: Record<number, { typical: number; min: number; max: number }> = {
  0: { typical: 60, min: 45, max: 90 },
  1: { typical: 30, min: 20, max: 45 },
  2: { typical: 30, min: 20, max: 45 },
  3: { typical: 45, min: 30, max: 60 },
  4: { typical: 120, min: 60, max: 180 },
  5: { typical: 30, min: 20, max: 45 },
  6: { typical: 60, min: 30, max: 60 },
};

const GOAL_TEMPLATES: Record<number, { area: string; goals: string[] }> = {
  0: { area: "Behavior/ABA", goals: [
    "reduce frequency of target behavior from baseline using ABA-based interventions",
    "increase compliance with adult-directed tasks from {base}% to {target}% across 3 consecutive sessions",
    "demonstrate functional communication as a replacement for problem behavior in 80% of opportunities",
    "independently follow a visual schedule for daily transitions with no more than 1 verbal prompt",
    "tolerate denied access to preferred items by accepting a 'first/then' alternative in {target}% of trials",
    "engage in independent leisure activity for {count} minutes without adult prompting",
    "wait appropriately for adult attention for up to {count} minutes using a wait-card",
    "transition between non-preferred and preferred activities within 30 seconds in {target}% of opportunities",
  ]},
  1: { area: "Occupational Therapy", goals: [
    "improve fine motor control for handwriting legibility, forming {target}% of letters correctly",
    "independently manage zipper, buttons, and snaps during dressing routines in 4 out of 5 trials",
    "improve visual-motor integration for copying tasks, scoring at age-level on the Beery VMI",
    "tolerate a range of sensory inputs during classroom activities without dysregulation for 20+ minutes",
    "use age-appropriate scissor skills to cut along straight and curved lines with {target}% accuracy",
    "manage lunchroom routines (open containers, use utensils, clean tray) independently in 4 of 5 days",
    "demonstrate functional keyboarding at {target} WPM with proper hand placement",
  ]},
  2: { area: "Speech-Language", goals: [
    "produce target phonemes (/r/, /s/, /l/ blends) with {target}% accuracy in structured conversation",
    "increase mean length of utterance to {target} morphemes during narrative retell tasks",
    "initiate and maintain a 3-turn conversational exchange with a peer in 4 out of 5 opportunities",
    "follow 2-step classroom directions without repetition in {target}% of opportunities across settings",
    "answer who/what/where comprehension questions about a short passage with {target}% accuracy",
    "use a core vocabulary AAC device to request, comment, and protest in {count} novel utterances per session",
    "produce grammatically complete sentences using past-tense verbs with {target}% accuracy",
  ]},
  3: { area: "Social-Emotional", goals: [
    "identify and apply 3 coping strategies when frustration level exceeds 5/10 on feelings thermometer",
    "initiate positive peer interactions during unstructured time at least {target} times per day",
    "use 'I feel' statements to express emotions instead of physical responses in 80% of conflicts",
    "demonstrate self-advocacy by requesting help or a break using appropriate language in {target}% of opportunities",
    "accurately identify emotions in self and peers using a feelings chart in {target}% of check-ins",
    "remain in the classroom for {count} consecutive minutes without an unscheduled break request",
    "participate in restorative conversation with a peer following a conflict in 3 of 4 opportunities",
  ]},
  4: { area: "Academic Support", goals: [
    "complete grade-level math assignments with {target}% accuracy using visual supports and check-in prompts",
    "read and comprehend grade-level text, answering comprehension questions with {target}% accuracy",
    "independently organize materials and begin assignments within 2 minutes of teacher direction",
    "participate in general education classroom activities with no more than 2 verbal redirections per block",
    "produce a {count}-paragraph written response using a graphic organizer with {target}% of conventions correct",
    "solve grade-level word problems involving 2-step operations with {target}% accuracy",
    "use assistive technology (text-to-speech, dictation) to access grade-level content independently",
    "track and submit assignments using a planner with {target}% on-time submission rate",
  ]},
  5: { area: "Physical Therapy", goals: [
    "improve dynamic balance to navigate school hallways and stairs with no more than standby assistance",
    "increase core strength and postural stability to maintain seated posture for 20+ minutes",
    "demonstrate age-appropriate gait pattern during school mobility with {target}% correct heel-toe steps",
    "ascend and descend a full flight of stairs using alternating feet with one rail in {target}% of trials",
    "participate in age-appropriate gross motor play (running, jumping, throwing) for {count} minutes",
  ]},
  6: { area: "Behavior Consultation", goals: [
    "oversee ABA program implementation ensuring treatment fidelity above 85%",
    "analyze behavior data trends monthly and adjust intervention strategies within 5 business days",
    "coordinate behavior support plan across all school settings with quarterly team review",
    "train building staff on BIP procedures with {target}% of staff scoring above 80% on procedural fidelity check",
  ]},
};

const COMMON_GOAL_POOL: Array<{ area: string; goal: string }> = [
  { area: "Executive Functioning", goal: "use a daily planner to record assignments and check off completed tasks {target}% of school days" },
  { area: "Executive Functioning", goal: "break a multi-step assignment into 3+ subtasks with timestamps before starting work in 4 of 5 trials" },
  { area: "Executive Functioning", goal: "self-monitor on-task behavior using a 5-minute timer and rate accuracy at {target}% agreement with adult" },
  { area: "Self-Regulation", goal: "request a sensory break using appropriate language before reaching dysregulation in {target}% of opportunities" },
  { area: "Self-Regulation", goal: "use deep-breathing or grounding strategy when prompted to lower arousal level by 2 points on a 1-10 scale" },
  { area: "Self-Regulation", goal: "remain in assigned area during instructional time for {count} consecutive minutes" },
  { area: "Self-Help / Daily Living", goal: "complete morning arrival routine (locker, materials, seat) within 5 minutes in 4 of 5 days" },
  { area: "Self-Help / Daily Living", goal: "independently use restroom and complete hygiene routine without adult prompts in {target}% of opportunities" },
  { area: "Communication", goal: "use complete sentences with peers and adults rather than single-word responses in {target}% of social exchanges" },
  { area: "Communication", goal: "initiate a request for clarification when confused by directions in 3 of 4 academic blocks" },
  { area: "Reading", goal: "read grade-level passages aloud at {target} words correct per minute with appropriate phrasing" },
  { area: "Reading", goal: "summarize the main idea and 2 supporting details of a grade-level text in {target}% of opportunities" },
  { area: "Writing", goal: "produce a {count}-sentence paragraph with topic sentence, details, and closing in {target}% of writing samples" },
  { area: "Writing", goal: "edit own written work for capitalization, punctuation, and spelling using a checklist with {target}% accuracy" },
  { area: "Math", goal: "solve grade-level multi-digit addition/subtraction problems with regrouping at {target}% accuracy" },
  { area: "Math", goal: "demonstrate understanding of fractions/decimals with visual models in {target}% of opportunities" },
  { area: "Math", goal: "apply math concepts to real-world money and time problems with {target}% accuracy" },
  { area: "Social Skills", goal: "demonstrate appropriate turn-taking during group games and discussions in 4 of 5 opportunities" },
  { area: "Social Skills", goal: "interpret nonverbal cues (facial expression, tone) and respond appropriately in {target}% of role-plays" },
  { area: "Vocational/Transition", goal: "complete a structured work task for {count} minutes with no more than 2 prompts" },
  { area: "Vocational/Transition", goal: "participate in transition planning by identifying 3 post-secondary interests and articulating preferences" },
  { area: "Health/PE", goal: "participate in adaptive PE activities for {count} consecutive minutes following safety rules" },
];

const SESSION_NOTE_TEMPLATES: Record<number, string[]> = {
  0: [
    "DTT session: Worked on {goal_short}. Student achieved {pct}% accuracy across 10 trials. Reinforced correct responses with token board. {extra}",
    "NET session during morning routine. Targeted functional communication — student initiated {count} mands independently. {extra}",
    "Focused on behavior reduction: {count} occurrences of target behavior recorded (baseline was {baseline}). Implemented planned ignoring + FCR. {extra}",
  ],
  1: [
    "OT session: Addressed {goal_short}. Student completed {pct}% of tasks with {prompt} support. Grip strength and pencil control showing improvement. {extra}",
    "Sensory integration session. Student tolerated {count}/5 new textures. Used weighted vest during tabletop work — seated attention improved to {count} minutes. {extra}",
  ],
  2: [
    "Speech session: Targeted {goal_short}. Student produced target sounds with {pct}% accuracy in structured drill. {extra}",
    "Language therapy: Worked on {goal_short}. MLU increased to {count} morphemes this session. Student initiated {count} spontaneous requests. {extra}",
  ],
  3: [
    "Counseling: Addressed {goal_short}. Used CBT techniques — student identified {count} cognitive distortions. Mood rated {count}/10 (improved from last session). {extra}",
    "Social skills group (3 students): Practiced perspective-taking with social scenarios. Student participated in {count}/5 structured activities. {extra}",
  ],
  4: [
    "Para support during {block} block. Student completed {pct}% of assigned work with visual supports. Needed {count} verbal redirections. {extra}",
    "Transition support throughout the day. Student used visual schedule for {count}/6 transitions independently. Timer strategy effective for cafeteria. {extra}",
  ],
  5: [
    "PT session: {goal_short}. Stair navigation: ascending independently, descending with one-hand rail. Core exercises — plank hold {count} seconds. {extra}",
  ],
  6: [
    "BCBA consultation: Reviewed behavior data — trend is {trend}. Updated BIP recommendations. Treatment fidelity check: {pct}% across observed sessions. {extra}",
  ],
};

export interface SeedDemoDistrictOptions {
  /**
   * Bypass the safety guard that refuses to TRUNCATE when the database
   * contains non-demo districts. Equivalent to `ALLOW_DEMO_SEED_RESET=1`
   * but scoped to a single call (no global env mutation, race-safe under
   * concurrent requests). Use only from a request handler that has
   * already established appropriate authorization (e.g.
   * `requirePlatformAdmin`).
   */
  allowReset?: boolean;
}

export async function seedDemoDistrict(options: SeedDemoDistrictOptions = {}) {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  TRELLIS DEMO DISTRICT SEEDER                              ║");
  console.log("║  Generating: MetroWest Collaborative (Framingham, MA)       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  // Safety guard: refuse to wipe a database that contains real (non-demo) districts
  // unless the operator explicitly opts in. This prevents accidentally truncating
  // pilot/production data with this seeder.
  const existing = await db.select({ id: districtsTable.id, name: districtsTable.name, isDemo: districtsTable.isDemo }).from(districtsTable);
  const realDistricts = existing.filter(d => !d.isDemo);
  if (realDistricts.length > 0 && !options.allowReset && process.env.ALLOW_DEMO_SEED_RESET !== "1") {
    throw new Error(
      `Refusing to run demo seeder: database contains ${realDistricts.length} non-demo district(s) ` +
      `(${realDistricts.map(d => `"${d.name}"`).join(", ")}). ` +
      `This seeder TRUNCATEs all data. Re-run with ALLOW_DEMO_SEED_RESET=1 only if you are sure ` +
      `you want to wipe this database.`
    );
  }

  console.log("Step 0: Clean existing demo data...");
  await db.execute(sql`TRUNCATE TABLE
    program_data, behavior_data, data_sessions,
    session_goal_data, session_logs, schedule_blocks,
    documents,
    incident_signatures, incident_status_history, restraint_incidents,
    bip_status_history, bip_implementers, bip_fidelity_logs,
    behavior_intervention_plans,
    functional_analyses, fba_observations, fbas,
    eligibility_determinations, evaluations, evaluation_referrals,
    medical_alerts, emergency_contacts, guardians,
    iep_goals, compensatory_obligations, alerts,
    service_requirements, staff_assignments,
    program_targets, behavior_targets,
    progress_reports, team_meetings, iep_meeting_attendees,
    prior_written_notices, meeting_consent_records,
    iep_accommodations, iep_builder_drafts,
    iep_documents,
    parent_contacts, student_check_ins, student_wins, student_notes,
    missed_reasons, students, staff,
    service_types, service_rate_configs,
    school_years, schools, districts
    CASCADE`);
  console.log("  Cleaned all tables");

  console.log("\nStep 1: Create district, schools, and school year...");
  const [district] = await db.insert(districtsTable).values({
    name: "MetroWest Collaborative",
    state: "MA",
    region: "MetroWest",
    isDemo: true,
  }).returning();

  const schoolDefs = [
    { name: "Harmony Elementary School", scheduleType: "standard" as const },
    { name: "Brookfield Middle School", scheduleType: "standard" as const },
    { name: "MetroWest Regional High School", scheduleType: "standard" as const },
  ];

  const schools: Array<{ id: number; name: string }> = [];
  for (const def of schoolDefs) {
    const [s] = await db.insert(schoolsTable).values({
      name: def.name,
      district: district.name,
      districtId: district.id,
      scheduleType: def.scheduleType,
    }).returning();
    schools.push({ id: s.id, name: def.name });
  }
  console.log(`  District: ${district.name} (id=${district.id})`);
  console.log(`  Schools: ${schools.map(s => s.name).join(", ")}`);

  const [schoolYear] = await db.insert(schoolYearsTable).values({
    districtId: district.id,
    label: "2025-2026",
    startDate: "2025-09-02",
    endDate: "2026-06-19",
    isActive: true,
  }).returning();
  console.log(`  School year: ${schoolYear.label}`);

  console.log("\nStep 2: Seed service types and missed reasons...");
  const serviceTypeIds: number[] = [];
  for (const def of SERVICE_TYPE_DEFS) {
    const [st] = await db.insert(serviceTypesTable).values({
      name: def.name,
      category: def.category,
      color: def.color,
      defaultIntervalType: def.defaultIntervalType,
      cptCode: def.cptCode,
      defaultBillingRate: def.defaultBillingRate,
    }).returning();
    serviceTypeIds.push(st.id);
  }
  console.log(`  Created ${serviceTypeIds.length} service types`);

  const missedReasonIds: number[] = [];
  for (const def of MISSED_REASON_DEFS) {
    const [mr] = await db.insert(missedReasonsTable).values(def).returning();
    missedReasonIds.push(mr.id);
  }
  console.log(`  Created ${missedReasonIds.length} missed reasons`);

  console.log("\nStep 3: Create staff...");
  const staffIds: Record<string, number[]> = { bcba: [], slp: [], ot: [], pt: [], counselor: [], para: [], provider: [], case_manager: [], admin: [], coordinator: [] };

  for (const def of ADMIN_ROSTER) {
    const [s] = await db.insert(staffTable).values({
      firstName: def.firstName,
      lastName: def.lastName,
      email: def.email,
      role: def.role,
      title: def.title,
      schoolId: schools[0].id,
      status: "active",
    }).returning();
    staffIds[def.role].push(s.id);
  }

  for (const def of CASE_MANAGER_ROSTER) {
    const schoolIdx = staffIds.case_manager.length % schools.length;
    const [s] = await db.insert(staffTable).values({
      firstName: def.firstName,
      lastName: def.lastName,
      email: def.email,
      role: "case_manager",
      title: "Special Education Teacher / Case Manager",
      schoolId: schools[schoolIdx].id,
      status: "active",
      qualifications: "M.Ed. Special Education, MA DESE Licensed",
    }).returning();
    staffIds.case_manager.push(s.id);
  }

  const roleServiceIdxMap: Record<string, number[]> = {
    bcba: [0, 6],
    slp: [2],
    ot: [1],
    pt: [5],
    counselor: [3],
    para: [4],
    provider: [0],
  };

  for (const def of PROVIDER_ROSTER) {
    const schoolIdx = staffIds[def.role].length % schools.length;
    const [s] = await db.insert(staffTable).values({
      firstName: def.firstName,
      lastName: def.lastName,
      email: def.email,
      role: def.role,
      title: def.title,
      schoolId: schools[schoolIdx].id,
      status: "active",
      qualifications: def.qualifications,
    }).returning();
    staffIds[def.role].push(s.id);
  }

  const totalStaff = Object.values(staffIds).flat().length;
  console.log(`  Created ${totalStaff} staff members`);
  for (const [role, ids] of Object.entries(staffIds)) {
    if (ids.length > 0) console.log(`    ${role}: ${ids.length}`);
  }

  console.log("\nStep 4: Create students with profiles...");
  const usedNames = new Set<string>();
  const studentProfiles: StudentProfile[] = [];
  const NUM_STUDENTS = 42;

  for (let i = 0; i < NUM_STUDENTS; i++) {
    const isMale = Math.random() < 0.58;
    let firstName: string, lastName: string, fullName: string;
    do {
      firstName = pick(isMale ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE);
      lastName = pick(LAST_NAMES);
      fullName = `${firstName} ${lastName}`;
    } while (usedNames.has(fullName));
    usedNames.add(fullName);

    const disability = weightedPick(DISABILITY_CATEGORIES, DISABILITY_WEIGHTS);
    const schoolIdx = i < 16 ? 0 : i < 30 ? 1 : 2;
    const school = schools[schoolIdx];
    const gradeRange = schoolIdx === 0 ? GRADES.slice(0, 7) : schoolIdx === 1 ? GRADES.slice(6, 10) : GRADES.slice(9, 14);
    const grade = pick(gradeRange);
    const cmIdx = i % staffIds.case_manager.length;

    const scenario = weightedPick(
      STUDENT_SCENARIOS.map(s => s.scenario),
      STUDENT_SCENARIOS.map(s => s.weight)
    );

    let tier: StudentProfile["tier"];
    if (disability === "Autism" || disability === "Intellectual Disability") {
      tier = Math.random() < 0.6 ? "intensive" : "moderate";
    } else if (disability === "Emotional Disturbance" || disability === "Neurological Impairment") {
      tier = Math.random() < 0.5 ? "moderate" : "intensive";
    } else {
      tier = Math.random() < 0.6 ? "minimal" : "moderate";
    }

    const serviceSets = TIER_SERVICE_MAP[tier];
    const serviceIdxs = pick(serviceSets);
    const services = serviceIdxs.map(idx => serviceTypeIds[idx]);

    const birthYear = 2025 - (GRADES.indexOf(grade) + 5);
    const birthMonth = rand(1, 12);
    const birthDay = rand(1, 28);
    const dob = `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`;

    const enrollDate = scenario === "new_enrollment" ? "2026-02-03" : `2025-${String(rand(8, 9)).padStart(2, "0")}-0${rand(2, 5)}`;

    const [student] = await db.insert(studentsTable).values({
      firstName,
      lastName,
      grade,
      schoolId: school.id,
      status: "active",
      dateOfBirth: dob,
      disabilityCategory: disability,
      caseManagerId: staffIds.case_manager[cmIdx],
      enrolledAt: enrollDate,
      primaryLanguage: Math.random() < 0.15 ? pick(["Spanish", "Portuguese", "Vietnamese", "Mandarin"]) : "English",
      parentGuardianName: `${pick(["Mr.", "Mrs.", "Ms."])} ${lastName}`,
      parentEmail: `parent.${lastName.toLowerCase()}${rand(10,99)}@gmail.com`,
      parentPhone: `(508) ${rand(200,999)}-${rand(1000,9999)}`,
    }).returning();

    studentProfiles.push({
      id: student.id,
      firstName,
      lastName,
      tier,
      scenario,
      disability,
      grade,
      services,
    });
  }

  const scenarioCounts: Record<string, number> = {};
  for (const p of studentProfiles) scenarioCounts[p.scenario] = (scenarioCounts[p.scenario] || 0) + 1;
  console.log(`  Created ${NUM_STUDENTS} students`);
  console.log(`  Scenarios: ${Object.entries(scenarioCounts).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`  Tiers: minimal=${studentProfiles.filter(p => p.tier === "minimal").length}, moderate=${studentProfiles.filter(p => p.tier === "moderate").length}, intensive=${studentProfiles.filter(p => p.tier === "intensive").length}`);

  console.log("\nStep 5: Create IEP documents...");
  const iepDocMap: Record<number, number> = {};
  for (const sp of studentProfiles) {
    const iepStart = sp.scenario === "new_enrollment"
      ? "2026-02-10"
      : addDays("2025-08-15", rand(0, 60));
    const iepEnd = addDays(iepStart, 365);

    const [iep] = await db.insert(iepDocumentsTable).values({
      studentId: sp.id,
      iepStartDate: iepStart,
      iepEndDate: iepEnd,
      meetingDate: iepStart,
      status: "active",
      iepType: sp.scenario === "new_enrollment" ? "initial" : pick(["annual", "annual", "amendment"]),
      active: true,
      schoolYearId: schoolYear.id,
      preparedBy: pick(staffIds.case_manager),
      plaafpAcademic: `Student demonstrates ${pick(["below grade-level", "approaching grade-level", "variable"])} academic performance in ${pick(["reading", "mathematics", "written expression"])}. Current assessment data indicates ${pick(["continued need for specialized instruction", "progress toward annual goals with supports", "emerging skills requiring ongoing monitoring"])}.`,
      plaafpBehavioral: sp.tier === "intensive" ? `Student exhibits ${pick(["significant", "moderate"])} behavioral challenges including ${pick(["task refusal", "elopement", "aggression toward peers", "self-injurious behavior"])}. Current BIP addresses ${pick(["antecedent modifications", "replacement behaviors", "reinforcement strategies"])}.` : null,
    }).returning();
    iepDocMap[sp.id] = iep.id;
  }
  console.log(`  Created ${Object.keys(iepDocMap).length} IEP documents`);

  console.log("\nStep 6: Create service requirements with provider assignments...");
  const srMap: Record<number, Array<{ id: number; serviceTypeId: number; providerId: number; requiredMinutes: number }>> = {};

  const providerCaseloads: Record<number, number> = {};

  function pickProvider(serviceTypeId: number): number {
    const svcIdx = serviceTypeIds.indexOf(serviceTypeId);
    let candidateRoles: string[] = [];
    for (const [role, svcIdxs] of Object.entries(roleServiceIdxMap)) {
      if (svcIdxs.includes(svcIdx)) candidateRoles.push(role);
    }

    let candidates: number[] = [];
    for (const role of candidateRoles) {
      candidates.push(...(staffIds[role] || []));
    }
    if (candidates.length === 0) candidates = staffIds.provider;

    candidates.sort((a, b) => (providerCaseloads[a] || 0) - (providerCaseloads[b] || 0));
    const chosen = candidates[0];
    providerCaseloads[chosen] = (providerCaseloads[chosen] || 0) + 1;
    return chosen;
  }

  for (const sp of studentProfiles) {
    srMap[sp.id] = [];
    const iepStart = sp.scenario === "new_enrollment" ? "2026-02-10" : addDays("2025-08-15", rand(0, 60));
    const iepEnd = addDays(iepStart, 365);

    for (const svcTypeId of sp.services) {
      const svcIdx = serviceTypeIds.indexOf(svcTypeId);
      const minuteRange = TIER_MINUTE_RANGES[sp.tier]?.[svcIdx] ?? [60, 240];
      const minutes = rand(minuteRange[0], minuteRange[1]);
      const providerId = pickProvider(svcTypeId);

      const [sr] = await db.insert(serviceRequirementsTable).values({
        studentId: sp.id,
        serviceTypeId: svcTypeId,
        providerId,
        deliveryType: svcIdx === 6 ? "consult" : "direct",
        requiredMinutes: minutes,
        intervalType: "monthly",
        startDate: iepStart,
        endDate: iepEnd,
        gridType: svcIdx === 4 ? "A" : "B",
        setting: pick(["Resource Room", "General Education Classroom", "Therapy Room", "Self-Contained Classroom"]),
        groupSize: svcIdx === 3 ? pick(["1:1", "1:2", "1:3"]) : svcIdx === 4 ? pick(["1:1", "Small Group"]) : "1:1",
        active: true,
      }).returning();

      srMap[sp.id].push({ id: sr.id, serviceTypeId: svcTypeId, providerId, requiredMinutes: minutes });
    }
  }

  const totalSRs = Object.values(srMap).flat().length;
  console.log(`  Created ${totalSRs} service requirements`);

  console.log("\nStep 7: Create staff assignments...");
  let assignmentCount = 0;
  for (const sp of studentProfiles) {
    const assignedProviders = new Set<number>();
    for (const sr of srMap[sp.id]) {
      if (!assignedProviders.has(sr.providerId)) {
        await db.insert(staffAssignmentsTable).values({
          staffId: sr.providerId,
          studentId: sp.id,
          assignmentType: "service_provider",
          startDate: "2025-09-02",
        });
        assignedProviders.add(sr.providerId);
        assignmentCount++;
      }
    }
  }
  console.log(`  Created ${assignmentCount} staff assignments`);

  console.log("\nStep 8: Create IEP goals (target: 20+ per student)...");
  let goalCount = 0;
  // Map: studentId -> serviceArea -> goalId[]
  const studentGoalsByArea: Record<number, Record<string, number[]>> = {};
  // Map: studentId -> all goalIds
  const studentAllGoals: Record<number, number[]> = {};

  for (const sp of studentProfiles) {
    studentGoalsByArea[sp.id] = {};
    studentAllGoals[sp.id] = [];
    let goalNum = 1;
    // Sampled per-student so the demo doesn't show every student with the
    // same goal count. Replaces the fixed 22.
    const TARGET_GOALS = rand(16, 28);

    // First pass: 4-5 goals per service area covered by student services
    for (const svcTypeId of sp.services) {
      const svcIdx = serviceTypeIds.indexOf(svcTypeId);
      const templates = GOAL_TEMPLATES[svcIdx];
      if (!templates) continue;

      const numGoals = Math.min(rand(3, 7), templates.goals.length);
      const shuffled = [...templates.goals].sort(() => Math.random() - 0.5);

      for (let g = 0; g < numGoals; g++) {
        const goalText = shuffled[g]
          .replace("{base}", String(rand(20, 40)))
          .replace("{target}", String(rand(75, 95)))
          .replace(/\{count\}/g, String(rand(3, 8)));

        const [row] = await db.insert(iepGoalsTable).values({
          studentId: sp.id,
          goalArea: templates.area,
          goalNumber: goalNum++,
          annualGoal: `Student will ${goalText}.`,
          baseline: `${rand(15, 40)}%`,
          targetCriterion: `${rand(75, 90)}% accuracy across 3 consecutive data collection sessions`,
          measurementMethod: "Direct observation and data collection",
          serviceArea: templates.area,
          iepDocumentId: iepDocMap[sp.id],
          active: true,
        } as any).returning({ id: iepGoalsTable.id });

        (studentGoalsByArea[sp.id][templates.area] ??= []).push(row.id);
        studentAllGoals[sp.id].push(row.id);
        goalCount++;
      }
    }

    // Top up from common pool until we hit TARGET_GOALS
    const pool = [...COMMON_GOAL_POOL].sort(() => Math.random() - 0.5);
    let pi = 0;
    while (studentAllGoals[sp.id].length < TARGET_GOALS && pi < pool.length) {
      const tmpl = pool[pi++];
      const goalText = tmpl.goal
        .replace("{base}", String(rand(20, 40)))
        .replace("{target}", String(rand(70, 95)))
        .replace(/\{count\}/g, String(rand(3, 10)));

      const [row] = await db.insert(iepGoalsTable).values({
        studentId: sp.id,
        goalArea: tmpl.area,
        goalNumber: goalNum++,
        annualGoal: `Student will ${goalText}.`,
        baseline: `${rand(15, 45)}%`,
        targetCriterion: `${rand(70, 90)}% across 3 consecutive measurements`,
        measurementMethod: pick(["Direct observation", "Work sample analysis", "Curriculum-based measure", "Teacher rating + data probe"]),
        serviceArea: tmpl.area,
        iepDocumentId: iepDocMap[sp.id],
        active: true,
      } as any).returning({ id: iepGoalsTable.id });

      (studentGoalsByArea[sp.id][tmpl.area] ??= []).push(row.id);
      studentAllGoals[sp.id].push(row.id);
      goalCount++;
    }
  }
  console.log(`  Created ${goalCount} IEP goals (avg ${(goalCount / studentProfiles.length).toFixed(1)}/student)`);

  console.log("\nStep 9: Generate session logs...");
  const schoolDays: string[] = [];
  let cur = new Date("2025-09-02T00:00:00");
  const endDate = new Date("2026-04-15T00:00:00");
  while (cur <= endDate) {
    const ds = cur.toISOString().split("T")[0];
    if (isSchoolDay(ds)) schoolDays.push(ds);
    cur.setDate(cur.getDate() + 1);
  }
  console.log(`  ${schoolDays.length} school days in range`);

  const DAYS_OF_WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];
  // Build a broad candidate set (8:00–15:30 in 30-min steps) shuffled per
  // (student, date) so sessions don't cluster at the same early hour each day.
  const BASE_START_MINS = Array.from({ length: 16 }, (_, i) => 8*60 + i*30); // 8:00–15:30
  function shuffledStartMins(studentId: number, dateStr: string): number[] {
    const seed = studentId * 31 + dateStr.split("-").reduce((a, c) => a + parseInt(c), 0);
    return [...BASE_START_MINS].sort((a, b) => ((a * seed) % 97) - ((b * seed) % 97));
  }

  const dailyStudentSlots: Record<string, Array<[number, number]>> = {};
  const dailyStaffSlots: Record<string, Array<[number, number]>> = {};

  function isFree(slots: Record<string, Array<[number, number]>>, key: string, start: number, dur: number) {
    const end = start + dur;
    return !(slots[key] || []).some(([s, e]) => start < e && end > s);
  }
  function reserve(slots: Record<string, Array<[number, number]>>, key: string, start: number, dur: number) {
    (slots[key] ??= []).push([start, start + dur]);
  }

  const sessionBatch: any[] = [];
  const studentDelivered: Record<number, number> = {};
  const studentRequired: Record<number, number> = {};
  const WEEKS_PER_MONTH = 4.3;

  for (const sp of studentProfiles) {
    const srs = srMap[sp.id];
    const enrollStart = sp.scenario === "new_enrollment" ? "2026-02-03" : "2025-09-02";
    const eligibleDays = schoolDays.filter(d => d >= enrollStart);

    // Sample per-student inside each scenario's range so two "shortfall"
    // students don't both land at exactly missRate=0.15 / delivery=0.70.
    const profile = SCENARIO_DELIVERY_RANGES[sp.scenario] ?? {
      missRate: [0.03, 0.10] as const,
      delivery: [0.80, 0.95] as const,
    };
    const missRate = randf(profile.missRate[0], profile.missRate[1]);
    const deliveryRatio = randf(profile.delivery[0], profile.delivery[1]);

    for (const sr of srs) {
      const svc = SESSION_DURATIONS[serviceTypeIds.indexOf(sr.serviceTypeId)] || SESSION_DURATIONS[3];
      const weeklyTarget = sr.requiredMinutes / WEEKS_PER_MONTH;
      let sessPerWeek = Math.max(1, Math.round(weeklyTarget / svc.typical));
      sessPerWeek = Math.min(sessPerWeek, 5);

      const preferred: number[] = [];
      for (let i = 0; i < sessPerWeek; i++) {
        const dayIdx = 1 + ((sp.id * 3 + serviceTypeIds.indexOf(sr.serviceTypeId) * 2 + i * 2) % 5);
        if (!preferred.includes(dayIdx)) preferred.push(dayIdx);
        else {
          const alt = [1,2,3,4,5].find(d => !preferred.includes(d));
          if (alt) preferred.push(alt);
        }
      }

      const sessionDuration = Math.max(svc.min, Math.min(svc.max, Math.round(weeklyTarget / sessPerWeek / 5) * 5));
      studentRequired[sp.id] = (studentRequired[sp.id] || 0) + sr.requiredMinutes;

      const blocks = pick(["math", "reading", "ELA", "science", "social studies"]);
      const trends = ["improving", "stable", "variable"];

      for (const date of eligibleDays) {
        const dow = new Date(date + "T00:00:00").getDay();
        if (!preferred.includes(dow)) continue;

        const shouldDeliver = Math.random() > missRate && Math.random() < (deliveryRatio + 0.15);
        const sKey = `${sp.id}-${date}`;
        const stKey = `${sr.providerId}-${date}`;

        if (shouldDeliver) {
          let startMin: number | null = null;
          for (const sm of shuffledStartMins(sp.id, date)) {
            if (sm + sessionDuration > 16 * 60) continue;
            if (isFree(dailyStudentSlots, sKey, sm, sessionDuration) &&
                isFree(dailyStaffSlots, stKey, sm, sessionDuration)) {
              startMin = sm;
              break;
            }
          }
          if (startMin === null) continue;

          reserve(dailyStudentSlots, sKey, startMin, sessionDuration);
          reserve(dailyStaffSlots, stKey, startMin, sessionDuration);

          const jitter = Math.round((Math.random() * 2 - 1) * (svc.max - svc.min) * 0.1);
          const dur = Math.max(svc.min, Math.min(svc.max, sessionDuration + jitter));

          const svcIdxNote = serviceTypeIds.indexOf(sr.serviceTypeId);
          const noteTemplates = SESSION_NOTE_TEMPLATES[svcIdxNote] || SESSION_NOTE_TEMPLATES[5];
          let note = pick(noteTemplates);
          note = note.replace("{goal_short}", "current IEP objectives");
          note = note.replace("{pct}", String(rand(55, 95)));
          note = note.replace("{prompt}", pick(["minimal", "moderate", "verbal", "gestural"]));
          note = note.replace(/\{count\}/g, String(rand(2, 12)));
          note = note.replace("{baseline}", String(rand(8, 15)));
          note = note.replace("{block}", blocks);
          note = note.replace("{trend}", pick(trends));
          note = note.replace("{extra}", Math.random() < 0.4 ? pick([
            "Parent communication sent regarding progress.",
            "Will adjust reinforcement schedule next session.",
            "Student made notable gains today.",
            "Data shared with case manager.",
            "Collaborated with classroom teacher on generalization.",
          ]) : "");

          sessionBatch.push({
            studentId: sp.id,
            serviceRequirementId: sr.id,
            serviceTypeId: sr.serviceTypeId,
            staffId: sr.providerId,
            sessionDate: date,
            startTime: minToTime(startMin),
            endTime: minToTime(startMin + dur),
            durationMinutes: dur,
            location: pick(["Resource Room", "Therapy Room", "Classroom", "Sensory Room", "Speech Room", "Counseling Office"]),
            deliveryMode: "in_person",
            status: "completed",
            isMakeup: false,
            notes: note.trim(),
            schoolYearId: schoolYear.id,
          });
          studentDelivered[sp.id] = (studentDelivered[sp.id] || 0) + dur;
        } else {
          const missedReason = pick(missedReasonIds);
          sessionBatch.push({
            studentId: sp.id,
            serviceRequirementId: sr.id,
            serviceTypeId: sr.serviceTypeId,
            staffId: sr.providerId,
            sessionDate: date,
            startTime: "09:00",
            endTime: "09:00",
            durationMinutes: 0,
            location: null,
            deliveryMode: "in_person",
            status: "missed",
            missedReasonId: missedReason,
            isMakeup: false,
            notes: pick([
              "Student absent from school.",
              "Provider absent — session rescheduled.",
              "Schedule conflict (assembly).",
              "Student refused services.",
              "Student in crisis — services deferred.",
            ]),
            schoolYearId: schoolYear.id,
          });
        }
      }
    }
  }

  // Service-type-id -> goal area name (for matching sessions to goals)
  const SVC_AREA_NAME: Record<number, string> = {};
  for (const stId of serviceTypeIds) {
    const idx = serviceTypeIds.indexOf(stId);
    SVC_AREA_NAME[stId] = GOAL_TEMPLATES[idx]?.area || "Academic Support";
  }

  const insertedSessionRows: Array<{ id: number; studentId: number; serviceTypeId: number | null; status: string }> = [];
  for (let i = 0; i < sessionBatch.length; i += 500) {
    const rows = await db.insert(sessionLogsTable)
      .values(sessionBatch.slice(i, i + 500))
      .returning({
        id: sessionLogsTable.id,
        studentId: sessionLogsTable.studentId,
        serviceTypeId: sessionLogsTable.serviceTypeId,
        status: sessionLogsTable.status,
      });
    insertedSessionRows.push(...rows);
  }
  const completed = sessionBatch.filter(s => s.status === "completed").length;
  const missed = sessionBatch.filter(s => s.status === "missed").length;
  console.log(`  Inserted ${sessionBatch.length} session logs (${completed} completed, ${missed} missed)`);

  // session_goal_data: link each completed session to 1-2 IEP goals in matching area
  console.log("  Linking sessions to IEP goals...");
  const sgdBatch: any[] = [];
  for (const sess of insertedSessionRows) {
    if (sess.status !== "completed" || sess.serviceTypeId == null) continue;
    const areaName = SVC_AREA_NAME[sess.serviceTypeId];
    let candidateGoals = studentGoalsByArea[sess.studentId]?.[areaName] || [];
    if (candidateGoals.length === 0) candidateGoals = studentAllGoals[sess.studentId] || [];
    if (candidateGoals.length === 0) continue;

    const numLinks = Math.min(candidateGoals.length, Math.random() < 0.6 ? 1 : 2);
    const shuffled = [...candidateGoals].sort(() => Math.random() - 0.5);
    for (let k = 0; k < numLinks; k++) {
      const pct = rand(45, 95);
      const trials = rand(8, 20);
      const correct = Math.round(trials * pct / 100);
      const promptLevel = pick(["independent", "verbal", "gestural", "model", "physical"]);
      sgdBatch.push({
        sessionLogId: sess.id,
        iepGoalId: shuffled[k],
        notes: `${correct}/${trials} trials correct (${pct}%); prompt level: ${promptLevel}.`,
      });
    }
  }
  for (let i = 0; i < sgdBatch.length; i += 1000) {
    await db.insert(sessionGoalDataTable).values(sgdBatch.slice(i, i + 1000));
  }
  console.log(`  Inserted ${sgdBatch.length} session/goal data points`);

  console.log("\nStep 10: Create schedule blocks...");
  const sbStudentSlots: Record<string, Array<[number, number]>> = {};
  const sbStaffSlots: Record<string, Array<[number, number]>> = {};
  const blockBatch: any[] = [];
  const BLOCK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  // Wider block candidate set (8:00–15:00 in 30-min steps), shuffled per
  // (student, service) to avoid clustering the same slot every week.
  const BASE_BLOCK_MINS = Array.from({ length: 15 }, (_, i) => 8*60 + i*30); // 8:00–15:00
  function shuffledBlockMins(studentId: number, serviceIdx: number): number[] {
    const seed = studentId * 13 + serviceIdx * 53;
    return [...BASE_BLOCK_MINS].sort((a, b) => ((a * seed) % 89) - ((b * seed) % 89));
  }
  const LOCATIONS_BY_SVC: Record<number, string> = {};
  serviceTypeIds.forEach((id, idx) => {
    const locs = ["ABA Therapy Room", "OT Room", "Speech Room", "Counseling Office", "Classroom", "PT Room", "Conference Room"];
    LOCATIONS_BY_SVC[id] = locs[idx] || "Resource Room";
  });

  for (const sp of studentProfiles) {
    for (const sr of srMap[sp.id]) {
      const svcIdx = serviceTypeIds.indexOf(sr.serviceTypeId);
      const svc = SESSION_DURATIONS[svcIdx] || SESSION_DURATIONS[3];
      const weeklyTarget = sr.requiredMinutes / WEEKS_PER_MONTH;
      let sessPerWeek = Math.max(1, Math.round(weeklyTarget / svc.typical));
      sessPerWeek = Math.min(sessPerWeek, 5);
      const sessionDuration = Math.max(svc.min, Math.min(svc.max, Math.round(weeklyTarget / sessPerWeek / 5) * 5));

      const dayOrder = [...BLOCK_DAYS].sort((a, b) => {
        const ai = (sp.id * 7 + svcIdx * 3 + BLOCK_DAYS.indexOf(a)) % 5;
        const bi = (sp.id * 7 + svcIdx * 3 + BLOCK_DAYS.indexOf(b)) % 5;
        return ai - bi;
      });

      let scheduled = 0;
      for (const day of dayOrder) {
        if (scheduled >= sessPerWeek) break;
        const sKey = `${sp.id}-${day}`;
        const stKey = `${sr.providerId}-${day}`;
        for (const slotMin of shuffledBlockMins(sp.id, svcIdx)) {
          const endMin = slotMin + sessionDuration;
          if (endMin > 16 * 60) continue;
          if (isFree(sbStudentSlots, sKey, slotMin, sessionDuration) &&
              isFree(sbStaffSlots, stKey, slotMin, sessionDuration)) {
            reserve(sbStudentSlots, sKey, slotMin, sessionDuration);
            reserve(sbStaffSlots, stKey, slotMin, sessionDuration);
            blockBatch.push({
              staffId: sr.providerId,
              studentId: sp.id,
              serviceTypeId: sr.serviceTypeId,
              dayOfWeek: day,
              startTime: minToTime(slotMin),
              endTime: minToTime(endMin),
              location: LOCATIONS_BY_SVC[sr.serviceTypeId] || "Resource Room",
              blockType: "service",
              isRecurring: true,
              isAutoGenerated: true,
              schoolYearId: schoolYear.id,
            });
            scheduled++;
            break;
          }
        }
      }
    }
  }

  for (let i = 0; i < blockBatch.length; i += 200) {
    await db.insert(scheduleBlocksTable).values(blockBatch.slice(i, i + 200));
  }
  console.log(`  Inserted ${blockBatch.length} schedule blocks`);

  console.log("\nStep 11: Create alerts...");
  // Alert authoring rules for the demo seed:
  //   1. Every alert must reference a real student, requirement, or staff row
  //      so the click-through link in the UI lands somewhere meaningful.
  //   2. The `type` field must match one of the values handled by
  //      computeSourceUrl() in pages/alerts.tsx, otherwise the "View Details"
  //      link silently disappears.
  //   3. Messages should name the student and cite a concrete shortfall
  //      number — vague filler like "monitor closely" reads as placeholder
  //      copy in front of pilot districts.
  const alertBatch: any[] = [];
  for (const sp of studentProfiles) {
    const firstName = sp.firstName ?? "Student";
    const svcCount = sp.services.length;
    const primarySr = srMap[sp.id]?.[0];

    if (sp.scenario === "urgent") {
      // Critical: severely under-delivered, this is the top of the inbox.
      const pct = rand(38, 49);
      alertBatch.push({
        type: "behind_on_minutes",
        severity: "critical",
        studentId: sp.id,
        serviceRequirementId: primarySr?.id,
        message: `${firstName} is at ${pct}% of required service minutes this period across ${svcCount} service${svcCount === 1 ? "" : "s"}. Compensatory exposure if unresolved.`,
        suggestedAction: "Open the compliance view, assign make-up sessions this week, and confirm provider availability.",
        resolved: false,
      });
      // Second urgent alert in ~half of cases — scoped to the provider so the
      // staff filter on /alerts has data, and surfaces missed-session pattern.
      if (rand(0, 1) === 0 && primarySr?.providerId) {
        const missed = rand(3, 5);
        alertBatch.push({
          type: "missed_sessions",
          severity: "high",
          studentId: sp.id,
          staffId: primarySr.providerId,
          serviceRequirementId: primarySr.id,
          message: `${missed} sessions missed for ${firstName} in the past 14 days with no make-ups logged.`,
          suggestedAction: "Reschedule missed sessions or document a coverage plan with the case manager.",
          resolved: false,
        });
      }
    }
    if (sp.scenario === "compensatory_risk") {
      const owed = rand(45, 90);
      alertBatch.push({
        type: "projected_shortfall",
        severity: "high",
        studentId: sp.id,
        serviceRequirementId: primarySr?.id,
        message: `${firstName} is projected to end the IEP period ~${owed} minutes short. Compensatory plan likely required.`,
        suggestedAction: "Review delivery pace on the compliance page and prepare a compensatory services proposal.",
        resolved: false,
      });
    }
    if (sp.scenario === "shortfall") {
      const pct = rand(70, 79);
      alertBatch.push({
        type: "behind_on_minutes",
        severity: "medium",
        studentId: sp.id,
        serviceRequirementId: primarySr?.id,
        message: `${firstName} is at ${pct}% of required service minutes — below the 80% pace threshold.`,
        suggestedAction: "Add one extra session this week to bring delivery back on pace.",
        // Sprinkle a few pre-resolved ones so the Resolved tab isn't empty.
        resolved: rand(0, 9) < 3,
      });
    }
  }

  // Replaced the two hardcoded "Quarterly compliance report due in 14 days"
  // / "2 provider schedules have unresolved conflicts" alerts: those numbers
  // were fabricated and the alerts had no studentId, so "View Details" was
  // hidden. We rely on the per-student alerts above (and the live compliance
  // engine, which the demo seed reset can invoke via runComplianceChecks) to
  // populate the inbox.

  for (const alert of alertBatch) {
    await db.insert(alertsTable).values(alert);
  }
  const sevTally = alertBatch.reduce<Record<string, number>>((acc, a) => {
    acc[a.severity] = (acc[a.severity] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  Created ${alertBatch.length} alerts (${Object.entries(sevTally).map(([k, v]) => `${k}=${v}`).join(", ")})`);

  console.log("\nStep 12: Create compensatory obligations...");
  let compCount = 0;
  for (const sp of studentProfiles) {
    if (sp.scenario !== "compensatory_risk" && sp.scenario !== "urgent") continue;

    for (const sr of srMap[sp.id]) {
      if (Math.random() < 0.6) {
        const monthsBack = rand(1, 3);
        const periodStart = addDays("2026-04-01", -30 * monthsBack);
        const periodEnd = addDays(periodStart, 29);
        // Sample owed fraction from a per-scenario range instead of a fixed target
        const owedFraction = sp.scenario === "urgent"
          ? randf(0.35, 0.55)
          : randf(0.20, 0.40);
        const minutesOwed = Math.round(sr.requiredMinutes * owedFraction);
        const deliveredFraction = sp.scenario === "urgent"
          ? randf(0, 0.08)
          : randf(0.10, 0.35);
        const minutesDelivered = Math.round(minutesOwed * deliveredFraction);

        await db.insert(compensatoryObligationsTable).values({
          studentId: sp.id,
          serviceRequirementId: sr.id,
          periodStart,
          periodEnd,
          minutesOwed,
          minutesDelivered,
          status: minutesDelivered >= minutesOwed ? "completed" : "pending",
          notes: sp.scenario === "urgent"
            ? "Provider absence and scheduling conflicts resulted in significant shortfall. Compensatory plan required."
            : "Partial delivery gap identified during monthly compliance review.",
          source: "system",
        });
        compCount++;
      }
    }
  }
  console.log(`  Created ${compCount} compensatory obligations`);

  console.log("\nStep 13: Create behavior & program targets...");
  let behCount = 0, progCount = 0;
  for (const sp of studentProfiles) {
    if (sp.tier !== "intensive" && sp.tier !== "moderate") continue;
    const hasABA = sp.services.some(s => serviceTypeIds.indexOf(s) === 0);

    if (hasABA || sp.tier === "intensive") {
      const numBeh = rand(2, 4);
      const behTemplates = [
        { name: "Task Refusal", measurementType: "frequency", targetDirection: "decrease", baselineValue: String(rand(8, 14)), goalValue: String(rand(1, 3)) },
        { name: "Elopement", measurementType: "frequency", targetDirection: "decrease", baselineValue: String(rand(3, 6)), goalValue: "0" },
        { name: "On-Task Behavior", measurementType: "percentage", targetDirection: "increase", baselineValue: String(rand(25, 40)), goalValue: String(rand(80, 90)) },
        { name: "Verbal Outbursts", measurementType: "frequency", targetDirection: "decrease", baselineValue: String(rand(6, 12)), goalValue: String(rand(1, 3)) },
        { name: "Manding (Requesting)", measurementType: "frequency", targetDirection: "increase", baselineValue: String(rand(2, 5)), goalValue: String(rand(12, 20)) },
        { name: "Independent Transitions", measurementType: "percentage", targetDirection: "increase", baselineValue: String(rand(20, 35)), goalValue: String(rand(85, 95)) },
      ].sort(() => Math.random() - 0.5);

      for (let i = 0; i < numBeh && i < behTemplates.length; i++) {
        await db.insert(behaviorTargetsTable).values({
          studentId: sp.id,
          ...behTemplates[i],
        });
        behCount++;
      }

      const numProg = rand(2, 3);
      const progTemplates = [
        { name: "Receptive Instructions: 2-Step", programType: "discrete_trial", domain: "Language", targetCriterion: "80% across 3 sessions" },
        { name: "Functional Communication: PECS Phase II", programType: "discrete_trial", domain: "Communication", targetCriterion: "80% across 3 sessions" },
        { name: "Independent Handwashing", programType: "task_analysis", domain: "Daily Living", targetCriterion: "100% independent across 5 sessions" },
        { name: "Social Greetings", programType: "discrete_trial", domain: "Social", targetCriterion: "80% across 5 sessions" },
        { name: "Following Classroom Routines", programType: "task_analysis", domain: "Adaptive", targetCriterion: "90% independent across 3 sessions" },
      ].sort(() => Math.random() - 0.5);

      for (let i = 0; i < numProg && i < progTemplates.length; i++) {
        await db.insert(programTargetsTable).values({
          studentId: sp.id,
          ...progTemplates[i],
        } as any);
        progCount++;
      }
    }
  }
  console.log(`  Created ${behCount} behavior targets, ${progCount} program targets`);

  // ──────────────────────────────────────────────────────────────────
  // Step 14: Accommodations (5-10 per student)
  // ──────────────────────────────────────────────────────────────────
  console.log("\nStep 14: Create accommodations...");
  const ACCOMMODATION_BANK: Array<{ category: string; description: string; setting?: string; frequency?: string }> = [
    { category: "instruction", description: "Extended time (1.5x) on classroom assignments and assessments", setting: "All academic settings", frequency: "Daily / as needed" },
    { category: "instruction", description: "Preferential seating near teacher and away from high-traffic areas", setting: "All classrooms", frequency: "Daily" },
    { category: "instruction", description: "Chunked assignments — break multi-step tasks into smaller segments", setting: "All academic blocks", frequency: "Daily" },
    { category: "instruction", description: "Visual schedule and advance notice of transitions/changes in routine", setting: "All settings", frequency: "Daily" },
    { category: "instruction", description: "Frequent check-ins for understanding (every 10-15 minutes)", setting: "All academic blocks", frequency: "Daily" },
    { category: "instruction", description: "Use of graphic organizers for written tasks", setting: "ELA, Social Studies, Science", frequency: "All writing tasks" },
    { category: "instruction", description: "Provide written copy of board notes / teacher slides", setting: "All academic blocks", frequency: "Daily" },
    { category: "instruction", description: "Reduced number of math problems (focus on mastery, not volume)", setting: "Math", frequency: "Daily" },
    { category: "assessment", description: "Extended time (2x) on standardized assessments", setting: "Assessment settings", frequency: "All assessments" },
    { category: "assessment", description: "Small-group testing environment with reduced distractions", setting: "Resource room", frequency: "All assessments" },
    { category: "assessment", description: "Test directions read aloud and clarified as needed", setting: "Assessment settings", frequency: "All assessments" },
    { category: "assessment", description: "Use of calculator on math computation (not problem-solving)", setting: "Math assessments", frequency: "As permitted by test rules" },
    { category: "assessment", description: "Frequent breaks during testing (every 30 minutes)", setting: "Assessment settings", frequency: "All assessments" },
    { category: "environmental", description: "Access to sensory tools (fidget, chewy, weighted lap pad)", setting: "All settings", frequency: "As needed" },
    { category: "environmental", description: "Access to a quiet break space when dysregulated", setting: "Counseling office / Resource room", frequency: "As needed" },
    { category: "environmental", description: "Noise-cancelling headphones available during independent work", setting: "All academic blocks", frequency: "As needed" },
    { category: "behavioral", description: "Daily behavior check-in/check-out with case manager", setting: "Resource room", frequency: "Daily — start and end of day" },
    { category: "behavioral", description: "Use of token reinforcement system tied to BIP", setting: "All settings", frequency: "Daily" },
    { category: "presentation", description: "Text-to-speech for grade-level reading material", setting: "All academic blocks", frequency: "Daily" },
    { category: "response", description: "Use of speech-to-text/word prediction for written responses", setting: "All academic blocks", frequency: "Daily" },
  ];
  let accomCount = 0;
  for (const sp of studentProfiles) {
    const numAccom = rand(5, 10);
    const shuffled = [...ACCOMMODATION_BANK].sort(() => Math.random() - 0.5).slice(0, numAccom);
    for (const a of shuffled) {
      await db.insert(iepAccommodationsTable).values({
        studentId: sp.id,
        iepDocumentId: iepDocMap[sp.id],
        category: a.category,
        description: a.description,
        setting: a.setting ?? null,
        frequency: a.frequency ?? null,
        provider: pick(["Special Education Teacher", "General Education Teacher", "All instructional staff", "Case Manager"]),
        verificationScheduleDays: 30,
        active: true,
      } as any);
      accomCount++;
    }
  }
  console.log(`  Created ${accomCount} accommodations`);

  // ──────────────────────────────────────────────────────────────────
  // Step 15: Guardians + Emergency Contacts + Medical Alerts
  // ──────────────────────────────────────────────────────────────────
  console.log("\nStep 15: Create guardians, emergency contacts, medical alerts...");
  const RELATIONSHIPS_GUARDIAN = ["Mother", "Father", "Step-Parent", "Grandparent (Legal Guardian)", "Foster Parent"];
  const RELATIONSHIPS_EMERG = ["Aunt", "Uncle", "Grandparent", "Family Friend", "Neighbor", "Older Sibling"];
  const FIRST_NAMES_ADULT = ["Maria", "Carla", "Patricia", "Linda", "Michelle", "Jennifer", "Karen", "Susan", "Maria",
    "John", "Robert", "James", "William", "David", "Richard", "Joseph", "Thomas", "Charles", "Daniel", "Mark"];
  let guardCount = 0, emergCount = 0, medCount = 0;
  for (const sp of studentProfiles) {
    const studentRow = await db.select({ lastName: studentsTable.lastName, primaryLanguage: studentsTable.primaryLanguage }).from(studentsTable).where(eq(studentsTable.id, sp.id)).limit(1);
    const lastName = studentRow[0]?.lastName || "Smith";
    const primaryLang = studentRow[0]?.primaryLanguage || "English";
    const interpreterNeeded = primaryLang !== "English" && Math.random() < 0.5;

    // Guardian 1 (primary)
    const g1Name = `${pick(FIRST_NAMES_ADULT)} ${lastName}`;
    await db.insert(guardiansTable).values({
      studentId: sp.id,
      name: g1Name,
      relationship: pick(["Mother", "Father"]),
      email: `${g1Name.toLowerCase().replace(/\s+/g, ".")}${rand(10,99)}@gmail.com`,
      phone: `(508) ${rand(200, 999)}-${rand(1000, 9999)}`,
      preferredContactMethod: pick(["email", "phone", "text"]),
      contactPriority: 1,
      interpreterNeeded,
      language: interpreterNeeded ? primaryLang : null,
      notes: interpreterNeeded ? `Prefers communication in ${primaryLang}. Interpreter available through district language services.` : null,
    } as any);
    guardCount++;

    // Guardian 2 (secondary, ~75% of students)
    if (Math.random() < 0.75) {
      const g2LastName = Math.random() < 0.85 ? lastName : pick(LAST_NAMES);
      const g2Name = `${pick(FIRST_NAMES_ADULT)} ${g2LastName}`;
      await db.insert(guardiansTable).values({
        studentId: sp.id,
        name: g2Name,
        relationship: pick(RELATIONSHIPS_GUARDIAN),
        email: `${g2Name.toLowerCase().replace(/\s+/g, ".")}${rand(10,99)}@gmail.com`,
        phone: `(508) ${rand(200, 999)}-${rand(1000, 9999)}`,
        preferredContactMethod: pick(["email", "phone"]),
        contactPriority: 2,
        interpreterNeeded: false,
      } as any);
      guardCount++;
    }

    // Emergency contacts (2-3 per student)
    const numEmerg = rand(2, 3);
    for (let i = 0; i < numEmerg; i++) {
      const ecLast = pick(LAST_NAMES);
      await db.insert(emergencyContactsTable).values({
        studentId: sp.id,
        firstName: pick(FIRST_NAMES_ADULT),
        lastName: ecLast,
        relationship: pick(RELATIONSHIPS_EMERG),
        phone: `(508) ${rand(200, 999)}-${rand(1000, 9999)}`,
        phoneSecondary: Math.random() < 0.4 ? `(508) ${rand(200, 999)}-${rand(1000, 9999)}` : null,
        email: Math.random() < 0.6 ? `${ecLast.toLowerCase()}.${pick(["family","home","contact"])}@gmail.com` : null,
        isAuthorizedForPickup: Math.random() < 0.7,
        priority: i + 1,
      } as any);
      emergCount++;
    }

    // Medical alerts (~30% of students)
    if (Math.random() < 0.30) {
      const numAlerts = rand(1, 2);
      const alertOptions = [
        { alertType: "allergy" as const, severity: "severe" as const, description: "Tree nut allergy (anaphylactic)", treatmentNotes: "EpiPen Jr. on file with school nurse. Avoid all tree-nut-containing products.", epiPenOnFile: true, notifyAllStaff: true },
        { alertType: "allergy" as const, severity: "moderate" as const, description: "Dairy allergy", treatmentNotes: "Avoid milk, cheese, yogurt. Lactaid permitted.", epiPenOnFile: false, notifyAllStaff: false },
        { alertType: "allergy" as const, severity: "life_threatening" as const, description: "Peanut allergy (anaphylactic)", treatmentNotes: "EpiPen on file. Cafeteria peanut-free table required.", epiPenOnFile: true, notifyAllStaff: true },
        { alertType: "medication" as const, severity: "moderate" as const, description: "Daily ADHD medication (Concerta) — administered at home", treatmentNotes: "Effects may wear off mid-afternoon. Watch for increased restlessness after 2pm.", epiPenOnFile: false, notifyAllStaff: false },
        { alertType: "condition" as const, severity: "moderate" as const, description: "Asthma — inhaler in nurse's office", treatmentNotes: "Albuterol inhaler available. Use before PE if needed.", epiPenOnFile: false, notifyAllStaff: true },
        { alertType: "seizure" as const, severity: "severe" as const, description: "Seizure disorder — focal seizures controlled by medication", treatmentNotes: "Seizure action plan on file. Call 911 if seizure exceeds 5 minutes. Family notified after every event.", epiPenOnFile: false, notifyAllStaff: true },
        { alertType: "condition" as const, severity: "mild" as const, description: "Type 1 diabetes", treatmentNotes: "Insulin pump. Glucose tabs in nurse's office. Check blood sugar before lunch.", epiPenOnFile: false, notifyAllStaff: true },
      ];
      const chosen = [...alertOptions].sort(() => Math.random() - 0.5).slice(0, numAlerts);
      for (const a of chosen) {
        await db.insert(medicalAlertsTable).values({
          studentId: sp.id,
          alertType: a.alertType,
          description: a.description,
          severity: a.severity,
          treatmentNotes: a.treatmentNotes,
          epiPenOnFile: a.epiPenOnFile,
          notifyAllStaff: a.notifyAllStaff,
        } as any);
        medCount++;
      }
    }
  }
  console.log(`  Created ${guardCount} guardians, ${emergCount} emergency contacts, ${medCount} medical alerts`);

  // ──────────────────────────────────────────────────────────────────
  // Step 16: FBAs + Functional Analyses + BIPs
  // ──────────────────────────────────────────────────────────────────
  console.log("\nStep 16: Create FBAs, functional analyses, and BIPs...");
  let fbaCount = 0, faCount = 0, bipCount = 0;
  const FA_CONDITIONS = ["attention", "escape", "tangible", "alone"];
  const TARGET_BEHAVIORS = [
    { behavior: "Verbal aggression", definition: "Yelling, swearing, or threatening language directed at peers or staff lasting >3 seconds.", function: "Escape" },
    { behavior: "Task refusal", definition: "Verbal refusal ('no', 'I won't') or physical avoidance (head down, walking away) within 30s of a demand.", function: "Escape" },
    { behavior: "Elopement", definition: "Leaving assigned area without permission for >10 seconds.", function: "Attention/Escape" },
    { behavior: "Physical aggression", definition: "Hitting, kicking, scratching, or pushing another person with force.", function: "Escape/Tangible" },
    { behavior: "Property destruction", definition: "Throwing, breaking, or damaging classroom materials or furniture.", function: "Escape" },
    { behavior: "Self-injurious behavior", definition: "Head-banging, hand-biting, or skin-picking causing visible marks.", function: "Sensory/Escape" },
  ];
  for (const sp of studentProfiles) {
    const eligible = sp.tier === "intensive" || sp.disability === "Autism" || sp.disability === "Emotional Disturbance";
    if (!eligible) continue;

    const target = pick(TARGET_BEHAVIORS);
    const conductedBy = pick(staffIds.bcba.length > 0 ? staffIds.bcba : staffIds.case_manager);
    const referralDate = addDays("2025-09-15", rand(0, 30));
    const startDate = addDays(referralDate, rand(7, 14));
    const completionDate = addDays(startDate, rand(21, 35));

    const [fba] = await db.insert(fbasTable).values({
      studentId: sp.id,
      conductedBy,
      targetBehavior: target.behavior,
      operationalDefinition: target.definition,
      status: "completed",
      referralReason: `Classroom team requested FBA following increased frequency of ${target.behavior.toLowerCase()} during academic blocks.`,
      referralDate,
      startDate,
      completionDate,
      settingDescription: `Behavior occurs primarily in ${pick(["general education classroom", "resource room", "cafeteria", "during transitions"])} during ${pick(["math", "ELA", "non-preferred academic tasks", "unstructured time"])}.`,
      indirectMethods: "Functional Assessment Interview (FAI) with classroom teacher, parent, and case manager. Motivation Assessment Scale (MAS).",
      indirectFindings: `Interviews suggest behavior is most likely maintained by ${target.function.toLowerCase()}. Antecedent patterns include task demand, peer denial of access, and unexpected schedule changes.`,
      directMethods: "ABC data collection across 8 sessions (≥10 hours). Scatterplot analysis across school day.",
      directFindings: `${rand(35, 65)} occurrences of target behavior recorded across observation period. Peak frequency during ${pick(["math instruction", "morning meeting", "afternoon transitions"])}. Average duration ${rand(2, 8)} minutes.`,
      hypothesizedFunction: target.function,
      hypothesisNarrative: `When presented with ${pick(["a non-preferred task", "a demand to transition", "denied access to a preferred item"])}, [Student] engages in ${target.behavior.toLowerCase()} to ${target.function === "Escape" ? "escape or delay the demand" : target.function === "Attention" ? "obtain adult attention" : "access a preferred item or activity"}. The behavior is reinforced by ${target.function === "Escape" ? "removal of the demand or task adjustment" : "delivery of attention/preferred item"}.`,
      recommendations: `Develop BIP focused on functional communication training (FCT) targeting ${target.function.toLowerCase()}-maintained behavior. Implement antecedent strategies (priming, choice-making, visual schedules). Provide reinforcement for replacement behavior on a dense schedule initially (FR1 → VR3).`,
    } as any).returning();
    fbaCount++;

    // Functional analyses (2 sessions per condition = 8 total)
    const targetFunctions = target.function.toLowerCase().split("/").map(s => s.trim());
    let faSessionNum = 1;
    for (const cond of FA_CONDITIONS) {
      const numSessions = rand(1, 2);
      for (let s = 0; s < numSessions; s++) {
        const responseCount = targetFunctions.includes(cond) ? rand(8, 18) : rand(0, 4);
        await db.insert(functionalAnalysesTable).values({
          fbaId: fba.id,
          sessionNumber: faSessionNum++,
          condition: cond,
          sessionDate: addDays(startDate, faSessionNum * 2),
          conductedBy,
          durationMinutes: 10,
          responseCount,
          responseRate: String((responseCount / 10).toFixed(2)),
          notes: `${cond} condition: ${responseCount} responses observed in 10-minute session. ${responseCount > 5 ? "Elevated rate suggests function alignment." : "Low rate — function less likely."}`,
        } as any);
        faCount++;
      }
    }

    // BIP linked to FBA
    const bipCreatedBy = pick(staffIds.bcba.length > 0 ? staffIds.bcba : staffIds.case_manager);
    await db.insert(behaviorInterventionPlansTable).values({
      studentId: sp.id,
      fbaId: fba.id,
      createdBy: bipCreatedBy,
      version: 1,
      status: "active",
      targetBehavior: target.behavior,
      operationalDefinition: target.definition,
      hypothesizedFunction: target.function,
      replacementBehaviors: `Teach functional communication response: student will request ${target.function === "Escape" ? "a break ('break please' verbally or with break card)" : target.function === "Attention" ? "adult attention ('help please')" : "access to preferred item/activity"}. Response should occur within 30 seconds of the establishing operation.`,
      preventionStrategies: "Provide visual schedule with embedded breaks. Pre-teach upcoming transitions 5 minutes in advance. Offer choice between two acceptable task options. Modify task difficulty when frustration cues appear (work in chunks of 5-7 minutes).",
      teachingStrategies: "Direct instruction of FCR using behavioral skills training (instruction → modeling → rehearsal → feedback). Practice across multiple staff and settings. Reinforce all approximations of the target FCR initially.",
      consequenceStrategies: `For target behavior: ${pick(["planned ignoring + redirect to FCR", "neutral redirect to schedule + minimum verbal interaction", "remove access to attention/escape until FCR is used"])}. Avoid power struggles. Document each occurrence on ABC log.`,
      reinforcementSchedule: "Phase 1: FR1 reinforcement of FCR with token (immediately exchange for 2-min preferred activity). Phase 2 (after 80% independent FCR for 5 sessions): VR3 schedule. Phase 3: thin to natural reinforcement on VR5.",
      crisisPlan: "If behavior escalates to physical aggression or safety risk: clear area of other students, signal for backup using classroom radio, follow CPI nonviolent crisis intervention. Document all incidents within 24 hours.",
      implementationNotes: "All staff working with student must complete BIP fidelity training before implementation. Weekly fidelity checks for first 4 weeks.",
      dataCollectionMethod: "Frequency count of target behavior + FCR per session. ABC narrative for any incident exceeding 5 minutes.",
      progressCriteria: "80% reduction in target behavior frequency over 4 consecutive weeks AND independent FCR in ≥75% of opportunities = consider plan revision/fading.",
      effectiveDate: completionDate,
      implementationStartDate: completionDate,
      reviewDate: addDays(completionDate, 90),
    } as any);
    bipCount++;
  }
  console.log(`  Created ${fbaCount} FBAs, ${faCount} functional analysis sessions, ${bipCount} BIPs`);

  // ──────────────────────────────────────────────────────────────────
  // Step 17: Evaluations
  // ──────────────────────────────────────────────────────────────────
  console.log("\nStep 17: Create evaluations...");
  let evalCount = 0;
  for (const sp of studentProfiles) {
    if (Math.random() > 0.45) continue;

    const isInitial = sp.scenario === "new_enrollment";
    const evalType = isInitial ? "initial" : pick(["3-year reevaluation", "annual review", "extended evaluation"]);
    const startDate = addDays("2025-09-10", rand(0, 90));
    const dueDate = addDays(startDate, 45);
    const status = pick(["completed", "completed", "completed", "in_progress", "pending"]);
    const completionDate = status === "completed" ? addDays(startDate, rand(20, 40)) : null;
    const lead = pick(staffIds.case_manager);

    const evalAreas = [
      { area: "Cognitive/Intellectual", assignedTo: "School Psychologist", status: status === "completed" ? "completed" : "in_progress", completedDate: completionDate || undefined, summary: `WISC-V administered. Full Scale IQ in ${pick(["average", "low average", "borderline"])} range.` },
      { area: "Academic Achievement", assignedTo: "Special Education Teacher", status: status === "completed" ? "completed" : "in_progress", completedDate: completionDate || undefined, summary: `WJ-IV administered. ${pick(["Reading skills 1.5 grade levels below peers.", "Math computation grade-level; problem solving below.", "Written expression significantly impaired."])}` },
      { area: "Speech-Language", assignedTo: "Speech-Language Pathologist", status: status === "completed" ? "completed" : "pending", completedDate: completionDate || undefined, summary: status === "completed" ? "CELF-5 administered. Receptive language age-appropriate, expressive language 1.5 SD below mean." : undefined },
      { area: "Behavioral/Social-Emotional", assignedTo: "School Psychologist", status: status === "completed" ? "completed" : "in_progress", completedDate: completionDate || undefined, summary: status === "completed" ? "BASC-3 completed by parent and teacher. Clinically significant scores in attention and executive functioning." : undefined },
      { area: "Adaptive Behavior", assignedTo: "Special Education Teacher", status: status === "completed" ? "completed" : "pending", completedDate: completionDate || undefined, summary: status === "completed" ? "Vineland-3 completed via parent interview. Adaptive Behavior Composite in low-average range." : undefined },
    ];

    const teamMembers = [
      { name: `Special Education Teacher`, role: "Case Manager", evaluationArea: "Academic" },
      { name: "Mark Hennessy", role: "School Psychologist", evaluationArea: "Cognitive/Behavioral" },
      { name: "Rachel Ferreira", role: "Speech-Language Pathologist", evaluationArea: "Speech-Language" },
      { name: "Jennifer Walsh", role: "Occupational Therapist", evaluationArea: "Fine Motor/Sensory" },
      { name: "Parent/Guardian", role: "Parent", evaluationArea: "Adaptive (parent interview)" },
    ];

    await db.insert(evaluationsTable).values({
      studentId: sp.id,
      evaluationType: evalType,
      evaluationAreas: evalAreas as any,
      teamMembers: teamMembers as any,
      leadEvaluatorId: lead,
      startDate,
      dueDate,
      completionDate,
      meetingDate: completionDate ? addDays(completionDate, 7) : null,
      reportSummary: status === "completed" ? `Comprehensive evaluation completed across ${evalAreas.length} domains. Findings support continued eligibility for special education services under category of ${sp.disability}. See team report for details and updated PLAAFP.` : null,
      status,
      notes: status !== "completed" ? "Evaluation in progress; awaiting parent consent forms and completion of remaining areas." : null,
    } as any);
    evalCount++;
  }
  console.log(`  Created ${evalCount} evaluations`);

  // ──────────────────────────────────────────────────────────────────
  // Step 18: Team Meetings + Attendees
  // ──────────────────────────────────────────────────────────────────
  console.log("\nStep 18: Create team meetings and attendees...");
  let meetingCount = 0, attendeeCount = 0;
  for (const sp of studentProfiles) {
    const numMeetings = sp.scenario === "new_enrollment" ? 2 : rand(1, 3);
    const meetingTypes = ["Annual IEP Review", "IEP Development", "Quarterly Progress Check", "Manifestation Determination", "Parent-Teacher Conference"];

    for (let m = 0; m < numMeetings; m++) {
      const meetingType = m === 0 ? "Annual IEP Review" : pick(meetingTypes);
      const scheduledDate = addDays("2025-10-01", rand(0, 180));
      const isPast = scheduledDate < "2026-04-15";
      const status = isPast ? pick(["completed", "completed", "completed", "cancelled"]) : "scheduled";

      const cmStaffId = pick(staffIds.case_manager);
      const cmStaff = await db.select({ firstName: staffTable.firstName, lastName: staffTable.lastName, email: staffTable.email }).from(staffTable).where(eq(staffTable.id, cmStaffId)).limit(1);
      const cmName = `${cmStaff[0]?.firstName} ${cmStaff[0]?.lastName}`;
      const studentRow2 = await db.select({ lastName: studentsTable.lastName, schoolId: studentsTable.schoolId }).from(studentsTable).where(eq(studentsTable.id, sp.id)).limit(1);
      const parentName = `Parent/Guardian ${studentRow2[0]?.lastName || ""}`;

      const attendeesJson = [
        { name: cmName, role: "Case Manager / Special Education Teacher", present: status === "completed" },
        { name: parentName, role: "Parent/Guardian", present: status === "completed" && Math.random() < 0.85 },
        { name: "Ellen Donahue", role: "Director of Student Services", present: status === "completed" && Math.random() < 0.6 },
        { name: "General Education Teacher", role: "General Education Teacher", present: status === "completed" && Math.random() < 0.9 },
      ];

      const [meeting] = await db.insert(teamMeetingsTable).values({
        studentId: sp.id,
        iepDocumentId: iepDocMap[sp.id],
        schoolId: studentRow2[0]?.schoolId,
        meetingType,
        scheduledDate,
        scheduledTime: pick(["09:00", "10:00", "13:00", "14:30", "15:30"]),
        endTime: pick(["10:00", "11:00", "14:00", "15:30", "16:30"]),
        duration: pick([45, 60, 60, 90]),
        location: pick(["Conference Room A", "Resource Room", "Virtual (Zoom)", "Special Education Office"]),
        meetingFormat: Math.random() < 0.25 ? "virtual" : "in_person",
        status,
        agendaItems: [
          "Welcome and introductions",
          "Review of current performance and progress",
          "Review of IEP goals and accommodations",
          "Service delivery summary",
          "Parent input and questions",
          "Action items and next steps",
        ] as any,
        attendees: attendeesJson as any,
        notes: status === "completed" ? `Team reviewed student progress across all goal areas. ${pick(["Parent shared positive feedback on home-school communication.", "Discussed need for increased counseling minutes in next IEP.", "Identified need for assistive technology evaluation.", "Reviewed BIP fidelity and discussed next phase of intervention."])} Action items captured.` : null,
        actionItems: status === "completed" ? [
          { id: "a1", description: "Send updated progress report to family", assignee: cmName, dueDate: addDays(scheduledDate, 14), status: "completed" as const },
          { id: "a2", description: "Schedule follow-up team meeting in 90 days", assignee: cmName, dueDate: addDays(scheduledDate, 90), status: "open" as const },
        ] as any : null,
        outcome: status === "completed" ? pick(["IEP renewed for one year with no major changes.", "Service minutes adjusted; addendum to follow.", "Team agreed to reconvene in 60 days to review BIP fidelity."]) : null,
        followUpDate: status === "completed" ? addDays(scheduledDate, rand(60, 120)) : null,
        minutesFinalized: status === "completed",
        consentStatus: status === "completed" ? "received" : "pending",
        noticeSentDate: addDays(scheduledDate, -10),
        cancelledReason: status === "cancelled" ? pick(["Parent unable to attend; rescheduled.", "Provider absence; rescheduled."]) : null,
        schoolYearId: schoolYear.id,
      } as any).returning();
      meetingCount++;

      // Attendee rows
      const attendeeRoster = [
        { staffId: cmStaffId, name: cmName, role: "Case Manager", email: cmStaff[0]?.email, isRequired: true },
        { staffId: null, name: parentName, role: "Parent/Guardian", email: null, isRequired: true },
        { staffId: pick(staffIds.admin) ?? null, name: "Ellen Donahue", role: "Director of Student Services", email: "edonahue@metrowestsped.org", isRequired: true },
        { staffId: null, name: "General Education Teacher", role: "General Education Teacher", email: null, isRequired: true },
      ];
      for (const sr of srMap[sp.id].slice(0, 3)) {
        const provStaff = await db.select({ firstName: staffTable.firstName, lastName: staffTable.lastName, email: staffTable.email, title: staffTable.title }).from(staffTable).where(eq(staffTable.id, sr.providerId)).limit(1);
        if (provStaff[0]) {
          attendeeRoster.push({
            staffId: sr.providerId,
            name: `${provStaff[0].firstName} ${provStaff[0].lastName}`,
            role: provStaff[0].title || "Service Provider",
            email: provStaff[0].email,
            isRequired: true,
          });
        }
      }

      for (const a of attendeeRoster) {
        await db.insert(iepMeetingAttendeesTable).values({
          meetingId: meeting.id,
          staffId: a.staffId,
          name: a.name,
          role: a.role,
          email: a.email,
          isRequired: a.isRequired,
          rsvpStatus: status === "completed" ? pick(["accepted", "accepted", "accepted", "tentative"]) : "pending",
          attended: status === "completed" ? Math.random() < 0.88 : null,
        } as any);
        attendeeCount++;
      }
    }
  }
  console.log(`  Created ${meetingCount} team meetings, ${attendeeCount} attendee records`);

  // ──────────────────────────────────────────────────────────────────
  // Step 19: Progress Reports
  // ──────────────────────────────────────────────────────────────────
  console.log("\nStep 19: Create progress reports...");
  let prCount = 0;
  const PROGRESS_CODES = [
    { code: "P", rating: "Progressing toward goal", trend: "improving" },
    { code: "S", rating: "Sufficient progress to achieve goal", trend: "improving" },
    { code: "M", rating: "Mastered / Goal met", trend: "stable" },
    { code: "N", rating: "Insufficient progress at this time", trend: "variable" },
    { code: "X", rating: "Goal not introduced this period", trend: "stable" },
  ];
  const REPORTING_PERIODS = [
    { label: "Q1 2025-2026", start: "2025-09-02", end: "2025-11-14" },
    { label: "Q2 2025-2026", start: "2025-11-15", end: "2026-01-30" },
    { label: "Q3 2025-2026", start: "2026-02-01", end: "2026-04-15" },
  ];
  for (const sp of studentProfiles) {
    const studentInfo = await db.select({
      lastName: studentsTable.lastName, firstName: studentsTable.firstName,
      dateOfBirth: studentsTable.dateOfBirth, grade: studentsTable.grade, schoolId: studentsTable.schoolId,
    }).from(studentsTable).where(eq(studentsTable.id, sp.id)).limit(1);
    const schoolName = schools.find(s => s.id === studentInfo[0]?.schoolId)?.name || "";

    // Get this student's goals
    const goals = await db.select().from(iepGoalsTable).where(eq(iepGoalsTable.studentId, sp.id));

    const numReports = sp.scenario === "new_enrollment" ? 1 : rand(1, 2);
    const periods = [...REPORTING_PERIODS].slice(0, numReports);
    for (const period of periods) {
      const goalProgress: GoalProgressEntry[] = goals.map(g => {
        const code = sp.scenario === "urgent" || sp.scenario === "compensatory_risk"
          ? pick(["P", "P", "N", "N", "S"])
          : sp.scenario === "shortfall"
          ? pick(["P", "P", "P", "S", "N"])
          : pick(["P", "S", "S", "M", "P"]);
        const codeInfo = PROGRESS_CODES.find(p => p.code === code) || PROGRESS_CODES[0];
        return {
          iepGoalId: g.id,
          goalArea: g.goalArea,
          goalNumber: g.goalNumber,
          annualGoal: g.annualGoal,
          baseline: g.baseline,
          targetCriterion: g.targetCriterion,
          currentPerformance: `Currently performing at ${rand(45, 90)}% accuracy across data collection sessions this period.`,
          progressRating: codeInfo.rating,
          progressCode: code,
          dataPoints: rand(8, 24),
          trendDirection: codeInfo.trend,
          promptLevel: pick(["independent", "verbal", "gestural", "model"]),
          percentCorrect: rand(45, 95),
          narrative: `Across this reporting period, ${studentInfo[0]?.firstName} has demonstrated ${codeInfo.rating.toLowerCase()}. ${pick(["Skill is generalizing across staff and settings.", "Continued practice in natural environment recommended.", "Will increase reinforcement schedule next quarter.", "Mastery criteria approached; continue monitoring."])} `,
          measurementMethod: g.measurementMethod,
          serviceArea: g.serviceArea,
        };
      });

      // Service breakdown by service type for this student
      const serviceBreakdown: ServiceDeliveryBreakdown[] = [];
      for (const sr of srMap[sp.id]) {
        const svcDef = SERVICE_TYPE_DEFS[serviceTypeIds.indexOf(sr.serviceTypeId)];
        const periodSessions = insertedSessionRows.filter(r =>
          r.studentId === sp.id && r.serviceTypeId === sr.serviceTypeId
        );
        const completedSessionsCount = periodSessions.filter(r => r.status === "completed").length;
        const missedSessionsCount = periodSessions.filter(r => r.status === "missed").length;
        // Approximate by ratio (1/3 of sessions per period)
        const periodCompleted = Math.round(completedSessionsCount / 3);
        const periodMissed = Math.round(missedSessionsCount / 3);
        const requiredMin = Math.round(sr.requiredMinutes * 2.5); // ~2.5 months per period
        const deliveredMin = Math.round(requiredMin * (sp.scenario === "urgent" ? 0.45 : sp.scenario === "shortfall" ? 0.7 : sp.scenario === "compensatory_risk" ? 0.55 : 0.92));
        serviceBreakdown.push({
          serviceType: svcDef?.name || "Service",
          requiredMinutes: requiredMin,
          deliveredMinutes: deliveredMin,
          missedSessions: periodMissed,
          completedSessions: periodCompleted,
          compliancePercent: requiredMin > 0 ? Math.round((deliveredMin / requiredMin) * 100) : 0,
        });
      }

      await db.insert(progressReportsTable).values({
        studentId: sp.id,
        reportingPeriod: period.label,
        periodStart: period.start,
        periodEnd: period.end,
        preparedBy: pick(staffIds.case_manager),
        status: pick(["finalized", "finalized", "draft", "sent"]),
        overallSummary: `${studentInfo[0]?.firstName} continued to make progress across IEP goal areas this reporting period. Strengths include ${pick(["consistent attendance", "engaged participation in therapy", "improved peer interactions", "developing self-advocacy skills"])}. Areas for continued focus include ${pick(["written expression", "behavior regulation during transitions", "math problem solving", "social-pragmatic communication"])}.`,
        serviceDeliverySummary: `Service delivery this period reflects ${sp.scenario === "urgent" ? "significant gaps requiring compensatory services" : sp.scenario === "shortfall" ? "delivery below target with planned make-ups" : "consistent delivery on or near targets"}. See attached service grid for details.`,
        recommendations: pick([
          "Continue current service plan with quarterly review.",
          "Consider increasing counseling minutes; team meeting requested.",
          "Add assistive technology support to next IEP amendment.",
          "Maintain BIP with phase-2 reinforcement schedule.",
        ]),
        parentNotes: "Report shared with family; opportunity for input provided.",
        goalProgress: goalProgress as any,
        studentDob: studentInfo[0]?.dateOfBirth || null,
        studentGrade: studentInfo[0]?.grade || null,
        schoolName,
        districtName: district.name,
        iepStartDate: null,
        iepEndDate: null,
        serviceBreakdown: serviceBreakdown as any,
        parentNotificationDate: addDays(period.end, 7),
        parentNotificationMethod: pick(["email", "mail", "in_person"]),
        nextReportDate: addDays(period.end, 90),
      } as any);
      prCount++;
    }
  }
  console.log(`  Created ${prCount} progress reports`);

  // ──────────────────────────────────────────────────────────────────
  // Step 20: Restraint Incidents
  // ──────────────────────────────────────────────────────────────────
  console.log("\nStep 20: Create restraint incidents...");
  let riCount = 0;
  for (const sp of studentProfiles) {
    const eligible = sp.tier === "intensive" && (sp.disability === "Autism" || sp.disability === "Emotional Disturbance" || sp.disability === "Intellectual Disability");
    if (!eligible) continue;
    if (Math.random() < 0.4) continue;

    const numIncidents = rand(1, 3);
    for (let i = 0; i < numIncidents; i++) {
      const incidentDate = addDays("2025-10-01", rand(0, 180));
      const startMin = rand(8, 14) * 60 + pick([0, 15, 30, 45]);
      const continued20 = Math.random() < 0.2;
      const duration = continued20 ? rand(21, 35) : rand(3, 18);
      const staffWasInjured = Math.random() < 0.1;
      const trigger = pick([
        { preceding: "Math instruction (multi-step word problems)", trigger: "Presented with non-preferred academic task; asked to write response.", behavior: "Student began yelling, threw materials onto floor, attempted to leave classroom." },
        { preceding: "Transition from preferred activity (recess) to academic block", trigger: "End of recess announcement; verbal redirect to line up.", behavior: "Student dropped to ground, refused to move, escalated to kicking when staff approached." },
        { preceding: "Lunch in cafeteria", trigger: "Peer denied access to preferred seat at table.", behavior: "Student began swearing loudly, stood on bench, attempted to overturn lunch tray." },
        { preceding: "Group counseling session", trigger: "Discussion topic became emotionally activating.", behavior: "Student began crying, then escalated to verbal threats and self-injurious head-banging." },
      ]);
      const primary = pick(staffIds.bcba.length ? staffIds.bcba : staffIds.case_manager);
      const observer = pick(staffIds.case_manager);
      const principal = "Ellen Donahue";

      await db.insert(restraintIncidentsTable).values({
        studentId: sp.id,
        incidentDate,
        incidentTime: minToTime(startMin),
        endTime: minToTime(startMin + duration),
        durationMinutes: duration,
        incidentType: pick(["physical_restraint", "physical_escort"]),
        location: pick(["General education classroom", "Resource room", "Cafeteria", "Hallway", "Counseling office"]),
        precedingActivity: trigger.preceding,
        triggerDescription: trigger.trigger,
        behaviorDescription: trigger.behavior,
        deescalationAttempts: "Verbal de-escalation (calm voice, validate emotion). Offered choice (break card / movement break / preferred item). Reduced verbal demands. Provided physical space.",
        alternativesAttempted: "Visual schedule reminder. Offered preferred seating change. Provided fidget tool. Attempted to redirect to calm-down corner.",
        justification: "Imminent risk of serious physical injury to self and/or others. Less restrictive interventions had been attempted and were ineffective.",
        restraintType: pick(["one-person standing escort", "two-person seated hold", "physical escort to safe space"]),
        restraintDescription: "Trained staff used CPI-approved physical intervention. Student's airway, breathing, and circulation continually monitored. Physical intervention discontinued as soon as student demonstrated safe regulation.",
        primaryStaffId: primary,
        additionalStaffIds: [observer] as any,
        observerStaffIds: [observer] as any,
        principalNotifiedName: principal,
        principalNotifiedAt: `${incidentDate}T${minToTime(startMin + duration + 5)}:00`,
        continuedOver20Min: continued20,
        over20MinApproverName: continued20 ? principal : null,
        calmingStrategiesUsed: "Quiet space, sensory tools (weighted blanket, deep pressure), 1:1 calm presence, validating language.",
        studentStateAfter: pick(["Calm and able to verbally process the incident.", "Tired but regulated; returned to classroom after 20-min break.", "Required 30+ minutes in calming space before returning to academics."]),
        studentInjury: false,
        staffInjury: staffWasInjured,
        staffInjuryDescription: staffWasInjured ? "Minor scratch on forearm; first aid administered, no further treatment required." : null,
        medicalAttentionRequired: false,
        parentVerbalNotification: true,
        parentVerbalNotificationAt: `${incidentDate}T${minToTime(startMin + duration + 30)}:00`,
        parentNotified: true,
        parentNotifiedAt: `${incidentDate}T${minToTime(startMin + duration + 30)}:00`,
        parentNotifiedBy: primary,
        parentNotificationMethod: pick(["phone", "phone", "in_person"]),
        writtenReportSent: true,
        writtenReportSentAt: addDays(incidentDate, 1),
        writtenReportSentMethod: pick(["email", "mail"]),
        parentCommentOpportunityGiven: true,
        deseReportRequired: continued20 || duration > 15,
        deseReportSentAt: (continued20 || duration > 15) ? addDays(incidentDate, 3) : null,
        thirtyDayLogSentToDese: false,
        studentMoved: true,
        studentMovedTo: pick(["Calming room", "Counseling office", "Quiet area in classroom"]),
        roomCleared: Math.random() < 0.3,
        bodyPosition: "Upright / seated",
        proceduresUsed: ["CPI verbal de-escalation", "CPI nonviolent physical intervention"] as any,
        deescalationStrategies: ["Validate emotion", "Offer choice", "Redirect to calm space", "Reduce verbal demands"] as any,
        antecedentCategory: pick(["academic_demand", "transition", "denied_access", "social_conflict"]),
        emergencyServicesCalled: false,
        debriefConducted: true,
        debriefDate: addDays(incidentDate, 1),
        debriefNotes: "Team reviewed incident timeline, identified successful and less-effective de-escalation strategies, and updated BIP antecedent strategies. Discussed need for refresher training on CPI techniques.",
        debriefParticipants: [primary, observer] as any,
        bipInPlace: true,
        physicalEscortOnly: false,
        studentReturnedToActivity: pick(["After 20-minute calming break", "After 45 minutes; remainder of day in resource room", "Returned next day"]),
        timeToCalm: rand(8, 35),
        terminologyFramework: "ma_dese",
        reportingStaffSignature: "On file",
        reportingStaffSignedAt: `${addDays(incidentDate, 1)}T16:00:00`,
        adminSignature: "On file",
        adminSignedAt: `${addDays(incidentDate, 2)}T10:00:00`,
        adminReviewedBy: pick(staffIds.admin) ?? null,
        adminReviewedAt: `${addDays(incidentDate, 2)}T10:00:00`,
        adminReviewNotes: "Incident reviewed. Documentation complete. BIP fidelity confirmed. No additional reporting required beyond what is documented.",
        parentNotificationPdfGenerated: true,
        status: "closed",
        followUpPlan: "Continue current BIP. Schedule 90-day BIP review. Monitor for pattern of incidents with similar antecedent.",
        notes: null,
        resolutionNote: "Incident closed following debrief and admin review.",
        resolvedAt: `${addDays(incidentDate, 3)}T16:00:00`,
        resolvedBy: pick(staffIds.admin) ?? null,
      } as any);
      riCount++;
    }
  }
  console.log(`  Created ${riCount} restraint incidents`);

  // ──────────────────────────────────────────────────────────────────
  // Step 21: Documents (metadata only — synthetic objectPath)
  // ──────────────────────────────────────────────────────────────────
  console.log("\nStep 21: Create document records (metadata)...");
  let docCount = 0;
  const DOC_TEMPLATES = [
    { category: "iep", title: "Signed IEP — Annual", fileName: "iep_annual_signed.pdf", contentType: "application/pdf" },
    { category: "evaluation", title: "Comprehensive Evaluation Report", fileName: "eval_report.pdf", contentType: "application/pdf" },
    { category: "consent", title: "Parent Consent Form — Evaluation", fileName: "consent_eval.pdf", contentType: "application/pdf" },
    { category: "consent", title: "Parent Consent Form — Initial Placement", fileName: "consent_placement.pdf", contentType: "application/pdf" },
    { category: "progress_report", title: "Q1 Progress Report", fileName: "progress_q1.pdf", contentType: "application/pdf" },
    { category: "medical", title: "Medical Action Plan", fileName: "medical_action_plan.pdf", contentType: "application/pdf" },
    { category: "behavioral", title: "BIP Document", fileName: "bip.pdf", contentType: "application/pdf" },
    { category: "correspondence", title: "Prior Written Notice", fileName: "pwn.pdf", contentType: "application/pdf" },
    { category: "external", title: "Outside Evaluation Report", fileName: "outside_eval.pdf", contentType: "application/pdf" },
  ];
  for (const sp of studentProfiles) {
    const numDocs = rand(3, 5);
    const chosen = [...DOC_TEMPLATES].sort(() => Math.random() - 0.5).slice(0, numDocs);
    const uploaderStaff = pick(staffIds.case_manager);
    const uploaderRow = await db.select({ firstName: staffTable.firstName, lastName: staffTable.lastName }).from(staffTable).where(eq(staffTable.id, uploaderStaff)).limit(1);
    const uploaderName = `${uploaderRow[0]?.firstName} ${uploaderRow[0]?.lastName}`;

    for (const t of chosen) {
      await db.insert(documentsTable).values({
        studentId: sp.id,
        uploadedByStaffId: uploaderStaff,
        uploadedByUserId: `staff:${uploaderStaff}`,
        uploadedByName: uploaderName,
        category: t.category,
        title: `${t.title} — Student #${sp.id}`,
        fileName: t.fileName,
        contentType: t.contentType,
        fileSize: rand(80_000, 2_500_000),
        objectPath: `/demo-seed/students/${sp.id}/${t.fileName}`,
        status: "active",
        notes: pick([null, null, "Uploaded during annual review.", "Sent home with parent.", "Retained per district records policy."]),
      } as any);
      docCount++;
    }
  }
  console.log(`  Created ${docCount} documents`);

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║  SEED COMPLETE — SUMMARY                                   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("DISTRICT: MetroWest Collaborative (Framingham, MA)");
  console.log(`  District ID: ${district.id}`);
  console.log(`  Schools: ${schools.length} (Elementary, Middle, High)`);
  console.log(`  School Year: ${schoolYear.label}`);
  console.log("");
  console.log("ENTITIES SEEDED:");
  console.log(`  Students ............. ${NUM_STUDENTS}`);
  console.log(`  Staff ................ ${totalStaff} (${PROVIDER_ROSTER.length} providers, ${CASE_MANAGER_ROSTER.length} case managers, ${ADMIN_ROSTER.length} admins)`);
  console.log(`  Service Types ........ ${serviceTypeIds.length}`);
  console.log(`  Service Requirements . ${totalSRs}`);
  console.log(`  IEP Documents ........ ${Object.keys(iepDocMap).length}`);
  console.log(`  IEP Goals ............ ${goalCount}`);
  console.log(`  Session Logs ......... ${sessionBatch.length} (${completed} completed, ${missed} missed)`);
  console.log(`  Schedule Blocks ...... ${blockBatch.length}`);
  console.log(`  Staff Assignments .... ${assignmentCount}`);
  console.log(`  Alerts ............... ${alertBatch.length}`);
  console.log(`  Comp. Obligations .... ${compCount}`);
  console.log(`  Behavior Targets ..... ${behCount}`);
  console.log(`  Program Targets ...... ${progCount}`);
  console.log(`  Missed Reasons ....... ${missedReasonIds.length}`);
  console.log("");
  console.log("RELATIONSHIPS COVERED:");
  console.log("  • Every student → school, case manager, IEP document");
  console.log("  • Every service requirement → student, service type, provider");
  console.log("  • Every session log → student, service requirement, staff, school year");
  console.log("  • Every schedule block → student, staff, service type (conflict-free)");
  console.log("  • Every IEP goal → student, IEP document, service area");
  console.log("  • Staff assignments link providers to student caseloads");
  console.log("  • Alerts reference students and service requirements");
  console.log("  • Compensatory obligations reference students and service requirements");
  console.log("");
  console.log("SCENARIOS INTENTIONALLY MODELED:");
  console.log(`  Healthy (${scenarioCounts.healthy || 0}) .......... 95% delivery, ~4% miss rate. Clean dashboards.`);
  console.log(`  Improving (${scenarioCounts.improving || 0}) ....... 88% delivery. Trending positive — recent pickup.`);
  console.log(`  Shortfall (${scenarioCounts.shortfall || 0}) ....... 70% delivery, 15% miss rate. Yellow flags.`);
  console.log(`  Comp. Risk (${scenarioCounts.compensatory_risk || 0}) ...... 55% delivery. Active compensatory obligations.`);
  console.log(`  Urgent (${scenarioCounts.urgent || 0}) ............ <50% delivery, 30% miss rate. Red alerts. Comp. obligations.`);
  console.log(`  New Enrollment (${scenarioCounts.new_enrollment || 0}) .... Enrolled Feb 2026. Limited session history.`);
  console.log("");
  console.log("DATA REALISM:");
  console.log("  • Massachusetts disability category distribution (SLD ~30%, Autism ~22%)");
  console.log("  • Realistic provider roles (BCBA, SLP, OT, PT, counselor, RBT, para)");
  console.log("  • SPED service minute ranges match MA IEP Grid B norms");
  console.log("  • Session notes vary by service type with clinical language");
  console.log("  • Schedule blocks are conflict-free (no double-booking)");
  console.log("  • School calendar includes MA holidays and breaks");
  console.log("  • Provider caseloads balanced across staff");
  console.log("  • Student names reflect MetroWest MA demographic diversity");
  console.log("");

  // ──────────────────────────────────────────────────────────────────
  // Step 21: Backfill goal→target linkage and progress data so the
  // student-detail "IEP Goal Progress" charts populate for every student.
  // ──────────────────────────────────────────────────────────────────
  console.log("\nStep 21: Backfill goal→target linkage and progress data points...");
  const { backfillGoalProgressForDistrict } = await import("./backfill-goal-progress");
  const fill = await backfillGoalProgressForDistrict(district.id);
  console.log(`  Program targets created: ${fill.programTargetsCreated}`);
  console.log(`  Behavior targets created: ${fill.behaviorTargetsCreated}`);
  console.log(`  Goals linked → program targets: ${fill.goalsLinkedToProgram}`);
  console.log(`  Goals linked → behavior targets: ${fill.goalsLinkedToBehavior}`);
  console.log(`  Sample data sessions created: ${fill.sessionsCreated}`);
  console.log(`  Program data points: ${fill.programDataPoints}`);
  console.log(`  Behavior data points: ${fill.behaviorDataPoints}`);
}
