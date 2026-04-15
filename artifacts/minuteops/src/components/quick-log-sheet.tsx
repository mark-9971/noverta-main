import { useState, useEffect, useRef } from "react";
import { ArrowLeft, X, Search, Check, Clock, AlertTriangle, Zap } from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";
import { toast } from "sonner";

const STORAGE_KEY = "trellis_quicklog_v1";

interface QuickLogDefaults {
  recentStudentIds: number[];
  recentServiceTypeIds: number[];
  lastDurationMinutes: number;
}

function loadDefaults(): QuickLogDefaults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as QuickLogDefaults;
  } catch {}
  return { recentStudentIds: [], recentServiceTypeIds: [], lastDurationMinutes: 30 };
}

function saveDefaults(defaults: QuickLogDefaults) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  } catch {}
}

function pushRecent(arr: number[], id: number, max = 5): number[] {
  return [id, ...arr.filter((x) => x !== id)].slice(0, max);
}

interface Student { id: number; firstName: string; lastName: string; }
interface ServiceType { id: number; name: string; }
interface MissedReason { id: number; label: string; category: string; }

type Step = "student" | "service" | "duration" | "outcome" | "reason" | "note";

const DURATION_PRESETS = [15, 20, 30, 45, 60];

const MISSED_QUICK_REASONS = [
  { label: "Student Absent", category: "absent" },
  { label: "Student Refused", category: "refused" },
  { label: "Schedule Conflict", category: "schedule" },
  { label: "Staff Absent", category: "staff" },
  { label: "Other", category: "other" },
];

interface QuickLogSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  staffId: number | null;
  prefillStudentId?: number;
  prefillStudentName?: string;
  prefillServiceTypeId?: number;
  prefillServiceTypeName?: string;
  sessionDate?: string;
  skipToMissed?: boolean;
}

