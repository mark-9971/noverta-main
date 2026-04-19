import { useState, useEffect, useRef } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import type { CollectedGoalEntry } from "@/components/live-data-panel/types";
import {
  type QuickLogDefaults, type Student, type ServiceType, type MissedReason, type Step, type RecentCombo,
  loadDefaults, saveDefaults, pushRecent, pushCombo, getServiceDuration,
} from "./types";
import { QuickLogHeader } from "./QuickLogHeader";
import { QuickLogBody } from "./QuickLogBody";
import { submitSession } from "./submit";

interface QuickLogSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  staffId: number | null;
  prefillStudentId?: number;
  prefillStudentName?: string;
  prefillServiceTypeId?: number;
  prefillServiceTypeName?: string;
  prefillDurationMinutes?: number;
  prefillOutcome?: "completed" | "missed";
  prefillStartTime?: string;
  prefillEndTime?: string;
  sessionDate?: string;
  skipToMissed?: boolean;
  collectedGoalData?: CollectedGoalEntry[];
}

/**
 * Compute the best landing step given what we know at open time.
 *
 * Priority: skip as many steps as possible when data is pre-filled.
 *   - know student + service + duration + outcome → "note" (completed) or "reason" (missed)
 *   - know student + service + duration, no outcome → "outcome"
 *   - know student + service, no duration → "duration"
 *   - know student only → "service"
 *   - nothing → "student"
 */
function computeInitialStep(
  prefillStudentId: number | undefined,
  prefillServiceTypeId: number | undefined,
  prefillServiceTypeName: string | undefined,
  prefillDurationMinutes: number | undefined,
  prefillOutcome: "completed" | "missed" | undefined,
  skipToMissed: boolean | undefined,
): Step {
  if (!prefillStudentId) return "student";

  const hasService = prefillServiceTypeId != null || !!prefillServiceTypeName;
  const hasDuration = prefillDurationMinutes != null && prefillDurationMinutes > 0;
  const resolvedOutcome = prefillOutcome ?? (skipToMissed ? "missed" : undefined);

  if (hasService && hasDuration && resolvedOutcome) {
    return resolvedOutcome === "missed" ? "reason" : "note";
  }
  if (hasService && hasDuration) return "outcome";
  if (hasService) return "duration";
  return "service";
}

