import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { ProgressReport, GoalProgressEntry, RATING_CONFIG, EditFields } from "./types";
import { TrendIcon } from "./TrendIcon";

interface Props {
  report: ProgressReport;
  fields: EditFields;
  setFields: (f: EditFields) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

export function ReportEditor({ fields, setFields, onSave, onCancel, saving }: Props) {
  const updateGoalNarrative = (idx: number, narrative: string) => {
    const updated: GoalProgressEntry[] = [...fields.goalProgress];
    updated[idx] = { ...updated[idx], narrative };
    setFields({ ...fields, goalProgress: updated });
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1000px] mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="w-4 h-4 mr-1" /> Cancel</Button>
        <h1 className="text-lg font-bold text-gray-800 flex-1">Edit Progress Report</h1>
        <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1.5" />} Save Changes
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Overall Summary</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={6} value={fields.overallSummary} onChange={e => setFields({ ...fields, overallSummary: e.target.value })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Goal Narratives</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {fields.goalProgress.map((g, idx) => {
            const rc = RATING_CONFIG[g.progressRating] || RATING_CONFIG.not_addressed;
            return (
              <div key={idx} className="border rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-semibold text-sm">{g.goalArea} — Goal #{g.goalNumber}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${rc.color} ${rc.bg}`}>{rc.label}</span>
                  <TrendIcon direction={g.trendDirection} />
                </div>
                <p className="text-xs text-gray-500 mb-2 line-clamp-2">{g.annualGoal}</p>
                <Textarea rows={3} value={g.narrative} onChange={e => updateGoalNarrative(idx, e.target.value)}
                  placeholder="Progress narrative for this goal..." />
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Recommendations</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={4} value={fields.recommendations} onChange={e => setFields({ ...fields, recommendations: e.target.value })}
            placeholder="Recommendations for the IEP team..." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Notes to Parent/Guardian</CardTitle></CardHeader>
        <CardContent>
          <Textarea rows={4} value={fields.parentNotes} onChange={e => setFields({ ...fields, parentNotes: e.target.value })}
            placeholder="Additional notes for the parent/guardian..." />
        </CardContent>
      </Card>
    </div>
  );
}
