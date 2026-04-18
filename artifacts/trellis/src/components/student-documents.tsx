import { useState, useEffect, useCallback } from "react";
import { FileText, Upload, Download, Trash2, Send, CheckCircle, Clock, X, Copy, FileUp, Loader2, Mail, MailX, MailCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";

const CATEGORIES = [
  { value: "iep", label: "IEP" },
  { value: "evaluation", label: "Evaluation" },
  { value: "consent", label: "Consent Form" },
  { value: "progress_report", label: "Progress Report" },
  { value: "prior_written_notice", label: "Prior Written Notice" },
  { value: "meeting_notes", label: "Meeting Notes" },
  { value: "medical", label: "Medical" },
  { value: "transition", label: "Transition" },
  { value: "behavior", label: "Behavior" },
  { value: "correspondence", label: "Correspondence" },
  { value: "other", label: "Other" },
];

const CATEGORY_COLORS: Record<string, string> = {
  iep: "bg-emerald-50 text-emerald-700",
  evaluation: "bg-blue-50 text-blue-700",
  consent: "bg-amber-50 text-amber-700",
  progress_report: "bg-purple-50 text-purple-700",
  prior_written_notice: "bg-orange-50 text-orange-700",
  meeting_notes: "bg-gray-100 text-gray-700",
  medical: "bg-red-50 text-red-700",
  transition: "bg-cyan-50 text-cyan-700",
  behavior: "bg-rose-50 text-rose-700",
  correspondence: "bg-indigo-50 text-indigo-700",
  other: "bg-gray-100 text-gray-600",
};

interface DocumentRecord {
  id: number;
  studentId: number;
  category: string;
  title: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  objectPath: string;
  status: string;
  notes: string | null;
  uploadedByUserId: string;
  uploadedByName: string | null;
  createdAt: string;
  signatureRequests: {
    id: number;
    recipientName: string;
    recipientEmail: string;
    status: string;
    signedAt: string | null;
    emailDelivery: {
      status: string;
      sentAt: string | null;
      deliveredAt: string | null;
      failedAt: string | null;
    } | null;
  }[];
}

type EmailDelivery = {
  status: string;
  sentAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
} | null;

function EmailDeliveryBadge({ delivery }: { delivery: EmailDelivery }) {
  if (!delivery) return null;
  const { status } = delivery;
  if (status === "not_configured") return null;
  if (status === "delivered") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-medium" title="Email delivered">
        <MailCheck className="w-3 h-3" /> delivered
      </span>
    );
  }
  if (status === "bounced" || status === "complained" || status === "failed") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-red-500 font-medium" title={`Email ${status}`}>
        <MailX className="w-3 h-3" /> {status}
      </span>
    );
  }
  if (status === "sent" || status === "queued") {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-500 font-medium" title="Email sent">
        <Mail className="w-3 h-3" /> sent
      </span>
    );
  }
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function StudentDocuments({ studentId }: { studentId: number }) {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [signDocId, setSignDocId] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadCategory, setUploadCategory] = useState("other");
  const [uploadNotes, setUploadNotes] = useState("");
  const [uploading, setUploading] = useState(false);

  const [signName, setSignName] = useState("");
  const [signEmail, setSignEmail] = useState("");
  const [signSending, setSignSending] = useState(false);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await authFetch(`/api/documents?studentId=${studentId}`);
      if (res.ok) {
        setDocuments(await res.json());
      }
    } catch (e) {
      console.error("Error fetching documents:", e);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const handleUpload = async () => {
    if (!uploadFile) return;
    setUploading(true);

    try {
      const urlRes = await authFetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: uploadFile.name,
          size: uploadFile.size,
          contentType: uploadFile.type || "application/octet-stream",
          studentId,
        }),
      });

      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await urlRes.json();

      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": uploadFile.type || "application/octet-stream" },
        body: uploadFile,
      });

      if (!putRes.ok) throw new Error("Failed to upload file");

      const docRes = await authFetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId,
          category: uploadCategory,
          title: uploadTitle || uploadFile.name,
          fileName: uploadFile.name,
          contentType: uploadFile.type || "application/octet-stream",
          fileSize: uploadFile.size,
          objectPath,
          notes: uploadNotes || undefined,
        }),
      });

      if (!docRes.ok) throw new Error("Failed to save document record");

      toast.success("Document uploaded successfully");
      setUploadOpen(false);
      resetUploadForm();
      fetchDocs();
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: DocumentRecord) => {
    try {
      const res = await authFetch(`/api/documents/${doc.id}/download`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error("Failed to download document");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await authFetch(`/api/documents/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("Document deleted");
        setDeleteConfirm(null);
        fetchDocs();
      } else {
        toast.error("Failed to delete document");
      }
    } catch {
      toast.error("Failed to delete document");
    }
  };

  const handleSignatureRequest = async () => {
    if (!signDocId || !signName || !signEmail) return;
    setSignSending(true);
    try {
      const res = await authFetch(`/api/documents/${signDocId}/signature-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientName: signName, recipientEmail: signEmail }),
      });
      if (!res.ok) throw new Error("Failed to create signature request");

      const data = await res.json();
      toast.success("Signature request created");

      if (data.signUrl) {
        navigator.clipboard.writeText(data.signUrl).then(() => {
          toast.success("Signing link copied to clipboard");
        }).catch(() => {});
      }

      setSignOpen(false);
      setSignName("");
      setSignEmail("");
      setSignDocId(null);
      fetchDocs();
    } catch {
      toast.error("Failed to create signature request");
    } finally {
      setSignSending(false);
    }
  };

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadTitle("");
    setUploadCategory("other");
    setUploadNotes("");
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" />
            Documents
          </CardTitle>
          <Button size="sm" onClick={() => setUploadOpen(true)} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-8 px-3">
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            Upload
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No documents uploaded yet</p>
              <p className="text-xs text-gray-400 mt-1">Upload IEPs, evaluations, consent forms, and more</p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                  <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-gray-900 truncate">{doc.title}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other}`}>
                        {CATEGORIES.find(c => c.value === doc.category)?.label || doc.category}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <span>{doc.fileName}</span>
                      <span>·</span>
                      <span>{formatFileSize(doc.fileSize)}</span>
                      <span>·</span>
                      <span>{formatDate(doc.createdAt)}</span>
                      {(doc.uploadedByName || doc.uploadedByUserId) && (
                        <>
                          <span>·</span>
                          <span>by {doc.uploadedByName || "Staff"}</span>
                        </>
                      )}
                    </div>
                    {doc.status !== "active" && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${doc.status === "archived" ? "bg-gray-100 text-gray-500" : "bg-red-50 text-red-600"}`}>
                        {doc.status}
                      </span>
                    )}
                    {doc.signatureRequests.length > 0 && (
                      <div className="mt-1.5 space-y-1">
                        {doc.signatureRequests.map((sr) => (
                          <div key={sr.id} className="flex items-center gap-1.5 text-xs flex-wrap">
                            {sr.status === "signed" ? (
                              <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                            ) : (
                              <Clock className="w-3 h-3 text-amber-500 flex-shrink-0" />
                            )}
                            <span className={sr.status === "signed" ? "text-emerald-600" : "text-amber-600"}>
                              {sr.recipientName}: {sr.status === "signed" ? `Signed ${sr.signedAt ? formatDate(sr.signedAt) : ""}` : "Pending"}
                            </span>
                            <EmailDeliveryBadge delivery={sr.emailDelivery} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => handleDownload(doc)} className="p-1.5 rounded-lg hover:bg-gray-100" title="Download">
                      <Download className="w-4 h-4 text-gray-500" />
                    </button>
                    <button onClick={() => { setSignDocId(doc.id); setSignOpen(true); }} className="p-1.5 rounded-lg hover:bg-gray-100" title="Request signature">
                      <Send className="w-4 h-4 text-gray-500" />
                    </button>
                    <button onClick={() => setDeleteConfirm(doc.id)} className="p-1.5 rounded-lg hover:bg-red-50" title="Delete">
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={uploadOpen} onOpenChange={(open) => { if (!open) { resetUploadForm(); } setUploadOpen(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>File</Label>
              {!uploadFile ? (
                <label className="mt-1 flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/30 transition-colors">
                  <div className="text-center">
                    <FileUp className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                    <span className="text-xs text-gray-500">Click to select a file</span>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.gif,.xlsx,.xls,.csv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) {
                        setUploadFile(f);
                        if (!uploadTitle) setUploadTitle(f.name.replace(/\.[^.]+$/, ""));
                      }
                    }}
                  />
                </label>
              ) : (
                <div className="mt-1 flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  <FileText className="w-4 h-4 text-gray-500" />
                  <span className="text-sm text-gray-700 truncate flex-1">{uploadFile.name}</span>
                  <span className="text-xs text-gray-400">{formatFileSize(uploadFile.size)}</span>
                  <button onClick={() => setUploadFile(null)} className="p-1 hover:bg-gray-200 rounded">
                    <X className="w-3 h-3 text-gray-500" />
                  </button>
                </div>
              )}
            </div>
            <div>
              <Label>Title</Label>
              <Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Document title" className="mt-1" />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={uploadCategory} onValueChange={setUploadCategory}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} placeholder="Optional notes" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetUploadForm(); setUploadOpen(false); }}>Cancel</Button>
            <Button onClick={handleUpload} disabled={!uploadFile || uploading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Uploading...</> : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Request E-Signature</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Recipient Name</Label>
              <Input value={signName} onChange={(e) => setSignName(e.target.value)} placeholder="Full name" className="mt-1" />
            </div>
            <div>
              <Label>Recipient Email</Label>
              <Input type="email" value={signEmail} onChange={(e) => setSignEmail(e.target.value)} placeholder="email@example.com" className="mt-1" />
            </div>
            <p className="text-xs text-gray-400">A unique signing link will be generated and copied to your clipboard. Share it with the recipient to collect their signature.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOpen(false)}>Cancel</Button>
            <Button onClick={handleSignatureRequest} disabled={!signName || !signEmail || signSending} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {signSending ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Sending...</> : "Create Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">Are you sure you want to delete this document? This action can be undone by an administrator.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
