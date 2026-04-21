import StudentJourneyTimeline from "../StudentJourneyTimeline";

export default function TabJourney({ studentId }: { studentId: number }) {
  return (
    <div className="space-y-5">
      <StudentJourneyTimeline studentId={studentId} />
    </div>
  );
}
