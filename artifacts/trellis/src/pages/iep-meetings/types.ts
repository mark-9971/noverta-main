export interface Meeting {
  id: number;
  studentId: number;
  iepDocumentId: number | null;
  schoolId: number | null;
  meetingType: string;
  scheduledDate: string;
  scheduledTime: string | null;
  endTime: string | null;
  duration: number | null;
  location: string | null;
  meetingFormat: string | null;
  status: string;
  agendaItems: string[] | null;
  notes: string | null;
  actionItems: { id: string; description: string; assignee: string; dueDate: string | null; status: string }[] | null;
  outcome: string | null;
  followUpDate: string | null;
  minutesFinalized: boolean | null;
  consentStatus: string | null;
  noticeSentDate: string | null;
  cancelledReason: string | null;
  studentName?: string;
  studentGrade?: string | null;
  schoolName?: string | null;
  attendeeRecords?: Attendee[];
  priorWrittenNotices?: PWN[];
  consentRecords?: ConsentRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface Attendee {
  id: number;
  meetingId: number;
  staffId: number | null;
  name: string;
  role: string;
  email: string | null;
  isRequired: boolean;
  rsvpStatus: string;
  attended: boolean | null;
  submittedWrittenInput: boolean;
  writtenInputNotes: string | null;
  staffName: string | null;
}

export interface PWN {
  id: number;
  meetingId: number | null;
  studentId: number;
  noticeType: string;
  actionProposed: string;
  actionDescription: string | null;
  reasonForAction: string | null;
  optionsConsidered: string | null;
  reasonOptionsRejected: string | null;
  evaluationInfo: string | null;
  otherFactors: string | null;
  issuedDate: string | null;
  parentResponseDueDate: string | null;
  parentResponseReceived: string | null;
  parentResponseDate: string | null;
  status: string;
  notes: string | null;
}

export interface ConsentRecord {
  id: number;
  meetingId: number;
  studentId: number;
  consentType: string;
  decision: string;
  decisionDate: string | null;
  respondentName: string | null;
  respondentRelationship: string | null;
  notes: string | null;
}

export interface DashboardData {
  totalScheduled: number;
  upcomingCount: number;
  thisWeekCount: number;
  overdueCount: number;
  pendingConsentCount: number;
  completedCount: number;
  overdueAnnualReviews: number;
  upcomingMeetings: { id: number; studentName: string; meetingType: string; scheduledDate: string; studentGrade?: string | null }[];
  overdueMeetings: { id: number; studentName: string; meetingType: string; scheduledDate: string }[];
  overdueAnnualReviewStudents: { studentId: number; studentName: string; grade: string | null; iepEndDate: string }[];
}

export interface StudentOption { id: number; firstName: string; lastName: string; grade?: string | null }

export type DetailTab = "overview" | "prep" | "attendees" | "notices" | "consent";
