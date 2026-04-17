import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * Build a `(1,2,3)`-style SQL fragment for an IN-clause from trusted integer
 * IDs (always sourced from our own DB). Avoids drizzle's array-binding quirks
 * where `${arr}::int[]` can fail to cast in some contexts.
 */
function intList(ids: number[]) {
  if (ids.length === 0) return sql`(NULL)`;
  return sql.raw(`(${ids.map((n) => Number(n) | 0).join(",")})`);
}

/** ARRAY[1,2,3]::int[] literal built from trusted ids (avoids parameter binding). */
function intArrayLit(ids: number[]) {
  if (ids.length === 0) return sql.raw(`ARRAY[]::int[]`);
  return sql.raw(`ARRAY[${ids.map((n) => Number(n) | 0).join(",")}]::int[]`);
}

/**
 * Comprehensive demo-data backfill. Ensures every student in scope has:
 *   • One target (program OR behavior, chosen by goal_area) per active IEP goal
 *   • 90 days of data_sessions with start/end times
 *   • Data points (program_data / behavior_data) for every (session × target)
 *     with realistic baseline → goal progression
 *   • Supporting clinical content: FBA + BIP for behavior-heavy students,
 *     medical alerts, parent messages
 *
 * All operations are idempotent (NOT EXISTS / column-null guards) so the
 * helper can be re-run safely after partial failures, after new students
 * are added, or after a fresh seed.
 *
 * Used by:
 *   • seed-demo-district.ts (Step 21) — full demo backfill
 *   • seed-sample-data.ts — fills sample-seeded students
 *   • routes/admin/sample-data.ts — on-demand "populate this student" repair
 */

const BEHAVIOR_GOAL_AREAS = new Set([
  "Social-Emotional",
  "Self-Regulation",
  "Behavior/ABA",
  "Behavior Consultation",
]);

export type BackfillStats = {
  programTargetsCreated: number;
  behaviorTargetsCreated: number;
  goalsLinkedToProgram: number;
  goalsLinkedToBehavior: number;
  sessionsCreated: number;
  sessionTimesAdded: number;
  programDataPoints: number;
  behaviorDataPoints: number;
  fbasCreated: number;
  bipsCreated: number;
  medicalAlertsCreated: number;
  parentMessagesCreated: number;
};

const EMPTY_STATS = (): BackfillStats => ({
  programTargetsCreated: 0,
  behaviorTargetsCreated: 0,
  goalsLinkedToProgram: 0,
  goalsLinkedToBehavior: 0,
  sessionsCreated: 0,
  sessionTimesAdded: 0,
  programDataPoints: 0,
  behaviorDataPoints: 0,
  fbasCreated: 0,
  bipsCreated: 0,
  medicalAlertsCreated: 0,
  parentMessagesCreated: 0,
});

const addStats = (a: BackfillStats, b: BackfillStats): BackfillStats => ({
  programTargetsCreated: a.programTargetsCreated + b.programTargetsCreated,
  behaviorTargetsCreated: a.behaviorTargetsCreated + b.behaviorTargetsCreated,
  goalsLinkedToProgram: a.goalsLinkedToProgram + b.goalsLinkedToProgram,
  goalsLinkedToBehavior: a.goalsLinkedToBehavior + b.goalsLinkedToBehavior,
  sessionsCreated: a.sessionsCreated + b.sessionsCreated,
  sessionTimesAdded: a.sessionTimesAdded + b.sessionTimesAdded,
  programDataPoints: a.programDataPoints + b.programDataPoints,
  behaviorDataPoints: a.behaviorDataPoints + b.behaviorDataPoints,
  fbasCreated: a.fbasCreated + b.fbasCreated,
  bipsCreated: a.bipsCreated + b.bipsCreated,
  medicalAlertsCreated: a.medicalAlertsCreated + b.medicalAlertsCreated,
  parentMessagesCreated: a.parentMessagesCreated + b.parentMessagesCreated,
});

