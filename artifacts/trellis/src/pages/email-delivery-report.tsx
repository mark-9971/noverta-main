import { useQuery } from "@tanstack/react-query";
import { Mail, AlertTriangle, CheckCircle2, XCircle, Inbox, RefreshCw } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

interface EmailDeliveryReport {
  stats: {
    total: number;
    byStatus: {
      delivered: number;
      bounced: number;
      failed: number;
      complained: number;
      queued: number;
      accepted: number;
      notConfigured: number;
    };
    deliveredPct: number;
    bouncedPct: number;
    failedPct: number;
    complainedPct: number;
  };
  recentFailures: Array<{
    id: number;
    messageType: string;
    recipientEmail: string;
    recipientName: string | null;
    subject: string;
    status: string;
    failedReason: string | null;
    attemptedAt: string | null;
    failedAt: string | null;
    lastWebhookAt: string | null;
    signatureRequestId: number | null;
    shareLinkId: number | null;
    iepMeetingId: number | null;
  }>;
}

const MESSAGE_TYPE_LABELS: Record<string, string> = {
  signature_request: "Signature request",
  share_link: "Progress share link",
  iep_meeting_invitation: "IEP meeting invitation",
};

const STATUS_BADGE: Record<string, string> = {
  bounced: "bg-red-50 text-red-700 border-red-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  complained: "bg-amber-50 text-amber-700 border-amber-200",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function EmailDeliveryReportPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<EmailDeliveryReport>({
    queryKey: ["admin", "email-deliveries"],
    queryFn: async () => {
      const r = await authFetch("/api/admin/email-deliveries");
      if (!r.ok) throw new Error("Failed to load email delivery report");
      return r.json();
    },
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-6 h-6 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        Failed to load email delivery report. Try refreshing.
      </div>
    );
  }

  const { stats, recentFailures } = data;
  const bouncedTotal = stats.byStatus.bounced + stats.byStatus.complained;
  const inFlight = stats.byStatus.queued + stats.byStatus.accepted;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Mail className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Email delivery</h2>
            <p className="text-sm text-gray-500">
              Delivery health for parent-facing emails — signature requests, progress share links,
              and IEP meeting invitations.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          data-testid="button-email-delivery-refresh"
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {stats.byStatus.notConfigured > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          {stats.byStatus.notConfigured} email{stats.byStatus.notConfigured === 1 ? "" : "s"} were
          intentionally skipped because email delivery is not configured. Configure your email
          provider in System Status to enable delivery.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Total sent"
          value={stats.total.toLocaleString()}
          icon={<Inbox className="w-4 h-4 text-gray-500" />}
          tone="neutral"
          testId="metric-total"
        />
        <MetricCard
          label="Delivered"
          value={`${stats.byStatus.delivered.toLocaleString()} (${stats.deliveredPct}%)`}
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />}
          tone="success"
          testId="metric-delivered"
        />
        <MetricCard
          label="Bounced / complained"
          value={`${bouncedTotal.toLocaleString()} (${(stats.bouncedPct + stats.complainedPct).toFixed(1)}%)`}
          icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
          tone="danger"
          testId="metric-bounced"
        />
        <MetricCard
          label="Failed"
          value={`${stats.byStatus.failed.toLocaleString()} (${stats.failedPct}%)`}
          icon={<XCircle className="w-4 h-4 text-red-600" />}
          tone="danger"
          testId="metric-failed"
        />
      </div>

      {inFlight > 0 && (
        <p className="text-xs text-gray-500">
          {inFlight} email{inFlight === 1 ? " is" : "s are"} still in flight (queued or accepted by
          provider, awaiting final webhook).
        </p>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Recent failures &amp; bounces</h3>
          <span className="text-xs text-gray-500">
            {recentFailures.length === 0
              ? "No problems in the recent window."
              : `Showing the ${recentFailures.length} most recent`}
          </span>
        </div>

        {recentFailures.length === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            No failed or bounced parent emails to follow up on. Nice.
          </div>
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Recipient</th>
                    <th className="text-left font-medium px-3 py-2">Context</th>
                    <th className="text-left font-medium px-3 py-2">Status</th>
                    <th className="text-left font-medium px-3 py-2">Reason</th>
                    <th className="text-left font-medium px-3 py-2">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recentFailures.map((f) => (
                    <tr key={f.id} data-testid={`row-failure-${f.id}`}>
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-gray-900">{f.recipientEmail}</div>
                        {f.recipientName && (
                          <div className="text-xs text-gray-500">{f.recipientName}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="text-gray-800">
                          {MESSAGE_TYPE_LABELS[f.messageType] ?? f.messageType}
                        </div>
                        <div className="text-xs text-gray-500 truncate max-w-[280px]" title={f.subject}>
                          {f.subject}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                            STATUS_BADGE[f.status] ?? "bg-gray-50 text-gray-700 border-gray-200"
                          }`}
                        >
                          {f.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-gray-700 max-w-[260px]">
                        {f.failedReason ?? "—"}
                      </td>
                      <td className="px-3 py-2 align-top text-xs text-gray-600 whitespace-nowrap">
                        {formatDate(f.failedAt ?? f.lastWebhookAt ?? f.attemptedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  tone,
  testId,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "neutral" | "success" | "danger";
  testId?: string;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 bg-emerald-50/40"
      : tone === "danger"
        ? "border-red-200 bg-red-50/40"
        : "border-gray-200 bg-white";
  return (
    <div className={`rounded-lg border ${toneClass} p-3`} data-testid={testId}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-gray-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-gray-900">{value}</div>
    </div>
  );
}
