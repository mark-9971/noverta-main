import { useGetDistrictOverview, useListDistricts, useListSchools } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Building2, Users, UserCheck, AlertTriangle, School, TrendingUp, MapPin } from "lucide-react";
import { useState, useEffect } from "react";
import { useSchoolContext } from "@/lib/school-context";

function StatCard({ title, value, icon: Icon, accent = "emerald", subtitle }: any) {
  const accents: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700",
    red: "bg-red-50 text-red-600",
    amber: "bg-amber-50 text-amber-600",
    gray: "bg-gray-100 text-gray-600",
    muted: "bg-gray-50 text-gray-500",
  };
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${accents[accent]}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-gray-500 font-medium">{title}</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl font-bold text-gray-800">{value ?? <Skeleton className="w-8 h-7" />}</span>
              {subtitle && <span className="text-[11px] text-gray-400">{subtitle}</span>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ComplianceBar({ onTrack, atRisk, outOfCompliance, total }: { onTrack: number; atRisk: number; outOfCompliance: number; total: number }) {
  if (total === 0) return <div className="text-xs text-gray-400">No data</div>;
  const pctOnTrack = Math.round((onTrack / total) * 100);
  const pctAtRisk = Math.round((atRisk / total) * 100);
  const pctOoc = Math.round((outOfCompliance / total) * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex h-2.5 rounded-full overflow-hidden bg-gray-100">
        {pctOnTrack > 0 && <div className="bg-emerald-500" style={{ width: `${pctOnTrack}%` }} />}
        {pctAtRisk > 0 && <div className="bg-amber-500" style={{ width: `${pctAtRisk}%` }} />}
        {pctOoc > 0 && <div className="bg-red-500" style={{ width: `${pctOoc}%` }} />}
      </div>
      <div className="flex gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />{pctOnTrack}% on track</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />{pctAtRisk}% at risk</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />{pctOoc}% non-compliant</span>
      </div>
    </div>
  );
}

export default function DistrictOverview() {
  const { data: districts } = useListDistricts();
  const { selectedDistrictId: contextDistrictId, selectedSchoolId: contextSchoolId } = useSchoolContext();
  const [localDistrictId, setLocalDistrictId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (contextDistrictId) setLocalDistrictId(contextDistrictId);
  }, [contextDistrictId]);

  const effectiveDistrictId = localDistrictId;

  const { data: overview, isLoading } = useGetDistrictOverview(
    effectiveDistrictId ? { districtId: effectiveDistrictId } : {},
    { query: { enabled: true } as any }
  ) as any;

  const overviewData = overview as any;

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">District Overview</h1>
          <p className="text-sm text-gray-500 mt-1">Cross-school compliance dashboard</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            value={localDistrictId ?? ""}
            onChange={(e) => setLocalDistrictId(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">All Schools</option>
            {(districts as any[])?.map((d: any) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard title="Schools" value={overviewData?.schools?.length ?? 0} icon={School} accent="gray" />
            <StatCard title="Active Students" value={overviewData?.totalStudents ?? 0} icon={Users} accent="emerald" />
            <StatCard title="Staff Members" value={overviewData?.totalStaff ?? 0} icon={UserCheck} accent="muted" />
            <StatCard
              title="Open Alerts"
              value={overviewData?.alertsSummary?.total ?? 0}
              icon={AlertTriangle}
              accent={overviewData?.alertsSummary?.critical > 0 ? "red" : "amber"}
              subtitle={overviewData?.alertsSummary?.critical > 0 ? `${overviewData.alertsSummary.critical} critical` : undefined}
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">District Compliance</CardTitle>
            </CardHeader>
            <CardContent>
              <ComplianceBar
                onTrack={overviewData?.complianceSummary?.onTrack ?? 0}
                atRisk={overviewData?.complianceSummary?.atRisk ?? 0}
                outOfCompliance={overviewData?.complianceSummary?.outOfCompliance ?? 0}
                total={overviewData?.complianceSummary?.total ?? 0}
              />
            </CardContent>
          </Card>

          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Schools</h2>
            {overviewData?.schools?.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-gray-400">
                  <Building2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No schools found. Add schools and assign them to a district to see data here.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(contextSchoolId
                  ? overviewData?.schools?.filter((s: any) => s.id === contextSchoolId)
                  : overviewData?.schools
                )?.map((school: any) => {
                  const compliancePct = school.compliance.total > 0
                    ? Math.round((school.compliance.onTrack / school.compliance.total) * 100)
                    : 0;
                  return (
                    <Card key={school.id} className="hover:shadow-sm transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="font-semibold text-gray-800">{school.name}</h3>
                            {school.district && (
                              <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3" /> {school.district}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <span className={`text-lg font-bold ${compliancePct >= 80 ? "text-emerald-600" : compliancePct >= 60 ? "text-amber-600" : "text-red-600"}`}>
                              {compliancePct}%
                            </span>
                            <p className="text-[10px] text-gray-400">compliance</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 mb-3">
                          <div className="text-center p-2 bg-gray-50 rounded-lg">
                            <span className="text-lg font-bold text-gray-700">{school.studentCount}</span>
                            <p className="text-[10px] text-gray-400">Students</p>
                          </div>
                          <div className="text-center p-2 bg-gray-50 rounded-lg">
                            <span className="text-lg font-bold text-gray-700">{school.staffCount}</span>
                            <p className="text-[10px] text-gray-400">Staff</p>
                          </div>
                          <div className="text-center p-2 bg-gray-50 rounded-lg">
                            <span className={`text-lg font-bold ${school.alerts?.critical > 0 ? "text-red-600" : "text-gray-700"}`}>{school.alerts?.total ?? 0}</span>
                            <p className="text-[10px] text-gray-400">Alerts</p>
                          </div>
                        </div>

                        <ComplianceBar
                          onTrack={school.compliance.onTrack}
                          atRisk={school.compliance.atRisk}
                          outOfCompliance={school.compliance.outOfCompliance}
                          total={school.compliance.total}
                        />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
