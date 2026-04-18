import { useState, useCallback, useEffect } from "react";
import { useRole } from "@/lib/role-context";
import { Redirect } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import {
  CalendarDays, Clock, MapPin, User, RefreshCw, PlusCircle, CheckCircle,
  AlertTriangle, XCircle, ArrowLeftRight,
} from "lucide-react";

const PROVIDER_ROLES = ["provider", "sped_teacher", "bcba", "para", "case_manager"];

const DAY_LABELS: Record<string, string> = {
  monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday",
  thursday: "Thursday", friday: "Friday",
};

const DAY_ORDER: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4,
};

function fmt12(time: string) {
  const [h, m] = time.split(":").map(Number);
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

const REQUEST_TYPE_LABELS: Record<string, string> = {
  swap_time: "Time Swap",
  coverage_request: "Coverage Request",
  other: "Other",
};

const STATUS_BADGE: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pending: { label: "Pending", className: "text-amber-700 border-amber-200 bg-amber-50", icon: Clock },
  approved: { label: "Approved", className: "text-emerald-700 border-emerald-200 bg-emerald-50", icon: CheckCircle },
  denied: { label: "Denied", className: "text-red-700 border-red-200 bg-red-50", icon: XCircle },
};

export default function MySchedulePage() {
  const { role } = useRole();

  if (!PROVIDER_ROLES.includes(role)) return <Redirect to="/" />;

  return <MyScheduleContent />;
}

