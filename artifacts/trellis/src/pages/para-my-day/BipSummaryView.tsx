import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Shield } from "lucide-react";
import type { BipSummary } from "./types";
import { BipSection } from "./BipSection";

export function BipSummaryView({
  bips, studentName, onBack,
}: {
  bips: BipSummary[];
  studentName: string;
  onBack: () => void;
}) {
  return (
    <div className="p-4 max-w-lg mx-auto space-y-4 pb-24">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-gray-100 text-gray-600"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-[18px] font-bold text-gray-800">Behavior Intervention Plans</h1>
          <p className="text-[13px] text-gray-400">{studentName}</p>
        </div>
      </div>

      {bips.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Shield className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-400 text-sm">No active BIPs found.</p>
          </CardContent>
        </Card>
      ) : (
        bips.map(bip => (
          <Card key={bip.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-bold text-gray-800">{bip.targetBehavior}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      bip.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-gray-100 text-gray-500"
                    }`}>
                      {bip.status}
                    </span>
                    <span className="text-[11px] text-gray-400">v{bip.version}</span>
                  </div>
                </div>
              </div>

              <BipSection label="Operational Definition" content={bip.operationalDefinition} />
              <BipSection label="Hypothesized Function" content={bip.hypothesizedFunction} />
              <BipSection label="Replacement Behaviors" content={bip.replacementBehaviors} />
              <BipSection label="Prevention Strategies" content={bip.preventionStrategies} />
              <BipSection label="Teaching Strategies" content={bip.teachingStrategies} />
              <BipSection label="Consequence Strategies" content={bip.consequenceStrategies} />
              <BipSection label="Crisis Plan" content={bip.crisisPlan} highlight />
              {bip.dataCollectionMethod && (
                <BipSection label="Data Collection" content={bip.dataCollectionMethod} />
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
