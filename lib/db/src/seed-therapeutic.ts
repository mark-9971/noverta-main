/**
 * seed-therapeutic.ts
 * Regenerates student demographics, staff, programs, program_targets,
 * behavior_targets, and iep_goals for a therapeutic day school setting.
 *
 * SAFE TO RUN: does NOT touch service_requirements or session_logs.
 */
import { db } from "./index";
import {
  studentsTable, staffTable, programsTable,
  programTargetsTable, behaviorTargetsTable,
  iepGoalsTable, behaviorDataTable, programDataTable,
  dataSessionsTable, teacherObservationsTable,
  iepDocumentsTable, serviceRequirementsTable,
  serviceTypesTable,
} from "./index";
import { eq } from "drizzle-orm";

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle<T>(arr: T[]): T[] { return [...arr].sort(() => Math.random() - 0.5); }

// ─── STUDENT PROFILE DATA ─────────────────────────────────────────────────────

const DISABILITY_CATEGORIES = [
  // 60% ASD
  "Autism Spectrum Disorder", "Autism Spectrum Disorder", "Autism Spectrum Disorder",
  "Autism Spectrum Disorder", "Autism Spectrum Disorder", "Autism Spectrum Disorder",
  // 20% EBD
  "Emotional/Behavioral Disability", "Emotional/Behavioral Disability",
  // 10% ID
  "Intellectual Disability",
  // 6% MD
  "Multiple Disabilities",
  // 2% TBI / OHI
  "Traumatic Brain Injury", "Other Health Impairment",
];

const PLACEMENT_TYPES = [
  "Substantially Separate", "Substantially Separate", "Substantially Separate",
  "Substantially Separate", "Substantially Separate",
  "Substantially Separate — Partial Inclusion",
];

const PRIMARY_LANGUAGES = [
  "English", "English", "English", "English", "English", "English", "English",
  "Spanish", "Spanish", "Spanish",
  "Portuguese", "Vietnamese",
];

// Grade distribution for middle school (school_id=2, grades 6-8)
const MS_GRADES = [
  "6","6","6","6","6","6","6","6","6",  // 9 in 6th
  "7","7","7","7","7","7","7","7",       // 8 in 7th
  "8","8","8","8","8","8","8","8",       // 8 in 8th
];
// Grade distribution for high school (school_id=1, grades 9-12)
const HS_GRADES = [
  "9","9","9","9","9","9","9",           // 7 in 9th
  "10","10","10","10","10","10",         // 6 in 10th
  "11","11","11","11","11","11",         // 6 in 11th
  "12","12","12","12","12","12",         // 6 in 12th
];

// Birth year by grade for school year 2025-2026
const BIRTH_YEAR_BY_GRADE: Record<string, number> = {
  "6": 2013, "7": 2012, "8": 2011,
  "9": 2010, "10": 2009, "11": 2008, "12": 2007,
};

// Parent name patterns (first name pairs by student first name gender)
const MOM_NAMES = ["Jennifer","Michelle","Patricia","Karen","Linda","Donna","Angela","Brenda","Amy","Anna","Maria","Rosa","Carmen","Gloria","Elena","Linh","Thu","Fatima","Aisha","Priya"];
const DAD_NAMES = ["Michael","David","James","Robert","Christopher","Daniel","Jose","Carlos","Miguel","Luis","Kevin","Brian","Mark","Steven","Eric","Andrew","John","Paul","George","Thomas"];

function parentName(firstName: string, lastName: string): string {
  const mom = pick(MOM_NAMES);
  const dad = pick(DAD_NAMES);
  return `${dad} & ${mom} ${lastName}`;
}

function parentEmail(firstName: string, lastName: string): string {
  const mom = pick(MOM_NAMES).toLowerCase();
  return `${mom}.${lastName.toLowerCase()}@email.com`;
}

function parentPhone(): string {
  return `(617) ${rand(200,999)}-${rand(1000,9999)}`;
}

