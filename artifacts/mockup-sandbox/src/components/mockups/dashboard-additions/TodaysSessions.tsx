import { Clock, CheckCircle2, XCircle, Circle } from "lucide-react";

const upcoming = [
  { time: "9:00 AM", student: "Marcus V.", service: "Speech", provider: "S. Chen", status: "completed" },
  { time: "10:30 AM", student: "Aria T.", service: "OT", provider: "M. Rivera", status: "completed" },
  { time: "11:15 AM", student: "Sebastian Z.", service: "ABA", provider: "J. O'Brien", status: "missed" },
  { time: "1:00 PM", student: "Lily R.", service: "PT", provider: "P. Patel", status: "upcoming" },
  { time: "2:30 PM", student: "Noah K.", service: "Speech", provider: "S. Chen", status: "upcoming" },
];

const statusIcon = {
  completed: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  missed: <XCircle className="w-4 h-4 text-red-500" />,
  upcoming: <Circle className="w-4 h-4 text-gray-300" />,
};

const statusLabel = {
  completed: "text-emerald-600 bg-emerald-50",
  missed: "text-red-600 bg-red-50",
  upcoming: "text-gray-500 bg-gray-100",
};

export function TodaysSessions() {
  const done = upcoming.filter(s => s.status === "completed").length;
  const missed = upcoming.filter(s => s.status === "missed").length;
  const remaining = upcoming.filter(s => s.status === "upcoming").length;

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center p-6">
      <div className="w-full max-w-[500px] bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-sky-600" />
            <h2 className="text-sm font-semibold text-gray-900">Today's Sessions</h2>
          </div>
          <span className="text-xs text-gray-400">Friday, April 18</span>
        </div>

        <div className="grid grid-cols-3 gap-0 border-b border-gray-100">
          <div className="px-5 py-3 text-center border-r border-gray-100">
            <div className="text-2xl font-bold text-emerald-600 tabular-nums">{done}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Completed</div>
          </div>
          <div className="px-5 py-3 text-center border-r border-gray-100">
            <div className="text-2xl font-bold text-red-600 tabular-nums">{missed}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Missed</div>
          </div>
          <div className="px-5 py-3 text-center">
            <div className="text-2xl font-bold text-gray-500 tabular-nums">{remaining}</div>
            <div className="text-[11px] text-gray-500 mt-0.5">Upcoming</div>
          </div>
        </div>

        <ul className="divide-y divide-gray-50">
          {upcoming.map((s, i) => (
            <li key={i} className="px-5 py-2.5 flex items-center gap-3">
              {statusIcon[s.status as keyof typeof statusIcon]}
              <div className="w-16 text-[12px] text-gray-400 tabular-nums flex-shrink-0">{s.time}</div>
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-medium text-gray-800">{s.student}</span>
                <span className="text-[12px] text-gray-400 ml-1.5">· {s.service} · {s.provider}</span>
              </div>
              <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${statusLabel[s.status as keyof typeof statusLabel]}`}>
                {s.status}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