/* ──────────────────────────────────────────────────────────────────────── */
/* Per-goal target creation (1:1)                                            */
/* ──────────────────────────────────────────────────────────────────────── */

async function createTargetsPerGoal(studentIds: number[]): Promise<{
  programTargetsCreated: number;
  behaviorTargetsCreated: number;
  goalsLinkedToProgram: number;
  goalsLinkedToBehavior: number;
}> {
  if (studentIds.length === 0) {
    return {
      programTargetsCreated: 0,
      behaviorTargetsCreated: 0,
      goalsLinkedToProgram: 0,
      goalsLinkedToBehavior: 0,
    };
  }

  // Bulk path: create one program_target per non-behavior goal and one
  // behavior_target per behavior goal, then link each goal to its newly
  // created target via row-number alignment of insertion order ↔ source rows.
  const behaviorAreasLit = sql.raw(
    `(${[...BEHAVIOR_GOAL_AREAS].map((a) => `'${a.replace(/'/g, "''")}'`).join(",")})`,
  );

  const ptResult = await db.execute<{ goal_id: number; target_id: number }>(sql`
    WITH unlinked AS (
      SELECT id, student_id, goal_area, COALESCE(annual_goal, goal_area) AS gname,
             ROW_NUMBER() OVER (ORDER BY id) AS rn
      FROM iep_goals
      WHERE active = true
        AND program_target_id IS NULL
        AND behavior_target_id IS NULL
        AND goal_area NOT IN ${behaviorAreasLit}
        AND student_id IN ${intList(studentIds)}
    ),
    inserted AS (
      INSERT INTO program_targets
        (student_id, name, description, program_type, domain,
         target_criterion, mastery_criterion_percent,
         current_prompt_level, active)
      SELECT
        student_id,
        LEFT(gname, 200),
        'Discrete-trial program for: ' || LEFT(gname, 150),
        'discrete_trial',
        goal_area,
        '80% across 3 consecutive sessions',
        80,
        'independent',
        true
      FROM unlinked
      ORDER BY rn
      RETURNING id, student_id
    ),
    inserted_ranked AS (
      SELECT id AS target_id, student_id,
             ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY id) AS rn
      FROM inserted
    ),
    unlinked_ranked AS (
      SELECT id AS goal_id, student_id,
             ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY id) AS rn
      FROM unlinked
    ),
    pairs AS (
      SELECT u.goal_id, i.target_id
      FROM unlinked_ranked u
      JOIN inserted_ranked i
        ON i.student_id = u.student_id AND i.rn = u.rn
    ),
    upd AS (
      UPDATE iep_goals g
      SET program_target_id = p.target_id
      FROM pairs p
      WHERE g.id = p.goal_id
      RETURNING g.id AS goal_id, p.target_id
    )
    SELECT * FROM upd
  `);

  const btResult = await db.execute<{ goal_id: number; target_id: number }>(sql`
    WITH unlinked AS (
      SELECT id, student_id, goal_area, COALESCE(annual_goal, goal_area) AS gname,
             ROW_NUMBER() OVER (ORDER BY id) AS rn
      FROM iep_goals
      WHERE active = true
        AND program_target_id IS NULL
        AND behavior_target_id IS NULL
        AND goal_area IN ${behaviorAreasLit}
        AND student_id IN ${intList(studentIds)}
    ),
    inserted AS (
      INSERT INTO behavior_targets
        (student_id, name, description, measurement_type, target_direction,
         baseline_value, goal_value, tracking_method, active)
      SELECT
        student_id,
        LEFT(gname, 200),
        'Tracks progress for: ' || LEFT(gname, 150),
        'percentage',
        'increase',
        (30 + floor(random() * 20))::numeric,
        (80 + floor(random() * 15))::numeric,
        'per_session',
        true
      FROM unlinked
      ORDER BY rn
      RETURNING id, student_id
    ),
    inserted_ranked AS (
      SELECT id AS target_id, student_id,
             ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY id) AS rn
      FROM inserted
    ),
    unlinked_ranked AS (
      SELECT id AS goal_id, student_id,
             ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY id) AS rn
      FROM unlinked
    ),
    pairs AS (
      SELECT u.goal_id, i.target_id
      FROM unlinked_ranked u
      JOIN inserted_ranked i
        ON i.student_id = u.student_id AND i.rn = u.rn
    ),
    upd AS (
      UPDATE iep_goals g
      SET behavior_target_id = p.target_id
      FROM pairs p
      WHERE g.id = p.goal_id
      RETURNING g.id AS goal_id, p.target_id
    )
    SELECT * FROM upd
  `);

  const ptCount = ptResult.rowCount ?? 0;
  const btCount = btResult.rowCount ?? 0;
  return {
    programTargetsCreated: ptCount,
    behaviorTargetsCreated: btCount,
    goalsLinkedToProgram: ptCount,
    goalsLinkedToBehavior: btCount,
  };
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Sessions (with start/end times) + data points                             */
/* ──────────────────────────────────────────────────────────────────────── */

