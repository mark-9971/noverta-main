import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABELS, RoleSummary } from "./types";

export function RoleSummaryCard({ roleSummary }: { roleSummary: Record<string, RoleSummary> }) {
  if (Object.keys(roleSummary).length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Summary by Role</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Object.entries(roleSummary).map(([role, summary]) => (
            <div key={role} className="p-3 bg-gray-50 rounded-lg border">
              <p className="font-medium text-sm">{ROLE_LABELS[role] || role}</p>
              <div className="mt-2 space-y-1 text-xs text-gray-600">
                <div className="flex justify-between"><span>Providers</span><span className="font-medium">{summary.count}</span></div>
                <div className="flex justify-between"><span>Avg Students</span><span className="font-medium">{summary.avgStudents}</span></div>
                <div className="flex justify-between"><span>Threshold</span><span className="font-medium">{summary.threshold}</span></div>
                {summary.overloaded > 0 && (
                  <div className="flex justify-between text-red-600"><span>Overloaded</span><span className="font-medium">{summary.overloaded}</span></div>
                )}
                {summary.approaching > 0 && (
                  <div className="flex justify-between text-amber-600"><span>Approaching</span><span className="font-medium">{summary.approaching}</span></div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
