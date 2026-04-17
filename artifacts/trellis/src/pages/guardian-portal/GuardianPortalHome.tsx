import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { FileText, Calendar, MessageSquare, User, ShieldCheck, Inbox } from "lucide-react";
import { Link } from "wouter";
import RoleFirstRunCard from "@/components/onboarding/RoleFirstRunCard";

interface GuardianMe {
  guardian: { id: number; name: string; relationship: string; email: string | null };
  student: { id: number; firstName: string; lastName: string; grade: string | null } | null;
}

export default function GuardianPortalHome() {
  const { data, isLoading, error } = useQuery<GuardianMe>({
    queryKey: ["guardian-portal-me"],
    queryFn: ({ signal }) =>
      authFetch("/api/guardian-portal/me", { signal }).then(r => {
        if (!r.ok) throw new Error("Failed to load profile");
        return r.json();
      }),
  });

  const { data: docsData } = useQuery<{ documents: Array<{ id: number; acknowledgedAt: string | null }> }>({
    queryKey: ["guardian-portal-documents"],
    queryFn: ({ signal }) =>
      authFetch("/api/guardian-portal/documents", { signal }).then(r => r.json()),
    enabled: !!data,
  });

  const { data: msgData } = useQuery<{ threads: any[]; unreadTotal: number }>({
    queryKey: ["guardian-portal-messages"],
    queryFn: ({ signal }) =>
      authFetch("/api/guardian-portal/messages", { signal }).then(r => r.ok ? r.json() : { threads: [], unreadTotal: 0 }),
    enabled: !!data,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl mx-auto mt-16 text-center">
        <ShieldCheck className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 text-sm">Unable to load your portal. Please contact your school administrator.</p>
      </div>
    );
  }

  const { guardian, student } = data;
  const docs = docsData?.documents ?? [];
  const pendingAck = docs.filter(d => !d.acknowledgedAt).length;
  const unreadMessages = msgData?.unreadTotal ?? 0;
  const messageThreads = msgData?.threads?.length ?? 0;
  const studentName = student ? `${student.firstName} ${student.lastName}` : "your child";
  // First-run signal: nothing has been shared with this guardian yet —
  // no documents, no message threads. (Meetings query is deferred so we
  // don't gate on it.) When true we show the role-specific empty state
  // alongside the four feature tiles instead of a row of zeros.
  const isFirstRun = docs.length === 0 && messageThreads === 0;
  const guardianFirstName = guardian.name?.split(" ")[0];

  return (
    <div className="max-w-3xl mx-auto space-y-6 p-1">
      <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <User className="w-6 h-6 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Welcome, {guardian.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {guardian.relationship ? `${guardian.relationship} of ` : ""}{studentName}
              {student?.grade ? ` · Grade ${student.grade}` : ""}
            </p>
            <p className="text-xs text-gray-400 mt-1">Secure portal — view documents, messages, and respond to your school team</p>
          </div>
        </div>
      </div>

      {/* Honest first-run guidance for guardians whose case manager
          hasn't shared anything yet. Replaces a screen full of "0"
          counts with what to expect and what to do now. */}
      {isFirstRun && <RoleFirstRunCard role="guardian" personName={guardianFirstName} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/guardian-portal/messages">
          <a className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer block group">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Inbox className="w-5 h-5 text-emerald-600" />
              </div>
              <span className="font-semibold text-gray-800 text-sm group-hover:text-emerald-700 transition-colors">Messages</span>
            </div>
            <p className="text-xs text-gray-500">
              {unreadMessages > 0 ? (
                <span className="text-emerald-600 font-medium">{unreadMessages} unread</span>
              ) : (
                "View inbox"
              )}
            </p>
          </a>
        </Link>

        <Link href="/guardian-portal/documents">
          <a className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer block group">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-amber-600" />
              </div>
              <span className="font-semibold text-gray-800 text-sm group-hover:text-emerald-700 transition-colors">Documents</span>
            </div>
            <p className="text-2xl font-bold text-gray-900">{docs.length}</p>
            <p className="text-xs text-gray-500 mt-1">
              {pendingAck > 0 ? (
                <span className="text-amber-600 font-medium">{pendingAck} pending acknowledgment</span>
              ) : (
                "All acknowledged"
              )}
            </p>
          </a>
        </Link>

        <Link href="/guardian-portal/meetings">
          <a className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer block group">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <span className="font-semibold text-gray-800 text-sm group-hover:text-emerald-700 transition-colors">Meetings</span>
            </div>
            <p className="text-xs text-gray-500">View IEP meetings</p>
          </a>
        </Link>

        <Link href="/guardian-portal/contact-history">
          <a className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer block group">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-purple-600" />
              </div>
              <span className="font-semibold text-gray-800 text-sm group-hover:text-emerald-700 transition-colors">Contact History</span>
            </div>
            <p className="text-xs text-gray-500">View school communications</p>
          </a>
        </Link>
      </div>

      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
        <p className="text-xs text-emerald-800">
          <span className="font-semibold">Your secure parent portal.</span>{" "}
          View documents, meetings, and messages from your child's education team.
          You can reply to messages and respond to conference requests directly through the portal.
        </p>
      </div>
    </div>
  );
}
