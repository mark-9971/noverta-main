import StudentHandoffCard from "../StudentHandoffCard";

export default function TabHandoff({ studentId }: { studentId: number }) {
  return (
    <div className="space-y-2">
      <StudentHandoffCard studentId={studentId} />
    </div>
  );
}
