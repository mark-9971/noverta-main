import { type ReactNode } from "react";
import { useFeatureAccess } from "@/lib/tier-context";
import { type FeatureKey } from "@/lib/module-tiers";
import { Lock, ArrowUpCircle, Sparkles } from "lucide-react";
import { Link } from "wouter";

interface FeatureGateProps {
  featureKey: FeatureKey;
  children: ReactNode;
  title?: string;
  description?: string;
}

export function FeatureGate({ featureKey, children, title, description }: FeatureGateProps) {
  const { accessible, requiredTier, requiredTierLabel, moduleName, moduleDescription } = useFeatureAccess(featureKey);

  if (accessible) return <>{children}</>;

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-emerald-100 flex items-center justify-center mx-auto mb-6">
          <Lock className="w-7 h-7 text-emerald-600" />
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-2">
          {title || `${moduleName} Feature`}
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
