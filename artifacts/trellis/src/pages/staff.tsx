import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useListStaff, useGetProviderDashboardSummary, useGetParaDashboardSummary, getListStaffQueryKey } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, ChevronRight, Stethoscope, HandHelping, ClipboardList, BellOff } from "lucide-react";
import { MiniProgressRing } from "@/components/ui/progress-ring";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "wouter";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import { useSchoolContext } from "@/lib/school-context";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { EmptyState, EmptyStateStep, EmptyStateHeading, EmptyStateDetail } from "@/components/ui/empty-state";

function AlertOptOutIndicator({ staffId, name }: { staffId: number; name: string }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  async function handleReenable(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (saving) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/staff/${staffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiveRiskAlerts: true }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(`Re-enabled risk alert emails for ${name}`);
      queryClient.invalidateQueries({ queryKey: getListStaffQueryKey().slice(0, 1) });
    } catch {
      toast.error("Failed to re-enable email alerts");
    } finally {
      setSaving(false);
    }
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={handleReenable}
            disabled={saving}
            aria-label={`${name} has opted out of risk alert emails. Click to re-enable.`}
            className="flex items-center justify-center w-6 h-6 rounded-md text-amber-600 hover:bg-amber-50 disabled:opacity-50 flex-shrink-0"
          >
            <BellOff className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-center">
          Opted out of risk alert emails. Click to re-enable.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

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
            <p className="text-[14px] font-semibold text-gray-800 flex items-center gap-1.5">
              {member.firstName} {member.lastName}
              {(member as { source?: string | null }).source === "pilot_csv" && (
                <span
                  title="Imported via the pilot kickoff CSV wizard — will be reconciled with SIS sync without duplicating"
                  className="text-[9px] font-semibold uppercase tracking-wide px-1 py-0 rounded bg-emerald-50 text-emerald-700 border border-emerald-200"
                  data-testid={`badge-pilot-csv-staff-${member.id}`}
                >
                  CSV
                </span>
              )}
            </p>
            <p className="text-[12px] text-gray-400">{member.email}</p>
          </div>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${ROLE_COLORS[member.role]} flex-shrink-0`}>
            {ROLE_LABELS[member.role] ?? member.role}
          </span>
          <div className="w-6 flex-shrink-0 flex justify-center">
            {member.receiveRiskAlerts === false && (
              <AlertOptOutIndicator staffId={member.id} name={`${member.firstName} ${member.lastName}`} />
            )}
          </div>
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
                clinicians.length === 0 ? (
                  <EmptyState
                    icon={Stethoscope}
                    title="No Clinicians Added Yet"
                    compact
                    action={{ label: "Add Staff Member", href: "/setup" }}
                  >
                    <EmptyStateDetail>
                      Clinicians are your licensed service providers — SLPs, OTs, PTs, BCBAs, and counselors who deliver IEP-mandated services. Adding them here lets Trellis track their caseloads, session delivery rates, and compliance performance.
                    </EmptyStateDetail>
                    <EmptyStateHeading>To add clinicians:</EmptyStateHeading>
                    <EmptyStateStep number={1}>Go to Setup and add staff members with their role (SLP, OT, PT, BCBA, or Counselor).</EmptyStateStep>
                    <EmptyStateStep number={2}>Assign them to students via service requirements on each student's IEP.</EmptyStateStep>
                    <EmptyStateStep number={3}>Once assigned, their delivery metrics appear here automatically.</EmptyStateStep>
                  </EmptyState>
                ) :
                clinicians.map(m => <StaffRow key={m.id} member={m} summary={providerMap[m.id]} />)}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="paras" className="mt-4">
          <Card>
            <div className="divide-y divide-gray-100">
              {isLoading ? [...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 m-4" />) :
                parasList.length === 0 ? (
                  <EmptyState
                    icon={HandHelping}
                    title="No Paraprofessionals Added Yet"
                    compact
                    action={{ label: "Add Staff Member", href: "/setup" }}
                  >
                    <EmptyStateDetail>
                      Paraprofessionals (paras) provide direct support to students during the school day — 1:1 aides, small-group support, behavioral intervention. Many IEPs mandate specific para support hours that need to be tracked for compliance.
                    </EmptyStateDetail>
                    <EmptyStateStep number={1}>Add paraprofessionals in Setup with the "Paraprofessional" role.</EmptyStateStep>
                    <EmptyStateStep number={2}>Link them to students who have para support in their IEP service requirements.</EmptyStateStep>
                  </EmptyState>
                ) :
                parasList.map(m => <StaffRow key={m.id} member={m} summary={providerMap[m.id]} />)}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="case_managers" className="mt-4">
          <Card>
            <div className="divide-y divide-gray-100">
              {isLoading ? [...Array(6)].map((_, i) => <Skeleton key={i} className="h-16 m-4" />) :
              caseManagers.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No Case Managers Added Yet"
                  compact
                  action={{ label: "Add Staff Member", href: "/setup" }}
                >
                  <EmptyStateDetail>
                    Case managers coordinate each student's IEP — scheduling team meetings, tracking deadlines, communicating with families, and ensuring all services are delivered. They're the hub of every student's SPED program.
                  </EmptyStateDetail>
                  <EmptyStateStep number={1}>Add case managers in Setup with the "Case Manager" role.</EmptyStateStep>
                  <EmptyStateStep number={2}>Assign them as the case manager on individual student records.</EmptyStateStep>
                </EmptyState>
              ) :
              caseManagers.map(cm => (
                <div key={cm.id} className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500 text-[13px] font-bold flex-shrink-0">
                    {cm.firstName?.[0]}{cm.lastName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-gray-800">{cm.firstName} {cm.lastName}</p>
                    <p className="text-[12px] text-gray-400">{cm.email}</p>
                  </div>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Case Manager</span>
                  <div className="w-6 flex-shrink-0 flex justify-center">
                    {cm.receiveRiskAlerts === false && (
                      <AlertOptOutIndicator staffId={cm.id} name={`${cm.firstName} ${cm.lastName}`} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
