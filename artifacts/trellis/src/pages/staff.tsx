import { useListStaff, useGetProviderDashboardSummary, useGetParaDashboardSummary } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { MiniProgressRing } from "@/components/ui/progress-ring";
import { Link } from "wouter";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import { useSchoolContext } from "@/lib/school-context";

export default function Staff() {
  const { typedFilter } = useSchoolContext();
  const { data: staff, isLoading } = useListStaff(typedFilter);
  const { data: providerSummary } = useGetProviderDashboardSummary(typedFilter);
  const { data: paraSummary } = useGetParaDashboardSummary(typedFilter);

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

  function StaffRow({ member, summary }: { member: any; summary: any }) {
    const utilPct = summary?.utilizationPercent ?? 0;
    return (
      <Link href={`/staff/${member.id}`}>
        <div className="flex items-center gap-4 p-4 hover:bg-gray-50/50 transition-colors cursor-pointer group">
          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 text-[13px] font-bold flex-shrink-0">
            {member.firstName?.[0]}{member.lastName?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-gray-800">{member.firstName} {member.lastName}</p>
            <p className="text-[12px] text-gray-400">{member.email}</p>
          </div>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[member.role]} flex-shrink-0`}>
            {ROLE_LABELS[member.role] ?? member.role}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0 w-24 justify-end">
            <span className="text-[12px] text-gray-500">{summary?.assignedStudents ?? 0} students</span>
          </div>
          {summary?.studentsAtRisk > 0 ? (
            <span className="flex items-center gap-1 text-red-500 text-[12px] font-medium flex-shrink-0 w-16 justify-end">
              <AlertTriangle className="w-3.5 h-3.5" /> {summary.studentsAtRisk}
            </span>
          ) : (
            <span className="text-emerald-500 text-[12px] font-medium flex-shrink-0 w-16 text-right">OK</span>
          )}
          <div className="flex items-center gap-2 flex-shrink-0">
            <MiniProgressRing value={utilPct} size={32} strokeWidth={3} color={utilPct >= 80 ? "#10b981" : utilPct >= 40 ? "#f59e0b" : "#ef4444"} />
            <span className="text-[12px] font-medium text-gray-600 w-8 text-right">{utilPct}%</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
        </div>
      </Link>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Staff & Providers</h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1">{staffList.length} active staff members</p>
      </div>

      <Tabs defaultValue="clinicians">
        <TabsList>
          <TabsTrigger value="clinicians">Clinicians ({clinicians.length})</TabsTrigger>
          <TabsTrigger value="paras">Paraeducators ({parasList.length})</TabsTrigger>
          <TabsTrigger value="case_managers">Case Managers ({caseManagers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="clinicians" className="mt-4">
          <Card>
            <div className="divide-y divide-gray-100">
              {isLoading ? [...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 m-4" />) :
                clinicians.map(m => <StaffRow key={m.id} member={m} summary={providerMap[m.id]} />)}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="paras" className="mt-4">
          <Card>
            <div className="divide-y divide-gray-100">
              {isLoading ? [...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 m-4" />) :
                parasList.map(m => <StaffRow key={m.id} member={m} summary={providerMap[m.id]} />)}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="case_managers" className="mt-4">
          <Card>
            <div className="divide-y divide-gray-100">
              {caseManagers.map(cm => (
                <div key={cm.id} className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 text-[13px] font-bold flex-shrink-0">
                    {cm.firstName?.[0]}{cm.lastName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-gray-800">{cm.firstName} {cm.lastName}</p>
                    <p className="text-[12px] text-gray-400">{cm.email}</p>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Case Manager</span>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
