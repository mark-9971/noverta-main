import { useQuery } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { FileText, Calendar, MessageSquare, User, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

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
  const studentName = student ? `${student.firstName} ${student.lastName}` : "your child";

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
            <p className="text-xs text-gray-400 mt-1">Read-only portal — for questions contact your school team directly</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/guardian-portal/documents">
          <a className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-5 hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer block group">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-emerald-600" />
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
          <span className="font-semibold">This portal is read-only.</span>{" "}
          To make requests or ask questions, contact your school's SPED team directly.
          All documents shared here are official records from your child's education team.
        </p>
      </div>
    </div>
  );
}
