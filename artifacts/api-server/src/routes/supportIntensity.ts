/**
 * Support Intensity Score — GET /students/:studentId/support-intensity
 *
 * Produces a transparent, additive 0-100 score summarizing how restrictive or
 * intensive a student's current support package is, based entirely on
 * structured data already in the database.
 *
 * ─── SCORE FORMULA ──────────────────────────────────────────────────────────
 *
 * Domain 1: Restraint / Physical Procedures    (max 35 pts)
 *   • Recent incidents (90 days): 1 → 10 pts, 2–3 → 20 pts, 4+ → 28 pts
 *   • Any incident had emergency services called → +4
 *   • Any incident had student or staff injury   → +3
 *   • Any incident continued over 20 min         → +2  (subtotal capped at 35)
 *   • BIP crisis supports include physicalProcedureInvolved=true → +2 (bonus)
 *
 * Domain 2: Active BIP Complexity              (max 25 pts)
 *   • Has ≥1 active BIP                         → +10
 *   • BIP has crisis plan documented            → +8
 *   • Any consequence procedure at "severe"     → +5
 *   • Multiple active BIPs (multi-behavior)     → +2 per extra, cap at +5
 *
 * Domain 3: Active Reduction Targets           (max 20 pts)
 *   • Each active behavior_target with targetDirection="decrease" → +5
 *   • Capped at 4 targets × 5 = 20
 *
 * Domain 4: Prompt Dependency                  (max 15 pts)
 *   • Active program_targets in training/baseline/reopened phase
 *   • Prompt level weight: full_physical=5, partial_physical=4, model=3,
 *     gestural=2, verbal=1, independent=0
 *   • Score = mean_weight × 3  (15 pts at max prompt dependency)
 *
 * Domain 5: Clinical Assessment Depth          (max 5 pts)
 *   • Has completed FBA                         → +3
 *   • Has functional analysis sessions          → +2
 *
 * Total max raw = 102 (capped at 100 after rounding)
 *
 * ─── INTERPRETATION ─────────────────────────────────────────────────────────
 *   0–10:   Low        — Few specialized support structures currently documented
 *   11–35:  Moderate   — Active behavioral or learning support in place
 *   36–65:  High       — Multiple intensive support structures documented
 *   66–100: Very High  — Complex multi-domain support; restrictive procedures noted
 *
 * ─── LIMITATIONS ─────────────────────────────────────────────────────────────
 *   • Score reflects DOCUMENTED data only. Gaps in documentation lower the score.
 *   • Prompt level captures current documented level, not observed performance.
 *   • No clinical validation against established instruments (e.g. SIS, ICAP).
 *   • Weights are heuristic and should be reviewed by clinical staff.
 *   • A low score does NOT mean a student requires less support.
 */

import { Router } from "express";
import { db } from "@workspace/db";
import {
  restraintIncidentsTable,
  behaviorInterventionPlansTable,
  behaviorTargetsTable,
  programTargetsTable,
  fbasTable,
  functionalAnalysesTable,
} from "@workspace/db";
import { eq, and, gte, count } from "drizzle-orm";

const router = Router();

// Prompt levels ordered from most to least intrusive
const PROMPT_WEIGHTS: Record<string, number> = {
  full_physical: 5,
  partial_physical: 4,
  model: 3,
  gestural: 2,
  verbal: 1,
  independent: 0,
};

export interface ScoreContributor {
  domain: string;
  label: string;
  points: number;
  maxPoints: number;
  signals: string[];
}

export interface DataAvailabilityFlag {
  field: string;
  available: boolean;
  note: string;
}

export interface SupportIntensityResult {
  studentId: number;
  generatedAt: string;
  score: number;
  level: "low" | "moderate" | "high" | "very_high";
  levelLabel: string;
  levelDescription: string;
  contributors: ScoreContributor[];
  dataAvailability: DataAvailabilityFlag[];
  limitations: string[];
}

