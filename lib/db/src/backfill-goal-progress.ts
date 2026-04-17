import { sql } from "drizzle-orm";
import { db } from "./db";

/**
 * Ensures every student in a district has goals wired to program/behavior targets
 * with realistic progression data points over the past 90 days. Idempotent: only
 * creates targets for students missing them, links unlinked goals, and only adds
 * data points for sessions tagged with our sample marker.
 *
 * Used by both the demo-district seed and as a one-shot repair tool.
 */
export async function backfillGoalProgressForDistrict(districtId: number): Promise<{
  programTargetsCreated: number;
  behaviorTargetsCreated: number;
  goalsLinkedToProgram: number;
  goalsLinkedToBehavior: number;
  sessionsCreated: number;
  programDataPoints: number;
  behaviorDataPoints: number;
}> {
  const ptResult = await db.execute(sql`
    WITH district_students AS (
      SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${districtId})
    ),
    needs_pt AS (
      SELECT s.id FROM district_students s
      WHERE NOT EXISTS (SELECT 1 FROM program_targets pt WHERE pt.student_id = s.id)
    ),
    pt_templates AS (
      SELECT * FROM (VALUES
        ('Receptive Instructions: 2-Step', 'discrete_trial', 'Language', '80% across 3 sessions', 80),
        ('Functional Communication: PECS', 'discrete_trial', 'Communication', '80% across 3 sessions', 80),
        ('Following Classroom Routines', 'task_analysis', 'Adaptive', '90% independent', 90)
      ) AS t(name, program_type, domain, target_criterion, mastery_pct)
    )
    INSERT INTO program_targets (student_id, name, program_type, domain, target_criterion, mastery_criterion_percent, current_prompt_level, active)
    SELECT n.id, t.name, t.program_type, t.domain, t.target_criterion, t.mastery_pct, 'independent', true
    FROM needs_pt n CROSS JOIN pt_templates t
  `);

  const btResult = await db.execute(sql`
    WITH district_students AS (
      SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${districtId})
    ),
    needs_bt AS (
      SELECT s.id FROM district_students s
      WHERE NOT EXISTS (SELECT 1 FROM behavior_targets bt WHERE bt.student_id = s.id)
    ),
    bt_templates AS (
      SELECT * FROM (VALUES
        ('On-Task Behavior', 'percentage', 'increase', 35, 85),
        ('Independent Transitions', 'percentage', 'increase', 30, 90),
        ('Verbal Outbursts', 'frequency', 'decrease', 8, 2)
      ) AS t(name, mtype, dir, baseline, goal)
    )
    INSERT INTO behavior_targets (student_id, name, measurement_type, target_direction, baseline_value, goal_value, active)
    SELECT n.id, t.name, t.mtype, t.dir, t.baseline::numeric, t.goal::numeric, true
    FROM needs_bt n CROSS JOIN bt_templates t
  `);

  const linkPtResult = await db.execute(sql`
    WITH district_students AS (
      SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${districtId})
    ),
    ranked_goals AS (
      SELECT g.id AS goal_id, g.student_id,
             ROW_NUMBER() OVER (PARTITION BY g.student_id ORDER BY g.goal_number) AS rn
      FROM iep_goals g
      WHERE g.student_id IN (SELECT id FROM district_students)
        AND g.active = true
        AND g.program_target_id IS NULL
        AND g.behavior_target_id IS NULL
    ),
    ranked_pts AS (
      SELECT pt.id AS pt_id, pt.student_id,
             ROW_NUMBER() OVER (PARTITION BY pt.student_id ORDER BY pt.id) AS rn
      FROM program_targets pt
      WHERE pt.student_id IN (SELECT id FROM district_students)
    )
    UPDATE iep_goals g SET program_target_id = rp.pt_id
    FROM ranked_goals rg JOIN ranked_pts rp ON rp.student_id = rg.student_id AND rp.rn = rg.rn
    WHERE g.id = rg.goal_id
  `);

  const linkBtResult = await db.execute(sql`
    WITH district_students AS (
      SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${districtId})
    ),
    ranked_goals AS (
      SELECT g.id AS goal_id, g.student_id,
             ROW_NUMBER() OVER (PARTITION BY g.student_id ORDER BY g.goal_number) AS rn
      FROM iep_goals g
      WHERE g.student_id IN (SELECT id FROM district_students)
        AND g.active = true
        AND g.program_target_id IS NULL
        AND g.behavior_target_id IS NULL
    ),
    ranked_bts AS (
      SELECT bt.id AS bt_id, bt.student_id,
             ROW_NUMBER() OVER (PARTITION BY bt.student_id ORDER BY bt.id) AS rn
      FROM behavior_targets bt
      WHERE bt.student_id IN (SELECT id FROM district_students)
    )
    UPDATE iep_goals g SET behavior_target_id = rb.bt_id
    FROM ranked_goals rg JOIN ranked_bts rb ON rb.student_id = rg.student_id AND rb.rn = rg.rn
    WHERE g.id = rg.goal_id
  `);

  // Idempotent per (student, date): only insert sessions for date slots that don't
  // already have a sample session for that student. A partial prior run can be
  // re-executed safely and will fill in any missing dates without duplicating.
  const sessionsResult = await db.execute(sql`
    WITH district_students AS (
      SELECT s.id FROM students s WHERE s.school_id IN (SELECT id FROM schools WHERE district_id = ${districtId})
    ),
    staff_pool AS (
      SELECT id FROM staff WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${districtId})
    ),
    session_dates AS (
      SELECT generate_series((CURRENT_DATE - INTERVAL '90 days')::date, CURRENT_DATE, INTERVAL '3 days')::date AS d
    )
    INSERT INTO data_sessions (student_id, staff_id, session_date, session_type, notes)
    SELECT ds.id, (SELECT id FROM staff_pool ORDER BY random() LIMIT 1), sd.d::text, 'direct', 'Sample session'
    FROM district_students ds CROSS JOIN session_dates sd
    WHERE NOT EXISTS (
      SELECT 1 FROM data_sessions existing
      WHERE existing.student_id = ds.id
        AND existing.session_date = sd.d::text
        AND existing.notes = 'Sample session'
    )
  `);

  const programDataResult = await db.execute(sql`
    INSERT INTO program_data (data_session_id, program_target_id, trials_correct, trials_total, percent_correct, prompt_level_used, notes)
    SELECT
      ds.id, pt.id,
      GREATEST(0, LEAST(10, ROUND(6 + (CURRENT_DATE - ds.session_date::date) * (-0.04) + (random() * 2 - 1))))::int,
      10,
      GREATEST(20, LEAST(100, ROUND(40 + ((90 - (CURRENT_DATE - ds.session_date::date)) / 90.0) * 45 + (random() * 10 - 5))))::numeric,
      'independent',
      'Sample data point'
    FROM data_sessions ds
    JOIN program_targets pt ON pt.student_id = ds.student_id
    WHERE ds.notes = 'Sample session'
      AND ds.student_id IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${districtId}))
      AND NOT EXISTS (
        SELECT 1 FROM program_data pd2 WHERE pd2.data_session_id = ds.id AND pd2.program_target_id = pt.id
      )
  `);

  const behaviorDataResult = await db.execute(sql`
    INSERT INTO behavior_data (data_session_id, behavior_target_id, value, notes)
    SELECT
      ds.id, bt.id,
      CASE WHEN bt.target_direction = 'increase' THEN
        GREATEST(0, LEAST(100,
          (bt.baseline_value::numeric + (bt.goal_value::numeric - bt.baseline_value::numeric)
            * ((90 - (CURRENT_DATE - ds.session_date::date))::numeric / 90.0)
          ) + (random() * 8 - 4)
        ))::numeric
      ELSE
        GREATEST(0,
          (bt.baseline_value::numeric - (bt.baseline_value::numeric - bt.goal_value::numeric)
            * ((90 - (CURRENT_DATE - ds.session_date::date))::numeric / 90.0)
          ) + (random() * 2 - 1)
        )::numeric
      END,
      'Sample data point'
    FROM data_sessions ds
    JOIN behavior_targets bt ON bt.student_id = ds.student_id
    WHERE ds.notes = 'Sample session'
      AND ds.student_id IN (SELECT id FROM students WHERE school_id IN (SELECT id FROM schools WHERE district_id = ${districtId}))
      AND NOT EXISTS (
        SELECT 1 FROM behavior_data bd2 WHERE bd2.data_session_id = ds.id AND bd2.behavior_target_id = bt.id
      )
  `);

  return {
    programTargetsCreated: ptResult.rowCount ?? 0,
    behaviorTargetsCreated: btResult.rowCount ?? 0,
    goalsLinkedToProgram: linkPtResult.rowCount ?? 0,
    goalsLinkedToBehavior: linkBtResult.rowCount ?? 0,
    sessionsCreated: sessionsResult.rowCount ?? 0,
    programDataPoints: programDataResult.rowCount ?? 0,
    behaviorDataPoints: behaviorDataResult.rowCount ?? 0,
  };
}
