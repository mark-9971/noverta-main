import { MessageSquare, Phone, Mail, Users } from "lucide-react";

export type Contact = {
  id: number;
  studentId: number;
  contactType: string;
  contactDate: string;
  contactMethod: string;
  subject: string;
  notes: string | null;
  outcome: string | null;
  followUpNeeded: string | null;
  followUpDate: string | null;
  contactedBy: string | null;
  parentName: string | null;
  notificationRequired: boolean;
  relatedAlertId: number | null;
  studentName: string | null;
  studentGrade: string | null;
  createdAt: string;
};

export type NotificationNeeded = {
  alertId: number;
  alertType: string;
  severity: string;
  studentId: number;
  studentName: string | null;
  message: string;
  alertDate: string;
  parentNotified: boolean;
  lastContactDate: string | null;
};

export type CommEvent = {
  id: number;
  studentId: number;
  studentName: string | null;
  guardianName: string | null;
  staffName: string | null;
  channel: string;
  status: string;
  type: string;
  subject: string;
  toEmail: string | null;
  toName: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  deliveredAt: string | null;
  bouncedAt: string | null;
  complainedAt: string | null;
  failedAt: string | null;
  failedReason: string | null;
  lastWebhookEventType: string | null;
  lastWebhookAt: string | null;
  createdAt: string;
  linkedIncidentId: number | null;
};

export type FormData = {
  studentId: string;
  contactType: string;
  contactDate: string;
  contactMethod: string;
  subject: string;
  notes: string;
  outcome: string;
  followUpNeeded: string;
  followUpDate: string;
  contactedBy: string;
  parentName: string;
  notificationRequired: boolean;
  relatedAlertId: string;
};

export const METHOD_ICONS: Record<string, any> = {
  phone: Phone,
  email: Mail,
  "in-person": Users,
  letter: MessageSquare,
};

export const METHOD_LABELS: Record<string, string> = {
  phone: "Phone",
  email: "Email",
  "in-person": "In-Person",
  letter: "Letter",
};

export const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  high: "bg-red-50 text-red-600 border-red-100",
  medium: "bg-gray-100 text-gray-700 border-gray-200",
  low: "bg-gray-50 text-gray-500 border-gray-100",
};

export function formatDate(d: string) {
  if (!d) return "\u2014";
  const date = new Date(d + "T00:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
