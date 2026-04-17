import { useState, useEffect, useRef } from "react";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";
import type { CollectedGoalEntry } from "@/components/live-data-panel/types";
import {
  type QuickLogDefaults, type Student, type ServiceType, type MissedReason, type Step,
  loadDefaults, saveDefaults, pushRecent,
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
  prefillStartTime?: string;
  prefillEndTime?: string;
  sessionDate?: string;
  skipToMissed?: boolean;
  collectedGoalData?: CollectedGoalEntry[];
}

export function QuickLogSheet({
  isOpen, onClose, onSuccess, staffId,
  prefillStudentId, prefillStudentName,
  prefillServiceTypeId, prefillServiceTypeName,
  prefillDurationMinutes, prefillStartTime, prefillEndTime,
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
    setDurationMinutes(prefillDurationMinutes ?? (d.lastDurationMinutes || 30));
    setMissedReasonId(null);
    setMissedReasonLabel(null);
    setMakeupNeeded(false);
    setNote("");
    setSearch("");

    if (skipToMissed) setOutcome("missed");
    else setOutcome(null);

    if (prefillStudentId) {
      setStudentId(prefillStudentId);
      setStudentName(prefillStudentName ?? "");
      const hasServicePrefill = prefillServiceTypeId != null || (prefillServiceTypeName && prefillDurationMinutes);
      if (hasServicePrefill) {
        setServiceTypeId(prefillServiceTypeId ?? null);
        setServiceTypeName(prefillServiceTypeName ?? "");
        setStep(prefillDurationMinutes ? "outcome" : "duration");
      } else {
        setStep("service");
      }
    } else {
      setStep("student");
    }
  }, [isOpen, prefillStudentId, skipToMissed, prefillDurationMinutes]);

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
        setStep("duration");
        return;
      }
    }
    setStep("service");
  }, [students, serviceTypes, isOpen]);

  const reset = () => {
    setStep("student");
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

  const handleClose = () => { reset(); onClose(); };

  const selectStudent = (id: number, name: string) => {
    setStudentId(id);
    setStudentName(name);
    setSearch("");
    const lastSvc = defaults.recentServiceTypeIds[0];
    if (lastSvc) {
      const found = serviceTypes.find((s) => s.id === lastSvc);
      if (found) {
        setServiceTypeId(found.id);
        setServiceTypeName(found.name);
      }
    }
    setStep("service");
  };

  const selectService = (id: number | null, name: string) => {
    setServiceTypeId(id);
    setServiceTypeName(name);
    setStep("duration");
  };

  const selectDuration = (min: number) => {
    setDurationMinutes(min);
    setStep(outcome === "missed" ? "reason" : "outcome");
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
      saveDefaults(staffId, {
        recentStudentIds: pushRecent(defaults.recentStudentIds, studentId),
        recentServiceTypeIds: serviceTypeId
          ? pushRecent(defaults.recentServiceTypeIds, serviceTypeId)
          : defaults.recentServiceTypeIds,
        lastDurationMinutes: durationMinutes,
      });
      const goalCount = collectedGoalData?.length || 0;
      toast.success(
        outcome === "completed"
          ? `Session logged!${goalCount > 0 ? ` ${goalCount} goal${goalCount !== 1 ? "s" : ""} tracked.` : ""}`
          : "Missed session recorded."
      );
      reset();
      onSuccess();
      onClose();
    } catch {
      toast.error("Failed to save session. Please try again.");
    }
    setSubmitting(false);
  };

  const back = () => {
    const order: Step[] = ["student", "service", "duration", "outcome", "reason", "note", "review"];
    const idx = order.indexOf(step);
    if (idx <= 0) { handleClose(); return; }
    let prev = order[idx - 1];
    if (prev === "reason" && outcome !== "missed") prev = "outcome";
    setStep(prev);
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

  const STEP_TOTAL = outcome === "missed" ? 7 : 6;
  const stepIdx = (["student", "service", "duration", "outcome", outcome === "missed" ? "reason" : null, "note", "review"].filter(Boolean) as Step[]).indexOf(step) + 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" style={{ touchAction: "manipulation" }}>
      <QuickLogHeader stepIdx={stepIdx} stepTotal={STEP_TOTAL} onBack={back} onClose={handleClose} />
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
      />
    </div>
  );
}
