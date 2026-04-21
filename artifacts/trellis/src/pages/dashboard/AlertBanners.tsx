import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
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
    { label: "Unresolved compliance alerts", count: data.unresolvedAlerts, href: "/compliance?tab=timeline", critical: false },
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

// Medical alert banners (LifeThreateningAlertsBanner, CriticalMedicalAlertsBanner)
// were intentionally removed from the dashboard. Medical info now lives only on
// the student detail page (Contacts & Medical tab) — and, when an SIS is
// connected, in the SIS health module. Keeping it off the dashboard avoids
// training users to dismiss critical alerts and reduces PHI exposure on
// shared screens.
