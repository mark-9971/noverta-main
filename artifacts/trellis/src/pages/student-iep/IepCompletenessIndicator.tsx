import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getStudentIepDocumentCompleteness } from "@workspace/api-client-react";

interface CompletenessData {
  percentage: number; completedCount: number; totalCount: number;
  isComplete: boolean; missingSections: { section: string; label: string }[];
}

export function IepCompletenessIndicator({ studentId, docId }: { studentId: number; docId: number }) {
  const [data, setData] = useState<CompletenessData | null>(null);

  useEffect(() => {
    getStudentIepDocumentCompleteness(studentId, docId).then(d => setData(d as unknown as CompletenessData))
      .catch(() => {});
  }, [studentId, docId]);

  if (!data) return null;

  const barColor = data.percentage === 100 ? "bg-emerald-500" : data.percentage >= 70 ? "bg-amber-500" : "bg-red-500";
  const textColor = data.percentage === 100 ? "text-emerald-700" : data.percentage >= 70 ? "text-amber-700" : "text-red-700";

  return (
    <Card className={data.isComplete ? "border-emerald-200" : "border-amber-200"}>
      <CardContent className="p-3.5">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${data.isComplete ? "bg-emerald-50" : "bg-amber-50"}`}>
            {data.isComplete ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-amber-600" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-gray-700">
                {data.isComplete ? "IEP Document Complete" : "IEP Document Incomplete"}
              </p>
              <p className={`text-[13px] font-bold ${textColor}`}>{data.percentage}%</p>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1.5">
              <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${data.percentage}%` }} />
            </div>
            {data.missingSections.length > 0 && (
              <p className="text-[11px] text-gray-400 mt-1.5">
                Missing: {data.missingSections.map(m => m.label).join(", ")}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
