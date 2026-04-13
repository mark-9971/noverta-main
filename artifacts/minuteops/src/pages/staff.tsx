import { useListStaff, useGetProviderDashboardSummary, useGetParaDashboardSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, AlertTriangle } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  bcba: "BCBA",
  slp: "SLP",
  ot: "OT",
  pt: "PT",
  counselor: "Counselor",
  case_manager: "Case Manager",
  para: "Para",
};

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    bcba: "bg-indigo-100 text-indigo-700",
    slp: "bg-blue-100 text-blue-700",
    ot: "bg-green-100 text-green-700",
    pt: "bg-amber-100 text-amber-700",
    counselor: "bg-pink-100 text-pink-700",
    case_manager: "bg-slate-100 text-slate-700",
    para: "bg-purple-100 text-purple-700",
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${colors[role] ?? "bg-slate-100 text-slate-600"}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

export default function Staff() {
  const { data: staff, isLoading } = useListStaff({} as any);
  const { data: providerSummary } = useGetProviderDashboardSummary();
  const { data: paraSummary } = useGetParaDashboardSummary();

  const staffList = (staff as any[]) ?? [];
  const providers = (providerSummary as any[]) ?? [];
  const paras = (paraSummary as any[]) ?? [];

  const providerMap: Record<number, any> = {};
  for (const p of providers) providerMap[p.staffId] = p;

  const paraMap: Record<number, any> = {};
  for (const p of paras) paraMap[p.staffId] = p;

  const clinicians = staffList.filter(s => ["bcba", "slp", "ot", "pt", "counselor"].includes(s.role));
  const parasList = staffList.filter(s => s.role === "para");
  const caseManagers = staffList.filter(s => s.role === "case_manager");

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Staff & Providers</h1>
        <p className="text-sm text-slate-500 mt-0.5">{staffList.length} active staff members</p>
      </div>

      <Tabs defaultValue="clinicians">
        <TabsList>
          <TabsTrigger value="clinicians">Clinicians & Providers ({clinicians.length})</TabsTrigger>
          <TabsTrigger value="paras">Paraeducators ({parasList.length})</TabsTrigger>
          <TabsTrigger value="case_managers">Case Managers ({caseManagers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="clinicians" className="mt-4">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Provider</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Caseload</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">At Risk</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Minutes Utilization</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Open Alerts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? [...Array(6)].map((_, i) => (
                    <tr key={i}>{[...Array(6)].map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                  )) : clinicians.map(member => {
                    const summary = providerMap[member.id];
                    return (
                      <tr key={member.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 text-xs font-bold">
                              {member.firstName?.[0]}{member.lastName?.[0]}
                            </div>
                            <div>
                              <p className="font-medium text-slate-800">{member.firstName} {member.lastName}</p>
                              <p className="text-xs text-slate-400">{member.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3"><RoleBadge role={member.role} /></td>
                        <td className="px-4 py-3 text-slate-600">{summary?.assignedStudents ?? 0} students</td>
                        <td className="px-4 py-3">
                          {summary?.studentsAtRisk > 0 ? (
                            <span className="flex items-center gap-1 text-red-600 text-xs font-medium">
                              <AlertTriangle className="w-3 h-3" /> {summary.studentsAtRisk}
                            </span>
                          ) : (
                            <span className="text-green-600 text-xs">None</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 text-xs">
                          {summary ? `${summary.totalDeliveredMinutes} / ${summary.totalRequiredMinutes} min (${summary.utilizationPercent}%)` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {summary?.openAlerts > 0 ? (
                            <Badge className="bg-orange-100 text-orange-700 text-[10px]">{summary.openAlerts}</Badge>
                          ) : (
                            <span className="text-slate-400 text-xs">0</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="paras" className="mt-4">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Paraeducator</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Assigned Students</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Scheduled Blocks</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoading ? [...Array(6)].map((_, i) => (
                    <tr key={i}>{[...Array(4)].map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>)}</tr>
                  )) : parasList.map(para => {
                    const summary = paraMap[para.id];
                    return (
                      <tr key={para.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 text-xs font-bold">
                              {para.firstName?.[0]}{para.lastName?.[0]}
                            </div>
                            <div>
                              <p className="font-medium text-slate-800">{para.firstName} {para.lastName}</p>
                              <p className="text-xs text-slate-400">{para.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{summary?.assignedStudents ?? 0}</td>
                        <td className="px-4 py-3 text-slate-600">{summary?.assignedBlocks ?? 0} blocks/week</td>
                        <td className="px-4 py-3">
                          <Badge className="bg-green-100 text-green-700 text-[10px]">Active</Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="case_managers" className="mt-4">
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Case Manager</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Email</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Certifications</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {caseManagers.map(cm => (
                    <tr key={cm.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 bg-slate-200 rounded-full flex items-center justify-center text-slate-700 text-xs font-bold">
                            {cm.firstName?.[0]}{cm.lastName?.[0]}
                          </div>
                          <p className="font-medium text-slate-800">{cm.firstName} {cm.lastName}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{cm.email}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {(cm.certifications ?? []).map((c: string) => (
                            <span key={c} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">{c}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className="bg-green-100 text-green-700 text-[10px]">Active</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
