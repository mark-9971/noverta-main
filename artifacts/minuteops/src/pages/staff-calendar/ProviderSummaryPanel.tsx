import { Card } from "@/components/ui/card";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProviderSummary, StaffOption, WEEKDAYS, WEEKDAY_SHORT, SCHOOL_COLORS, formatTime } from "./types";

interface Props {
  providerSummary: ProviderSummary;
  staffList: StaffOption[];
  filterStaff: string;
  schoolColorMap: Map<number, typeof SCHOOL_COLORS[0]>;
}

export function ProviderSummaryPanel({ providerSummary, staffList, filterStaff, schoolColorMap }: Props) {
  const staff = staffList.find(s => s.id === Number(filterStaff));
  return (
    <Card className="p-4 border-emerald-200 bg-emerald-50/30">
      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
        <User className="w-4 h-4 text-emerald-600" />
        Provider Availability — {staff?.firstName} {staff?.lastName}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <div>
          <p className="text-[10px] font-medium text-gray-500 uppercase">Weekly Hours</p>
          <p className="text-lg font-bold text-gray-900">{providerSummary.totalWeeklyHours}h</p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-gray-500 uppercase">Days Scheduled</p>
          <p className="text-lg font-bold text-gray-900">{providerSummary.daysScheduled}/5</p>
        </div>
        {providerSummary.distribution.map(d => (
          <div key={d.schoolId}>
            <p className="text-[10px] font-medium text-gray-500 uppercase truncate">{d.schoolName}</p>
            <p className="text-lg font-bold text-gray-900">{d.weeklyHours}h</p>
          </div>
        ))}
      </div>
      {providerSummary.distribution.length > 1 && (
        <div className="flex items-center gap-1 h-3 rounded-full overflow-hidden bg-gray-200">
          {providerSummary.distribution.map((d, i) => {
            const pct = providerSummary.totalWeeklyHours > 0 ? (d.weeklyHours / providerSummary.totalWeeklyHours) * 100 : 0;
            const color = schoolColorMap.get(d.schoolId) || SCHOOL_COLORS[i % SCHOOL_COLORS.length];
            return (
              <div key={d.schoolId} className={cn("h-full", color.dot)} style={{ width: `${pct}%` }} title={`${d.schoolName}: ${d.weeklyHours}h (${pct.toFixed(0)}%)`} />
            );
          })}
        </div>
      )}
      {providerSummary.availability && Object.keys(providerSummary.availability).length > 0 && (
        <div className="mt-3 pt-3 border-t border-emerald-200">
          <p className="text-[10px] font-semibold text-emerald-700 uppercase mb-1.5">Available Slots</p>
          <div className="grid grid-cols-5 gap-1.5">
            {WEEKDAYS.map(day => (
              <div key={day}>
                <p className="text-[10px] font-medium text-gray-500 mb-0.5">{WEEKDAY_SHORT[day]}</p>
                {providerSummary.availability[day] ? (
                  providerSummary.availability[day].map((s, i) => (
                    <p key={i} className="text-[10px] text-emerald-700 bg-emerald-100 rounded px-1 py-0.5 mb-0.5">
                      {formatTime(s.start)}–{formatTime(s.end)}
                    </p>
                  ))
                ) : (
                  <p className="text-[10px] text-gray-400">Fully booked</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
