import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { STATUS_COLORS, STATUS_LABELS } from "./types";
import type { ComplianceSummary } from "./types";

export function ComplianceTab({ compliance }: { compliance: ComplianceSummary[] }) {
  const compliantCount = compliance.filter(c => c.complianceStatus === "compliant").length;
  const atRiskCount = compliance.filter(c => c.complianceStatus === "at_risk").length;
  const nonCompliantCount = compliance.filter(c => c.complianceStatus === "non_compliant").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{compliantCount}</p>
              <p className="text-[11px] text-gray-400">Compliant</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{atRiskCount}</p>
              <p className="text-[11px] text-gray-400">At Risk</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-800">{nonCompliantCount}</p>
              <p className="text-[11px] text-gray-400">Non-Compliant</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-gray-600">
            Supervisee Compliance — Last 30 Days
          </CardTitle>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Required: 5% of direct service hours as supervision
          </p>
        </CardHeader>
        <CardContent className="pt-4">
          {compliance.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No supervisees found</p>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Staff</th>
                    <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Role</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Direct Svc</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Required</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Delivered</th>
                    <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Sessions</th>
                    <th className="text-center px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {compliance.map(c => (
                    <tr key={c.superviseeId} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-700">{c.superviseeName}</td>
                      <td className="px-4 py-2.5 text-gray-500 capitalize">{c.role}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{c.directServiceMinutes} min</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{c.requiredSupervisionMinutes} min</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{c.deliveredSupervisionMinutes} min</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{c.sessionCount}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[c.complianceStatus] || "bg-gray-100 text-gray-600"}`}>
                          {STATUS_LABELS[c.complianceStatus] || c.complianceStatus}
                        </span>
                        {c.compliancePercent > 0 && (
                          <span className="ml-1 text-[10px] text-gray-400">{c.compliancePercent}%</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
