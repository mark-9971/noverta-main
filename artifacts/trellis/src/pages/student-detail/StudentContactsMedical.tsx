import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Mail, Plus, Pencil, Trash2, Stethoscope, ShieldAlert, History } from "lucide-react";

export interface EmergencyContactRecord {
  id: number;
  studentId: number;
  firstName: string;
  lastName: string;
  relationship: string;
  phone: string;
  phoneSecondary: string | null;
  email: string | null;
  isAuthorizedForPickup: boolean;
  priority: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MedicalAlertRecord {
  id: number;
  studentId: number;
  alertType: string;
  description: string;
  severity: string;
  treatmentNotes: string | null;
  epiPenOnFile: boolean;
  notifyAllStaff: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ContactsMedicalSharedProps {
  isEditable: boolean;
}

interface ContactsSectionProps extends ContactsMedicalSharedProps {
  section: "contactsAndMedical";
  emergencyContacts: EmergencyContactRecord[];
  emergencyContactsLoading: boolean;
  openAddEc: () => void;
  openEditEc: (c: EmergencyContactRecord) => void;
  setDeletingEc: (c: EmergencyContactRecord | null) => void;
  medicalAlerts: MedicalAlertRecord[];
  medicalAlertsLoading: boolean;
  openAddMa: () => void;
  openEditMa: (a: MedicalAlertRecord) => void;
  setDeletingMa: (a: MedicalAlertRecord | null) => void;
}

interface EnrollmentSectionProps {
  section: "enrollment";
  enrollmentHistory: any[];
  enrollmentLoading: boolean;
  role: string;
  openAddEvent: () => void;
}

type StudentContactsMedicalProps = ContactsSectionProps | EnrollmentSectionProps;

export default function StudentContactsMedical(props: StudentContactsMedicalProps) {
  if (props.section === "contactsAndMedical") {
    const {
      isEditable,
      emergencyContacts, emergencyContactsLoading, openAddEc, openEditEc, setDeletingEc,
      medicalAlerts, medicalAlertsLoading, openAddMa, openEditMa, setDeletingMa,
    } = props;
    return (
      <>
        {/* Emergency Contacts */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-600" />
                <CardTitle className="text-sm font-semibold text-gray-600">Emergency Contacts</CardTitle>
              </div>
              {isEditable && (
                <button onClick={openAddEc} className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add Contact
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {emergencyContactsLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : emergencyContacts.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No emergency contacts on file.</p>
            ) : (
              <div className="space-y-2">
                {emergencyContacts.map((contact: EmergencyContactRecord, idx: number) => (
                  <div key={contact.id} className={`flex items-start gap-3 p-3 rounded-lg border ${idx === 0 ? "border-emerald-200 bg-emerald-50/50" : "border-gray-100 bg-white"}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${idx === 0 ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      <span className="text-[12px] font-bold">{contact.firstName?.[0]}{contact.lastName?.[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-semibold text-gray-800">{contact.firstName} {contact.lastName}</span>
                        <span className="text-[11px] text-gray-500 capitalize">{contact.relationship}</span>
                        {contact.isAuthorizedForPickup && (
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-medium rounded">Authorized Pickup</span>
                        )}
                        {idx === 0 && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-medium rounded">Primary</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-[12px] text-emerald-700 hover:underline">
                          <Phone className="w-3 h-3" />{contact.phone}
                        </a>
                        {contact.phoneSecondary && (
                          <a href={`tel:${contact.phoneSecondary}`} className="flex items-center gap-1 text-[12px] text-gray-500 hover:underline">
                            <Phone className="w-3 h-3" />{contact.phoneSecondary}
                          </a>
                        )}
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-[12px] text-gray-500 hover:underline">
                            <Mail className="w-3 h-3" />{contact.email}
                          </a>
                        )}
                      </div>
                      {contact.notes && <p className="text-[11px] text-gray-400 mt-0.5">{contact.notes}</p>}
                    </div>
                    {isEditable && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openEditEc(contact)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setDeletingEc(contact)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Medical Alerts */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-red-500" />
                <CardTitle className="text-sm font-semibold text-gray-600">Medical Alerts</CardTitle>
                {medicalAlerts.some((a: MedicalAlertRecord) => a.severity === "life_threatening") && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-md uppercase tracking-wide">
                    <ShieldAlert className="w-3 h-3" /> Life-Threatening
                  </span>
                )}
              </div>
              {isEditable && (
                <button onClick={openAddMa} className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Add Alert
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {medicalAlertsLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : medicalAlerts.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No medical alerts on file.</p>
            ) : (
              <div className="space-y-2">
                {medicalAlerts.map((alert: MedicalAlertRecord) => {
                  const severityConfig: Record<string, { bg: string; text: string; border: string; label: string }> = {
                    mild: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-100", label: "Mild" },
                    moderate: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", label: "Moderate" },
                    severe: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", label: "Severe" },
                    life_threatening: { bg: "bg-red-50", text: "text-red-700", border: "border-red-300", label: "Life-Threatening" },
                  };
                  const alertTypeLabels: Record<string, string> = {
                    allergy: "Allergy", medication: "Medication", condition: "Condition", seizure: "Seizure", other: "Other",
                  };
                  const sc = severityConfig[alert.severity] ?? { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-100", label: alert.severity };
                  return (
                    <div key={alert.id} className={`p-3 rounded-lg border ${sc.border} ${sc.bg}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded uppercase tracking-wide ${sc.bg} ${sc.text} border ${sc.border}`}>{sc.label}</span>
                            <span className="text-[11px] font-medium text-gray-600">{alertTypeLabels[alert.alertType] ?? alert.alertType}</span>
                            {alert.epiPenOnFile && <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-medium rounded">EpiPen On File</span>}
                            {alert.notifyAllStaff && <span className="flex items-center gap-0.5 px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded"><ShieldAlert className="w-3 h-3" /> Notify All Staff</span>}
                          </div>
                          <p className="text-[13px] font-semibold text-gray-800 mt-1">{alert.description}</p>
                          {alert.treatmentNotes && <p className="text-[12px] text-gray-600 mt-0.5">{alert.treatmentNotes}</p>}
                        </div>
                        {isEditable && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => openEditMa(alert)} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/70 rounded transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setDeletingMa(alert)} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-100 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  // section === "enrollment"
  const { enrollmentHistory, enrollmentLoading, role, openAddEvent } = props;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-600" />
            <CardTitle className="text-sm font-semibold text-gray-600">Enrollment History</CardTitle>
          </div>
          {(role === "admin" || role === "case_manager") && (
            <button
              onClick={openAddEvent}
              className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 px-2 py-1 rounded-md hover:bg-emerald-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Event
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {enrollmentLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : enrollmentHistory.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No enrollment events recorded.</p>
        ) : (
          <div className="relative pl-5">
            <div className="absolute left-2 top-0 bottom-0 w-px bg-gray-100" />
            <div className="space-y-4">
              {enrollmentHistory.map((ev: any, idx: number) => {
                const typeConfig: Record<string, { label: string; color: string; bg: string; dot: string }> = {
                  enrolled: { label: "Enrolled", color: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-500" },
                  reactivated: { label: "Reactivated", color: "text-emerald-700", bg: "bg-emerald-50", dot: "bg-emerald-400" },
                  withdrawn: { label: "Withdrawn", color: "text-amber-700", bg: "bg-amber-50", dot: "bg-amber-500" },
                  transferred_in: { label: "Transferred In", color: "text-blue-700", bg: "bg-blue-50", dot: "bg-blue-500" },
                  transferred_out: { label: "Transferred Out", color: "text-sky-700", bg: "bg-sky-50", dot: "bg-sky-400" },
                  program_change: { label: "Program Change", color: "text-indigo-700", bg: "bg-indigo-50", dot: "bg-indigo-400" },
                  graduated: { label: "Graduated", color: "text-purple-700", bg: "bg-purple-50", dot: "bg-purple-500" },
                  suspended: { label: "Suspended", color: "text-red-700", bg: "bg-red-50", dot: "bg-red-500" },
                  leave_of_absence: { label: "Leave of Absence", color: "text-orange-700", bg: "bg-orange-50", dot: "bg-orange-400" },
                  note: { label: "Note", color: "text-gray-700", bg: "bg-gray-50", dot: "bg-gray-400" },
                };
                const cfg = typeConfig[ev.eventType] ?? { label: ev.eventType.replace(/_/g, " "), color: "text-gray-700", bg: "bg-gray-50", dot: "bg-gray-400" };
                return (
                  <div key={ev.id ?? idx} className="relative flex items-start gap-3">
                    <div className={`absolute -left-3.5 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ${cfg.dot} flex-shrink-0`} />
                    <div className={`flex-1 rounded-lg p-3 ${cfg.bg}`}>
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className={`text-[12px] font-semibold ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-[11px] text-gray-400">{ev.eventDate}</span>
                      </div>
                      {ev.reasonCode && <p className="text-[11px] text-gray-500 mt-0.5 uppercase tracking-wide">{ev.reasonCode}</p>}
                      {ev.reason && <p className="text-[12px] text-gray-600 mt-0.5">{ev.reason}</p>}
                      {ev.notes && <p className="text-[11px] text-gray-500 mt-0.5">{ev.notes}</p>}
                      {(ev.performedByFirst || ev.performedByLast) && (
                        <p className="text-[11px] text-gray-400 mt-0.5">By: {ev.performedByFirst} {ev.performedByLast}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
