import { ArrowUpCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProUpgradeModal, useProUpgradeModal } from "@/components/ProUpgradeModal";
import { type FeatureKey } from "@/lib/module-tiers";

const FEATURE_BENEFITS: Partial<Record<FeatureKey, string>> = {
  "clinical.program_data": "Track ABA programs, skill acquisition data, and learner progress across your district.",
  "clinical.fba_bip": "Build and manage Functional Behavior Assessments and Behavior Intervention Plans.",
  "clinical.iep_suggestions": "Get AI-powered IEP goal suggestions based on assessment data and peer benchmarks.",
  "clinical.supervision": "Log and track BCBA supervision hours to meet licensure and billing requirements.",
  "clinical.aba_graphing": "Visualize ABA data trends with auto-generated graphs for easy progress monitoring.",
  "clinical.premium_templates": "Access premium IEP and behavioral plan templates crafted by clinical experts.",
  "engagement.parent_communication": "Communicate directly with families through a secure, logged messaging portal.",
  "engagement.parent_portal": "Give families a personalized view of their child's IEP, progress, and services.",
  "engagement.documents": "Share IEP documents, consent forms, and reports securely with families.",
  "engagement.translation": "Automatically translate communications into families' preferred languages.",
};

interface ProUpgradePromptProps {
  featureKey: FeatureKey;
  featureName: string;
}

export function ProUpgradePrompt({ featureKey, featureName }: ProUpgradePromptProps) {
  const modal = useProUpgradeModal();
  const benefit = FEATURE_BENEFITS[featureKey];

  return (
    <>
      <div className="flex items-center justify-center min-h-[55vh] px-4">
        <div className="max-w-md w-full">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-xs font-medium text-emerald-100 uppercase tracking-wider">PRO Feature</p>
                  <h2 className="text-lg font-bold text-white">{featureName}</h2>
                </div>
              </div>
            </div>

            <div className="px-6 py-5">
              <p className="text-sm text-gray-600 mb-5">
                {benefit ?? "This feature is available on the Noverta PRO plan."}
              </p>

              <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3 mb-5">
                <p className="text-xs text-emerald-700 font-medium">
                  Upgrade to <strong>Noverta PRO</strong> to unlock ABA data, clinical workflows, parent engagement tools, and more — all in one platform.
                </p>
              </div>

              <Button
                onClick={modal.show}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                <ArrowUpCircle className="w-4 h-4" />
                Upgrade to PRO
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ProUpgradeModal
        open={modal.open}
        onClose={modal.hide}
        featureName={featureName}
      />
    </>
  );
}
