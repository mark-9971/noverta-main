import { Fragment } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, BookOpen, ChevronDown, ChevronUp, Clock, MapPin, Monitor, Target, CheckCircle, XCircle } from "lucide-react";

interface StudentSessionHistoryProps {
  section: "data" | "service";
  dataSessions: any[];
  dataLoading: boolean;
  expandedDataSessionId: number | null;
  expandedDataDetail: any;
  expandedDataLoading: boolean;
  toggleDataSession: (id: number) => void;
  recentSessions: any[];
  expandedServiceSessionId: number | null;
  expandedServiceDetail: any;
  expandedServiceLoading: boolean;
  toggleServiceSession: (id: number) => void;
  formatDate: (d: string) => string;
  formatTime: (t: string | null) => string | null;
}

export default function StudentSessionHistory(props: StudentSessionHistoryProps) {
  const {
    section,
    dataSessions, dataLoading, expandedDataSessionId, expandedDataDetail, expandedDataLoading, toggleDataSession,
    recentSessions, expandedServiceSessionId, expandedServiceDetail, expandedServiceLoading, toggleServiceSession,
    formatDate, formatTime,
  } = props;

  if (section === "data") {
    if (dataSessions.length === 0 && !dataLoading) return null;
    return (
      <Card>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm font-semibold text-gray-600">Recent Data Sessions</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {dataLoading ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="w-full h-12" />)}</div>
          ) : dataSessions.length > 0 ? (
            <div className="space-y-1">
              {dataSessions.map((ds: any) => {
                const isExpanded = expandedDataSessionId === ds.id;
                const detail = isExpanded ? expandedDataDetail : null;
                return (
                  <Fragment key={ds.id}>
                    <button
                      onClick={() => toggleDataSession(ds.id)}
                      className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50/50 hover:bg-gray-100/50 transition-colors text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-gray-700">{formatDate(ds.sessionDate)}</p>
                        <p className="text-[11px] text-gray-400">
                          {ds.staffName || "Staff"} · {ds.startTime && ds.endTime ? `${formatTime(ds.startTime)}\u2013${formatTime(ds.endTime)}` : "No time recorded"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                          <Activity className="w-3 h-3" /> Data
                        </span>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="ml-3 mr-3 mb-2 p-4 bg-white border border-gray-200 rounded-lg space-y-4">
                        {expandedDataLoading ? (
                          <div className="flex items-center gap-2 text-sm text-gray-400"><Clock className="w-4 h-4 animate-spin" /> Loading details...</div>
                        ) : detail ? (
                          <>
                            {detail.notes && (
                              <div>
                                <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Session Notes</h5>
                                <p className="text-[13px] text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-100 leading-relaxed">{detail.notes}</p>
                              </div>
                            )}
                            {detail.behaviorData?.length > 0 && (
                              <div>
                                <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                  <Activity className="w-3.5 h-3.5 text-red-500" /> Behavior Data ({detail.behaviorData.length})
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {detail.behaviorData.map((bd: any) => (
                                    <div key={bd.id} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[12px] font-medium text-gray-700">{bd.targetName || `Target #${bd.behaviorTargetId}`}</span>
                                        <span className="text-[13px] font-bold text-gray-800">{bd.value}</span>
                                      </div>
                                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                                        <span>{bd.measurementType}</span>
                                        {bd.intervalCount != null && <span>· {bd.intervalsWith}/{bd.intervalCount} intervals</span>}
                                        {bd.hourBlock && <span>· Hour: {bd.hourBlock}</span>}
                                      </div>
                                      {bd.notes && <p className="text-[11px] text-gray-500 mt-1 italic">{bd.notes}</p>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {detail.programData?.length > 0 && (
                              <div>
                                <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                  <BookOpen className="w-3.5 h-3.5 text-emerald-600" /> Program Data ({detail.programData.length})
                                </h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                  {detail.programData.map((pd: any) => (
                                    <div key={pd.id} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[12px] font-medium text-gray-700">{pd.targetName || `Program #${pd.programTargetId}`}</span>
                                        <span className="text-[13px] font-bold text-gray-800">
                                          {pd.percentCorrect != null ? `${Math.round(parseFloat(pd.percentCorrect))}%` : "\u2014"}
                                        </span>
                                      </div>
                                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                                        {pd.trialsCorrect != null && pd.trialsTotal != null && <span>{pd.trialsCorrect}/{pd.trialsTotal} trials</span>}
                                        {pd.promptLevelUsed && <span>· {pd.promptLevelUsed.replace(/_/g, " ")}</span>}
                                        {pd.stepNumber != null && <span>· Step {pd.stepNumber}</span>}
                                        {pd.programType && <span>· {pd.programType.replace(/_/g, " ")}</span>}
                                      </div>
                                      {pd.notes && <p className="text-[11px] text-gray-500 mt-1 italic">{pd.notes}</p>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                            {(!detail.behaviorData?.length && !detail.programData?.length && !detail.notes) && (
                              <p className="text-[12px] text-gray-400 italic">No detailed data recorded for this session.</p>
                            )}
                          </>
                        ) : (
                          <p className="text-[12px] text-gray-400 italic">Failed to load session details.</p>
                        )}
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-gray-400">No data sessions recorded yet.</div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold text-gray-600">Recent Service Sessions</CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {recentSessions.length > 0 ? (
          <div className="space-y-1">
            {recentSessions.map((se: any) => {
              const isExpanded = expandedServiceSessionId === se.id;
              const detail = isExpanded ? expandedServiceDetail : null;
              return (
                <Fragment key={se.id}>
                  <button
                    onClick={() => toggleServiceSession(se.id)}
                    className="w-full flex items-center justify-between p-3 rounded-lg bg-gray-50/50 hover:bg-gray-100/50 transition-colors text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-gray-700 truncate">{se.serviceTypeName ?? "\u2014"}</p>
                      <p className="text-[11px] text-gray-400">{formatDate(se.sessionDate)} · {se.durationMinutes ?? "\u2014"} min · {se.staffName ?? "\u2014"}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        se.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                        se.status === "missed" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                      }`}>
                        {se.status === "completed" ? <CheckCircle className="w-3 h-3" /> : se.status === "missed" ? <XCircle className="w-3 h-3" /> : null}
                        {se.isMakeup ? "Makeup" : se.status}
                      </span>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="ml-3 mr-3 mb-2 p-4 bg-white border border-gray-200 rounded-lg space-y-4">
                      {expandedServiceLoading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-400"><Clock className="w-4 h-4 animate-spin" /> Loading details...</div>
                      ) : detail ? (
                        <>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Session Info</h5>
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-3.5 h-3.5 text-gray-400" />
                                  <span className="text-[11px] text-gray-400 min-w-[60px]">Duration</span>
                                  <span className="text-[13px] text-gray-700">{detail.durationMinutes} min</span>
                                </div>
                                {(detail.startTime || detail.endTime) && (
                                  <div className="flex items-center gap-2">
                                    <Clock className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="text-[11px] text-gray-400 min-w-[60px]">Time</span>
                                    <span className="text-[13px] text-gray-700">{formatTime(detail.startTime) || "\u2014"} — {formatTime(detail.endTime) || "\u2014"}</span>
                                  </div>
                                )}
                                {detail.location && (
                                  <div className="flex items-center gap-2">
                                    <MapPin className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="text-[11px] text-gray-400 min-w-[60px]">Location</span>
                                    <span className="text-[13px] text-gray-700">{detail.location}</span>
                                  </div>
                                )}
                                {detail.deliveryMode && (
                                  <div className="flex items-center gap-2">
                                    <Monitor className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="text-[11px] text-gray-400 min-w-[60px]">Mode</span>
                                    <span className="text-[13px] text-gray-700">{detail.deliveryMode === "in_person" ? "In Person" : detail.deliveryMode === "remote" ? "Remote/Telehealth" : detail.deliveryMode}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="md:col-span-2 space-y-2">
                              <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Session Notes</h5>
                              {detail.notes ? (
                                <p className="text-[13px] text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-100 leading-relaxed">{detail.notes}</p>
                              ) : (
                                <p className="text-[11px] text-gray-400 italic">No session notes recorded.</p>
                              )}
                              {detail.missedReasonLabel && (
                                <div className="flex items-center gap-1.5 text-[12px] text-red-600">
                                  <XCircle className="w-3.5 h-3.5" /> Missed: {detail.missedReasonLabel}
                                </div>
                              )}
                            </div>
                          </div>
                          {detail.linkedGoals?.length > 0 && (
                            <div className="space-y-2">
                              <h5 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                                <Target className="w-3.5 h-3.5 text-emerald-600" /> IEP Goals Addressed ({detail.linkedGoals.length})
                              </h5>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {detail.linkedGoals.map((g: any) => (
                                  <div key={g.id} className="bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                                    <div className="flex items-start gap-2">
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 flex-shrink-0 mt-0.5">{g.goalArea}</span>
                                      <p className="text-[12px] text-gray-700 leading-snug line-clamp-2">{g.annualGoal}</p>
                                    </div>
                                    {g.targetCriterion && <p className="text-[10px] text-gray-400 mt-1 ml-0.5">Target: {g.targetCriterion}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="text-[12px] text-gray-400 italic">Failed to load session details.</p>
                      )}
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-gray-400">No sessions recorded yet.</div>
        )}
      </CardContent>
    </Card>
  );
}
