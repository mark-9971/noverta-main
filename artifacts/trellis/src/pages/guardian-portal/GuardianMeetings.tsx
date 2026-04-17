import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { Calendar, Clock, MapPin, CheckCircle, AlertCircle } from "lucide-react";

interface Meeting {
  id: number;
  meetingType: string;
  scheduledDate: string;
  scheduledTime: string | null;
  status: string;
  location: string | null;
  minutesFinalized: boolean;
}

const MEETING_LABELS: Record<string, string> = {
  annual_review: "Annual Review",
  initial_eligibility: "Initial Eligibility",
  re_evaluation: "Re-Evaluation",
  amendment: "Amendment",
  transition: "Transition Planning",
  "504_meeting": "504 Meeting",
  other: "Meeting",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-gray-50 text-gray-500",
  rescheduled: "bg-amber-50 text-amber-700",
};

function formatDate(d: string): string {
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatTime(t: string | null): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
}

export default function GuardianMeetings() {
  const { data, isLoading } = useQuery<{ meetings: Meeting[] }>({
    queryKey: ["guardian-portal-meetings"],
    queryFn: ({ signal }) =>
      authFetch("/api/guardian-portal/meetings", { signal }).then(r => {
        if (!r.ok) throw new Error("Failed to load meetings");
        return r.json();
      }),
  });

  const meetings = data?.meetings ?? [];
  const today = new Date().toISOString().substring(0, 10);
  const upcoming = meetings.filter(m => m.scheduledDate >= today && m.status !== "cancelled");
  const past = meetings.filter(m => m.scheduledDate < today || m.status === "completed");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-1">
      <div>
        <h1 className="text-lg font-bold text-gray-900">IEP Meetings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upcoming and recent team meetings for your child</p>
      </div>

      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Upcoming</h2>
          {upcoming.map(m => (
            <MeetingCard key={m.id} meeting={m} />
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Past Meetings</h2>
          {past.map(m => (
            <MeetingCard key={m.id} meeting={m} />
          ))}
        </section>
      )}

      {meetings.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-12 text-center">
          <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">No meetings in the last 3 months</p>
          <p className="text-xs text-gray-400 mt-1">Contact your school team to schedule an IEP meeting</p>
        </div>
      )}
    </div>
  );
}

function MeetingCard({ meeting }: { meeting: Meeting }) {
  const today = new Date().toISOString().substring(0, 10);
  const isUpcoming = meeting.scheduledDate >= today && meeting.status !== "completed";
  const statusColor = STATUS_COLORS[meeting.status] ?? "bg-gray-50 text-gray-600";

  return (
    <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isUpcoming ? "bg-blue-50" : "bg-gray-50"}`}>
            <Calendar className={`w-4.5 h-4.5 ${isUpcoming ? "text-blue-600" : "text-gray-400"}`} />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">
              {MEETING_LABELS[meeting.meetingType] ?? meeting.meetingType}
            </p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Clock className="w-3 h-3" />
                {formatDate(meeting.scheduledDate)}
                {meeting.scheduledTime ? ` at ${formatTime(meeting.scheduledTime)}` : ""}
              </span>
              {meeting.location && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <MapPin className="w-3 h-3" />
                  {meeting.location}
                </span>
              )}
            </div>
            {meeting.minutesFinalized && (
              <div className="flex items-center gap-1 mt-2">
                <CheckCircle className="w-3 h-3 text-emerald-600" />
                <span className="text-xs text-emerald-700">Meeting minutes finalized</span>
              </div>
            )}
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium flex-shrink-0 ${statusColor}`}>
          {meeting.status.charAt(0).toUpperCase() + meeting.status.slice(1)}
        </span>
      </div>
    </div>
  );
}
