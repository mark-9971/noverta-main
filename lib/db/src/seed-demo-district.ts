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
} from "./index";
import { eq, sql, and, isNull, inArray } from "drizzle-orm";

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
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

const TIER_MINUTES: Record<string, Record<number, { base: number; variance: number }>> = {
  minimal: {
    1: { base: 120, variance: 30 },
    2: { base: 120, variance: 30 },
    3: { base: 120, variance: 30 },
    5: { base: 90, variance: 20 },
  },
  moderate: {
    0: { base: 900, variance: 200 },
    1: { base: 180, variance: 40 },
    2: { base: 180, variance: 40 },
    3: { base: 150, variance: 30 },
    4: { base: 1200, variance: 300 },
    5: { base: 120, variance: 30 },
    6: { base: 60, variance: 15 },
  },
  intensive: {
    0: { base: 1500, variance: 300 },
    1: { base: 240, variance: 60 },
    2: { base: 240, variance: 60 },
    3: { base: 180, variance: 40 },
    4: { base: 1800, variance: 300 },
    5: { base: 150, variance: 30 },
    6: { base: 60, variance: 15 },
  },
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
  ]},
  1: { area: "Occupational Therapy", goals: [
    "improve fine motor control for handwriting legibility, forming {target}% of letters correctly",
    "independently manage zipper, buttons, and snaps during dressing routines in 4 out of 5 trials",
    "improve visual-motor integration for copying tasks, scoring at age-level on the Beery VMI",
    "tolerate a range of sensory inputs during classroom activities without dysregulation for 20+ minutes",
  ]},
  2: { area: "Speech-Language", goals: [
    "produce target phonemes (/r/, /s/, /l/ blends) with {target}% accuracy in structured conversation",
    "increase mean length of utterance to {target} morphemes during narrative retell tasks",
    "initiate and maintain a 3-turn conversational exchange with a peer in 4 out of 5 opportunities",
    "follow 2-step classroom directions without repetition in {target}% of opportunities across settings",
  ]},
  3: { area: "Social-Emotional", goals: [
    "identify and apply 3 coping strategies when frustration level exceeds 5/10 on feelings thermometer",
    "initiate positive peer interactions during unstructured time at least {target} times per day",
    "use 'I feel' statements to express emotions instead of physical responses in 80% of conflicts",
    "demonstrate self-advocacy by requesting help or a break using appropriate language in {target}% of opportunities",
  ]},
  4: { area: "Academic Support", goals: [
    "complete grade-level math assignments with {target}% accuracy using visual supports and check-in prompts",
    "read and comprehend grade-level text, answering comprehension questions with {target}% accuracy",
    "independently organize materials and begin assignments within 2 minutes of teacher direction",
    "participate in general education classroom activities with no more than 2 verbal redirections per block",
  ]},
  5: { area: "Physical Therapy", goals: [
    "improve dynamic balance to navigate school hallways and stairs with no more than standby assistance",
    "increase core strength and postural stability to maintain seated posture for 20+ minutes",
    "demonstrate age-appropriate gait pattern during school mobility with {target}% correct heel-toe steps",
  ]},
  6: { area: "Behavior Consultation", goals: [
    "oversee ABA program implementation ensuring treatment fidelity above 85%",
    "analyze behavior data trends monthly and adjust intervention strategies within 5 business days",
    "coordinate behavior support plan across all school settings with quarterly team review",
  ]},
};

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

