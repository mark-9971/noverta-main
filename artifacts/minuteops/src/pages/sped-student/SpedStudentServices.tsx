import { useEffect, useState } from "react";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, TrendingUp, AlertCircle, CheckCircle } from "lucide-react";

const API = (import.meta as any).env.VITE_API_URL || "/api";

function serviceColor(name: string) {
  const n = (name || "").toLowerCase();
  if (n.includes("speech")) return { ring: "border-blue-200", badge: "bg-blue-100 text-blue-700", bar: "bg-blue-500", header: "text-blue-700" };
  if (n.includes("aba") || n.includes("behavior")) return { ring: "border-purple-200", badge: "bg-purple-100 text-purple-700", bar: "bg-purple-500", header: "text-purple-700" };
  if (n.includes("occupational")) return { ring: "border-amber-200", badge: "bg-amber-100 text-amber-700", bar: "bg-amber-500", header: "text-amber-700" };
  if (n.includes("physical")) return { ring: "border-green-200", badge: "bg-green-100 text-green-700", bar: "bg-green-500", header: "text-green-700" };
  if (n.includes("para")) return { ring: "border-pink-200", badge: "bg-pink-100 text-pink-700", bar: "bg-pink-500", header: "text-pink-700" };
  if (n.includes("counseling")) return { ring: "border-teal-200", badge: "bg-teal-100 text-teal-700", bar: "bg-teal-500", header: "text-teal-700" };
  return { ring: "border-violet-200", badge: "bg-violet-100 text-violet-700", bar: "bg-violet-500", header: "text-violet-700" };
}

export default function SpedStudentServices() {
  const { studentId } = useRole();
  const [student, setStudent] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    Promise.all([
      fetch(`${API}/students/${studentId}`).then(r => r.json()),
      fetch(`${API}/students/${studentId}/sessions?limit=100`).then(r => r.json()),
    ]).then(([s, sess]) => {
      setStudent(s);
      setSessions(Array.isArray(sess) ? sess : []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [studentId]);

  if (!studentId) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="p-8 text-center text-gray-400 bg-white rounded-xl border">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No student selected</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 space-y-4">{[1,2,3].map(i=><div key={i} className="h-40 bg-gray-200 rounded-xl animate-pulse"/>)}</div>;
  }

  const services = student?.serviceRequirements || [];

  function getServiceStats(serviceTypeName: string, requiredMinutes: number) {
    const svcSessions = sessions.filter(s =>
      (s.serviceTypeName || "").toLowerCase().includes((serviceTypeName || "").toLowerCase().split(" ")[0].toLowerCase())
    );
    const completedMins = svcSessions.filter(s => s.status === "completed").reduce((sum, s) => sum + (s.durationMinutes || 0), 0);
    const missedCount = svcSessions.filter(s => s.status === "missed").length;
    const requiredTotal = requiredMinutes * 4;
    const pct = requiredTotal > 0 ? Math.min(100, Math.round((completedMins / requiredTotal) * 100)) : 0;
    return { completedMins, missedCount, pct, totalSessions: svcSessions.length };
  }

  const totalMinutes = services.reduce((sum: number, svc: any) => sum + (svc.requiredMinutes || 0), 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-violet-500" />
          My Support Services
        </h1>
        <p className="text-gray-500 mt-1">
          {student?.firstName} {student?.lastName} · {services.length} active services · {totalMinutes} min/week total
        </p>
      </div>

      {services.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No active services found for this student</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((svc: any, i: number) => {
            const colors = serviceColor(svc.serviceTypeName || "");
            const stats = getServiceStats(svc.serviceTypeName || "", svc.requiredMinutes || 0);
            const isOnTrack = stats.pct >= 70;
            return (
              <Card key={i} className={`border-2 ${colors.ring}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className={`text-[15px] ${colors.header}`}>{svc.serviceTypeName || "Support Service"}</CardTitle>
                      <p className="text-xs text-gray-400 mt-0.5">{svc.deliveryType || "direct"} · {svc.requiredMinutes} min/week required</p>
                    </div>
                    <div className="flex items-center gap-1">
                      {isOnTrack ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-500" />
                      )}
                      <Badge className={`text-[10px] ${colors.badge}`} variant="outline">
                        {isOnTrack ? "On Track" : "Needs Attention"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="flex justify-between text-[11px] text-gray-500 mb-1.5">
                      <span>Monthly progress</span>
                      <span className="font-semibold">{stats.completedMins} / {(svc.requiredMinutes || 0) * 4} min</span>
                    </div>
                    <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                        style={{ width: `${stats.pct}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">{stats.pct}% of monthly requirement delivered</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {[
                      { label: "Total Sessions", value: stats.totalSessions },
                      { label: "Minutes Delivered", value: stats.completedMins },
                      { label: "Missed", value: stats.missedCount },
                    ].map(stat => (
                      <div key={stat.label} className="text-center p-2 bg-gray-50 rounded-lg">
                        <p className="text-base font-bold text-gray-800">{stat.value}</p>
                        <p className="text-[10px] text-gray-400 leading-tight mt-0.5">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="bg-gray-50 border-gray-200">
        <CardContent className="p-4 flex items-start gap-3">
          <TrendingUp className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-700">How services are tracked</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Your IEP team logs every session they provide. Minutes are tracked against your IEP requirements each month.
              If minutes fall short, makeup sessions are scheduled.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
