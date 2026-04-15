import { useEffect, useState } from "react";
import { useRole } from "@/lib/role-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Heart, Flame, SmilePlus, Frown, Meh, Smile, Laugh, CheckCircle, Calendar } from "lucide-react";
import { customFetch } from "@workspace/api-client-react";

interface CheckIn {
  id: number;
  checkInType: string;
  value: number;
  label: string | null;
  note: string | null;
  checkInDate: string;
  createdAt: string;
}

interface Streak {
  currentStreak: number;
  totalCheckIns: number;
}

const MOOD_OPTIONS = [
  { value: 1, label: "Struggling", icon: Frown, color: "bg-red-50 text-red-600 border-red-200 hover:bg-red-100" },
  { value: 2, label: "Not Great", icon: Meh, color: "bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100" },
  { value: 3, label: "Okay", icon: Smile, color: "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100" },
  { value: 4, label: "Good", icon: Smile, color: "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100" },
  { value: 5, label: "Great!", icon: Laugh, color: "bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200" },
];

const FOCUS_OPTIONS = [
  { value: 1, label: "Very Hard", color: "bg-red-50 text-red-600 border-red-200" },
  { value: 2, label: "Hard", color: "bg-amber-50 text-amber-600 border-amber-200" },
  { value: 3, label: "Okay", color: "bg-gray-50 text-gray-600 border-gray-200" },
  { value: 4, label: "Easy", color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  { value: 5, label: "Very Easy", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
];

export default function SpedStudentCheckIn() {
  const { studentId } = useRole();
  const [checkIns, setCheckIns] = useState<CheckIn[]>([]);
  const [streak, setStreak] = useState<Streak>({ currentStreak: 0, totalCheckIns: 0 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [moodValue, setMoodValue] = useState<number | null>(null);
  const [focusValue, setFocusValue] = useState<number | null>(null);
  const [note, setNote] = useState("");

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    Promise.all([
      customFetch<CheckIn[]>(`/api/student-portal/check-ins?studentId=${studentId}&limit=30`),
      customFetch<Streak>(`/api/student-portal/streak?studentId=${studentId}`),
    ]).then(([ci, s]) => {
      setCheckIns(Array.isArray(ci) ? ci : []);
      setStreak(s || { currentStreak: 0, totalCheckIns: 0 });
      const todayCheckIn = (Array.isArray(ci) ? ci : []).find(c => c.checkInDate === today);
      if (todayCheckIn) setSubmitted(true);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [studentId]);

  async function handleSubmit() {
    if (!studentId || moodValue === null) return;
    setSubmitting(true);

    try {
      await customFetch(`/api/student-portal/check-ins`, {
        method: "POST",
        body: JSON.stringify({
          checkInType: "mood",
          value: moodValue,
          label: MOOD_OPTIONS.find(m => m.value === moodValue)?.label,
          note: note || undefined,
        }),
        headers: { "Content-Type": "application/json" },
      });

      if (focusValue !== null) {
        await customFetch(`/api/student-portal/check-ins`, {
          method: "POST",
          body: JSON.stringify({
            checkInType: "focus",
            value: focusValue,
            label: FOCUS_OPTIONS.find(f => f.value === focusValue)?.label,
          }),
          headers: { "Content-Type": "application/json" },
        });
      }

      setSubmitted(true);
      setStreak(s => ({ ...s, currentStreak: s.currentStreak + 1, totalCheckIns: Number(s.totalCheckIns) + (focusValue ? 2 : 1) }));
    } catch {
      // silent
    }
    setSubmitting(false);
  }

  if (!studentId) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="p-8 text-center text-gray-400 bg-white rounded-xl border">
          <Heart className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No student selected</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="p-4 md:p-6 space-y-4 max-w-4xl mx-auto">{[1,2].map(i=><div key={i} className="h-40 bg-gray-200 rounded-xl animate-pulse"/>)}</div>;
  }

  const recentMoods = checkIns.filter(c => c.checkInType === "mood").slice(0, 7);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Heart className="w-5 h-5 sm:w-6 sm:h-6 text-rose-500" />
          Daily Check-In
        </h1>
        <p className="text-sm text-gray-500 mt-1">Take a moment to reflect on how you're doing today</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" />
              <p className="text-2xl font-bold text-gray-800">{streak.currentStreak}</p>
            </div>
            <p className="text-xs text-gray-400 mt-1">Day Streak</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              <p className="text-2xl font-bold text-gray-800">{streak.totalCheckIns}</p>
            </div>
            <p className="text-xs text-gray-400 mt-1">Total Check-Ins</p>
          </CardContent>
        </Card>
      </div>

      {submitted ? (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="p-6 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-lg font-semibold text-emerald-800">You've checked in today!</p>
            <p className="text-sm text-emerald-600 mt-1">Great job keeping up with your self-monitoring. Come back tomorrow!</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-gray-600 flex items-center gap-2">
              <SmilePlus className="w-4 h-4" />
              How are you feeling today?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-5 gap-2">
              {MOOD_OPTIONS.map(opt => {
                const Icon = opt.icon;
                const selected = moodValue === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setMoodValue(opt.value)}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                      selected ? `${opt.color} border-current ring-2 ring-current/20 scale-105` : "border-gray-100 hover:border-gray-200"
                    }`}
                  >
                    <Icon className={`w-6 h-6 sm:w-7 sm:h-7 ${selected ? "" : "text-gray-400"}`} />
                    <span className={`text-[10px] sm:text-[11px] font-medium ${selected ? "" : "text-gray-400"}`}>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <div>
              <p className="text-sm font-medium text-gray-600 mb-2">How easy was it to focus today?</p>
              <div className="grid grid-cols-5 gap-2">
                {FOCUS_OPTIONS.map(opt => {
                  const selected = focusValue === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setFocusValue(opt.value)}
                      className={`p-2 rounded-lg border-2 text-center transition-all ${
                        selected ? `${opt.color} border-current ring-1 ring-current/20` : "border-gray-100 hover:border-gray-200"
                      }`}
                    >
                      <span className={`text-[11px] font-medium ${selected ? "" : "text-gray-400"}`}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-600 mb-1 block">Anything else? (optional)</label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="How did your day go? What helped you today?"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                rows={2}
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={moodValue === null || submitting}
              className="w-full bg-emerald-600 hover:bg-emerald-700"
            >
              {submitting ? "Saving..." : "Submit Check-In"}
            </Button>
          </CardContent>
        </Card>
      )}

      {recentMoods.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-gray-600">Recent Mood History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 justify-center py-2">
              {recentMoods.reverse().map(ci => {
                const opt = MOOD_OPTIONS.find(m => m.value === ci.value) || MOOD_OPTIONS[2];
                const Icon = opt.icon;
                const height = ci.value * 16;
                return (
                  <div key={ci.id} className="flex flex-col items-center gap-1">
                    <Icon className={`w-4 h-4 ${opt.color.split(" ")[1]}`} />
                    <div className={`w-8 rounded-t-lg ${opt.color.split(" ")[0]}`} style={{ height: `${height}px` }} />
                    <span className="text-[9px] text-gray-400">
                      {new Date(ci.checkInDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
