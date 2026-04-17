import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Shield, ChevronRight } from "lucide-react";
import type { AssignedBip } from "./types";
import { BipSection } from "./BipSection";

export function AssignedBipListView({ bips, expandedId, onExpand, onBack }: {
  bips: AssignedBip[];
  expandedId: number | null;
  onExpand: (id: number) => void;
  onBack: () => void;
}) {
  const grouped: Record<string, AssignedBip[]> = {};
  for (const bip of bips) {
    if (!grouped[bip.studentName]) grouped[bip.studentName] = [];
    grouped[bip.studentName].push(bip);
  }

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
          <h1 className="text-[18px] font-bold text-gray-800">My Assigned BIPs</h1>
          <p className="text-[13px] text-gray-400">{bips.length} active plan{bips.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {bips.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Shield className="w-8 h-8 mx-auto text-gray-300 mb-2" />
            <p className="text-gray-400 text-sm">No BIPs assigned to you yet.</p>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([studentName, studentBips]) => (
          <div key={studentName}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1">{studentName}</p>
            <div className="space-y-2">
              {studentBips.map(bip => {
                const isExpanded = expandedId === bip.id;
                return (
                  <Card key={bip.id} className={`transition-all ${isExpanded ? "border-emerald-300" : ""}`}>
                    <button
                      className="w-full text-left"
                      onClick={() => onExpand(bip.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <h3 className="text-[15px] font-bold text-gray-800 leading-tight">{bip.targetBehavior}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Active</span>
                              <span className="text-[11px] text-gray-400">v{bip.version}</span>
                              {bip.implementationStartDate && (
                                <span className="text-[11px] text-gray-400">since {bip.implementationStartDate}</span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform mt-1 ${isExpanded ? "rotate-90" : ""}`} />
                        </div>
                      </CardContent>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-2 border-t border-gray-100 pt-3">
                        <BipSection label="Operational Definition" content={bip.operationalDefinition} />
                        <BipSection label="Function" content={bip.hypothesizedFunction} />
                        <BipSection label="Replacement Behaviors" content={bip.replacementBehaviors} />
                        <BipSection label="Prevention Strategies" content={bip.preventionStrategies} />
                        <BipSection label="Teaching Strategies" content={bip.teachingStrategies} />
                        <BipSection label="Consequence Strategies" content={bip.consequenceStrategies} />
                        {bip.crisisPlan && <BipSection label="Crisis Plan" content={bip.crisisPlan} highlight />}
                        {bip.dataCollectionMethod && <BipSection label="Data Collection" content={bip.dataCollectionMethod} />}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