function getLevel(score: number): SupportIntensityResult["level"] {
  if (score <= 10) return "low";
  if (score <= 35) return "moderate";
  if (score <= 65) return "high";
  return "very_high";
}

const LEVEL_META: Record<SupportIntensityResult["level"], { label: string; description: string }> = {
  low: {
    label: "Low Intensity",
    description: "Few specialized support structures currently documented in this system.",
  },
  moderate: {
    label: "Moderate Intensity",
    description: "Active behavioral or learning support is in place.",
  },
  high: {
    label: "High Intensity",
    description: "Multiple intensive support structures are documented.",
  },
  very_high: {
    label: "Very High Intensity",
    description: "Complex, multi-domain support package with restrictive procedures documented.",
  },
};

const SCORE_LIMITATIONS = [
  "Score reflects documented data only — gaps in documentation lower the score without reflecting actual need.",
  "Prompt levels reflect what is documented in program targets, not necessarily what is observed in practice.",
  "Not validated against established clinical instruments (e.g., SIS-A, ICAP, ABC).",
  "Weights are clinical heuristics and should be reviewed by a BCBA or clinical supervisor.",
  "A low score does not mean a student requires less support — it may indicate incomplete data entry.",
];

router.get("/students/:studentId/support-intensity", async (req, res): Promise<void> => {
  const studentId = parseInt(req.params.studentId);
  if (isNaN(studentId)) {
    res.status(400).json({ error: "Invalid student ID" });
    return;
  }

  try {
    const cutoff90 = new Date();
    cutoff90.setDate(cutoff90.getDate() - 90);
    const cutoff90Str = cutoff90.toISOString().slice(0, 10); // YYYY-MM-DD

    // ── Parallel data fetch ────────────────────────────────────────────────
    const [
      recentIncidents,
      allIncidentsAgg,
      activeBips,
      activeReductionTargets,
      activeProgramTargets,
      completedFbas,
      faCount,
    ] = await Promise.all([
      // Recent restraint incidents (90 days)
      db
        .select({
          id: restraintIncidentsTable.id,
          incidentDate: restraintIncidentsTable.incidentDate,
          incidentType: restraintIncidentsTable.incidentType,
          restraintType: restraintIncidentsTable.restraintType,
          durationMinutes: restraintIncidentsTable.durationMinutes,
          continuedOver20Min: restraintIncidentsTable.continuedOver20Min,
          studentInjury: restraintIncidentsTable.studentInjury,
          staffInjury: restraintIncidentsTable.staffInjury,
          medicalAttentionRequired: restraintIncidentsTable.medicalAttentionRequired,
          emergencyServicesCalled: restraintIncidentsTable.emergencyServicesCalled,
        })
        .from(restraintIncidentsTable)
        .where(
          and(
            eq(restraintIncidentsTable.studentId, studentId),
            gte(restraintIncidentsTable.incidentDate, cutoff90Str),
          )
        ),

      // All-time incident severity signals (injury, emergency)
      db
        .select({
          id: restraintIncidentsTable.id,
          emergencyServicesCalled: restraintIncidentsTable.emergencyServicesCalled,
          studentInjury: restraintIncidentsTable.studentInjury,
          staffInjury: restraintIncidentsTable.staffInjury,
          continuedOver20Min: restraintIncidentsTable.continuedOver20Min,
        })
        .from(restraintIncidentsTable)
        .where(eq(restraintIncidentsTable.studentId, studentId)),

      // Active BIPs (status = active)
      db
        .select({
          id: behaviorInterventionPlansTable.id,
          crisisPlan: behaviorInterventionPlansTable.crisisPlan,
          crisisSupportsStructured: behaviorInterventionPlansTable.crisisSupportsStructured,
          consequenceProceduresStructured: behaviorInterventionPlansTable.consequenceProceduresStructured,
          targetBehavior: behaviorInterventionPlansTable.targetBehavior,
        })
        .from(behaviorInterventionPlansTable)
        .where(
          and(
            eq(behaviorInterventionPlansTable.studentId, studentId),
            eq(behaviorInterventionPlansTable.status, "active")
          )
        ),

      // Active behavior reduction targets
      db
        .select({
          id: behaviorTargetsTable.id,
          name: behaviorTargetsTable.name,
          targetDirection: behaviorTargetsTable.targetDirection,
          measurementType: behaviorTargetsTable.measurementType,
        })
        .from(behaviorTargetsTable)
        .where(
          and(
            eq(behaviorTargetsTable.studentId, studentId),
            eq(behaviorTargetsTable.active, true),
            eq(behaviorTargetsTable.targetDirection, "decrease")
          )
        ),

      // Active program targets in intensive phases
      db
        .select({
          id: programTargetsTable.id,
          name: programTargetsTable.name,
          currentPromptLevel: programTargetsTable.currentPromptLevel,
          phase: programTargetsTable.phase,
        })
        .from(programTargetsTable)
        .where(
          and(
            eq(programTargetsTable.studentId, studentId),
            eq(programTargetsTable.active, true),
          )
        ),

      // Completed FBAs
      db
        .select({ id: fbasTable.id, status: fbasTable.status })
        .from(fbasTable)
        .where(
          and(
            eq(fbasTable.studentId, studentId),
            eq(fbasTable.status, "completed")
          )
        ),

      // Functional analysis session count (via fba IDs)
      db
        .select({ n: count() })
        .from(functionalAnalysesTable)
        .innerJoin(fbasTable, eq(functionalAnalysesTable.fbaId, fbasTable.id))
        .where(eq(fbasTable.studentId, studentId)),
    ]);

    // ── Domain 1: Restraint / Physical Procedures ─────────────────────────
    const d1Signals: string[] = [];
    let d1Points = 0;

    const recentCount = recentIncidents.length;
    if (recentCount === 1) {
      d1Points += 10;
      d1Signals.push(`1 restraint/protective-measures incident in the last 90 days`);
    } else if (recentCount >= 2 && recentCount <= 3) {
      d1Points += 20;
      d1Signals.push(`${recentCount} restraint/protective-measures incidents in the last 90 days`);
    } else if (recentCount >= 4) {
      d1Points += 28;
      d1Signals.push(`${recentCount} restraint/protective-measures incidents in the last 90 days`);
    }

    const anyEmergency = allIncidentsAgg.some(i => i.emergencyServicesCalled);
    if (anyEmergency) {
      d1Points += 4;
      d1Signals.push("Emergency services were called in at least one documented incident");
    }

    const anyInjury = allIncidentsAgg.some(i => i.studentInjury || i.staffInjury);
    if (anyInjury) {
      d1Points += 3;
      d1Signals.push("Student or staff injury documented in at least one incident");
    }

    const anyOver20 = allIncidentsAgg.some(i => i.continuedOver20Min);
    if (anyOver20) {
      d1Points += 2;
      d1Signals.push("At least one incident continued for more than 20 minutes");
    }

    // Bonus: physical procedure documented in active BIP crisis supports
    const bipPhysicalProcedure = activeBips.some(bip =>
      Array.isArray(bip.crisisSupportsStructured) &&
      bip.crisisSupportsStructured.some((cs: any) => cs.physicalProcedureInvolved === true)
    );
    if (bipPhysicalProcedure) {
      d1Points += 2;
      d1Signals.push("Active BIP documents a physical management procedure in crisis supports");
    }

    d1Points = Math.min(d1Points, 35);

    if (d1Signals.length === 0) {
      d1Signals.push("No restraint incidents in last 90 days; no physical procedures in BIP");
    }

    // ── Domain 2: Active BIP Complexity ─────────────────────────────────
    const d2Signals: string[] = [];
    let d2Points = 0;

    if (activeBips.length > 0) {
      d2Points += 10;
      d2Signals.push(`${activeBips.length} active BIP${activeBips.length > 1 ? "s" : ""} on file`);

      const hasCrisisPlan = activeBips.some(bip =>
        (bip.crisisPlan && bip.crisisPlan.trim().length > 0) ||
        (Array.isArray(bip.crisisSupportsStructured) && bip.crisisSupportsStructured.length > 0)
      );
      if (hasCrisisPlan) {
        d2Points += 8;
        d2Signals.push("Crisis plan / crisis support procedures documented in BIP");
      }

      const hasSevereConsequence = activeBips.some(bip =>
        Array.isArray(bip.consequenceProceduresStructured) &&
        bip.consequenceProceduresStructured.some((cp: any) => cp.triggerLevel === "severe")
      );
      if (hasSevereConsequence) {
        d2Points += 5;
        d2Signals.push("BIP includes consequence procedures for severe trigger level");
      }

      if (activeBips.length > 1) {
        const extraBipPoints = Math.min((activeBips.length - 1) * 2, 5);
        d2Points += extraBipPoints;
        d2Signals.push(`${activeBips.length} active BIPs indicate multi-behavior support needs`);
      }
    }

    d2Points = Math.min(d2Points, 25);

    if (d2Signals.length === 0) {
      d2Signals.push("No active BIPs documented");
    }

    // ── Domain 3: Active Reduction Targets ──────────────────────────────
    const d3Signals: string[] = [];
    let d3Points = 0;

    const cappedReductionCount = Math.min(activeReductionTargets.length, 4);
    d3Points = cappedReductionCount * 5;

    if (activeReductionTargets.length > 0) {
      d3Signals.push(
        `${activeReductionTargets.length} active behavior reduction target${activeReductionTargets.length > 1 ? "s" : ""}: ` +
        activeReductionTargets.slice(0, 3).map((t) => t.name).join(", ") +
        (activeReductionTargets.length > 3 ? ` +${activeReductionTargets.length - 3} more` : "")
      );
      if (activeReductionTargets.length > 4) {
        d3Signals.push("Score capped at 4 targets (20 pts max)");
      }
    } else {
      d3Signals.push("No active behavior reduction targets documented");
    }

    // ── Domain 4: Prompt Dependency ──────────────────────────────────────
    const d4Signals: string[] = [];
    let d4Points = 0;

    // Only score targets in training/baseline/reopened phases (active skill work)
    const intensivePhases = new Set(["training", "baseline", "reopened"]);
    const intensiveTargets = activeProgramTargets.filter(t => intensivePhases.has(t.phase));

    if (intensiveTargets.length > 0) {
      const weights = intensiveTargets.map(t =>
        PROMPT_WEIGHTS[t.currentPromptLevel ?? ""] ?? 0
      );
      const meanWeight = weights.reduce((a, b) => a + b, 0) / weights.length;
      d4Points = Math.round(meanWeight * 3);

      const promptCounts: Record<string, number> = {};
      for (const t of intensiveTargets) {
        const lvl = t.currentPromptLevel ?? "unknown";
        promptCounts[lvl] = (promptCounts[lvl] ?? 0) + 1;
      }
      const promptSummary = Object.entries(promptCounts)
        .sort(([a], [b]) => (PROMPT_WEIGHTS[b] ?? 0) - (PROMPT_WEIGHTS[a] ?? 0))
        .map(([lvl, n]) => `${n} at ${lvl.replace(/_/g, " ")}`)
        .join(", ");
      d4Signals.push(`${intensiveTargets.length} active training target${intensiveTargets.length > 1 ? "s" : ""}: ${promptSummary}`);
      d4Signals.push(`Mean prompt level score: ${meanWeight.toFixed(1)} / 5.0`);
    } else if (activeProgramTargets.length > 0) {
      d4Signals.push(`${activeProgramTargets.length} program target${activeProgramTargets.length > 1 ? "s" : ""} active but none in active training phases`);
    } else {
      d4Signals.push("No active program targets documented");
    }

    d4Points = Math.min(d4Points, 15);

    // ── Domain 5: Clinical Assessment Depth ─────────────────────────────
    const d5Signals: string[] = [];
    let d5Points = 0;

    if (completedFbas.length > 0) {
      d5Points += 3;
      d5Signals.push(`${completedFbas.length} completed FBA${completedFbas.length > 1 ? "s" : ""} on record`);
    }

    const faTotal = faCount[0]?.n ?? 0;
    if (Number(faTotal) > 0) {
      d5Points += 2;
      d5Signals.push(`${faTotal} functional analysis session${Number(faTotal) > 1 ? "s" : ""} conducted`);
    }

    d5Points = Math.min(d5Points, 5);

    if (d5Signals.length === 0) {
      d5Signals.push("No completed FBAs or functional analysis sessions documented");
    }

    // ── Aggregate ─────────────────────────────────────────────────────────
    const rawScore = d1Points + d2Points + d3Points + d4Points + d5Points;
    const score = Math.min(rawScore, 100);
    const level = getLevel(score);
    const { label: levelLabel, description: levelDescription } = LEVEL_META[level];

    const contributors: ScoreContributor[] = [
      {
        domain: "restraint",
        label: "Restraint & Physical Procedures",
        points: d1Points,
        maxPoints: 35,
        signals: d1Signals,
      },
      {
        domain: "bip",
        label: "Active BIP Complexity",
        points: d2Points,
        maxPoints: 25,
        signals: d2Signals,
      },
      {
        domain: "reduction_targets",
        label: "Active Behavior Reduction Targets",
        points: d3Points,
        maxPoints: 20,
        signals: d3Signals,
      },
      {
        domain: "prompt_dependency",
        label: "Prompt Dependency",
        points: d4Points,
        maxPoints: 15,
        signals: d4Signals,
      },
      {
        domain: "assessment_depth",
        label: "Clinical Assessment Depth",
        points: d5Points,
        maxPoints: 5,
        signals: d5Signals,
      },
    ];

    const dataAvailability: DataAvailabilityFlag[] = [
      {
        field: "Restraint/protective-measures incidents",
        available: allIncidentsAgg.length > 0,
        note: allIncidentsAgg.length > 0
          ? `${allIncidentsAgg.length} incident record${allIncidentsAgg.length > 1 ? "s" : ""} found`
          : "No incidents on record — documenting incidents here would update this score",
      },
      {
        field: "Active BIP",
        available: activeBips.length > 0,
        note: activeBips.length > 0
          ? `${activeBips.length} active BIP${activeBips.length > 1 ? "s" : ""} found`
          : "No active BIPs — if a BIP exists, set its status to Active",
      },
      {
        field: "Behavior reduction targets",
        available: activeReductionTargets.length > 0,
        note: activeReductionTargets.length > 0
          ? `${activeReductionTargets.length} active reduction target${activeReductionTargets.length > 1 ? "s" : ""} found`
          : "No active reduction targets — add targets with direction=Decrease to reflect behavior goals",
      },
      {
        field: "Program targets with prompt levels",
        available: intensiveTargets.length > 0,
        note: intensiveTargets.length > 0
          ? `${intensiveTargets.length} training/baseline target${intensiveTargets.length > 1 ? "s" : ""} with prompt levels`
          : "No active training targets with prompt levels — ensure prompt level is set on program targets",
      },
      {
        field: "Completed FBA",
        available: completedFbas.length > 0,
        note: completedFbas.length > 0
          ? `${completedFbas.length} completed FBA${completedFbas.length > 1 ? "s" : ""} found`
          : "No completed FBAs — mark FBA status as Completed when finished",
      },
    ];

    const result: SupportIntensityResult = {
      studentId,
      generatedAt: new Date().toISOString(),
      score,
      level,
      levelLabel,
      levelDescription,
      contributors,
      dataAvailability,
      limitations: SCORE_LIMITATIONS,
    };

    res.json(result);
  } catch (err) {
    console.error("Support intensity score error:", err);
    res.status(500).json({ error: "Failed to compute support intensity score" });
  }
});

export default router;
