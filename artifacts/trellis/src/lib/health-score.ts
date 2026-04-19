export interface HealthScore {
  numeric: number;
  grade: "A" | "B" | "C" | "D" | "F";
  color: "green" | "amber" | "red";
  tooltip: string;
  breakdown: {
    compliancePoints: number;
    exposurePoints: number;
    loggingPoints: number;
    masteryPoints: number | null;
  };
}

/**
 * Compute a composite district health score (0–100) from up to four inputs:
 *
 *   • complianceRate      – overall % of mandated minutes delivered (0–100)
 *   • exposurePerStudent  – compensatory exposure in $ per enrolled student
 *   • providerLoggingRate – fraction of sessions that were logged (0–1)
 *   • goalMasteryRate     – % of rated goals on-track or mastered (0–100, optional)
 *
 * Weights when mastery is provided: compliance 51 %, exposure 17 %,
 * provider logging 17 %, goal mastery 15 %.
 *
 * Weights when mastery is omitted (legacy 3-dimension score):
 * compliance 60 %, exposure 20 %, provider logging 20 %.
 *
 * Returns null when any required input is missing or data is insufficient.
 */
export function computeHealthScore(
  complianceRate: number | null | undefined,
  exposurePerStudent: number | null | undefined,
  providerLoggingRate: number | null | undefined,
  goalMasteryRate?: number | null | undefined,
): HealthScore | null {
  if (
    complianceRate == null ||
    exposurePerStudent == null ||
    providerLoggingRate == null
  ) {
    return null;
  }

  const compliancePoints = Math.max(0, Math.min(100, complianceRate));

  const MAX_EXPOSURE = 500;
  const exposurePoints = Math.max(
    0,
    Math.min(100, 100 - (exposurePerStudent / MAX_EXPOSURE) * 100),
  );

  const loggingPoints = Math.max(0, Math.min(100, providerLoggingRate * 100));

  const hasMastery = goalMasteryRate != null;
  const masteryPoints = hasMastery
    ? Math.max(0, Math.min(100, goalMasteryRate as number))
    : null;

  const numeric = hasMastery
    ? Math.round(
        compliancePoints * 0.51 +
          exposurePoints * 0.17 +
          loggingPoints * 0.17 +
          (masteryPoints as number) * 0.15,
      )
    : Math.round(
        compliancePoints * 0.6 + exposurePoints * 0.2 + loggingPoints * 0.2,
      );

  const grade: HealthScore["grade"] =
    numeric >= 90 ? "A"
    : numeric >= 80 ? "B"
    : numeric >= 70 ? "C"
    : numeric >= 60 ? "D"
    : "F";

  const color: HealthScore["color"] =
    numeric >= 75 ? "green"
    : numeric >= 55 ? "amber"
    : "red";

  const tooltipLines = hasMastery
    ? [
        `Compliance: ${complianceRate.toFixed(1)}% of mandated minutes delivered (51% weight)`,
        `Exposure: $${exposurePerStudent.toFixed(0)} per student in compensatory risk (17% weight)`,
        `Provider logging: ${(providerLoggingRate * 100).toFixed(0)}% of sessions logged (17% weight)`,
        `Goal mastery: ${(goalMasteryRate as number).toFixed(1)}% of rated goals on-track or mastered (15% weight)`,
      ]
    : [
        `Compliance: ${complianceRate.toFixed(1)}% of mandated minutes delivered (60% weight)`,
        `Exposure: $${exposurePerStudent.toFixed(0)} per student in compensatory risk (20% weight)`,
        `Provider logging: ${(providerLoggingRate * 100).toFixed(0)}% of sessions logged (20% weight)`,
      ];

  return {
    numeric,
    grade,
    color,
    tooltip: tooltipLines.join("\n"),
    breakdown: {
      compliancePoints,
      exposurePoints,
      loggingPoints,
      masteryPoints,
    },
  };
}
