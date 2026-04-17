import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RotateCcw, Target, Clock, Activity, BarChart3, CheckCircle, Phone } from "lucide-react";
import { EmergencyAlertInline } from "@/components/emergency-alert-inline";
import { StudentQuickView } from "@/components/student-quick-view";
import { toast } from "sonner";
import { formatDate } from "./utils";
import type { SessionForm, GoalFormEntry, LogMakeupFor } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: SessionForm;
  updateForm: (field: string, value: any) => void;
  studentList: any[];
  reqList: any[];
  staffAllList: any[];
  missedReasonsList: any[];
  goalEntries: GoalFormEntry[];
  goalsLoading: boolean;
  toggleGoal: (idx: number) => void;
  updateGoalEntry: (idx: number, field: string, value: any) => void;
  updateBehaviorField: (idx: number, field: string, value: string) => void;
  updateProgramField: (idx: number, field: string, value: string) => void;
  showReview: boolean;
  setShowReview: (v: boolean) => void;
  submitting: boolean;
  onSubmit: () => void;
  logMakeupFor: LogMakeupFor;
};

export function LogSessionDialog({
  open, onOpenChange, form, updateForm,
  studentList, reqList, staffAllList, missedReasonsList,
  goalEntries, goalsLoading, toggleGoal, updateGoalEntry, updateBehaviorField, updateProgramField,
  showReview, setShowReview, submitting, onSubmit, logMakeupFor,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">{logMakeupFor ? `Log Makeup Session — ${logMakeupFor.studentName}` : "Log Session"}</DialogTitle>
        </DialogHeader>
        {logMakeupFor && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 text-[12px] text-indigo-700 flex items-center gap-2">
            <RotateCcw className="w-3.5 h-3.5 flex-shrink-0" />
            Making up missed session from {formatDate(logMakeupFor.sessionDate)} — will be automatically linked.
          </div>
        )}
        <div className="space-y-4" style={{ display: showReview ? "none" : undefined }}>
          {form.studentId && <EmergencyAlertInline studentId={Number(form.studentId)} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label className="text-[12px] text-gray-500">Student *</Label>
                {form.studentId && (() => {
                  const sel = studentList.find((s: any) => String(s.id) === form.studentId);
                  return sel ? (
                    <StudentQuickView
                      studentId={sel.id}
                      studentName={`${sel.firstName} ${sel.lastName}`}
                      grade={sel.grade}
                      trigger={
                        <span className="p-0.5 rounded hover:bg-gray-100 transition-colors" title="Quick view: emergency contacts & alerts">
                          <Phone className="w-3 h-3 text-gray-400 hover:text-emerald-600" />
                        </span>
                      }
                    />
                  ) : null;
                })()}
              </div>
              <Select value={form.studentId} onValueChange={v => { updateForm("studentId", v); updateForm("serviceRequirementId", ""); }}>
                <SelectTrigger className="h-10 md:h-9 text-[13px]"><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>
                  {studentList.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-gray-500">Service</Label>
              <Select value={form.serviceRequirementId} onValueChange={v => updateForm("serviceRequirementId", v)} disabled={!form.studentId}>
                <SelectTrigger className="h-10 md:h-9 text-[13px]"><SelectValue placeholder={form.studentId ? "Select service" : "Select student first"} /></SelectTrigger>
                <SelectContent>
                  {reqList.map((r: any) => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.serviceTypeName} — {r.minutesPerWeek} min/wk</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-gray-500">Provider</Label>
            <Select value={form.staffId} onValueChange={v => updateForm("staffId", v)}>
              <SelectTrigger className="h-10 md:h-9 text-[13px]"><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent>
                {staffAllList.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName} — {s.role}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[12px] text-gray-500">Date *</Label>
              <Input type="date" className="h-10 md:h-9 text-[13px]" value={form.sessionDate} onChange={e => updateForm("sessionDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-gray-500">Start Time</Label>
              <Input type="time" className="h-10 md:h-9 text-[13px]" value={form.startTime} onChange={e => updateForm("startTime", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-gray-500">End Time</Label>
              <Input type="time" className="h-10 md:h-9 text-[13px]" value={form.endTime} onChange={e => updateForm("endTime", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-[12px] text-gray-500">Duration (min) *</Label>
              <Input type="number" className="h-9 text-[13px]" value={form.durationMinutes} onChange={e => updateForm("durationMinutes", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-gray-500">Status *</Label>
              <Select value={form.status} onValueChange={v => updateForm("status", v)}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="missed">Missed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px] text-gray-500">Mode</Label>
              <Select value={form.deliveryMode} onValueChange={v => updateForm("deliveryMode", v)}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_person">In Person</SelectItem>
                  <SelectItem value="remote">Remote</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.status === "missed" && (
            <div className="space-y-1.5">
              <Label className="text-[12px] text-gray-500">Missed Reason</Label>
              <Select value={form.missedReasonId} onValueChange={v => updateForm("missedReasonId", v)}>
                <SelectTrigger className="h-9 text-[13px]"><SelectValue placeholder="Select reason" /></SelectTrigger>
                <SelectContent>
                  {missedReasonsList.map((r: any) => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <label className="flex items-center gap-2 text-[13px] text-gray-600 cursor-pointer">
            <input type="checkbox" checked={form.isMakeup} onChange={e => updateForm("isMakeup", e.target.checked)} className="rounded border-gray-300" />
            This is a makeup session
          </label>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-gray-500">Notes</Label>
            <Textarea className="text-[13px] resize-none" rows={2} value={form.notes} onChange={e => updateForm("notes", e.target.value)} placeholder="Optional session notes..." />
          </div>

          {form.studentId && (
            <div className="space-y-3 border-t border-slate-200 pt-4">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-semibold text-slate-700">IEP Goals Addressed</h3>
                {goalEntries.filter(g => g.selected).length > 0 && (
                  <span className="text-[11px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">
                    {goalEntries.filter(g => g.selected).length} selected
                  </span>
                )}
              </div>
              {goalsLoading ? (
                <div className="flex items-center gap-2 text-[12px] text-slate-400">
                  <Clock className="w-3.5 h-3.5 animate-spin" /> Loading goals...
                </div>
              ) : goalEntries.length === 0 ? (
                <p className="text-[12px] text-slate-400 italic">No active IEP goals found for this student.</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {goalEntries.map((ge, idx) => (
                    <div key={ge.iepGoalId} className={`rounded-lg border transition-all ${ge.selected ? "border-indigo-300 bg-indigo-50/50" : "border-slate-200 bg-white"}`}>
                      <label className="flex items-start gap-2.5 p-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={ge.selected}
                          onChange={() => toggleGoal(idx)}
                          className="mt-0.5 rounded border-slate-300"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600">{ge.goalArea}</span>
                            {ge.linkedTarget && (
                              <span className={`text-[9px] px-1 py-0.5 rounded font-medium ${
                                ge.linkedTarget.type === "behavior" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                              }`}>{ge.linkedTarget.type === "behavior" ? "Behavior" : "Program"}</span>
                            )}
                          </div>
                          <p className="text-[12px] text-slate-700 leading-snug mt-1 line-clamp-2">{ge.annualGoal}</p>
                        </div>
                      </label>

                      {ge.selected && (
                        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2">
                          {ge.behaviorData && (
                            <div className="bg-amber-50 rounded-md p-2.5 border border-amber-100 space-y-2">
                              <div className="flex items-center gap-1.5">
                                <Activity className="w-3 h-3 text-amber-600" />
                                <span className="text-[10px] font-semibold text-amber-700 uppercase">Behavior Data</span>
                                {ge.linkedTarget && (
                                  <span className="text-[10px] text-amber-500">({ge.linkedTarget.measurementType})</span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-amber-600">Value *</Label>
                                  <Input
                                    type="number"
                                    className="h-7 text-[12px]"
                                    placeholder="0"
                                    value={ge.behaviorData.value}
                                    onChange={e => updateBehaviorField(idx, "value", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-amber-600">Intervals (count)</Label>
                                  <Input
                                    type="number"
                                    className="h-7 text-[12px]"
                                    placeholder="—"
                                    value={ge.behaviorData.intervalCount}
                                    onChange={e => updateBehaviorField(idx, "intervalCount", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-amber-600">Intervals w/ behavior</Label>
                                  <Input
                                    type="number"
                                    className="h-7 text-[12px]"
                                    placeholder="—"
                                    value={ge.behaviorData.intervalsWith}
                                    onChange={e => updateBehaviorField(idx, "intervalsWith", e.target.value)}
                                  />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] text-amber-600">Notes</Label>
                                <Input
                                  className="h-7 text-[12px]"
                                  placeholder="Optional notes..."
                                  value={ge.behaviorData.notes}
                                  onChange={e => updateBehaviorField(idx, "notes", e.target.value)}
                                />
                              </div>
                            </div>
                          )}

                          {ge.programData && (
                            <div className="bg-blue-50 rounded-md p-2.5 border border-blue-100 space-y-2">
                              <div className="flex items-center gap-1.5">
                                <BarChart3 className="w-3 h-3 text-blue-600" />
                                <span className="text-[10px] font-semibold text-blue-700 uppercase">Program Data</span>
                                {ge.linkedTarget && (
                                  <span className="text-[10px] text-blue-500">({ge.linkedTarget.name})</span>
                                )}
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-blue-600">Trials Correct</Label>
                                  <Input
                                    type="number"
                                    className="h-7 text-[12px]"
                                    placeholder="0"
                                    value={ge.programData.trialsCorrect}
                                    onChange={e => updateProgramField(idx, "trialsCorrect", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-blue-600">Trials Total</Label>
                                  <Input
                                    type="number"
                                    className="h-7 text-[12px]"
                                    placeholder="10"
                                    value={ge.programData.trialsTotal}
                                    onChange={e => updateProgramField(idx, "trialsTotal", e.target.value)}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-blue-600">Prompt Level</Label>
                                  <Select
                                    value={ge.programData.promptLevelUsed}
                                    onValueChange={v => updateProgramField(idx, "promptLevelUsed", v)}
                                  >
                                    <SelectTrigger className="h-7 text-[12px]"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="full_physical">Full Physical</SelectItem>
                                      <SelectItem value="partial_physical">Partial Physical</SelectItem>
                                      <SelectItem value="model">Model</SelectItem>
                                      <SelectItem value="gestural">Gestural</SelectItem>
                                      <SelectItem value="verbal">Verbal</SelectItem>
                                      <SelectItem value="independent">Independent</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-blue-600">Independence Level</Label>
                                  <Select
                                    value={ge.programData.independenceLevel}
                                    onValueChange={v => updateProgramField(idx, "independenceLevel", v)}
                                  >
                                    <SelectTrigger className="h-7 text-[12px]"><SelectValue placeholder="Select" /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="independent">Independent</SelectItem>
                                      <SelectItem value="emerging">Emerging</SelectItem>
                                      <SelectItem value="prompted">Prompted</SelectItem>
                                      <SelectItem value="dependent">Dependent</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-blue-600">Prompted Count</Label>
                                  <Input
                                    type="number"
                                    className="h-7 text-[12px]"
                                    placeholder="0"
                                    value={ge.programData.prompted}
                                    onChange={e => updateProgramField(idx, "prompted", e.target.value)}
                                  />
                                </div>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] text-blue-600">Notes</Label>
                                <Input
                                  className="h-7 text-[12px]"
                                  placeholder="Optional notes..."
                                  value={ge.programData.notes}
                                  onChange={e => updateProgramField(idx, "notes", e.target.value)}
                                />
                              </div>
                            </div>
                          )}

                          {!ge.behaviorData && !ge.programData && (
                            <div className="space-y-1">
                              <Label className="text-[10px] text-slate-500">Goal Notes</Label>
                              <Input
                                className="h-7 text-[12px]"
                                placeholder="Notes for this goal..."
                                value={ge.notes}
                                onChange={e => updateGoalEntry(idx, "notes", e.target.value)}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        {showReview && (
          <div className="border-t border-emerald-200 pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-gray-800">Review Before Saving</h3>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
              {(() => {
                const student = studentList.find((s: any) => String(s.id) === form.studentId);
                const selectedReq = reqList.find((r: any) => String(r.id) === form.serviceRequirementId);
                const staff = staffAllList.find((s: any) => String(s.id) === form.staffId);
                const selectedGoalCount = goalEntries.filter(g => g.selected).length;
                return (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px]">
                    <div><span className="text-gray-500">Student</span><p className="font-medium text-gray-800">{student ? `${student.firstName} ${student.lastName}` : "—"}</p></div>
                    <div><span className="text-gray-500">Service</span><p className="font-medium text-gray-800">{selectedReq?.serviceTypeName || "None"}</p></div>
                    <div><span className="text-gray-500">Date</span><p className="font-medium text-gray-800">{formatDate(form.sessionDate)}</p></div>
                    <div><span className="text-gray-500">Duration</span><p className="font-medium text-gray-800">{form.durationMinutes} min</p></div>
                    <div><span className="text-gray-500">Status</span><p className="font-medium text-gray-800 capitalize">{form.status}{form.isMakeup ? " (Makeup)" : ""}</p></div>
                    <div><span className="text-gray-500">Provider</span><p className="font-medium text-gray-800">{staff ? `${staff.firstName} ${staff.lastName}` : "—"}</p></div>
                    <div className="col-span-2"><span className="text-gray-500">IEP Goals</span><p className="font-medium text-gray-800">{selectedGoalCount} goal{selectedGoalCount !== 1 ? "s" : ""} linked</p></div>
                    {form.notes && (
                      <div className="col-span-2"><span className="text-gray-500">Notes</span><p className="font-medium text-gray-800 line-clamp-2">{form.notes}</p></div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
        <DialogFooter>
          {showReview ? (
            <>
              <Button variant="outline" size="sm" className="text-[12px]" onClick={() => setShowReview(false)}>Go Back</Button>
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" disabled={submitting} onClick={onSubmit}>
                {submitting ? "Saving..." : "Confirm & Save"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" className="text-[12px]" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px]" disabled={!form.studentId || !form.sessionDate || !form.durationMinutes} onClick={() => {
                if (!form.studentId) { toast.error("Please select a student"); return; }
                if (!form.sessionDate) { toast.error("Please enter a session date"); return; }
                const dur = Number(form.durationMinutes);
                if (!dur || dur <= 0 || dur > 480) { toast.error("Duration must be between 1 and 480 minutes"); return; }
                setShowReview(true);
              }}>
                Review
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
