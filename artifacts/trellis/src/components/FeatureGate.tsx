import { type ReactNode } from "react";
import { useFeatureAccess, useTier } from "@/lib/tier-context";
import { type FeatureKey } from "@/lib/module-tiers";
import { Lock, ArrowUpCircle, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { ProUpgradePrompt } from "@/components/ProUpgradePrompt";
import { EliteUpgradePrompt } from "@/components/EliteUpgradePrompt";

interface FeatureGateProps {
  featureKey: FeatureKey;
  children: ReactNode;
  title?: string;
  description?: string;
}

const FEATURE_DISPLAY_NAMES: Partial<Record<FeatureKey, string>> = {
  "clinical.program_data": "ABA Program Data",
  "clinical.fba_bip": "Behavior Assessment & BIP",
  "clinical.iep_suggestions": "IEP Goal Suggestions",
  "clinical.supervision": "Supervision Tracking",
  "clinical.aba_graphing": "ABA Graphing",
  "clinical.premium_templates": "Premium Templates",
  "engagement.parent_communication": "Parent Communication",
  "engagement.parent_portal": "Parent Portal",
  "engagement.documents": "Document Sharing",
  "engagement.translation": "Translation Services",
  "district.executive": "Executive Dashboard",
  "district.overview": "District Overview",
  "district.resource_management": "Agency & Resource Management",
  "district.contract_utilization": "Contract Utilization",
  "district.caseload_balancing": "Caseload Balancing",
  "district.medicaid_billing": "Medicaid Billing",
  "district.budget": "District Budget",
};

export function FeatureGate({ featureKey, children, title, description }: FeatureGateProps) {
  const { loading, tier } = useTier();
  const { accessible, requiredTier, requiredTierLabel, moduleName, moduleDescription } = useFeatureAccess(featureKey);

  // Don't block while the tier is still resolving — avoids a flash of the
  // lock screen for demo/pilot users whose mode hasn't returned from the API yet.
  if (loading) return <>{children}</>;
  if (accessible) return <>{children}</>;

  const featureName = title ?? FEATURE_DISPLAY_NAMES[featureKey] ?? moduleName;

  // ELITE (enterprise) tier gating: show the right upsell based on current tier.
  // CORE (essentials) districts hitting an ELITE page see the PRO upsell first —
  // they need to step up to PRO before ELITE is in reach.
  // PRO (professional) districts hitting an ELITE page see the ELITE upsell.
  if (requiredTier === "enterprise") {
    if (tier === "professional") {
      return <EliteUpgradePrompt featureKey={featureKey} featureName={featureName} />;
    }
    // essentials or any other sub-professional tier: show PRO upsell first
    return <ProUpgradePrompt featureKey={featureKey} featureName={featureName} />;
  }

  // PRO tier (professional) features get the tasteful inline upsell prompt with
  // a modal CTA instead of the generic lock wall.
  if (requiredTier === "professional") {
    return <ProUpgradePrompt featureKey={featureKey} featureName={featureName} />;
  }

  // Fallback generic lock screen for any unhandled tier case.
  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center mx-auto mb-6">
          <Lock className="w-7 h-7 text-emerald-600" />
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-2">
          {featureName || `${moduleName} Feature`}
        </h2>

        <p className="text-sm text-gray-500 mb-6">
          {description || moduleDescription || "This feature is not available on your current plan."}
        </p>

        <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-semibold text-gray-800">
              Available on {requiredTierLabel}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Upgrade to the <strong>{requiredTierLabel}</strong> plan to unlock
            {moduleName ? ` ${moduleName} features` : " this feature"} and more.
          </p>
        </div>

        <Link
          href="/billing"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <ArrowUpCircle className="w-4 h-4" />
          View Plans & Upgrade
        </Link>
      </div>
    </div>
  );
}
