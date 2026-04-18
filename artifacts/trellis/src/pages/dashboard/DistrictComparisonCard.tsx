import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, ArrowRight, Shield, AlertTriangle, CheckCircle } from "lucide-react";
import { Link } from "wouter";

interface DistrictBenchmark {
  districtId: number;
  districtName: string;
  complianceRate: number | null;
  highRiskCount: number;
  studentCount: number;
  sessionCompletionRate: number | null;
}

function ComplianceBadge({ rate }: { rate: number | null }) {
  if (rate === null) {
    return <span className="text-[11px] text-gray-400 font-medium">—</span>;
  }
  const color = rate >= 90
    ? "bg-emerald-50 text-emerald-700"
    : rate >= 75
    ? "bg-amber-50 text-amber-700"
    : "bg-red-50 text-red-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${color}`}>
      {rate}%
    </span>
  );
}

function SessionRateBadge({ rate }: { rate: number | null }) {
  if (rate === null) {
    return <span className="text-[11px] text-gray-400 font-medium">—</span>;
  }
  const color = rate >= 85
    ? "text-emerald-600"
    : rate >= 70
    ? "text-amber-600"
    : "text-red-600";
  return <span className={`text-[12px] font-semibold ${color}`}>{rate}%</span>;
}

export function DistrictComparisonCard() {
  const { isPlatformAdmin } = useRole();

  const { data, isLoading } = useQuery<DistrictBenchmark[]>({
    queryKey: ["district-benchmarks"],
    queryFn: () =>
      authFetch("/api/dashboard/district-benchmarks").then(r => r.ok ? r.json() : []),
    staleTime: 120_000,
    enabled: isPlatformAdmin,
  });

  if (!isPlatformAdmin) return null;
  if (isLoading) return null;
  if (!data || data.length < 2) return null;

  return (
    <Card className="border-gray-200/60" data-testid="district-comparison-card">
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-gray-400" />
          District Comparison
        </CardTitle>
        <Link href="/support" className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
          Manage districts <ArrowRight className="w-3 h-3" />
        </Link>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left text-[11px] text-gray-400 font-medium px-5 pb-2">#</th>
                <th className="text-left text-[11px] text-gray-400 font-medium px-3 pb-2">District</th>
                <th className="text-center text-[11px] text-gray-400 font-medium px-3 pb-2">
                  <span className="flex items-center justify-center gap-1">
                    <Shield className="w-3 h-3" />
                    Compliance
                  </span>
                </th>
                <th className="text-center text-[11px] text-gray-400 font-medium px-3 pb-2">
                  <span className="flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    High-Risk
                  </span>
                </th>
                <th className="text-center text-[11px] text-gray-400 font-medium px-3 pb-2">
                  <span className="flex items-center justify-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Sessions (wk)
                  </span>
                </th>
                <th className="text-right text-[11px] text-gray-400 font-medium px-5 pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.map((d, idx) => (
                <tr
                  key={d.districtId}
                  className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors group"
                >
                  <td className="px-5 py-3 text-[12px] font-semibold text-gray-400 w-8">
                    {idx + 1}
                  </td>
                  <td className="px-3 py-3 min-w-0">
                    <div className="font-medium text-[13px] text-gray-800 truncate max-w-[180px]">
                      {d.districtName}
                    </div>
                    {d.studentCount > 0 && (
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        {d.studentCount} tracked student{d.studentCount !== 1 ? "s" : ""}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <ComplianceBadge rate={d.complianceRate} />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <span className={`text-[12px] font-semibold ${d.highRiskCount > 0 ? "text-red-600" : "text-gray-500"}`}>
                      {d.highRiskCount}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <SessionRateBadge rate={d.sessionCompletionRate} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={`/support`}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1 justify-end"
                    >
                      View <ArrowRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
