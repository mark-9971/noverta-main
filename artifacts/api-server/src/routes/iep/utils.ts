export function toMaProgressCode(rating: string, trend: string, dataPoints: number): string {
  if (rating === "mastered") return "M";
  if (rating === "not_addressed" || dataPoints === 0) return "NA";
  if (trend === "declining" && (rating === "insufficient_progress" || rating === "some_progress")) return "R";
  if (rating === "sufficient_progress") return "SP";
  if (rating === "some_progress" || rating === "insufficient_progress") return "IP";
  return "NP";
}

export function formatPromptLevel(level: string | null): string | null {
  if (!level) return null;
  const labels: Record<string, string> = {
    full_physical: "full physical",
    partial_physical: "partial physical",
    model: "model",
    gestural: "gestural",
    verbal: "verbal",
    independent: "independent",
  };
  return labels[level] ?? level;
}

export function promptLevelPhrase(level: string | null): string {
  const formatted = formatPromptLevel(level);
  return formatted ? ` at the ${formatted} prompt level` : "";
}
