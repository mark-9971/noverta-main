import { useState, useRef, useEffect } from "react";
import { Phone, ShieldAlert, AlertTriangle, X, ExternalLink } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { Link } from "wouter";

interface EmergencyContact {
  id: number;
  firstName: string;
  lastName: string;
  relationship: string;
  phone: string;
  isAuthorizedForPickup: boolean;
}

interface MedicalAlert {
  id: number;
  alertType: string;
  description: string;
  severity: string;
  epiPenOnFile: boolean;
}

interface StudentQuickViewProps {
  studentId: number;
  studentName: string;
  grade: string | null;
  trigger: React.ReactNode;
}

export function StudentQuickView({ studentId, studentName, grade, trigger }: StudentQuickViewProps) {
  const [open, setOpen] = useState(false);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [alerts, setAlerts] = useState<MedicalAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      authFetch(`/api/students/${studentId}/emergency-contacts`).then((r: Response) => r.json()).catch(() => []),
      authFetch(`/api/students/${studentId}/medical-alerts`).then((r: Response) => r.json()).catch(() => []),
    ]).then(([c, a]) => {
      setContacts(Array.isArray(c) ? c : []);
      setAlerts(Array.isArray(a) ? a.filter((al: MedicalAlert) => al.severity === "life_threatening" || al.severity === "severe") : []);
    }).finally(() => setLoading(false));
  }, [open, studentId]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const primaryContact = contacts[0];
  const lifeThreatening = alerts.filter(a => a.severity === "life_threatening");
  const severe = alerts.filter(a => a.severity === "severe");

  return (
    <span className="relative inline-flex items-center" style={{ verticalAlign: "middle" }}>
      <span
        ref={triggerRef}
        onClick={e => { e.stopPropagation(); e.preventDefault(); setOpen(o => !o); }}
        className="cursor-pointer"
      >
        {trigger}
      </span>

      {open && (
        <div
          ref={panelRef}
          className="absolute z-50 top-full left-0 mt-1.5 w-72 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden"
          style={{ minWidth: 280 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-gray-50 border-b border-gray-100">
            <div>
              <p className="text-[13px] font-semibold text-gray-800">{studentName}</p>
              {grade && <p className="text-[11px] text-gray-400">Grade {grade}</p>}
            </div>
            <div className="flex items-center gap-1.5">
              <Link href={`/students/${studentId}`} onClick={() => setOpen(false)}>
                <span className="p-1 hover:bg-gray-200 rounded transition-colors" title="Open full profile">
                  <ExternalLink className="w-3.5 h-3.5 text-gray-500" />
                </span>
              </Link>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-gray-200 rounded transition-colors">
                <X className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="px-3.5 py-4 space-y-2">
              {[1, 2].map(i => <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : (
            <div className="px-3.5 py-3 space-y-3">
              {lifeThreatening.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <ShieldAlert className="w-3.5 h-3.5 text-red-600" />
                    <span className="text-[11px] font-bold text-red-700 uppercase tracking-wide">Life-Threatening Alerts</span>
                  </div>
                  <div className="space-y-1">
                    {lifeThreatening.map(a => (
                      <div key={a.id} className="text-[12px] text-red-800">
                        <span className="font-medium">{a.description}</span>
                        {a.epiPenOnFile && <span className="ml-1.5 text-[10px] bg-orange-100 text-orange-700 px-1 rounded font-medium">EpiPen</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {severe.length > 0 && lifeThreatening.length === 0 && (
                <div className="rounded-lg bg-orange-50 border border-orange-200 p-2.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-600" />
                    <span className="text-[11px] font-bold text-orange-700 uppercase tracking-wide">Severe Alerts</span>
                  </div>
                  <div className="space-y-1">
                    {severe.map(a => (
                      <div key={a.id} className="text-[12px] text-orange-800">
                        <span className="font-medium">{a.description}</span>
                        {a.epiPenOnFile && <span className="ml-1.5 text-[10px] bg-orange-100 text-orange-700 px-1 rounded font-medium">EpiPen</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Emergency Contact</span>
                </div>
                {primaryContact ? (
                  <div className="space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium text-gray-800">{primaryContact.firstName} {primaryContact.lastName}</span>
                      <span className="text-[11px] text-gray-400 capitalize">{primaryContact.relationship}</span>
                    </div>
                    <a href={`tel:${primaryContact.phone}`} className="flex items-center gap-1 text-[13px] text-emerald-700 font-medium hover:underline">
                      <Phone className="w-3 h-3" />{primaryContact.phone}
                    </a>
                    {primaryContact.isAuthorizedForPickup && (
                      <span className="inline-block px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-medium rounded">Authorized Pickup</span>
                    )}
                  </div>
                ) : (
                  <p className="text-[12px] text-gray-400">No emergency contacts on file.</p>
                )}
              </div>

              {contacts.length > 1 && (
                <p className="text-[11px] text-gray-400">+{contacts.length - 1} more contact{contacts.length > 2 ? "s" : ""} on file</p>
              )}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
