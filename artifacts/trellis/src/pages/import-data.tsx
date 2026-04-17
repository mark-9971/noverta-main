import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload, FileSpreadsheet, Users, Clock, ClipboardList,
  CheckCircle, XCircle, AlertTriangle, Download, RefreshCw,
  BarChart2, ChevronDown, ChevronUp, Copy, Table2, FileText,
  Target, Sparkles, BookOpen, UserPlus, ArrowRight, ArrowLeft,
  Settings2, TriangleAlert, CircleDot, Info
} from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

type ImportType = "students" | "staff" | "service-requirements" | "sessions" | "goals-data" | "iep-documents";

const IMPORT_TYPES: { key: ImportType; label: string; description: string; icon: any; templateKey: string; badge?: string; order: number }[] = [
  { key: "students", label: "Students", description: "Import your SPED student roster with demographics and IDs", icon: Users, templateKey: "students", order: 1 },
  { key: "staff", label: "Staff / Providers", description: "Import clinicians, paras, case managers, and other staff", icon: UserPlus, templateKey: "staff", badge: "New", order: 2 },
  { key: "iep-documents", label: "IEP Documents", description: "Upload IEP PDFs — auto-extracts goals, services & accommodations", icon: FileText, templateKey: "", badge: "AI", order: 3 },
  { key: "service-requirements", label: "Service Requirements", description: "Import IEP-mandated service minutes per student", icon: ClipboardList, templateKey: "service_requirements", order: 4 },
  { key: "sessions", label: "Session Logs", description: "Import historical delivered session/minute logs", icon: Clock, templateKey: "sessions", order: 5 },
  { key: "goals-data", label: "Goals & Progress Data", description: "Import IEP goals with historical data points", icon: BarChart2, templateKey: "goals_data_tall", order: 6 },
];

const PREBUILT_TEMPLATES: Record<ImportType, { key: string; label: string; description: string }[]> = {
  students: [
    { key: "aspen_students", label: "Aspen X2 Student Export", description: "Matches Aspen X2 student roster export format" },
  ],
  staff: [],
  "iep-documents": [],
  "service-requirements": [
    { key: "esped_services", label: "eSPED Service Grid", description: "Matches eSPED IEP service requirement export" },
  ],
  sessions: [],
  "goals-data": [
    { key: "goals_data_tall", label: "Tall format (row per data point)", description: "student, goal, date, value per row" },
    { key: "goals_data_wide", label: "Wide format (dates as columns)", description: "Dates as columns — ideal for Google Sheets trackers" },
  ],
};

const IMPORT_GUIDANCE: Record<string, { prereqs: string; requiredCols: string; tips: string[] }> = {
  students: {
    prereqs: "None — students are usually the first thing you import.",
    requiredCols: "first_name, last_name",
    tips: [
      "Include external_id (your SIS student ID) — it makes future imports much easier",
      "School and case_manager columns must match names already in Trellis",
      "Duplicates are detected by first + last name match",
    ],
  },
  staff: {
    prereqs: "None — staff can be imported alongside or before students.",
    requiredCols: "first_name, last_name, role",
    tips: [
      "Role must be one of: slp, ot, pt, bcba, para, counselor, case_manager, teacher, coordinator, admin",
      "Common titles like 'Speech-Language Pathologist' are auto-recognized",
      "Include email for login access and better duplicate detection",
    ],
  },
  "service-requirements": {
    prereqs: "Students must be imported first. Service types must exist in Trellis.",
    requiredCols: "student identifier (name or ID), service_type, required_minutes",
    tips: [
      "Students are matched by external_id, or first_name + last_name",
      "Service types: Speech-Language Therapy, Occupational Therapy, Physical Therapy, ABA, Counseling, Para Support",
      "Interval defaults to 'monthly' — use weekly/daily/quarterly if needed",
    ],
  },
  sessions: {
    prereqs: "Students must be imported first.",
    requiredCols: "student identifier, session_date, duration_minutes",
    tips: [
      "Dates can be YYYY-MM-DD or MM/DD/YYYY format",
      "Status options: completed (default), missed, partial",
      "Missed sessions count against compliance — use them to track delivery gaps",
    ],
  },
  "goals-data": {
    prereqs: "Students must be imported first.",
    requiredCols: "student identifier, goal_name, date/value columns",
    tips: [
      "Supports two formats: Tall (one row per data point) and Wide (dates as column headers)",
      "Paste directly from Google Sheets using the Paste button",
      "Trellis auto-creates goals, targets, and sessions for all data points",
    ],
  },
  "iep-documents": {
    prereqs: "Students must be imported first — names in the IEP must match the roster.",
    requiredCols: "PDF file(s)",
    tips: [
      "Supports Massachusetts IEP forms and most district-formatted IEPs",
      "PDFs must be text-based (not scanned images)",
      "Upload up to 100 files at once, 20MB max per file",
    ],
  },
};

type Step = "upload" | "mapping" | "validate" | "import" | "result";

interface ImportResult {
  id: number;
  importType: string;
  fileName: string | null;
  status: string;
  rowsProcessed: number;
  rowsImported: number;
  rowsErrored: number;
  rowsUpdated?: number;
  rowsSkipped?: number;
  errors?: string[];
  createdAt: string;
}

interface ColumnMapping {
  csvHeader: string;
  mappedTo: string | null;
  required: boolean;
  sampleValues: string[];
}

interface RowValidation {
  row: number;
  status: "valid" | "warning" | "error";
  messages: string[];
  data: Record<string, string>;
}

