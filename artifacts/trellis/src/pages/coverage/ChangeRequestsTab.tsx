import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { RefreshCw, CheckCircle, XCircle, Clock, User, ArrowLeftRight, Filter } from "lucide-react";

const DAY_LABELS: Record<string, string> = {
  monday: "Mon", tuesday: "Tue", wednesday: "Wed",
  thursday: "Thu", friday: "Fri",
};

const REQUEST_TYPE_LABELS: Record<string, string> = {
  swap_time: "Time Swap",
  coverage_request: "Coverage Request",
  other: "Other",
};

function fmt12(time: string) {
  const [h, m] = time.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function ChangeRequestsTab({ schoolId }: { schoolId?: number | null }) {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [reviewDialog, setReviewDialog] = useState<any | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"approved" | "denied">("approved");
  const [adminNotes, setAdminNotes] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      const r = await authFetch(`/api/schedules/change-requests?${params}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to load change requests");
      setRequests(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load change requests");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, schoolId]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  async function handleReview() {
    if (!reviewDialog) return;
    setReviewing(true);
    try {
      const r = await authFetch(`/api/schedules/change-requests/${reviewDialog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: reviewStatus, adminNotes: adminNotes || undefined }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to update request");
      toast.success(`Request ${reviewStatus === "approved" ? "approved" : "denied"}`);
      setReviewDialog(null);
      setAdminNotes("");
      loadRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setReviewing(false);
    }
  }

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-gray-400" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 text-[13px] w-36">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="" className="text-[13px]">All Statuses</SelectItem>
              <SelectItem value="pending" className="text-[13px]">Pending</SelectItem>
              <SelectItem value="approved" className="text-[13px]">Approved</SelectItem>
              <SelectItem value="denied" className="text-[13px]">Denied</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={loadRequests} className="h-8 gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
        {pendingCount > 0 && (
          <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 gap-1 ml-auto">
            <Clock className="h-3 w-3" />
            {pendingCount} pending review
          </Badge>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <ArrowLeftRight className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-[13px]">No change requests{statusFilter ? ` with status "${statusFilter}"` : ""} found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req: any) => (
            <div
              key={req.id}
              className={`flex items-start gap-3 px-4 py-3 rounded-lg border text-[13px] ${
                req.status === "pending"
                  ? "bg-amber-50/40 border-amber-100"
                  : req.status === "approved"
                    ? "bg-emerald-50/40 border-emerald-100"
                    : "bg-gray-50 border-gray-100"
              }`}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-800 flex items-center gap-1">
                    <User className="h-3.5 w-3.5 text-gray-400" />
                    {req.staffName ?? `Staff #${req.staffId}`}
                  </span>
                  <Badge variant="outline" className="text-[11px] py-0 px-1.5">
                    {REQUEST_TYPE_LABELS[req.requestType] ?? req.requestType}
                  </Badge>
                  {req.staffRole && (
                    <span className="text-[11px] text-gray-400">{req.staffRole}</span>
                  )}
                </div>
                {(req.blockDayOfWeek || req.studentName) && (
                  <div className="text-[12px] text-gray-500 flex items-center gap-2 flex-wrap">
                    {req.blockDayOfWeek && (
                      <span className="font-medium">{DAY_LABELS[req.blockDayOfWeek] ?? req.blockDayOfWeek}</span>
                    )}
                    {req.blockStartTime && req.blockEndTime && (
                      <span>{fmt12(req.blockStartTime)} – {fmt12(req.blockEndTime)}</span>
                    )}
                    {req.blockLocation && <span>· {req.blockLocation}</span>}
                    {req.studentName && <span>· {req.studentName}</span>}
                    {req.serviceTypeName && <span>· {req.serviceTypeName}</span>}
                  </div>
                )}
                {req.requestedDate && (
                  <div className="text-[12px] text-gray-400">
                    Requested: {req.requestedDate}
                    {req.requestedStartTime && ` · ${fmt12(req.requestedStartTime)}–${fmt12(req.requestedEndTime ?? req.requestedStartTime)}`}
                  </div>
                )}
                {req.notes && <p className="text-[12px] text-gray-500 italic">"{req.notes}"</p>}
                {req.adminNotes && (
                  <div className="text-[12px] text-gray-600 bg-white rounded px-2 py-1">
                    <span className="font-medium">Admin note: </span>{req.adminNotes}
                    {req.reviewerName && <span className="text-gray-400"> — {req.reviewerName}</span>}
                  </div>
                )}
                <div className="text-[11px] text-gray-400">
                  Submitted {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : ""}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {req.status === "pending" ? (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[12px] border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => { setReviewDialog(req); setReviewStatus("approved"); setAdminNotes(""); }}
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[12px] border-red-200 text-red-700 hover:bg-red-50"
                      onClick={() => { setReviewDialog(req); setReviewStatus("denied"); setAdminNotes(""); }}
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" />
                      Deny
                    </Button>
                  </>
                ) : (
                  <span className={`text-[12px] font-medium flex items-center gap-1 ${
                    req.status === "approved" ? "text-emerald-700" : "text-red-600"
                  }`}>
                    {req.status === "approved" ? (
                      <CheckCircle className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    {req.status === "approved" ? "Approved" : "Denied"}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!reviewDialog} onOpenChange={v => { if (!v) { setReviewDialog(null); setAdminNotes(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800">
              {reviewStatus === "approved" ? "Approve" : "Deny"} Change Request
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {reviewDialog && (
              <div className="text-[13px] text-gray-600 bg-gray-50 rounded-lg px-3 py-2.5 space-y-0.5">
                <div className="font-medium text-gray-800">{reviewDialog.staffName}</div>
                <div className="text-gray-500">
                  {REQUEST_TYPE_LABELS[reviewDialog.requestType] ?? reviewDialog.requestType}
                  {reviewDialog.blockDayOfWeek && ` · ${DAY_LABELS[reviewDialog.blockDayOfWeek] ?? reviewDialog.blockDayOfWeek}`}
                  {reviewDialog.blockStartTime && ` ${fmt12(reviewDialog.blockStartTime)}–${fmt12(reviewDialog.blockEndTime ?? reviewDialog.blockStartTime)}`}
                </div>
                {reviewDialog.notes && <div className="text-gray-400 italic text-[12px]">"{reviewDialog.notes}"</div>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">
                Decision
              </Label>
              <Select value={reviewStatus} onValueChange={v => setReviewStatus(v as "approved" | "denied")}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="approved" className="text-[13px]">Approve</SelectItem>
                  <SelectItem value="denied" className="text-[13px]">Deny</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Note to provider (optional)</Label>
              <Textarea
                value={adminNotes}
                onChange={e => setAdminNotes(e.target.value)}
                placeholder="Reason or instructions…"
                className="text-[13px] min-h-[70px] resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setReviewDialog(null)} disabled={reviewing}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleReview}
              disabled={reviewing}
              className={reviewStatus === "approved"
                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                : "bg-red-600 hover:bg-red-700 text-white"}
            >
              {reviewing ? "Saving…" : reviewStatus === "approved" ? "Approve" : "Deny"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