export async function seedDemoDistrict() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  TRELLIS DEMO DISTRICT SEEDER                              ║");
  console.log("║  Generating: MetroWest Collaborative (Framingham, MA)       ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log("");

  console.log("Step 0: Clean existing demo data...");
  await db.execute(sql`TRUNCATE TABLE
    program_data, behavior_data, data_sessions,
    session_goal_data, session_logs, schedule_blocks,
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
      const minuteConfig = TIER_MINUTES[sp.tier]?.[svcIdx] || { base: 120, variance: 30 };
      const minutes = Math.round(minuteConfig.base + (Math.random() * 2 - 1) * minuteConfig.variance);
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

  console.log("\nStep 8: Create IEP goals...");
  let goalCount = 0;
  for (const sp of studentProfiles) {
    let goalNum = 1;
    for (const svcTypeId of sp.services) {
      const svcIdx = serviceTypeIds.indexOf(svcTypeId);
      const templates = GOAL_TEMPLATES[svcIdx];
      if (!templates) continue;

      const numGoals = svcIdx === 0 || svcIdx === 4 ? rand(2, 3) : rand(1, 2);
      const shuffled = [...templates.goals].sort(() => Math.random() - 0.5);

      for (let g = 0; g < numGoals && g < shuffled.length; g++) {
        const goalText = shuffled[g]
          .replace("{base}", String(rand(20, 40)))
          .replace("{target}", String(rand(75, 95)))
          .replace("{count}", String(rand(3, 8)));

        await db.insert(iepGoalsTable).values({
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
        } as any);
        goalCount++;
      }
    }
  }
  console.log(`  Created ${goalCount} IEP goals`);

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
  const ALL_START_MINS = [8*60, 8*60+30, 9*60, 9*60+30, 10*60, 10*60+30, 11*60, 13*60, 13*60+30, 14*60, 14*60+30, 15*60];

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

    let missRate: number;
    let deliveryRatio: number;
    switch (sp.scenario) {
      case "healthy": missRate = 0.04; deliveryRatio = 0.95; break;
      case "improving": missRate = 0.06; deliveryRatio = 0.88; break;
      case "shortfall": missRate = 0.15; deliveryRatio = 0.70; break;
      case "compensatory_risk": missRate = 0.25; deliveryRatio = 0.55; break;
      case "urgent": missRate = 0.30; deliveryRatio = 0.45; break;
      case "new_enrollment": missRate = 0.05; deliveryRatio = 0.92; break;
      default: missRate = 0.05; deliveryRatio = 0.90;
    }

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
          for (const sm of ALL_START_MINS) {
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

  for (let i = 0; i < sessionBatch.length; i += 500) {
    await db.insert(sessionLogsTable).values(sessionBatch.slice(i, i + 500));
  }
  const completed = sessionBatch.filter(s => s.status === "completed").length;
  const missed = sessionBatch.filter(s => s.status === "missed").length;
  console.log(`  Inserted ${sessionBatch.length} session logs (${completed} completed, ${missed} missed)`);

  console.log("\nStep 10: Create schedule blocks...");
  const sbStudentSlots: Record<string, Array<[number, number]>> = {};
  const sbStaffSlots: Record<string, Array<[number, number]>> = {};
  const blockBatch: any[] = [];
  const BLOCK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const BLOCK_START_MINS = [8*60, 9*60, 10*60, 11*60, 13*60, 14*60, 15*60];
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
        for (const slotMin of BLOCK_START_MINS) {
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
  const alertBatch: any[] = [];
  for (const sp of studentProfiles) {
    if (sp.scenario === "urgent") {
      alertBatch.push({
        type: "compliance",
        severity: "high",
        studentId: sp.id,
        message: `${sp.services.length > 2 ? "Multiple services" : "Service"} critically under-delivered. Student at risk of compensatory obligation.`,
        suggestedAction: "Schedule make-up sessions immediately and notify case manager.",
        resolved: false,
      });
      if (Math.random() < 0.5) {
        alertBatch.push({
          type: "compliance",
          severity: "high",
          studentId: sp.id,
          staffId: srMap[sp.id][0]?.providerId,
          serviceRequirementId: srMap[sp.id][0]?.id,
          message: "IEP service delivery below 50% for current reporting period.",
          suggestedAction: "Review provider availability and consider temporary reassignment.",
          resolved: false,
        });
      }
    }
    if (sp.scenario === "compensatory_risk") {
      alertBatch.push({
        type: "compliance",
        severity: "medium",
        studentId: sp.id,
        message: "Cumulative service shortfall approaching compensatory threshold. Review required.",
        suggestedAction: "Calculate total minutes owed and prepare compensatory services proposal.",
        resolved: false,
      });
    }
    if (sp.scenario === "shortfall") {
      alertBatch.push({
        type: "compliance",
        severity: "medium",
        studentId: sp.id,
        message: "Service delivery below 80% for current month. Monitor closely.",
        suggestedAction: "Review scheduling and prioritize make-up sessions.",
        resolved: Math.random() < 0.3,
      });
    }
  }

  alertBatch.push({
    type: "compliance",
    severity: "low",
    message: "Quarterly compliance report due in 14 days. 3 students require progress updates.",
    suggestedAction: "Send reminder to case managers for progress report submissions.",
    resolved: false,
  });
  alertBatch.push({
    type: "compliance",
    severity: "medium",
    message: "2 provider schedules have unresolved conflicts for next week.",
    suggestedAction: "Review schedule blocks and resolve overlapping assignments.",
    resolved: false,
  });

  for (const alert of alertBatch) {
    await db.insert(alertsTable).values(alert);
  }
  console.log(`  Created ${alertBatch.length} alerts`);

  console.log("\nStep 12: Create compensatory obligations...");
  let compCount = 0;
  for (const sp of studentProfiles) {
    if (sp.scenario !== "compensatory_risk" && sp.scenario !== "urgent") continue;

    for (const sr of srMap[sp.id]) {
      if (Math.random() < 0.6) {
        const monthsBack = rand(1, 3);
        const periodStart = addDays("2026-04-01", -30 * monthsBack);
        const periodEnd = addDays(periodStart, 29);
        const minutesOwed = Math.round(sr.requiredMinutes * (sp.scenario === "urgent" ? 0.45 : 0.30));
        const minutesDelivered = sp.scenario === "urgent" ? 0 : Math.round(minutesOwed * 0.2);

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
}
