import { describe, it, expect } from "vitest";
import { recommendAction } from "../src/lib/action-recommendations";

describe("recommendAction — Pilot Wedge Phase 1B", () => {
  describe("documentation lag (overdue_session_log)", () => {
    it("recommends confirm_and_log_session with high confidence", () => {
      const r = recommendAction({ category: "session", alertType: "overdue_session_log", source: "alert" });
      expect(r.likelyCause).toBe("documentation_lag");
      expect(r.recommendedAction).toBe("confirm_and_log_session");
      expect(r.confidence).toBe("high");
      expect(r.recommendedOwner).toBe("service_provider");
    });

    it("assigns owner=you when current user is the provider", () => {
      const r = recommendAction(
        { category: "session", alertType: "overdue_session_log", source: "alert" },
        { currentUserRole: "provider" },
      );
      expect(r.recommendedOwner).toBe("you");
    });
  });

  describe("likely missed service (missed_sessions)", () => {
    it("recommends schedule_makeup, not log session", () => {
      const r = recommendAction({ category: "session", alertType: "missed_sessions", source: "alert" });
      expect(r.likelyCause).toBe("likely_missed_service");
      expect(r.recommendedAction).toBe("schedule_makeup");
      expect(r.recommendedOwner).toBe("scheduler");
      // Crucial: confirm_and_log_session is no longer the universal default.
      expect(r.recommendedAction).not.toBe("confirm_and_log_session");
    });

    it("treats hasMissedEvidence the same as missed_sessions alertType", () => {
      const r = recommendAction({ category: "compliance", hasMissedEvidence: true });
      expect(r.recommendedAction).toBe("schedule_makeup");
    });
  });

  describe("ambiguous compliance row (risk-report path)", () => {
    it("does NOT default to log session — surfaces follow_up_with_provider with low confidence", () => {
      const r = recommendAction({
        category: "compliance",
        alertType: "behind_on_minutes",
        source: "risk_report",
      });
      expect(r.likelyCause).toBe("ambiguous_review_needed");
      expect(r.recommendedAction).toBe("follow_up_with_provider");
      expect(r.confidence).toBe("low");
      // Both possibilities should be reachable as secondary actions.
      const secondaryTypes = r.secondaryActions.map(s => s.type);
      expect(secondaryTypes).toContain("confirm_and_log_session");
      expect(secondaryTypes).toContain("schedule_makeup");
    });
  });

  describe("recurring/programmatic shortfall", () => {
    it("escalates to case manager when shortfall is >=50% of required minutes", () => {
      const r = recommendAction({
        category: "compliance",
        source: "risk_report",
        shortfallMinutes: 300,
        requiredMinutes: 400,
      });
      expect(r.recommendedAction).toBe("review_with_case_manager");
      expect(r.recommendedOwner).toBe("case_manager");
    });

    it("does NOT escalate when shortfall is small relative to requirement", () => {
      const r = recommendAction({
        category: "compliance",
        source: "risk_report",
        shortfallMinutes: 30,
        requiredMinutes: 400,
      });
      expect(r.recommendedAction).not.toBe("review_with_case_manager");
    });
  });

  describe("schedule mismatch", () => {
    it("recommends escalate_coverage_issue when the schedule itself is short", () => {
      const r = recommendAction({ category: "schedule", source: "schedule_gap" });
      expect(r.likelyCause).toBe("schedule_mismatch");
      expect(r.recommendedAction).toBe("escalate_coverage_issue");
      expect(r.recommendedOwner).toBe("scheduler");
    });
  });

  describe("IEP / evaluation deadline pressure", () => {
    it("routes IEP timeline issues to the case manager", () => {
      const r = recommendAction({ category: "iep", alertType: "iep_expiring", source: "alert" });
      expect(r.likelyCause).toBe("deadline_pressure");
      expect(r.recommendedAction).toBe("review_iep_timeline");
      expect(r.recommendedOwner).toBe("case_manager");
    });

    it("escalates overdue evaluations to admin", () => {
      const r = recommendAction({ category: "evaluation", alertType: "evaluation_overdue", source: "alert" });
      expect(r.likelyCause).toBe("deadline_pressure");
      expect(r.recommendedAction).toBe("escalate_coverage_issue");
      expect(r.recommendedOwner).toBe("admin");
    });
  });

  describe("staffing / coverage", () => {
    it("escalates staffing-category items as coverage issues", () => {
      const r = recommendAction({ category: "staffing" });
      expect(r.likelyCause).toBe("provider_absence_or_staffing_issue");
      expect(r.recommendedAction).toBe("escalate_coverage_issue");
      expect(r.recommendedOwner).toBe("admin");
    });
  });

  describe("output shape invariants", () => {
    it("never lists the primary action again as a secondary action", () => {
      const r = recommendAction({ category: "session", alertType: "overdue_session_log" });
      expect(r.secondaryActions.map(s => s.type)).not.toContain(r.recommendedAction);
    });

    it("always emits a non-empty explanation", () => {
      const samples = [
        { category: "session" as const, alertType: "overdue_session_log" },
        { category: "compliance" as const, source: "risk_report" as const },
        { category: "iep" as const, alertType: "iep_expiring" },
        { category: "schedule" as const },
      ];
      for (const s of samples) {
        const r = recommendAction(s);
        expect(r.explanation.length).toBeGreaterThan(10);
        expect(r.causeLabel).toBeTruthy();
        expect(r.ownerLabel).toBeTruthy();
        expect(r.primaryActionLabel).toBeTruthy();
      }
    });
  });
});
