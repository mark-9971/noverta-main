import { Button } from "@/components/ui/button";
import { Clock, MapPin, Monitor, XCircle, Target, Activity, BookOpen, BarChart3, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { formatTime, formatPromptLevel } from "./utils";

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-gray-400 flex-shrink-0">{icon}</span>
      <span className="text-[11px] text-gray-400 min-w-[60px]">{label}</span>
      <span className="text-[13px] text-gray-700">{value}</span>
    </div>
  );
}

type Props = {
  session: any;
  detail: any;
  loading: boolean;
  onEdit: (session: any) => void;
  onMarkMissed: (session: any) => void;
  onLogMakeup: (session: any) => void;
  onDelete: (id: number) => void;
};

export function SessionExpandedDetail({ session, detail, loading, onEdit, onMarkMissed, onLogMakeup, onDelete }: Props) {
  const d = detail || session;
  const goals: any[] = d.linkedGoals || [];
  const clinicalData: any[] = d.clinicalData || [];
  const allProgram = clinicalData.flatMap((c: any) => c.programData || []);
  const allBehavior = clinicalData.flatMap((c: any) => c.behaviorData || []);
  const hasClinical = allProgram.length > 0 || allBehavior.length > 0;
  const hasRecordedData = goals.some((g: any) => g.behaviorData || g.programData);
  return (
    <div className="px-5 py-4 bg-gray-50/80 border-t border-gray-100 space-y-4">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400"><Clock className="w-4 h-4 animate-spin" /> Loading details...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Session Info</h4>
              <div className="space-y-1.5">
                <DetailRow icon={<Clock className="w-3.5 h-3.5" />} label="Duration" value={`${d.durationMinutes} min`} />
                {(d.startTime || d.endTime) && (
                  <DetailRow icon={<Clock className="w-3.5 h-3.5" />} label="Time" value={`${formatTime(d.startTime) || "—"} — ${formatTime(d.endTime) || "—"}`} />
                )}
                {d.location && <DetailRow icon={<MapPin className="w-3.5 h-3.5" />} label="Location" value={d.location} />}
                {d.deliveryMode && <DetailRow icon={<Monitor className="w-3.5 h-3.5" />} label="Mode" value={d.deliveryMode === "in_person" ? "In Person" : d.deliveryMode === "remote" ? "Remote/Telehealth" : d.deliveryMode} />}
              </div>
            </div>
            <div className="md:col-span-2 space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Session Documentation</h4>
              {d.notes ? (
                <p className="text-[13px] text-gray-700 bg-white rounded-lg p-3 border border-gray-200 leading-relaxed">{d.notes}</p>
              ) : (
                <p className="text-[11px] text-gray-400 italic">No session notes recorded.</p>
              )}
              {d.missedReasonLabel && (
                <div className="flex items-center gap-1.5 text-[12px] text-red-600">
                  <XCircle className="w-3.5 h-3.5" /> Missed: {d.missedReasonLabel}
                </div>
              )}
            </div>
          </div>

          {goals.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-emerald-600" /> IEP Goals Addressed ({goals.length})
                {hasRecordedData && <span className="text-[10px] font-normal text-emerald-600 ml-1">with data</span>}
              </h4>
              <div className="grid grid-cols-1 gap-2">
                {goals.map((g: any) => (
                  <div key={g.id} className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                    <div className="flex items-start gap-2">
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 flex-shrink-0 mt-0.5">{g.goalArea}</span>
                      <p className="text-[12px] text-gray-700 leading-snug line-clamp-2 flex-1">{g.annualGoal}</p>
                    </div>
                    {g.targetCriterion && (
                      <p className="text-[10px] text-gray-400 mt-1 ml-0.5">Target: {g.targetCriterion}</p>
                    )}

                    {g.behaviorData && (
                      <div className="mt-2 bg-amber-50 rounded-md px-2.5 py-2 border border-amber-100">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Activity className="w-3 h-3 text-amber-600" />
                          <span className="text-[10px] font-semibold text-amber-700 uppercase">Behavior Data</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-[11px]">
                          <div>
                            <span className="text-amber-500">Value:</span>{" "}
                            <span className="text-slate-700 font-medium">{g.behaviorData.value}</span>
                            {g.behaviorData.measurementType && (
                              <span className="text-amber-400 ml-0.5">({g.behaviorData.measurementType})</span>
                            )}
                          </div>
                          {g.behaviorData.targetName && (
                            <div><span className="text-amber-500">Target:</span> <span className="text-slate-700">{g.behaviorData.targetName}</span></div>
                          )}
                          {g.behaviorData.goalValue && (
                            <div><span className="text-amber-500">Goal:</span> <span className="text-slate-700">{g.behaviorData.goalValue} ({g.behaviorData.targetDirection})</span></div>
                          )}
                          {g.behaviorData.notes && (
                            <div className="col-span-full"><span className="text-amber-500">Notes:</span> <span className="text-slate-600">{g.behaviorData.notes}</span></div>
                          )}
                        </div>
                      </div>
                    )}

                    {g.programData && (
                      <div className="mt-2 bg-blue-50 rounded-md px-2.5 py-2 border border-blue-100">
                        <div className="flex items-center gap-1.5 mb-1">
                          <BarChart3 className="w-3 h-3 text-blue-600" />
                          <span className="text-[10px] font-semibold text-blue-700 uppercase">Program Data</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1 text-[11px]">
                          <div>
                            <span className="text-blue-500">Trials:</span>{" "}
                            <span className="text-slate-700 font-medium">{g.programData.trialsCorrect}/{g.programData.trialsTotal}</span>
                            {g.programData.percentCorrect && (
                              <span className="text-blue-400 ml-0.5">({g.programData.percentCorrect}%)</span>
                            )}
                          </div>
                          {g.programData.promptLevelUsed && (
                            <div><span className="text-blue-500">Prompt:</span> <span className="text-slate-700">{formatPromptLevel(g.programData.promptLevelUsed)}</span></div>
                          )}
                          {g.programData.targetName && (
                            <div><span className="text-blue-500">Program:</span> <span className="text-slate-700">{g.programData.targetName}</span></div>
                          )}
                          {g.programData.masteryCriterionPercent && (
                            <div><span className="text-blue-500">Mastery:</span> <span className="text-slate-700">{g.programData.masteryCriterionPercent}%</span></div>
                          )}
                          {g.programData.notes && (
                            <div className="col-span-full"><span className="text-blue-500">Notes:</span> <span className="text-slate-600">{g.programData.notes}</span></div>
                          )}
                        </div>
                      </div>
                    )}

                    {g.notes && (
                      <p className="text-[10px] text-slate-500 mt-1.5 ml-0.5 italic">Goal notes: {g.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {hasClinical && (
            <div className="space-y-3 border-t border-gray-200 pt-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-600" /> Clinical Data Recorded This Day
              </h4>

              {allProgram.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <BookOpen className="w-3 h-3" /> Program Trials ({allProgram.length} targets)
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {allProgram.map((pd: any, i: number) => {
                      const pct = pd.percentCorrect != null ? Math.round(parseFloat(pd.percentCorrect)) : null;
                      const atMastery = pct != null && pct >= 80;
                      return (
                        <div key={pd.id ?? i} className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-gray-700 truncate flex-1 min-w-0">{pd.targetName || `Program #${pd.programTargetId}`}</span>
                            <span className={`text-[12px] font-bold flex-shrink-0 ${atMastery ? "text-emerald-600" : pct != null && pct >= 60 ? "text-gray-700" : "text-gray-500"}`}>
                              {pct != null ? `${pct}%` : "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.min(100, pct ?? 0)}%`,
                                  backgroundColor: atMastery ? "#10b981" : pct != null && pct >= 60 ? "#059669" : "#d1d5db",
                                }}
                              />
                            </div>
                            {pd.trialsCorrect != null && pd.trialsTotal != null && (
                              <span className="text-[9px] text-gray-400 flex-shrink-0">{pd.trialsCorrect}/{pd.trialsTotal}</span>
                            )}
                          </div>
                          {pd.promptLevelUsed && (
                            <p className="text-[9px] text-gray-400 mt-0.5">{pd.promptLevelUsed.replace(/_/g, " ")}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {allBehavior.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                    <Activity className="w-3 h-3" /> Behavior Data ({allBehavior.length} targets)
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {allBehavior.map((bd: any, i: number) => {
                      const val = parseFloat(bd.value);
                      const isDecrease = bd.targetDirection === "decrease";
                      const isGood = isDecrease ? val <= 3 : val >= 70;
                      return (
                        <div key={bd.id ?? i} className="bg-white rounded-lg px-3 py-2 border border-gray-200">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-medium text-gray-700 truncate flex-1 min-w-0">{bd.targetName || `Behavior #${bd.behaviorTargetId}`}</span>
                            <span className={`text-[12px] font-bold flex-shrink-0 ${isGood ? "text-emerald-600" : "text-gray-700"}`}>
                              {bd.measurementType === "percentage" || bd.measurementType === "interval"
                                ? `${Math.round(val)}%`
                                : Math.round(val)}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-[9px] text-gray-400">
                            <span className="capitalize">{bd.measurementType}</span>
                            <span>·</span>
                            <span className={isDecrease ? "text-red-500" : "text-emerald-600"}>{isDecrease ? "↓ decrease" : "↑ increase"}</span>
                            {bd.intervalCount != null && <span>· {bd.intervalsWith}/{bd.intervalCount} intervals</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-gray-200 flex-wrap">
            <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1" onClick={() => onEdit(session)}>
              <Pencil className="w-3 h-3" /> Edit
            </Button>
            {session.status === "completed" && (
              <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50 border-amber-200"
                onClick={() => onMarkMissed(session)}>
                <XCircle className="w-3 h-3" /> Mark as Missed
              </Button>
            )}
            {session.status === "missed" && (
              <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200"
                onClick={() => onLogMakeup(session)}>
                <RotateCcw className="w-3 h-3" /> Log Makeup Session
              </Button>
            )}
            {session.isMakeup && session.makeupForId && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">
                <RotateCcw className="w-2.5 h-2.5" /> Makeup for session #{session.makeupForId}
              </span>
            )}
            <Button variant="outline" size="sm" className="text-[11px] h-7 gap-1 text-red-600 hover:text-red-700 hover:bg-red-50 ml-auto" onClick={() => onDelete(session.id)}>
              <Trash2 className="w-3 h-3" /> Delete
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
