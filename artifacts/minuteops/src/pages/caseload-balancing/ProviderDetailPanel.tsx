import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, UserMinus } from "lucide-react";
import { ProviderCaseload, ProviderStudent, STATUS_COLORS, ROLE_LABELS } from "./types";

interface Props {
  selectedProvider: ProviderCaseload | null;
  providerStudents: ProviderStudent[];
  studentsLoading: boolean;
  onReassign: (student: ProviderStudent, fromProvider: ProviderCaseload) => void;
}

export function ProviderDetailPanel({ selectedProvider, providerStudents, studentsLoading, onReassign }: Props) {
  if (!selectedProvider) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-400">
          <UserMinus className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select a provider to view their caseload</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>{selectedProvider.firstName} {selectedProvider.lastName}</span>
          <Badge variant="outline" className={`${STATUS_COLORS[selectedProvider.status].bg} ${STATUS_COLORS[selectedProvider.status].text} text-xs`}>
            {selectedProvider.studentCount}/{selectedProvider.threshold}
          </Badge>
        </CardTitle>
        <p className="text-xs text-gray-500">{ROLE_LABELS[selectedProvider.role] || selectedProvider.role} — {selectedProvider.schoolName}</p>
      </CardHeader>
      <CardContent>
        {studentsLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10" />)}</div>
        ) : providerStudents.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No students assigned</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {providerStudents.map(s => (
              <div key={s.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm">
                <div>
                  <p className="font-medium">{s.firstName} {s.lastName}</p>
                  <p className="text-xs text-gray-400">{s.grade ? `Grade ${s.grade}` : ""} {s.schoolName ? `— ${s.schoolName}` : ""}</p>
                </div>
                {selectedProvider.status !== "balanced" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-gray-400 hover:text-emerald-600"
                    onClick={(e) => { e.stopPropagation(); onReassign(s, selectedProvider); }}
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
