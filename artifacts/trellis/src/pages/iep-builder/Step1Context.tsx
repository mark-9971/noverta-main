import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Target, CheckCircle2, Star } from "lucide-react";
import { PROGRESS_COLORS, ACTION_COLORS, type BuilderContext } from "./types";

export function Step1Context({ context }: { context: BuilderContext }) {
  const { student, goalCounts, goalSummary, services, currentIep, latestReportPeriod, totalDataPoints, ageAppropriateSkills, nextSchoolYear } = context;
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600" /> Student Profile
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-[12px]">
            {[
              ["Name", student.name],
              ["Grade", student.grade || "N/A"],
              ["Age", student.age !== null ? `${student.age} years old` : "N/A"],
              ["Disability Category", student.disabilityCategory || "N/A"],
              ["Placement", student.placementType || "N/A"],
              ["School", student.schoolName || "N/A"],
            ].map(([k, v]) => (
              <div key={k} className="bg-gray-50 rounded-lg p-2.5">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider">{k}</p>
                <p className="font-semibold text-gray-800 mt-0.5">{v}</p>
              </div>
            ))}
          </div>
          {currentIep && (
            <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
              <p className="text-[11px] text-emerald-700 font-semibold">Current IEP Period: {currentIep.iepStartDate} to {currentIep.iepEndDate}</p>
              <p className="text-[11px] text-emerald-600 mt-0.5">Next year target: {nextSchoolYear.start} to {nextSchoolYear.end}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-600" /> Goal Progress Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {latestReportPeriod && <p className="text-[11px] text-gray-400 mb-3">Based on most recent report: {latestReportPeriod} · {totalDataPoints} data sessions</p>}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            {[
              { label: "Total Goals", value: goalCounts.total, bg: "bg-gray-50", color: "text-gray-700" },
              { label: "Mastered", value: goalCounts.mastered, bg: "bg-emerald-50", color: "text-emerald-700" },
              { label: "Sufficient Progress", value: goalCounts.sufficientProgress, bg: "bg-blue-50", color: "text-blue-700" },
              { label: "Needs Attention", value: goalCounts.needsAttention, bg: "bg-amber-50", color: "text-amber-700" },
              { label: "Not Addressed", value: goalCounts.notAddressed, bg: "bg-gray-50", color: "text-gray-500" },
            ].map(s => (
              <div key={s.label} className={`${s.bg} rounded-lg p-2.5 text-center`}>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className={`text-[9px] font-medium mt-0.5 ${s.color}`}>{s.label}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {goalSummary.map(g => {
              const c = PROGRESS_COLORS[g.progressCode] || PROGRESS_COLORS.NA;
              const a = ACTION_COLORS[g.recommendation.action] || ACTION_COLORS.review;
              return (
                <div key={g.id} className={`border ${c.border} rounded-lg p-3`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${c.bg} ${c.color}`}>{g.progressCode}</span>
                    <span className="text-[12px] font-medium text-gray-700 flex-1">{g.goalArea} — Goal {g.goalNumber}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${a.bg} ${a.color}`}>{a.label}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 truncate">{g.annualGoal}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{g.currentPerformance}</p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-[14px] font-bold text-gray-800">Service Compliance</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          {services.map(s => (
            <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-2.5">
              <div>
                <p className="text-[13px] font-medium text-gray-700">{s.serviceTypeName}</p>
                <p className="text-[11px] text-gray-400">{s.requiredMinutes} min/{s.intervalType} · {s.deliveryType} · {s.setting}</p>
              </div>
              {s.compliancePercent !== null ? (
                <span className={`text-[12px] font-bold ${s.compliancePercent >= 90 ? "text-emerald-700" : s.compliancePercent >= 75 ? "text-amber-600" : "text-red-600"}`}>
                  {s.compliancePercent}%
                </span>
              ) : <span className="text-[11px] text-gray-400">No data</span>}
            </div>
          ))}
          {services.length === 0 && <p className="text-[13px] text-gray-400 text-center py-4">No active services found.</p>}
        </CardContent>
      </Card>

      {ageAppropriateSkills.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-[14px] font-bold text-gray-800 flex items-center gap-2">
              <Star className="w-4 h-4 text-emerald-600" /> Age-Appropriate Skill Areas to Consider
              <span className="text-[10px] font-normal text-gray-400 ml-1">for age {student.age ?? "N/A"}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {ageAppropriateSkills.map(skill => (
                <div key={skill} className="bg-gray-50 rounded-lg px-3 py-2 text-[12px] text-gray-700 flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /> {skill}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
