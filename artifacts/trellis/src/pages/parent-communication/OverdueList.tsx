import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, AlertTriangle } from "lucide-react";
import { Contact, formatDate } from "./types";

interface Props {
  loading: boolean;
  overdueFollowups: Contact[];
  onResolve: (c: Contact) => void;
}

export function OverdueList({ loading, overdueFollowups, onResolve }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
          <Clock className="w-4 h-4 text-red-500" />
          Overdue Follow-ups
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="w-full h-14" />)}</div>
        ) : overdueFollowups.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">No overdue follow-ups</p>
        ) : (
          <div className="space-y-2">
            {overdueFollowups.map(c => (
              <div key={c.id} className="p-3 rounded-lg bg-red-50/50 border border-red-100 flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{c.studentName || `Student #${c.studentId}`}</p>
                  <p className="text-xs text-gray-500">{c.subject}</p>
                  <p className="text-[11px] text-red-500 mt-0.5">Due: {formatDate(c.followUpDate || "")}</p>
                </div>
                <button
                  onClick={() => onResolve(c)}
                  className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