function MyScheduleContent() {
  const [blocks, setBlocks] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loadingBlocks, setLoadingBlocks] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requestDialog, setRequestDialog] = useState<any | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    requestType: "coverage_request" as string,
    notes: "",
    requestedDate: "",
    requestedStartTime: "",
    requestedEndTime: "",
  });

  const loadBlocks = useCallback(async () => {
    setLoadingBlocks(true);
    try {
      const r = await authFetch("/api/schedules/my-schedule");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to load schedule");
      setBlocks(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load your schedule");
    } finally {
      setLoadingBlocks(false);
    }
  }, []);

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const r = await authFetch("/api/schedules/change-requests");
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to load requests");
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      // Non-fatal — some accounts may not have staffId yet
      setRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  useEffect(() => {
    loadBlocks();
    loadRequests();
  }, [loadBlocks, loadRequests]);

  const sortedBlocks = [...blocks].sort((a, b) => {
    const dayDiff = (DAY_ORDER[a.dayOfWeek] ?? 9) - (DAY_ORDER[b.dayOfWeek] ?? 9);
    if (dayDiff !== 0) return dayDiff;
    return (a.startTime ?? "").localeCompare(b.startTime ?? "");
  });

  const blocksByDay = sortedBlocks.reduce<Record<string, any[]>>((acc, b) => {
    const day = b.dayOfWeek;
    if (!acc[day]) acc[day] = [];
    acc[day].push(b);
    return acc;
  }, {});

  const days = Object.keys(blocksByDay).sort((a, b) => (DAY_ORDER[a] ?? 9) - (DAY_ORDER[b] ?? 9));

  async function handleSubmitRequest() {
    if (!requestDialog && !form.requestType) return;
    setSubmitting(true);
    try {
      const body: any = {
        requestType: form.requestType,
        notes: form.notes || undefined,
        requestedDate: form.requestedDate || undefined,
        requestedStartTime: form.requestedStartTime || undefined,
        requestedEndTime: form.requestedEndTime || undefined,
      };
      if (requestDialog?.id) {
        body.scheduleBlockId = requestDialog.id;
      }

      const r = await authFetch("/api/schedules/change-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Failed to submit request");
      toast.success("Change request submitted. An admin will review it shortly.");
      setRequestDialog(null);
      setForm({ requestType: "coverage_request", notes: "", requestedDate: "", requestedStartTime: "", requestedEndTime: "" });
      loadRequests();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  }

  const pendingCount = requests.filter(r => r.status === "pending").length;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1000px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-[18px] font-semibold text-gray-900">My Schedule</h1>
          <p className="text-sm text-gray-500 mt-0.5">Your weekly recurring sessions and service blocks.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { loadBlocks(); loadRequests(); }}
            className="h-8 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => {
              setRequestDialog(null);
              setForm({ requestType: "coverage_request", notes: "", requestedDate: "", requestedStartTime: "", requestedEndTime: "" });
              setRequestDialog({ general: true });
            }}
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Request Change
          </Button>
        </div>
      </div>

      {loadingBlocks ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : days.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CalendarDays className="h-10 w-10 mx-auto mb-3 text-gray-300" />
            <p className="text-[14px] font-medium text-gray-500">No schedule blocks found</p>
            <p className="text-[13px] text-gray-400 mt-1">Your administrator hasn't assigned any recurring sessions yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {days.map(day => (
            <Card key={day}>
              <CardHeader className="pb-2 pt-4 px-4">
                <h2 className="text-[13px] font-semibold text-gray-700 uppercase tracking-wide">
                  {DAY_LABELS[day] ?? day}
                </h2>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {blocksByDay[day].map((block: any) => (
                  <div
                    key={block.id}
                    className="flex items-start gap-3 px-3.5 py-3 rounded-lg border border-gray-100 bg-gray-50 text-[13px]"
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-800">
                          {block.studentName ?? block.blockLabel ?? "Session"}
                        </span>
                        {block.serviceTypeName && (
                          <Badge variant="outline" className="text-[11px] py-0 px-1.5 border-emerald-200 text-emerald-700 bg-emerald-50">
                            {block.serviceTypeName}
                          </Badge>
                        )}
                        {block.blockType && block.blockType !== "service" && (
                          <Badge variant="outline" className="text-[11px] py-0 px-1.5">
                            {block.blockType}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-gray-500 text-[12px] flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {fmt12(block.startTime)} – {fmt12(block.endTime)}
                        </span>
                        {block.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {block.location}
                          </span>
                        )}
                        {block.recurrenceType && (
                          <span className="text-gray-400">
                            {block.recurrenceType === "biweekly" ? "Every other week" : "Every week"}
                          </span>
                        )}
                      </div>
                      {block.notes && (
                        <p className="text-[12px] text-gray-400 italic">{block.notes}</p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[12px] flex-shrink-0 gap-1"
                      onClick={() => {
                        setRequestDialog(block);
                        setForm({ requestType: "coverage_request", notes: "", requestedDate: "", requestedStartTime: "", requestedEndTime: "" });
                      }}
                    >
                      <ArrowLeftRight className="h-3 w-3" />
                      Request Change
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-gray-800">My Change Requests</h2>
            {pendingCount > 0 && (
              <Badge variant="outline" className="text-amber-700 border-amber-200 bg-amber-50 gap-1 text-[12px]">
                <Clock className="h-3 w-3" />
                {pendingCount} pending
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {loadingRequests ? (
            <div className="space-y-2">
              {[1, 2].map(i => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <User className="h-7 w-7 mx-auto mb-2 opacity-40" />
              <p className="text-[13px]">No change requests yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map((req: any) => {
                const statusInfo = STATUS_BADGE[req.status] ?? STATUS_BADGE.pending;
                const StatusIcon = statusInfo.icon;
                return (
                  <div
                    key={req.id}
                    className="flex items-start gap-3 px-3.5 py-3 rounded-lg border border-gray-100 bg-white text-[13px]"
                  >
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-800">
                          {REQUEST_TYPE_LABELS[req.requestType] ?? req.requestType}
                        </span>
                        <Badge variant="outline" className={`text-[11px] py-0 px-1.5 gap-1 ${statusInfo.className}`}>
                          <StatusIcon className="h-2.5 w-2.5" />
                          {statusInfo.label}
                        </Badge>
                      </div>
                      {(req.blockDayOfWeek || req.studentName || req.serviceTypeName) && (
                        <div className="text-[12px] text-gray-500 flex items-center gap-2 flex-wrap">
                          {req.blockDayOfWeek && (
                            <span>{DAY_LABELS[req.blockDayOfWeek] ?? req.blockDayOfWeek}</span>
                          )}
                          {req.blockStartTime && req.blockEndTime && (
                            <span>{fmt12(req.blockStartTime)} – {fmt12(req.blockEndTime)}</span>
                          )}
                          {req.studentName && <span>· {req.studentName}</span>}
                          {req.serviceTypeName && <span>· {req.serviceTypeName}</span>}
                        </div>
                      )}
                      {req.requestedDate && (
                        <div className="text-[12px] text-gray-400">
                          Requested date: {req.requestedDate}
                          {req.requestedStartTime && ` · ${fmt12(req.requestedStartTime)}–${fmt12(req.requestedEndTime ?? req.requestedStartTime)}`}
                        </div>
                      )}
                      {req.notes && <p className="text-[12px] text-gray-400 italic">{req.notes}</p>}
                      {req.adminNotes && (
                        <div className="text-[12px] text-gray-600 bg-gray-50 rounded px-2 py-1 mt-1">
                          <span className="font-medium">Admin note: </span>{req.adminNotes}
                        </div>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-400 flex-shrink-0 mt-0.5">
                      {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!requestDialog} onOpenChange={v => { if (!v) setRequestDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[15px] font-semibold text-gray-800">Request a Schedule Change</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {requestDialog && !requestDialog.general && (
              <div className="text-[13px] text-gray-600 bg-gray-50 rounded-lg px-3 py-2.5 space-y-0.5">
                <div className="font-medium text-gray-800">
                  {requestDialog.studentName ?? requestDialog.blockLabel ?? "Session"}
                </div>
                <div className="text-gray-500">
                  {DAY_LABELS[requestDialog.dayOfWeek] ?? requestDialog.dayOfWeek} · {fmt12(requestDialog.startTime)} – {fmt12(requestDialog.endTime)}
                  {requestDialog.location && ` · ${requestDialog.location}`}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Request Type</Label>
              <Select value={form.requestType} onValueChange={v => setForm(f => ({ ...f, requestType: v }))}>
                <SelectTrigger className="h-9 text-[13px]">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="coverage_request" className="text-[13px]">Coverage Request</SelectItem>
                  <SelectItem value="swap_time" className="text-[13px]">Time Swap</SelectItem>
                  <SelectItem value="other" className="text-[13px]">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Date (optional)</Label>
              <Input
                type="date"
                value={form.requestedDate}
                onChange={e => setForm(f => ({ ...f, requestedDate: e.target.value }))}
                className="h-9 text-[13px]"
              />
            </div>
            {form.requestType === "swap_time" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[12px] font-medium text-gray-600">Requested Start</Label>
                  <Input
                    type="time"
                    value={form.requestedStartTime}
                    onChange={e => setForm(f => ({ ...f, requestedStartTime: e.target.value }))}
                    className="h-9 text-[13px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12px] font-medium text-gray-600">Requested End</Label>
                  <Input
                    type="time"
                    value={form.requestedEndTime}
                    onChange={e => setForm(f => ({ ...f, requestedEndTime: e.target.value }))}
                    className="h-9 text-[13px]"
                  />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-[12px] font-medium text-gray-600">Notes</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Describe your request or reason…"
                className="text-[13px] min-h-[80px] resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRequestDialog(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitRequest}
              disabled={submitting || !form.requestType}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {submitting ? "Submitting…" : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