interface ValidationResult {
  summary: { totalRows: number; validatedRows: number; valid: number; warnings: number; errors: number };
  columnMappings: ColumnMapping[];
  unmappedRequired: string[];
  validations: RowValidation[];
}

interface IepProgressEvent {
  type: string;
  index?: number;
  fileName?: string;
  success?: boolean;
  studentName?: { firstName: string; lastName: string };
  goalsCreated?: number;
  servicesCreated?: number;
  accommodationsCreated?: number;
  error?: string;
  completed?: number;
  total?: number;
  results?: Array<{
    fileName: string;
    success: boolean;
    studentName?: { firstName: string; lastName: string };
    error?: string;
    details?: Record<string, number>;
  }>;
}

function parseCsvPreview(text: string, maxRows = 100): { headers: string[]; rows: string[][]; totalRows: number } | null {
  const isTsv = text.includes("\t");
  const sep = isTsv ? "\t" : ",";
  const lines = text.trim().split("\n").map(l => l.replace(/\r$/, "")).filter(l => l.length > 0 && !l.startsWith("#"));
  if (lines.length === 0) return null;
  const parseLine = (line: string): string[] => {
    if (isTsv) return line.split("\t").map(c => c.trim());
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = !inQuotes; }
      else if (ch === sep && !inQuotes) { result.push(current.trim()); current = ""; }
      else current += ch;
    }
    result.push(current.trim());
    return result;
  };
  const headers = parseLine(lines[0]);
  const totalRows = lines.length - 1;
  const rows = lines.slice(1, 1 + maxRows).map(parseLine);
  return { headers, rows, totalRows };
}

const GOALS_DATA_GUIDE = `Accepted columns (flexible naming):
  • student_id / first_name / last_name / student_name
  • goal_name / behavior_name / program_name
  • goal_type: "behavior" or "skill" (auto-detected if blank)
  • measurement_type: frequency / duration / percent
  • target_direction: increase / decrease
  • baseline (optional)

Tall format — one row per data point:
  goal_name, goal_type, date, value

Wide format (Google Sheets style) — dates as column headers:
  goal_name, goal_type, 2024-09-06, 2024-09-13, ...

For each goal, Trellis will auto-create the IEP goal, target,
and linked sessions so data appears in all charts immediately.`;

function StatusBadge({ status }: { status: "valid" | "warning" | "error" }) {
  if (status === "valid") return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700"><CheckCircle className="w-2.5 h-2.5" />OK</span>;
  if (status === "warning") return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"><TriangleAlert className="w-2.5 h-2.5" />Warn</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700"><XCircle className="w-2.5 h-2.5" />Error</span>;
}

