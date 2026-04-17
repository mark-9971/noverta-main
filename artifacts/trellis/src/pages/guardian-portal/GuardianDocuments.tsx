import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { FileText, CheckCircle, Clock, Printer, Eye, X } from "lucide-react";
import { toast } from "sonner";

interface SharedDoc {
  id: number;
  title: string;
  type: string;
  status: string;
  sharedAt: string | null;
  sharedByName: string | null;
  createdAt: string;
  hasHtml: boolean;
  acknowledgedAt: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  incident_report: "Incident Report",
  progress_report: "Progress Report",
  iep_draft: "IEP Draft",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function DocumentViewerModal({ docId, title, onClose }: { docId: number; title: string; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ htmlSnapshot: string | null; title: string }>({
    queryKey: ["guardian-doc-view", docId],
    queryFn: ({ signal }) =>
      authFetch(`/api/guardian-portal/documents/${docId}/view`, { signal }).then(r => {
        if (!r.ok) throw new Error("Failed to load document");
        return r.json();
      }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
          <div className="flex items-center gap-2">
            {data?.htmlSnapshot && (
              <button
                onClick={() => {
                  const win = window.open("", "_blank");
                  if (win) { win.document.write(data.htmlSnapshot!); win.document.close(); win.print(); }
                }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors">
                <Printer className="w-3.5 h-3.5" /> Print / Save as PDF
              </button>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {isLoading && (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!isLoading && data?.htmlSnapshot && (
            <iframe
              srcDoc={data.htmlSnapshot}
              className="w-full h-[600px] border border-gray-100 rounded"
              sandbox="allow-same-origin"
              title={title}
            />
          )}
          {!isLoading && !data?.htmlSnapshot && (
            <p className="text-center text-sm text-gray-500 py-12">Document preview not available. Contact your school team for a copy.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GuardianDocuments() {
  const queryClient = useQueryClient();
  const [viewingDoc, setViewingDoc] = useState<{ id: number; title: string } | null>(null);

  const { data, isLoading } = useQuery<{ documents: SharedDoc[] }>({
    queryKey: ["guardian-portal-documents"],
    queryFn: ({ signal }) =>
      authFetch("/api/guardian-portal/documents", { signal }).then(r => {
        if (!r.ok) throw new Error("Failed to load documents");
        return r.json();
      }),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (docId: number) =>
      authFetch(`/api/guardian-portal/documents/${docId}/acknowledge`, { method: "POST" }).then(async r => {
        if (!r.ok) throw new Error("Failed to acknowledge");
        return r.json();
      }),
    onSuccess: (result, docId) => {
      queryClient.invalidateQueries({ queryKey: ["guardian-portal-documents"] });
      if (result.alreadyAcknowledged) {
        toast.info("You already acknowledged this document.");
      } else {
        toast.success("Receipt acknowledged — thank you.");
      }
    },
    onError: () => toast.error("Could not record acknowledgment. Please try again."),
  });

  const docs = data?.documents ?? [];

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
          <h1 className="text-lg font-bold text-gray-900">Shared Documents</h1>
          <p className="text-sm text-gray-500 mt-0.5">Documents your school team has shared with you</p>
        </div>
        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">
          {docs.length} {docs.length === 1 ? "document" : "documents"}
        </span>
      </div>

      {docs.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-12 text-center">
          <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-600">No documents shared yet</p>
          <p className="text-xs text-gray-400 mt-1">Your school team will share documents here when available</p>
        </div>
      )}

      <div className="space-y-3">
        {docs.map(doc => (
          <div key={doc.id} className="bg-white rounded-xl border border-gray-200/80 shadow-sm p-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <FileText className="w-4.5 h-4.5 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-900 text-sm leading-snug">{doc.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {TYPE_LABELS[doc.type] ?? doc.type}
                      {doc.sharedByName ? ` · Shared by ${doc.sharedByName}` : ""}
                      {doc.sharedAt ? ` · ${formatDate(doc.sharedAt)}` : ""}
                    </p>
                  </div>
                  {doc.acknowledgedAt ? (
                    <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full flex-shrink-0">
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">Acknowledged</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-1 rounded-full flex-shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                      <span className="text-xs font-medium">Pending</span>
                    </div>
                  )}
                </div>

                {doc.acknowledgedAt && (
                  <p className="text-xs text-gray-400 mt-1">
                    Acknowledged {formatDate(doc.acknowledgedAt)}
                  </p>
                )}

                <div className="flex items-center gap-2 mt-3">
                  {doc.hasHtml && (
                    <button
                      onClick={() => setViewingDoc({ id: doc.id, title: doc.title })}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg transition-colors">
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                  )}
                  {!doc.acknowledgedAt && (
                    <button
                      onClick={() => acknowledgeMutation.mutate(doc.id)}
                      disabled={acknowledgeMutation.isPending}
                      className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors disabled:opacity-50">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {acknowledgeMutation.isPending ? "Confirming..." : "Acknowledge Receipt"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {viewingDoc && (
        <DocumentViewerModal
          docId={viewingDoc.id}
          title={viewingDoc.title}
          onClose={() => setViewingDoc(null)}
        />
      )}
    </div>
  );
}
