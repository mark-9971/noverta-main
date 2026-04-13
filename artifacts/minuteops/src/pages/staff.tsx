import { useListStaff, useGetProviderDashboardSummary, useGetParaDashboardSummary } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle } from "lucide-react";
import { MiniProgressRing } from "@/components/ui/progress-ring";

const ROLE_LABELS: Record<string, string> = {
  bcba: "BCBA", slp: "SLP", ot: "OT", pt: "PT",
  counselor: "Counselor", case_manager: "Case Manager", para: "Para",
};
const ROLE_COLORS: Record<string, string> = {
  bcba: "bg-indigo-50 text-indigo-700", slp: "bg-blue-50 text-blue-700",
  ot: "bg-emerald-50 text-emerald-700", pt: "bg-amber-50 text-amber-700",
  counselor: "bg-pink-50 text-pink-700", case_manager: "bg-slate-100 text-slate-600",
  para: "bg-purple-50 text-purple-700",
};

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

  function StaffRow({ member, summary }: { member: any; summary: any }) {
    const utilPct = summary?.utilizationPercent ?? 0;
    return (
      <div className="flex items-center gap-4 p-4 hover:bg-slate-50/50 transition-colors">
        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 text-[13px] font-bold flex-shrink-0">
          {member.firstName?.[0]}{member.lastName?.[0]}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-slate-800">{member.firstName} {member.lastName}</p>
          <p className="text-[12px] text-slate-400">{member.email}</p>
        </div>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[member.role]} flex-shrink-0`}>
          {ROLE_LABELS[member.role] ?? member.role}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0 w-24 justify-end">
          <span className="text-[12px] text-slate-500">{summary?.assignedStudents ?? 0} students</span>
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
          <span className="text-[12px] font-medium text-slate-600 w-8 text-right">{utilPct}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Staff & Providers</h1>
        <p className="text-sm text-slate-400 mt-1">{staffList.length} active staff members</p>
      </div>

      <Tabs defaultValue="clinicians">
        <TabsList>
          <TabsTrigger value="clinicians">Clinicians ({clinicians.length})</TabsTrigger>
          <TabsTrigger value="paras">Paraeducators ({parasList.length})</TabsTrigger>
          <TabsTrigger value="case_managers">Case Managers ({caseManagers.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="clinicians" className="mt-4">
          <Card>
            <div className="divide-y divide-slate-100">
              {isLoading ? [...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 m-4" />) :
                clinicians.map(m => <StaffRow key={m.id} member={m} summary={providerMap[m.id]} />)}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="paras" className="mt-4">
          <Card>
            <div className="divide-y divide-slate-100">
              {isLoading ? [...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 m-4" />) :
                parasList.map(m => <StaffRow key={m.id} member={m} summary={providerMap[m.id]} />)}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="case_managers" className="mt-4">
          <Card>
            <div className="divide-y divide-slate-100">
              {caseManagers.map(cm => (
                <div key={cm.id} className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 text-[13px] font-bold flex-shrink-0">
                    {cm.firstName?.[0]}{cm.lastName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-slate-800">{cm.firstName} {cm.lastName}</p>
                    <p className="text-[12px] text-slate-400">{cm.email}</p>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Case Manager</span>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
