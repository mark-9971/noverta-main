import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload, FileSpreadsheet, Users, Clock, ClipboardList,
  CheckCircle, XCircle, AlertTriangle, Download, RefreshCw,
  BarChart2, ChevronDown, ChevronUp, Copy, Table2, FileText,
  Target, Sparkles, BookOpen
} from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

type ImportType = "students" | "service-requirements" | "sessions" | "goals-data" | "iep-documents";

const IMPORT_TYPES: { key: ImportType; label: string; description: string; icon: any; templateKey: string; badge?: string }[] = [
  { key: "students", label: "Students", description: "Import student roster with names, grades, IDs", icon: Users, templateKey: "students" },
  { key: "iep-documents", label: "IEP Documents", description: "Upload IEP PDFs — auto-extracts goals, services, accommodations & tracking targets", icon: FileText, templateKey: "", badge: "AI" },
  { key: "service-requirements", label: "IEP Service Requirements", description: "Import mandated service minutes per student", icon: ClipboardList, templateKey: "service_requirements" },
  { key: "sessions", label: "Session Logs", description: "Import delivered session/minute logs", icon: Clock, templateKey: "sessions" },
  { key: "goals-data", label: "Goals & Progress Data", description: "Import IEP goals with historical data points — from Google Sheets or any tracker", icon: BarChart2, templateKey: "goals_data_tall", badge: "New" },
];

const PREBUILT_TEMPLATES: Record<ImportType, { key: string; label: string; description: string }[]> = {
  "students": [
    { key: "aspen_students", label: "Aspen X2 Student Export", description: "Matches Aspen X2 student roster export format" },
  ],
  "iep-documents": [],
  "service-requirements": [
    { key: "esped_services", label: "eSPED Service Grid", description: "Matches eSPED IEP service requirement export" },
  ],
  "sessions": [],
  "goals-data": [
    { key: "goals_data_tall", label: "Tall format (row per data point)", description: "student, goal, date, value per row" },
    { key: "goals_data_wide", label: "Wide format (dates as columns)", description: "Dates as columns — ideal for Google Sheets trackers" },
  ],
};

interface ImportResult {
  id: number;
  importType: string;
  fileName: string | null;
  status: string;
  rowsProcessed: number;
  rowsImported: number;
  rowsErrored: number;
  errors?: string[];
  createdAt: string;
}

