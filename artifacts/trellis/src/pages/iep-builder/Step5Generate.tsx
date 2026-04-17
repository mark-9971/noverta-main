import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Loader2, RefreshCw, Download, AlertCircle, CheckCircle2, GraduationCap,
} from "lucide-react";
import { PROGRESS_COLORS, ACTION_COLORS, type BuilderContext, type GeneratedDraft } from "./types";

export function Step5Generate({ draft, generating, onGenerate, onPrint, context }: {
  draft: GeneratedDraft | null;
  generating: boolean;
  onGenerate: () => void;
  onPrint: () => void;
  context: BuilderContext;
}) {
  if (!draft && !generating) {
    return (
      <div className="text-center py-16 space-y-4">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
          <Sparkles className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-lg font-bold text-gray-800">Ready to Generate</h2>
        <p className="text-[13px] text-gray-500 max-w-md mx-auto">
          Trellis will analyze all progress data, questionnaire input, service compliance, and age-appropriate skills
          to generate a structured draft for the {context.nextSchoolYear.label} Annual IEP Review.
        </p>
        <Button className="bg-emerald-700 hover:bg-emerald-800 text-white" onClick={onGenerate}>
          <Sparkles className="w-4 h-4 mr-2" /> Generate Annual IEP Draft
        </Button>
        <p className="text-[11px] text-gray-400 max-w-sm mx-auto">All recommendations require IEP Team review. This tool assists — it does not replace — professional judgment.</p>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="text-center py-16 space-y-4">
        <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mx-auto" />
        <p className="text-[13px] text-gray-600">Analyzing progress data, questionnaire input, and service compliance…</p>
      </div>
    );
  }

  if (!draft) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-bold text-gray-800">Draft IEP Recommendations — {draft.generatedFor}</h2>
          <p className="text-[11px] text-gray-400">IEP Period: {draft.iepStartDate} to {draft.iepEndDate} · Generated {new Date(draft.generatedAt).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onGenerate}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Regenerate
          </Button>
          <Button size="sm" variant="outline" onClick={onPrint}>
            <Download className="w-3.5 h-3.5 mr-1" /> Print / PDF
          </Button>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700">{draft.disclaimer}</p>
      </div>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Present Levels (PLAAFP) — Draft</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {[
            { key: "academic", label: "Academic Performance" },
            { key: "behavioral", label: "Behavioral / Functional" },
            { key: "communication", label: "Communication" },
            { key: "parentInput", label: "Parent / Guardian Input" },
            { key: "studentVoice", label: "Student Voice" },
          ].map(({ key, label }) => draft.plaafp[key] ? (
            <div key={key} className="bg-gray-50 border-l-2 border-emerald-400 rounded-r-lg p-3">
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">{label}</p>
              <p className="text-[12px] text-gray-700 leading-relaxed">{draft.plaafp[key]}</p>
            </div>
          ) : null)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Goal Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {draft.goalRecommendations.map((g) => {
            const pc = PROGRESS_COLORS[g.progressCode] || PROGRESS_COLORS.NA;
            const ac = ACTION_COLORS[g.recommendation.action] || ACTION_COLORS.review;
            return (
              <div key={g.id} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${pc.bg} ${pc.color} ${pc.border}`}>{g.progressCode}</span>
                    <span className="text-[12px] font-semibold text-gray-700">Goal {g.goalNumber} — {g.goalArea}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ac.bg} ${ac.color}`}>{ac.label}</span>
                </div>
                <div className="px-3 py-2.5 space-y-2">
                  <div className="text-[11px] text-gray-400">
                    <span className="font-medium text-gray-500">Current: </span>{g.currentPerformance}
                  </div>
                  <div className="text-[11px] text-gray-500 italic">{g.recommendation.rationale}</div>
                  <div className="bg-emerald-50 border border-emerald-200 rounded p-2.5 space-y-1">
                    <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Recommended Annual Goal</p>
                    <p className="text-[12px] text-gray-800">{g.recommendation.suggestedGoal}</p>
                    <p className="text-[11px] text-emerald-600">Criterion: {g.recommendation.suggestedCriterion}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {draft.additionalGoalSuggestions.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800">Additional Goal Suggestions</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {draft.additionalGoalSuggestions.map((s, i) => (
              <div key={i} className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-200 text-blue-800 font-medium capitalize">{s.source}</span>
                  <span className="text-[12px] font-medium text-gray-700">{s.goalArea}</span>
                </div>
                <p className="text-[12px] text-gray-700">{s.suggestedGoal}</p>
                <p className="text-[11px] text-gray-400 mt-1">{s.rationale}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Service Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {draft.serviceRecommendations.map((s, i) => {
            const isReview = s.action === "review" || s.action === "increase";
            return (
              <div key={i} className={`rounded-lg border p-3 ${isReview ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-gray-50"}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[13px] font-medium text-gray-700">{s.serviceType}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">{s.currentMinutes} min/{s.currentInterval}</span>
                    <span className={`text-[11px] font-bold ${s.compliancePercent >= 90 ? "text-emerald-700" : s.compliancePercent >= 75 ? "text-amber-600" : "text-red-600"}`}>
                      {s.compliancePercent}%
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-gray-600">{s.rationale}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {draft.accommodationRecommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800">Accommodations</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-1.5">
              {draft.accommodationRecommendations.map((a, i) => (
                <div key={i} className="flex items-start gap-2 text-[12px] text-gray-700 bg-gray-50 rounded-lg p-2.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{a.description}</span>
                    {a.category && a.category !== "Teacher Recommended" && <span className="text-gray-400 ml-1">({a.category})</span>}
                    {a.category === "Teacher Recommended" && <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 ml-1">NEW</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {draft.transitionPlan && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-emerald-600" /> Transition Plan
              {(draft.transitionPlan as any).plannedGraduationYear && (
                <span className="text-[10px] font-normal text-gray-400">Planned graduation ~{(draft.transitionPlan as any).plannedGraduationYear}</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {Object.entries(draft.transitionPlan.domains || {}).map(([domain, d]: [string, any]) => (
              <div key={domain} className="border border-gray-200 rounded-lg p-3">
                <p className="text-[12px] font-bold text-gray-700 mb-2">{domain}</p>
                <div className="space-y-1 text-[12px] text-gray-600">
                  <p><span className="font-medium">Goal:</span> {d.goal}</p>
                  <p><span className="font-medium">Services:</span> {d.services}</p>
                  {d.assessment && <p><span className="font-medium">Assessment:</span> {d.assessment}</p>}
                </div>
              </div>
            ))}
            {draft.transitionPlan.agencyLinkages && (
              <div className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-[11px] font-medium text-gray-600">Agency Linkages: {draft.transitionPlan.agencyLinkages}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {draft.teamDiscussionNotes.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800">IEP Team Discussion Items</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {draft.teamDiscussionNotes.map((note, i) => (
              <div key={i} className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg p-2.5">
                <AlertCircle className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-[12px] text-blue-800">{note}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