export function QuickLogSheet({
  isOpen, onClose, onSuccess, staffId,
  prefillStudentId, prefillStudentName,
  prefillServiceTypeId, prefillServiceTypeName,
  sessionDate, skipToMissed,
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
  const [makeupNeeded, setMakeupNeeded] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [students, setStudents] = useState<Student[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [missedReasons, setMissedReasons] = useState<MissedReason[]>([]);
  const [search, setSearch] = useState("");
  const [defaults, setDefaults] = useState<QuickLogDefaults>(loadDefaults);

  const searchRef = useRef<HTMLInputElement>(null);

  const today = sessionDate ?? new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!isOpen) return;
    setDefaults(loadDefaults());

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
    const d = loadDefaults();
    setDefaults(d);
    setDurationMinutes(d.lastDurationMinutes || 30);
    setMissedReasonId(null);
    setMakeupNeeded(false);
    setNote("");
    setSearch("");

    if (skipToMissed) {
      setOutcome("missed");
    } else {
      setOutcome(null);
    }

    if (prefillStudentId) {
      setStudentId(prefillStudentId);
      setStudentName(prefillStudentName ?? "");
      if (prefillServiceTypeId) {
        setServiceTypeId(prefillServiceTypeId);
        setServiceTypeName(prefillServiceTypeName ?? "");
        setStep("duration");
      } else {
        setStep("service");
      }
    } else {
      setStep("student");
    }
  }, [isOpen, prefillStudentId, skipToMissed]);

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
    setMakeupNeeded(false);
    setNote("");
    setSearch("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

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

  const selectService = (id: number, name: string) => {
    setServiceTypeId(id);
    setServiceTypeName(name);
    setStep("duration");
  };

  const selectDuration = (min: number) => {
    setDurationMinutes(min);
    if (outcome === "missed") {
      setStep("reason");
    } else {
      setStep("outcome");
    }
  };

  const selectOutcome = (o: "completed" | "missed") => {
    setOutcome(o);
    if (o === "missed") setStep("reason");
    else setStep("note");
  };

  const selectReason = (id: number | null) => {
    setMissedReasonId(id);
    setStep("note");
  };

  const handleSubmit = async () => {
    if (!studentId || !outcome) return;
    setSubmitting(true);

    const now = new Date();
    const endTime = now.toTimeString().slice(0, 5);
    const startMs = now.getTime() - durationMinutes * 60 * 1000;
    const startTime = new Date(startMs).toTimeString().slice(0, 5);

    const body: Record<string, unknown> = {
      studentId,
      staffId,
      sessionDate: today,
      startTime,
      endTime,
      durationMinutes,
      status: outcome,
      serviceTypeId: serviceTypeId ?? null,
      missedReasonId: outcome === "missed" ? (missedReasonId ?? null) : null,
      isMakeup: outcome === "missed" ? makeupNeeded : false,
      notes: note.trim() || null,
      location: null,
    };

    try {
      const res = await authFetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");

      const newDefaults: QuickLogDefaults = {
        recentStudentIds: pushRecent(defaults.recentStudentIds, studentId),
        recentServiceTypeIds: serviceTypeId
          ? pushRecent(defaults.recentServiceTypeIds, serviceTypeId)
          : defaults.recentServiceTypeIds,
        lastDurationMinutes: durationMinutes,
      };
      saveDefaults(newDefaults);

      toast.success(outcome === "completed" ? "Session logged!" : "Missed session recorded.");
      reset();
      onSuccess();
      onClose();
    } catch {
      toast.error("Failed to save session. Please try again.");
    }
    setSubmitting(false);
  };

  const back = () => {
    const order: Step[] = ["student", "service", "duration", "outcome", "reason", "note"];
    const idx = order.indexOf(step);
    if (idx <= 0) { handleClose(); return; }
    let prev = order[idx - 1];
    if (prev === "reason" && outcome !== "missed") prev = "outcome";
    setStep(prev);
  };

  if (!isOpen) return null;

  const filteredStudents = search.trim()
    ? students.filter((s) =>
        `${s.firstName} ${s.lastName}`.toLowerCase().includes(search.toLowerCase())
      )
    : students;

  const recentStudents = students.filter((s) => defaults.recentStudentIds.includes(s.id));
  const recentServiceTypes = serviceTypes.filter((s) => defaults.recentServiceTypeIds.includes(s.id));

  const STEP_TOTAL = outcome === "missed" ? 6 : 5;
  const stepIdx = (["student", "service", "duration", "outcome", outcome === "missed" ? "reason" : null, "note"].filter(Boolean) as Step[]).indexOf(step) + 1;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" style={{ touchAction: "manipulation" }}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 bg-white flex-shrink-0">
        <button
          onClick={back}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 flex-shrink-0"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-gray-800">Quick Log</p>
          <div className="flex gap-1 mt-0.5">
            {Array.from({ length: STEP_TOTAL }).map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full flex-1 transition-colors ${i < stepIdx ? "bg-emerald-500" : "bg-gray-200"}`}
              />
            ))}
          </div>
        </div>
        <button
          onClick={handleClose}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 flex-shrink-0"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-gray-500" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {step === "student" && (
          <StudentStep
            students={filteredStudents}
            recents={recentStudents}
            search={search}
            onSearch={setSearch}
            onSelect={selectStudent}
            searchRef={searchRef}
          />
        )}

        {step === "service" && (
          <ServiceStep
            serviceTypes={serviceTypes}
            recents={recentServiceTypes}
            studentName={studentName}
            onSelect={selectService}
          />
        )}

        {step === "duration" && (
          <DurationStep
            studentName={studentName}
            serviceTypeName={serviceTypeName}
            selected={durationMinutes}
            customValue={customDuration}
            onCustomChange={setCustomDuration}
            onSelect={selectDuration}
          />
        )}

        {step === "outcome" && (
          <OutcomeStep
            studentName={studentName}
            durationMinutes={durationMinutes}
            onSelect={selectOutcome}
          />
        )}

        {step === "reason" && (
          <ReasonStep
            dbReasons={missedReasons}
            selectedId={missedReasonId}
            makeupNeeded={makeupNeeded}
            onToggleMakeup={() => setMakeupNeeded((v) => !v)}
            onSelect={selectReason}
          />
        )}

        {step === "note" && (
          <NoteStep
            studentName={studentName}
            serviceTypeName={serviceTypeName}
            durationMinutes={durationMinutes}
            outcome={outcome!}
            note={note}
            makeupNeeded={makeupNeeded}
            onNoteChange={setNote}
            onSubmit={handleSubmit}
            submitting={submitting}
          />
        )}
      </div>
    </div>
  );
}

function StudentStep({
  students, recents, search, onSearch, onSelect, searchRef,
}: {
  students: Student[];
  recents: Student[];
  search: string;
  onSearch: (v: string) => void;
  onSelect: (id: number, name: string) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-3">
        <h2 className="text-xl font-bold text-gray-900">Who are you working with?</h2>
        <p className="text-sm text-gray-500 mt-1">Select a student to log a session</p>
      </div>

      <div className="px-4 pb-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search students…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            className="w-full h-12 pl-10 pr-4 rounded-xl border border-gray-200 text-[15px] focus:outline-none focus:ring-2 focus:ring-emerald-500"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
        {!search && recents.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> Recent
            </p>
            <div className="space-y-1.5">
              {recents.map((s) => (
                <StudentRow key={s.id} student={s} onSelect={onSelect} highlight />
              ))}
            </div>
          </div>
        )}

        <div>
          {(!search && recents.length > 0) && (
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">All Students</p>
          )}
          <div className="space-y-1.5">
            {students.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">No students found</p>
            )}
            {students.map((s) => (
              <StudentRow key={s.id} student={s} onSelect={onSelect} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StudentRow({ student, onSelect, highlight }: { student: Student; onSelect: (id: number, name: string) => void; highlight?: boolean }) {
  const name = `${student.firstName} ${student.lastName}`;
  return (
    <button
      onClick={() => onSelect(student.id, name)}
      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-colors active:scale-[0.98] ${
        highlight ? "bg-emerald-50 border border-emerald-200" : "bg-gray-50 hover:bg-gray-100"
      }`}
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0 ${
        highlight ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"
      }`}>
        {student.firstName[0]}{student.lastName[0]}
      </div>
      <span className="text-[15px] font-medium text-gray-900">{name}</span>
    </button>
  );
}

function ServiceStep({
  serviceTypes, recents, studentName, onSelect,
}: {
  serviceTypes: ServiceType[];
  recents: ServiceType[];
  studentName: string;
  onSelect: (id: number, name: string) => void;
}) {
  return (
    <div className="px-4 pt-5 pb-6">
      <h2 className="text-xl font-bold text-gray-900">What service?</h2>
      <p className="text-sm text-gray-500 mt-1">{studentName}</p>

      {recents.length > 0 && (
        <div className="mt-5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Zap className="w-3 h-3" /> Recent
          </p>
          <div className="grid grid-cols-2 gap-2">
            {recents.map((s) => (
              <ServiceButton key={s.id} service={s} onSelect={onSelect} highlight />
            ))}
          </div>
        </div>
      )}

      <div className="mt-4">
        {recents.length > 0 && (
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">All Services</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {serviceTypes.map((s) => (
            <ServiceButton key={s.id} service={s} onSelect={onSelect} />
          ))}
          {serviceTypes.length === 0 && (
            <button
              onClick={() => onSelect(0, "General")}
              className="col-span-2 h-14 rounded-xl bg-gray-50 border border-gray-200 text-[15px] font-medium text-gray-700 active:bg-gray-100"
            >
              General
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceButton({ service, onSelect, highlight }: { service: ServiceType; onSelect: (id: number, name: string) => void; highlight?: boolean }) {
  return (
    <button
      onClick={() => onSelect(service.id, service.name)}
      className={`h-14 rounded-xl text-[14px] font-medium text-left px-4 transition-colors active:scale-[0.97] ${
        highlight
          ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
          : "bg-gray-50 border border-gray-200 text-gray-800 hover:bg-gray-100"
      }`}
    >
      {service.name}
    </button>
  );
}

function DurationStep({
  studentName, serviceTypeName, selected, customValue, onCustomChange, onSelect,
}: {
  studentName: string;
  serviceTypeName: string;
  selected: number;
  customValue: string;
  onCustomChange: (v: string) => void;
  onSelect: (min: number) => void;
}) {
  return (
    <div className="px-4 pt-5 pb-6">
      <h2 className="text-xl font-bold text-gray-900">How long?</h2>
      <p className="text-sm text-gray-500 mt-1">{studentName} · {serviceTypeName}</p>

      <div className="grid grid-cols-3 gap-3 mt-6">
        {DURATION_PRESETS.map((min) => (
          <button
            key={min}
            onClick={() => onSelect(min)}
            className={`h-20 rounded-2xl flex flex-col items-center justify-center gap-0.5 text-center transition-all active:scale-[0.96] border-2 ${
              selected === min
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-white text-gray-800"
            }`}
          >
            <span className="text-2xl font-bold leading-none">{min}</span>
            <span className="text-[11px] text-gray-400 font-medium">min</span>
          </button>
        ))}

        <div className="h-20 rounded-2xl border-2 border-dashed border-gray-200 bg-white flex flex-col items-center justify-center gap-1 overflow-hidden">
          <span className="text-[11px] text-gray-400 font-medium">Custom</span>
          <input
            type="number"
            min="1"
            max="240"
            placeholder="—"
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            onBlur={() => {
              const v = parseInt(customValue);
              if (v > 0 && v <= 240) onSelect(v);
            }}
            className="w-16 text-center text-[18px] font-bold text-gray-800 border-0 outline-none bg-transparent"
          />
        </div>
      </div>
    </div>
  );
}

function OutcomeStep({ studentName, durationMinutes, onSelect }: {
  studentName: string;
  durationMinutes: number;
  onSelect: (o: "completed" | "missed") => void;
}) {
  return (
    <div className="px-4 pt-5 pb-6">
      <h2 className="text-xl font-bold text-gray-900">How did it go?</h2>
      <p className="text-sm text-gray-500 mt-1">{studentName} · {durationMinutes} min</p>

      <div className="mt-8 space-y-4">
        <button
          onClick={() => onSelect("completed")}
          className="w-full h-24 rounded-2xl bg-emerald-50 border-2 border-emerald-200 flex items-center gap-5 px-6 text-left active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Check className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <p className="text-[18px] font-bold text-emerald-800">Completed</p>
            <p className="text-[13px] text-emerald-600">Session ran as planned</p>
          </div>
        </button>

        <button
          onClick={() => onSelect("missed")}
          className="w-full h-24 rounded-2xl bg-amber-50 border-2 border-amber-200 flex items-center gap-5 px-6 text-left active:scale-[0.98] transition-transform"
        >
          <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <p className="text-[18px] font-bold text-amber-800">Missed</p>
            <p className="text-[13px] text-amber-600">Session did not occur</p>
          </div>
        </button>
      </div>
    </div>
  );
}

function ReasonStep({ dbReasons, selectedId, makeupNeeded, onToggleMakeup, onSelect }: {
  dbReasons: MissedReason[];
  selectedId: number | null;
  makeupNeeded: boolean;
  onToggleMakeup: () => void;
  onSelect: (id: number | null) => void;
}) {
  const reasons = dbReasons.length > 0 ? dbReasons : MISSED_QUICK_REASONS.map((r, i) => ({ id: -(i + 1), label: r.label, category: r.category }));

  return (
    <div className="px-4 pt-5 pb-6">
      <h2 className="text-xl font-bold text-gray-900">Why was it missed?</h2>
      <p className="text-sm text-gray-500 mt-1">Select the closest reason</p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {reasons.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.id > 0 ? r.id : null)}
            className={`h-14 rounded-xl px-3 text-[14px] font-medium text-left transition-all active:scale-[0.97] border-2 ${
              selectedId === r.id || (r.id < 0 && selectedId === null && r.label === "Other")
                ? "border-amber-500 bg-amber-50 text-amber-800"
                : "border-gray-200 bg-gray-50 text-gray-800"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <button
        onClick={onToggleMakeup}
        className={`mt-5 w-full h-14 rounded-xl px-4 flex items-center gap-3 border-2 transition-all active:scale-[0.97] ${
          makeupNeeded ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-gray-50"
        }`}
      >
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          makeupNeeded ? "border-blue-500 bg-blue-500" : "border-gray-300"
        }`}>
          {makeupNeeded && <Check className="w-3.5 h-3.5 text-white" />}
        </div>
        <span className={`text-[15px] font-medium ${makeupNeeded ? "text-blue-800" : "text-gray-700"}`}>
          Make-up session needed
        </span>
      </button>

      <button
        onClick={() => onSelect(selectedId)}
        className="mt-5 w-full h-14 rounded-xl bg-emerald-600 text-white text-[16px] font-semibold active:bg-emerald-700 transition-colors"
      >
        Continue
      </button>
    </div>
  );
}

function NoteStep({ studentName, serviceTypeName, durationMinutes, outcome, note, makeupNeeded, onNoteChange, onSubmit, submitting }: {
  studentName: string;
  serviceTypeName: string;
  durationMinutes: number;
  outcome: "completed" | "missed";
  note: string;
  makeupNeeded: boolean;
  onNoteChange: (v: string) => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <div className="px-4 pt-5 pb-6 flex flex-col min-h-[calc(100vh-80px)]">
      <h2 className="text-xl font-bold text-gray-900">Any notes?</h2>
      <p className="text-sm text-gray-500 mt-1">Optional — add context or observations</p>

      <div className={`mt-4 rounded-xl border-2 p-4 ${
        outcome === "completed" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
      }`}>
        <div className="flex items-center gap-2">
          {outcome === "completed"
            ? <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            : <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />}
          <p className={`text-[14px] font-semibold ${outcome === "completed" ? "text-emerald-800" : "text-amber-800"}`}>
            {outcome === "completed" ? "Completed" : "Missed"} · {studentName} · {durationMinutes} min
          </p>
        </div>
        {serviceTypeName && <p className="text-[12px] text-gray-500 mt-1 ml-6">{serviceTypeName}</p>}
        {makeupNeeded && (
          <p className="text-[12px] text-blue-600 mt-1 ml-6 font-medium">Make-up needed</p>
        )}
      </div>

      <textarea
        placeholder="Add a note… (e.g. student was distracted, worked on goal X)"
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        maxLength={500}
        className="mt-4 w-full h-28 rounded-xl border border-gray-200 p-3 text-[15px] resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 placeholder:text-gray-300"
      />
      <p className="text-right text-[11px] text-gray-300 mt-1">{note.length}/500</p>

      <div className="mt-auto pt-6">
        <button
          onClick={onSubmit}
          disabled={submitting}
          className="w-full h-16 rounded-2xl bg-emerald-600 text-white text-[18px] font-bold active:bg-emerald-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2 shadow-lg"
        >
          {submitting ? (
            <Clock className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Check className="w-5 h-5" />
              Save Session
            </>
          )}
        </button>
      </div>
    </div>
  );
}
