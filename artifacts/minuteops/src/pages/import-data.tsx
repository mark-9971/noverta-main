import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload, FileSpreadsheet, Users, Clock, ClipboardList,
  CheckCircle, XCircle, AlertTriangle, Download, RefreshCw,
  BarChart2, ChevronDown, ChevronUp, Copy, Table2
} from "lucide-react";
import { authFetch } from "@/lib/auth-fetch";

type ImportType = "students" | "service-requirements" | "sessions" | "goals-data";

const IMPORT_TYPES: { key: ImportType; label: string; description: string; icon: any; templateKey: string; badge?: string }[] = [
  { key: "students", label: "Students", description: "Import student roster with names, grades, IDs", icon: Users, templateKey: "students" },
  { key: "service-requirements", label: "IEP Service Requirements", description: "Import mandated service minutes per student", icon: ClipboardList, templateKey: "service_requirements" },
  { key: "sessions", label: "Session Logs", description: "Import delivered session/minute logs", icon: Clock, templateKey: "sessions" },
  { key: "goals-data", label: "Goals & Progress Data", description: "Import IEP goals with historical data points — from Google Sheets or any tracker", icon: BarChart2, templateKey: "goals_data_tall", badge: "New" },
];

const PREBUILT_TEMPLATES: Record<ImportType, { key: string; label: string; description: string }[]> = {
  "students": [
    { key: "aspen_students", label: "Aspen X2 Student Export", description: "Matches Aspen X2 student roster export format" },
  ],
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
    if (fileInputRef.current) fileInputRef.current.value = "";
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
    if (fileInputRef.current) fileInputRef.current.value = "";
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
          </div>

          <div className="lg:col-span-4 space-y-4">
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
