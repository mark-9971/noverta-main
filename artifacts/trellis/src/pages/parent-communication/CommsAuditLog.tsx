import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, CheckCircle, AlertCircle, AlertTriangle, Ban, Clock, Inbox, Flag } from "lucide-react";
import { CommEvent } from "./types";

/**
 * Read-side rendering of the email delivery lifecycle.
 *
 * The platform deliberately distinguishes "accepted by mail provider" from
 * "delivered to recipient" — only the provider webhook can promote an email
 * to "delivered". UI must never claim delivery before that.
 *
 * Status taxonomy (mirrors lib/email.ts EmailStatus):
 *   queued, accepted, delivered, bounced, complained, failed, not_configured
 *   sent           — legacy alias for `accepted` (rows from before the split)
 */
type StatusBadge = {
  Icon: typeof Send;
  label: string;
  className: string;
  defaultTitle?: string;
};

function badgeFor(e: CommEvent): StatusBadge {
  // Surface complaints/bounces that arrived AFTER delivery. The webhook
  // does not downgrade `delivered` (the email did reach the inbox), but
  // ops/legal need to see that the recipient flagged it as spam or that
  // a later bounce arrived. We key off the auxiliary timestamps so these
  // events are never invisible.
  if (e.status === "delivered" && e.complainedAt) {
    return { Icon: Flag, label: "Delivered, then marked spam", className: "bg-orange-100 text-orange-700", defaultTitle: "Provider confirmed delivery; recipient later marked the email as spam/junk." };
  }
  if (e.status === "delivered" && e.bouncedAt) {
    return { Icon: AlertTriangle, label: "Delivered, then bounced", className: "bg-orange-100 text-orange-700", defaultTitle: "Provider confirmed delivery; a later bounce notification arrived (e.g., mailbox-full delayed bounce)." };
  }
  switch (e.status) {
    case "queued":
      return { Icon: Clock, label: "Queued", className: "bg-gray-100 text-gray-600", defaultTitle: "Awaiting hand-off to email provider" };
    case "sent": // legacy alias
    case "accepted":
      return { Icon: Send, label: "Accepted", className: "bg-blue-100 text-blue-700", defaultTitle: "Accepted by email provider — awaiting delivery confirmation" };
    case "delivered":
      return { Icon: CheckCircle, label: "Delivered", className: "bg-emerald-100 text-emerald-700", defaultTitle: "Provider confirmed delivery to the recipient" };
    case "bounced":
      return { Icon: AlertTriangle, label: "Bounced", className: "bg-red-100 text-red-700", defaultTitle: "Recipient address rejected the email" };
    case "complained":
      return { Icon: Flag, label: "Marked spam", className: "bg-orange-100 text-orange-700", defaultTitle: "Recipient marked the email as spam/junk" };
    case "failed":
      return { Icon: AlertCircle, label: "Failed", className: "bg-red-100 text-red-700", defaultTitle: "Delivery failed" };
    case "not_configured":
      return { Icon: Ban, label: "Not Configured", className: "bg-yellow-100 text-yellow-700", defaultTitle: "Add RESEND_API_KEY to enable real email delivery" };
    default:
      return { Icon: Inbox, label: e.status, className: "bg-gray-100 text-gray-600" };
  }
}

interface Props {
  loading: boolean;
  events: CommEvent[];
}

export function CommsAuditLog({ loading, events }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
          <Send className="w-4 h-4 text-blue-500" />
          Email Delivery Audit Log
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="w-full h-14" />)}</div>
        ) : events.length === 0 ? (
          <div className="text-center py-10">
            <Send className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No email events yet</p>
            <p className="text-xs text-gray-300 mt-1">Events appear here when parent notifications are sent</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 pr-3 text-gray-400 font-medium">Date</th>
                  <th className="text-left pb-2 pr-3 text-gray-400 font-medium">Student</th>
                  <th className="text-left pb-2 pr-3 text-gray-400 font-medium">Recipient</th>
                  <th className="text-left pb-2 pr-3 text-gray-400 font-medium">Subject</th>
                  <th className="text-left pb-2 pr-3 text-gray-400 font-medium">Type</th>
                  <th className="text-left pb-2 text-gray-400 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {events.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">
                      {new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="py-2.5 pr-3 font-medium text-gray-700 whitespace-nowrap">
                      {e.studentName ?? `#${e.studentId}`}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500">
                      <div>{e.toName ?? e.guardianName ?? "—"}</div>
                      {e.toEmail && <div className="text-gray-400">{e.toEmail}</div>}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-600 max-w-[200px] truncate">{e.subject}</td>
                    <td className="py-2.5 pr-3 text-gray-500 whitespace-nowrap">
                      {e.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                      {e.linkedIncidentId && (
                        <span className="ml-1 text-gray-400">#{e.linkedIncidentId}</span>
                      )}
                    </td>
                    <td className="py-2.5">
                      {(() => {
                        const b = badgeFor(e);
                        const title = e.failedReason || b.defaultTitle || "";
                        return (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${b.className}`} title={title}>
                            <b.Icon className="w-3 h-3" /> {b.label}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
