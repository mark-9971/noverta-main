import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ReadinessIndicator } from "@/components/meeting-prep-checklist";
import type { Meeting } from "./types";
import { MEETING_TYPES, MEETING_STATUS_CONFIG } from "./constants";

interface Props {
  meetings: Meeting[];
  loading: boolean;
  statusFilter: string;
  typeFilter: string;
  setStatusFilter: (s: string) => void;
  setTypeFilter: (s: string) => void;
  selectedMeetingId: number | null;
  expandedId: number | null;
  meetingReadiness: Record<number, number>;
  onSelectMeeting: (id: number) => void;
  onCreate: () => void;
  formatDate: (d: string | null) => string;
  daysFromNow: (d: string) => string;
}

export function MeetingList({
  meetings, loading, statusFilter, typeFilter, setStatusFilter, setTypeFilter,
  selectedMeetingId, expandedId, meetingReadiness, onSelectMeeting, onCreate,
  formatDate, daysFromNow,
}: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(MEETING_STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(MEETING_TYPES).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : meetings.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="No IEP meetings scheduled"
          description="Schedule an IEP meeting to track team decisions, participants, and required notices."
          action={{ label: "Schedule Meeting", onClick: onCreate }}
          compact
        />
      ) : (
        <div className="space-y-2">
          {meetings.map(m => {
            const sc = MEETING_STATUS_CONFIG[m.status] ?? MEETING_STATUS_CONFIG.scheduled;
            const isExpanded = expandedId === m.id;
            return (
              <Card key={m.id} className={`cursor-pointer transition-shadow hover:shadow-sm ${selectedMeetingId === m.id ? "ring-1 ring-emerald-300" : ""}`}
                onClick={() => onSelectMeeting(m.id)}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm text-gray-900 truncate">{m.studentName}</span>
                          <Badge variant="outline" className={sc.className + " text-xs"}>{sc.label}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                          <span>{MEETING_TYPES[m.meetingType] ?? m.meetingType}</span>
                          <span>{formatDate(m.scheduledDate)}</span>
                          {m.scheduledTime && <span>{m.scheduledTime}</span>}
                          {m.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{m.location}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.status === "scheduled" && meetingReadiness[m.id] !== undefined && (
                        <ReadinessIndicator percentage={meetingReadiness[m.id]} />
                      )}
                      <span className={`text-xs font-medium ${m.status === "scheduled" && m.scheduledDate < new Date().toISOString().split("T")[0] ? "text-red-600" : "text-gray-400"}`}>
                        {m.status === "scheduled" ? daysFromNow(m.scheduledDate) : ""}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