export default function ImportData() {
  const [selectedType, setSelectedType] = useState<ImportType | null>(null);
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [csvPreview, setCsvPreview] = useState<ReturnType<typeof parseCsvPreview>>(null);
  const [importing, setImporting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [history, setHistory] = useState<ImportResult[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [duplicateHandling, setDuplicateHandling] = useState<"skip" | "update">("skip");
  const [validationPage, setValidationPage] = useState(0);
  const [validationFilter, setValidationFilter] = useState<"all" | "error" | "warning" | "valid">("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const [iepFiles, setIepFiles] = useState<File[]>([]);
  const [iepProcessing, setIepProcessing] = useState(false);
  const [iepProgress, setIepProgress] = useState<IepProgressEvent[]>([]);
  const [iepComplete, setIepComplete] = useState<IepProgressEvent | null>(null);
  const iepFileInputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await authFetch("/api/imports");
      if (res.ok) setHistory(await res.json());
    } catch (_) {}
    setLoadingHistory(false);
  }, []);

  useEffect(() => { loadHistory(); }, []);

  useEffect(() => {
    if (selectedType === "goals-data") setShowGuide(true);
    else setShowGuide(false);
    setStep("upload");
    setPasteText("");
    setShowPasteArea(false);
    setCsvPreview(null);
    setFile(null);
    setResult(null);
    setValidation(null);
    setDuplicateHandling("skip");
    setValidationPage(0);
    setValidationFilter("all");
    setIepFiles([]);
    setIepProgress([]);
    setIepComplete(null);
    setIepProcessing(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (iepFileInputRef.current) iepFileInputRef.current.value = "";
  }, [selectedType]);

  async function handleFile(f: File) {
    setFile(f);
    setPasteText("");
    setResult(null);
    setValidation(null);
    const text = await f.text();
    setCsvPreview(parseCsvPreview(text));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".tsv") || f.name.endsWith(".txt"))) {
      handleFile(f);
    }
  }

  function handlePasteChange(val: string) {
    setPasteText(val);
    setFile(null);
    setResult(null);
    setValidation(null);
    if (val.trim()) setCsvPreview(parseCsvPreview(val));
    else setCsvPreview(null);
  }

  async function handleValidate() {
    if (!selectedType || selectedType === "iep-documents" || selectedType === "goals-data") return;
    if (!file && !pasteText.trim()) return;
    setValidating(true);
    setValidation(null);

    try {
      const csvData = file ? await file.text() : pasteText;
      const res = await authFetch("/api/imports/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvData, importType: selectedType }),
      });
      if (res.ok) {
        const data = await res.json();
        setValidation(data);
        setStep("validate");
        setValidationPage(0);
        setValidationFilter("all");
      } else {
        const err = await res.json();
        setValidation(null);
        alert(err.error || "Validation failed");
      }
    } catch (e: any) {
      alert("Validation request failed: " + e.message);
    }
    setValidating(false);
  }

  async function handleImport() {
    if (!selectedType) return;
    if (!file && !pasteText.trim()) return;
    setImporting(true);
    setResult(null);
    setStep("import");

    try {
      const csvData = file ? await file.text() : pasteText;
      const fileName = file ? file.name : "pasted-data.csv";

      const endpointMap: Record<string, string> = {
        "students": "/api/imports/students",
        "staff": "/api/imports/staff",
        "service-requirements": "/api/imports/service-requirements",
        "sessions": "/api/imports/sessions",
        "goals-data": "/api/imports/goals-data",
      };

      const res = await authFetch(endpointMap[selectedType], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvData, fileName, duplicateHandling }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResult({ id: 0, importType: selectedType, fileName, status: "failed", rowsProcessed: 0, rowsImported: 0, rowsErrored: 0, errors: [data.error || "Import failed"], createdAt: new Date().toISOString() });
      } else {
        setResult(data);
      }
      setStep("result");
      loadHistory();
    } catch (e: any) {
      setResult({ id: 0, importType: selectedType, fileName: file?.name || "paste", status: "failed", rowsProcessed: 0, rowsImported: 0, rowsErrored: 0, errors: [e.message], createdAt: new Date().toISOString() });
      setStep("result");
    }
    setImporting(false);
  }

  function downloadTemplate(templateKey: string) {
    window.open(`/api/imports/templates/${templateKey}`, "_blank");
  }

  function resetForm() {
    setStep("upload");
    setFile(null);
    setPasteText("");
    setCsvPreview(null);
    setResult(null);
    setValidation(null);
    setDuplicateHandling("skip");
    setValidationPage(0);
    setValidationFilter("all");
    setIepFiles([]);
    setIepProgress([]);
    setIepComplete(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (iepFileInputRef.current) iepFileInputRef.current.value = "";
  }

  function handleIepFiles(fileList: FileList) {
    const pdfs = Array.from(fileList).filter(f => f.type === "application/pdf" || f.name.endsWith(".pdf"));
    setIepFiles(prev => [...prev, ...pdfs]);
    setIepComplete(null);
    setIepProgress([]);
  }

  function removeIepFile(index: number) {
    setIepFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function handleIepImport() {
    if (iepFiles.length === 0) return;
    setIepProcessing(true);
    setIepProgress([]);
    setIepComplete(null);

    try {
      const formData = new FormData();
      if (iepFiles.length === 1) {
        formData.append("file", iepFiles[0]);
        const res = await authFetch("/api/imports/iep-documents", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (res.ok) {
          setIepComplete({
            type: "complete", total: 1,
            results: [{ fileName: iepFiles[0].name, success: true, studentName: data.studentName, details: { goalsCreated: data.goalsCreated, servicesCreated: data.servicesCreated, accommodationsCreated: data.accommodationsCreated, behaviorTargetsCreated: data.behaviorTargetsCreated, programTargetsCreated: data.programTargetsCreated } }],
          });
        } else {
          setIepComplete({ type: "complete", total: 1, results: [{ fileName: iepFiles[0].name, success: false, error: data.error || data.message || "Import failed" }] });
        }
      } else {
        for (const f of iepFiles) formData.append("files", f);
        const res = await authFetch("/api/imports/iep-documents/bulk", { method: "POST", body: formData });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "Upload failed" }));
          setIepComplete({ type: "complete", total: iepFiles.length, results: [{ fileName: "bulk upload", success: false, error: errData.error }] });
          setIepProcessing(false);
          loadHistory();
          return;
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error("No response stream");
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event: IepProgressEvent = JSON.parse(line.slice(6));
                if (event.type === "progress") setIepProgress(prev => [...prev, event]);
                else if (event.type === "complete") setIepComplete(event);
              } catch {}
            }
          }
        }
      }
      loadHistory();
    } catch (e: any) {
      setIepComplete({ type: "complete", total: iepFiles.length, results: [{ fileName: "upload", success: false, error: e.message }] });
    }
    setIepProcessing(false);
  }

  const hasData = file !== null || pasteText.trim().length > 0;
  const supportsValidation = selectedType !== null && selectedType !== "iep-documents" && selectedType !== "goals-data";

  const filteredValidations = validation?.validations.filter(v => validationFilter === "all" || v.status === validationFilter) || [];
  const PAGE_SIZE = 25;
  const pagedValidations = filteredValidations.slice(validationPage * PAGE_SIZE, (validationPage + 1) * PAGE_SIZE);
  const totalValidationPages = Math.ceil(filteredValidations.length / PAGE_SIZE);

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-5 md:space-y-8">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Import Data</h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1">Bulk import students, staff, IEP requirements, sessions, and historical goal data</p>
      </div>

      {selectedType && step !== "upload" && (
        <div className="flex items-center gap-2 text-[12px] text-gray-500">
          <button onClick={() => { setSelectedType(null); resetForm(); }} className="text-emerald-600 hover:text-emerald-700 font-medium">All Types</button>
          <ArrowRight className="w-3 h-3" />
          <span className="font-medium text-gray-700">{IMPORT_TYPES.find(t => t.key === selectedType)?.label}</span>
          <ArrowRight className="w-3 h-3" />
          <span className="font-semibold text-gray-800 capitalize">{step === "validate" ? "Review & Validate" : step === "import" ? "Importing..." : step === "result" ? "Results" : "Upload"}</span>
        </div>
      )}

      {(!selectedType || step === "upload") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {IMPORT_TYPES.map(type => {
            const active = selectedType === type.key;
            return (
              <button
                key={type.key}
                onClick={() => setSelectedType(type.key)}
                className={`text-left p-4 rounded-xl border transition-all ${
                  active ? "border-emerald-300 bg-emerald-50/50 shadow-sm ring-1 ring-emerald-200" : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
                    <type.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-[13px] font-semibold leading-tight ${active ? "text-emerald-800" : "text-gray-700"}`}>{type.label}</p>
                      {type.badge && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full uppercase tracking-wide">{type.badge}</span>}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{type.description}</p>
                    {type.key !== "iep-documents" && (
                      <p className="text-[10px] text-gray-400 mt-1.5">
                        Required: <span className="font-medium text-gray-500">{IMPORT_GUIDANCE[type.key]?.requiredCols}</span>
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedType && step === "upload" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-4">

            {selectedType === "goals-data" && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] font-semibold text-emerald-800">How it works</p>
                  <button onClick={() => setShowGuide(!showGuide)} className="text-[11px] text-emerald-600 flex items-center gap-1">
                    {showGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {showGuide ? "Hide" : "Show"} guide
                  </button>
                </div>
                {showGuide && (
                  <pre className="text-[11px] text-emerald-700 whitespace-pre-wrap font-mono leading-relaxed bg-white/60 rounded-lg p-3 border border-emerald-100">
                    {GOALS_DATA_GUIDE}
                  </pre>
                )}
                <p className="text-[12px] text-emerald-700">
                  Trellis auto-creates goals, linked targets, and vague sessions for each data point — they appear immediately in all charts and progress views.
                </p>
              </div>
            )}

            {selectedType === "iep-documents" && (
              <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  <p className="text-[13px] font-semibold text-blue-800">AI-Powered IEP Import</p>
                </div>
                <p className="text-[12px] text-blue-700 leading-relaxed">
                  Upload IEP PDF documents and Trellis will automatically extract goals, service requirements,
                  accommodations, behavior targets, and program targets — no manual entry needed.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { icon: Target, label: "IEP Goals" },
                    { icon: Clock, label: "Service Grid" },
                    { icon: BookOpen, label: "Accommodations" },
                    { icon: BarChart2, label: "Behavior Targets" },
                    { icon: ClipboardList, label: "Program Targets" },
                  ].map(item => (
                    <span key={item.label} className="flex items-center gap-1 text-[11px] bg-white/70 text-blue-700 px-2 py-1 rounded-lg border border-blue-100">
                      <item.icon className="w-3 h-3" />
                      {item.label}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-blue-600">
                  Students must already exist in the system. Upload the student roster first if needed.
                </p>
              </div>
            )}

            {selectedType === "iep-documents" ? (
              <IepUploadCard
                iepFiles={iepFiles}
                iepProcessing={iepProcessing}
                iepProgress={iepProgress}
                iepComplete={iepComplete}
                iepFileInputRef={iepFileInputRef}
                dragActive={dragActive}
                setDragActive={setDragActive}
                handleIepFiles={handleIepFiles}
                removeIepFile={removeIepFile}
                handleIepImport={handleIepImport}
                setIepFiles={setIepFiles}
                resetForm={resetForm}
                loadHistory={loadHistory}
              />
            ) : (
              <Card>
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-gray-600">
                      Upload {IMPORT_TYPES.find(t => t.key === selectedType)?.label} Data
                    </CardTitle>
                    {selectedType === "goals-data" && (
                      <button
                        onClick={() => { setShowPasteArea(!showPasteArea); setFile(null); setCsvPreview(null); }}
                        className="flex items-center gap-1.5 text-[12px] text-emerald-600 hover:text-emerald-700 font-medium"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        {showPasteArea ? "Use file upload" : "Paste from Google Sheets"}
                      </button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  {showPasteArea && selectedType === "goals-data" ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
                        <Table2 className="w-4 h-4 text-blue-500 flex-shrink-0" />
                        <p className="text-[12px] text-blue-700">
                          Select your data in Google Sheets, copy it (Ctrl+C / Cmd+C), then paste below.
                        </p>
                      </div>
                      <textarea
                        className="w-full h-48 text-[12px] font-mono border border-gray-200 rounded-lg p-3 resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 placeholder:text-gray-300"
                        placeholder={"Paste spreadsheet data here...\n\nExample:\nstudent_id\tgoal_name\tgoal_type\t2024-09-06\t2024-09-13\nSTU-001\tAggression - Hitting\tbehavior\t6\t4"}
                        value={pasteText}
                        onChange={e => handlePasteChange(e.target.value)}
                      />
                      {pasteText.trim() && (
                        <p className="text-[11px] text-emerald-600">
                          {pasteText.includes("\t") ? "Detected: tab-separated (Google Sheets)" : "Detected: comma-separated (CSV)"}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div
                      className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
                        dragActive ? "border-emerald-400 bg-emerald-50/50" : "border-gray-200 hover:border-gray-300 bg-gray-50/30"
                      }`}
                      onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.tsv,.txt"
                        className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                      />
                      {file ? (
                        <div className="flex items-center justify-center gap-3">
                          <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                          <div className="text-left">
                            <p className="text-[14px] font-semibold text-gray-700">{file.name}</p>
                            <p className="text-[12px] text-gray-400">{(file.size / 1024).toFixed(1)} KB · {csvPreview?.totalRows ?? 0} data rows</p>
                          </div>
                          <Button variant="outline" size="sm" className="ml-4 text-[11px]" onClick={e => { e.stopPropagation(); resetForm(); }}>
                            Change file
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                          <p className="text-[14px] font-medium text-gray-600">Drop your file here</p>
                          <p className="text-[12px] text-gray-400 mt-1">or click to browse · Supports .csv, .tsv, .txt</p>
                          {selectedType === "goals-data" && (
                            <p className="text-[11px] text-gray-400 mt-2">Export from Google Sheets as CSV, or use the "Paste" button above</p>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {csvPreview && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[12px] font-semibold text-gray-500">
                          Preview — {csvPreview.totalRows} row{csvPreview.totalRows !== 1 ? "s" : ""} detected, showing first {Math.min(5, csvPreview.rows.length)}
                        </p>
                        <div className="flex items-center gap-2">
                          {csvPreview.headers.length > 0 && (
                            <span className="text-[10px] text-gray-400">{csvPreview.headers.length} columns</span>
                          )}
                        </div>
                      </div>
                      <div className="overflow-x-auto border border-gray-200 rounded-lg">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                              <th className="text-left px-2 py-2 text-gray-400 font-medium w-8">#</th>
                              {csvPreview.headers.map((h, i) => (
                                <th key={i} className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {csvPreview.rows.slice(0, 5).map((row, i) => (
                              <tr key={i} className="hover:bg-gray-50/50">
                                <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                                {row.map((cell, j) => (
                                  <td key={j} className="px-3 py-1.5 text-gray-600 whitespace-nowrap max-w-[200px] truncate">{cell || <span className="text-gray-300">—</span>}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {hasData && !result && (
                    <div className="mt-4 space-y-3">
                      {(selectedType === "students" || selectedType === "staff") && (
                        <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
                          <Settings2 className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="text-[12px] font-semibold text-gray-600">Duplicate handling</p>
                            <p className="text-[11px] text-gray-400">What to do when a record already exists in Trellis</p>
                          </div>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setDuplicateHandling("skip")}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                                duplicateHandling === "skip" ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
                              }`}
                            >
                              Skip duplicates
                            </button>
                            <button
                              onClick={() => setDuplicateHandling("update")}
                              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                                duplicateHandling === "update" ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
                              }`}
                            >
                              Update existing
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end gap-2">
                        {supportsValidation && (
                          <Button
                            variant="outline"
                            className="text-[13px] gap-1.5"
                            disabled={validating}
                            onClick={handleValidate}
                          >
                            {validating ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Validating...</> : <><CheckCircle className="w-3.5 h-3.5" /> Validate First</>}
                          </Button>
                        )}
                        <Button
                          className="bg-emerald-700 hover:bg-emerald-800 text-white text-[13px] gap-1.5"
                          disabled={importing}
                          onClick={handleImport}
                        >
                          {importing ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Importing...</> : <><Upload className="w-3.5 h-3.5" /> Import Now</>}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-4 space-y-4">
            {selectedType !== "iep-documents" ? (
              <>
                <Card>
                  <CardHeader className="pb-0">
                    <CardTitle className="text-sm font-semibold text-gray-600">Download Templates</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-3 space-y-2">
                    <p className="text-[12px] text-gray-400 mb-3">Download a template with sample data and instructions, fill it in, then upload.</p>

                    <button
                      onClick={() => downloadTemplate(IMPORT_TYPES.find(t => t.key === selectedType)?.templateKey ?? "students")}
                      className="w-full flex items-center gap-3 p-3 rounded-lg border border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50 transition-all text-left"
                    >
                      <Download className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <div>
                        <p className="text-[13px] font-medium text-emerald-800">Trellis Template</p>
                        <p className="text-[11px] text-emerald-600">Standard format with sample rows and instructions</p>
                      </div>
                    </button>

                    {(PREBUILT_TEMPLATES[selectedType] || []).map(tmpl => (
                      <button
                        key={tmpl.key}
                        onClick={() => downloadTemplate(tmpl.key)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 transition-all text-left"
                      >
                        <Download className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <div>
                          <p className="text-[13px] font-medium text-gray-700">{tmpl.label}</p>
                          <p className="text-[11px] text-gray-400">{tmpl.description}</p>
                        </div>
                      </button>
                    ))}
                  </CardContent>
                </Card>

                {IMPORT_GUIDANCE[selectedType] && (
                  <Card>
                    <CardHeader className="pb-0">
                      <CardTitle className="text-sm font-semibold text-gray-600">Import Guide</CardTitle>
                    </CardHeader>
                    <CardContent className="pt-3 space-y-3">
                      <div>
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Prerequisites</p>
                        <p className="text-[12px] text-gray-600">{IMPORT_GUIDANCE[selectedType].prereqs}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Tips</p>
                        <div className="space-y-1.5">
                          {IMPORT_GUIDANCE[selectedType].tips.map((tip, i) => (
                            <div key={i} className="flex items-start gap-2 text-[12px] text-gray-500">
                              <Info className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                              <span>{tip}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <p className="text-[11px] text-gray-500">
                          <span className="font-semibold">Flexible headers:</span> Column names are matched flexibly — "first" / "first_name" / "First Name" all work.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm font-semibold text-gray-600">How It Works</CardTitle>
                </CardHeader>
                <CardContent className="pt-3">
                  <div className="space-y-3 text-[12px] text-gray-500">
                    {["Upload IEP PDF documents (one per student)", "AI reads the document and extracts structured data", "Matches student by name, creates goals, services, accommodations, and tracking targets", "Data appears immediately in all charts, progress views, and compliance tracking"].map((text, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">{i + 1}</span>
                        <span>{text}</span>
                      </div>
                    ))}
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                      <p className="text-[11px] text-amber-700">
                        <span className="font-semibold">Requirements:</span> Students must already be imported into Trellis.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {selectedType && step === "validate" && validation && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-0">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-600">Validation Results</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-[12px] gap-1" onClick={() => setStep("upload")}>
                    <ArrowLeft className="w-3 h-3" /> Back
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-100 text-center">
                  <p className="text-2xl font-bold text-gray-700">{validation.summary.totalRows}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Total Rows</p>
                </div>
                <button onClick={() => setValidationFilter("valid")} className={`p-3 rounded-lg border text-center transition-all ${validationFilter === "valid" ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-100 hover:border-emerald-200"}`}>
                  <p className="text-2xl font-bold text-emerald-600">{validation.summary.valid}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Ready</p>
                </button>
                <button onClick={() => setValidationFilter("warning")} className={`p-3 rounded-lg border text-center transition-all ${validationFilter === "warning" ? "bg-amber-50 border-amber-200" : "bg-gray-50 border-gray-100 hover:border-amber-200"}`}>
                  <p className="text-2xl font-bold text-amber-600">{validation.summary.warnings}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Warnings</p>
                </button>
                <button onClick={() => setValidationFilter("error")} className={`p-3 rounded-lg border text-center transition-all ${validationFilter === "error" ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-100 hover:border-red-200"}`}>
                  <p className="text-2xl font-bold text-red-600">{validation.summary.errors}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Errors</p>
                </button>
              </div>

              {validation.unmappedRequired.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-[12px] font-semibold text-red-700 mb-1">Missing required columns</p>
                  <p className="text-[11px] text-red-600">
                    Could not find: <span className="font-mono font-semibold">{validation.unmappedRequired.join(", ")}</span>. Check that your CSV headers match the expected column names.
                  </p>
                </div>
              )}

              {validation.columnMappings.length > 0 && (
                <div>
                  <p className="text-[12px] font-semibold text-gray-500 mb-2">Column Mapping</p>
                  <div className="flex flex-wrap gap-2">
                    {validation.columnMappings.map((cm, i) => (
                      <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] border ${
                        cm.mappedTo ? (cm.required ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-600") : "bg-gray-50 border-gray-200 text-gray-400"
                      }`}>
                        <span className="font-mono font-medium">{cm.csvHeader}</span>
                        {cm.mappedTo && (
                          <>
                            <ArrowRight className="w-3 h-3" />
                            <span className="font-semibold">{cm.mappedTo}</span>
                            {cm.required && <CircleDot className="w-3 h-3 text-emerald-600" />}
                          </>
                        )}
                        {!cm.mappedTo && <span className="italic">unmapped</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] font-semibold text-gray-500">Row-by-Row Validation</p>
                    {validationFilter !== "all" && (
                      <button onClick={() => setValidationFilter("all")} className="text-[10px] text-emerald-600 font-medium hover:underline">Show all</button>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400">{filteredValidations.length} rows</p>
                </div>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-[400px] overflow-y-auto">
                    {pagedValidations.map((v, i) => (
                      <div key={i} className={`flex items-start gap-3 px-3 py-2 border-b border-gray-100 last:border-0 ${
                        v.status === "error" ? "bg-red-50/50" : v.status === "warning" ? "bg-amber-50/30" : ""
                      }`}>
                        <span className="text-[10px] text-gray-400 font-mono w-6 text-right mt-0.5">{v.row}</span>
                        <StatusBadge status={v.status} />
                        <div className="flex-1 min-w-0">
                          {v.messages.map((msg, j) => (
                            <p key={j} className={`text-[11px] ${v.status === "error" ? "text-red-600" : v.status === "warning" ? "text-amber-600" : "text-gray-500"}`}>{msg}</p>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {totalValidationPages > 1 && (
                  <div className="flex items-center justify-between mt-2">
                    <Button variant="outline" size="sm" className="text-[11px] h-7" disabled={validationPage === 0} onClick={() => setValidationPage(p => p - 1)}>Prev</Button>
                    <span className="text-[11px] text-gray-400">Page {validationPage + 1} of {totalValidationPages}</span>
                    <Button variant="outline" size="sm" className="text-[11px] h-7" disabled={validationPage >= totalValidationPages - 1} onClick={() => setValidationPage(p => p + 1)}>Next</Button>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <div className="text-[12px] text-gray-500">
                  {validation.summary.errors > 0 && (
                    <span className="text-red-600 font-medium">{validation.summary.errors} row{validation.summary.errors !== 1 ? "s" : ""} will fail. </span>
                  )}
                  {validation.summary.warnings > 0 && duplicateHandling === "skip" && (
                    <span className="text-amber-600">{validation.summary.warnings} duplicate{validation.summary.warnings !== 1 ? "s" : ""} will be skipped. </span>
                  )}
                  {validation.summary.warnings > 0 && duplicateHandling === "update" && (
                    <span className="text-amber-600">{validation.summary.warnings} existing record{validation.summary.warnings !== 1 ? "s" : ""} will be updated. </span>
                  )}
                  <span>{validation.summary.valid} row{validation.summary.valid !== 1 ? "s" : ""} ready to import.</span>
                </div>
                <div className="flex gap-2">
                  {(selectedType === "students" || selectedType === "staff") && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setDuplicateHandling("skip")}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                          duplicateHandling === "skip" ? "bg-emerald-100 text-emerald-700 border border-emerald-200" : "bg-white text-gray-500 border border-gray-200"
                        }`}
                      >Skip dupes</button>
                      <button
                        onClick={() => setDuplicateHandling("update")}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                          duplicateHandling === "update" ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-white text-gray-500 border border-gray-200"
                        }`}
                      >Update dupes</button>
                    </div>
                  )}
                  <Button
                    className="bg-emerald-700 hover:bg-emerald-800 text-white text-[13px] gap-1.5"
                    disabled={importing || (validation.summary.valid + (duplicateHandling === "update" ? validation.summary.warnings : 0)) === 0}
                    onClick={handleImport}
                  >
                    {importing ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Importing...</> : <><Upload className="w-3.5 h-3.5" /> Import {validation.summary.valid + (duplicateHandling === "update" ? validation.summary.warnings : 0)} Row{(validation.summary.valid + (duplicateHandling === "update" ? validation.summary.warnings : 0)) !== 1 ? "s" : ""}</>}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {selectedType && (step === "import" || step === "result") && result && (
        <Card>
          <CardContent className="pt-6">
            <div className={`p-5 rounded-xl border ${result.status === "completed" ? "bg-emerald-50/50 border-emerald-200" : "bg-red-50/50 border-red-200"}`}>
              <div className="flex items-center gap-3 mb-3">
                {result.status === "completed" ? <CheckCircle className="w-6 h-6 text-emerald-600" /> : <XCircle className="w-6 h-6 text-red-500" />}
                <p className="text-[16px] font-semibold text-gray-700">{result.status === "completed" ? "Import Complete" : "Import Failed"}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
                <div>
                  <p className="text-[11px] text-gray-400">Processed</p>
                  <p className="text-xl font-bold text-gray-700">{result.rowsProcessed}</p>
                </div>
                <div>
                  <p className="text-[11px] text-gray-400">Imported</p>
                  <p className="text-xl font-bold text-emerald-600">{result.rowsImported - (result.rowsUpdated || 0)}</p>
                </div>
                {(result.rowsUpdated ?? 0) > 0 && (
                  <div>
                    <p className="text-[11px] text-gray-400">Updated</p>
                    <p className="text-xl font-bold text-blue-600">{result.rowsUpdated}</p>
                  </div>
                )}
                <div>
                  <p className="text-[11px] text-gray-400">{(result.rowsSkipped ?? 0) > 0 ? "Skipped / Errors" : "Errors"}</p>
                  <p className="text-xl font-bold text-red-500">{result.rowsErrored + (result.rowsSkipped ?? 0)}</p>
                </div>
              </div>
              {result.status === "completed" && selectedType === "goals-data" && result.rowsImported > 0 && (
                <p className="mt-3 text-[12px] text-emerald-700 bg-emerald-50 rounded-lg p-2.5 border border-emerald-100">
                  Goals, targets, and sessions created. Open any student's profile to see historical progress in all charts.
                </p>
              )}
              {result.errors && result.errors.length > 0 && (
                <div className="mt-4 space-y-1">
                  <p className="text-[11px] font-semibold text-gray-500">Error Details ({result.errors.length} of {result.rowsErrored + (result.rowsSkipped ?? 0)}):</p>
                  <div className="max-h-48 overflow-y-auto space-y-1 mt-1">
                    {result.errors.map((err, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px]">
                        <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                        <span className="text-gray-600">{err}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <Button variant="outline" size="sm" className="text-[12px]" onClick={resetForm}>Import Another File</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-0 flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-gray-600">Import History</CardTitle>
          <Button variant="outline" size="sm" className="text-[11px] h-7" onClick={loadHistory}>
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {loadingHistory ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="w-full h-14" />)}</div>
          ) : history.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">No imports yet. Select an import type above to get started.</div>
          ) : (
            <div className="space-y-2">
              {history.slice(0, 20).map((imp, idx) => (
                <div key={imp.id || idx} className="flex items-center gap-4 p-3 rounded-lg border border-gray-100 bg-white">
                  {imp.status === "completed" ? (
                    <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  ) : imp.status === "failed" ? (
                    <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  ) : (
                    <RefreshCw className="w-5 h-5 text-amber-500 flex-shrink-0 animate-spin" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-700">
                      {imp.importType?.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                      {imp.fileName && <span className="text-gray-400 font-normal"> — {imp.fileName}</span>}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {new Date(imp.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-[12px] flex-shrink-0">
                    <div className="text-center">
                      <p className="font-bold text-emerald-600">{imp.rowsImported}</p>
                      <p className="text-gray-400 text-[10px]">imported</p>
                    </div>
                    {(imp.rowsErrored ?? 0) > 0 && (
                      <div className="text-center">
                        <p className="font-bold text-red-500">{imp.rowsErrored}</p>
                        <p className="text-gray-400 text-[10px]">errors</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function IepUploadCard({
  iepFiles, iepProcessing, iepProgress, iepComplete, iepFileInputRef, dragActive, setDragActive,
  handleIepFiles, removeIepFile, handleIepImport, setIepFiles, resetForm, loadHistory,
}: {
  iepFiles: File[];
  iepProcessing: boolean;
  iepProgress: IepProgressEvent[];
  iepComplete: IepProgressEvent | null;
  iepFileInputRef: React.RefObject<HTMLInputElement | null>;
  dragActive: boolean;
  setDragActive: (v: boolean) => void;
  handleIepFiles: (f: FileList) => void;
  removeIepFile: (i: number) => void;
  handleIepImport: () => void;
  setIepFiles: (v: File[]) => void;
  resetForm: () => void;
  loadHistory: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-semibold text-gray-600">Upload IEP Documents</CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
            dragActive ? "border-emerald-400 bg-emerald-50/50" : "border-gray-200 hover:border-gray-300 bg-gray-50/30"
          }`}
          onDragOver={e => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={e => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files.length > 0) handleIepFiles(e.dataTransfer.files); }}
          onClick={() => iepFileInputRef.current?.click()}
        >
          <input ref={iepFileInputRef} type="file" accept=".pdf" multiple className="hidden"
            onChange={e => { if (e.target.files && e.target.files.length > 0) handleIepFiles(e.target.files); }}
          />
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-[14px] font-medium text-gray-600">Drop IEP PDF files here</p>
          <p className="text-[12px] text-gray-400 mt-1">or click to browse — select multiple PDFs at once</p>
          <p className="text-[11px] text-gray-400 mt-2">Supports up to 100 files at a time, 20MB max per file</p>
        </div>

        {iepFiles.length > 0 && !iepProcessing && !iepComplete && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-semibold text-gray-600">{iepFiles.length} file{iepFiles.length !== 1 ? "s" : ""} selected</p>
              <Button variant="ghost" size="sm" className="text-[11px] text-gray-400" onClick={() => setIepFiles([])}>Clear all</Button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {iepFiles.map((f, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <span className="text-[12px] text-gray-700 font-medium truncate max-w-[300px]">{f.name}</span>
                    <span className="text-[10px] text-gray-400">{(f.size / 1024).toFixed(0)} KB</span>
                  </div>
                  <button onClick={() => removeIepFile(i)} className="text-gray-400 hover:text-red-500 p-1">
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <Button className="bg-emerald-700 hover:bg-emerald-800 text-white text-[13px]" onClick={handleIepImport}>
                <Sparkles className="w-4 h-4 mr-2" /> Import {iepFiles.length} IEP{iepFiles.length !== 1 ? "s" : ""}
              </Button>
            </div>
          </div>
        )}

        {iepProcessing && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin" />
              <p className="text-[13px] font-semibold text-gray-600">Processing {iepProgress.length} of {iepFiles.length} IEPs...</p>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-emerald-500 h-2 rounded-full transition-all duration-300" style={{ width: `${(iepProgress.length / iepFiles.length) * 100}%` }} />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {iepProgress.map((evt, i) => (
                <div key={i} className={`flex items-center gap-2 p-2 rounded-lg text-[12px] ${evt.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                  {evt.success ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                  <span className="font-medium truncate">{evt.fileName}</span>
                  {evt.success && evt.studentName && <span className="text-emerald-600">— {evt.studentName.firstName} {evt.studentName.lastName}: {evt.goalsCreated} goals, {evt.servicesCreated} services</span>}
                  {!evt.success && evt.error && <span className="text-red-500 truncate">— {evt.error}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {iepComplete && (
          <div className="space-y-3">
            <div className={`p-4 rounded-xl border ${
              iepComplete.results?.every(r => r.success) ? "bg-emerald-50/50 border-emerald-200" :
              iepComplete.results?.every(r => !r.success) ? "bg-red-50/50 border-red-200" :
              "bg-amber-50/50 border-amber-200"
            }`}>
              <div className="flex items-center gap-3 mb-3">
                {iepComplete.results?.every(r => r.success) ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                <p className="text-[14px] font-semibold text-gray-700">IEP Import {iepComplete.results?.every(r => r.success) ? "Complete" : "Finished with Issues"}</p>
              </div>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div><p className="text-[11px] text-gray-400">Total Files</p><p className="text-lg font-bold text-gray-700">{iepComplete.results?.length || 0}</p></div>
                <div><p className="text-[11px] text-gray-400">Successful</p><p className="text-lg font-bold text-emerald-600">{iepComplete.results?.filter(r => r.success).length || 0}</p></div>
                <div><p className="text-[11px] text-gray-400">Failed</p><p className="text-lg font-bold text-red-500">{iepComplete.results?.filter(r => !r.success).length || 0}</p></div>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1.5">
                {iepComplete.results?.map((r, i) => (
                  <div key={i} className={`p-2.5 rounded-lg text-[12px] ${r.success ? "bg-white border border-emerald-100" : "bg-white border border-red-100"}`}>
                    <div className="flex items-center gap-2">
                      {r.success ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                      <span className="font-semibold text-gray-700 truncate">{r.fileName}</span>
                      {r.studentName && <span className="text-gray-400">— {r.studentName.firstName} {r.studentName.lastName}</span>}
                    </div>
                    {r.success && r.details && (
                      <div className="flex flex-wrap gap-2 mt-1.5 ml-5">
                        <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">{r.details.goalsCreated} goals</span>
                        <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{r.details.servicesCreated} services</span>
                        <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">{r.details.accommodationsCreated} accommodations</span>
                      </div>
                    )}
                    {!r.success && r.error && <p className="text-[11px] text-red-500 mt-1 ml-5">{r.error}</p>}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" className="text-[12px]" onClick={resetForm}>Import More IEPs</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
