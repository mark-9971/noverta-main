import { getPublicMeta } from "../../lib/clerkClaims";

export function getAge(dob: string | null): number | null {
  if (!dob) return null;
  const today = new Date();
  const birth = new Date(dob);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export function nextSchoolYear(): { start: string; end: string; label: string } {
  const today = new Date();
  const year = today.getMonth() >= 7 ? today.getFullYear() + 1 : today.getFullYear();
  return {
    start: `${year}-09-01`,
    end: `${year + 1}-06-30`,
    label: `${year}–${year + 1}`,
  };
}

export function advanceGoalCriterion(criterion: string | null): string {
  if (!criterion) return "85% accuracy across 3 consecutive sessions";
  const pctMatch = criterion.match(/(\d+)%/);
  if (pctMatch) {
    const current = parseInt(pctMatch[1]);
    const next = Math.min(100, current + 10);
    return criterion.replace(`${current}%`, `${next}%`);
  }
  return criterion;
}

export function goalProgressCodeLabel(code: string): string {
  const labels: Record<string, string> = {
    M: "Mastered", SP: "Sufficient Progress", IP: "Insufficient Progress",
    NP: "No Progress", R: "Regression", NA: "Not Addressed",
  };
  return labels[code] || code;
}

export function recommendationForGoal(
  goal: { annualGoal: string; goalArea: string; baseline: string | null; targetCriterion: string | null },
  progressCode: string,
  currentPerformance: string,
  percentCorrect: number | null,
  behaviorValue: number | null,
  behaviorGoal: number | null,
  dataPoints: number,
  trendDirection: string
): { action: "graduate" | "continue" | "modify" | "reconsider" | "review"; rationale: string; suggestedGoal: string; suggestedCriterion: string } {
  const base = goal.annualGoal;
  const area = goal.goalArea;

  switch (progressCode) {
    case "M": {
      const advancedCriterion = advanceGoalCriterion(goal.targetCriterion);
      return {
        action: "graduate",
        rationale: `Student has mastered this goal with ${currentPerformance}. Ready to advance to a more complex skill.`,
        suggestedGoal: `Given mastery of prior skill, student will demonstrate advanced ${area.toLowerCase()} skills: ${base.replace(/\.$/, "")} at a more complex level, as measured by data collection.`,
        suggestedCriterion: advancedCriterion,
      };
    }
    case "SP": {
      const advancedCriterion = advanceGoalCriterion(goal.targetCriterion);
      return {
        action: "continue",
        rationale: `Student is making sufficient progress (${currentPerformance}) and is on track to meet this goal. Recommend continuing with a slightly elevated criterion for the coming year.`,
        suggestedGoal: base,
        suggestedCriterion: advancedCriterion,
      };
    }
    case "IP":
    case "NP": {
      const modifier = trendDirection === "improving" ? "with modified instructional strategies" : "with increased supports and modified approach";
      return {
        action: progressCode === "NP" ? "reconsider" : "modify",
        rationale: `Student is making insufficient progress (${currentPerformance}, ${dataPoints} data points). A modified approach or additional supports are recommended.`,
        suggestedGoal: `${base} ${modifier}.`,
        suggestedCriterion: goal.targetCriterion || "80% accuracy across 3 consecutive sessions",
      };
    }
    case "R": {
      return {
        action: "reconsider",
        rationale: `Student has shown regression in this area (${currentPerformance}). The IEP Team should assess the current approach and consider reduced demand, additional environmental supports, or a revised instructional methodology.`,
        suggestedGoal: base,
        suggestedCriterion: goal.targetCriterion || "80% accuracy across 3 consecutive sessions",
      };
    }
    case "NA":
    default: {
      return {
        action: "review",
        rationale: `This goal was not addressed during the reporting period. The IEP Team should determine whether the goal remains appropriate and prioritize it for delivery.`,
        suggestedGoal: base,
        suggestedCriterion: goal.targetCriterion || "80% accuracy across 3 consecutive sessions",
      };
    }
  }
}

export const AGE_APPROPRIATE_SKILLS: Record<string, string[]> = {
  "3-5": ["Following 2-step directions", "Identifying body parts", "Basic expressive labeling", "Parallel play", "Self-care: handwashing"],
  "6-8": ["Phonics and early reading", "Basic math facts", "Peer greetings", "Following classroom rules", "Requesting help appropriately"],
  "9-11": ["Reading comprehension", "Multi-step math problems", "Peer conversation skills", "Self-monitoring behavior", "Organization and study skills"],
  "12-14": ["Functional academics (money, time)", "Social problem solving", "Self-advocacy basics", "Vocational awareness", "Community safety skills"],
  "15-17": ["Pre-vocational skills", "Job applications and interviewing", "Independent living (cooking, laundry)", "Budgeting basics", "Post-secondary planning"],
  "18+": ["Vocational training / employment", "Independent living", "Community integration", "Benefits awareness", "Self-determination"],
};

export function getAgeBand(age: number | null): string {
  if (!age) return "9-11";
  if (age <= 5) return "3-5";
  if (age <= 8) return "6-8";
  if (age <= 11) return "9-11";
  if (age <= 14) return "12-14";
  if (age <= 17) return "15-17";
  return "18+";
}

export const TRANSITION_DOMAINS = [
  { domain: "Employment / Vocational", prompt: "What are the student's career interests and work experience?" },
  { domain: "Post-Secondary Education / Training", prompt: "What post-secondary education or training is the student interested in?" },
  { domain: "Independent Living", prompt: "What independent living skills does the student need to develop?" },
  { domain: "Community Participation", prompt: "How does the student engage in community activities?" },
  { domain: "Recreation / Leisure", prompt: "What hobbies or leisure activities does the student enjoy?" },
];

export function getStaffIdFromReq(req: any): number | null {
  const meta = getPublicMeta(req);
  if (meta.staffId) return meta.staffId;
  if (process.env.NODE_ENV !== "production") return 77;
  return null;
}
