import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EliteUpgradeModal, useEliteUpgradeModal } from "@/components/EliteUpgradeModal";
import { type FeatureKey } from "@/lib/module-tiers";

const FEATURE_BENEFITS: Partial<Record<FeatureKey, string>> = {
  "district.executive": "Access district-wide compliance scores, risk distributions, staff coverage gaps, and at-risk student summaries — all in one executive view.",
  "district.overview": "Monitor every school in your district from a single cross-school compliance dashboard with per-building breakdowns.",
  "district.resource_management": "Manage contracted providers, agency partnerships, and district-level resource allocation.",
  "district.contract_utilization": "Track contract utilization and identify under- and over-utilized provider agreements across schools.",
  "district.caseload_balancing": "Rebalance caseloads across schools to ensure equitable distribution and reduce staff burnout.",
  "district.medicaid_billing": "Submit Medicaid claims, manage the claims queue, and track reimbursement revenue across your district.",
  "district.budget": "Track special education budgets, cost-per-student, and cost-avoidance metrics at the district level.",
};

interface EliteUpgradePromptProps {
  featureKey: FeatureKey;
  featureName: string;
}

export function EliteUpgradePrompt({ featureKey, featureName }: EliteUpgradePromptProps) {
  const modal = useEliteUpgradeModal();
  const benefit = FEATURE_BENEFITS[featureKey];

  return (
    <>
      <div className="flex items-center justify-center min-h-[55vh] px-4">
        <div className="max-w-md w-full">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Crown className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-xs font-medium text-violet-200 uppercase tracking-wider">ELITE Feature</p>
                  <h2 className="text-lg font-bold text-white">{featureName}</h2>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <p className="text-sm text-gray-600 mb-5">
                {benefit ?? "This feature is available on the Trellis ELITE plan — built for district leadership teams."}
              </p>

              <div className="bg-violet-50 border border-violet-100 rounded-lg px-4 py-3 mb-5">
                <p className="text-xs text-violet-700 font-medium">
                  Upgrade to <strong>Trellis ELITE</strong> to unlock district-wide dashboards, Medicaid billing, agency management, SSO, and more — designed for district administrators and leadership teams.
                </p>
              </div>

              <Button
                onClick={modal.show}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white gap-2"
              >
                <Crown className="w-4 h-4" />
                Talk to Sales about ELITE
              </Button>
            </div>
          </div>
        </div>
      </div>

      <EliteUpgradeModal
        open={modal.open}
        onClose={modal.hide}
        featureName={featureName}
      />
    </>
  );
}
