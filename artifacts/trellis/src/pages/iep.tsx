import { GraduationCap } from "lucide-react";
import IepMeetings from "./iep-meetings";
import IepCalendar from "./iep-calendar";

export default function IepHub() {
  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 flex items-center gap-2 tracking-tight">
          <GraduationCap className="w-5 h-5 text-emerald-600" />
          IEP Calendar &amp; Meetings
        </h1>
        <p className="text-xs text-gray-400 mt-1">Compliance calendar and upcoming IEP meetings</p>
      </div>

      <IepCalendar embedded />

      <div className="pt-2">
        <h2 className="text-base font-semibold text-gray-700 mb-4">IEP Meetings</h2>
        <IepMeetings embedded />
      </div>
    </div>
  );
}
