import { sql } from "drizzle-orm";
import { db } from "./db";

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randf(min: number, max: number) { return min + Math.random() * (max - min); }

/**
 * Per-backfill-run sampled parameters. Every value below is drawn from a
 * broad bound at run time so successive backfills produce visibly different
 * data shapes (history depth, trajectory mix, jitter amplitude, compliance
 * bucket distribution) rather than always landing on the same fixed
 * 60/20/20 + 15/50/25/10 splits with the same ±5pt noise.
 *
 * The values are *bounds* on randomness; nothing here encodes a target
 * outcome. They are documented broad min/max envelopes per Task #416.
 */
type RunParams = {
  /** Days of session history to fabricate. Was a fixed 180. */
  historyDays: number;
  /** Cumulative thresholds (0..100) for trajectory bucket selection on
   *  program/behavior data. Three buckets: progressing / regressing /
   *  insufficient. Was a fixed [60, 80] split. */
  trajectoryBreaks: readonly [number, number];
  /** ±jitter applied to per-session trial counts (was fixed 1.0). */
  trialJitter: number;
  /** ±jitter applied to per-session percent-correct (was fixed 5.0). */
  percentJitter: number;
  /** ±jitter applied to per-session behavior values (was fixed 4.0). */
  behaviorPctJitter: number;
  /** ±jitter applied to per-session behavior frequency counts (was fixed 1.0). */
  behaviorCountJitter: number;
  /** Cumulative thresholds (0..100) for compliance-bucket selection in
   *  tuneComplianceForStudents. Four buckets: over / on-track / behind /
   *  at-risk. Was a fixed [15, 65, 90] split derived from `id % 20`. */
  complianceBreaks: readonly [number, number, number];
  /** Per-bucket [lo, hi] target_pct ranges for compliance tuning. A uniform
   *  random draw inside each band is materialized into _comp_params_tmp once
   *  and reused by both Pass A and Pass B. */
  complianceTargets: {
    over: readonly [number, number];
    onTrack: readonly [number, number];
    behind: readonly [number, number];
    atRisk: readonly [number, number];
  };
};

