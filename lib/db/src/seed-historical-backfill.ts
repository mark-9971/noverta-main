/**
 * Historical Backfill Seed — Jan 2024 → Aug 2025
 *
 * Creates two prior school years (2023-24, 2024-25) for every district,
 * then backfills sessions, IEP documents + goals, team meetings, progress
 * reports, evaluations, and compensatory obligations for those periods.
 *
 * Safe to run on top of existing data — idempotent checks are performed
 * before inserting school years and IEP documents.
 */

import { db } from "./index";
import {
  schoolsTable,
  schoolYearsTable,
  studentsTable,
  staffTable,
  serviceRequirementsTable,
  sessionLogsTable,
  iepDocumentsTable,
  iepGoalsTable,
  teamMeetingsTable,
  progressReportsTable,
  evaluationsTable,
  compensatoryObligationsTable,
  missedReasonsTable,
} from "./index";
import { eq, sql } from "drizzle-orm";

// ─── helpers ────────────────────────────────────────────────────────────────

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randf(min: number, max: number) { return min + Math.random() * (max - min); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function addDays(d: string, n: number): string {
  const dt = new Date(d + "T12:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().split("T")[0];
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}

function minToTime(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// ─── school calendar utils ───────────────────────────────────────────────────

const NO_SCHOOL_2324: [string, string][] = [
  ["2024-01-01", "2024-01-01"],
  ["2024-01-15", "2024-01-15"],
  ["2024-02-19", "2024-02-23"],
  ["2024-03-25", "2024-03-25"],
  ["2024-04-15", "2024-04-19"],
  ["2024-05-27", "2024-05-27"],
];

const NO_SCHOOL_2425: [string, string][] = [
  ["2024-11-11", "2024-11-11"],
  ["2024-11-28", "2024-11-29"],
  ["2024-12-23", "2025-01-01"],
  ["2025-01-20", "2025-01-20"],
  ["2025-02-17", "2025-02-21"],
  ["2025-03-24", "2025-03-24"],
  ["2025-04-21", "2025-04-25"],
  ["2025-05-26", "2025-05-26"],
];

function isSchoolDay(d: string, noSchool: [string, string][]): boolean {
  const dow = new Date(d + "T12:00:00").getDay();
  if (dow === 0 || dow === 6) return false;
  for (const [s, e] of noSchool) if (d >= s && d <= e) return false;
  return true;
}

function schoolDaysBetween(start: string, end: string, noSchool: [string, string][]): string[] {
  const days: string[] = [];
  let cur = start;
  while (cur <= end) {
    if (isSchoolDay(cur, noSchool)) days.push(cur);
    cur = addDays(cur, 1);
  }
  return days;
}

// ─── scenario → delivery envelope ───────────────────────────────────────────

type Scenario = "healthy" | "improving" | "shortfall" | "compensatory_risk" | "urgent" | "new_enrollment";

function assignScenario(studentId: number): Scenario {
  const hash = (studentId * 7 + 13) % 100;
  if (hash < 40) return "healthy";
  if (hash < 55) return "improving";
  if (hash < 75) return "shortfall";
  if (hash < 85) return "compensatory_risk";
  if (hash < 95) return "urgent";
  return "new_enrollment";
}

// Returns delivery fraction for a given scenario + period (early/late in school career)
function deliveryRate(scenario: Scenario, period: "2324" | "2425_h1" | "2425_h2"): number {
  const base: Record<Scenario, [number, number, number, number, number, number]> = {
    //                         2324    2425h1  2425h2
    healthy:           [0.90, 0.98, 0.88, 0.97, 0.91, 0.99],
    improving:         [0.62, 0.72, 0.74, 0.84, 0.85, 0.95],
    shortfall:         [0.60, 0.75, 0.65, 0.80, 0.70, 0.85],
    compensatory_risk: [0.40, 0.58, 0.50, 0.68, 0.60, 0.78],
    urgent:            [0.30, 0.50, 0.35, 0.55, 0.45, 0.65],
    new_enrollment:    [0.85, 0.97, 0.86, 0.96, 0.88, 0.97],
  };
  const [lo2324, hi2324, lo25h1, hi25h1, lo25h2, hi25h2] = base[scenario];
  if (period === "2324")    return randf(lo2324, hi2324);
  if (period === "2425_h1") return randf(lo25h1, hi25h1);
  return randf(lo25h2, hi25h2);
}

// ─── service-type session duration (minutes) ─────────────────────────────────

function sessionDuration(serviceTypeId: number): { typical: number; variance: number } {
  const map: Record<number, { typical: number; variance: number }> = {
    31: { typical: 60, variance: 15 },  // ABA
    32: { typical: 30, variance: 10 },  // OT
    33: { typical: 30, variance: 10 },  // Speech
    34: { typical: 45, variance: 10 },  // Counseling
    35: { typical: 120, variance: 30 }, // Para
    36: { typical: 30, variance: 10 },  // PT
    37: { typical: 60, variance: 15 },  // BCBA
  };
  return map[serviceTypeId] ?? { typical: 45, variance: 15 };
}

// ─── IEP goal templates by service type ──────────────────────────────────────

const GOAL_TEMPLATES: Record<number, Array<{ area: string; goal: string }>> = {
  31: [
    { area: "Behavior/ABA", goal: "reduce frequency of target behavior using ABA-based interventions from baseline to criterion across 3 consecutive sessions" },
    { area: "Behavior/ABA", goal: "increase compliance with adult-directed tasks from 40% to 80% across 3 consecutive sessions" },
    { area: "Behavior/ABA", goal: "demonstrate functional communication as a replacement for problem behavior in 80% of opportunities" },
    { area: "Behavior/ABA", goal: "independently follow a visual schedule for daily transitions with no more than 1 verbal prompt" },
  ],
  32: [
    { area: "Occupational Therapy", goal: "improve fine motor control for handwriting legibility, forming 80% of target letters correctly" },
    { area: "Occupational Therapy", goal: "independently manage fasteners (zipper, buttons, snaps) during dressing routines in 4 of 5 trials" },
    { area: "Occupational Therapy", goal: "improve visual-motor integration for copying tasks, scoring at grade-level on standardized assessment" },
    { area: "Occupational Therapy", goal: "tolerate a range of sensory inputs during classroom activities without dysregulation for 20+ minutes" },
  ],
  33: [
    { area: "Speech-Language", goal: "produce target phonemes with 80% accuracy in structured conversation" },
    { area: "Speech-Language", goal: "increase mean length of utterance to target morphemes during narrative retell" },
    { area: "Speech-Language", goal: "initiate and maintain a 3-turn conversational exchange with a peer in 4 of 5 opportunities" },
    { area: "Speech-Language", goal: "follow 2-step classroom directions without repetition in 80% of opportunities" },
  ],
  34: [
    { area: "Counseling", goal: "identify and use 3 coping strategies when experiencing anxiety or frustration across settings" },
    { area: "Counseling", goal: "demonstrate perspective-taking skills in social scenarios with 80% accuracy" },
    { area: "Counseling", goal: "self-advocate for needs using appropriate language in 4 of 5 structured practice opportunities" },
    { area: "Counseling", goal: "demonstrate improved conflict resolution skills by identifying solutions independently in 80% of trials" },
  ],
  35: [
    { area: "Paraprofessional Support", goal: "increase academic task completion independently from 40% to 80% with decreasing para support" },
    { area: "Paraprofessional Support", goal: "navigate daily transitions with no more than 1 verbal prompt across 4 of 5 observed transitions" },
    { area: "Paraprofessional Support", goal: "initiate social interaction with peers during unstructured time in 3 of 5 opportunities" },
  ],
  36: [
    { area: "Physical Therapy", goal: "improve ambulation using proper heel-toe gait pattern in 80% of steps across settings" },
    { area: "Physical Therapy", goal: "demonstrate core strengthening: maintain plank position for 20 seconds independently" },
    { area: "Physical Therapy", goal: "navigate stairs independently using handrail in 4 of 5 observed opportunities" },
  ],
  37: [
    { area: "BCBA Consultation", goal: "BCBA will oversee behavior intervention plan with 90%+ treatment integrity across RBT implementation" },
    { area: "BCBA Consultation", goal: "behavior data trends will show meaningful reduction in target behavior over the annual IEP period" },
  ],
};

const MEASUREMENT_METHODS = [
  "Direct observation with frequency count",
  "Percentage correct across trials (DTT data sheet)",
  "Rate per minute using interval recording",
  "Task analysis checklist",
  "Rubric-based performance assessment",
  "ABC data recording",
  "Duration recording",
  "Portfolio and work samples",
];

// ─── main seed function ───────────────────────────────────────────────────────

export async function seedHistoricalBackfill() {
  console.log("[backfill] Starting historical backfill (Jan 2024 → Aug 2025)...");

  // ── 1. Load existing data ──────────────────────────────────────────────────

  type DistrictRow = { id: number };
  type SchoolRow   = { id: number; districtId: number };
  type StudentRow  = { id: number; firstName: string; lastName: string; schoolId: number };
  type StaffRow    = { id: number; firstName: string; lastName: string; role: string; schoolId: number };
  type ReqRow      = { id: number; studentId: number; serviceTypeId: number; providerId: number; requiredMinutes: number; intervalType: string };
  type YearRow     = { id: number; districtId: number; label: string };
  type MissedRow   = { id: number };

  const districts    = await db.execute(sql`SELECT id FROM districts`).then(r => r.rows as DistrictRow[]);
  const schools      = await db.execute(sql`SELECT id, district_id as "districtId" FROM schools`).then(r => r.rows as SchoolRow[]);
  const students     = await db.execute(sql`SELECT id, first_name as "firstName", last_name as "lastName", school_id as "schoolId" FROM students WHERE status = 'active'`).then(r => r.rows as StudentRow[]);
  const staff        = await db.execute(sql`SELECT id, first_name as "firstName", last_name as "lastName", role, school_id as "schoolId" FROM staff WHERE status = 'active'`).then(r => r.rows as StaffRow[]);
  const serviceReqs  = await db.execute(sql`SELECT id, student_id as "studentId", service_type_id as "serviceTypeId", provider_id as "providerId", required_minutes as "requiredMinutes", interval_type as "intervalType" FROM service_requirements WHERE active = true`).then(r => r.rows as ReqRow[]);
  const existingYears = await db.execute(sql`SELECT id, district_id as "districtId", label FROM school_years`).then(r => r.rows as YearRow[]);
  const missedIds    = await db.execute(sql`SELECT id FROM missed_reasons`).then(r => r.rows.map((r: any) => r.id as number));

  const schoolById  = new Map(schools.map(s => [s.id, s]));
  const staffBySchool = new Map<number, typeof staff>();
  for (const s of staff) {
    const sid = s.schoolId;
    if (sid == null) continue;
    if (!staffBySchool.has(sid)) staffBySchool.set(sid, []);
    staffBySchool.get(sid)!.push(s);
  }

  // ── 2. Create school years 2023-24 and 2024-25 per district ───────────────

  const yearMap = new Map<string, number>(); // "districtId-label" → schoolYearId

  for (const sy of existingYears) {
    yearMap.set(`${sy.districtId}-${sy.label}`, sy.id);
  }

  for (const district of districts) {
    for (const [label, startDate, endDate] of [
      ["2023-2024", "2023-09-05", "2024-06-14"],
      ["2024-2025", "2024-09-03", "2025-06-13"],
    ] as const) {
      const key = `${district.id}-${label}`;
      if (!yearMap.has(key)) {
        const [inserted] = await db.insert(schoolYearsTable).values({
          districtId: district.id,
          label,
          startDate,
          endDate,
          isActive: false,
        }).returning();
        yearMap.set(key, inserted.id);
        console.log(`[backfill] Created school year ${label} for district ${district.id} (id=${inserted.id})`);
      }
    }
  }

  // ── 3. Build per-student data ──────────────────────────────────────────────

  const adminStaff = staff.find(s => s.role === "admin") ?? staff[0];
  const caseManagers = staff.filter(s => s.role === "case_manager");

  let totalSessions = 0;
  let totalMeetings = 0;
  let totalProgressReports = 0;
  let totalEvaluations = 0;
  let totalCompObligs = 0;
  let totalIepDocs = 0;
  let totalGoals = 0;

  // ── check which students already have historical IEP docs ─────────────────
  const existingIepDocs = await db.select({
    studentId: iepDocumentsTable.studentId,
    schoolYearId: iepDocumentsTable.schoolYearId,
  }).from(iepDocumentsTable);
  const iepDocKey = new Set(existingIepDocs.map(d => `${d.studentId}-${d.schoolYearId}`));

  for (const student of students) {
    if (student.schoolId == null) continue;
    const school = schoolById.get(student.schoolId);
    if (!school) continue;

    const districtId = school.districtId;
    const scenario   = assignScenario(student.id);
    const reqs       = serviceReqs.filter(r => r.studentId === student.id);
    if (reqs.length === 0) continue;

    // provider staff for this student
    const schoolStaff = staffBySchool.get(student.schoolId!) ?? [];
    const providerStaff = schoolStaff.filter(s => !["admin", "coordinator"].includes(s.role));
    const caseManager = caseManagers.find(cm => cm.schoolId === student.schoolId) ?? caseManagers[0];

    // ── A. IEP documents + goals ─────────────────────────────────────────────

    for (const [yearLabel, iepStart, iepEnd, isActive] of [
      ["2023-2024", "2023-09-05", "2024-08-31", false],
      ["2024-2025", "2024-09-03", "2025-08-31", false],
    ] as const) {
      const syId = yearMap.get(`${districtId}-${yearLabel}`);
      if (!syId) continue;

      if (iepDocKey.has(`${student.id}-${syId}`)) continue; // idempotent

      const [iepDoc] = await db.insert(iepDocumentsTable).values({
        studentId: student.id,
        iepStartDate: iepStart,
        iepEndDate: iepEnd,
        meetingDate: addDays(iepStart, -14),
        status: "active",
        iepType: "annual",
        version: 1,
        schoolYearId: syId,
        active: isActive,
        preparedBy: caseManager?.id ?? adminStaff.id,
        plaafpAcademic: `Student demonstrates ${pick(["emerging", "developing", "functional", "grade-level"])} skills in ${pick(["reading", "mathematics", "written language", "academic independence"])}. Current assessment data indicates student benefits from ${pick(["structured routines", "visual supports", "reduced workload", "extended time"])}.`,
        plaafpBehavioral: reqs.some(r => [31, 35].includes(r.serviceTypeId ?? 0))
          ? `Student exhibits ${pick(["challenging behaviors", "self-regulatory difficulties", "emotional dysregulation", "task avoidance"])} that impact access to the general curriculum. Behavior intervention plan is in place.`
          : null,
        studentConcerns: "Family reports student continues to make progress and is engaged in school activities.",
        parentConcerns:  "Parents are concerned about peer interaction and generalization of skills to home.",
      }).returning();

      iepDocKey.add(`${student.id}-${syId}`);
      totalIepDocs++;

      // Insert 2-3 goals per IEP
      const goalServiceIds = [...new Set(reqs.map(r => r.serviceTypeId).filter(Boolean))];
      let goalNumber = 1;
      for (const stId of goalServiceIds.slice(0, 3)) {
        const templates = GOAL_TEMPLATES[stId as number] ?? GOAL_TEMPLATES[33];
        if (!templates?.length) continue;
        const tmpl = templates[(student.id + goalNumber) % templates.length];
        await db.insert(iepGoalsTable).values({
          studentId: student.id,
          iepDocumentId: iepDoc.id,
          goalArea: tmpl.area,
          goalNumber,
          annualGoal: tmpl.goal,
          baseline: `${rand(25, 50)}% accuracy on baseline probe (${new Date(iepStart).toLocaleDateString("en-US", { month: "long", year: "numeric" })})`,
          targetCriterion: `${rand(75, 90)}% accuracy across ${rand(3, 5)} consecutive sessions with ${pick(["no prompting", "minimal verbal prompts", "gesture prompts only"])}`,
          measurementMethod: pick(MEASUREMENT_METHODS),
          scheduleOfReporting: "Quarterly progress reports",
          serviceArea: tmpl.area,
          status: isActive ? "active" : "closed",
          startDate: iepStart,
          endDate: iepEnd,
          active: isActive,
        });
        goalNumber++;
        totalGoals++;
      }
    }

    // ── B. Sessions by school period ─────────────────────────────────────────

    const periods: Array<{
      start: string; end: string;
      noSchool: [string, string][];
      yearLabel: string;
      periodKey: "2324" | "2425_h1" | "2425_h2";
    }> = [
      // 2023-24: only Jan 2, 2024 onwards
      { start: "2024-01-02", end: "2024-06-14", noSchool: NO_SCHOOL_2324, yearLabel: "2023-2024", periodKey: "2324" },
      // 2024-25 H1: Sep - Dec
      { start: "2024-09-03", end: "2024-12-20", noSchool: NO_SCHOOL_2425, yearLabel: "2024-2025", periodKey: "2425_h1" },
      // 2024-25 H2: Jan - Jun
      { start: "2025-01-06", end: "2025-06-13", noSchool: NO_SCHOOL_2425, yearLabel: "2024-2025", periodKey: "2425_h2" },
    ];

    const sessionBatch: (typeof sessionLogsTable.$inferInsert)[] = [];

    for (const period of periods) {
      const syId = yearMap.get(`${districtId}-${period.yearLabel}`);
      if (!syId) continue;

      const schoolDays = schoolDaysBetween(period.start, period.end, period.noSchool);
      if (schoolDays.length === 0) continue;

      for (const req of reqs) {
        if (!req.serviceTypeId || !req.providerId) continue;
        const stId = req.serviceTypeId;
        const { typical, variance } = sessionDuration(stId);

        // required minutes per month → figure sessions needed
        const monthsInPeriod = daysBetween(period.start, period.end) / 30.44;
        const requiredMinutesTotal = (req.requiredMinutes ?? 120) * monthsInPeriod;
        const avgSessionMin = typical;
        const requiredSessions = Math.round(requiredMinutesTotal / avgSessionMin);
        if (requiredSessions <= 0) continue;

        const rate = deliveryRate(scenario, period.periodKey);
        const targetDelivered = Math.round(requiredSessions * rate);
        const missedCount      = requiredSessions - targetDelivered;

        // Spread delivered sessions across school days
        const deliveredDays = pickSpread(schoolDays, targetDelivered);
        for (const d of deliveredDays) {
          const dur = Math.max(15, typical + rand(-variance, variance));
          const startMin = rand(480, 870); // 8:00–14:30
          sessionBatch.push({
            studentId:             student.id,
            serviceRequirementId:  req.id,
            serviceTypeId:         stId,
            staffId:               req.providerId,
            sessionDate:           d,
            startTime:             minToTime(startMin),
            endTime:               minToTime(startMin + dur),
            durationMinutes:       dur,
            status:                "completed",
            schoolYearId:          syId,
            notes:                 pick([
              `Session delivered. Student engagement was ${pick(["excellent", "good", "variable", "improving"])} today.`,
              `Worked on target skills. Progress noted toward annual goal.`,
              `${pick(["Data collection", "Observation", "Direct service"])} session. Student demonstrated ${pick(["emerging", "developing", "consistent"])} skill level.`,
              null,
            ]),
          });
        }

        // Spread missed sessions
        const deliveredSet = new Set(deliveredDays);
        const remainDays   = schoolDays.filter(d => !deliveredSet.has(d));
        const missedDays   = pickSpread(remainDays, Math.min(missedCount, remainDays.length));
        for (const d of missedDays) {
          sessionBatch.push({
            studentId:            student.id,
            serviceRequirementId: req.id,
            serviceTypeId:        stId,
            staffId:              req.providerId,
            sessionDate:          d,
            status:               "missed",
            missedReasonId:       missedIds.length ? pick(missedIds) : null,
            durationMinutes:      0,
            schoolYearId:         syId,
          });
        }
      }
    }

    // Batch insert sessions in chunks to avoid statement size limits
    for (let i = 0; i < sessionBatch.length; i += 200) {
      await db.insert(sessionLogsTable).values(sessionBatch.slice(i, i + 200));
    }
    totalSessions += sessionBatch.length;

    // ── C. Team meetings ──────────────────────────────────────────────────────

    for (const [yearLabel, annualDate, checkInDate] of [
      ["2023-2024", "2024-04-15", "2024-02-06"],
      ["2024-2025", "2025-04-10", "2025-01-14"],
    ] as [string, string, string][]) {
      const syId = yearMap.get(`${districtId}-${yearLabel}`);
      if (!syId) continue;

      // Annual review
      await db.insert(teamMeetingsTable).values({
        studentId:    student.id,
        meetingType:  "annual_review",
        scheduledDate: addDays(annualDate, rand(-5, 5)),
        scheduledTime: minToTime(rand(540, 780)),
        location:     pick(["Room 101 – Conference", "Main Office Conference Room", "Virtual (Zoom)", "Team Room B"]),
        status:       "completed",
        schoolYearId: syId,
        consentStatus: "obtained",
        noticeSentDate: addDays(annualDate, -14),
        outcome: pick([
          "IEP reviewed and updated. All team members in agreement. Parents signed consent.",
          "Annual IEP meeting completed. Goals updated. Placement decision: continued SPED services.",
          "IEP renewed with revised service hours. Parent expressed satisfaction with progress.",
          "Annual review complete. Compensatory services discussed and documented.",
        ]),
        minutesFinalized: true,
        attendees: [
          { name: `${caseManager?.firstName ?? ""} ${caseManager?.lastName ?? ""}`, role: "Case Manager" },
          { name: `${student.firstName} ${student.lastName}'s Parent/Guardian`, role: "Parent" },
          { name: "General Education Teacher", role: "Gen Ed Teacher" },
          ...(providerStaff.slice(0, 2).map(p => ({ name: `${p.firstName} ${p.lastName}`, role: p.role.toUpperCase() }))),
        ],
        duration: rand(45, 90),
      });
      totalMeetings++;

      // Mid-year check-in (60% of students)
      if ((student.id % 10) < 6) {
        await db.insert(teamMeetingsTable).values({
          studentId:    student.id,
          meetingType:  "progress_review",
          scheduledDate: checkInDate,
          scheduledTime: minToTime(rand(540, 780)),
          location:     "Room 101 – Conference",
          status:       "completed",
          schoolYearId: syId,
          consentStatus: "obtained",
          outcome: "Progress review completed. Team reviewed data and no amendments needed at this time.",
          minutesFinalized: true,
          attendees: [
            { name: `${caseManager?.firstName ?? ""} ${caseManager?.lastName ?? ""}`, role: "Case Manager" },
            { name: `${student.firstName} ${student.lastName}'s Parent/Guardian`, role: "Parent" },
          ],
          duration: rand(20, 40),
        });
        totalMeetings++;
      }
    }

    // ── D. Progress reports ───────────────────────────────────────────────────

    const progressPeriods = [
      { year: "2023-2024", period: "Q2 2023-24", start: "2024-01-06", end: "2024-03-14" },
      { year: "2023-2024", period: "Q3 2023-24", start: "2024-03-15", end: "2024-06-14" },
      { year: "2024-2025", period: "Q1 2024-25", start: "2024-09-03", end: "2024-11-22" },
      { year: "2024-2025", period: "Q2 2024-25", start: "2024-11-25", end: "2025-02-14" },
      { year: "2024-2025", period: "Q3 2024-25", start: "2025-02-15", end: "2025-05-16" },
      { year: "2024-2025", period: "Q4 2024-25", start: "2025-05-19", end: "2025-06-13" },
    ];

    for (const pp of progressPeriods) {
      const syId = yearMap.get(`${districtId}-${pp.year}`);
      if (!syId) continue;

      const progressRate = deliveryRate(scenario,
        pp.year === "2023-2024" ? "2324" :
        pp.start < "2025-01-01" ? "2425_h1" : "2425_h2"
      );
      const pctInt = Math.round(progressRate * 100);

      const goalProgressEntries = reqs.slice(0, 3).map((r, idx) => ({
        goalNumber: idx + 1,
        area: GOAL_TEMPLATES[r.serviceTypeId ?? 33]?.[0]?.area ?? "Services",
        progress: pick(["Emerging", "Developing", "Progressing", "Mastered"]),
        percentTowardCriterion: Math.min(100, pctInt + rand(-10, 10)),
        narrative: pick([
          `Student is making ${pick(["consistent", "variable but overall positive", "steady", "emerging"])} progress toward this goal. Data indicates movement toward criterion.`,
          `Performance data shows ${pick(["improvement", "stabilization", "gradual gains", "emerging skill"])}. Continue current intervention approach.`,
          `Goal area addressed ${pick(["weekly", "2x per week", "daily"])}. Student demonstrates ${pick(["80%", "70%", "75%"])} accuracy in structured settings.`,
        ]),
      }));

      await db.insert(progressReportsTable).values({
        studentId:     student.id,
        reportingPeriod: pp.period,
        periodStart:   pp.start,
        periodEnd:     pp.end,
        preparedBy:    caseManager?.id ?? adminStaff.id,
        status:        "finalized",
        goalProgress:  goalProgressEntries as any,
        overallSummary: `${student.firstName} ${pick(["is making progress toward", "continues to work on", "has demonstrated growth in", "is developing skills related to"])} IEP goals. Overall service delivery for this period was approximately ${pctInt}% of required minutes.`,
        serviceDeliverySummary: `Services were delivered at ${pctInt}% of the required frequency during this reporting period. ${
          pctInt >= 90 ? "Student received all required services." :
          pctInt >= 75 ? "Minor service gaps occurred due to absences and scheduling." :
          "Service gaps noted; compensatory services may be warranted."
        }`,
        recommendations: pick([
          "Continue current IEP goals and service delivery plan.",
          "Consider reviewing goals at next annual meeting to adjust targets based on progress data.",
          "Team recommends continued focus on generalization of skills across settings.",
          "Recommend adding supplemental practice activities to address identified gaps.",
        ]),
        parentNotes: "Parent was notified of progress report and provided a copy.",
        iepStartDate: pp.year === "2023-2024" ? "2023-09-05" : "2024-09-03",
        iepEndDate:   pp.year === "2023-2024" ? "2024-08-31" : "2025-08-31",
      });
      totalProgressReports++;
    }

    // ── E. Evaluations (for ~25% of students) ────────────────────────────────

    if ((student.id % 4) === 0) {
      const evalDate = (student.id % 8) < 4 ? "2023-11-15" : "2024-10-22";
      const yearLabel = evalDate < "2024-09-01" ? "2023-2024" : "2024-2025";
      const syId = yearMap.get(`${districtId}-${yearLabel}`);
      const evalType = (student.id % 8) < 4 ? "re_evaluation" : "initial";
      const leadEvaluator = providerStaff[0] ?? adminStaff;

      await db.insert(evaluationsTable).values({
        studentId:       student.id,
        evaluationType:  evalType,
        evaluationAreas: ["Cognitive", "Academic Achievement", "Social-Emotional", "Adaptive Behavior"].slice(0, rand(2, 4)) as any,
        teamMembers:     [`${caseManager?.firstName ?? ""} ${caseManager?.lastName ?? ""}`, "School Psychologist"] as any,
        leadEvaluatorId: leadEvaluator?.id ?? adminStaff.id,
        startDate:       addDays(evalDate, -30),
        dueDate:         addDays(evalDate, 30),
        completionDate:  evalDate,
        meetingDate:     addDays(evalDate, 14),
        status:          "completed",
        reportSummary:   `${evalType === "re_evaluation" ? "Triennial re-evaluation" : "Initial evaluation"} completed. Student continues to demonstrate need for special education services. Eligibility confirmed.`,
        notes:           "All required evaluation components completed within the 60-day timeline.",
      });
      totalEvaluations++;
    }

    // ── F. Compensatory obligations for shortfall/urgent scenarios ────────────

    if (["shortfall", "compensatory_risk", "urgent"].includes(scenario)) {
      for (const req of reqs.slice(0, 2)) {
        const minutesOwed = rand(30, 180);
        const syId = yearMap.get(`${districtId}-2023-2024`);
        if (!syId) continue;
        await db.insert(compensatoryObligationsTable).values({
          studentId:          student.id,
          serviceRequirementId: req.id,
          periodStart:        "2024-01-01",
          periodEnd:          "2024-06-14",
          minutesOwed,
          minutesDelivered:   Math.round(minutesOwed * randf(0.0, 0.6)),
          status:             rand(0, 1) ? "in_progress" : "completed",
          source:             "auto_calculated",
          notes:              `Service gap identified during ${scenario} compliance review. ${minutesOwed} minutes of compensatory services required.`,
          agreedDate:         "2024-06-01",
        });
        totalCompObligs++;
      }

      // Some carry-over from 2024-25
      if (scenario === "urgent" || scenario === "compensatory_risk") {
        const req = reqs[0];
        if (req) {
          const minutesOwed = rand(60, 240);
          const syId = yearMap.get(`${districtId}-2024-2025`);
          if (syId) {
            await db.insert(compensatoryObligationsTable).values({
              studentId:          student.id,
              serviceRequirementId: req.id,
              periodStart:        "2024-09-01",
              periodEnd:          "2025-01-31",
              minutesOwed,
              minutesDelivered:   0,
              status:             "pending",
              source:             "auto_calculated",
              notes:              `Ongoing service gap identified through compliance monitoring. ${minutesOwed} compensatory minutes owed.`,
            });
            totalCompObligs++;
          }
        }
      }
    }
  }

  console.log(`[backfill] ✓ Complete:`);
  console.log(`  IEP documents:          ${totalIepDocs}`);
  console.log(`  IEP goals:              ${totalGoals}`);
  console.log(`  Sessions:               ${totalSessions}`);
  console.log(`  Team meetings:          ${totalMeetings}`);
  console.log(`  Progress reports:       ${totalProgressReports}`);
  console.log(`  Evaluations:            ${totalEvaluations}`);
  console.log(`  Comp obligations:       ${totalCompObligs}`);
}

// ── Helper: pick N items spread evenly across arr ────────────────────────────

function pickSpread<T>(arr: T[], n: number): T[] {
  if (n <= 0 || arr.length === 0) return [];
  if (n >= arr.length) return [...arr];
  const result: T[] = [];
  const step = arr.length / n;
  for (let i = 0; i < n; i++) {
    const idx = Math.min(Math.floor(i * step + Math.random() * step * 0.6), arr.length - 1);
    result.push(arr[idx]);
  }
  return result;
}
