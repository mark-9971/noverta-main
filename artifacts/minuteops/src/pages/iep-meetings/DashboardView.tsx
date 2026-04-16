import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { CalendarDays, Clock, AlertTriangle, FileText } from "lucide-react";
import type { DashboardData } from "./types";
import { MEETING_TYPES } from "./constants";

interface Props {
  dashboard: DashboardData | null;
  onSelectMeeting: (id: number) => void;
  formatDate: (d: string | null) => string;
  daysFromNow: (d: string) => string;
}

export function DashboardView({ dashboard, onSelectMeeting, formatDate, daysFromNow }: Props) {
  if (!dashboard) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />)}
      </div>
    );
  }

  const stats = [
    { label: "This Week", value: dashboard.thisWeekCount, icon: CalendarDays, color: "text-emerald-600" },
    { label: "Upcoming (30d)", value: dashboard.upcomingCount, icon: Clock, color: "text-gray-600" },
    { label: "Overdue", value: dashboard.overdueCount, icon: AlertTriangle, color: "text-red-600" },
    { label: "Pending Consent", value: dashboard.pendingConsentCount, icon: FileText, color: "text-gray-500" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(s => (
          <Card key={s.label}>
            <CardContent className="py-4 px-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-xs text-gray-500">{s.label}</span>
              </div>
              <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {dashboard.overdueMeetings.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-red-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Overdue Meetings</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {dashboard.overdueMeetings.map(m => (
                <div key={m.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-red-50 cursor-pointer hover:bg-red-100 transition-colors"
                  onClick={() => onSelectMeeting(m.id)}>
                  <div>
                    <span className="text-sm font-medium text-gray-900">{m.studentName}</span>
                    <span className="text-xs text-gray-500 ml-2">{MEETING_TYPES[m.meetingType] ?? m.meetingType}</span>
                  </div>
                  <span className="text-xs text-red-600 font-medium">{daysFromNow(m.scheduledDate)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-emerald-600" /> Upcoming Meetings</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {dashboard.upcomingMeetings.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">No upcoming meetings</p>
            ) : dashboard.upcomingMeetings.map(m => (
              <div key={m.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onSelectMeeting(m.id)}>
                <div>
                  <span className="text-sm font-medium text-gray-900">{m.studentName}</span>
                  <span className="text-xs text-gray-500 ml-2">{MEETING_TYPES[m.meetingType] ?? m.meetingType}</span>
                </div>
                <span className="text-xs text-gray-500">{formatDate(m.scheduledDate)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {dashboard.overdueAnnualReviewStudents.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold text-gray-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" /> Annual Reviews Needed</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {dashboard.overdueAnnualReviewStudents.map(s => (
                <div key={s.studentId} className="flex items-center justify-between py-1.5 px-2 rounded bg-gray-50">
                  <div>
                    <Link href={`/students/${s.studentId}`} className="text-sm font-medium text-emerald-700 hover:underline">{s.studentName}</Link>
                    {s.grade && <span className="text-xs text-gray-500 ml-2">Grade {s.grade}</span>}
                  </div>
                  <span className="text-xs text-red-600">IEP ends {formatDate(s.iepEndDate)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
