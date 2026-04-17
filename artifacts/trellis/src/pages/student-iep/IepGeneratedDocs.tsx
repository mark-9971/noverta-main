import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2, Minus as MinusIcon, Printer, Users } from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";

const DOC_TYPE_LABELS: Record<string, string> = {
  incident_report: "Incident Report",
  progress_report: "Progress Report",
  iep_draft: "IEP Draft",
};
const DOC_STATUS_COLORS: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700",
  finalized: "bg-emerald-100 text-emerald-700",
  archived: "bg-gray-100 text-gray-500",
};

export type GeneratedDoc = {
  id: number; studentId: number; type: string; status: string; title: string;
  linkedRecordId: number | null; createdByName: string | null; createdAt: string;
  guardianVisible: boolean; sharedAt: string | null; sharedByName: string | null;
  acknowledgedCount: number;
};

export function GeneratedDocsPanel({ studentId }: { studentId: number }) {
  const [docs, setDocs] = useState<GeneratedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const [reprinting, setReprinting] = useState<number | null>(null);
  const [sharing, setSharing] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/generated-documents?studentId=${studentId}`);
      if (res.ok) setDocs(await res.json() as GeneratedDoc[]);
    } catch { /* ignore */ }
    setLoading(false);
  }, [studentId]);

  useEffect(() => { void load(); }, [load]);

  async function updateStatus(id: number, status: string) {
    setUpdating(id);
    try {
      const res = await authFetch(`/api/generated-documents/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { toast.error("Could not update document status"); return; }
      setDocs(d => d.map(doc => doc.id === id ? { ...doc, status } : doc));
    } catch { toast.error("Failed to update status"); }
    setUpdating(null);
  }

  async function toggleShare(id: number, guardianVisible: boolean) {
    setSharing(id);
    try {
      const res = await authFetch(`/api/generated-documents/${id}/share`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardianVisible }),
      });
      if (!res.ok) { toast.error("Could not update sharing"); setSharing(null); return; }
      const updated = await res.json() as Pick<GeneratedDoc, "guardianVisible" | "sharedAt" | "sharedByName">;
      setDocs(d => d.map(doc => doc.id === id ? { ...doc, ...updated } : doc));
      toast.success(guardianVisible ? "Shared with family portal" : "Removed from family portal");
    } catch { toast.error("Failed to update sharing"); }
    setSharing(null);
  }

  async function handleReprint(id: number) {
    setReprinting(id);
    try {
      const res = await authFetch(`/api/generated-documents/${id}`);
      if (!res.ok) { toast.error("Could not load document"); return; }
      const doc = await res.json() as GeneratedDoc & { htmlSnapshot: string | null };
      if (!doc.htmlSnapshot) { toast.error("No saved content for this document"); return; }
      const blob = new Blob([doc.htmlSnapshot], { type: "text/html" });
      const blobUrl = URL.createObjectURL(blob);
      const win = window.open(blobUrl, "_blank");
      if (!win) { URL.revokeObjectURL(blobUrl); toast.error("Please allow pop-ups to open print preview"); return; }
      setTimeout(() => { win.print(); URL.revokeObjectURL(blobUrl); }, 600);
    } catch { toast.error("Failed to open document"); }
    setReprinting(null);
  }

  if (loading) return (
    <div className="space-y-2 py-4">
      {[0, 1, 2].map(i => (
        <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
      ))}
    </div>
  );

  if (!docs.length) return (
    <div className="py-12 text-center text-gray-400 text-sm">
      <Download className="w-8 h-8 mx-auto mb-2 opacity-30" />
      No generated documents yet. Use Print buttons on Progress Reports, Incident Reports, or the IEP Builder to generate documents.
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Documents generated from Progress Reports, IEP Builder, and Incident Reports are saved here for re-download.
        Use the <span className="font-medium">Share with Family</span> toggle to make a document visible in the parent portal.
      </p>
      {docs.map(doc => (
        <div key={doc.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-sm font-medium text-gray-800 truncate">{doc.title}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${DOC_STATUS_COLORS[doc.status] ?? "bg-gray-100 text-gray-500"}`}>
                  {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                </span>
                {doc.guardianVisible && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-50 text-emerald-700 flex items-center gap-1">
                    <Users className="w-2.5 h-2.5" />
                    Shared with family
                    {doc.acknowledgedCount > 0 && ` · ${doc.acknowledgedCount} acknowledged`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-gray-400 flex-wrap">
                <span>{DOC_TYPE_LABELS[doc.type] ?? doc.type}</span>
                <span>·</span>
                <span>{new Date(doc.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                {doc.createdByName && <><span>·</span><span>by {doc.createdByName}</span></>}
                {doc.guardianVisible && doc.sharedAt && (
                  <><span>·</span><span>shared {new Date(doc.sharedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></>
                )}
              </div>
              {doc.guardianVisible && doc.acknowledgedCount === 0 && (
                <p className="text-[10px] text-amber-600 mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                  Not yet acknowledged by guardian
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {doc.status !== "archived" && (
                <button
                  onClick={() => toggleShare(doc.id, !doc.guardianVisible)}
                  disabled={sharing === doc.id}
                  className={`flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-colors disabled:opacity-50 ${
                    doc.guardianVisible
                      ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                      : "bg-gray-50 hover:bg-gray-100 text-gray-500"
                  }`}
                  title={doc.guardianVisible ? "Remove from family portal" : "Share with family portal"}
                >
                  {sharing === doc.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Users className="w-3 h-3" />
                  )}
                  {doc.guardianVisible ? "Shared" : "Share"}
                </button>
              )}
              {doc.status !== "archived" && (
                <button
                  onClick={() => handleReprint(doc.id)}
                  disabled={reprinting === doc.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 disabled:opacity-50"
                  title="Re-open and print"
                >
                  {reprinting === doc.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Printer className="w-3 h-3" />
                  )}
                  Print
                </button>
              )}
              {doc.status === "draft" && (
                <button
                  onClick={() => updateStatus(doc.id, "finalized")}
                  disabled={updating === doc.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-emerald-50 hover:bg-emerald-100 rounded-lg text-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Finalize
                </button>
              )}
              {doc.status !== "archived" && (
                <button
                  onClick={() => updateStatus(doc.id, "archived")}
                  disabled={updating === doc.id}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-gray-400 hover:text-gray-600 rounded-lg disabled:opacity-50"
                  title="Archive"
                >
                  <MinusIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
