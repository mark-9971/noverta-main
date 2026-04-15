import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { authFetch } from "@/lib/auth-fetch";
import { CalendarDays, CheckCircle2, AlertTriangle, Users, BookOpen, UserCheck, History, ArrowRight, RefreshCw } from "lucide-react";

interface SchoolYear {
  id: number;
  districtId: number;
  label: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
}

interface RolloverPreview {
  currentYear: SchoolYear | null;
  activeStudents: number;
  activeStaffAssignments: number;
  iepsTotal: number;
  iepsExpired: number;
  yearHistory: SchoolYear[];
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m) - 1]} ${parseInt(d)}, ${y}`;
}

export default function SchoolYearPage() {
  const [preview, setPreview] = useState<RolloverPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [executing, setExecuting] = useState(false);

  const [newLabel, setNewLabel] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [confirmation, setConfirmation] = useState("");

  const expectedConfirmation = newLabel ? `ROLLOVER ${newLabel}` : "ROLLOVER";

  async function loadPreview() {
    setLoading(true);
    try {
      const r = await authFetch("/api/admin/rollover/preview");
      if (!r.ok) throw new Error();
      const data: RolloverPreview = await r.json();
      setPreview(data);
    } catch {
      toast.error("Failed to load school year data");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadPreview(); }, []);

  function openRolloverDialog() {
    if (!preview?.currentYear) return;
    const [currYear] = preview.currentYear.endDate.split("-");
    const nextYear = String(parseInt(currYear) + 1);
    setNewLabel(`${parseInt(currYear) + 1}\u2013${String(parseInt(nextYear) + 1).slice(2)}`);
    setNewStartDate(`${nextYear}-09-01`);
    setNewEndDate(`${parseInt(nextYear) + 1}-08-31`);
    setConfirmation("");
    setDialogOpen(true);
  }

  async function handleExecute() {
    if (confirmation.trim() !== expectedConfirmation) {
      toast.error(`Type exactly: ${expectedConfirmation}`);
      return;
    }
    if (!newLabel || !newStartDate || !newEndDate) {
      toast.error("All fields are required");
      return;
    }
    setExecuting(true);
    try {
      const r = await authFetch("/api/admin/rollover/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newLabel, newStartDate, newEndDate, confirmation }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Rollover failed");
      toast.success(data.message ?? `Rolled over to ${newLabel}`);
      setDialogOpen(false);
      await loadPreview();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollover failed");
    } finally {
      setExecuting(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <div className="h-8 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="h-40 w-full bg-gray-100 rounded animate-pulse" />
        <div className="h-40 w-full bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">School Year</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage the active school year and initiate rollover when needed.</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadPreview} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Current Year Banner */}
      <Card className={`border-2 ${preview?.currentYear ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${preview?.currentYear ? "bg-emerald-100" : "bg-amber-100"}`}>
              <CalendarDays className={`w-5 h-5 ${preview?.currentYear ? "text-emerald-700" : "text-amber-700"}`} />
            </div>
            <div className="flex-1">
              {preview?.currentYear ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-gray-900">{preview.currentYear.label}</span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[11px] font-semibold rounded-full uppercase tracking-wide">Active</span>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {formatDate(preview.currentYear.startDate)} — {formatDate(preview.currentYear.endDate)}
                  </p>
                </>
              ) : (
                <>
                  <span className="text-base font-semibold text-amber-800">No active school year</span>
                  <p className="text-sm text-amber-600 mt-0.5">Use the rollover tool below to create the first school year.</p>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview Stats */}
      {preview && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Active Students", value: preview.activeStudents, icon: Users, color: "text-blue-700", bg: "bg-blue-50" },
            { label: "Staff Assignments", value: preview.activeStaffAssignments, icon: UserCheck, color: "text-purple-700", bg: "bg-purple-50" },
            { label: "Active IEPs", value: preview.iepsTotal, icon: BookOpen, color: "text-emerald-700", bg: "bg-emerald-50" },
            { label: "IEPs Needing Review", value: preview.iepsExpired, icon: AlertTriangle, color: "text-amber-700", bg: "bg-amber-50" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <Card key={label} className="border border-gray-100">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${bg}`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                </div>
                <div className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* What Rollover Does */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-emerald-600" /> What Rollover Does
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          {[
            "Archives the current school year and marks it read-only",
            "Creates a new active school year with the dates you specify",
            "Flags all expired IEPs as Pending Annual Review",
            "Historical sessions, incidents, and reports remain accessible",
            "Runs atomically — rolls back completely if anything fails",
          ].map(item => (
            <div key={item} className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-gray-700">{item}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Initiate Rollover */}
      <div className="flex justify-end">
        <Button
          onClick={openRolloverDialog}
          className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          disabled={!preview?.currentYear}
        >
          <RefreshCw className="w-4 h-4" /> Initiate Rollover
        </Button>
      </div>

      {/* Year History */}
      {preview && preview.yearHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <History className="w-4 h-4" /> Year History
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {[...preview.yearHistory].reverse().map(year => (
                <div key={year.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-800">{year.label}</span>
                    {year.isActive && (
                      <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded uppercase tracking-wide">Active</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatDate(year.startDate)} — {formatDate(year.endDate)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rollover Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-600" /> Initiate School Year Rollover
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <strong>This action cannot be undone.</strong> The current year will be archived and a new year will become active.
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">New Year Label</Label>
              <Input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="e.g. 2025–26"
                className="text-sm"
              />
              <p className="text-[11px] text-gray-400">Use the format "2025–26" (em dash)</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Start Date</Label>
                <Input type="date" value={newStartDate} onChange={e => setNewStartDate(e.target.value)} className="text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">End Date</Label>
                <Input type="date" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} className="text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-600">
                Type <span className="font-mono font-semibold text-gray-800">{expectedConfirmation}</span> to confirm
              </Label>
              <Input
                value={confirmation}
                onChange={e => setConfirmation(e.target.value)}
                placeholder={expectedConfirmation}
                className={`text-sm font-mono ${confirmation && confirmation !== expectedConfirmation ? "border-red-300" : ""}`}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={executing}>Cancel</Button>
            <Button
              onClick={handleExecute}
              disabled={executing || confirmation !== expectedConfirmation || !newLabel || !newStartDate || !newEndDate}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {executing ? <><RefreshCw className="w-4 h-4 animate-spin" /> Rolling over…</> : <><CheckCircle2 className="w-4 h-4" /> Execute Rollover</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
