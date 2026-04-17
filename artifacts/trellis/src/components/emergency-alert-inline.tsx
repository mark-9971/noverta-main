import { useState, useEffect } from "react";
import { ShieldAlert, Phone } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

interface MedicalAlert {
  id: number;
  alertType: string;
  description: string;
  severity: string;
  epiPenOnFile: boolean;
}

interface EmergencyContact {
  id: number;
  firstName: string;
  lastName: string;
  relationship: string;
  phone: string;
}

export function EmergencyAlertInline({ studentId }: { studentId: number }) {
  const [alerts, setAlerts] = useState<MedicalAlert[]>([]);
  const [contact, setContact] = useState<EmergencyContact | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!studentId) return;
    setAlerts([]);
    setContact(null);
    setLoaded(false);
    let cancelled = false;
    Promise.all([
      authFetch(`/api/students/${studentId}/medical-alerts`).then(r => r.ok ? r.json() : []).catch(() => []),
      authFetch(`/api/students/${studentId}/emergency-contacts`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([a, c]) => {
      if (cancelled) return;
      const critical = (Array.isArray(a) ? a : []).filter(
        (al: MedicalAlert) => al.severity === "life_threatening" || al.severity === "severe"
      );
      setAlerts(critical);
      const contacts = Array.isArray(c) ? c : [];
      setContact(contacts.length > 0 ? contacts[0] : null);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [studentId]);

  if (!loaded || (alerts.length === 0 && !contact)) return null;

  return (
    <div className={`rounded-lg border px-3 py-2.5 text-[12px] ${
      alerts.length > 0
        ? "bg-red-50 border-red-200"
        : "bg-blue-50 border-blue-200"
    }`}>
      {alerts.length > 0 && (
        <div className="flex items-start gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <span className="font-semibold text-red-700">Medical Alert:</span>{" "}
            {alerts.map((a, i) => (
              <span key={a.id} className="text-red-600">
                {a.alertType}{a.epiPenOnFile ? " (EpiPen)" : ""}
                {i < alerts.length - 1 ? ", " : ""}
              </span>
            ))}
          </div>
        </div>
      )}
      {contact && (
        <div className={`flex items-center gap-2 ${alerts.length > 0 ? "mt-1.5 pt-1.5 border-t border-red-100" : ""}`}>
          <Phone className="w-3 h-3 text-gray-400 flex-shrink-0" />
          <span className="text-gray-600">
            Emergency: {contact.firstName} {contact.lastName} ({contact.relationship}) —{" "}
            <a href={`tel:${contact.phone}`} className="text-emerald-600 font-medium hover:underline">
              {contact.phone}
            </a>
          </span>
        </div>
      )}
    </div>
  );
}