async function createSessionsAndData(
  studentIds: number[],
  staffPool: number[],
): Promise<{
  sessionsCreated: number;
  sessionTimesAdded: number;
  programDataPoints: number;
  behaviorDataPoints: number;
}> {
  if (studentIds.length === 0 || staffPool.length === 0) {
    return {
      sessionsCreated: 0,
      sessionTimesAdded: 0,
      programDataPoints: 0,
      behaviorDataPoints: 0,
    };
  }

  // Idempotent per (student, date) — fills any missing dates without dups.
  // 180-day window, weekdays only (skip Sat=6/Sun=0). Yields ~128 sessions
  // per student which, combined with ~22 targets each, lands every student
  // around 2.5–3k data points.
  const sessionsResult = await db.execute(sql`
    WITH session_dates AS (
      SELECT d::date AS d
      FROM generate_series(
        (CURRENT_DATE - INTERVAL '180 days')::date,
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS d
      WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
    ),
    candidates AS (
      -- Materialize one random start-minute offset (0..345 in 15-min steps,
      -- so start ranges 09:00..14:45) per (student,date) so end_time can be
      -- derived as start + 30 minutes deterministically.
      SELECT s.student_id, sd.d,
             (floor(random() * 24)::int * 15) AS start_offset_min
      FROM (SELECT unnest(${intArrayLit(studentIds)}) AS student_id) s
      CROSS JOIN session_dates sd
    )
    INSERT INTO data_sessions
      (student_id, staff_id, session_date, start_time, end_time, session_type, notes)
    SELECT
      c.student_id,
      (${intArrayLit(staffPool)})[1 + floor(random() * ${staffPool.length})::int],
      c.d::text,
      TO_CHAR((TIME '09:00' + (c.start_offset_min * INTERVAL '1 minute')), 'HH24:MI'),
      TO_CHAR((TIME '09:00' + ((c.start_offset_min + 30) * INTERVAL '1 minute')), 'HH24:MI'),
      'direct',
      'Sample session'
    FROM candidates c
    WHERE NOT EXISTS (
      SELECT 1 FROM data_sessions existing
      WHERE existing.student_id = c.student_id
        AND existing.session_date = c.d::text
        AND existing.notes = 'Sample session'
    )
  `);

  // Backfill start/end times on pre-existing sample sessions that are missing them.
  // Uses a derived random offset materialized once per row so start/end stay aligned.
  const timesResult = await db.execute(sql`
    UPDATE data_sessions ds
    SET start_time = nt.new_start,
        end_time   = nt.new_end
    FROM (
      SELECT id,
             TO_CHAR((TIME '09:00' + (m * INTERVAL '1 minute')), 'HH24:MI') AS new_start,
             TO_CHAR((TIME '09:00' + ((m + 30) * INTERVAL '1 minute')), 'HH24:MI') AS new_end
      FROM (
        SELECT id, (floor(random() * 24)::int * 15) AS m
        FROM data_sessions
        WHERE student_id IN ${intList(studentIds)}
          AND notes = 'Sample session'
          AND (
            start_time IS NULL OR end_time IS NULL
            OR start_time !~ '^[0-2][0-9]:[0-5][0-9]$'
            OR end_time   !~ '^[0-2][0-9]:[0-5][0-9]$'
            OR end_time::time <= start_time::time
            OR (end_time::time - start_time::time) <> INTERVAL '30 minutes'
          )
      ) src
    ) nt
    WHERE ds.id = nt.id
  `);

  // Program data — one row per (sample session × program_target).
  //
  // Trajectory varies per target so the demo doesn't look uniformly
  // "everything is on track":
  //   bucket = pt.id % 10
  //     0..5  (60%)  PROGRESSING — improves over the 180-day window
  //     6..7  (20%)  REGRESSING  — starts ok, drifts downward
  //     8..9  (20%)  INSUFFICIENT — only data in the most recent 14 days
  //
  // `progress` is normalized 0..1 across the window (1.0 = today,
  // 0.0 = 180 days ago). Random jitter keeps the lines noisy/realistic.
  const programDataResult = await db.execute(sql`
    INSERT INTO program_data
      (data_session_id, program_target_id, trials_correct, trials_total,
       percent_correct, prompt_level_used, notes)
    SELECT
      ds.id, pt.id,
      CASE bucket
        WHEN 0 THEN GREATEST(0, LEAST(10, ROUND(4 + progress * 5 + (random()*2 - 1))))::int
        WHEN 1 THEN GREATEST(0, LEAST(10, ROUND(8 - progress * 5 + (random()*2 - 1))))::int
        ELSE        GREATEST(0, LEAST(10, ROUND(5 + progress * 4 + (random()*2 - 1))))::int
      END,
      10,
      CASE bucket
        WHEN 0 THEN GREATEST(20, LEAST(100, ROUND(40 + progress * 50 + (random()*10 - 5))))::numeric
        WHEN 1 THEN GREATEST(20, LEAST(100, ROUND(80 - progress * 45 + (random()*10 - 5))))::numeric
        ELSE        GREATEST(20, LEAST(100, ROUND(50 + progress * 40 + (random()*10 - 5))))::numeric
      END,
      'independent',
      'Sample data point'
    FROM data_sessions ds
    JOIN program_targets pt ON pt.student_id = ds.student_id AND pt.active = true
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN (pt.id % 10) < 6 THEN 0   -- progressing
          WHEN (pt.id % 10) < 8 THEN 1   -- regressing
          ELSE 2                         -- insufficient
        END                                     AS bucket,
        ((180 - (CURRENT_DATE - ds.session_date::date))::numeric / 180.0) AS progress,
        (CURRENT_DATE - ds.session_date::date)  AS days_ago
    ) calc
    WHERE ds.notes = 'Sample session'
      AND ds.student_id IN ${intList(studentIds)}
      AND (bucket <> 2 OR days_ago <= 14)  -- insufficient bucket: only last 14 days
      AND NOT EXISTS (
        SELECT 1 FROM program_data pd2
        WHERE pd2.data_session_id = ds.id AND pd2.program_target_id = pt.id
      )
  `);

  // Behavior data — same trajectory bucketing (by bt.id % 10).
  // For target_direction='increase': progressing = baseline → goal,
  // regressing = drifts back from goal toward baseline.
  // For 'decrease': progressing = baseline → lower goal,
  // regressing = climbs back up from goal toward baseline.
  const behaviorDataResult = await db.execute(sql`
    INSERT INTO behavior_data
      (data_session_id, behavior_target_id, value, notes)
    SELECT
      ds.id, bt.id,
      CASE
        WHEN bt.target_direction = 'increase' THEN
          GREATEST(0, LEAST(100,
            CASE bucket
              WHEN 1 THEN  -- regressing: started near goal, drifts back
                COALESCE(bt.goal_value, 85)::numeric -
                  (COALESCE(bt.goal_value, 85)::numeric - COALESCE(bt.baseline_value, 30)::numeric)
                  * progress + (random()*8 - 4)
              ELSE        -- progressing / insufficient: baseline → goal
                COALESCE(bt.baseline_value, 30)::numeric +
                  (COALESCE(bt.goal_value, 85)::numeric - COALESCE(bt.baseline_value, 30)::numeric)
                  * progress + (random()*8 - 4)
            END
          ))::numeric
        ELSE
          GREATEST(0,
            CASE bucket
              WHEN 1 THEN  -- regressing decrease: drifts back up toward baseline
                COALESCE(bt.goal_value, 2)::numeric +
                  (COALESCE(bt.baseline_value, 8)::numeric - COALESCE(bt.goal_value, 2)::numeric)
                  * progress + (random()*2 - 1)
              ELSE
                COALESCE(bt.baseline_value, 8)::numeric -
                  (COALESCE(bt.baseline_value, 8)::numeric - COALESCE(bt.goal_value, 2)::numeric)
                  * progress + (random()*2 - 1)
            END
          )::numeric
      END,
      'Sample data point'
    FROM data_sessions ds
    JOIN behavior_targets bt ON bt.student_id = ds.student_id AND bt.active = true
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN (bt.id % 10) < 6 THEN 0
          WHEN (bt.id % 10) < 8 THEN 1
          ELSE 2
        END                                     AS bucket,
        ((180 - (CURRENT_DATE - ds.session_date::date))::numeric / 180.0) AS progress,
        (CURRENT_DATE - ds.session_date::date)  AS days_ago
    ) calc
    WHERE ds.notes = 'Sample session'
      AND ds.student_id IN ${intList(studentIds)}
      AND (bucket <> 2 OR days_ago <= 14)
      AND NOT EXISTS (
        SELECT 1 FROM behavior_data bd2
        WHERE bd2.data_session_id = ds.id AND bd2.behavior_target_id = bt.id
      )
  `);

  return {
    sessionsCreated: sessionsResult.rowCount ?? 0,
    sessionTimesAdded: timesResult.rowCount ?? 0,
    programDataPoints: programDataResult.rowCount ?? 0,
    behaviorDataPoints: behaviorDataResult.rowCount ?? 0,
  };
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Supporting clinical content                                               */
/* ──────────────────────────────────────────────────────────────────────── */

async function createSupportingContent(
  studentIds: number[],
  staffPool: number[],
): Promise<{
  fbasCreated: number;
  bipsCreated: number;
  medicalAlertsCreated: number;
  parentMessagesCreated: number;
}> {
  if (studentIds.length === 0) {
    return {
      fbasCreated: 0,
      bipsCreated: 0,
      medicalAlertsCreated: 0,
      parentMessagesCreated: 0,
    };
  }

  // FBA — one per student that has a behavior target, if missing.
  const fbaResult = await db.execute(sql`
    INSERT INTO fbas (
      student_id, conducted_by, target_behavior, operational_definition,
      status, referral_date, start_date, completion_date,
      setting_description, indirect_methods, indirect_findings,
      direct_methods, direct_findings, hypothesized_function,
      hypothesis_narrative, recommendations
    )
    SELECT DISTINCT ON (s.id)
      s.id,
      ${staffPool.length > 0 ? staffPool[0] : null},
      bt.name,
      'Defined as observable, repeatable behavior occurring across school settings.',
      'completed',
      (CURRENT_DATE - INTERVAL '120 days')::date,
      (CURRENT_DATE - INTERVAL '110 days')::date,
      (CURRENT_DATE - INTERVAL '60 days')::date,
      'Self-contained classroom, mainstream specials, and lunch/recess.',
      'Teacher and parent interviews; record review; functional assessment screening tool (FAST).',
      'Behavior occurs most frequently during non-preferred academic tasks and unstructured transitions.',
      'A-B-C narrative recording across three sessions; structured descriptive assessment.',
      'Antecedent: task demand. Consequence: escape/avoidance via removal from activity.',
      'escape',
      'Behavior is hypothesized to be maintained primarily by escape from non-preferred academic demands, with secondary attention from peers.',
      'Recommend BIP focused on differential reinforcement of alternative behavior (DRA), task modifications, and a functional communication response.'
    FROM (SELECT unnest(${intArrayLit(studentIds)}) AS id) s
    JOIN behavior_targets bt ON bt.student_id = s.id AND bt.active = true
    WHERE NOT EXISTS (SELECT 1 FROM fbas f WHERE f.student_id = s.id)
  `);

  // BIP — one per student that has an FBA but no BIP yet.
  const bipResult = await db.execute(sql`
    INSERT INTO behavior_intervention_plans (
      student_id, fba_id, created_by, status, target_behavior,
      operational_definition, hypothesized_function, replacement_behaviors,
      prevention_strategies, teaching_strategies, consequence_strategies,
      reinforcement_schedule, crisis_plan, data_collection_method,
      progress_criteria, effective_date, review_date, behavior_target_id
    )
    SELECT
      f.student_id, f.id,
      ${staffPool.length > 0 ? staffPool[0] : null},
      'active',
      f.target_behavior,
      f.operational_definition,
      COALESCE(f.hypothesized_function, 'escape'),
      'Functional communication response: requesting a break using a card or verbal "break please".',
      'Visual schedule, advance warnings before transitions, embedded choice within tasks, scheduled movement breaks every 15 minutes.',
      'Direct instruction of replacement behavior with rehearsal; modeling and role-play; precorrection prior to high-risk routines.',
      'Honor break requests immediately when functional response used; planned ignoring of low-intensity escape behavior; redirection to replacement.',
      'Variable ratio reinforcement (VR3) for replacement behavior; token economy with daily backup reinforcer.',
      'If imminent danger to self/others: clear area, summon trained staff, follow restraint policy. Debrief within 24 hours.',
      'Frequency count per session by RBT; weekly trend review by BCBA.',
      '50% reduction in target behavior across 4 consecutive weeks; replacement behavior used independently in 80% of identified opportunities.',
      (CURRENT_DATE - INTERVAL '55 days')::date,
      (CURRENT_DATE + INTERVAL '30 days')::date,
      (SELECT bt.id FROM behavior_targets bt WHERE bt.student_id = f.student_id AND bt.active = true ORDER BY bt.id LIMIT 1)
    FROM fbas f
    WHERE f.student_id IN ${intList(studentIds)}
      AND NOT EXISTS (SELECT 1 FROM behavior_intervention_plans bip WHERE bip.student_id = f.student_id)
  `);

  // Medical alerts — give each student a baseline "no known allergies" or a benign med entry,
  // only if they have zero alerts on file.
  const medResult = await db.execute(sql`
    INSERT INTO medical_alerts (
      student_id, alert_type, description, severity,
      treatment_notes, epi_pen_on_file, notify_all_staff
    )
    SELECT
      s.id,
      (ARRAY['allergy','medication','condition']::medical_alert_type[])[1 + floor(random() * 3)::int],
      CASE floor(random() * 4)::int
        WHEN 0 THEN 'Mild seasonal allergies. Antihistamine PRN.'
        WHEN 1 THEN 'Asthma. Albuterol inhaler in nurse office.'
        WHEN 2 THEN 'ADHD — methylphenidate dosed at 12:00pm in nurse office.'
        ELSE 'Lactose intolerance. Avoid dairy at lunch service.'
      END,
      (ARRAY['mild','moderate']::medical_alert_severity[])[1 + floor(random() * 2)::int],
      'Notify nurse if symptoms present. See full health plan in document tab.',
      false,
      false
    FROM (SELECT unnest(${intArrayLit(studentIds)}) AS id) s
    WHERE NOT EXISTS (SELECT 1 FROM medical_alerts m WHERE m.student_id = s.id)
  `);

  // Parent messages — seed a small thread per student/guardian if none exist.
  const parentMsgResult = await db.execute(sql`
    INSERT INTO parent_messages (
      student_id, sender_type, sender_staff_id, recipient_guardian_id,
      category, subject, body, read_at
    )
    SELECT
      g.student_id, 'staff',
      ${staffPool.length > 0 ? staffPool[0] : null},
      g.id, 'general',
      'Welcome to the new term',
      'Hi ' || split_part(g.name, ' ', 1) || ',' || E'\n\n' ||
      'Just a quick note to introduce myself as your child''s case manager this term. ' ||
      'I will be sending weekly updates on progress toward IEP goals. Please reach out anytime with questions.' ||
      E'\n\nBest regards,\nThe Trellis team',
      (NOW() - INTERVAL '14 days')
    FROM guardians g
    WHERE g.student_id IN ${intList(studentIds)}
      AND g.contact_priority = 1
      AND NOT EXISTS (
        SELECT 1 FROM parent_messages pm WHERE pm.student_id = g.student_id
      )
  `);

  return {
    fbasCreated: fbaResult.rowCount ?? 0,
    bipsCreated: bipResult.rowCount ?? 0,
    medicalAlertsCreated: medResult.rowCount ?? 0,
    parentMessagesCreated: parentMsgResult.rowCount ?? 0,
  };
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Public entry points                                                       */
/* ──────────────────────────────────────────────────────────────────────── */

async function staffPoolForStudents(studentIds: number[]): Promise<number[]> {
  if (studentIds.length === 0) return [];
  const res = await db.execute<{ id: number }>(sql`
    SELECT DISTINCT st.id
    FROM staff st
    WHERE st.school_id IN (
      SELECT school_id FROM students WHERE id IN ${intList(studentIds)}
    )
  `);
  return res.rows.map((r) => r.id);
}

/**
 * Backfill comprehensive demo data for an explicit set of student IDs.
 * Use this when you know exactly which students should be populated (e.g.,
 * the rows just inserted by a sample-data seeder) so the backfill cannot
 * accidentally touch unrelated real-tenant students.
 */
export async function backfillGoalProgressForStudents(
  studentIds: number[],
): Promise<BackfillStats> {
  if (studentIds.length === 0) return EMPTY_STATS();
  const staffPool = await staffPoolForStudents(studentIds);

  const CHUNK = 25;
  let stats = EMPTY_STATS();
  for (let i = 0; i < studentIds.length; i += CHUNK) {
    const slice = studentIds.slice(i, i + CHUNK);
    const t = await createTargetsPerGoal(slice);
    const s = await createSessionsAndData(slice, staffPool);
    const c = await createSupportingContent(slice, staffPool);
    stats = addStats(stats, { ...t, ...s, ...c });
  }
  return stats;
}

/** Backfill comprehensive demo data for a single student. Idempotent. */
export async function backfillFullStudentData(studentId: number): Promise<BackfillStats> {
  return backfillGoalProgressForStudents([studentId]);
}

/** Backfill comprehensive demo data for every student in a district. Idempotent. */
export async function backfillGoalProgressForDistrict(
  districtId: number,
): Promise<BackfillStats> {
  const studentRows = await db.execute<{ id: number }>(sql`
    SELECT id FROM students
    WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${districtId})
  `);
  const studentIds = studentRows.rows.map((r) => r.id);
  if (studentIds.length === 0) return EMPTY_STATS();

  const staffPool = await staffPoolForStudents(studentIds);

  // Process in chunks so very large districts don't try to hold thousands of
  // per-goal INSERTs in flight at once.
  const CHUNK = 25;
  let stats = EMPTY_STATS();
  for (let i = 0; i < studentIds.length; i += CHUNK) {
    const slice = studentIds.slice(i, i + CHUNK);
    const t = await createTargetsPerGoal(slice);
    const s = await createSessionsAndData(slice, staffPool);
    const c = await createSupportingContent(slice, staffPool);
    stats = addStats(stats, {
      ...t,
      ...s,
      ...c,
    });
  }
  return stats;
}
