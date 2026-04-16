import { Zap } from "lucide-react";
import { EmergencyAlertInline } from "@/components/emergency-alert-inline";
import type { ServiceType } from "./types";

export function ServiceStep({
  serviceTypes, recents, studentName, studentId, onSelect,
}: {
  serviceTypes: ServiceType[];
  recents: ServiceType[];
  studentName: string;
  studentId: number | null;
  onSelect: (id: number | null, name: string) => void;
}) {
  return (
    <div className="px-4 pt-5 pb-6">
      <h2 className="text-xl font-bold text-gray-900">What service?</h2>
      <p className="text-sm text-gray-500 mt-1">{studentName}</p>
      {studentId && <div className="mt-3"><EmergencyAlertInline studentId={studentId} /></div>}

      {recents.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Zap className="w-3 h-3" /> Recent
          </p>
          <div className="grid grid-cols-2 gap-2">
            {recents.map((s) => (
              <ServiceButton key={s.id} service={s} onSelect={onSelect} highlight />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        {recents.length > 0 && (
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">All Services</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {serviceTypes.map((s) => (
            <ServiceButton key={s.id} service={s} onSelect={onSelect} />
          ))}
          {serviceTypes.length === 0 && (
            <button
              onClick={() => onSelect(null, "General")}
              className="col-span-2 h-14 rounded-xl bg-gray-50 border border-gray-200 text-[15px] font-medium text-gray-700 active:bg-gray-100"
            >
              General
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceButton({ service, onSelect, highlight }: { service: ServiceType; onSelect: (id: number, name: string) => void; highlight?: boolean }) {
  return (
    <button
      onClick={() => onSelect(service.id, service.name)}
      className={`h-14 rounded-xl text-[14px] font-medium text-left px-4 transition-colors active:scale-[0.97] ${
        highlight
          ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
          : "bg-gray-50 border border-gray-200 text-gray-800 hover:bg-gray-100"
      }`}
    >
      {service.name}
    </button>
  );
}