function parseCsvPreview(text: string): { headers: string[]; rows: string[][] } | null {
  const isTsv = text.includes("\t");
  const sep = isTsv ? "\t" : ",";
  const lines = text.trim().split("\n").map(l => l.replace(/\r$/, "")).filter(l => l.length > 0);
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
  const rows = lines.slice(1, 6).map(parseLine);
  return { headers, rows };
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

export default function ImportData() {
  const [selectedType, setSelectedType] = useState<ImportType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [history, setHistory] = useState<ImportResult[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
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
    setPasteText("");
    setShowPasteArea(false);
    setCsvPreview(null);
    setFile(null);
    setResult(null);
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
    if (val.trim()) setCsvPreview(parseCsvPreview(val));
    else setCsvPreview(null);
  }

  const dataText = file ? null : pasteText;

  async function handleImport() {
    if (!selectedType) return;
    if (!file && !pasteText.trim()) return;
    setImporting(true);
    setResult(null);

    try {
      const csvData = file ? await file.text() : pasteText;
      const fileName = file ? file.name : "pasted-data.csv";

      const endpointMap: Record<ImportType, string> = {
        "students": "/api/imports/students",
        "service-requirements": "/api/imports/service-requirements",
        "sessions": "/api/imports/sessions",
        "goals-data": "/api/imports/goals-data",
      };

      const res = await authFetch(endpointMap[selectedType], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvData, fileName }),
      });

      const data = await res.json();
      if (!res.ok) {
        setResult({ id: 0, importType: selectedType, fileName, status: "failed", rowsProcessed: 0, rowsImported: 0, rowsErrored: 0, errors: [data.error || "Import failed"], createdAt: new Date().toISOString() });
      } else {
        setResult(data);
      }
      loadHistory();
    } catch (e: any) {
      setResult({ id: 0, importType: selectedType, fileName: file?.name || "paste", status: "failed", rowsProcessed: 0, rowsImported: 0, rowsErrored: 0, errors: [e.message], createdAt: new Date().toISOString() });
    }
    setImporting(false);
  }

  function downloadTemplate(templateKey: string) {
    window.open(`/api/imports/templates/${templateKey}`, "_blank");
  }

  function resetForm() {
    setFile(null);
    setPasteText("");
    setCsvPreview(null);
    setResult(null);
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
            type: "complete",
            total: 1,
            results: [{
              fileName: iepFiles[0].name,
              success: true,
              studentName: data.studentName,
              details: {
                goalsCreated: data.goalsCreated,
                servicesCreated: data.servicesCreated,
                accommodationsCreated: data.accommodationsCreated,
                behaviorTargetsCreated: data.behaviorTargetsCreated,
                programTargetsCreated: data.programTargetsCreated,
              },
            }],
          });
        } else {
          setIepComplete({
            type: "complete",
            total: 1,
            results: [{
              fileName: iepFiles[0].name,
              success: false,
              error: data.error || data.message || "Import failed",
            }],
          });
        }
      } else {
        for (const f of iepFiles) {
          formData.append("files", f);
        }
        const res = await authFetch("/api/imports/iep-documents/bulk", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "Upload failed" }));
          setIepComplete({
            type: "complete",
            total: iepFiles.length,
            results: [{ fileName: "bulk upload", success: false, error: errData.error }],
          });
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
                if (event.type === "progress") {
                  setIepProgress(prev => [...prev, event]);
                } else if (event.type === "complete") {
                  setIepComplete(event);
                }
              } catch {}
            }
          }
        }
      }

      loadHistory();
    } catch (e: any) {
      setIepComplete({
        type: "complete",
        total: iepFiles.length,
        results: [{ fileName: "upload", success: false, error: e.message }],
      });
    }
    setIepProcessing(false);
  }

  const rowCount = csvPreview?.rows.length ?? 0;
  const hasData = file !== null || pasteText.trim().length > 0;

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1200px] mx-auto space-y-5 md:space-y-8">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-800 tracking-tight">Import Data</h1>
        <p className="text-xs md:text-sm text-gray-400 mt-1">Bulk import students, IEP requirements, sessions, and historical goal data</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {IMPORT_TYPES.map(type => {
          const active = selectedType === type.key;
          return (
            <button
              key={type.key}
              onClick={() => setSelectedType(type.key)}
              className={`text-left p-4 rounded-xl border transition-all ${
                active ? "border-emerald-300 bg-emerald-50/50 shadow-sm" : "border-gray-200 bg-white hover:border-gray-300"
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
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedType && (
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
                    onDrop={e => {
                      e.preventDefault();
                      setDragActive(false);
                      if (e.dataTransfer.files.length > 0) handleIepFiles(e.dataTransfer.files);
                    }}
                    onClick={() => iepFileInputRef.current?.click()}
                  >
                    <input
                      ref={iepFileInputRef}
                      type="file"
                      accept=".pdf"
                      multiple
                      className="hidden"
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
                        <Button
                          className="bg-emerald-700 hover:bg-emerald-800 text-white text-[13px]"
                          onClick={handleIepImport}
                        >
                          <Sparkles className="w-4 h-4 mr-2" />
                          Import {iepFiles.length} IEP{iepFiles.length !== 1 ? "s" : ""}
                        </Button>
                      </div>
                    </div>
                  )}

                  {iepProcessing && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin" />
                        <p className="text-[13px] font-semibold text-gray-600">
                          Processing {iepProgress.length} of {iepFiles.length} IEPs...
                        </p>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(iepProgress.length / iepFiles.length) * 100}%` }}
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-1">
                        {iepProgress.map((evt, i) => (
                          <div key={i} className={`flex items-center gap-2 p-2 rounded-lg text-[12px] ${
                            evt.success ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                          }`}>
                            {evt.success ? <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                            <span className="font-medium truncate">{evt.fileName}</span>
                            {evt.success && evt.studentName && (
                              <span className="text-emerald-600">
                                — {evt.studentName.firstName} {evt.studentName.lastName}: {evt.goalsCreated} goals, {evt.servicesCreated} services
                              </span>
                            )}
                            {!evt.success && evt.error && (
                              <span className="text-red-500 truncate">— {evt.error}</span>
                            )}
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
                          {iepComplete.results?.every(r => r.success) ? (
                            <CheckCircle className="w-5 h-5 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                          )}
                          <p className="text-[14px] font-semibold text-gray-700">
                            IEP Import {iepComplete.results?.every(r => r.success) ? "Complete" : "Finished with Issues"}
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                          <div>
                            <p className="text-[11px] text-gray-400">Total Files</p>
                            <p className="text-lg font-bold text-gray-700">{iepComplete.results?.length || 0}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-400">Successful</p>
                            <p className="text-lg font-bold text-emerald-600">{iepComplete.results?.filter(r => r.success).length || 0}</p>
                          </div>
                          <div>
                            <p className="text-[11px] text-gray-400">Failed</p>
                            <p className="text-lg font-bold text-red-500">{iepComplete.results?.filter(r => !r.success).length || 0}</p>
                          </div>
                        </div>

                        <div className="max-h-64 overflow-y-auto space-y-1.5">
                          {iepComplete.results?.map((r, i) => (
                            <div key={i} className={`p-2.5 rounded-lg text-[12px] ${
                              r.success ? "bg-white border border-emerald-100" : "bg-white border border-red-100"
                            }`}>
                              <div className="flex items-center gap-2">
                                {r.success ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                                <span className="font-semibold text-gray-700 truncate">{r.fileName}</span>
                                {r.studentName && (
                                  <span className="text-gray-400">— {r.studentName.firstName} {r.studentName.lastName}</span>
                                )}
                              </div>
                              {r.success && r.details && (
                                <div className="flex flex-wrap gap-2 mt-1.5 ml-5">
                                  <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">{r.details.goalsCreated} goals</span>
                                  <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{r.details.servicesCreated} services</span>
                                  <span className="text-[10px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">{r.details.accommodationsCreated} accommodations</span>
                                  <span className="text-[10px] bg-orange-50 text-orange-700 px-1.5 py-0.5 rounded">{r.details.behaviorTargetsCreated} behavior targets</span>
                                  <span className="text-[10px] bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded">{r.details.programTargetsCreated} program targets</span>
                                </div>
                              )}
                              {!r.success && r.error && (
                                <p className="text-[11px] text-red-500 mt-1 ml-5">{r.error}</p>
                              )}
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
              <CardContent className="pt-4">
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
                          <p className="text-[12px] text-gray-400">{(file.size / 1024).toFixed(1)} KB · {csvPreview?.rows.length ?? 0}+ data rows</p>
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
                          <p className="text-[11px] text-gray-400 mt-2">
                            Export from Google Sheets as CSV, or use the "Paste" button above
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                {csvPreview && (
                  <div className="mt-4">
                    <p className="text-[12px] font-semibold text-gray-500 mb-2">Preview (first {csvPreview.rows.length} rows)</p>
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            {csvPreview.headers.map((h, i) => (
                              <th key={i} className="text-left px-3 py-2 text-gray-500 font-semibold uppercase tracking-wider whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {csvPreview.rows.map((row, i) => (
                            <tr key={i} className="hover:bg-gray-50/50">
                              {row.map((cell, j) => (
                                <td key={j} className="px-3 py-1.5 text-gray-600 whitespace-nowrap max-w-[200px] truncate">{cell || "—"}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {hasData && !result && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      className="bg-emerald-700 hover:bg-emerald-800 text-white text-[13px]"
                      disabled={importing}
                      onClick={handleImport}
                    >
                      {importing ? (
                        <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
                      ) : (
                        <><Upload className="w-4 h-4 mr-2" /> Import{rowCount > 0 ? ` ${rowCount}+ rows` : ""}</>
                      )}
                    </Button>
                  </div>
                )}

                {result && (
                  <div className={`mt-4 p-4 rounded-xl border ${result.status === "completed" ? "bg-emerald-50/50 border-emerald-200" : "bg-red-50/50 border-red-200"}`}>
                    <div className="flex items-center gap-3 mb-2">
                      {result.status === "completed" ? (
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                      <p className="text-[14px] font-semibold text-gray-700">
                        {result.status === "completed" ? "Import Complete" : "Import Failed"}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-3">
                      <div>
                        <p className="text-[11px] text-gray-400">Processed</p>
                        <p className="text-lg font-bold text-gray-700">{result.rowsProcessed}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400">Imported</p>
                        <p className="text-lg font-bold text-emerald-600">{result.rowsImported}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-gray-400">Errors</p>
                        <p className="text-lg font-bold text-red-500">{result.rowsErrored}</p>
                      </div>
                    </div>
                    {result.status === "completed" && selectedType === "goals-data" && result.rowsImported > 0 && (
                      <p className="mt-3 text-[12px] text-emerald-700 bg-emerald-50 rounded-lg p-2.5 border border-emerald-100">
                        Goals, targets, and sessions created. Open any student's profile to see historical progress in all charts.
                      </p>
                    )}
                    {result.errors && result.errors.length > 0 && (
                      <div className="mt-3 space-y-1">
                        <p className="text-[11px] font-semibold text-gray-500">Error Details:</p>
                        {result.errors.slice(0, 10).map((err, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px]">
                            <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                            <span className="text-gray-600">{err}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 flex justify-end">
                      <Button variant="outline" size="sm" className="text-[12px]" onClick={resetForm}>Import Another File</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            )}
          </div>

          <div className="lg:col-span-4 space-y-4">
            {selectedType !== "iep-documents" ? (
            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-sm font-semibold text-gray-600">Templates</CardTitle>
              </CardHeader>
              <CardContent className="pt-3 space-y-2">
                <p className="text-[12px] text-gray-400 mb-3">Download a template, fill it in, then upload here.</p>

                <button
                  onClick={() => downloadTemplate(IMPORT_TYPES.find(t => t.key === selectedType)?.templateKey ?? "students")}
                  className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 transition-all text-left"
                >
                  <Download className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="text-[13px] font-medium text-gray-700">Trellis Template</p>
                    <p className="text-[11px] text-gray-400">Standard format with sample data</p>
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

            <Card>
              <CardHeader className="pb-0">
                <CardTitle className="text-sm font-semibold text-gray-600">
                  {selectedType === "goals-data" ? "Supported Sources" : "Supported Sources"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-3">
                {selectedType === "goals-data" ? (
                  <div className="space-y-2 text-[12px] text-gray-500">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span><span className="font-semibold text-gray-700">Google Sheets</span> — Copy & paste directly</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span><span className="font-semibold text-gray-700">Excel</span> — Save as CSV, then upload</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span><span className="font-semibold text-gray-700">Central Reach / Catalyst</span> — Export goal data as CSV</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span><span className="font-semibold text-gray-700">Custom trackers</span> — Any CSV with date columns</span>
                    </div>
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                      <p className="text-[11px] text-amber-700">
                        <span className="font-semibold">Requirements:</span> Students must already exist in Trellis. Use student_id or first + last name to match.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 text-[12px] text-gray-500">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span><span className="font-semibold text-gray-700">Aspen X2</span> — Student roster export</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span><span className="font-semibold text-gray-700">eSPED</span> — Service grid export</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span><span className="font-semibold text-gray-700">Excel / Sheets</span> — Save as CSV</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span><span className="font-semibold text-gray-700">Any CSV</span> — Flexible column matching</span>
                    </div>
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                      <p className="text-[11px] text-gray-500">
                        <span className="font-semibold">Tip:</span> Headers are matched flexibly — "first" / "first_name" / "First Name" all work.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            ) : (
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm font-semibold text-gray-600">How It Works</CardTitle>
                </CardHeader>
                <CardContent className="pt-3">
                  <div className="space-y-3 text-[12px] text-gray-500">
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
                      <span>Upload IEP PDF documents (one per student)</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
                      <span>AI reads the document and extracts structured data</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
                      <span>Matches student by name, creates IEP goals, services, accommodations, and tracking targets</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">4</span>
                      <span>Data appears immediately in all charts, progress views, and compliance tracking</span>
                    </div>
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                      <p className="text-[11px] text-amber-700">
                        <span className="font-semibold">Requirements:</span> Students must already be imported into Trellis. The student name in the IEP must match the roster.
                      </p>
                    </div>
                    <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                      <p className="text-[11px] text-blue-700">
                        <span className="font-semibold">Supported formats:</span> Massachusetts IEP forms, any district-formatted IEP as a text-based PDF (not scanned images).
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
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
            <div className="py-8 text-center text-gray-400 text-sm">No imports yet. Upload a file above to get started.</div>
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
