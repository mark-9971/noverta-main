import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authFetch } from "@/lib/auth-fetch";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickLogSheet } from "@/components/quick-log-sheet";
import { Link } from "wouter";
import {
  Clock, CheckCircle2, AlertTriangle, ArrowRight, MapPin, RefreshCw, CalendarX,
} from "lucide-react";

interface TodayBlock {
  id: number;
  staffId: number;
  studentId: number | null;
  studentName: string | null;
  serviceTypeId: number | null;
  serviceTypeName: string | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  location: string | null;
  blockLabel: string | null;
  sessionLogId: number | null;
  status: "logged" | "in_progress" | "missed" | "upcoming" | "closed" | "early_release";
  date: string;
}

function formatTime(t: string): string {
  const [h = 0, m = 0] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const hh = (h % 12) || 12;
  return `${hh}:${String(m).padStart(2, "0")}${ampm}`;
}

function StatusChip({ status }: { status: TodayBlock["status"] }) {
  if (status === "logged") {
    return (
      <Badge className="text-[10px] h-5 px-1.5 bg-emerald-50 text-emerald-700 border-emerald-200 font-medium">
        <CheckCircle2 className="w-3 h-3 mr-0.5" /> Logged
      </Badge>
    );
  }
  if (status === "in_progress") {
    return (
      <Badge className="text-[10px] h-5 px-1.5 bg-blue-50 text-blue-700 border-blue-200 font-medium animate-pulse">
        In Progress
      </Badge>
    );
  }
  if (status === "missed") {
    return (
      <Badge className="text-[10px] h-5 px-1.5 bg-red-50 text-red-700 border-red-200 font-medium">
        <AlertTriangle className="w-3 h-3 mr-0.5" /> Missed
      </Badge>
    );
  }
  if (status === "closed") {
    return (
      <Badge className="text-[10px] h-5 px-1.5 bg-slate-100 text-slate-600 border-slate-200 font-medium">
        <CalendarX className="w-3 h-3 mr-0.5" /> School Closed
      </Badge>
    );
  }
  if (status === "early_release") {
    return (
      <Badge className="text-[10px] h-5 px-1.5 bg-amber-50 text-amber-700 border-amber-200 font-medium">
        <Clock className="w-3 h-3 mr-0.5" /> Early Release
      </Badge>
    );
  }
  return (
    <Badge className="text-[10px] h-5 px-1.5 bg-gray-50 text-gray-500 border-gray-200 font-medium">
      Upcoming
    </Badge>
  );
}

interface QuickLogPrefill {
  studentId?: number;
  studentName?: string;
  serviceTypeId?: number;
  serviceTypeName?: string;
  durationMinutes?: number;
  startTime?: string;
  endTime?: string;
  date?: string;
}

export function TodayScheduleCard() {
  const { teacherId } = useRole();
  const queryClient = useQueryClient();
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [prefill, setPrefill] = useState<QuickLogPrefill>({});

  const {
    data: blocks,
    isLoading,
    refetch,
  } = useQuery<TodayBlock[]>({
    queryKey: ["schedules-today"],
    queryFn: () =>
      authFetch("/api/schedules/today").then(r => r.ok ? r.json() : []),
    staleTime: 60_000,
    enabled: !!teacherId,
  });

  const openQuickLog = useCallback((block: TodayBlock) => {
    setPrefill({
      studentId: block.studentId ?? undefined,
      studentName: block.studentName ?? undefined,
      serviceTypeId: block.serviceTypeId ?? undefined,
      serviceTypeName: block.serviceTypeName ?? undefined,
      durationMinutes: block.durationMinutes || undefined,
      startTime: block.startTime,
      endTime: block.endTime,
      date: block.date,
    });
    setQuickLogOpen(true);
  }, []);

  const handleSuccess = useCallback(() => {
    setQuickLogOpen(false);
    refetch();
    queryClient.invalidateQueries({ queryKey: ["provider-summary"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard/provider-summary"] });
  }, [refetch, queryClient]);

  const blockList = blocks ?? [];

  return (
    <>
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-[13px] font-semibold text-gray-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-500" /> Today&apos;s Schedule
          </CardTitle>
          <div className="flex items-center gap-1">
            <button
              onClick={() => refetch()}
              className="p-1 rounded hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <Link href="/schedule">
              <Button variant="ghost" size="sm" className="h-7 text-[11px] text-gray-400">
                Full schedule <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : blockList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 gap-2 text-gray-400">
              <CalendarX className="w-5 h-5" />
              <p className="text-[12px]">No sessions scheduled today</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {blockList.map(b => (
                <div key={b.id} className="flex items-center gap-3 py-2.5">
                  <div className="text-[11px] font-mono text-gray-500 w-20 flex-shrink-0 leading-tight">
                    {formatTime(b.startTime)}
                    <span className="text-gray-300">–</span>
                    {formatTime(b.endTime)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-gray-800 truncate">
                      {b.studentName ?? "—"}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-0.5">
                      {b.serviceTypeName && <span>{b.serviceTypeName}</span>}
                      {b.durationMinutes > 0 && (
                        <span className="text-gray-300">· {b.durationMinutes} min</span>
                      )}
                      {b.location && (
                        <>
                          <MapPin className="w-3 h-3 flex-shrink-0" />
                          <span className="truncate">{b.location}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusChip status={b.status} />
                    {b.status === "logged" && b.studentId && (
                      <Link href={`/sessions?studentId=${b.studentId}&date=${b.date}`}>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-[11px] text-emerald-600 px-2"
                        >
                          View
                        </Button>
                      </Link>
                    )}
                    {(b.status === "upcoming" || b.status === "in_progress" || b.status === "early_release") && b.studentId && (
                      <Button
                        size="sm"
                        onClick={() => openQuickLog(b)}
                        className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white px-2.5"
                      >
                        Log Session
                      </Button>
                    )}
                    {b.status === "missed" && b.studentId && (
                      <Button
                        size="sm"
                        onClick={() => openQuickLog(b)}
                        className="h-7 text-[11px] bg-red-600 hover:bg-red-700 text-white px-2.5"
                      >
                        Log Now
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <QuickLogSheet
        isOpen={quickLogOpen}
        onClose={() => setQuickLogOpen(false)}
        onSuccess={handleSuccess}
        staffId={teacherId}
        prefillStudentId={prefill.studentId}
        prefillStudentName={prefill.studentName}
        prefillServiceTypeId={prefill.serviceTypeId}
        prefillServiceTypeName={prefill.serviceTypeName}
        prefillDurationMinutes={prefill.durationMinutes}
        prefillStartTime={prefill.startTime}
        prefillEndTime={prefill.endTime}
        sessionDate={prefill.date}
      />
    </>
  );
}