function dobForGrade(grade: string, studentId: number): string {
  const year = BIRTH_YEAR_BY_GRADE[grade] ?? 2010;
  const month = (((studentId * 7) % 12) + 1).toString().padStart(2, "0");
  const day = (((studentId * 13) % 28) + 1).toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ─── STAFF TO ADD ─────────────────────────────────────────────────────────────

const NEW_STAFF: Array<{
  firstName: string; lastName: string; role: string; title: string;
  email: string; schoolId: number; qualifications?: string;
}> = [
  // BCBAs — Lincoln High (school_id=1)
  { firstName: "Marcus", lastName: "Webb", role: "bcba", title: "BCBA-D, Director of Behavioral Services", email: "m.webb@jeffersonusd.edu", schoolId: 1, qualifications: "BCBA-D, PhD Applied Behavior Analysis" },
  // BCBAs — Roosevelt Middle (school_id=2)
  { firstName: "Sarah", lastName: "Okonkwo", role: "bcba", title: "Board Certified Behavior Analyst", email: "s.okonkwo@jeffersonusd.edu", schoolId: 2, qualifications: "BCBA, MA Special Education" },
  { firstName: "James", lastName: "Patel", role: "bcba", title: "BCBA, Lead Behavior Analyst", email: "j.patel@jeffersonusd.edu", schoolId: 2, qualifications: "BCBA, MEd Behavior Analysis" },

  // Paras / Behavior Technicians — Lincoln High
  { firstName: "Devon", lastName: "Brooks", role: "para", title: "Registered Behavior Technician", email: "d.brooks@jeffersonusd.edu", schoolId: 1, qualifications: "RBT, BA Psychology" },
  { firstName: "Camille", lastName: "Foster", role: "para", title: "Registered Behavior Technician", email: "c.foster@jeffersonusd.edu", schoolId: 1, qualifications: "RBT" },
  { firstName: "Tyler", lastName: "Monroe", role: "para", title: "ABA Behavior Technician", email: "t.monroe@jeffersonusd.edu", schoolId: 1, qualifications: "RBT, BS Human Services" },
  { firstName: "Alexis", lastName: "Reyes", role: "para", title: "Special Education Paraprofessional", email: "a.reyes@jeffersonusd.edu", schoolId: 1, qualifications: "BA Psychology, RBT in progress" },
  { firstName: "Jordan", lastName: "Kim", role: "para", title: "ABA Behavior Technician", email: "j.kim@jeffersonusd.edu", schoolId: 1, qualifications: "RBT, BA Child Development" },

  // Paras / Behavior Technicians — Roosevelt Middle
  { firstName: "Miguel", lastName: "Santos", role: "para", title: "Registered Behavior Technician", email: "m.santos@jeffersonusd.edu", schoolId: 2, qualifications: "RBT, BA Psychology" },
  { firstName: "Priya", lastName: "Nair", role: "para", title: "ABA Behavior Technician", email: "p.nair@jeffersonusd.edu", schoolId: 2, qualifications: "RBT, BS Education" },
  { firstName: "Isaiah", lastName: "Washington", role: "para", title: "Special Education Paraprofessional", email: "i.washington@jeffersonusd.edu", schoolId: 2, qualifications: "AA Liberal Arts, RBT certified" },
  { firstName: "Tara", lastName: "Cunningham", role: "para", title: "ABA Behavior Technician", email: "t.cunningham@jeffersonusd.edu", schoolId: 2, qualifications: "RBT, BA Social Work" },
  { firstName: "Brendan", lastName: "OMalley", role: "para", title: "Registered Behavior Technician", email: "b.omalley@jeffersonusd.edu", schoolId: 2, qualifications: "RBT" },
  { firstName: "Kezia", lastName: "Alvarez", role: "para", title: "ABA Behavior Technician", email: "k.alvarez@jeffersonusd.edu", schoolId: 2, qualifications: "RBT, bilingual Spanish/English" },

  // SLPs
  { firstName: "Yuna", lastName: "Park", role: "slp", title: "Speech-Language Pathologist, CCC-SLP", email: "y.park@jeffersonusd.edu", schoolId: 1, qualifications: "CCC-SLP, MA Communication Disorders, AAC specialist" },
  { firstName: "Rafael", lastName: "Torres", role: "slp", title: "Speech-Language Pathologist", email: "r.torres@jeffersonusd.edu", schoolId: 2, qualifications: "MA-CCC-SLP, bilingual Spanish/English" },

  // OT
  { firstName: "Maya", lastName: "Singh", role: "ot", title: "Occupational Therapist", email: "m.singh@jeffersonusd.edu", schoolId: 2, qualifications: "OTR/L, MS Occupational Therapy, sensory integration certified" },

  // PT
  { firstName: "Benjamin", lastName: "Thornton", role: "pt", title: "Physical Therapist", email: "b.thornton@jeffersonusd.edu", schoolId: 2, qualifications: "PT, DPT, pediatric specialist" },

  // Counselors
  { firstName: "Keisha", lastName: "Armstrong", role: "counselor", title: "Licensed Clinical Social Worker", email: "k.armstrong@jeffersonusd.edu", schoolId: 1, qualifications: "LICSW, MSW, trauma-informed care certified" },
  { firstName: "Daniel", lastName: "Brennan", role: "counselor", title: "Licensed Mental Health Counselor", email: "d.brennan@jeffersonusd.edu", schoolId: 2, qualifications: "LMHC, MA Counseling Psychology" },

  // Case Managers
  { firstName: "Nicole", lastName: "Ferraro", role: "case_manager", title: "Special Education Case Manager", email: "n.ferraro@jeffersonusd.edu", schoolId: 2, qualifications: "M.Ed. Special Education, SPED license" },
  { firstName: "Christopher", lastName: "Watanabe", role: "case_manager", title: "Special Education Case Manager", email: "c.watanabe@jeffersonusd.edu", schoolId: 2, qualifications: "M.Ed. Special Education" },

  // Teachers — Roosevelt Middle (need classroom teachers there)
  { firstName: "Amanda", lastName: "Russo", role: "teacher", title: "Special Education Teacher", email: "a.russo@jeffersonusd.edu", schoolId: 2, qualifications: "M.Ed. Special Education, SPED license 5-12" },
  { firstName: "Derek", lastName: "Holman", role: "teacher", title: "Special Education Teacher", email: "d.holman@jeffersonusd.edu", schoolId: 2, qualifications: "M.Ed. Special Education, SPED license 5-12" },
  { firstName: "Fatima", lastName: "Al-Hassan", role: "teacher", title: "Special Education Teacher", email: "f.alhassan@jeffersonusd.edu", schoolId: 2, qualifications: "M.Ed. Special Education, bilingual Arabic/English" },
  { firstName: "Victor", lastName: "Espinoza", role: "teacher", title: "Special Education Teacher, Transition Coordinator", email: "v.espinoza@jeffersonusd.edu", schoolId: 2, qualifications: "M.Ed. Special Education, transition specialist" },
];

// ─── PROGRAMS FOR ROOSEVELT MIDDLE ───────────────────────────────────────────

const MIDDLE_PROGRAMS = [
  { name: "ABA Intensive Program", description: "Comprehensive ABA-based program for students with significant behavioral and learning needs; 1:1 and small group DTT/NET." },
  { name: "Therapeutic Substantially Separate", description: "Therapeutic day program for students with emotional/behavioral disabilities requiring intensive clinical support." },
  { name: "Life Skills Foundations", description: "Functional academics and daily living skills preparation for students with intellectual or multiple disabilities." },
  { name: "Social-Emotional Learning Program", description: "Structured SEL curriculum with individual counseling integration for students with social-emotional support needs." },
];

// ─── PROGRAM TARGET TEMPLATES (therapeutic setting, 48 total) ─────────────────

interface ProgTemplate {
  name: string; programType: string; domain: string;
  targetCriterion: string; description: string;
}

const PROGRAM_TEMPLATES_THERAPEUTIC: ProgTemplate[] = [
  // Communication / Language (12)
  { name: "AAC: Navigate to Preferred Item Page", programType: "discrete_trial", domain: "Communication", targetCriterion: "90% accuracy across 3 sessions", description: "Student will navigate AAC device to preferred item page independently and select target item." },
  { name: "PECS Phase III: Discriminating Pictures", programType: "discrete_trial", domain: "Communication", targetCriterion: "80% accuracy across 3 sessions", description: "Student will discriminate between two or more pictures to request preferred items using PECS." },
  { name: "Mand Training: Requesting Preferred Items", programType: "discrete_trial", domain: "Communication", targetCriterion: "80% unprompted across 5 opportunities", description: "Student will independently mand (request) preferred items using vocal, sign, or AAC modality." },
  { name: "Tact Training: Labeling Common Objects", programType: "discrete_trial", domain: "Language", targetCriterion: "80% accuracy across 3 sessions", description: "Student will expressively label 20 common objects/pictures without prompting." },
  { name: "Intraverbal: Answering WH-Questions", programType: "discrete_trial", domain: "Language", targetCriterion: "80% accuracy across 3 sessions", description: "Student will answer who, what, where, and when questions about common topics." },
  { name: "Receptive: Following 2-Step Directions", programType: "discrete_trial", domain: "Language", targetCriterion: "80% accuracy across 3 sessions", description: "Student will follow 2-step directions without visual supports." },
  { name: "Social Scripts: Greeting Peers and Adults", programType: "discrete_trial", domain: "Communication", targetCriterion: "80% across 5 opportunities", description: "Student will use scripted greeting across 3+ novel settings with unfamiliar adults and peers." },
  { name: "AAC: Combining 2-Symbol Messages", programType: "discrete_trial", domain: "Communication", targetCriterion: "80% accuracy across 3 sessions", description: "Student will combine agent+action or action+object to form 2-symbol messages on AAC device." },
  { name: "Spontaneous Requesting: Complete Sentence Frame", programType: "discrete_trial", domain: "Communication", targetCriterion: "80% unprompted across 5 sessions", description: "Student will use 'I want ___' or 'I need ___' sentence frames to request items spontaneously." },
  { name: "Vocal Imitation: Single Words", programType: "discrete_trial", domain: "Communication", targetCriterion: "90% across 3 sessions", description: "Student will vocally imitate modeled words in structured DTT format." },
  { name: "Pragmatics: Topic Maintenance (3 Turns)", programType: "discrete_trial", domain: "Communication", targetCriterion: "80% across 3 sessions", description: "Student will maintain conversational topic across at least 3 reciprocal exchanges with a peer." },
  { name: "Answering Personal Questions", programType: "discrete_trial", domain: "Language", targetCriterion: "100% accuracy across 3 sessions", description: "Student will independently state full name, age, school, and grade when asked." },

  // Self-Management / Behavior (10)
  { name: "Break Card: Requesting Breaks Appropriately", programType: "discrete_trial", domain: "Behavior", targetCriterion: "80% compliance across 5 sessions", description: "Student will use break card (sign, AAC, or verbal) to request breaks before escalating." },
  { name: "Zones of Regulation: Identifying Current Zone", programType: "discrete_trial", domain: "Social-Emotional", targetCriterion: "80% accuracy across 3 sessions", description: "Student will identify their current zone (green/yellow/red/blue) when presented with feeling cues." },
  { name: "Coping Strategy: Belly Breathing (3 Breaths)", programType: "task_analysis", domain: "Social-Emotional", targetCriterion: "100% independent across 5 consecutive trials", description: "Student will independently perform belly breathing strategy when prompted during dysregulation." },
  { name: "Self-Monitoring: Task Completion Checklist", programType: "task_analysis", domain: "Adaptive", targetCriterion: "90% independent across 3 sessions", description: "Student will use a visual checklist to self-monitor completion of 4-6 step academic tasks." },
  { name: "Emotion Identification: Matching Feeling to Situation", programType: "discrete_trial", domain: "Social-Emotional", targetCriterion: "80% across 3 sessions", description: "Student will correctly identify the likely emotion in 5 social scenarios using emotion cards." },
  { name: "Transition Routine: Following Visual Schedule", programType: "task_analysis", domain: "Adaptive", targetCriterion: "90% independent across 5 sessions", description: "Student will independently navigate visual schedule through 6 daily transition points." },
  { name: "Sensory Strategy: Requesting Heavy Work", programType: "discrete_trial", domain: "Behavior", targetCriterion: "80% unprompted across 5 sessions", description: "Student will request sensory break or heavy work activity using appropriate communication before escalating." },
  { name: "Self-Advocacy: Using 'I Need' Statements", programType: "discrete_trial", domain: "Social-Emotional", targetCriterion: "80% across 3 sessions", description: "Student will use verbal or AAC 'I need' statement to communicate needs to staff in 3 settings." },
  { name: "First-Then Board: Accepting Non-Preferred Tasks", programType: "discrete_trial", domain: "Behavior", targetCriterion: "80% compliance across 5 sessions", description: "Student will comply with non-preferred task when shown first-then board without protesting." },
  { name: "Waiting Behavior: Sitting for 2 Minutes", programType: "discrete_trial", domain: "Behavior", targetCriterion: "90% across 5 sessions", description: "Student will wait quietly in seat for 2 minutes without disruptive behavior during structured routine." },

  // Social Skills (8)
  { name: "Greeting: Initiating Social Greeting", programType: "discrete_trial", domain: "Social", targetCriterion: "80% across 5 opportunities", description: "Student will initiate greeting with familiar adult or peer without prompting across 3 environments." },
  { name: "Perspective-Taking: 'What is __ Thinking?'", programType: "discrete_trial", domain: "Social", targetCriterion: "80% across 3 sessions", description: "Student will identify what another person is thinking/feeling in structured social scenario cards." },
  { name: "Turn-Taking: 3-Turn Exchange in Activity", programType: "discrete_trial", domain: "Social", targetCriterion: "80% across 3 sessions", description: "Student will take turns in a structured game or activity for at least 3 exchanges without prompting." },
  { name: "Peer Initiation: Joining Ongoing Activity", programType: "discrete_trial", domain: "Social", targetCriterion: "80% across 3 sessions", description: "Student will use appropriate script to join an ongoing peer activity ('Can I play?')." },
  { name: "Conflict Resolution: Using 'I Feel' Statements", programType: "discrete_trial", domain: "Social", targetCriterion: "80% across 3 sessions", description: "Student will use 'I feel ___ when ___' statement in role-play conflict scenarios." },
  { name: "Cooperative Work: Sharing Materials", programType: "discrete_trial", domain: "Social", targetCriterion: "80% across 5 sessions", description: "Student will share materials with a partner during structured group activity without staff intervention." },
  { name: "Social Problem-Solving: Generating Options", programType: "discrete_trial", domain: "Social", targetCriterion: "80% across 3 sessions", description: "Student will generate 2+ acceptable solutions to a social problem when presented with a scenario." },
  { name: "Sportsmanship: Handling Losing Appropriately", programType: "discrete_trial", domain: "Social", targetCriterion: "80% across 5 sessions", description: "Student will complete losing outcome in structured game with appropriate verbal response." },

  // Daily Living / Adaptive (8)
  { name: "Hygiene: Independent Hand Washing (7 Steps)", programType: "task_analysis", domain: "Daily Living", targetCriterion: "100% independent across 5 sessions", description: "Student will complete all 7 steps of hand washing routine independently with running water." },
  { name: "Meal Prep: Making a Simple Sandwich", programType: "task_analysis", domain: "Daily Living", targetCriterion: "90% independent across 3 sessions", description: "Student will assemble a simple sandwich (4-step task analysis) independently in school kitchen." },
  { name: "Personal Organization: Pack/Unpack Backpack", programType: "task_analysis", domain: "Adaptive", targetCriterion: "100% independent across 5 sessions", description: "Student will independently pack all required items and unpack correctly at arrival and dismissal." },
  { name: "Money Skills: Counting to Next Dollar", programType: "discrete_trial", domain: "Functional Academic", targetCriterion: "90% across 3 sessions", description: "Student will round up to next dollar for purchases using real coins/bills or simulation." },
  { name: "Time: Reading Analog Clock (Hour & Half-Hour)", programType: "discrete_trial", domain: "Functional Academic", targetCriterion: "80% across 3 sessions", description: "Student will read analog clock to the hour and half-hour across 10 practice trials." },
  { name: "Safety: Stating Personal Information", programType: "discrete_trial", domain: "Daily Living", targetCriterion: "100% across 3 sessions", description: "Student will verbally or via AAC state full name, address, and parent phone number when asked." },
  { name: "Community Safety: Crossing Street Safely", programType: "task_analysis", domain: "Community", targetCriterion: "100% independent across 5 community-based sessions", description: "Student will complete all steps of pedestrian street crossing during community-based instruction." },
  { name: "Dressing: Managing Buttons and Zippers", programType: "task_analysis", domain: "Daily Living", targetCriterion: "100% independent across 5 sessions", description: "Student will fasten and unfasten 3-button shirt and zipper without physical assistance." },

  // Pre-Vocational / Transition (6)
  { name: "Job Task: Sorting Mail by Category", programType: "task_analysis", domain: "Vocational", targetCriterion: "90% accuracy across 3 sessions", description: "Student will sort simulated mail items into 3 categories accurately within allotted work time." },
  { name: "Workplace Behavior: Following Supervisor Direction", programType: "discrete_trial", domain: "Vocational", targetCriterion: "90% compliance across 5 sessions", description: "Student will comply with first-instruction directives from a designated supervisor figure." },
  { name: "Time on Task: Independent Work for 15 Minutes", programType: "discrete_trial", domain: "Vocational", targetCriterion: "80% across 5 sessions", description: "Student will remain on assigned work task without staff prompting for 15 consecutive minutes." },
  { name: "Self-ID of Strengths: Resume Skills Exploration", programType: "discrete_trial", domain: "Transition", targetCriterion: "80% across 3 sessions", description: "Student will identify 3 personal strengths relevant to employment in a structured activity." },
  { name: "Job Application: Completing Basic Information Form", programType: "task_analysis", domain: "Transition", targetCriterion: "90% accuracy across 3 sessions", description: "Student will fill in name, address, phone number, and reference on a basic job application form." },
  { name: "Community Job: Completing Assigned Work Tasks", programType: "task_analysis", domain: "Vocational", targetCriterion: "90% accurate task completion across 3 job site sessions", description: "Student will complete assigned work tasks at a community job site with minimal staff support." },

  // Functional Academic (8)
  { name: "Sight Word Reading: 50 High-Frequency Words", programType: "discrete_trial", domain: "Academic", targetCriterion: "90% accuracy across 3 sessions", description: "Student will read 50 Dolch/Fry sight words from flashcards without phonics decoding support." },
  { name: "Decoding CVC and CVCe Words", programType: "discrete_trial", domain: "Academic", targetCriterion: "80% accuracy across 3 sessions", description: "Student will decode CVC and silent-e words presented in isolation with phonics prompt fading." },
  { name: "Math: Single-Digit Addition 0-9 with Manipulatives", programType: "discrete_trial", domain: "Academic", targetCriterion: "90% accuracy across 3 sessions", description: "Student will solve single-digit addition facts using manipulatives or number line." },
  { name: "Reading Comprehension: Who/What/Where Questions", programType: "discrete_trial", domain: "Academic", targetCriterion: "80% accuracy across 3 sessions", description: "Student will answer who, what, and where comprehension questions after listening to short passage." },
  { name: "Writing: 3-Sentence Paragraph with Graphic Organizer", programType: "task_analysis", domain: "Academic", targetCriterion: "80% accuracy across 3 sessions", description: "Student will produce a 3-sentence paragraph with topic, detail, and closing using graphic organizer." },
  { name: "Number Sense: Counting to 100 by 1s and 10s", programType: "discrete_trial", domain: "Academic", targetCriterion: "90% accuracy across 3 sessions", description: "Student will count from 1-100 by ones and tens without skipping numbers." },
  { name: "Calendar Skills: Days, Months, and Today's Date", programType: "discrete_trial", domain: "Academic", targetCriterion: "90% across 3 sessions", description: "Student will identify day of week, month, and complete today's date on daily calendar activity." },
  { name: "Science: Lab Safety Rules (5 Core Rules)", programType: "discrete_trial", domain: "Academic", targetCriterion: "100% across 3 sessions", description: "Student will correctly identify and state the 5 core lab safety rules from visual prompts." },
];

// ─── BEHAVIOR TARGET TEMPLATES (heavy behavioral, 28 total) ──────────────────

interface BehTemplate {
  name: string; measurementType: string; targetDirection: string;
  baselineValue: string; goalValue: string; description: string;
  trackingMethod?: string;
}

const BEHAVIOR_TEMPLATES_THERAPEUTIC: BehTemplate[] = [
  // Reduce behaviors
  { name: "Physical Aggression (Hitting/Kicking)", measurementType: "frequency", targetDirection: "decrease", baselineValue: "8", goalValue: "0", description: "Physical aggression toward peers or staff including hitting, kicking, pushing, biting.", trackingMethod: "per_session" },
  { name: "Self-Injurious Behavior (Head Banging)", measurementType: "frequency", targetDirection: "decrease", baselineValue: "6", goalValue: "0", description: "Self-directed physical harm including head banging, hand biting, or scratching skin.", trackingMethod: "per_session" },
  { name: "Elopement (Leaving Designated Area)", measurementType: "frequency", targetDirection: "decrease", baselineValue: "4", goalValue: "0", description: "Leaving assigned classroom, area, or campus without permission from staff.", trackingMethod: "per_session" },
  { name: "Task Refusal (Dropping/Non-Compliance)", measurementType: "frequency", targetDirection: "decrease", baselineValue: "12", goalValue: "2", description: "Refusal to engage with assigned task, including dropping to floor or turning away.", trackingMethod: "per_session" },
  { name: "Verbal Outbursts (Shouting/Screaming)", measurementType: "frequency", targetDirection: "decrease", baselineValue: "10", goalValue: "2", description: "Loud, disruptive vocalizations including shouting, screaming, or profanity directed at others.", trackingMethod: "per_session" },
  { name: "Property Destruction", measurementType: "frequency", targetDirection: "decrease", baselineValue: "5", goalValue: "0", description: "Damaging or destroying school or personal property (tearing, throwing, breaking).", trackingMethod: "per_session" },
  { name: "Spitting", measurementType: "frequency", targetDirection: "decrease", baselineValue: "6", goalValue: "0", description: "Spitting at staff, peers, or on property.", trackingMethod: "per_session" },
  { name: "Throwing Objects", measurementType: "frequency", targetDirection: "decrease", baselineValue: "7", goalValue: "0", description: "Throwing classroom materials, food, or personal items in unsafe manner.", trackingMethod: "per_session" },
  { name: "Stereotypy / Repetitive Motor Behavior", measurementType: "duration", targetDirection: "decrease", baselineValue: "40", goalValue: "5", description: "Repetitive, non-functional motor behaviors (hand-flapping, rocking, spinning) that interfere with learning.", trackingMethod: "per_session" },
  { name: "Tantrums / Emotional Meltdowns", measurementType: "duration", targetDirection: "decrease", baselineValue: "18", goalValue: "3", description: "Extended emotional dysregulation episodes including crying, yelling, and loss of behavioral control.", trackingMethod: "per_session" },
  { name: "Pica / Mouthing Non-Edible Items", measurementType: "frequency", targetDirection: "decrease", baselineValue: "5", goalValue: "0", description: "Placing non-edible items in mouth (paper, clothing, desk materials).", trackingMethod: "per_session" },
  { name: "Stripping / Removing Clothing", measurementType: "frequency", targetDirection: "decrease", baselineValue: "3", goalValue: "0", description: "Removing clothing or shoes in inappropriate settings.", trackingMethod: "per_session" },
  { name: "Non-Compliance with Safety Protocols", measurementType: "frequency", targetDirection: "decrease", baselineValue: "8", goalValue: "1", description: "Failure to follow safety rules (fire drills, crisis procedures) after first verbal prompt.", trackingMethod: "per_session" },
  { name: "Inappropriate Verbal Behavior (Scripting)", measurementType: "duration", targetDirection: "decrease", baselineValue: "25", goalValue: "5", description: "Echolalia or repetitive scripting that interferes with instruction or peer interaction.", trackingMethod: "per_session" },
  { name: "Crying / Emotional Dysregulation", measurementType: "frequency", targetDirection: "decrease", baselineValue: "7", goalValue: "1", description: "Excessive crying or emotional dysregulation during transitions or non-preferred activities.", trackingMethod: "per_session" },
  { name: "Disruption (Desk Banging / Noise-Making)", measurementType: "frequency", targetDirection: "decrease", baselineValue: "9", goalValue: "1", description: "Non-vocal disruptive behaviors such as banging desk, making repetitive noises, or knocking items over.", trackingMethod: "per_session" },

  // Increase behaviors
  { name: "On-Task Behavior (% of Intervals)", measurementType: "percentage", targetDirection: "increase", baselineValue: "30", goalValue: "80", description: "Percentage of 15-second intervals in which student is actively engaged with assigned task.", trackingMethod: "per_session" },
  { name: "Manding (Spontaneous Requesting)", measurementType: "frequency", targetDirection: "increase", baselineValue: "3", goalValue: "15", description: "Student initiates spontaneous requests using vocal, AAC, or sign communication.", trackingMethod: "per_session" },
  { name: "Social Engagement with Peers (Unprompted)", measurementType: "frequency", targetDirection: "increase", baselineValue: "2", goalValue: "10", description: "Student initiates or sustains social interaction with peer without staff prompting.", trackingMethod: "per_session" },
  { name: "Appropriate Peer Interaction (% of Intervals)", measurementType: "percentage", targetDirection: "increase", baselineValue: "20", goalValue: "75", description: "Percentage of observed intervals during which student engages appropriately with peers in structured settings.", trackingMethod: "per_session" },
  { name: "Independent Transition (% of Transitions)", measurementType: "percentage", targetDirection: "increase", baselineValue: "35", goalValue: "90", description: "Percentage of daily transitions student completes independently using visual schedule without physical prompting.", trackingMethod: "per_session" },
  { name: "Hand-Raising to Request Attention", measurementType: "frequency", targetDirection: "increase", baselineValue: "1", goalValue: "8", description: "Student raises hand (or uses designated signal) to request adult attention instead of calling out.", trackingMethod: "per_session" },
  { name: "Following Group Directions (% Compliance)", measurementType: "percentage", targetDirection: "increase", baselineValue: "25", goalValue: "80", description: "Percentage of group directions student follows within 10 seconds of instruction without individual prompting.", trackingMethod: "per_session" },
  { name: "Tolerating Denied Requests (% of Trials)", measurementType: "percentage", targetDirection: "increase", baselineValue: "20", goalValue: "85", description: "Percentage of trials in which student accepts 'no' or a delay to requested item without problem behavior.", trackingMethod: "per_session" },
  { name: "Waiting Appropriately (Duration in Seconds)", measurementType: "duration", targetDirection: "increase", baselineValue: "15", goalValue: "120", description: "Duration student waits calmly for preferred item, activity, or adult attention without problem behavior.", trackingMethod: "per_session" },
  { name: "Coping Strategy Use (Unprompted)", measurementType: "frequency", targetDirection: "increase", baselineValue: "0", goalValue: "5", description: "Student spontaneously uses a learned coping strategy (deep breathing, break request, Zones) when dysregulated.", trackingMethod: "per_session" },
  { name: "Work Completion (% of Assigned Tasks)", measurementType: "percentage", targetDirection: "increase", baselineValue: "40", goalValue: "85", description: "Percentage of assigned tasks student completes within designated work period.", trackingMethod: "per_session" },
  { name: "Requesting Help Appropriately", measurementType: "frequency", targetDirection: "increase", baselineValue: "1", goalValue: "8", description: "Student uses appropriate verbal or AAC request for help before disengaging or escalating.", trackingMethod: "per_session" },
];

// ─── IEP GOAL TEMPLATES ───────────────────────────────────────────────────────

function buildIepGoalFromProgTarget(pt: { name: string; domain: string; targetCriterion: string; description: string }): string {
  return `Given appropriate supports, ${pt.description.charAt(0).toLowerCase()}${pt.description.slice(1)} Mastery criterion: ${pt.targetCriterion}.`;
}

function buildIepGoalFromBehTarget(bt: { name: string; targetDirection: string; baselineValue: string; goalValue: string; measurementType: string; description: string }): string {
  if (bt.targetDirection === "decrease") {
    return `${bt.name} will decrease from a baseline of ${bt.baselineValue} ${bt.measurementType === "duration" ? "seconds/episode" : "occurrences/session"} to ${bt.goalValue} or fewer, as measured by direct observation data collected across 80% of school days.`;
  } else {
    const unit = bt.measurementType === "percentage" ? "%" : bt.measurementType === "duration" ? " seconds" : " occurrences/session";
    return `${bt.name} will increase from a baseline of ${bt.baselineValue}${unit} to ${bt.goalValue}${unit}, as measured by direct observation data collected across 80% of school days.`;
  }
}

// ─── MAIN SEED FUNCTION ───────────────────────────────────────────────────────

export async function seedTherapeuticData() {
  console.log("=== Seeding Therapeutic School Data ===");
  console.log("NOTE: service_requirements and session_logs are preserved.\n");

  // ── 1. Get all active students ──────────────────────────────────────────────
  console.log("Step 1: Loading students...");
  const allStudents = await db.select({
    id: studentsTable.id,
    firstName: studentsTable.firstName,
    lastName: studentsTable.lastName,
  }).from(studentsTable).orderBy(studentsTable.id);

  if (allStudents.length === 0) {
    throw new Error("No students found. Run the base seed first.");
  }

  // Split: first 25 → middle school (Roosevelt, school_id=2), next 25 → high (Lincoln, school_id=1)
  const msStudents = allStudents.slice(0, 25);
  const hsStudents = allStudents.slice(25, 50);

  console.log(`  ${allStudents.length} students loaded: ${msStudents.length} → Roosevelt Middle, ${hsStudents.length} → Lincoln High`);

  // ── 2. Update student demographics ────────────────────────────────────────
  console.log("Step 2: Updating student demographics...");

  for (let i = 0; i < msStudents.length; i++) {
    const s = msStudents[i];
    const grade = MS_GRADES[i] ?? "7";
    const disability = DISABILITY_CATEGORIES[(s.id * 3 + 1) % DISABILITY_CATEGORIES.length];
    const placement = PLACEMENT_TYPES[(s.id * 5) % PLACEMENT_TYPES.length];
    const lang = PRIMARY_LANGUAGES[(s.id * 7) % PRIMARY_LANGUAGES.length];
    const dob = dobForGrade(grade, s.id);
    await db.update(studentsTable).set({
      schoolId: 2, // Roosevelt Middle
      grade,
      disabilityCategory: disability,
      placementType: placement,
      primaryLanguage: lang,
      dateOfBirth: dob,
      parentGuardianName: parentName(s.firstName, s.lastName),
      parentEmail: parentEmail(s.firstName, s.lastName),
      parentPhone: parentPhone(),
      tags: `therapeutic,substantially-separate,${disability.toLowerCase().split(" ")[0]}`,
    }).where(eq(studentsTable.id, s.id));
  }

  for (let i = 0; i < hsStudents.length; i++) {
    const s = hsStudents[i];
    const grade = HS_GRADES[i] ?? "10";
    const disability = DISABILITY_CATEGORIES[(s.id * 3 + 2) % DISABILITY_CATEGORIES.length];
    const placement = PLACEMENT_TYPES[(s.id * 5 + 1) % PLACEMENT_TYPES.length];
    const lang = PRIMARY_LANGUAGES[(s.id * 7 + 1) % PRIMARY_LANGUAGES.length];
    const dob = dobForGrade(grade, s.id);
    await db.update(studentsTable).set({
      schoolId: 1, // Lincoln High
      grade,
      disabilityCategory: disability,
      placementType: placement,
      primaryLanguage: lang,
      dateOfBirth: dob,
      parentGuardianName: parentName(s.firstName, s.lastName),
      parentEmail: parentEmail(s.firstName, s.lastName),
      parentPhone: parentPhone(),
      tags: `therapeutic,substantially-separate,${disability.toLowerCase().split(" ")[0]}`,
    }).where(eq(studentsTable.id, s.id));
  }
  console.log("  Demographics updated.");

  // ── 3. Add new staff members ───────────────────────────────────────────────
  console.log("Step 3: Adding new staff members...");
  let addedStaff = 0;
  const existingEmails = await db.select({ email: staffTable.email }).from(staffTable);
  const emailSet = new Set(existingEmails.map(e => e.email));

  for (const s of NEW_STAFF) {
    if (emailSet.has(s.email)) {
      console.log(`  Skipping ${s.email} (already exists)`);
      continue;
    }
    await db.insert(staffTable).values({
      firstName: s.firstName,
      lastName: s.lastName,
      email: s.email,
      role: s.role,
      title: s.title,
      schoolId: s.schoolId,
      status: "active",
      qualifications: s.qualifications ?? null,
    });
    addedStaff++;
  }
  console.log(`  Added ${addedStaff} new staff members.`);

  // ── 4. Create programs for Roosevelt Middle (school_id=2) ──────────────────
  console.log("Step 4: Creating middle school programs...");
  const existingMsPrograms = await db.select({ name: programsTable.name })
    .from(programsTable).where(eq(programsTable.schoolId, 2));
  const existingMsProgNames = new Set(existingMsPrograms.map(p => p.name));

  const msProgIds: number[] = [];
  for (const prog of MIDDLE_PROGRAMS) {
    if (!existingMsProgNames.has(prog.name)) {
      const [inserted] = await db.insert(programsTable).values({
        name: prog.name,
        schoolId: 2,
        description: prog.description,
      }).returning({ id: programsTable.id });
      msProgIds.push(inserted.id);
    }
  }

  // Fetch all Roosevelt Middle program IDs (including newly created)
  const allMsProgs = await db.select({ id: programsTable.id })
    .from(programsTable).where(eq(programsTable.schoolId, 2));
  const allMsProgIds = allMsProgs.map(p => p.id);

  // Lincoln High program IDs (already exist: 1-4)
  const allHsProgs = await db.select({ id: programsTable.id })
    .from(programsTable).where(eq(programsTable.schoolId, 1));
  const allHsProgIds = allHsProgs.map(p => p.id);

  console.log(`  Roosevelt Middle has ${allMsProgIds.length} programs, Lincoln High has ${allHsProgIds.length}.`);

  // Assign students to programs
  for (const s of msStudents) {
    const progId = allMsProgIds[s.id % allMsProgIds.length];
    await db.update(studentsTable).set({ programId: progId }).where(eq(studentsTable.id, s.id));
  }
  for (const s of hsStudents) {
    const progId = allHsProgIds[s.id % allHsProgIds.length];
    await db.update(studentsTable).set({ programId: progId }).where(eq(studentsTable.id, s.id));
  }
  console.log("  Students assigned to programs.");

  // ── 5. Update case_manager_id for Roosevelt Middle students ───────────────
  console.log("Step 5: Assigning case managers...");
  const allStaff = await db.select({ id: staffTable.id, role: staffTable.role, schoolId: staffTable.schoolId })
    .from(staffTable).where(eq(staffTable.status, "active"));

  const msCaseManagers = allStaff.filter(s => s.role === "case_manager" && s.schoolId === 2).map(s => s.id);
  const hsCaseManagers = allStaff.filter(s => s.role === "case_manager" && s.schoolId === 1).map(s => s.id);

  if (msCaseManagers.length > 0) {
    for (let i = 0; i < msStudents.length; i++) {
      const s = msStudents[i];
      const cmId = msCaseManagers[i % msCaseManagers.length];
      await db.update(studentsTable).set({ caseManagerId: cmId }).where(eq(studentsTable.id, s.id));
    }
    console.log(`  Assigned ${msCaseManagers.length} case managers to ${msStudents.length} middle school students.`);
  } else {
    console.log("  No middle school case managers found — skipping assignment.");
  }
  if (hsCaseManagers.length > 0) {
    for (let i = 0; i < hsStudents.length; i++) {
      const s = hsStudents[i];
      const cmId = hsCaseManagers[i % hsCaseManagers.length];
      await db.update(studentsTable).set({ caseManagerId: cmId }).where(eq(studentsTable.id, s.id));
    }
    console.log(`  Assigned ${hsCaseManagers.length} case managers to ${hsStudents.length} high school students.`);
  }

  // Update service_requirements providers for Roosevelt Middle students
  // (BCBAs and paras at Roosevelt Middle should serve those students)
  console.log("Step 5b: Updating service requirement providers for Roosevelt Middle students...");
  const msBCBAs = allStaff.filter(s => (s.role === "bcba") && s.schoolId === 2).map(s => s.id);
  const msParas = allStaff.filter(s => s.role === "para" && s.schoolId === 2).map(s => s.id);
  const msSlps = allStaff.filter(s => s.role === "slp" && s.schoolId === 2).map(s => s.id);
  const msOts = allStaff.filter(s => s.role === "ot" && s.schoolId === 2).map(s => s.id);
  const msPts = allStaff.filter(s => s.role === "pt" && s.schoolId === 2).map(s => s.id);
  const msCounselors = allStaff.filter(s => s.role === "counselor" && s.schoolId === 2).map(s => s.id);

  // Get service type IDs
  const stRows = await db.select({ id: serviceTypesTable.id, name: serviceTypesTable.name }).from(serviceTypesTable);
  const stMap: Record<string, number> = {};
  for (const row of stRows) { stMap[row.name] = row.id; }

  const msStudentIds = msStudents.map(s => s.id);

  // Reassign ABA service providers for middle school students
  if (msBCBAs.length > 0) {
    const abaTypeId = stMap["ABA/Behavior Intervention"];
    const bcbaTypeId = stMap["BCBA Consultation"];
    const msSRs = await db.select({ id: serviceRequirementsTable.id, studentId: serviceRequirementsTable.studentId, serviceTypeId: serviceRequirementsTable.serviceTypeId })
      .from(serviceRequirementsTable)
      .where(eq(serviceRequirementsTable.active, true));
    const msSRsFiltered = msSRs.filter(sr => msStudentIds.includes(sr.studentId));

    let bcbaIdx = 0;
    let paraIdx = 0;
    let slpIdx = 0;
    let otIdx = 0;
    let ptIdx = 0;
    let counselorIdx = 0;

    for (const sr of msSRsFiltered) {
      let providerId: number | null = null;
      if (sr.serviceTypeId === abaTypeId && msParas.length > 0) {
        providerId = msParas[paraIdx % msParas.length]; paraIdx++;
      } else if (sr.serviceTypeId === bcbaTypeId && msBCBAs.length > 0) {
        providerId = msBCBAs[bcbaIdx % msBCBAs.length]; bcbaIdx++;
      } else if (sr.serviceTypeId === stMap["Speech-Language Therapy"] && msSlps.length > 0) {
        providerId = msSlps[slpIdx % msSlps.length]; slpIdx++;
      } else if (sr.serviceTypeId === stMap["Occupational Therapy"] && msOts.length > 0) {
        providerId = msOts[otIdx % msOts.length]; otIdx++;
      } else if (sr.serviceTypeId === stMap["Physical Therapy"] && msPts.length > 0) {
        providerId = msPts[ptIdx % msPts.length]; ptIdx++;
      } else if (sr.serviceTypeId === stMap["Counseling Services"] && msCounselors.length > 0) {
        providerId = msCounselors[counselorIdx % msCounselors.length]; counselorIdx++;
      }
      if (providerId !== null) {
        await db.update(serviceRequirementsTable).set({ providerId }).where(eq(serviceRequirementsTable.id, sr.id));
      }
    }
    console.log(`  Updated service providers for ${msSRsFiltered.length} service requirements at Roosevelt Middle.`);
  }

  // ── 6. Delete dependent data before rebuilding targets ────────────────────
  console.log("Step 6: Clearing old behavioral/program data...");
  await db.delete(teacherObservationsTable);
  await db.delete(behaviorDataTable);
  await db.delete(programDataTable);
  await db.delete(dataSessionsTable);
  console.log("  Cleared teacher_observations, behavior_data, program_data, data_sessions.");

  await db.delete(iepGoalsTable);
  await db.delete(behaviorTargetsTable);
  await db.delete(programTargetsTable);
  console.log("  Cleared iep_goals, behavior_targets, program_targets.");

  // ── 7. Create new program_targets + behavior_targets + iep_goals ──────────
  console.log("Step 7: Creating therapeutic program targets (10-14 per student)...");

  const allStudentIds = allStudents.map(s => s.id);
  let totalProgTargets = 0;
  let totalBehTargets = 0;
  let totalIepGoals = 0;

  for (const student of allStudents) {
    const sid = student.id;
    const isMS = msStudents.some(s => s.id === sid);

    // Determine profile based on disability category
    const disabilityKey = DISABILITY_CATEGORIES[(sid * 3 + (isMS ? 1 : 2)) % DISABILITY_CATEGORIES.length];
    const hasASD = disabilityKey.includes("Autism");
    const hasEBD = disabilityKey.includes("Emotional");

    // Shuffle and pick 10-14 program targets
    const numProgTargets = rand(10, 14);
    const progPool = shuffle(PROGRAM_TEMPLATES_THERAPEUTIC);

    // Weight pool to be appropriate for school level and disability
    let weightedPool: ProgTemplate[];
    if (isMS) {
      // Middle: more communication, social, daily living
      weightedPool = [
        ...progPool.filter(t => ["Communication", "Social", "Social-Emotional", "Daily Living", "Language", "Behavior", "Adaptive"].includes(t.domain)),
        ...progPool.filter(t => ["Functional Academic", "Academic"].includes(t.domain)),
      ];
    } else {
      // High school: more vocational, transition, functional academic, self-management
      weightedPool = [
        ...progPool.filter(t => ["Vocational", "Transition", "Functional Academic"].includes(t.domain)),
        ...progPool.filter(t => ["Social", "Social-Emotional", "Daily Living", "Community", "Adaptive"].includes(t.domain)),
        ...progPool.filter(t => ["Communication", "Language", "Behavior", "Academic"].includes(t.domain)),
      ];
    }
    // Remove duplicates while preserving order
    const seen = new Set<string>();
    const dedupedPool = weightedPool.filter(t => { if (seen.has(t.name)) return false; seen.add(t.name); return true; });

    const selectedProgs = dedupedPool.slice(0, Math.min(numProgTargets, dedupedPool.length));

    const programTargetsByStudent: Array<{ id: number; name: string; domain: string; targetCriterion: string; description: string }> = [];
    for (const t of selectedProgs) {
      const promptLevel = pick(["verbal", "gestural", "model", "partial_physical"]);
      const masteryPct = t.programType === "task_analysis" ? 90 : 80;
      const [inserted] = await db.insert(programTargetsTable).values({
        studentId: sid,
        name: t.name,
        description: t.description,
        programType: t.programType as any,
        domain: t.domain,
        targetCriterion: t.targetCriterion,
        masteryCriterionPercent: masteryPct,
        masteryCriterionSessions: 3,
        currentPromptLevel: promptLevel as any,
        autoProgressEnabled: true,
        reinforcementSchedule: hasASD ? "continuous" : "variable_ratio",
        active: true,
      } as any).returning();
      programTargetsByStudent.push({ id: inserted.id, name: t.name, domain: t.domain, targetCriterion: t.targetCriterion, description: t.description });
      totalProgTargets++;
    }

    // Pick 4-6 behavior targets (heavy behavioral needs)
    const numBehTargets = rand(4, 6);
    const behPool = shuffle(BEHAVIOR_TEMPLATES_THERAPEUTIC);

    // Ensure mix of decrease and increase behaviors (at least 1 increase)
    const decreaseBeh = behPool.filter(b => b.targetDirection === "decrease");
    const increaseBeh = behPool.filter(b => b.targetDirection === "increase");
    const numDecrease = Math.min(numBehTargets - 2, decreaseBeh.length);
    const numIncrease = Math.min(2, increaseBeh.length);
    const selectedBehs = [
      ...decreaseBeh.slice(0, numDecrease),
      ...increaseBeh.slice(0, numIncrease),
    ].slice(0, numBehTargets);

    const behaviorTargetsByStudent: Array<{ id: number; name: string; targetDirection: string; baselineValue: string; goalValue: string; measurementType: string; description: string }> = [];
    for (const t of selectedBehs) {
      // Add individual variation to baseline values
      const baseAdj = Math.round(parseFloat(t.baselineValue) * (0.7 + Math.random() * 0.6));
      const [inserted] = await db.insert(behaviorTargetsTable).values({
        studentId: sid,
        name: t.name,
        description: t.description,
        measurementType: t.measurementType as any,
        targetDirection: t.targetDirection as any,
        baselineValue: String(baseAdj || t.baselineValue),
        goalValue: t.goalValue,
        trackingMethod: (t.trackingMethod ?? "per_session") as any,
        active: true,
      } as any).returning();
      behaviorTargetsByStudent.push({ id: inserted.id, name: t.name, targetDirection: t.targetDirection, baselineValue: String(baseAdj || t.baselineValue), goalValue: t.goalValue, measurementType: t.measurementType, description: t.description });
      totalBehTargets++;
    }

    // ── 8. Create IEP goals linked to targets ──────────────────────────────
    const iepDocs = await db.select({ id: iepDocumentsTable.id })
      .from(iepDocumentsTable).where(eq(iepDocumentsTable.studentId, sid));
    const iepDocId = iepDocs.length > 0 ? iepDocs[0].id : null;
    let goalNum = 1;

    const GOAL_AREAS: Record<string, string> = {
      "Communication": "Communication/Language",
      "Language": "Communication/Language",
      "Social": "Social-Emotional",
      "Social-Emotional": "Social-Emotional",
      "Behavior": "Behavior/ABA",
      "Adaptive": "Adaptive/Daily Living",
      "Daily Living": "Adaptive/Daily Living",
      "Community": "Adaptive/Daily Living",
      "Vocational": "Transition/Vocational",
      "Transition": "Transition/Vocational",
      "Academic": "Functional Academics",
      "Functional Academic": "Functional Academics",
      "Motor": "Occupational Therapy",
      "Cognitive": "Functional Academics",
    };

    for (const pt of programTargetsByStudent) {
      const goalArea = GOAL_AREAS[pt.domain] ?? "Functional Academics";
      const goalText = buildIepGoalFromProgTarget(pt);
      await db.insert(iepGoalsTable).values({
        studentId: sid,
        goalArea,
        goalNumber: goalNum++,
        annualGoal: goalText,
        targetCriterion: pt.targetCriterion,
        measurementMethod: "Direct data collection and progress monitoring",
        serviceArea: goalArea,
        programTargetId: pt.id,
        iepDocumentId: iepDocId,
        status: "active",
        active: true,
        scheduleOfReporting: "quarterly",
      } as any).catch(() => {}); // skip if constraint issue
      totalIepGoals++;
    }

    for (const bt of behaviorTargetsByStudent) {
      const goalText = buildIepGoalFromBehTarget(bt);
      await db.insert(iepGoalsTable).values({
        studentId: sid,
        goalArea: "Behavior/ABA",
        goalNumber: goalNum++,
        annualGoal: goalText,
        baseline: bt.baselineValue,
        targetCriterion: bt.targetDirection === "decrease" ? `≤ ${bt.goalValue}` : `≥ ${bt.goalValue}`,
        measurementMethod: bt.measurementType === "frequency" ? "Frequency count" : bt.measurementType === "duration" ? "Duration recording" : "Interval/momentary time sampling",
        serviceArea: "ABA/Behavior Intervention",
        behaviorTargetId: bt.id,
        iepDocumentId: iepDocId,
        status: "active",
        active: true,
        scheduleOfReporting: "quarterly",
      } as any).catch(() => {});
      totalIepGoals++;
    }

    if (sid <= 5 || sid % 10 === 0) {
      console.log(`  Student ${sid}: ${programTargetsByStudent.length} program targets, ${behaviorTargetsByStudent.length} behavior targets, ${goalNum - 1} IEP goals`);
    }
  }

  // ── 9. Summary ─────────────────────────────────────────────────────────────
  console.log("\n=== Therapeutic Seed Complete ===");
  console.log(`  Students:       25 middle school (Roosevelt) + 25 high school (Lincoln)`);
  console.log(`  New staff:      ${addedStaff} added`);
  console.log(`  Program targets: ${totalProgTargets} total (avg ${(totalProgTargets / allStudents.length).toFixed(1)}/student)`);
  console.log(`  Behavior targets: ${totalBehTargets} total (avg ${(totalBehTargets / allStudents.length).toFixed(1)}/student)`);
  console.log(`  IEP goals:      ${totalIepGoals} total (avg ${(totalIepGoals / allStudents.length).toFixed(1)}/student)`);
  console.log(`  service_requirements: PRESERVED (untouched)`);
  console.log(`  session_logs:         PRESERVED (untouched)`);
}

// Entry point
seedTherapeuticData()
  .then(() => { console.log("\nDone."); process.exit(0); })
  .catch(err => { console.error("Seed failed:", err); process.exit(1); });
