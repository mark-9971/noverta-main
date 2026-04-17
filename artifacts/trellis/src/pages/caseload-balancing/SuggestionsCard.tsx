import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, TrendingUp } from "lucide-react";
import { Suggestion, ROLE_LABELS } from "./types";

export function SuggestionsCard({ suggestions }: { suggestions: Suggestion[] }) {
  if (suggestions.length === 0) return null;
  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Rebalancing Suggestions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {suggestions.map((s, i) => (
            <div key={i} className="p-3 bg-gray-50 rounded-lg border text-sm">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-red-600">{s.fromProviderName}</span>
                <span className="text-gray-400">({s.fromStudentCount})</span>
                <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-medium text-emerald-600">{s.toProviderName}</span>
                <span className="text-gray-400">({s.toStudentCount})</span>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge variant="outline" className="text-xs">{ROLE_LABELS[s.role] || s.role}</Badge>
                <span className="text-xs text-gray-500">Move ~{s.studentsToMove} student{s.studentsToMove > 1 ? "s" : ""}</span>
                {s.sameSchool && <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">Same School</Badge>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
