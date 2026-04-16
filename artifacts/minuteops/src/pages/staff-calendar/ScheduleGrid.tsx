import { Card } from "@/components/ui/card";
import { AlertTriangle, Plus, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { StaffSchedule, WEEKDAYS, WEEKDAY_LABELS, SCHOOL_COLORS, formatTime, timeToMinutes, SchoolOption } from "./types";

interface Props {
  uniqueStaffInView: { id: number; name: string; role: string }[];
  filteredSchedules: StaffSchedule[];
  schoolList: SchoolOption[];
  schoolColorMap: Map<number, typeof SCHOOL_COLORS[0]>;
  conflictIds: Set<number>;
  isAdmin: boolean;
  onCreate: (day?: string) => void;
  onEdit: (s: StaffSchedule) => void;
  onDelete: (id: number) => void;
}

export function ScheduleGrid({ uniqueStaffInView, filteredSchedules, schoolList, schoolColorMap, conflictIds, isAdmin, onCreate, onEdit, onDelete }: Props) {
  return (
    <>
      <div className="flex flex-wrap gap-2 mb-1">
        {schoolList.map(school => {
          const color = schoolColorMap.get(school.id);
          if (!color) return null;
          return (
            <div key={school.id} className="flex items-center gap-1.5 text-xs text-gray-600">
              <div className={cn("w-2.5 h-2.5 rounded-full", color.dot)} />
              {school.name}
            </div>
          );
        })}
      </div>
      <Card className="overflow-hidden border border-gray-200">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-[120px_repeat(5,1fr)] border-b border-gray-200 bg-gray-50">
              <div className="p-2 text-xs font-semibold text-gray-500 border-r border-gray-200">Staff</div>
              {WEEKDAYS.map(day => (
                <div key={day} className="p-2 text-xs font-semibold text-gray-700 text-center border-r border-gray-200 last:border-r-0">
                  {WEEKDAY_LABELS[day]}
                  {isAdmin && (
                    <button onClick={() => onCreate(day)} className="ml-1 text-emerald-500 hover:text-emerald-700">
                      <Plus className="w-3 h-3 inline" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {uniqueStaffInView.length === 0 ? (
              <div className="p-12 text-center text-gray-400 text-sm">
                No schedules found. {isAdmin && "Click \"Add Schedule\" to create one."}
              </div>
            ) : (
              uniqueStaffInView.map(staff => (
                <div key={staff.id} className="grid grid-cols-[120px_repeat(5,1fr)] border-b border-gray-100 last:border-b-0 hover:bg-gray-50/50">
                  <div className="p-2 border-r border-gray-200 flex flex-col justify-center">
                    <span className="text-xs font-semibold text-gray-800 truncate">{staff.name}</span>
                    <span className="text-[10px] text-gray-400 capitalize">{staff.role.replace("_", " ")}</span>
                  </div>
                  {WEEKDAYS.map(day => {
                    const daySchedules = filteredSchedules.filter(s => s.staff_id === staff.id && s.day_of_week === day);
                    return (
                      <div key={day} className="p-1 border-r border-gray-100 last:border-r-0 min-h-[60px] space-y-0.5">
                        {daySchedules.sort((a, b) => timeToMinutes(a.start_time) - timeToMinutes(b.start_time)).map(sched => {
                          const color = schoolColorMap.get(sched.school_id) || SCHOOL_COLORS[0];
                          const hasConflict = conflictIds.has(sched.id);
                          return (
                            <div
                              key={sched.id}
                              className={cn(
                                "rounded px-1.5 py-1 text-[10px] leading-tight border cursor-default group relative",
                                color.bg, color.border, color.text,
                                hasConflict && "ring-2 ring-red-400 ring-offset-1"
                              )}
                            >
                              <div className="font-semibold flex items-center gap-1">
                                {hasConflict && <AlertTriangle className="w-2.5 h-2.5 text-red-500 flex-shrink-0" />}
                                {formatTime(sched.start_time)}–{formatTime(sched.end_time)}
                              </div>
                              <div className="truncate opacity-80">{sched.schoolName}</div>
                              {sched.serviceTypeName && <div className="truncate opacity-70 italic">{sched.serviceTypeName}</div>}
                              {sched.label && <div className="truncate opacity-60">{sched.label}</div>}
                              {isAdmin && (
                                <div className="absolute top-0.5 right-0.5 hidden group-hover:flex gap-0.5">
                                  <button onClick={() => onEdit(sched)} className="p-0.5 rounded bg-white/80 hover:bg-white shadow-sm">
                                    <Pencil className="w-2.5 h-2.5 text-gray-500" />
                                  </button>
                                  <button onClick={() => onDelete(sched.id)} className="p-0.5 rounded bg-white/80 hover:bg-white shadow-sm">
                                    <Trash2 className="w-2.5 h-2.5 text-red-500" />
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
