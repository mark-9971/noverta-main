import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import { formatDate } from "@/lib/formatters";
import { FileSearch, ClipboardList, Users, CheckCircle2 } from "lucide-react";
import { REFERRAL_SOURCES } from "./constants";
import { statusBadge, deadlineBadge } from "./shared";
import type { ReferralRecord, EvaluationRecord, EligibilityRecord, PipelineCard } from "./types";

export function PipelineView({ onCardClick }: { onCardClick: (card: PipelineCard) => void }) {
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [eligibility, setEligibility] = useState<EligibilityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      authFetch("/api/evaluations/referrals").then(r => r.ok ? r.json() : []),
      authFetch("/api/evaluations").then(r => r.ok ? r.json() : []),
      authFetch("/api/evaluations/eligibility").then(r => r.ok ? r.json() : []),
    ]).then(([refs, evals, elig]) => {
      setReferrals(refs);
      setEvaluations(evals);
      setEligibility(elig);
    }).catch(() => toast.error("Failed to load pipeline data"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {[1,2,3,4].map(i => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
    </div>
  );

  const evalsByReferralId = new Map<number, EvaluationRecord>();
  for (const ev of evaluations) {
    if (ev.referralId) evalsByReferralId.set(ev.referralId, ev);
  }

  const eligByStudentId = new Map<number, EligibilityRecord>();
  for (const el of eligibility) {
    if (!eligByStudentId.has(el.studentId)) eligByStudentId.set(el.studentId, el);
  }

  const referralCards: PipelineCard[] = referrals
    .filter(r => r.status === "open" && !evalsByReferralId.has(r.id))
    .map(r => ({
      id: `ref-${r.id}`,
      studentId: r.studentId,
      studentName: r.studentName ?? "—",
      studentGrade: r.studentGrade,
      type: "referral",
      sourceId: r.id,
      status: r.consentStatus,
      date: r.referralDate,
      detail: REFERRAL_SOURCES.find(s => s.value === r.referralSource)?.label ?? r.referralSource,
      deadline: r.evaluationDeadline,
      daysUntil: r.daysUntilDeadline,
    }));

  const inProgressCards: PipelineCard[] = evaluations
    .filter(ev => ev.status === "pending" || ev.status === "in_progress" || ev.status === "overdue")
    .map(ev => ({
      id: `eval-${ev.id}`,
      studentId: ev.studentId,
      studentName: ev.studentName ?? "—",
      studentGrade: ev.studentGrade,
      type: "evaluation",
      sourceId: ev.id,
      status: ev.status,
      date: ev.startDate ?? ev.createdAt?.slice(0, 10) ?? "",
      detail: ev.evaluationType.replace(/_/g, " "),
      deadline: ev.dueDate,
      daysUntil: ev.daysUntilDue,
    }));

  const eligByEvalId = new Map<number, EligibilityRecord>();
  for (const el of eligibility) {
    if (el.evaluationId) eligByEvalId.set(el.evaluationId, el);
  }

  const completedCards: PipelineCard[] = evaluations
    .filter(ev => ev.status === "completed")
    .filter(ev => {
      if (ev.id && eligByEvalId.has(ev.id)) return false;
      if (!ev.referralId && eligByStudentId.has(ev.studentId)) return false;
      return true;
    })
    .map(ev => ({
      id: `eval-done-${ev.id}`,
      studentId: ev.studentId,
      studentName: ev.studentName ?? "—",
      studentGrade: ev.studentGrade,
      type: "evaluation",
      sourceId: ev.id,
      status: "completed",
      date: ev.completionDate ?? "",
      detail: ev.evaluationType.replace(/_/g, " "),
    }));

  const eligCards: PipelineCard[] = eligibility.map(el => ({
    id: `elig-${el.id}`,
    studentId: el.studentId,
    studentName: el.studentName ?? "—",
    studentGrade: el.studentGrade,
    type: "eligibility",
    sourceId: el.id,
    status: el.eligible === true ? "eligible" : el.eligible === false ? "not_eligible" : "pending",
    date: el.meetingDate,
    detail: el.primaryDisability ?? "No disability specified",
  }));

  const columns = [
    { key: "referral", label: "Referral", icon: FileSearch, color: "blue", cards: referralCards },
    { key: "in_progress", label: "In Progress", icon: ClipboardList, color: "amber", cards: inProgressCards },
    { key: "completed", label: "Completed", icon: CheckCircle2, color: "emerald", cards: completedCards },
    { key: "eligibility", label: "Eligibility Determined", icon: Users, color: "purple", cards: eligCards },
  ];

  const columnColors: Record<string, { header: string; dot: string; badge: string }> = {
    blue: { header: "text-blue-700", dot: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-200" },
    amber: { header: "text-amber-700", dot: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-200" },
    emerald: { header: "text-emerald-700", dot: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    purple: { header: "text-purple-700", dot: "bg-purple-500", badge: "bg-purple-50 text-purple-700 border-purple-200" },
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {columns.map(col => {
        const colors = columnColors[col.color];
        return (
          <div key={col.key} className="bg-gray-50/60 rounded-xl border border-gray-200/60 min-h-[300px] flex flex-col">
            <div className="px-3 py-2.5 border-b border-gray-200/60 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
              <span className={`text-[12px] font-semibold ${colors.header}`}>{col.label}</span>
              <span className="ml-auto text-[11px] text-gray-400 font-medium">{col.cards.length}</span>
            </div>
            <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[600px]">
              {col.cards.length === 0 && (
                <p className="text-[11px] text-gray-400 text-center py-6">No items</p>
              )}
              {col.cards.map(card => (
                <div key={card.id} onClick={() => onCardClick(card)} className="bg-white rounded-lg border border-gray-200/80 p-3 shadow-sm hover:shadow transition-shadow cursor-pointer hover:border-gray-300">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] font-semibold text-gray-800 leading-tight">{card.studentName}</p>
                    {card.studentGrade && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1 flex-shrink-0">Gr {card.studentGrade}</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 capitalize">{card.detail}</p>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <span className="text-[10px] text-gray-400">{card.date ? formatDate(card.date) : "—"}</span>
                    {card.daysUntil !== undefined && card.daysUntil !== null && (
                      deadlineBadge(card.daysUntil)
                    )}
                    {card.type === "eligibility" && (
                      card.status === "eligible"
                        ? statusBadge("Eligible", "emerald")
                        : card.status === "not_eligible"
                        ? statusBadge("Not Eligible", "red")
                        : statusBadge("Pending", "amber")
                    )}
                  </div>
                  {card.type === "referral" && (
                    <div className="mt-1.5">
                      {card.status === "obtained"
                        ? statusBadge("Consent Obtained", "emerald")
                        : card.status === "refused"
                        ? statusBadge("Consent Refused", "red")
                        : statusBadge("Consent Pending", "amber")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
