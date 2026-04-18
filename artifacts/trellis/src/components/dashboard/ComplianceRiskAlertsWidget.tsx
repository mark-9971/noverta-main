import { Link } from "wouter";
import { AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import { useListAlerts } from "@workspace/api-client-react";
import type { Alert, ListAlertsParams, PaginatedResult } from "@workspace/api-client-react";
import { useSchoolContext } from "@/lib/school-context";

interface ParsedRow {
  alertId: number;
  studentId: number | null;
  serviceRequirementId: number | null;
  studentName: string;
  serviceType: string | null;
  percentComplete: number | null;
  severity: string;
}

const MESSAGE_RE = /is at (\d+(?:\.\d+)?)% of required (.+?) minutes/;

function parseAlert(a: Alert): ParsedRow {
  const m = a.message?.match(MESSAGE_RE);
  return {
    alertId: a.id,
    studentId: a.studentId ?? null,
    serviceRequirementId: a.serviceRequirementId ?? null,
    studentName: a.studentName ?? "Unknown student",
    serviceType: m?.[2] ?? null,
    percentComplete: m ? Number(m[1]) : null,
    severity: a.severity,
  };
}

const severityStyles: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: "bg-red-100", text: "text-red-700", label: "Critical" },
  high: { bg: "bg-red-50", text: "text-red-700", label: "High" },
  medium: { bg: "bg-amber-50", text: "text-amber-700", label: "Medium" },
  low: { bg: "bg-yellow-50", text: "text-yellow-700", label: "Low" },
};

function SeverityBadge({ severity }: { severity: string }) {
  const s = severityStyles[severity] ?? { bg: "bg-gray-100", text: "text-gray-700", label: severity };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${s.bg} ${s.text}`}
      data-testid={`badge-severity-${severity}`}
    >
      {s.label}
    </span>
  );
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function buildStudentServiceLink(studentId: number, serviceRequirementId: number | null): string {
  // The IEP & Goals tab on the student detail page mounts StudentServiceSection,
  // which is the "service detail" surface. When the alert is tied to a specific
  // service requirement, we pass it through so the page can scroll/highlight.
  const qs = new URLSearchParams({ tab: "iep" });
  if (serviceRequirementId) qs.set("serviceId", String(serviceRequirementId));
  return `/students/${studentId}?${qs.toString()}`;
}

export default function ComplianceRiskAlertsWidget({ limit = 5 }: { limit?: number }) {
  const { typedFilter } = useSchoolContext();

  const params: ListAlertsParams = {
    resolved: "false",
    snoozed: "false",
    type: "compliance_risk",
    ...(typedFilter.schoolId !== undefined ? { schoolId: typedFilter.schoolId } : {}),
    ...(typedFilter.districtId !== undefined ? { districtId: typedFilter.districtId } : {}),
  };

  const { data, isLoading, isError } = useListAlerts<PaginatedResult<Alert>>(params);

  const alerts: Alert[] = data?.data ?? [];

  const rows = alerts
    .map(parseAlert)
    .sort((a, b) => {
      const sa = SEVERITY_RANK[a.severity] ?? 99;
      const sb = SEVERITY_RANK[b.severity] ?? 99;
      if (sa !== sb) return sa - sb;
      return (a.percentComplete ?? 100) - (b.percentComplete ?? 100);
    });

  const visible = rows.slice(0, limit);
  const hiddenCount = Math.max(0, rows.length - visible.length);

  return (
    <section
      className="rounded-2xl border border-gray-200 bg-white shadow-sm"
      data-testid="widget-compliance-risk-alerts"
    >
      <div className="flex items-center justify-between px-5 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-600" />
          <h2 className="text-sm font-semibold text-gray-900">Compliance risk alerts</h2>
          {rows.length > 0 && (
            <span className="text-xs text-gray-500" data-testid="text-compliance-risk-count">
              ({rows.length})
            </span>
          )}
        </div>
        {rows.length > 0 && (
          <Link
            href="/alerts?type=compliance_risk"
            className="text-xs text-emerald-700 hover:text-emerald-800 inline-flex items-center gap-1"
            data-testid="link-view-all-compliance-risk"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="px-5 pb-5 space-y-2" data-testid="loading-compliance-risk">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 rounded-md bg-gray-50 animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <p className="px-5 pb-5 text-xs text-red-600">
          Couldn't load compliance alerts. Try again in a moment.
        </p>
      ) : rows.length === 0 ? (
        <div
          className="px-5 pb-5 text-xs text-gray-500 flex items-center gap-2"
          data-testid="empty-compliance-risk"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-emerald-600" />
          No open compliance risk alerts. Nice work.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {visible.map((row) => {
            const inner = (
              <div className="px-5 py-2.5 flex items-center gap-3 hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-medium text-gray-900 truncate"
                      data-testid={`text-student-${row.studentId ?? "unknown"}`}
                    >
                      {row.studentName}
                    </span>
                    <SeverityBadge severity={row.severity} />
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {row.serviceType ?? "Service minute compliance"}
                  </p>
                </div>
                {row.percentComplete !== null && (
                  <div className="text-right min-w-[60px]">
                    <div className="text-sm font-semibold text-gray-900 tabular-nums">
                      {Math.round(row.percentComplete)}%
                    </div>
                    <div className="text-[10px] text-gray-500">complete</div>
                  </div>
                )}
              </div>
            );
            return (
              <li key={row.alertId}>
                {row.studentId ? (
                  <Link
                    href={buildStudentServiceLink(row.studentId, row.serviceRequirementId)}
                    className="block"
                    data-testid={`link-compliance-alert-${row.alertId}`}
                  >
                    {inner}
                  </Link>
                ) : (
                  <div data-testid={`row-compliance-alert-${row.alertId}`}>{inner}</div>
                )}
              </li>
            );
          })}
          {hiddenCount > 0 && (
            <li className="px-5 py-2 text-xs text-gray-500 bg-gray-50">
              +{hiddenCount} more compliance risk alert{hiddenCount === 1 ? "" : "s"}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
