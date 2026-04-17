import { AlertTriangle } from "lucide-react";
import type { StaffAlert } from "./types";

export function AlertsBanner({
  alerts,
  dismissingAlerts,
  onResolve,
}: {
  alerts: StaffAlert[];
  dismissingAlerts: Set<number>;
  onResolve: (alertId: number) => void;
}) {
  if (alerts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {alerts.map(alert => (
        <div
          key={alert.id}
          className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
            alert.severity === "critical"
              ? "bg-red-50 border-red-200"
              : alert.severity === "warning"
              ? "bg-orange-50 border-orange-200"
              : "bg-blue-50 border-blue-200"
          }`}
        >
          <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
            alert.severity === "critical" ? "text-red-500" : alert.severity === "warning" ? "text-orange-500" : "text-blue-500"
          }`} />
          <div className="min-w-0 flex-1">
            {alert.studentName && (
              <p className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${
                alert.severity === "critical" ? "text-red-600" : alert.severity === "warning" ? "text-orange-600" : "text-blue-600"
              }`}>{alert.studentName}</p>
            )}
            <p className={`text-[13px] font-medium ${
              alert.severity === "critical" ? "text-red-800" : alert.severity === "warning" ? "text-orange-800" : "text-blue-800"
            }`}>{alert.message}</p>
            {alert.suggestedAction && (
              <p className={`text-[12px] mt-0.5 ${
                alert.severity === "critical" ? "text-red-600" : alert.severity === "warning" ? "text-orange-600" : "text-blue-600"
              }`}>{alert.suggestedAction}</p>
            )}
          </div>
          <button
            disabled={dismissingAlerts.has(alert.id)}
            onClick={() => onResolve(alert.id)}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 min-h-[36px] transition-colors ${
              alert.severity === "critical"
                ? "bg-red-100 text-red-700 active:bg-red-200"
                : alert.severity === "warning"
                ? "bg-orange-100 text-orange-700 active:bg-orange-200"
                : "bg-blue-100 text-blue-700 active:bg-blue-200"
            } disabled:opacity-50`}
          >
            Got it
          </button>
        </div>
      ))}
    </div>
  );
}
