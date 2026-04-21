import StudentProgressReports from "../StudentProgressReports";

interface Props {
  studentId: number;
  enabled: boolean;
  isEditable: boolean;
}

export default function TabReports({ studentId, enabled, isEditable }: Props) {
  return (
    <div className="space-y-5">
      <StudentProgressReports studentId={studentId} enabled={enabled} isEditable={isEditable} />
    </div>
  );
}
