import { describe, it, expect } from "vitest";
import { deriveStudentTopSignal } from "../src/lib/student-top-signal";
import { recommendAction } from "../src/lib/action-recommendations";

describe("deriveStudentTopSignal", () => {
  it("returns null when nothing is wrong", () => {
    expect(
      deriveStudentTopSignal(1, { atRiskServices: [], missedSessions: 0, reEvalStatus: null }),
    ).toBeNull();
  });

  it("prioritizes overdue evaluation over service shortfall", () => {
    const out = deriveStudentTopSignal(7, {
      atRiskServices: [{ serviceRequirementId: 9, riskStatus: "out_of_compliance", requiredMinutes: 100, deliveredMinutes: 10 }],
      missedSessions: 3,
      reEvalStatus: { hasEligibility: true, reEvalStatus: { urgency: "overdue" } },
    });
    expect(out).not.toBeNull();
    expect(out!.signal.alertType).toBe("evaluation_overdue");
    expect(out!.itemId).toBe("student:7:eval-overdue");
    // additional issues: at-risk service still exists.
    expect(out!.additionalIssueCount).toBe(1);
    const r = recommendAction(out!.signal);
    expect(r.recommendedAction).toBe("escalate_coverage_issue");
    expect(r.recommendedOwner).toBe("admin");
  });

  it("emits likely-missed-service when at-risk + missedSessions > 0", () => {
    const out = deriveStudentTopSignal(2, {
      atRiskServices: [{ serviceRequirementId: 5, serviceTypeName: "OT", riskStatus: "at_risk", requiredMinutes: 200, deliveredMinutes: 120 }],
      missedSessions: 2,
      reEvalStatus: null,
    });
    expect(out).not.toBeNull();
    expect(out!.signal.alertType).toBe("missed_sessions");
    expect(out!.signal.hasMissedEvidence).toBe(true);
    expect(out!.itemId).toBe("student:2:missed-service:5");
    const r = recommendAction(out!.signal);
    expect(r.recommendedAction).toBe("schedule_makeup");
    expect(r.recommendedOwner).toBe("scheduler");
  });

  it("emits ambiguous shortfall when at-risk but no missed-evidence", () => {
    const out = deriveStudentTopSignal(3, {
      atRiskServices: [{ serviceRequirementId: 6, serviceTypeName: "Speech", riskStatus: "slightly_behind", requiredMinutes: 100, deliveredMinutes: 80 }],
      missedSessions: 0,
      reEvalStatus: null,
    });
    expect(out).not.toBeNull();
    expect(out!.signal.source).toBe("risk_report");
    expect(out!.signal.hasMissedEvidence).toBe(false);
    const r = recommendAction(out!.signal);
    // Ambiguous risk-report: explicitly NOT confirm_and_log_session.
    expect(r.recommendedAction).toBe("follow_up_with_provider");
    expect(r.confidence).toBe("low");
    // Both alternates must be reachable so the user can override.
    const types = r.secondaryActions.map(s => s.type);
    expect(types).toContain("confirm_and_log_session");
    expect(types).toContain("schedule_makeup");
  });

  it("picks the worst at-risk service when multiple exist", () => {
    const out = deriveStudentTopSignal(4, {
      atRiskServices: [
        { serviceRequirementId: 1, serviceTypeName: "OT", riskStatus: "slightly_behind", requiredMinutes: 100, deliveredMinutes: 90 },
        { serviceRequirementId: 2, serviceTypeName: "Speech", riskStatus: "out_of_compliance", requiredMinutes: 100, deliveredMinutes: 20 },
      ],
      missedSessions: 1,
      reEvalStatus: null,
    });
    expect(out!.itemId).toBe("student:4:missed-service:2");
    expect(out!.whySummary).toContain("Speech");
  });
});
