import { useEffect, useState } from "react";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Sparkles, Star, MessageCircle, Heart } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

interface Win {
  id: number;
  type: string;
  title: string;
  message: string | null;
  goalArea: string | null;
  staffFirstName: string | null;
  staffLastName: string | null;
  createdAt: string;
}

function typeConfig(type: string) {
  switch (type) {
    case "milestone": return { icon: Trophy, color: "bg-amber-50 text-amber-600 border-amber-200", iconColor: "text-amber-500" };
    case "streak": return { icon: Sparkles, color: "bg-orange-50 text-orange-600 border-orange-200", iconColor: "text-orange-500" };
    case "session_complete": return { icon: Star, color: "bg-emerald-50 text-emerald-600 border-emerald-200", iconColor: "text-emerald-500" };
    case "encouragement": default: return { icon: Heart, color: "bg-rose-50 text-rose-600 border-rose-200", iconColor: "text-rose-500" };
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function SpedStudentWins() {
  const { studentId } = useRole();
  const [wins, setWins] = useState<Win[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    customFetch<Win[]>(`/api/student-portal/wins?studentId=${studentId}`)
      .then(d => { setWins(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [studentId]);

  if (!studentId) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="p-8 text-center text-gray-400 bg-white rounded-xl border">
          <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No student selected</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">{[1,2,3].map(i=><div key={i} className="h-24 bg-gray-200 rounded-xl animate-pulse"/>)}</div>;
  }

  const milestones = wins.filter(w => w.type === "milestone" || w.type === "streak").length;
  const encouragements = wins.filter(w => w.type === "encouragement").length;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" />
          My Wins
        </h1>
        <p className="text-sm text-gray-500 mt-1">Accomplishments and encouragement from your support team</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{milestones}</p>
            <p className="text-xs text-gray-400 mt-1">Milestones</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-rose-500">{encouragements}</p>
            <p className="text-xs text-gray-400 mt-1">Messages</p>
          </CardContent>
        </Card>
      </div>

      {wins.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <Sparkles className="w-12 h-12 text-amber-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-600">No wins yet</p>
            <p className="text-xs text-gray-400 mt-1">Keep working toward your goals — your team will celebrate your accomplishments here!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {wins.map(win => {
            const config = typeConfig(win.type);
            const Icon = config.icon;
            return (
              <Card key={win.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${config.color.split(" ")[0]}`}>
                      <Icon className={`w-5 h-5 ${config.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold text-gray-800">{win.title}</p>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">{timeAgo(win.createdAt)}</span>
                      </div>
                      {win.message && (
                        <p className="text-[12px] text-gray-500 mt-1 leading-relaxed">{win.message}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {win.staffFirstName && (
                          <span className="text-[10px] text-gray-400 flex items-center gap-1">
                            <MessageCircle className="w-3 h-3" />
                            from {win.staffFirstName} {win.staffLastName}
                          </span>
                        )}
                        {win.goalArea && (
                          <Badge variant="outline" className="text-[9px] border-gray-200 text-gray-400">
                            {win.goalArea}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="bg-emerald-50 border-emerald-100">
        <CardContent className="p-4 flex items-start gap-3">
          <Heart className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-800">Your team is cheering you on</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Your teachers and specialists can send you encouraging messages and celebrate your milestones right here.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
