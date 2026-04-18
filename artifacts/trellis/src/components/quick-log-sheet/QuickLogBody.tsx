import type { Step, Student, ServiceType, MissedReason, RecentCombo } from "./types";
import { StudentStep } from "./StudentStep";
import { ServiceStep } from "./ServiceStep";
import { DurationStep } from "./DurationStep";
import { OutcomeStep } from "./OutcomeStep";
import { ReasonStep } from "./ReasonStep";
import { NoteStep } from "./NoteStep";
import { ReviewStep } from "./ReviewStep";
import { SuccessStep } from "./SuccessStep";

export interface QuickLogBodyProps {
  step: Step;
  filteredStudents: Student[];
  recentStudents: Student[];
  serviceTypes: ServiceType[];
  recentServiceTypes: ServiceType[];
  missedReasons: MissedReason[];
  search: string;
  onSearch: (v: string) => void;
  selectStudent: (id: number, name: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
  studentId: number | null;
  studentName: string;
  serviceTypeName: string;
  selectService: (id: number | null, name: string) => void;
  durationMinutes: number;
  customDuration: string;
  setCustomDuration: (v: string) => void;
  selectDuration: (m: number) => void;
  selectOutcome: (o: "completed" | "missed") => void;
  outcome: "completed" | "missed" | null;
  makeupNeeded: boolean;
  toggleMakeup: () => void;
  selectReason: (id: number | null, label?: string) => void;
  missedReasonId: number | null;
  missedReasonLabel: string | null;
  note: string;
  setNote: (v: string) => void;
  goReview: () => void;
  sessionDate: string;
  onSubmit: () => void;
  submitting: boolean;
  goalCount?: number;
  recentCombos: RecentCombo[];
  onSelectCombo: (combo: RecentCombo) => void;
  serviceSuggestedDuration?: number;
  onLogAnotherSameStudent: () => void;
  onLogAnother: () => void;
  onDone: () => void;
}



export function QuickLogBody(p: QuickLogBodyProps) {
  return (
    <div className="flex-1 overflow-y-auto">
      {p.step === "student" && (
        <StudentStep
          students={p.filteredStudents}
          recents={p.recentStudents}
          search={p.search}
          onSearch={p.onSearch}
          onSelect={p.selectStudent}
          searchRef={p.searchRef}
          recentCombos={p.recentCombos}
          onSelectCombo={p.onSelectCombo}
        />
      )}
      {p.step === "service" && (
        <ServiceStep
          serviceTypes={p.serviceTypes}
          recents={p.recentServiceTypes}
          studentName={p.studentName}
          studentId={p.studentId}
          onSelect={p.selectService}
        />
      )}
      {p.step === "duration" && (
        <DurationStep
          studentName={p.studentName}
          serviceTypeName={p.serviceTypeName}
          selected={p.durationMinutes}
          customValue={p.customDuration}
          onCustomChange={p.setCustomDuration}
          onSelect={p.selectDuration}
          serviceSuggestedDuration={p.serviceSuggestedDuration}
        />
      )}
      {p.step === "outcome" && (
        <OutcomeStep
          studentName={p.studentName}
          durationMinutes={p.durationMinutes}
          onSelect={p.selectOutcome}
        />
      )}
      {p.step === "reason" && (
        <ReasonStep
          dbReasons={p.missedReasons}
          makeupNeeded={p.makeupNeeded}
          onToggleMakeup={p.toggleMakeup}
          onSelect={p.selectReason}
          initialSelectedId={p.missedReasonId}
          initialSelectedLabel={p.missedReasonLabel}
        />
      )}
      {p.step === "note" && (
        <NoteStep
          studentName={p.studentName}
          serviceTypeName={p.serviceTypeName}
          durationMinutes={p.durationMinutes}
          outcome={p.outcome!}
          note={p.note}
          makeupNeeded={p.makeupNeeded}
          missedReasonLabel={p.missedReasonLabel}
          sessionDate={p.sessionDate}
          goalCount={p.goalCount}
          onNoteChange={p.setNote}
          onSubmit={p.onSubmit}
          submitting={p.submitting}
        />
      )}
      {p.step === "review" && (
        <ReviewStep
          studentName={p.studentName}
          serviceTypeName={p.serviceTypeName}
          durationMinutes={p.durationMinutes}
          outcome={p.outcome!}
          note={p.note}
          makeupNeeded={p.makeupNeeded}
          missedReasonLabel={p.missedReasonLabel}
          sessionDate={p.sessionDate}
          goalCount={p.goalCount}
          onSubmit={p.onSubmit}
          submitting={p.submitting}
        />
      )}
      {p.step === "success" && (
        <SuccessStep
          studentName={p.studentName}
          serviceTypeName={p.serviceTypeName}
          durationMinutes={p.durationMinutes}
          outcome={p.outcome!}
          onLogAnotherSameStudent={p.onLogAnotherSameStudent}
          onLogAnother={p.onLogAnother}
          onDone={p.onDone}
        />
      )}
    </div>
  );
}