function sampleRunParams(): RunParams {
  // trajectoryBreaks: progressing fills 40–70%, regressing 15–35%,
  // insufficient gets the remainder.
  const progressing = Math.round(randf(40, 70));
  const regressing = Math.round(randf(15, 35));
  // complianceBreaks: over 5–25%, on-track 35–60%, behind 15–35%,
  // at-risk gets the remainder.
  const over = Math.round(randf(5, 25));
  const onTrack = Math.round(randf(35, 60));
  const behind = Math.round(randf(15, 35));
  return {
    historyDays: rand(120, 240),
    trajectoryBreaks: [progressing, Math.min(100, progressing + regressing)],
    trialJitter: randf(1.0, 3.5),
    percentJitter: randf(5, 20),
    behaviorPctJitter: randf(3, 12),
    behaviorCountJitter: randf(0.5, 2.5),
    complianceBreaks: [
      over,
      Math.min(100, over + onTrack),
      Math.min(100, over + onTrack + behind),
    ],
    complianceTargets: {
      over:    [1.05, 1.30],
      onTrack: [0.82, 1.02],
      behind:  [0.62, 0.84],
      atRisk:  [0.42, 0.65],
    },
  };
}

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
        -- Wider baseline envelope (was: 30..49). Sampled per goal so two
        -- behavior targets in the same student don't share an exact value.
        (10 + floor(random() * 50))::numeric,
        -- Wider goal envelope (was: 80..94).
        (70 + floor(random() * 30))::numeric,
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
  params: RunParams,
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
  // History window is sampled per backfill run (params.historyDays, 120–240).
  // Weekdays only (skip Sat=6/Sun=0).
  const historyDays = params.historyDays;
  const sessionsResult = await db.execute(sql`
    WITH session_dates AS (
      SELECT d::date AS d
      FROM generate_series(
        (CURRENT_DATE - (${historyDays}::int * INTERVAL '1 day'))::date,
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
  // `progress` is normalized 0..1 across the sampled history window.
  // Per-target trajectory (progressing/regressing/insufficient) is
  // materialized via a CTE using random() — each target gets one stable
  // bucket for the lifetime of this INSERT, producing a coherent trend
  // line without any modulo or fixed-split expressions.
  const traj0 = params.trajectoryBreaks[0];
  const traj1 = params.trajectoryBreaks[1];
  const tj = params.trialJitter;
  const pj = params.percentJitter;
  const insufficientWindowDays = rand(10, 28);
  const programDataResult = await db.execute(sql`
    WITH target_buckets AS (
      -- Materialize one random bucket per program_target so all of its
      -- data sessions share a coherent trajectory (no modulo needed).
      SELECT pt.id AS target_id,
        CASE
          WHEN random() < ${traj0 / 100.0} THEN 0   -- progressing
          WHEN random() < ${traj1 / 100.0} THEN 1   -- regressing
          ELSE 2                                     -- insufficient
        END AS bucket
      FROM program_targets pt
      WHERE pt.student_id IN ${intList(studentIds)}
        AND pt.active = true
    )
    INSERT INTO program_data
      (data_session_id, program_target_id, trials_correct, trials_total,
       percent_correct, prompt_level_used, notes)
    SELECT
      ds.id, pt.id,
      CASE tb.bucket
        WHEN 0 THEN GREATEST(0, LEAST(10, ROUND(4 + progress * 5 + (random()*${2 * tj}::numeric - ${tj}::numeric))))::int
        WHEN 1 THEN GREATEST(0, LEAST(10, ROUND(8 - progress * 5 + (random()*${2 * tj}::numeric - ${tj}::numeric))))::int
        ELSE        GREATEST(0, LEAST(10, ROUND(5 + progress * 4 + (random()*${2 * tj}::numeric - ${tj}::numeric))))::int
      END,
      10,
      CASE tb.bucket
        WHEN 0 THEN GREATEST(20, LEAST(100, ROUND(40 + progress * 50 + (random()*${2 * pj}::numeric - ${pj}::numeric))))::numeric
        WHEN 1 THEN GREATEST(20, LEAST(100, ROUND(80 - progress * 45 + (random()*${2 * pj}::numeric - ${pj}::numeric))))::numeric
        ELSE        GREATEST(20, LEAST(100, ROUND(50 + progress * 40 + (random()*${2 * pj}::numeric - ${pj}::numeric))))::numeric
      END,
      'independent',
      'Sample data point'
    FROM data_sessions ds
    JOIN program_targets pt ON pt.student_id = ds.student_id AND pt.active = true
    JOIN target_buckets tb ON tb.target_id = pt.id
    CROSS JOIN LATERAL (
      SELECT
        ((${historyDays} - (CURRENT_DATE - ds.session_date::date))::numeric / ${historyDays}::numeric) AS progress,
        (CURRENT_DATE - ds.session_date::date) AS days_ago
    ) calc
    WHERE ds.notes = 'Sample session'
      AND ds.student_id IN ${intList(studentIds)}
      AND (tb.bucket <> 2 OR days_ago <= ${insufficientWindowDays})
      AND NOT EXISTS (
        SELECT 1 FROM program_data pd2
        WHERE pd2.data_session_id = ds.id AND pd2.program_target_id = pt.id
      )
  `);

  // Behavior data — same CTE-materialized trajectory bucketing as program data.
  // For target_direction='increase': progressing = baseline → goal,
  // regressing = drifts back from goal toward baseline.
  // For 'decrease': progressing = baseline → lower goal,
  // regressing = climbs back up from goal toward baseline.
  // Jitter amplitudes are sampled per backfill run (RunParams).
  const bpj = params.behaviorPctJitter;
  const bcj = params.behaviorCountJitter;
  const behaviorDataResult = await db.execute(sql`
    WITH target_buckets AS (
      -- One random bucket per behavior_target — same target always gets
      -- the same trajectory within this INSERT, no modulo needed.
      SELECT bt.id AS target_id,
        CASE
          WHEN random() < ${traj0 / 100.0} THEN 0   -- progressing
          WHEN random() < ${traj1 / 100.0} THEN 1   -- regressing
          ELSE 2                                     -- insufficient
        END AS bucket
      FROM behavior_targets bt
      WHERE bt.student_id IN ${intList(studentIds)}
        AND bt.active = true
    )
    INSERT INTO behavior_data
      (data_session_id, behavior_target_id, value, notes)
    SELECT
      ds.id, bt.id,
      CASE
        WHEN bt.target_direction = 'increase' THEN
          GREATEST(0, LEAST(100,
            CASE tb.bucket
              WHEN 1 THEN  -- regressing: started near goal, drifts back
                COALESCE(bt.goal_value, 85)::numeric -
                  (COALESCE(bt.goal_value, 85)::numeric - COALESCE(bt.baseline_value, 30)::numeric)
                  * progress + (random()*${2 * bpj}::numeric - ${bpj}::numeric)
              ELSE        -- progressing / insufficient: baseline → goal
                COALESCE(bt.baseline_value, 30)::numeric +
                  (COALESCE(bt.goal_value, 85)::numeric - COALESCE(bt.baseline_value, 30)::numeric)
                  * progress + (random()*${2 * bpj}::numeric - ${bpj}::numeric)
            END
          ))::numeric
        ELSE
          GREATEST(0,
            CASE tb.bucket
              WHEN 1 THEN  -- regressing decrease: drifts back up toward baseline
                COALESCE(bt.goal_value, 2)::numeric +
                  (COALESCE(bt.baseline_value, 8)::numeric - COALESCE(bt.goal_value, 2)::numeric)
                  * progress + (random()*${2 * bcj}::numeric - ${bcj}::numeric)
              ELSE
                COALESCE(bt.baseline_value, 8)::numeric -
                  (COALESCE(bt.baseline_value, 8)::numeric - COALESCE(bt.goal_value, 2)::numeric)
                  * progress + (random()*${2 * bcj}::numeric - ${bcj}::numeric)
            END
          )::numeric
      END,
      'Sample data point'
    FROM data_sessions ds
    JOIN behavior_targets bt ON bt.student_id = ds.student_id AND bt.active = true
    JOIN target_buckets tb ON tb.target_id = bt.id
    CROSS JOIN LATERAL (
      SELECT
        ((${historyDays} - (CURRENT_DATE - ds.session_date::date))::numeric / ${historyDays}::numeric) AS progress,
        (CURRENT_DATE - ds.session_date::date) AS days_ago
    ) calc
    WHERE ds.notes = 'Sample session'
      AND ds.student_id IN ${intList(studentIds)}
      AND (tb.bucket <> 2 OR days_ago <= ${insufficientWindowDays})
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
/* Compliance tuning                                                         */
/* ──────────────────────────────────────────────────────────────────────── */

/**
 * Generate `session_logs` rows so that each demo student lands inside one of
 * four compliance buckets for the current monthly interval, producing a
 * realistic spread instead of a single uniform "everyone behind" picture:
 *
 *   bucket = student.id % 20
 *     0..2  (15%)  OVER 100%  — caught up + makeups, 110..125% delivered
 *     3..12 (50%)  ON TRACK   —  85..100%
 *     13..17 (25%) BEHIND     —  65..85%
 *     18..19 (10%) AT RISK    —  50..65%
 *
 * Idempotent: only inserts the additional minutes needed to close the gap
 * between currently-delivered minutes and the bucket target. Tagged with
 * `notes='Sample minute log'` so the rows are easy to find/clear.
 */
async function tuneComplianceForStudents(
  studentIds: number[],
  staffPool: number[],
  params: RunParams,
): Promise<{
  minuteLogsCreated: number;
  missedLogsCreated: number;
  linkedDataSessions: number;
  linkedDataPoints: number;
}> {
  if (studentIds.length === 0 || staffPool.length === 0) {
    return {
      minuteLogsCreated: 0,
      missedLogsCreated: 0,
      linkedDataSessions: 0,
      linkedDataPoints: 0,
    };
  }

  // ── Pre-pass: materialize per-requirement target_pct using random() ────────
  // Both Pass A (completed sessions) and Pass B (missed sessions) must use
  // identical target_pct per requirement so the two session counts remain
  // coherent (completed + missed = required). We achieve this by sampling
  // target_pct once via random() into a transient temp table, then joining
  // against it in both passes — no modulo expressions or fixed splits.
  const cb0 = params.complianceBreaks[0];
  const cb1 = params.complianceBreaks[1];
  const cb2 = params.complianceBreaks[2];
  const ct = params.complianceTargets;
  await db.execute(sql`DROP TABLE IF EXISTS _comp_params_tmp`);
  await db.execute(sql`
    CREATE TEMP TABLE _comp_params_tmp AS
    SELECT
      sr.id AS req_id,
      CASE
        WHEN r.v < ${cb0 / 100.0} THEN
          ${ct.over[0]}::numeric    + r.w * ${ct.over[1] - ct.over[0]}::numeric
        WHEN r.v < ${cb1 / 100.0} THEN
          ${ct.onTrack[0]}::numeric + r.w * ${ct.onTrack[1] - ct.onTrack[0]}::numeric
        WHEN r.v < ${cb2 / 100.0} THEN
          ${ct.behind[0]}::numeric  + r.w * ${ct.behind[1] - ct.behind[0]}::numeric
        ELSE
          ${ct.atRisk[0]}::numeric  + r.w * ${ct.atRisk[1] - ct.atRisk[0]}::numeric
      END AS target_pct
    FROM service_requirements sr
    CROSS JOIN LATERAL (SELECT random() AS v, random() AS w) r
    WHERE sr.student_id IN ${intList(studentIds)}
      AND sr.active = true
      AND sr.required_minutes > 0
  `);

  // ── Pass A: completed session_logs to hit target_pct of required minutes ──
  const completedRes = await db.execute(sql`
    WITH params AS (
      SELECT
        s.id  AS student_id,
        sr.id AS req_id,
        sr.required_minutes,
        cp.target_pct,
        COALESCE((
          SELECT SUM(sl.duration_minutes)
          FROM session_logs sl
          WHERE sl.service_requirement_id = sr.id
            AND sl.status IN ('completed','makeup')
            AND sl.session_date >= TO_CHAR(date_trunc('month', CURRENT_DATE), 'YYYY-MM-DD')
            AND sl.session_date <= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
        ), 0)::int AS delivered_so_far
      FROM students s
      JOIN service_requirements sr
        ON sr.student_id = s.id AND sr.active = true
      JOIN _comp_params_tmp cp ON cp.req_id = sr.id
      WHERE s.id IN ${intList(studentIds)}
        AND sr.required_minutes > 0
    ),
    needs AS (
      SELECT *,
        GREATEST(0, ROUND(required_minutes * target_pct)::int - delivered_so_far) AS minutes_needed
      FROM params
    ),
    weekdays AS (
      SELECT d::date AS d,
             ROW_NUMBER() OVER (ORDER BY d) - 1 AS rn,
             COUNT(*) OVER ()                   AS total
      FROM generate_series(
        date_trunc('month', CURRENT_DATE)::date,
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS d
      WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
    ),
    plan AS (
      -- One ~30 min session per 30 min of remaining gap. Last session in the
      -- run takes the remainder so we land exactly on target.
      SELECT n.student_id, n.req_id, n.minutes_needed,
             GREATEST(1, CEIL(n.minutes_needed / 30.0)::int) AS num_sessions
      FROM needs n
      WHERE n.minutes_needed > 0
    ),
    schedule AS (
      SELECT
        p.student_id, p.req_id, gs.idx,
        -- Cycle through available weekdays so several sessions can share a
        -- date without trampling each other (one student can have multi
        -- service-type sessions on the same day in real life).
        (SELECT w.d FROM weekdays w
          WHERE w.rn = (gs.idx % (SELECT COUNT(*) FROM weekdays))) AS d,
        -- Last session uses the exact remainder so cumulative inserted
        -- minutes equal minutes_needed precisely (no overshoot).
        CASE
          WHEN gs.idx = p.num_sessions - 1
            THEN p.minutes_needed - (p.num_sessions - 1) * 30
          ELSE 30
        END AS dur
      FROM plan p
      CROSS JOIN LATERAL generate_series(0, p.num_sessions - 1) AS gs(idx)
    )
    INSERT INTO session_logs
      (student_id, service_requirement_id, staff_id, session_date,
       start_time, end_time, duration_minutes, status, notes)
    SELECT
      sched.student_id,
      sched.req_id,
      (${intArrayLit(staffPool)})[1 + (floor(random() * ${staffPool.length})::int)],
      TO_CHAR(sched.d, 'YYYY-MM-DD'),
      -- Spread start times across 8:00–15:30 using session-level hash so
      -- multiple requirements on the same date don't cluster in the same hour.
      LPAD((8 + ((sched.req_id * 7 + sched.idx * 3) % 8))::text, 2, '0') ||
        (CASE WHEN (sched.req_id + sched.idx) % 2 = 0 THEN ':00' ELSE ':30' END),
      LPAD((8 + ((sched.req_id * 7 + sched.idx * 3) % 8))::text, 2, '0') ||
        (CASE WHEN (sched.req_id + sched.idx) % 2 = 0 THEN ':' ELSE ':' END) ||
        LPAD(LEAST(59, (CASE WHEN (sched.req_id + sched.idx) % 2 = 0 THEN 0 ELSE 30 END) + sched.dur)::text, 2, '0'),
      sched.dur,
      'completed',
      'Sample minute log'
    FROM schedule sched
  `);

  // ── Pass B: missed session_logs to fill the gap from target to required ──
  // Joins against _comp_params_tmp so target_pct is identical to Pass A.
  const missedRes = await db.execute(sql`
    WITH params AS (
      SELECT
        s.id  AS student_id,
        sr.id AS req_id,
        sr.required_minutes,
        cp.target_pct
      FROM students s
      JOIN service_requirements sr
        ON sr.student_id = s.id AND sr.active = true
      JOIN _comp_params_tmp cp ON cp.req_id = sr.id
      WHERE s.id IN ${intList(studentIds)}
        AND sr.required_minutes > 0
    ),
    needs AS (
      -- Missed minutes = required - whatever target landed at. For students
      -- already over 100% target, no missed sessions are recorded.
      SELECT student_id, req_id,
        GREATEST(
          0,
          required_minutes - ROUND(required_minutes * target_pct)::int
        ) AS missed_minutes
      FROM params
    ),
    weekdays AS (
      SELECT d::date AS d,
             ROW_NUMBER() OVER (ORDER BY d) - 1 AS rn
      FROM generate_series(
        date_trunc('month', CURRENT_DATE)::date,
        CURRENT_DATE,
        INTERVAL '1 day'
      ) AS d
      WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 5
    ),
    plan AS (
      SELECT n.student_id, n.req_id, n.missed_minutes,
             GREATEST(1, CEIL(n.missed_minutes / 30.0)::int) AS num_sessions
      FROM needs n
      WHERE n.missed_minutes > 0
        AND NOT EXISTS (
          SELECT 1 FROM session_logs sl
          WHERE sl.service_requirement_id = n.req_id
            AND sl.notes = 'Sample missed log'
            AND sl.session_date >= TO_CHAR(date_trunc('month', CURRENT_DATE), 'YYYY-MM-DD')
        )
    ),
    schedule AS (
      SELECT
        p.student_id, p.req_id, gs.idx,
        (SELECT w.d FROM weekdays w
          WHERE w.rn = (gs.idx % (SELECT COUNT(*) FROM weekdays))) AS d,
        CASE
          WHEN gs.idx = p.num_sessions - 1
            THEN p.missed_minutes - (p.num_sessions - 1) * 30
          ELSE 30
        END AS dur
      FROM plan p
      CROSS JOIN LATERAL generate_series(0, p.num_sessions - 1) AS gs(idx)
    ),
    reasons AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS rn,
             COUNT(*) OVER () AS total
      FROM missed_reasons
    )
    INSERT INTO session_logs
      (student_id, service_requirement_id, staff_id, session_date,
       start_time, end_time, duration_minutes, status, missed_reason_id, notes)
    SELECT
      sched.student_id,
      sched.req_id,
      (${intArrayLit(staffPool)})[1 + (floor(random() * ${staffPool.length})::int)],
      TO_CHAR(sched.d, 'YYYY-MM-DD'),
      LPAD((8 + ((sched.req_id * 7 + sched.idx * 3) % 8))::text, 2, '0') ||
        (CASE WHEN (sched.req_id + sched.idx) % 2 = 0 THEN ':00' ELSE ':30' END),
      LPAD((8 + ((sched.req_id * 7 + sched.idx * 3) % 8))::text, 2, '0') ||
        (CASE WHEN (sched.req_id + sched.idx) % 2 = 0 THEN ':' ELSE ':' END) ||
        LPAD(LEAST(59, (CASE WHEN (sched.req_id + sched.idx) % 2 = 0 THEN 0 ELSE 30 END) + sched.dur)::text, 2, '0'),
      sched.dur,
      'missed',
      (SELECT id FROM reasons WHERE rn = ((sched.req_id + sched.idx) % (SELECT total FROM reasons LIMIT 1))),
      'Sample missed log'
    FROM schedule sched
  `);

  // Clean up the transient compliance params table.
  await db.execute(sql`DROP TABLE IF EXISTS _comp_params_tmp`);

  // ── Pass C: link a data_session to every completed sample minute log ──
  const linkRes = await db.execute(sql`
    INSERT INTO data_sessions
      (student_id, staff_id, session_date, start_time, end_time,
       session_log_id, session_type, notes)
    SELECT
      sl.student_id, sl.staff_id, sl.session_date,
      sl.start_time, sl.end_time, sl.id,
      'acquisition', 'Sample data session'
    FROM session_logs sl
    WHERE sl.notes = 'Sample minute log'
      AND sl.student_id IN ${intList(studentIds)}
      AND NOT EXISTS (
        SELECT 1 FROM data_sessions ds WHERE ds.session_log_id = sl.id
      )
  `);

  // ── Pass D: program_data + behavior_data points inside each linked session
  const progDataRes = await db.execute(sql`
    WITH new_sessions AS (
      SELECT ds.id AS data_session_id, ds.student_id
      FROM data_sessions ds
      WHERE ds.notes = 'Sample data session'
        AND ds.student_id IN ${intList(studentIds)}
        AND NOT EXISTS (
          SELECT 1 FROM program_data pd WHERE pd.data_session_id = ds.id
        )
    ),
    target_pick AS (
      -- Pick one program_target per (student, session) deterministically.
      SELECT DISTINCT ON (ns.data_session_id)
        ns.data_session_id, pt.id AS target_id
      FROM new_sessions ns
      JOIN program_targets pt
        ON pt.student_id = ns.student_id AND pt.active = true
      ORDER BY ns.data_session_id, pt.id
    )
    INSERT INTO program_data
      (data_session_id, program_target_id, trials_correct, trials_total,
       prompted, percent_correct, notes)
    SELECT
      tp.data_session_id, tp.target_id,
      7 + floor(random() * 4)::int,
      10,
      floor(random() * 3)::int,
      ROUND((65 + random() * 30)::numeric, 1),
      'Sample minute-log data point'
    FROM target_pick tp
  `);

  const behavDataRes = await db.execute(sql`
    WITH new_sessions AS (
      SELECT ds.id AS data_session_id, ds.student_id
      FROM data_sessions ds
      WHERE ds.notes = 'Sample data session'
        AND ds.student_id IN ${intList(studentIds)}
        AND NOT EXISTS (
          SELECT 1 FROM behavior_data bd WHERE bd.data_session_id = ds.id
        )
    ),
    target_pick AS (
      SELECT DISTINCT ON (ns.data_session_id)
        ns.data_session_id, bt.id AS target_id
      FROM new_sessions ns
      JOIN behavior_targets bt
        ON bt.student_id = ns.student_id AND bt.active = true
      ORDER BY ns.data_session_id, bt.id
    )
    INSERT INTO behavior_data
      (data_session_id, behavior_target_id, value, notes)
    SELECT
      tp.data_session_id, tp.target_id,
      ROUND((1 + random() * 9)::numeric, 1),
      'Sample minute-log data point'
    FROM target_pick tp
  `);

  return {
    minuteLogsCreated: completedRes.rowCount ?? 0,
    missedLogsCreated: missedRes.rowCount ?? 0,
    linkedDataSessions: linkRes.rowCount ?? 0,
    linkedDataPoints: (progDataRes.rowCount ?? 0) + (behavDataRes.rowCount ?? 0),
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
  const params = sampleRunParams();

  const CHUNK = 25;
  let stats = EMPTY_STATS();
  let minuteLogsCreated = 0;
  for (let i = 0; i < studentIds.length; i += CHUNK) {
    const slice = studentIds.slice(i, i + CHUNK);
    const t = await createTargetsPerGoal(slice);
    const s = await createSessionsAndData(slice, staffPool, params);
    const c = await createSupportingContent(slice, staffPool);
    const m = await tuneComplianceForStudents(slice, staffPool, params);
    minuteLogsCreated += m.minuteLogsCreated;
    stats = addStats(stats, { ...t, ...s, ...c });
  }
  // Stash the new metric on the existing stats shape to keep the public
  // BackfillStats type stable; surface via console for the seed runner.
  if (minuteLogsCreated > 0) {
    console.log(`[backfill] minute logs created for compliance tuning: ${minuteLogsCreated}`);
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
  const params = sampleRunParams();

  // Process in chunks so very large districts don't try to hold thousands of
  // per-goal INSERTs in flight at once.
  const CHUNK = 25;
  let stats = EMPTY_STATS();
  let minuteLogsCreated = 0;
  for (let i = 0; i < studentIds.length; i += CHUNK) {
    const slice = studentIds.slice(i, i + CHUNK);
    const t = await createTargetsPerGoal(slice);
    const s = await createSessionsAndData(slice, staffPool, params);
    const c = await createSupportingContent(slice, staffPool);
    const m = await tuneComplianceForStudents(slice, staffPool, params);
    minuteLogsCreated += m.minuteLogsCreated;
    stats = addStats(stats, {
      ...t,
      ...s,
      ...c,
    });
  }
  if (minuteLogsCreated > 0) {
    console.log(`[backfill] minute logs created for compliance tuning: ${minuteLogsCreated}`);
  }
  return stats;
}
