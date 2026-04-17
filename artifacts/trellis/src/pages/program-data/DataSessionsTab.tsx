import { useState, Fragment } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ChevronDown, ChevronUp, Clock, Eye, Activity, GraduationCap } from "lucide-react";
import { getDataSession } from "@workspace/api-client-react";
import { DataSession, PROMPT_LABELS } from "./constants";

interface Props {
  dataSessions: DataSession[];
  onLogSession: () => void;
}

export default function DataSessionsTab({ dataSessions, onLogSession }: Props) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedData, setExpandedData] = useState<any>(null);
  const [expandLoading, setExpandLoading] = useState(false);

  async function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedData(null);
      return;
    }
    setExpandedId(id);
    setExpandLoading(true);
    try {
      const data = await getDataSession(id);
      setExpandedData(data);
    } catch {
      setExpandedData(null);
    }
    setExpandLoading(false);
  }

  function formatTime(t: string | null) {
    if (!t) return null;
    const [h, m] = t.split(":");
    const hr = parseInt(h);
    return `${hr > 12 ? hr - 12 : hr || 12}:${m} ${hr >= 12 ? "PM" : "AM"}`;
  }

  function ExpandedSessionDetail({ detail }: { detail: any }) {
    if (expandLoading) {
      return (
        <div className="px-4 py-6 bg-gray-50/80 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-400"><Clock className="w-4 h-4 animate-spin" /> Loading recorded data...</div>
        </div>
      );
    }
    if (!detail) {
      return (
        <div className="px-4 py-4 bg-gray-50/80 border-t border-gray-100 text-sm text-gray-400">
          Could not load session details.
        </div>
      );
    }
    const behaviors: any[] = detail.behaviorData || [];
    const programs: any[] = detail.programData || [];
    const hasData = behaviors.length > 0 || programs.length > 0;

    return (
      <div className="px-4 py-4 bg-gray-50/80 border-t border-gray-100 space-y-4">
        <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
          {detail.staffName && <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> {detail.staffName}</span>}
          {detail.startTime && detail.endTime && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatTime(detail.startTime)} — {formatTime(detail.endTime)}</span>}
          {detail.notes && <span className="flex items-center gap-1 text-gray-600">{detail.notes}</span>}
        </div>

        {!hasData ? (
          <p className="text-sm text-gray-400 italic py-2">No behavior or program data recorded in this session.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {behaviors.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-red-500" /> Behavior Data ({behaviors.length})
                </h4>
                <div className="space-y-1.5">
                  {behaviors.map((b: any) => (
                    <div key={b.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-200">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-gray-700 truncate">{b.targetName || `Target ${b.behaviorTargetId}`}</p>
                        <p className="text-[10px] text-gray-400">{b.measurementType || "—"}{b.hourBlock ? ` · ${b.hourBlock}` : ""}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {b.measurementType === "interval" ? (
                          <span className="text-[14px] font-bold text-emerald-700">
                            {b.intervalsWith != null && b.intervalCount != null
                              ? `${Math.round((b.intervalsWith / b.intervalCount) * 100)}%`
                              : b.value}
                            <span className="text-[10px] font-normal text-gray-400 ml-1">
                              {b.intervalsWith}/{b.intervalCount} intervals
                            </span>
                          </span>
                        ) : (
                          <span className="text-[14px] font-bold text-emerald-700">{b.value}</span>
                        )}
                        {b.notes && <span className="text-[10px] text-gray-400 max-w-[80px] truncate" title={b.notes}>{b.notes}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {programs.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-emerald-500" /> Program Data ({programs.length})
                </h4>
                <div className="space-y-1.5">
                  {programs.map((p: any) => {
                    const promptInfo = PROMPT_LABELS[p.promptLevelUsed ?? ""] || null;
                    return (
                      <div key={p.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-200">
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-gray-700 truncate">{p.targetName || `Program ${p.programTargetId}`}</p>
                          <p className="text-[10px] text-gray-400">
                            {p.programType === "discrete_trial" ? "DTT" : "Task Analysis"}
                            {p.stepNumber != null ? ` · Step ${p.stepNumber}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {p.trialsTotal != null && p.trialsTotal > 0 && (
                            <span className="text-[11px] text-gray-400">
                              {p.trialsCorrect}/{p.trialsTotal}
                            </span>
                          )}
                          <span className={`text-[14px] font-bold ${
                            parseFloat(p.percentCorrect || "0") >= 80 ? "text-emerald-600" :
                            parseFloat(p.percentCorrect || "0") >= 50 ? "text-amber-600" : "text-red-500"
                          }`}>
                            {p.percentCorrect != null ? `${p.percentCorrect}%` : "—"}
                          </span>
                          {promptInfo && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${promptInfo.color}`}>
                              {promptInfo.short}
                            </span>
                          )}
                          {p.notes && <span className="text-[10px] text-gray-400 max-w-[80px] truncate" title={p.notes}>{p.notes}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-600">Recent Data Sessions</h3>
        <Button size="sm" className="bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] h-8" onClick={onLogSession}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Log Session
        </Button>
      </div>

      {dataSessions.length === 0 ? (
        <div className="py-12 text-center text-gray-400 text-sm">No data sessions recorded yet.</div>
      ) : (
        <>
          <div className="md:hidden space-y-2">
            {dataSessions.map(ds => (
              <Card key={ds.id} className="overflow-hidden">
                <button className="w-full p-3.5 text-left" onClick={() => toggleExpand(ds.id)}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-700">
                        {new Date(ds.sessionDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {ds.startTime && ds.endTime ? `${ds.startTime}–${ds.endTime}` : "—"} · {ds.staffName || "—"}
                      </p>
                    </div>
                    {expandedId === ds.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>
                {expandedId === ds.id && <ExpandedSessionDetail detail={expandedData} />}
              </Card>
            ))}
          </div>

          <Card className="hidden md:block">
            <CardContent className="p-0">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="w-8 px-2"></th>
                    <th className="text-left px-4 py-2.5 text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Date</th>
                    <th className="text-left px-4 py-2.5 text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Time</th>
                    <th className="text-left px-4 py-2.5 text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Staff</th>
                    <th className="text-left px-4 py-2.5 text-[11px] text-gray-400 font-semibold uppercase tracking-wider">Recorded Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {dataSessions.map(ds => (
                    <Fragment key={ds.id}>
                      <tr
                        className={`hover:bg-gray-50/50 cursor-pointer transition-colors ${expandedId === ds.id ? "bg-gray-50/50" : ""}`}
                        onClick={() => toggleExpand(ds.id)}>
                        <td className="px-2 py-2.5 text-center">
                          {expandedId === ds.id ? <ChevronUp className="w-4 h-4 text-gray-400 mx-auto" /> : <ChevronDown className="w-4 h-4 text-gray-300 mx-auto" />}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-gray-700">
                          {new Date(ds.sessionDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">
                          {ds.startTime && ds.endTime ? `${formatTime(ds.startTime)} — ${formatTime(ds.endTime)}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{ds.staffName || "—"}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-[11px] text-emerald-600 font-medium">Click to view</span>
                        </td>
                      </tr>
                      {expandedId === ds.id && (
                        <tr>
                          <td colSpan={5} className="p-0">
                            <ExpandedSessionDetail detail={expandedData} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
