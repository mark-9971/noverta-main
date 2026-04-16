import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { authFetch } from "@/lib/auth-fetch";
import type { NeedsAttentionData } from "./types";

export function NeedsAttentionPanel() {
  const { data } = useQuery<NeedsAttentionData>({
    queryKey: ["dashboard-needs-attention"],
    queryFn: () => authFetch("/api/dashboard/needs-attention").then(r => r.ok ? r.json() : null),
    staleTime: 60_000,
  });

  if (!data || data.total === 0) return null;

  const items = [
    { label: "Open incidents", count: data.openIncidents, href: "/protective-measures?status=open", critical: true },
    { label: "Unresolved compliance alerts", count: data.unresolvedAlerts, href: "/compliance?filter=unresolved#timeline", critical: false },
    { label: "Overdue action items", count: data.overdueActionItems, href: "/iep-meetings?filter=overdue", critical: false },
    { label: "Notifications awaiting send", count: data.pendingNotifications, href: "/protective-measures?status=notification_pending", critical: false },
  ].filter(i => i.count > 0);

  return (
    <Card className="border-amber-200 bg-amber-50/20">
      <CardContent className="py-3 px-5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-shrink-0">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <span className="text-sm font-semibold text-amber-800">Needs Attention</span>
            <span className="text-xs font-bold rounded-full px-2 py-0.5 bg-amber-100 text-amber-700">{data.total}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
            {items.map(item => (
              <Link key={item.label} href={item.href}>
                <span className={`text-[12px] font-medium px-2.5 py-1 rounded-full cursor-pointer hover:opacity-80 transition-opacity ${item.critical ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"}`}>
                  <span className="font-bold">{item.count}</span> {item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function CriticalMedicalAlertsBanner() {
  const { data } = useQuery<any[]>({
    queryKey: ["dashboard-critical-medical-alerts"],
    queryFn: () => authFetch("/api/dashboard/critical-medical-alerts").then(r => r.ok ? r.json() : []),
    staleTime: 60_000,
  });

  if (!data || data.length === 0) return null;

  return (
    <Card className="border-red-200 bg-red-50/30">
      <CardContent className="py-3 px-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <span className="text-sm font-semibold text-red-800">Medical Events Today</span>
          <span className="text-xs font-bold rounded-full px-2 py-0.5 bg-red-100 text-red-700">{data.length}</span>
        </div>
        <div className="space-y-1 ml-7">
          {data.map((evt: any) => (
            <Link key={evt.id} href={`/students/${evt.studentId}`}>
              <div className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-red-50 rounded px-1 py-0.5 -mx-1 flex-wrap">
                {evt.emergencyServicesCalled && (
                  <span className="font-bold text-red-700 uppercase">911 Called</span>
                )}
                {evt.medicalAttentionRequired && !evt.emergencyServicesCalled && (
                  <span className="font-bold text-red-600">Medical Attention</span>
                )}
                {evt.studentInjury && !evt.emergencyServicesCalled && !evt.medicalAttentionRequired && (
                  <span className="font-semibold text-orange-600">Student Injury</span>
                )}
                <span className="text-gray-400">&middot;</span>
                <span className="text-gray-700">{evt.studentFirst} {evt.studentLast} (Gr. {evt.studentGrade})</span>
                {evt.incidentTime && (
                  <>
                    <span className="text-gray-400">&middot;</span>
                    <span className="text-gray-500">{evt.incidentTime}</span>
                  </>
                )}
                <span className="text-gray-400">&middot;</span>
                <span className="text-gray-600 truncate max-w-[300px]">
                  {evt.medicalDetails || evt.studentInjuryDescription || evt.behaviorDescription}
                </span>
                {evt.emergencyServicesCalled && (
                  <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">Requires Follow-Up</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
