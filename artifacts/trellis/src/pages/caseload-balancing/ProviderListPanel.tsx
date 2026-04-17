import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { ProviderCaseload, STATUS_COLORS, ROLE_LABELS } from "./types";

interface Props {
  providers: ProviderCaseload[];
  selectedProvider: ProviderCaseload | null;
  onSelect: (p: ProviderCaseload) => void;
}

export function ProviderListPanel({ providers, selectedProvider, onSelect }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Provider Caseloads ({providers.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y max-h-[600px] overflow-y-auto">
          {providers.map(p => {
            const colors = STATUS_COLORS[p.status];
            return (
              <div
                key={p.id}
                className={`p-4 hover:bg-gray-50/50 cursor-pointer transition-colors ${selectedProvider?.id === p.id ? "bg-emerald-50/50 border-l-2 border-l-emerald-500" : ""}`}
                onClick={() => onSelect(p)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${p.status === "overloaded" ? "bg-red-500" : p.status === "approaching" ? "bg-amber-500" : "bg-emerald-500"}`} />
                    <div>
                      <p className="font-medium text-sm">{p.firstName} {p.lastName}</p>
                      <p className="text-xs text-gray-500">{ROLE_LABELS[p.role] || p.role} — {p.schoolName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-medium">{p.studentCount} <span className="text-gray-400 font-normal">/ {p.threshold}</span></p>
                      <p className="text-xs text-gray-400">{p.utilization}% utilized</p>
                    </div>
                    <Badge variant="outline" className={`${colors.bg} ${colors.border} ${colors.text} text-xs`}>
                      {p.status === "overloaded" ? "Over" : p.status === "approaching" ? "Near" : "OK"}
                    </Badge>
                  </div>
                </div>
                {p.totalServiceMinutes > 0 && (
                  <p className="text-xs text-gray-400 mt-1 ml-5">{p.serviceCount} services — {p.totalServiceMinutes.toLocaleString()} min/month</p>
                )}
              </div>
            );
          })}
          {providers.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No providers match your filters</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