export function QuickLogSheet({
  isOpen, onClose, onSuccess, staffId,
  prefillStudentId, prefillStudentName,
  prefillServiceTypeId, prefillServiceTypeName,
  prefillDurationMinutes, prefillOutcome,
  prefillStartTime, prefillEndTime,
  sessionDate, skipToMissed, collectedGoalData,
}: QuickLogSheetProps) {
  const [step, setStep] = useState<Step>("student");
  const [studentId, setStudentId] = useState<number | null>(prefillStudentId ?? null);
  const [studentName, setStudentName] = useState(prefillStudentName ?? "");
  const [serviceTypeId, setServiceTypeId] = useState<number | null>(prefillServiceTypeId ?? null);
  const [serviceTypeName, setServiceTypeName] = useState(prefillServiceTypeName ?? "");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [customDuration, setCustomDuration] = useState("");
  const [outcome, setOutcome] = useState<"completed" | "missed" | null>(null);
  const [missedReasonId, setMissedReasonId] = useState<number | null>(null);
  const [missedReasonLabel, setMissedReasonLabel] = useState<string | null>(null);
  const [makeupNeeded, setMakeupNeeded] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [missedReasons, setMissedReasons] = useState<MissedReason[]>([]);
  const [search, setSearch] = useState("");
  const [defaults, setDefaults] = useState<QuickLogDefaults>(() => loadDefaults(staffId));

  const searchRef = useRef<HTMLInputElement>(null);
  const entryStepRef = useRef<Step>("student");

  const today = sessionDate ?? new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!isOpen) return;
    setDefaults(loadDefaults(staffId));

    authFetch("/api/students?limit=500")
      .then((r) => r.json())
      .then((data: unknown) => {
        const arr = Array.isArray(data) ? data : (data as { data?: Student[] })?.data ?? [];
        setStudents(arr as Student[]);
      })
      .catch(() => {});

    authFetch("/api/service-types")
      .then((r) => r.json())
      .then((data: unknown) => setServiceTypes(Array.isArray(data) ? data as ServiceType[] : []))
      .catch(() => {});

    authFetch("/api/missed-reasons")
      .then((r) => r.json())
      .then((data: unknown) => setMissedReasons(Array.isArray(data) ? data as MissedReason[] : []))
      .catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const d = loadDefaults(staffId);
    setDefaults(d);

    const resolvedOutcome = prefillOutcome ?? (skipToMissed ? "missed" : null);
    setOutcome(resolvedOutcome);
    setDurationMinutes(prefillDurationMinutes ?? (d.lastDurationMinutes || 30));
    setMissedReasonId(null);
    setMissedReasonLabel(null);
    setMakeupNeeded(false);
    setNote("");
    setSearch("");

    if (prefillStudentId) {
      setStudentId(prefillStudentId);
      setStudentName(prefillStudentName ?? "");
      setServiceTypeId(prefillServiceTypeId ?? null);
      setServiceTypeName(prefillServiceTypeName ?? "");
      const startStep = computeInitialStep(
        prefillStudentId,
        prefillServiceTypeId,
        prefillServiceTypeName,
        prefillDurationMinutes,
        prefillOutcome,
        skipToMissed,
      );
      entryStepRef.current = startStep;
      setStep(startStep);
    } else {
      entryStepRef.current = "student";
      setStep("student");
    }
  }, [isOpen, prefillStudentId, prefillOutcome, skipToMissed, prefillDurationMinutes]);

  // Auto-pre-select most recent student+service when opening fresh (no prefill)
  useEffect(() => {
    if (!isOpen || prefillStudentId) return;
    if (step !== "student" || students.length === 0) return;
    const d = loadDefaults(staffId);
    const lastStudentId = d.recentStudentIds[0];
    if (!lastStudentId) return;
    const student = students.find((s) => s.id === lastStudentId);
    if (!student) return;
    setStudentId(student.id);
    setStudentName(`${student.firstName} ${student.lastName}`);
    const lastServiceTypeId = d.recentServiceTypeIds[0];
    if (lastServiceTypeId && serviceTypes.length > 0) {
      const svc = serviceTypes.find((s) => s.id === lastServiceTypeId);
      if (svc) {
        setServiceTypeId(svc.id);
        setServiceTypeName(svc.name);
        setDurationMinutes(getServiceDuration(d, svc.id));
        setStep("duration");
        return;
      }
    }
    setStep("service");
  }, [students, serviceTypes, isOpen]);

  const resetFields = () => {
    setStudentId(null);
    setStudentName("");
    setServiceTypeId(null);
    setServiceTypeName("");
    setDurationMinutes(defaults.lastDurationMinutes || 30);
    setCustomDuration("");
    setOutcome(null);
    setMissedReasonId(null);
    setMissedReasonLabel(null);
    setMakeupNeeded(false);
    setNote("");
    setSearch("");
  };

  const reset = () => {
    resetFields();
    setStep("student");
  };

  const handleClose = () => { reset(); onClose(); };

  const selectStudent = (id: number, name: string) => {
    setStudentId(id);
    setStudentName(name);
    setSearch("");
    const d = loadDefaults(staffId);
    const lastSvc = d.recentServiceTypeIds[0];
    if (lastSvc) {
      const found = serviceTypes.find((s) => s.id === lastSvc);
      if (found) {
        setServiceTypeId(found.id);
        setServiceTypeName(found.name);
      }
    }
    setStep("service");
  };

  const selectCombo = (combo: RecentCombo) => {
    setStudentId(combo.studentId);
    setStudentName(combo.studentName);
    setServiceTypeId(combo.serviceTypeId);
    setServiceTypeName(combo.serviceTypeName);
    setDurationMinutes(combo.durationMinutes);
    setCustomDuration("");
    // Repeating a recent combo implies it completed — skip outcome step
    setOutcome("completed");
    setStep("note");
  };

  const selectService = (id: number | null, name: string) => {
    setServiceTypeId(id);
    setServiceTypeName(name);
    const d = loadDefaults(staffId);
    const svcDuration = getServiceDuration(d, id);
    setDurationMinutes(svcDuration);
    setStep("duration");
  };

  const selectDuration = (min: number) => {
    setDurationMinutes(min);
    if (outcome === "missed") {
      setStep("reason");
    } else if (outcome === "completed") {
      setStep("note");
    } else {
      setStep("outcome");
    }
  };

  const selectOutcome = (o: "completed" | "missed") => {
    setOutcome(o);
    setStep(o === "missed" ? "reason" : "note");
  };

  const selectReason = (id: number | null, label?: string) => {
    setMissedReasonId(id);
    setMissedReasonLabel(label ?? null);
    setStep("note");
  };

  const handleSubmit = async () => {
    if (!studentId || !outcome) return;
    setSubmitting(true);
    try {
      await submitSession({
        studentId, staffId, outcome, serviceTypeId, durationMinutes,
        missedReasonId, missedReasonLabel, makeupNeeded, note,
        sessionDate: today, prefillStartTime, prefillEndTime,
        collectedGoalData: collectedGoalData,
      });
      const freshDefaults = loadDefaults(staffId);
      const updatedDefaults: QuickLogDefaults = {
        recentStudentIds: pushRecent(freshDefaults.recentStudentIds, studentId),
        recentServiceTypeIds: serviceTypeId
          ? pushRecent(freshDefaults.recentServiceTypeIds, serviceTypeId)
          : freshDefaults.recentServiceTypeIds,
        lastDurationMinutes: durationMinutes,
        recentCombos: pushCombo(freshDefaults.recentCombos, {
          studentId,
          studentName,
          serviceTypeId,
          serviceTypeName,
          durationMinutes,
        }),
        serviceDurations: {
          ...freshDefaults.serviceDurations,
          ...(serviceTypeId != null ? { [String(serviceTypeId)]: durationMinutes } : {}),
        },
      };
      saveDefaults(staffId, updatedDefaults);
      setDefaults(updatedDefaults);
      const goalCount = collectedGoalData?.length || 0;
      toast.success(
        outcome === "completed"
          ? `Session logged!${goalCount > 0 ? ` ${goalCount} goal${goalCount !== 1 ? "s" : ""} tracked.` : ""}`
          : "Missed session recorded."
      );
      onSuccess();
      setStep("success");
    } catch {
      toast.error("Failed to save session. Please try again.");
    }
    setSubmitting(false);
  };

  const handleLogAnotherSameStudent = () => {
    const keepStudentId = studentId;
    const keepStudentName = studentName;
    resetFields();
    setStudentId(keepStudentId);
    setStudentName(keepStudentName);
    setStep("service");
  };

  const handleLogAnother = () => { reset(); };

  const back = () => {
    // Full ordered step chain — same shape regardless of prefills
    const resolvedOutcome = outcome;
    const order: Step[] = [
      "student",
      "service",
      "duration",
      "outcome",
      ...(resolvedOutcome === "missed" ? ["reason" as Step] : []),
      "note",
    ];
    const idx = order.indexOf(step);
    const entryIdx = order.indexOf(entryStepRef.current);
    // Close when we're at or before the entry step (user can't go further back)
    if (idx <= 0 || idx <= entryIdx) { handleClose(); return; }
    setStep(order[idx - 1]);
  };

  if (!isOpen) return null;

  const filteredStudents = search.trim()
    ? students.filter((s) => `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase()))
    : students;

  const recentStudents = defaults.recentStudentIds
    .map(id => students.find(s => s.id === id))
    .filter((s): s is typeof students[number] => s !== undefined);
  const recentServiceTypes = defaults.recentServiceTypeIds
    .map(id => serviceTypes.find(s => s.id === id))
    .filter((s): s is typeof serviceTypes[number] => s !== undefined);

  const serviceSuggestedDuration = serviceTypeId != null
    ? (defaults.serviceDurations[String(serviceTypeId)] ?? undefined)
    : undefined;

  const isSuccessStep = step === "success";

  // Count only steps the user will actually see
  const visibleSteps: Step[] = prefillStudentId
    ? [
        ...(prefillServiceTypeId == null && !prefillServiceTypeName ? ["service" as Step] : []),
        ...(prefillDurationMinutes == null ? ["duration" as Step] : []),
        ...(prefillOutcome == null && !skipToMissed ? ["outcome" as Step] : []),
        ...(outcome === "missed" ? ["reason" as Step] : []),
        "note",
      ]
    : ["student", "service", "duration", "outcome", ...(outcome === "missed" ? ["reason" as Step] : []), "note"];

  const STEP_TOTAL = visibleSteps.length;
  const stepIdx = isSuccessStep ? STEP_TOTAL : Math.max(1, visibleSteps.indexOf(step) + 1);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" style={{ touchAction: "manipulation" }}>
      {!isSuccessStep && (
        <QuickLogHeader stepIdx={stepIdx} stepTotal={STEP_TOTAL} onBack={back} onClose={handleClose} />
      )}
      <QuickLogBody
        step={step}
        filteredStudents={filteredStudents}
        recentStudents={recentStudents}
        serviceTypes={serviceTypes}
        recentServiceTypes={recentServiceTypes}
        missedReasons={missedReasons}
        search={search}
        onSearch={setSearch}
        selectStudent={selectStudent}
        searchRef={searchRef}
        studentId={studentId}
        studentName={studentName}
        serviceTypeName={serviceTypeName}
        selectService={selectService}
        durationMinutes={durationMinutes}
        customDuration={customDuration}
        setCustomDuration={setCustomDuration}
        selectDuration={selectDuration}
        selectOutcome={selectOutcome}
        outcome={outcome}
        makeupNeeded={makeupNeeded}
        toggleMakeup={() => setMakeupNeeded((v) => !v)}
        selectReason={selectReason}
        missedReasonId={missedReasonId}
        missedReasonLabel={missedReasonLabel}
        note={note}
        setNote={setNote}
        goReview={() => setStep("review")}
        sessionDate={today}
        onSubmit={handleSubmit}
        submitting={submitting}
        goalCount={collectedGoalData?.length}
        recentCombos={defaults.recentCombos}
        onSelectCombo={selectCombo}
        serviceSuggestedDuration={serviceSuggestedDuration}
        onLogAnotherSameStudent={handleLogAnotherSameStudent}
        onLogAnother={handleLogAnother}
        onDone={handleClose}
      />
    </div>
  );
}
