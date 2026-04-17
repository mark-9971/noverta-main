import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { MessageSquare, Phone, Mail, FileText, Users } from "lucide-react";

interface Contact {
  id: number;
  contactType: string;
  contactDate: string;
  contactMethod: string | null;
  subject: string | null;
  outcome: string | null;
  contactedBy: string | null;
}

const METHOD_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  phone: Phone,
  email: Mail,
  letter: FileText,
  in_person: Users,
};

const METHOD_LABELS: Record<string, string> = {
  phone: "Phone call",
  email: "Email",
  letter: "Letter",
  in_person: "In-person meeting",
  text: "Text message",
  portal: "Portal message",
};

const TYPE_LABELS: Record<string, string> = {
  general_update: "General Update",
  iep_discussion: "IEP Discussion",
  behavior_incident: "Behavior / Incident",
  progress_report: "Progress Report",
  meeting_request: "Meeting Request",
  emergency: "Emergency Contact",
  other: "Contact",
};

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function GuardianContactHistory() {
  const { data, isLoading } = useQuery<{ contacts: Contact[] }>({
    queryKey: ["guardian-portal-contacts"],
    queryFn: ({ signal }) =>
      authFetch("/api/guardian-portal/contact-history", { signal }).then(r => {
        if (!r.ok) throw new Error("Failed to load contact history");
        return r.json();
      }),
  });

  const contacts = data?.contacts ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-1">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Contact History</h1>
          <p className="text-sm text-gray-500 mt-0.5">Record of communications between school staff and your family</p>
        </div>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">
          {contacts.length} {contacts.length === 1 ? "record" : "records"}
        </span>
      </div>

      {contacts.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-12 text-center">
          <MessageSquare className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">No contact history yet</p>
          <p className="text-xs text-gray-400 mt-1">Communications logged by your school team will appear here</p>
        </div>
      )}

      <div className="space-y-3">
        {contacts.map(c => {
          const MethodIcon = c.contactMethod ? (METHOD_ICONS[c.contactMethod] ?? MessageSquare) : MessageSquare;
          return (
            <div key={c.id} className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MethodIcon className="w-4 h-4 text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900 text-sm">
                      {c.subject || (TYPE_LABELS[c.contactType] ?? c.contactType)}
                    </p>
                    <span className="text-xs text-gray-400 flex-shrink-0">{formatDate(c.contactDate)}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {c.contactMethod && (
                      <span className="text-xs text-gray-500">
                        {METHOD_LABELS[c.contactMethod] ?? c.contactMethod}
                      </span>
                    )}
                    {c.contactedBy && (
                      <span className="text-xs text-gray-400">· {c.contactedBy}</span>
                    )}
                  </div>
                  {c.outcome && (
                    <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-md px-2.5 py-1.5">
                      {c.outcome}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
