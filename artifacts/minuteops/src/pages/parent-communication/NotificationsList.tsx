import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, CheckCircle } from "lucide-react";
import { NotificationNeeded, SEVERITY_STYLES, formatDate } from "./types";

interface Props {
  loading: boolean;
  notificationNeeds: NotificationNeeded[];
  onLog: (n: NotificationNeeded) => void;
}

export function NotificationsList({ loading, notificationNeeds, onLog }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
          <Bell className="w-4 h-4 text-red-500" />
          Parent Notifications Required
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="w-full h-14" />)}</div>
        ) : notificationNeeds.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No pending notifications</p>
        ) : (
          <div className="space-y-2">
            {notificationNeeds.map(n => (
              <div key={n.alertId} className={`p-3 rounded-lg border flex items-center gap-3 ${SEVERITY_STYLES[n.severity] || SEVERITY_STYLES.medium}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link href={`/students/${n.studentId}`} className="text-sm font-medium hover:underline">
                      {n.studentName || `Student #${n.studentId}`}
                    </Link>
                    <span className="text-[10px] uppercase font-bold">{n.severity}</span>
                    {n.parentNotified && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-medium flex items-center gap-0.5">
                        <CheckCircle className="w-3 h-3" /> Notified
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5 line-clamp-1">{n.message}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] opacity-70">
                    <span>Alert: {formatDate(n.alertDate.substring(0, 10))}</span>
                    {n.lastContactDate && <span>Last contact: {formatDate(n.lastContactDate)}</span>}
                  </div>
                </div>
                {!n.parentNotified && (
                  <button
                    onClick={() => onLog(n)}
                    className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 flex-shrink-0"
                  >
                    Log Contact
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
