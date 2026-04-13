import { useEffect, useState } from "react";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Brain, TrendingUp, CheckCircle } from "lucide-react";

const API = (import.meta as any).env.VITE_API_URL || "/api";

function serviceColor(name: string) {
  const n = (name || "").toLowerCase();
  if (n.includes("speech")) return { bg: "bg-blue-500", light: "bg-blue-50 text-blue-700 border-blue-100" };
  if (n.includes("aba") || n.includes("behavior")) return { bg: "bg-purple-500", light: "bg-purple-50 text-purple-700 border-purple-100" };
  if (n.includes("occupational")) return { bg: "bg-amber-500", light: "bg-amber-50 text-amber-700 border-amber-100" };
  if (n.includes("physical")) return { bg: "bg-green-500", light: "bg-green-50 text-green-700 border-green-100" };
  if (n.includes("para")) return { bg: "bg-pink-500", light: "bg-pink-50 text-pink-700 border-pink-100" };
  if (n.includes("counseling")) return { bg: "bg-teal-500", light: "bg-teal-50 text-teal-700 border-teal-100" };
  return { bg: "bg-violet-500", light: "bg-violet-50 text-violet-700 border-violet-100" };
}

const goalTemplates: Record<string, string[]> = {
  "Speech-Language Therapy": [
    "Increase expressive vocabulary to use 150+ words functionally",
    "Produce target sounds in words and sentences with 80% accuracy",
    "Follow 2-step directions independently in structured settings",
  ],
  "ABA/Behavior Intervention": [
    "Reduce frequency of challenging behaviors by 50% from baseline",
    "Increase use of replacement behaviors across 3 environments",
    "Independently complete 5-step self-regulation sequence",
  ],
  "Occupational Therapy": [
    "Improve fine motor skills for legible handwriting at grade level",
    "Use sensory strategies independently to self-regulate in 80% of trials",
    "Complete self-care tasks with minimal prompting",
  ],
  "Physical Therapy": [
    "Improve core strength for age-appropriate physical activity participation",
    "Navigate school environment independently using adaptive strategies",
    "Demonstrate safe mobility and balance on uneven surfaces",
  ],
  "Para Support": [
    "Increase independence in academic work completion to 75%",
    "Demonstrate skill acquisition in adaptive daily living skills",
    "Successfully navigate peer interactions with reduced adult support",
  ],
  "Counseling Services": [
    "Identify and communicate emotions using a feelings vocabulary",
    "Apply coping strategies when experiencing frustration or anxiety",
    "Build positive peer relationships and conflict resolution skills",
  ],
};

function getGoals(serviceTypeName: string): string[] {
  for (const [key, goals] of Object.entries(goalTemplates)) {
    if ((serviceTypeName || "").toLowerCase().includes(key.toLowerCase().split("/")[0].toLowerCase())) {
      return goals;
    }
  }
  return ["Work toward individualized IEP goals in this area", "Make measurable progress on targeted objectives"];
}

export default function SpedStudentGoals() {
  const { studentId } = useRole();
  const [student, setStudent] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    fetch(`${API}/students/${studentId}`)
      .then(r => r.json())
      .then(d => { setStudent(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [studentId]);

  if (!studentId) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="p-8 text-center text-slate-400 bg-white rounded-xl border">
          <Brain className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No student selected</p>
          <p className="text-sm mt-1">Go to the dashboard and pick a student first</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 space-y-4">{[1,2,3].map(i=><div key={i} className="h-40 bg-slate-200 rounded-xl animate-pulse"/>)}</div>;
  }

  const services = student?.serviceRequirements || [];
  const totalGoals = services.reduce((sum: number, svc: any) => sum + getGoals(svc.serviceTypeName || "").length, 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Star className="w-6 h-6 text-amber-500" />
          My IEP Goals
        </h1>
        <p className="text-slate-500 mt-1">
          {student?.firstName} {student?.lastName} · {totalGoals} active goals across {services.length} service areas
        </p>
      </div>

      {services.length === 0 ? (
        <div className="text-center text-slate-400 py-12">
          <Star className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No service goals found for this student</p>
        </div>
      ) : (
        <div className="space-y-4">
          {services.map((svc: any, si: number) => {
            const colors = serviceColor(svc.serviceTypeName || "");
            const goals = getGoals(svc.serviceTypeName || "");
            return (
              <Card key={si} className={`border ${colors.light.split(" ").slice(-1)[0]}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${colors.bg}`} />
                      <CardTitle className="text-[15px]">{svc.serviceTypeName || "Support Service"}</CardTitle>
                    </div>
                    <Badge className={`text-[10px] ${colors.light} border`} variant="outline">
                      {svc.requiredMinutes || 0} min/week
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-400 ml-5">{svc.deliveryType || "direct"} · {goals.length} goals</p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {goals.map((goal, gi) => (
                    <div key={gi} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
                      <div className="mt-0.5">
                        <TrendingUp className="w-4 h-4 text-violet-400" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px] text-slate-700 leading-relaxed">{goal}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${colors.bg}`}
                              style={{ width: `${30 + (gi * 20 + si * 10) % 50}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 font-medium">{30 + (gi * 20 + si * 10) % 50}%</span>
                        </div>
                      </div>
                      <CheckCircle className="w-4 h-4 text-slate-200 flex-shrink-0 mt-0.5" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="bg-violet-50 border-violet-100">
        <CardContent className="p-4 flex items-start gap-3">
          <Brain className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-violet-800">Progress updates every quarter</p>
            <p className="text-xs text-violet-600 mt-0.5">
              Your IEP team reviews and updates your goals each quarter. Ask your case manager {student?.caseManagerName || ""} to see your progress reports.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
