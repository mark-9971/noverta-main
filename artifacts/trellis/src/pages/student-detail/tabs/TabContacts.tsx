import StudentContactsMedical from "../StudentContactsMedical";
import StudentComplianceSection from "../StudentComplianceSection";

interface Props {
  studentId: number;
  isEditable: boolean;
  bipReadOnly: boolean;
  studentName: string;
  role: string;
  contacts: any;
  alerts: any;
  enrollment: any;
  messageGuardians: any;
}

export default function TabContacts(props: Props) {
  const { studentId, isEditable, bipReadOnly, studentName, role, contacts, alerts, enrollment, messageGuardians } = props;
  return (
    <div className="space-y-5">
      <StudentContactsMedical
        section="contactsAndMedical"
        isEditable={isEditable}
        emergencyContacts={contacts.emergencyContacts}
        emergencyContactsLoading={contacts.emergencyContactsLoading}
        openAddEc={contacts.openAddEc}
        openEditEc={contacts.openEditEc}
        setDeletingEc={contacts.setDeletingEc}
        medicalAlerts={alerts.medicalAlerts}
        medicalAlertsLoading={alerts.medicalAlertsLoading}
        openAddMa={alerts.openAddMa}
        openEditMa={alerts.openEditMa}
        setDeletingMa={alerts.setDeletingMa}
      />
      <StudentComplianceSection
        section="afterTransition"
        studentId={studentId}
        bipReadOnly={bipReadOnly}
        isEditable={isEditable}
      />
      <StudentComplianceSection
        section="messagesAccommodations"
        studentId={studentId}
        studentName={studentName}
        messageGuardians={messageGuardians}
      />
      <StudentContactsMedical
        section="enrollment"
        enrollmentHistory={enrollment.enrollmentHistory}
        enrollmentLoading={enrollment.enrollmentLoading}
        role={role}
        openAddEvent={enrollment.openAddEvent}
        openEditEvent={enrollment.openEditEvent}
        setDeletingEvent={enrollment.setDeletingEvent}
      />
    </div>
  );
}
