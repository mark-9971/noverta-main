import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, CheckCircle, AlertCircle, Ban } from "lucide-react";
import { CommEvent } from "./types";

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
                      {e.status === "sent" || e.status === "delivered" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                          <CheckCircle className="w-3 h-3" /> Sent
                        </span>
                      ) : e.status === "failed" || e.status === "bounced" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium" title={e.failedReason ?? ""}>
                          <AlertCircle className="w-3 h-3" /> Failed
                        </span>
                      ) : e.status === "not_configured" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium" title="Add RESEND_API_KEY to enable real email delivery">
                          <Ban className="w-3 h-3" /> Not Configured
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                          {e.status}
                        </span>
                      )}
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
