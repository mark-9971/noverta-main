export interface HealthScore {
  numeric: number;
  grade: "A" | "B" | "C" | "D" | "F";
  color: "green" | "amber" | "red";
  tooltip: string;
  breakdown: {
    compliancePoints: number;
    exposurePoints: number;
    loggingPoints: number;
  };
}

/**
 * Compute a composite district health score (0–100) from three inputs:
 *
 *   • complianceRate      – overall % of mandated minutes delivered (0–100)
 *   • exposurePerStudent  – compensatory exposure in $ per enrolled student
 *   • providerLoggingRate – fraction of sessions that were logged (0–1)
 *
 * Weights: compliance 60 %, exposure 20 %, provider logging 20 %.
 *
 * Returns null when any required input is missing or data is insufficient.
 */
export function computeHealthScore(
  complianceRate: number | null | undefined,
  exposurePerStudent: number | null | undefined,
  providerLoggingRate: number | null | undefined,
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

  const numeric = Math.round(
    compliancePoints * 0.6 + exposurePoints * 0.2 + loggingPoints * 0.2,
  );

  const grade: HealthScore["grade"] =
    numeric >= 90 ? "A"
    : numeric >= 80 ? "B"
    : numeric >= 70 ? "C"
    : numeric >= 60 ? "D"
    : "F";

  const color: HealthScore["color"] =
    grade === "A" || grade === "B" ? "green"
    : grade === "C" ? "amber"
    : "red";

  const tooltip = [
    `Compliance: ${complianceRate.toFixed(1)}% of mandated minutes delivered (60% weight)`,
    `Exposure: $${exposurePerStudent.toFixed(0)} per student in compensatory risk (20% weight)`,
    `Provider logging: ${(providerLoggingRate * 100).toFixed(0)}% of sessions logged (20% weight)`,
  ].join("\n");

  return {
    numeric,
    grade,
    color,
    tooltip,
    breakdown: { compliancePoints, exposurePoints, loggingPoints },
  };
}
